/**
 * Shared TypeScript types for the Maker-Checker system
 */

export interface MakerCheckerConfig {
  maxIterations: number;
  qualityThreshold: number;
  autoMergeThreshold: number;
  autoMergeEnabled: boolean;
  maxCostPerPR: number;
  monthlyCostCap: number;
  slackEnabled: boolean;
  slackWebhook?: string;
  notifyOn: string[];
  requireHumanApprovalIf: {
    qualityScoreBelow: number;
    securityIssuesFound: boolean;
    iterationsExceeded: boolean;
    costExceeded: boolean;
  };
}

export interface IterationState {
  prNumber: number;
  repository: string;
  currentIteration: number;
  maxIterations: number;
  history: IterationRecord[];
  currentPhase: 'waiting' | 'codex_review' | 'claude_response' | 're_review' | 'complete' | 'failed';
  qualityScore: number;
  convergenceStatus: 'improving' | 'stagnant' | 'complete';
  totalCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface IterationRecord {
  iteration: number;
  codexReview?: CodexReviewResult;
  claudeResponse?: ClaudeResponseResult;
  issuesFound: number;
  issuesFixed: number;
  qualityDelta: number;
  cost: number;
  timestamp: string;
  durationSeconds: number;
}

export interface CodexReviewResult {
  status: 'success' | 'error';
  issuesFound: Issue[];
  overallQuality: number;
  recommendations: string[];
  securityIssues: SecurityIssue[];
  performanceIssues: PerformanceIssue[];
  rawResponse: string;
  cost: number;
  timestamp: string;
}

export interface ClaudeResponseResult {
  status: 'success' | 'error';
  commitSha: string;
  filesModified: string[];
  issuesAddressed: number;
  newCommits: Commit[];
  explanation: string;
  cost: number;
  timestamp: string;
}

export interface Issue {
  type: 'security' | 'performance' | 'type_safety' | 'code_quality' | 'best_practice';
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  message: string;
  suggestion?: string;
  code?: string;
}

export interface SecurityIssue {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  file: string;
  line: number;
  recommendation: string;
}

export interface PerformanceIssue {
  type: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  file: string;
  line: number;
  suggestion: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  filesChanged: string[];
}

export interface PRContext {
  number: number;
  title: string;
  description: string;
  author: string;
  repository: string;
  owner: string;
  branch: string;
  baseBranch: string;
  commits: Commit[];
  files: FileChange[];
  url: string;
}

export interface FileChange {
  filename: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface QualityMetrics {
  overallScore: number;
  codeQuality: number;
  security: number;
  performance: number;
  typeSafety: number;
  bestPractices: number;
  testCoverage?: number;
  documentation?: number;
}

export interface MergeDecision {
  shouldMerge: boolean;
  reason: string;
  requiresHumanApproval: boolean;
  blockingIssues: Issue[];
  qualityScore: number;
  iterationsUsed: number;
  totalCost: number;
}

export interface NotificationPayload {
  type: 'iteration_complete' | 'ready_to_merge' | 'needs_attention' | 'cost_warning' | 'error' | 'stagnant';
  pr: PRContext;
  state: IterationState;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface CostTracking {
  prNumber: number;
  repository: string;
  totalCost: number;
  claudeCost: number;
  codexCost: number;
  iterations: number;
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    github: 'up' | 'down';
    claude: 'up' | 'down';
    codex: 'up' | 'down';
    slack: 'up' | 'down';
  };
  lastCheck: string;
  errors: string[];
}
