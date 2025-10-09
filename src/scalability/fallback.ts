/**
 * Fallback System
 * Provides graceful degradation when LLM calls fail
 */

import type { FallbackStrategy } from '../types/index.js';

export interface FallbackResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  strategyUsed?: string;
  attemptCount: number;
}

export class FallbackManager {
  private strategies: FallbackStrategy[];
  private cache: Map<string, unknown> = new Map();

  constructor(strategies: FallbackStrategy[]) {
    this.strategies = strategies;
  }

  /**
   * Execute function with fallback strategies
   */
  async execute<T>(
    primaryFn: () => Promise<T>,
    context?: {
      cacheKey?: string;
      simpleFn?: () => Promise<T>;
      ruleBasedFn?: () => T;
      defaultValue?: T;
    }
  ): Promise<FallbackResult<T>> {
    let attemptCount = 0;
    let lastError: Error | undefined;

    // Try primary function
    try {
      attemptCount++;
      const result = await primaryFn();
      return {
        success: true,
        data: result,
        strategyUsed: 'primary',
        attemptCount,
      };
    } catch (error) {
      lastError = error as Error;
      console.warn(`Primary function failed: ${lastError.message}`);
    }

    // Try fallback strategies in order
    for (const strategy of this.strategies) {
      if (!strategy.condition(lastError!)) {
        continue;
      }

      try {
        attemptCount++;
        let result: T | undefined;

        switch (strategy.action) {
          case 'retry':
            result = await this.retry(primaryFn, strategy.config);
            break;

          case 'use_cache':
            if (context?.cacheKey) {
              result = this.cache.get(context.cacheKey) as T;
              if (!result) {
                throw new Error('No cached value available');
              }
            }
            break;

          case 'simpler_model':
            if (context?.simpleFn) {
              result = await context.simpleFn();
            }
            break;

          case 'rule_based':
            if (context?.ruleBasedFn) {
              result = context.ruleBasedFn();
            }
            break;

          case 'human_review':
            // In production, this would queue for human review
            console.log('Queueing for human review...');
            if (context?.defaultValue) {
              result = context.defaultValue;
            }
            break;

          default:
            throw new Error(`Unknown fallback action: ${strategy.action}`);
        }

        if (result !== undefined) {
          // Cache successful result
          if (context?.cacheKey) {
            this.cache.set(context.cacheKey, result);
          }

          return {
            success: true,
            data: result,
            strategyUsed: strategy.name,
            attemptCount,
          };
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `Fallback strategy '${strategy.name}' failed: ${lastError.message}`
        );
      }
    }

    // All strategies failed
    return {
      success: false,
      error: lastError,
      attemptCount,
    };
  }

  /**
   * Retry with exponential backoff
   */
  private async retry<T>(
    fn: () => Promise<T>,
    config?: Record<string, unknown>
  ): Promise<T> {
    const maxRetries = (config?.maxRetries as number) || 3;
    const baseDelay = (config?.baseDelay as number) || 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) {
          throw error;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, i);
        await this.sleep(delay);
      }
    }

    throw new Error('Retry failed');
  }

  /**
   * Add cached value
   */
  setCached(key: string, value: unknown): void {
    this.cache.set(key, value);
  }

  /**
   * Get cached value
   */
  getCached<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Common fallback strategies
 */
export const commonStrategies: FallbackStrategy[] = [
  {
    name: 'Retry on network error',
    condition: (error) =>
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.message.includes('ECONNREFUSED'),
    action: 'retry',
    config: { maxRetries: 3, baseDelay: 1000 },
  },
  {
    name: 'Use cache on rate limit',
    condition: (error) =>
      error.message.includes('rate limit') ||
      error.message.includes('429'),
    action: 'use_cache',
  },
  {
    name: 'Simpler model on timeout',
    condition: (error) =>
      error.message.includes('timeout') ||
      error.message.includes('deadline exceeded'),
    action: 'simpler_model',
  },
  {
    name: 'Rule-based on validation error',
    condition: (error) =>
      error.message.includes('validation') ||
      error.message.includes('invalid'),
    action: 'rule_based',
  },
  {
    name: 'Human review on critical failure',
    condition: (error) => error.message.includes('critical'),
    action: 'human_review',
  },
];
