/**
 * Main Orchestrator - Coordinates the entire Maker-Checker flow
 * This is the brain of the system that orchestrates Claude and Codex
 */

import { GitHubClient } from './github-client.js';
import { ClaudeClient } from './claude-client.js';
import { CodexClient } from './codex-client.js';
import { StateManager } from './state-manager.js';
import { QualityAnalyzer } from './quality-analyzer.js';
import { MergeDecider } from './merge-decider.js';
import type { MakerCheckerConfig, PRContext } from '../types.js';
import fs from 'fs';
import YAML from 'yaml';

export class MakerCheckerOrchestrator {
  private github: GitHubClient;
  private claude: ClaudeClient;
  private codex: CodexClient;
  private state: StateManager;
  private quality: QualityAnalyzer;
  private merger: MergeDecider;
  private config: MakerCheckerConfig;

  constructor(
    githubToken: string,
    claudeApiKey: string,
    codexApiKey: string,
    configPath: string = 'config/autonomous-config.yml'
  ) {
    this.github = new GitHubClient(githubToken);
    this.claude = new ClaudeClient(claudeApiKey);
    this.codex = new CodexClient(codexApiKey);
    this.state = new StateManager();
    this.quality = new QualityAnalyzer();

    // Load configuration
    this.config = this.loadConfig(configPath);
    this.merger = new MergeDecider(this.config);
  }

  /**
   * Main entry point - Run the maker-checker cycle for a PR
   */
  async run(owner: string, repo: string, prNumber: number): Promise<void> {
    console.log(`🤖 Starting Maker-Checker for ${owner}/${repo}#${prNumber}`);

    try {
      // Get PR context
      const pr = await this.github.getPRContext(owner, repo, prNumber);

      // Initialize or load state
      let state = this.state.getState(prNumber, repo);
      if (!state) {
        state = this.state.initializeState(prNumber, repo, this.config);
        await this.postStatusComment(owner, repo, pr, 'Starting maker-checker cycle...', state);
      }

      // Add label
      await this.github.addLabel(owner, repo, prNumber, this.config.labels?.in_progress || '🤖 maker-checker:active');

      // Run maker-checker iterations
      await this.runIterations(owner, repo, pr, state);

      console.log(`✅ Maker-Checker completed for ${owner}/${repo}#${prNumber}`);
    } catch (error) {
      console.error(`❌ Maker-Checker failed:`, error);
      await this.github.postComment(
        owner,
        repo,
        prNumber,
        `## ❌ Maker-Checker Error\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease check the logs or retry with \`/retry\``
      );
      await this.github.addLabel(owner, repo, prNumber, this.config.labels?.error || '🔴 maker-checker:error');
    }
  }

