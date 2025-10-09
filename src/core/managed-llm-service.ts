/**
 * Managed LLM Service - Enforcement Layer
 * All LLM calls MUST go through this service
 * Automatically handles: evaluation, caching, rate-limiting, monitoring, fallbacks
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMEvaluator } from '../evaluation/evaluator.js';
import { PromptRegistry } from '../prompts/registry.js';
import { QualityMonitor } from '../quality/monitor.js';
import { SemanticCache } from '../scalability/cache.js';
import { RateLimiter } from '../scalability/rate-limiter.js';
import { FallbackManager, commonStrategies } from '../scalability/fallback.js';
import type { EvaluationResult } from '../types/index.js';

export interface ManagedLLMConfig {
  // Required
  apiKey: string;

  // Quality enforcement
  autoEvaluate?: boolean;          // Default: true
  minQualityScore?: number;        // Default: 7 (0-10 scale)
  blockOnLowQuality?: boolean;     // Default: true

  // Performance
  enableCaching?: boolean;         // Default: true
  cacheStoragePath?: string;
  cacheTTL?: number;              // Default: 3600 seconds

  // Scaling
  enableRateLimiting?: boolean;   // Default: true
  requestsPerMinute?: number;     // Default: 60
  requestsPerHour?: number;       // Default: 1000
  requestsPerDay?: number;        // Default: 10000

  // Monitoring
  enableMonitoring?: boolean;     // Default: true
  metricsStoragePath?: string;

  // Prompts
  promptRegistryPath?: string;

  // Model
  model?: string;                 // Default: claude-sonnet-4-20250514
  temperature?: number;           // Default: 0.7
  maxTokens?: number;             // Default: 4000
}

export interface LLMRequest {
  featureId: string;              // e.g., "brand-strategy-generation"
  taskDescription: string;        // What the LLM should do
  prompt: string;                 // The actual prompt
  context?: Record<string, unknown>; // Additional context
  bypassQualityCheck?: boolean;   // Escape hatch (logged as warning)
}

export interface LLMResponse {
  success: true;
  content: string;
  evaluation?: EvaluationResult;
  metadata: {
    cached: boolean;
    evaluationPassed: boolean;
    qualityScore: number;
    cost: number;
    latency: number;
    tokensUsed: number;
    strategy: 'primary' | 'cache' | 'fallback';
  };
}

export interface LLMError {
  success: false;
  error: string;
  reason: 'quality_too_low' | 'rate_limit' | 'api_error' | 'validation_error';
  evaluation?: EvaluationResult;
  suggestions: string[];
}

export class ManagedLLMService {
  private config: Required<ManagedLLMConfig>;
  private anthropic: Anthropic;
  private evaluator?: LLMEvaluator;
  private monitor?: QualityMonitor;
  private cache?: SemanticCache;
  private rateLimiter?: RateLimiter;
  private fallbackManager?: FallbackManager;
  private promptRegistry?: PromptRegistry;

  constructor(config: ManagedLLMConfig) {
    // Apply defaults
    this.config = {
      apiKey: config.apiKey,
      autoEvaluate: config.autoEvaluate ?? true,
      minQualityScore: config.minQualityScore ?? 7,
      blockOnLowQuality: config.blockOnLowQuality ?? true,
      enableCaching: config.enableCaching ?? true,
      cacheStoragePath: config.cacheStoragePath ?? './data/llm-cache.json',
      cacheTTL: config.cacheTTL ?? 3600,
      enableRateLimiting: config.enableRateLimiting ?? true,
      requestsPerMinute: config.requestsPerMinute ?? 60,
      requestsPerHour: config.requestsPerHour ?? 1000,
      requestsPerDay: config.requestsPerDay ?? 10000,
      enableMonitoring: config.enableMonitoring ?? true,
      metricsStoragePath: config.metricsStoragePath ?? './data/llm-metrics.json',
      promptRegistryPath: config.promptRegistryPath ?? './data/prompts.json',
      model: config.model ?? 'claude-sonnet-4-20250514',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4000,
    };

    // Initialize Anthropic client
    this.anthropic = new Anthropic({ apiKey: this.config.apiKey });

    // Initialize components based on config
    if (this.config.autoEvaluate) {
      this.evaluator = new LLMEvaluator({
        apiKey: this.config.apiKey,
        model: this.config.model,
        temperature: 0.0, // Use deterministic eval
      });
    }

    if (this.config.enableMonitoring) {
      this.monitor = new QualityMonitor({
        storagePath: this.config.metricsStoragePath,
        alertThresholds: {
          accuracyDrop: 0.1,
          costIncrease: 50,
          latencyIncrease: 100,
          errorRateIncrease: 0.05,
        },
      });
    }

    if (this.config.enableCaching) {
      this.cache = new SemanticCache({
        storagePath: this.config.cacheStoragePath,
        defaultTTL: this.config.cacheTTL,
        maxEntries: 1000,
        similarityThreshold: 0.9,
      });
    }

    if (this.config.enableRateLimiting) {
      this.rateLimiter = new RateLimiter({
        requestsPerMinute: this.config.requestsPerMinute,
        requestsPerHour: this.config.requestsPerHour,
        requestsPerDay: this.config.requestsPerDay,
        burstAllowance: 10,
      });
    }

    this.fallbackManager = new FallbackManager(commonStrategies);

    this.promptRegistry = new PromptRegistry({
      storagePath: this.config.promptRegistryPath,
    });
  }

  /**
   * Initialize the service (load caches, registries, etc.)
   */
  async initialize(): Promise<void> {
    try {
      if (this.cache) {
        await this.cache.load().catch(() => {
          // Cache file doesn't exist yet, that's ok
        });
      }

      if (this.monitor) {
        await this.monitor.load().catch(() => {
          // Metrics file doesn't exist yet, that's ok
        });
      }

      if (this.promptRegistry) {
        await this.promptRegistry.load().catch(() => {
          // Registry doesn't exist yet, that's ok
        });
      }

      console.log('✅ ManagedLLMService initialized');
    } catch (error) {
      console.error('Failed to initialize ManagedLLMService:', error);
      throw error;
    }
  }

  /**
   * Generate LLM response with automatic quality enforcement
   * This is the main method all code should use
   */
  async generate(request: LLMRequest): Promise<LLMResponse | LLMError> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(request);

    // Warn if bypassing quality check
    if (request.bypassQualityCheck) {
      console.warn(`⚠️  Quality check bypassed for: ${request.featureId}`);
    }

    try {
      // 1. Check cache first
      if (this.cache) {
        const cached = this.cache.get(cacheKey);
        if (cached) {
          console.log(`💾 Cache hit for: ${request.featureId}`);

          return {
            success: true,
            content: cached,
            metadata: {
              cached: true,
              evaluationPassed: true, // Cached means it passed before
              qualityScore: this.config.minQualityScore,
              cost: 0,
              latency: Date.now() - startTime,
              tokensUsed: 0,
              strategy: 'cache',
            },
          };
        }
      }

      // 2. Apply rate limiting
      if (this.rateLimiter) {
        const allowed = await this.rateLimiter.check();
        if (!allowed.allowed) {
          return {
            success: false,
            error: 'Rate limit exceeded',
            reason: 'rate_limit',
            suggestions: [
              `Wait ${Math.ceil((allowed.resetAt.minute.getTime() - Date.now()) / 1000)}s for next available slot`,
              'Consider enabling caching to reduce API calls',
              'Increase rate limits in configuration',
            ],
          };
        }
        await this.rateLimiter.record();
      }

      // 3. Call LLM (with fallback support)
      let content: string;
      let tokensUsed: number;
      let cost: number;

      if (this.fallbackManager) {
        const result = await this.fallbackManager.execute(
          () => this.callLLM(request.prompt),
          {
            cacheKey,
            // Could add simpler model fallback here
          }
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error?.message || 'LLM call failed',
            reason: 'api_error',
            suggestions: [
              'Check API key is valid',
              'Check network connection',
              'Try again in a few moments',
            ],
          };
        }

        content = result.data!.content;
        tokensUsed = result.data!.tokensUsed;
        cost = result.data!.cost;
      } else {
        const result = await this.callLLM(request.prompt);
        content = result.content;
        tokensUsed = result.tokensUsed;
        cost = result.cost;
      }

      // 4. Evaluate quality (if enabled and not bypassed)
      let evaluation: EvaluationResult | undefined;
      let qualityScore = 10; // Assume perfect if not evaluating

      if (this.config.autoEvaluate && !request.bypassQualityCheck && this.evaluator) {
        evaluation = await this.evaluator.evaluate(request.taskDescription, content);
        qualityScore = evaluation.scores.overall;

        // 5. Check quality gate
        if (this.config.blockOnLowQuality && qualityScore < this.config.minQualityScore) {
          return {
            success: false,
            error: `Quality score ${qualityScore.toFixed(1)}/10 below minimum ${this.config.minQualityScore}/10`,
            reason: 'quality_too_low',
            evaluation,
            suggestions: [
              'Review and improve the prompt',
              'Add more context to the request',
              'Check examples in golden dataset',
              ...evaluation.recommendations,
            ],
          };
        }
      }

      // 6. Cache successful result
      if (this.cache && qualityScore >= this.config.minQualityScore) {
        await this.cache.set(cacheKey, content, this.config.cacheTTL);
      }

      // 7. Record metrics
      if (this.monitor) {
        await this.monitor.recordMetrics({
          timestamp: new Date().toISOString(),
          llmFeatureId: request.featureId,
          metrics: {
            accuracy: qualityScore / 10,
            precision: qualityScore / 10,
            recall: qualityScore / 10,
            f1Score: qualityScore / 10,
            avgResponseTime: Date.now() - startTime,
            avgTokens: tokensUsed,
            avgCost: cost,
            errorRate: 0,
          },
          aggregationPeriod: '1h',
        });
      }

      // 8. Return success
      return {
        success: true,
        content,
        evaluation,
        metadata: {
          cached: false,
          evaluationPassed: qualityScore >= this.config.minQualityScore,
          qualityScore,
          cost,
          latency: Date.now() - startTime,
          tokensUsed,
          strategy: 'primary',
        },
      };
    } catch (error) {
      // Log error but don't record in metrics (handled separately)
      console.error(`Error in ManagedLLMService:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        reason: 'api_error',
        suggestions: [
          'Check error details above',
          'Verify configuration is correct',
          'Check API service status',
        ],
      };
    }
  }

  /**
   * Call the LLM API
   */
  private async callLLM(prompt: string): Promise<{
    content: string;
    tokensUsed: number;
    cost: number;
  }> {
    const message = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const firstBlock = message.content[0];
    if (firstBlock.type !== 'text') {
      throw new Error('Expected text response from Claude');
    }

    const tokensUsed = message.usage.input_tokens + message.usage.output_tokens;
    const cost = this.estimateCost(message.usage);

    return {
      content: firstBlock.text,
      tokensUsed,
      cost,
    };
  }

  /**
   * Estimate cost
   */
  private estimateCost(usage: { input_tokens: number; output_tokens: number }): number {
    const INPUT_COST = 3.0 / 1_000_000;
    const OUTPUT_COST = 15.0 / 1_000_000;
    return usage.input_tokens * INPUT_COST + usage.output_tokens * OUTPUT_COST;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(request: LLMRequest): string {
    return `${request.featureId}:${Buffer.from(request.prompt).toString('base64').substring(0, 32)}`;
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<{
    cacheStats?: ReturnType<SemanticCache['getStats']>;
    rateLimitStatus?: Awaited<ReturnType<RateLimiter['getStatus']>>;
    qualityMetrics?: any;
  }> {
    const stats: any = {};

    if (this.cache) {
      stats.cacheStats = this.cache.getStats();
    }

    if (this.rateLimiter) {
      stats.rateLimitStatus = await this.rateLimiter.getStatus();
    }

    if (this.monitor) {
      // Could add quality metrics summary here
      stats.qualityMetrics = {
        // TODO: Aggregate metrics from monitor
      };
    }

    return stats;
  }
}
