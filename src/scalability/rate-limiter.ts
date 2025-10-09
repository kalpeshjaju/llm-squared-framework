/**
 * Rate Limiter
 * Controls request rate to prevent API quota exhaustion
 */

import type { RateLimitConfig } from '../types/index.js';

export interface RateLimitStatus {
  allowed: boolean;
  remaining: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  resetAt: {
    minute: Date;
    hour: Date;
    day: Date;
  };
}

export class RateLimiter {
  private config: RateLimitConfig;
  private requests: {
    minute: Date[];
    hour: Date[];
    day: Date[];
  } = {
    minute: [],
    hour: [],
    day: [],
  };

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if request is allowed
   */
  async check(): Promise<RateLimitStatus> {
    const now = new Date();

    // Clean old requests
    this.cleanOldRequests(now);

    // Check limits
    const minuteCount = this.requests.minute.length;
    const hourCount = this.requests.hour.length;
    const dayCount = this.requests.day.length;

    const allowed =
      minuteCount < this.config.requestsPerMinute &&
      hourCount < this.config.requestsPerHour &&
      dayCount < this.config.requestsPerDay;

    return {
      allowed,
      remaining: {
        perMinute: Math.max(0, this.config.requestsPerMinute - minuteCount),
        perHour: Math.max(0, this.config.requestsPerHour - hourCount),
        perDay: Math.max(0, this.config.requestsPerDay - dayCount),
      },
      resetAt: {
        minute: new Date(now.getTime() + 60 * 1000),
        hour: new Date(now.getTime() + 60 * 60 * 1000),
        day: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    };
  }

  /**
   * Record a request
   */
  async record(): Promise<void> {
    const now = new Date();
    this.requests.minute.push(now);
    this.requests.hour.push(now);
    this.requests.day.push(now);
  }

  /**
   * Wait until request is allowed (with timeout)
   */
  async waitForSlot(timeoutMs: number = 60000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.check();
      if (status.allowed) {
        return true;
      }

      // Wait a bit before checking again
      await this.sleep(1000);
    }

    return false; // Timeout
  }

  /**
   * Execute function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    const allowed = await this.waitForSlot(timeoutMs);

    if (!allowed) {
      throw new Error(
        `Rate limit exceeded. Could not execute within ${timeoutMs}ms timeout. ` +
        `Current limits: ${this.config.requestsPerMinute}/min, ${this.config.requestsPerHour}/hour, ${this.config.requestsPerDay}/day`
      );
    }

    await this.record();

    try {
      return await fn();
    } catch (error) {
      // If request failed, we could potentially not count it
      // For now, we count all attempts
      throw error;
    }
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<RateLimitStatus> {
    return this.check();
  }

  /**
   * Reset all counters
   */
  reset(): void {
    this.requests = {
      minute: [],
      hour: [],
      day: [],
    };
  }

  /**
   * Clean old requests outside time windows
   */
  private cleanOldRequests(now: Date): void {
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    this.requests.minute = this.requests.minute.filter(
      (r) => r > oneMinuteAgo
    );
    this.requests.hour = this.requests.hour.filter((r) => r > oneHourAgo);
    this.requests.day = this.requests.day.filter((r) => r > oneDayAgo);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
