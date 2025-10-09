/**
 * LLM Output Evaluator - Claude-as-Judge
 * Evaluates LLM outputs against quality criteria
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  EvaluationResult,
  EvaluationScores,
  EvaluationCriteria,
} from '../types/index.js';

export interface EvaluatorConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  customCriteria?: EvaluationCriteria[];
}

export interface RawEvaluation {
  correctness: { score: number; reasoning: string };
  completeness: { score: number; reasoning: string };
  code_quality: { score: number; reasoning: string };
  token_efficiency: { score: number; reasoning: string };
  error_handling: { score: number; reasoning: string };
  security: { score: number; reasoning: string };
  overall_score: number;
  overall_assessment: string;
  passes: boolean;
  recommendations: string[];
}

/**
 * Default evaluation prompt template
 */
const DEFAULT_EVALUATION_PROMPT = `You are an expert evaluating LLM-generated output for production readiness.

TASK DESCRIPTION:
{{task}}

LLM OUTPUT:
{{output}}

Evaluate the output on these criteria (score 0-10 for each):

1. **Correctness**: Does it solve the task correctly?
2. **Completeness**: Are all requirements met?
3. **Code Quality**: Is it maintainable, readable, follows best practices?
4. **Token Efficiency**: Is the code concise without being cryptic?
5. **Error Handling**: Are errors handled properly with context?
6. **Security**: Any security issues or vulnerabilities?

Respond ONLY with valid JSON in this exact format:
{
  "correctness": {"score": 0-10, "reasoning": "brief explanation"},
  "completeness": {"score": 0-10, "reasoning": "brief explanation"},
  "code_quality": {"score": 0-10, "reasoning": "brief explanation"},
  "token_efficiency": {"score": 0-10, "reasoning": "brief explanation"},
  "error_handling": {"score": 0-10, "reasoning": "brief explanation"},
  "security": {"score": 0-10, "reasoning": "brief explanation"},
  "overall_score": 0-10,
  "overall_assessment": "brief summary",
  "passes": true/false,
  "recommendations": ["specific actionable recommendation 1", "recommendation 2"]
}

Score >= 7 = passes, < 7 = fails. Be strict but fair.`;

export class LLMEvaluator {
  private client: Anthropic;
  private config: Required<EvaluatorConfig>;

  constructor(config: EvaluatorConfig) {
    this.config = {
      model: config.model || 'claude-sonnet-4-20250514',
      temperature: config.temperature || 0.0,
      maxTokens: config.maxTokens || 2000,
      customCriteria: config.customCriteria || [],
      ...config,
    };

    this.client = new Anthropic({ apiKey: this.config.apiKey });
  }

  /**
   * Evaluate an LLM output
   */
  async evaluate(
    taskDescription: string,
    llmOutput: string,
    customPrompt?: string
  ): Promise<EvaluationResult> {
    const startTime = Date.now();
    const id = this.generateId();

    try {
      // Prepare evaluation prompt
      const prompt = customPrompt || DEFAULT_EVALUATION_PROMPT;
      const evaluationText = prompt
        .replace('{{task}}', taskDescription)
        .replace('{{output}}', llmOutput);

      // Call Claude API
      const message = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          {
            role: 'user',
            content: evaluationText,
          },
        ],
      });

      // Parse response
      const firstBlock = message.content[0];
      if (firstBlock.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }
      const responseText = firstBlock.text;
      const evaluation = this.parseEvaluationResponse(responseText);

      // Convert to standard format
      const result: EvaluationResult = {
        id,
        timestamp: new Date().toISOString(),
        taskDescription,
        llmOutput,
        scores: this.convertScores(evaluation),
        passed: evaluation.passes,
        recommendations: evaluation.recommendations,
        metadata: {
          evaluationTime: Date.now() - startTime,
          tokensUsed: {
            input: message.usage.input_tokens,
            output: message.usage.output_tokens,
            total: message.usage.input_tokens + message.usage.output_tokens,
          },
          estimatedCost: this.estimateCost(message.usage),
          model: this.config.model,
        },
      };

      return result;
    } catch (error) {
      throw new Error(
        `Failed to evaluate LLM output (ID: ${id}): ${error instanceof Error ? error.message : 'Unknown error'}. ` +
          `Check API key and network connection.`
      );
    }
  }

  /**
   * Batch evaluate multiple outputs
   */
  async evaluateBatch(
    tasks: Array<{ taskDescription: string; llmOutput: string }>
  ): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];

    for (const task of tasks) {
      try {
        const result = await this.evaluate(
          task.taskDescription,
          task.llmOutput
        );
        results.push(result);
      } catch (error) {
        console.error(`Failed to evaluate task: ${error}`);
        // Continue with other tasks
      }
    }

    return results;
  }

  /**
   * Parse Claude's JSON response
   */
  private parseEvaluationResponse(response: string): RawEvaluation {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const evaluation = JSON.parse(jsonMatch[0]) as RawEvaluation;

      // Validate required fields
      if (
        typeof evaluation.overall_score !== 'number' ||
        typeof evaluation.passes !== 'boolean'
      ) {
        throw new Error('Invalid evaluation format');
      }

      return evaluation;
    } catch (error) {
      throw new Error(
        `Failed to parse evaluation response: ${error instanceof Error ? error.message : 'Invalid JSON'}. ` +
          `Response was: ${response.substring(0, 200)}...`
      );
    }
  }

  /**
   * Convert raw scores to standard format
   */
  private convertScores(evaluation: RawEvaluation): EvaluationScores {
    return {
      overall: evaluation.overall_score,
      correctness: evaluation.correctness.score,
      quality: evaluation.code_quality.score,
      security: evaluation.security.score,
      performance: evaluation.token_efficiency.score,
      maintainability:
        (evaluation.code_quality.score + evaluation.error_handling.score) / 2,
    };
  }

  /**
   * Estimate cost based on token usage
   * Prices for Claude Sonnet 4.5 (as of 2025)
   */
  private estimateCost(usage: {
    input_tokens: number;
    output_tokens: number;
  }): number {
    const INPUT_COST_PER_MILLION = 3.0; // $3 per million tokens
    const OUTPUT_COST_PER_MILLION = 15.0; // $15 per million tokens

    const inputCost = (usage.input_tokens / 1_000_000) * INPUT_COST_PER_MILLION;
    const outputCost =
      (usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

    return inputCost + outputCost;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `eval_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get summary statistics from multiple evaluations
   */
  static getSummaryStats(results: EvaluationResult[]): {
    totalEvaluations: number;
    passRate: number;
    avgOverallScore: number;
    avgCost: number;
    totalCost: number;
    avgTime: number;
  } {
    if (results.length === 0) {
      return {
        totalEvaluations: 0,
        passRate: 0,
        avgOverallScore: 0,
        avgCost: 0,
        totalCost: 0,
        avgTime: 0,
      };
    }

    const passCount = results.filter((r) => r.passed).length;
    const totalCost = results.reduce(
      (sum, r) => sum + ((r.metadata?.estimatedCost as number) || 0),
      0
    );
    const totalTime = results.reduce(
      (sum, r) => sum + ((r.metadata?.evaluationTime as number) || 0),
      0
    );
    const avgScore =
      results.reduce((sum, r) => sum + r.scores.overall, 0) / results.length;

    return {
      totalEvaluations: results.length,
      passRate: passCount / results.length,
      avgOverallScore: avgScore,
      avgCost: totalCost / results.length,
      totalCost,
      avgTime: totalTime / results.length,
    };
  }
}
