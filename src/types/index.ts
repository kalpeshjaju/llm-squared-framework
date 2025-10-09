/**
 * Core types for LLM² Framework
 * Defines interfaces for evaluation, prompts, quality metrics, and more
 */

// ============================================================================
// EVALUATION TYPES
// ============================================================================

export interface EvaluationResult {
  id: string;
  timestamp: string;
  taskDescription: string;
  llmOutput: string;
  scores: EvaluationScores;
  passed: boolean;
  recommendations: string[];
  metadata?: Record<string, unknown>;
}

export interface EvaluationScores {
  overall: number; // 0-10
  correctness: number; // 0-10
  quality: number; // 0-10
  security: number; // 0-10
  performance: number; // 0-10
  maintainability: number; // 0-10
  [key: string]: number; // Allow custom criteria
}

export interface EvaluationCriteria {
  name: string;
  description: string;
  weight: number; // 0-1, weights should sum to 1
  passingScore: number; // Minimum score to pass (0-10)
}

export interface GoldenDatasetEntry {
  id: string;
  input: string;
  expectedOutput: string;
  metadata?: {
    category?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    tags?: string[];
  };
}

// ============================================================================
// PROMPT TYPES
// ============================================================================

export interface PromptVersion {
  id: string;
  version: string; // e.g., "v1.0.0"
  name: string;
  template: string;
  variables: string[]; // Variables in template (e.g., ["context", "question"])
  metadata: {
    createdAt: string;
    author: string;
    description: string;
    tags: string[];
  };
  performance?: {
    avgScore: number;
    totalEvaluations: number;
    successRate: number;
  };
}

export interface PromptTestCase {
  id: string;
  promptId: string;
  inputs: Record<string, string>;
  expectedOutputPattern?: string | RegExp;
  evaluationCriteria?: EvaluationCriteria[];
}

// ============================================================================
// QUALITY METRICS TYPES
// ============================================================================

export interface QualityMetrics {
  timestamp: string;
  llmFeatureId: string;
  metrics: {
    accuracy: number; // 0-1
    precision: number; // 0-1
    recall: number; // 0-1
    f1Score: number; // 0-1
    avgResponseTime: number; // milliseconds
    avgTokens: number;
    avgCost: number; // USD
    errorRate: number; // 0-1
  };
  aggregationPeriod: '1h' | '1d' | '7d' | '30d';
}

export interface QualityAlert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'quality_degradation' | 'cost_spike' | 'latency_increase' | 'error_rate_increase';
  message: string;
  currentValue: number;
  threshold: number;
  recommendations: string[];
}

// ============================================================================
// SCALABILITY TYPES
// ============================================================================

export interface CacheEntry {
  key: string;
  value: string;
  embedding?: number[]; // For semantic caching
  metadata: {
    createdAt: string;
    accessCount: number;
    lastAccessedAt: string;
    ttl: number; // seconds
  };
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstAllowance: number; // Allow short bursts above limit
}

export interface FallbackStrategy {
  name: string;
  condition: (error: Error) => boolean;
  action: 'retry' | 'use_cache' | 'simpler_model' | 'rule_based' | 'human_review';
  config?: Record<string, unknown>;
}

// ============================================================================
// LLM PROVIDER TYPES
// ============================================================================

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'custom';
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
}

export interface LLMRequest {
  prompt: string;
  config: LLMConfig;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface LLMResponse {
  id: string;
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata: {
    requestId: string;
    timestamp: string;
    latency: number; // milliseconds
    cost: number; // USD
  };
}

// ============================================================================
// PROJECT CONFIGURATION TYPES
// ============================================================================

export interface LLMFeatureConfig {
  id: string;
  name: string;
  description: string;
  prompts: {
    primary: string; // Prompt version ID
    fallback?: string; // Fallback prompt version ID
  };
  evaluation: {
    enabled: boolean;
    criteria: EvaluationCriteria[];
    goldenDataset?: string; // Path to golden dataset
    sampleRate: number; // 0-1, percentage of requests to evaluate
  };
  monitoring: {
    enabled: boolean;
    alerts: {
      qualityThreshold: number;
      costThreshold: number;
      latencyThreshold: number;
    };
  };
  scaling: {
    caching: {
      enabled: boolean;
      ttl: number;
      semantic: boolean; // Use semantic similarity for cache hits
    };
    rateLimit: RateLimitConfig;
    fallback: FallbackStrategy[];
  };
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}