  /**
   * Run iterations until quality threshold met or max iterations reached
   */
  private async runIterations(
    owner: string,
    repo: string,
    pr: PRContext,
    state: any
  ): Promise<void> {
    while (state.currentIteration < state.maxIterations) {
      const iterationStart = Date.now();

      // Start new iteration
      this.state.startIteration(state);
      console.log(`\n📊 Iteration ${state.currentIteration}/${state.maxIterations}`);

      await this.postStatusComment(
        owner,
        repo,
        pr,
        `Iteration ${state.currentIteration}/${state.maxIterations} - Codex reviewing...`,
        state
      );

      // Step 1: Codex reviews the code
      const codexReview = await this.codex.reviewCode(pr);

      if (codexReview.status === 'error') {
        console.error('❌ Codex review failed');
        state.currentPhase = 'failed';
        this.state.saveState(state);
        break;
      }

      console.log(`📝 Codex found ${codexReview.issuesFound.length} issues`);

      // Calculate quality
      const qualityScore = this.quality.calculateQualityScore(codexReview);
      const metrics = this.quality.calculateMetrics(codexReview);

      // Update state
      state.qualityScore = qualityScore;

      // Post Codex review
      await this.postCodexReview(owner, repo, pr, codexReview, metrics, state);

      // Check if quality threshold met
      if (this.quality.meetsThreshold(qualityScore, this.config.qualityThreshold)) {
        console.log(`✅ Quality threshold met: ${(qualityScore * 100).toFixed(1)}%`);

        // Check CI status
        const ciStatus = await this.github.getCIStatus(owner, repo, pr.branch);

        // Make merge decision
        const decision = this.merger.shouldMerge(state, codexReview, ciStatus);

        // Record iteration
        const iterationDuration = (Date.now() - iterationStart) / 1000;
        this.state.recordIteration(state, {
          iteration: state.currentIteration,
          codexReview,
          issuesFound: codexReview.issuesFound.length,
          issuesFixed: 0,
          qualityDelta: 0,
          cost: codexReview.cost,
        });

        // Post final decision
        await this.postMergeDecision(owner, repo, pr, decision, state);

        // Handle merge
        if (decision.shouldMerge) {
          if (!decision.requiresHumanApproval && this.config.autoMergeEnabled) {
            await this.autoMerge(owner, repo, pr, state);
          } else {
            await this.github.addLabel(owner, repo, pr.number, this.config.labels?.ready || '✅ maker-checker:ready');
          }
        }

        this.state.complete(state, true);
        break;
      }

      // Check if no issues found (shouldn't happen if quality not met, but safety check)
      if (codexReview.issuesFound.length === 0) {
        console.log('✅ No issues found, completing');
        this.state.complete(state, true);
        break;
      }

      // Step 2: Claude fixes the issues
      this.state.updatePhase(state, 'claude_response');
      await this.updateStatusComment(
        owner,
        repo,
        pr,
        `Iteration ${state.currentIteration}/${state.maxIterations} - Claude fixing issues...`,
        state
      );

      console.log('🔧 Claude fixing issues...');

      const claudeResponse = await this.claude.respondToFeedback(
        pr,
        codexReview.issuesFound,
        state.currentIteration - 1
      );

      if (claudeResponse.status === 'error') {
        console.error('❌ Claude response failed');
        state.currentPhase = 'failed';
        this.state.saveState(state);
        break;
      }

      console.log(`✅ Claude addressed ${claudeResponse.issuesAddressed} issues`);

      // Post Claude's response
      await this.postClaudeResponse(owner, repo, pr, claudeResponse, state);

      // Record iteration
      const iterationDuration = (Date.now() - iterationStart) / 1000;
      this.state.recordIteration(state, {
        iteration: state.currentIteration,
        codexReview,
        claudeResponse,
        issuesFound: codexReview.issuesFound.length,
        issuesFixed: claudeResponse.issuesAddressed,
        qualityDelta: 0, // Will be calculated in next iteration
        cost: codexReview.cost + claudeResponse.cost,
      });

      // Update convergence status
      const isImproving = this.quality.isImproving(state.history);
      this.state.updateConvergence(state, isImproving ? 'improving' : 'stagnant');

      // Check for stagnation
      if (!isImproving && state.currentIteration >= 3) {
        console.log('⚠️ Quality not improving, stopping iterations');
        await this.github.postComment(
          owner,
          repo,
          pr.number,
          `## ⚠️ Stagnation Detected\n\nQuality is not improving after ${state.currentIteration} iterations.\n\n**Recommendation**: Manual review may be needed to proceed.\n\nComment \`/retry\` to try again or \`/stop\` to halt.`
        );
        break;
      }

      // Cost check
      if (state.totalCost >= this.config.maxCostPerPR) {
        console.log(`⚠️ Cost limit reached: $${state.totalCost.toFixed(2)}`);
        await this.github.postComment(
          owner,
          repo,
          pr.number,
          `## ⚠️ Cost Limit Reached\n\nTotal cost: $${state.totalCost.toFixed(2)} / $${this.config.maxCostPerPR.toFixed(2)}\n\n**Action**: Stopping iterations. Manual review required.`
        );
        break;
      }

      // Refresh PR context for next iteration
      pr.commits = (await this.github.getPRContext(owner, repo, pr.number)).commits;

      // Small delay before next iteration
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Final state
    if (state.currentIteration >= state.maxIterations) {
      console.log('⚠️ Max iterations reached');
      await this.github.postComment(
        owner,
        repo,
        pr.number,
        `## ⚠️ Max Iterations Reached\n\nCompleted ${state.currentIteration}/${state.maxIterations} iterations.\n\n**Final Quality**: ${(state.qualityScore * 100).toFixed(1)}%\n**Required**: ${(this.config.qualityThreshold * 100).toFixed(1)}%\n\n**Action**: Manual review required.`
      );
      await this.github.addLabel(owner, repo, pr.number, this.config.labels?.needs_attention || '⚠️ maker-checker:attention');
    }
  }

  // Helper methods for posting comments

  private async postStatusComment(owner: string, repo: string, pr: PRContext, message: string, state: any): Promise<void> {
    const stats = this.state.getStatistics(state);
    await this.github.postComment(
      owner,
      repo,
      pr.number,
      `## 🤖 Maker-Checker Bot\n\n${message}\n\n**Cost so far**: $${stats.totalCost.toFixed(2)}`
    );
  }

  private async updateStatusComment(owner: string, repo: string, pr: PRContext, message: string, state: any): Promise<void> {
    // For simplicity, just post a new comment (could update existing in production)
    await this.postStatusComment(owner, repo, pr, message, state);
  }

  private async postCodexReview(owner: string, repo: string, pr: PRContext, review: any, metrics: any, state: any): Promise<void> {
    const summary = this.quality.generateSummary(metrics, state.currentIteration, state.maxIterations);
    const issues = review.issuesFound
      .slice(0, 10) // Limit to first 10 to avoid huge comments
      .map((issue: any) => `- **${issue.severity.toUpperCase()}** \`${issue.file}:${issue.line}\`: ${issue.message}`)
      .join('\n');

    const comment = `${summary}\n\n### Issues Found (${review.issuesFound.length} total)\n${issues}\n${review.issuesFound.length > 10 ? `\n_...and ${review.issuesFound.length - 10} more_` : ''}`;

    await this.github.postComment(owner, repo, pr.number, comment);
  }

  private async postClaudeResponse(owner: string, repo: string, pr: PRContext, response: any, state: any): Promise<void> {
    await this.github.postComment(
      owner,
      repo,
      pr.number,
      `## ✅ Claude Fixed Issues\n\n**Issues Addressed**: ${response.issuesAddressed}\n**Files Modified**: ${response.filesModified.length}\n\n${response.explanation}`
    );
  }

  private async postMergeDecision(owner: string, repo: string, pr: PRContext, decision: any, state: any): Promise<void> {
    const action = this.merger.getRecommendedAction(decision, state);
    await this.github.postComment(
      owner,
      repo,
      pr.number,
      `## 🎯 Merge Decision\n\n${decision.reason}\n\n${action}`
    );
  }

  private async autoMerge(owner: string, repo: string, pr: PRContext, state: any): Promise<void> {
    console.log('🚀 Auto-merging PR');
    await this.github.mergePR(owner, repo, pr.number, `Auto-merged via Maker-Checker (Quality: ${(state.qualityScore * 100).toFixed(1)}%)`);
    await this.github.postComment(
      owner,
      repo,
      pr.number,
      `## ✅ Auto-Merged\n\nQuality threshold met (${(state.qualityScore * 100).toFixed(1)}%). PR has been automatically merged.`
    );
  }

  private loadConfig(configPath: string): MakerCheckerConfig {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return YAML.parse(content) as MakerCheckerConfig;
    } catch (error) {
      console.error('Failed to load config, using defaults');
      return this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): MakerCheckerConfig {
    return {
      maxIterations: 5,
      qualityThreshold: 0.85,
      autoMergeThreshold: 0.9,
      autoMergeEnabled: false,
      maxCostPerPR: 5.0,
      monthlyCostCap: 100.0,
      slackEnabled: false,
      notifyOn: ['ready_to_merge', 'needs_attention'],
      requireHumanApprovalIf: {
        qualityScoreBelow: 0.85,
        securityIssuesFound: true,
        iterationsExceeded: true,
        costExceeded: true,
        tests_failing: true,
      },
    };
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const owner = process.env.GITHUB_REPOSITORY_OWNER || process.argv[2];
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || process.argv[3];
  const prNumber = parseInt(process.env.PR_NUMBER || process.argv[4]);

  if (!owner || !repo || !prNumber) {
    console.error('Usage: node index.js <owner> <repo> <pr-number>');
    console.error('Or set environment variables: GITHUB_REPOSITORY_OWNER, GITHUB_REPOSITORY, PR_NUMBER');
    process.exit(1);
  }

  const orchestrator = new MakerCheckerOrchestrator(
    process.env.GITHUB_TOKEN!,
    process.env.ANTHROPIC_API_KEY!,
    process.env.OPENAI_API_KEY!
  );

  orchestrator.run(owner, repo, prNumber).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
