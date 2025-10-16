#!/usr/bin/env node
/**
 * Local Deep Review Tool
 *
 * Performs thorough PR analysis using Claude Code CLI (your Claude Pro subscription).
 * FREE - no API costs!
 *
 * Usage: npm run review:deep [pr-number]
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface PRChange {
  file: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface ReviewConfig {
  prNumber?: number;
  outputDir: string;
  verbose: boolean;
}

class DeepReviewer {
  private config: ReviewConfig;
  private timestamp: string;

  constructor(config: ReviewConfig) {
    this.config = config;
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  }

  /**
   * Get current branch name
   */
  private getCurrentBranch(): string {
    return execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  }

  /**
   * Get PR number from branch or user input
   */
  private getPRNumber(): number | null {
    if (this.config.prNumber) {
      return this.config.prNumber;
    }

    // Try to get PR number from branch name (e.g., feature/PR-123)
    const branch = this.getCurrentBranch();
    const match = branch.match(/PR-(\d+)/i);
    if (match) {
      return parseInt(match[1]);
    }

    return null;
  }

  /**
   * Get list of changed files in PR
   */
  private getChangedFiles(): PRChange[] {
    const baseBranch = this.getBaseBranch();
    const output = execSync(`git diff ${baseBranch}...HEAD --numstat`, { encoding: 'utf-8' });

    const changes: PRChange[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (!line) continue;

      const [additions, deletions, file] = line.split('\t');
      changes.push({
        file,
        status: this.getFileStatus(file, baseBranch),
        additions: parseInt(additions) || 0,
        deletions: parseInt(deletions) || 0,
      });
    }

    return changes;
  }

  /**
   * Get base branch (main or master)
   */
  private getBaseBranch(): string {
    try {
      execSync('git rev-parse --verify main', { stdio: 'ignore' });
      return 'main';
    } catch {
      return 'master';
    }
  }

  /**
   * Get file status (added, modified, deleted)
   */
  private getFileStatus(file: string, baseBranch: string): string {
    try {
      execSync(`git diff ${baseBranch}...HEAD --diff-filter=A --name-only | grep -x "${file}"`, { stdio: 'ignore' });
      return 'added';
    } catch {}

    try {
      execSync(`git diff ${baseBranch}...HEAD --diff-filter=D --name-only | grep -x "${file}"`, { stdio: 'ignore' });
      return 'deleted';
    } catch {}

    return 'modified';
  }

  /**
   * Get detailed diff for file
   */
  private getFileDiff(file: string): string {
    const baseBranch = this.getBaseBranch();
    try {
      return execSync(`git diff ${baseBranch}...HEAD -- "${file}"`, { encoding: 'utf-8' });
    } catch {
      return '';
    }
  }

  /**
   * Read file content
   */
  private readFileContent(file: string): string {
    try {
      return fs.readFileSync(file, 'utf-8');
    } catch {
      return '[File not readable]';
    }
  }

  /**
   * Generate comprehensive review prompt
   */
  private generateReviewPrompt(changes: PRChange[]): string {
    const totalAdditions = changes.reduce((sum, c) => sum + c.additions, 0);
    const totalDeletions = changes.reduce((sum, c) => sum + c.deletions, 0);

    let prompt = `# 🔍 Deep PR Review Request

You are an expert code reviewer performing a thorough analysis of this pull request.

## PR Overview

- **Files Changed**: ${changes.length}
- **Lines Added**: +${totalAdditions}
- **Lines Deleted**: -${totalDeletions}
- **Net Change**: ${totalAdditions - totalDeletions} lines

## Files Changed

${changes.map(c => `- \`${c.file}\` (${c.status}): +${c.additions}/-${c.deletions}`).join('\n')}

---

## Your Task

Perform a **comprehensive, deep review** covering:

### 1. Code Quality & Best Practices
- Are coding standards followed?
- Is the code readable and maintainable?
- Are functions and files appropriately sized?
- Are there any code smells or anti-patterns?

### 2. Architecture & Design
- Does this fit well with the existing architecture?
- Are there any design concerns?
- Is the abstraction level appropriate?
- Are responsibilities properly separated?

### 3. Security & Safety
- Are there any security vulnerabilities?
- Is input properly validated?
- Are secrets handled correctly?
- Are there any injection risks?

### 4. Performance & Scalability
- Are there any performance concerns?
- Will this scale well?
- Are resources properly managed?
- Are there any memory leaks?

### 5. Testing & Coverage
- Are tests comprehensive?
- Are edge cases covered?
- Is test coverage adequate?
- Are tests properly structured?

### 6. Documentation & Maintainability
- Is the code self-documenting?
- Are complex parts explained?
- Is documentation up to date?
- Will future developers understand this?

### 7. Error Handling & Resilience
- Are errors properly handled?
- Are error messages helpful?
- Is the system resilient to failures?
- Are edge cases handled?

### 8. Dependencies & Integration
- Are dependency changes appropriate?
- Are versions pinned correctly?
- Are integrations properly tested?
- Are breaking changes documented?

---

## Changed Files Analysis

