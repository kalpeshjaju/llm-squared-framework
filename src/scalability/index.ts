/**
 * Scalability Module
 * Exports all scalability utilities
 */

export { SemanticCache } from './cache.js';
export type { CacheConfig } from './cache.js';

export { RateLimiter } from './rate-limiter.js';
export type { RateLimitStatus } from './rate-limiter.js';

export { FallbackManager, commonStrategies } from './fallback.js';
export type { FallbackResult } from './fallback.js';
