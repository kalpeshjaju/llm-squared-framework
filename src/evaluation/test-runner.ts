/**
 * Evaluation Test Runner
 * Runs evaluations against golden datasets and generates reports
 */

import { LLMEvaluator } from './evaluator.js';
import { GoldenDatasetManager } from './golden-dataset.js';
import type { EvaluationResult, GoldenDatasetEntry } from '../types/index.js';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface TestRunConfig {
  datasetPath: string;
  outputPath: string;
  sampleSize?: number; // If set, only test N random samples
  categories?: string[]; // Filter by categories
  difficulty?: 'easy' | 'medium' | 'hard'; // Filter by difficulty
  stopOnFailure?: boolean; // Stop at first failure
}

export interface TestRunResult {
  runId: string;
  timestamp: string;
  config: TestRunConfig;
  results: EvaluationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
    totalCost: number;
    totalTime: number;
  };
  failures: Array<{
    entryId: string;
    input: string;
    expectedOutput: string;
    actualScore: number;
    recommendations: string[];
  }>;
}

export class EvaluationTestRunner {
  private evaluator: LLMEvaluator;
  private datasetManager: GoldenDatasetManager;

  constructor(evaluator: LLMEvaluator, datasetManager: GoldenDatasetManager) {
    this.evaluator = evaluator;
    this.datasetManager = datasetManager;
  }

  /**
   * Run evaluation tests
   */
  async run(config: TestRunConfig): Promise<TestRunResult> {
    const runId = this.generateRunId();
    const startTime = Date.now();

    console.log(`🧪 Starting evaluation run: ${runId}`);
    console.log(`📁 Dataset: ${config.datasetPath}`);

    // Load test cases
    const entries = await this.loadTestCases(config);
    console.log(`📝 Loaded ${entries.length} test cases`);

    // Run evaluations
    const results: EvaluationResult[] = [];
    const failures: TestRunResult['failures'] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`\n[${i + 1}/${entries.length}] Evaluating: ${entry.id}`);

