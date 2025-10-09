/**
 * Prompt Tester
 * Tests prompts against test cases and tracks performance
 */

import type { PromptVersion, PromptTestCase } from '../types/index.js';
import { PromptRegistry } from './registry.js';
import { LLMEvaluator } from '../evaluation/evaluator.js';
import type { EvaluationResult } from '../types/index.js';

export interface PromptTestResult {
  promptId: string;
  promptName: string;
  promptVersion: string;
  testCaseId: string;
  passed: boolean;
  score: number;
  evaluation: EvaluationResult;
  timestamp: string;
}

export interface PromptTestReport {
  promptId: string;
  promptName: string;
  promptVersion: string;
  timestamp: string;
  results: PromptTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
  };
}

export class PromptTester {
  private registry: PromptRegistry;
  private evaluator: LLMEvaluator;

  constructor(registry: PromptRegistry, evaluator: LLMEvaluator) {
    this.registry = registry;
    this.evaluator = evaluator;
  }

  /**
   * Test a prompt against a single test case
   */
  async testOne(
    promptName: string,
    promptVersion: string,
    testCase: PromptTestCase
  ): Promise<PromptTestResult> {
    const prompt = this.registry.get(promptName, promptVersion);
    if (!prompt) {
      throw new Error(
        `Prompt ${promptName} version ${promptVersion} not found in registry`
      );
    }

    // Render prompt with test inputs
    const renderedPrompt = this.registry.render(prompt, testCase.inputs);

    // Generate output using LLM (this would need an LLM client)
    // For now, we'll use the rendered prompt as task description
    const taskDescription = `Using prompt: ${promptName} v${promptVersion}\nWith inputs: ${JSON.stringify(testCase.inputs)}`;

    // Evaluate (in real usage, you'd generate actual LLM output first)
    const evaluation = await this.evaluator.evaluate(
      taskDescription,
      renderedPrompt
    );

    const result: PromptTestResult = {
      promptId: prompt.id,
      promptName: prompt.name,
      promptVersion: prompt.version,
      testCaseId: testCase.id,
      passed: evaluation.passed,
      score: evaluation.scores.overall,
      evaluation,
      timestamp: new Date().toISOString(),
    };

    // Update prompt performance in registry
    await this.registry.updatePerformance(prompt.id, {
      score: evaluation.scores.overall,
      passed: evaluation.passed,
    });

    return result;
  }

  /**
   * Test a prompt against multiple test cases
   */
  async testBatch(
    promptName: string,
    promptVersion: string,
    testCases: PromptTestCase[]
  ): Promise<PromptTestReport> {
    const results: PromptTestResult[] = [];

    console.log(
      `\n🧪 Testing prompt: ${promptName} v${promptVersion} with ${testCases.length} test cases\n`
    );

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`[${i + 1}/${testCases.length}] Testing case: ${testCase.id}`);

      try {
        const result = await this.testOne(promptName, promptVersion, testCase);
        results.push(result);

        if (result.passed) {
          console.log(
            `✅ PASS (Score: ${result.score.toFixed(1)}/10)`
          );
        } else {
          console.log(
            `❌ FAIL (Score: ${result.score.toFixed(1)}/10)`
          );
        }
      } catch (error) {
        console.error(`❌ Error testing case ${testCase.id}:`, error);
      }
    }

    const prompt = this.registry.get(promptName, promptVersion)!;
    const summary = this.generateSummary(results);

    const report: PromptTestReport = {
      promptId: prompt.id,
      promptName: promptName,
      promptVersion: promptVersion,
      timestamp: new Date().toISOString(),
      results,
      summary,
    };

    this.printSummary(report);

    return report;
  }

  /**
   * Compare two prompt versions
   */
  async compare(
    promptName: string,
    versionA: string,
    versionB: string,
    testCases: PromptTestCase[]
  ): Promise<{
    versionA: PromptTestReport;
    versionB: PromptTestReport;
    winner: 'A' | 'B' | 'tie';
    improvement: number; // Percentage improvement
  }> {
    console.log(
      `\n🔬 Comparing ${promptName}: v${versionA} vs v${versionB}\n`
    );

    const reportA = await this.testBatch(promptName, versionA, testCases);
    const reportB = await this.testBatch(promptName, versionB, testCases);

    const scoreA = reportA.summary.avgScore;
    const scoreB = reportB.summary.avgScore;

    let winner: 'A' | 'B' | 'tie';
    let improvement: number;

    if (Math.abs(scoreA - scoreB) < 0.5) {
      winner = 'tie';
      improvement = 0;
    } else if (scoreA > scoreB) {
      winner = 'A';
      improvement = ((scoreA - scoreB) / scoreB) * 100;
    } else {
      winner = 'B';
      improvement = ((scoreB - scoreA) / scoreA) * 100;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 COMPARISON RESULTS`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Version A (${versionA}): ${scoreA.toFixed(2)}/10`);
    console.log(`Version B (${versionB}): ${scoreB.toFixed(2)}/10`);
    console.log(
      `Winner: ${winner === 'tie' ? 'TIE' : `Version ${winner}`}`
    );
    if (winner !== 'tie') {
      console.log(`Improvement: +${improvement.toFixed(1)}%`);
    }
    console.log(`${'='.repeat(60)}\n`);

    return {
      versionA: reportA,
      versionB: reportB,
      winner,
      improvement,
    };
  }

  /**
   * Find best prompt version based on historical test results
   */
  async findBest(promptName: string): Promise<PromptVersion | null> {
    return this.registry.getBestPerforming(promptName);
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(
    results: PromptTestResult[]
  ): PromptTestReport['summary'] {
    if (results.length === 0) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        avgScore: 0,
      };
    }

    const passed = results.filter((r) => r.passed).length;
    const avgScore =
      results.reduce((sum, r) => sum + r.score, 0) / results.length;

    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      passRate: passed / results.length,
      avgScore,
    };
  }

  /**
   * Print summary
   */
  private printSummary(report: PromptTestReport): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(
      `📊 PROMPT TEST SUMMARY: ${report.promptName} v${report.promptVersion}`
    );
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Tests:   ${report.summary.total}`);
    console.log(
      `Passed:        ${report.summary.passed} ✅ (${(report.summary.passRate * 100).toFixed(1)}%)`
    );
    console.log(`Failed:        ${report.summary.failed} ❌`);
    console.log(`Average Score: ${report.summary.avgScore.toFixed(2)}/10`);
    console.log(`${'='.repeat(60)}\n`);
  }
}