`;

    // Add detailed diffs for each file
    for (const change of changes) {
      prompt += `\n### 📄 ${change.file} (${change.status})\n\n`;

      if (change.status === 'deleted') {
        prompt += '**Status**: File was deleted\n\n';
        continue;
      }

      const diff = this.getFileDiff(change.file);
      if (diff) {
        prompt += '**Diff**:\n```diff\n' + diff + '\n```\n\n';
      }

      // For new files, include full content if small
      if (change.status === 'added' && change.additions < 300) {
        const content = this.readFileContent(change.file);
        if (content && content !== '[File not readable]') {
          prompt += '**Full Content**:\n```\n' + content + '\n```\n\n';
        }
      }
    }

    prompt += `\n---

## Output Format

Please provide your review in the following structure:

### ✅ Strengths
What is well done in this PR?

### ⚠️ Issues Found
List any issues, categorized by severity:
- 🔴 **Critical**: Must fix before merge
- 🟠 **High**: Should fix before merge
- 🟡 **Medium**: Should fix soon
- 🔵 **Low**: Nice to have

For each issue, provide:
- **Location**: file:line
- **Issue**: What's wrong
- **Impact**: Why it matters
- **Recommendation**: How to fix

### 💡 Suggestions
Improvements that could make this even better

### 🎯 Overall Assessment
- **Quality Score**: X/10
- **Risk Level**: Low/Medium/High
- **Recommendation**: Approve / Request Changes / Reject
- **Reasoning**: Why?

### 📋 Pre-merge Checklist
- [ ] All critical issues addressed
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Security review complete
- [ ] Performance acceptable

---

Please be thorough but constructive. Focus on helping improve the code.
`;

    return prompt;
  }

  /**
   * Execute deep review using Claude Code CLI
   */
  public async executeReview(): Promise<void> {
    console.log('\n🔍 Starting Deep Review...\n');

    // Check if Claude CLI is available
    try {
      execSync('which claude', { stdio: 'ignore' });
    } catch {
      console.error('❌ Claude Code CLI not found!');
      console.error('\nPlease install Claude Code CLI:');
      console.error('  npm install -g @anthropic-ai/claude-cli');
      console.error('\nOr use: npx @anthropic-ai/claude-cli\n');
      process.exit(1);
    }

    const prNumber = this.getPRNumber();
    if (prNumber) {
      console.log(`📌 PR #${prNumber}`);
    }

    const currentBranch = this.getCurrentBranch();
    console.log(`🌿 Branch: ${currentBranch}\n`);

    // Get changed files
    console.log('📂 Analyzing changed files...');
    const changes = this.getChangedFiles();

    if (changes.length === 0) {
      console.error('❌ No changes found. Make sure you are on a feature branch.\n');
      process.exit(1);
    }

    console.log(`   Found ${changes.length} changed files\n`);

    // Generate review prompt
    console.log('📝 Generating review prompt...');
    const prompt = this.generateReviewPrompt(changes);

    // Save prompt to temp file
    const tempDir = path.join(process.cwd(), '.deep-review-temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const promptFile = path.join(tempDir, `prompt-${this.timestamp}.md`);
    fs.writeFileSync(promptFile, prompt);
    console.log(`   Prompt saved to: ${promptFile}\n`);

    // Execute Claude CLI
    console.log('🤖 Running Claude Code CLI (this may take 2-5 minutes)...\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Use Claude CLI in conversation mode
      const command = `claude -p "${promptFile}"`;
      const output = execSync(command, {
        encoding: 'utf-8',
        stdio: ['inherit', 'pipe', 'inherit'],
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('✅ Deep review complete!\n');

      // Save review output
      const outputFile = path.join(
        this.config.outputDir,
        `deep-review-${currentBranch}-${this.timestamp}.md`
      );

      const reviewReport = `# Deep Review Report

**Branch**: ${currentBranch}
**PR**: ${prNumber || 'N/A'}
**Date**: ${new Date().toISOString()}
**Files Changed**: ${changes.length}

---

${output}

---

**Generated using Claude Pro subscription via Claude Code CLI**
`;

      fs.writeFileSync(outputFile, reviewReport);
      console.log(`📄 Review saved to: ${outputFile}\n`);

      // Cleanup temp file
      try {
        fs.unlinkSync(promptFile);
      } catch {}

      console.log('🎉 Done! Review the output above and check the saved report.\n');
    } catch (error) {
      console.error('\n❌ Deep review failed:', error);
      console.error('\nTroubleshooting:');
      console.error('  1. Make sure Claude Code CLI is installed and authenticated');
      console.error('  2. Check that you have an active Claude Pro subscription');
      console.error('  3. Try running: claude --version\n');
      process.exit(1);
    }
  }
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const config: ReviewConfig = {
    prNumber: undefined,
    outputDir: path.join(process.cwd(), '.deep-reviews'),
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      console.log(`
🔍 Deep Review Tool (Claude Pro)

Performs thorough PR analysis using your Claude Pro subscription.
FREE - no API costs!

Usage:
  npm run review:deep [options] [pr-number]

Options:
  --help, -h         Show this help
  --output, -o DIR   Output directory (default: .deep-reviews)
  --verbose, -v      Verbose output

Examples:
  npm run review:deep              # Review current branch
  npm run review:deep 123          # Review PR #123
  npm run review:deep --output ./reviews

Requirements:
  - Claude Code CLI installed (npm install -g @anthropic-ai/claude-cli)
  - Claude Pro subscription
  - Active git branch with changes
      `);
      process.exit(0);
    } else if (arg === '--output' || arg === '-o') {
      config.outputDir = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (/^\d+$/.test(arg)) {
      config.prNumber = parseInt(arg);
    }
  }

  // Create output directory
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  // Run review
  const reviewer = new DeepReviewer(config);
  await reviewer.executeReview();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { DeepReviewer };