      try {
        const result = await this.evaluator.evaluate(
          entry.input,
          entry.expectedOutput
        );

        results.push(result);

        if (result.passed) {
          console.log(`✅ PASS (Score: ${result.scores.overall.toFixed(1)}/10)`);
        } else {
          console.log(`❌ FAIL (Score: ${result.scores.overall.toFixed(1)}/10)`);
          failures.push({
            entryId: entry.id,
            input: entry.input,
            expectedOutput: entry.expectedOutput,
            actualScore: result.scores.overall,
            recommendations: result.recommendations,
          });

          if (config.stopOnFailure) {
            console.log('\n🛑 Stopping on first failure as configured');
            break;
          }
        }
      } catch (error) {
        console.error(`❌ Error evaluating ${entry.id}:`, error);
        if (config.stopOnFailure) break;
      }
    }

    // Generate summary
    const summary = this.generateSummary(results);
    const totalTime = Date.now() - startTime;

    const testRunResult: TestRunResult = {
      runId,
      timestamp: new Date().toISOString(),
      config,
      results,
      summary: {
        ...summary,
        totalTime,
      },
      failures,
    };

    // Save results
    await this.saveResults(testRunResult, config.outputPath);

    // Print summary
    this.printSummary(testRunResult);

    return testRunResult;
  }

  /**
   * Load test cases based on config
   */
  private async loadTestCases(
    config: TestRunConfig
  ): Promise<GoldenDatasetEntry[]> {
    let entries: GoldenDatasetEntry[];

    // Apply filters
    if (config.categories && config.categories.length > 0) {
      entries = [];
      for (const category of config.categories) {
        const categoryEntries = await this.datasetManager.getByCategory(
          category
        );
        entries.push(...categoryEntries);
      }
    } else if (config.difficulty) {
      entries = await this.datasetManager.getByDifficulty(config.difficulty);
    } else {
      entries = await this.datasetManager.getAllEntries();
    }

    // Apply sample size
    if (config.sampleSize && config.sampleSize < entries.length) {
      entries = await this.datasetManager.getRandomSample(config.sampleSize);
    }

    return entries;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(results: EvaluationResult[]): Omit<
    TestRunResult['summary'],
    'totalTime'
  > {
    if (results.length === 0) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        avgScore: 0,
        totalCost: 0,
      };
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;
    const totalCost = results.reduce(
      (sum, r) => sum + ((r.metadata?.estimatedCost as number) || 0),
      0
    );
    const avgScore =
      results.reduce((sum, r) => sum + r.scores.overall, 0) / results.length;

    return {
      total: results.length,
      passed,
      failed,
      passRate: passed / results.length,
      avgScore,
      totalCost,
    };
  }

  /**
   * Save results to file
   */
  private async saveResults(
    result: TestRunResult,
    outputPath: string
  ): Promise<void> {
    try {
      await mkdir(dirname(outputPath), { recursive: true });

      // Save detailed JSON
      const jsonPath = outputPath.replace(/\.\w+$/, '.json');
      await writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf-8');

      // Save markdown summary
      const mdPath = outputPath.replace(/\.\w+$/, '.md');
      const markdown = this.generateMarkdownReport(result);
      await writeFile(mdPath, markdown, 'utf-8');

      console.log(`\n💾 Results saved:`);
      console.log(`   JSON: ${jsonPath}`);
      console.log(`   Markdown: ${mdPath}`);
    } catch (error) {
      console.error(`Failed to save results: ${error}`);
    }
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(result: TestRunResult): string {
    const { summary, failures } = result;

    let md = `# Evaluation Test Run Report\n\n`;
    md += `**Run ID**: ${result.runId}\n`;
    md += `**Timestamp**: ${result.timestamp}\n`;
    md += `**Dataset**: ${result.config.datasetPath}\n\n`;

    md += `## Summary\n\n`;
    md += `- **Total Tests**: ${summary.total}\n`;
    md += `- **Passed**: ${summary.passed} ✅\n`;
    md += `- **Failed**: ${summary.failed} ❌\n`;
    md += `- **Pass Rate**: ${(summary.passRate * 100).toFixed(1)}%\n`;
    md += `- **Average Score**: ${summary.avgScore.toFixed(2)}/10\n`;
    md += `- **Total Cost**: $${summary.totalCost.toFixed(4)}\n`;
    md += `- **Total Time**: ${(summary.totalTime / 1000).toFixed(1)}s\n\n`;

    if (failures.length > 0) {
      md += `## Failures (${failures.length})\n\n`;

      failures.forEach((failure, i) => {
        md += `### ${i + 1}. ${failure.entryId}\n\n`;
        md += `**Score**: ${failure.actualScore.toFixed(1)}/10\n\n`;
        md += `**Input**:\n\`\`\`\n${failure.input}\n\`\`\`\n\n`;
        md += `**Expected Output**:\n\`\`\`\n${failure.expectedOutput}\n\`\`\`\n\n`;

        if (failure.recommendations.length > 0) {
          md += `**Recommendations**:\n`;
          failure.recommendations.forEach((rec) => {
            md += `- ${rec}\n`;
          });
          md += `\n`;
        }
      });
    }

    md += `## Detailed Results\n\n`;
    md += `See ${result.runId}.json for full details.\n`;

    return md;
  }

  /**
   * Print summary to console
   */
  private printSummary(result: TestRunResult): void {
    const { summary } = result;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 EVALUATION SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Tests:   ${summary.total}`);
    console.log(
      `Passed:        ${summary.passed} ✅ (${(summary.passRate * 100).toFixed(1)}%)`
    );
    console.log(`Failed:        ${summary.failed} ❌`);
    console.log(`Average Score: ${summary.avgScore.toFixed(2)}/10`);
    console.log(`Total Cost:    $${summary.totalCost.toFixed(4)}`);
    console.log(`Total Time:    ${(summary.totalTime / 1000).toFixed(1)}s`);
    console.log(`${'='.repeat(60)}\n`);

    if (summary.passRate < 0.7) {
      console.log(`⚠️  WARNING: Pass rate below 70%`);
    } else if (summary.passRate >= 0.9) {
      console.log(`🎉 Excellent! Pass rate >= 90%`);
    }
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
