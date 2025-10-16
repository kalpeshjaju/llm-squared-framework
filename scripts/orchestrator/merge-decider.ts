/**
 * Merge Decider - Determines when code is ready to merge
 * Applies business rules and quality gates to decide merge readiness
 */

import type {
  MergeDecision,
  IterationState,
  MakerCheckerConfig,
  CodexReviewResult,
  Issue,
} from '../types.js';

export class MergeDecider {
  constructor(private config: MakerCheckerConfig) {}

  /**
   * Decide if PR should be merged
   */
  shouldMerge(
    state: IterationState,
    latestReview: CodexReviewResult,
    ciStatus: 'success' | 'pending' | 'failure' | 'error'
  ): MergeDecision {
    const blockingIssues: Issue[] = [];
    const reasons: string[] = [];

    // Check quality threshold
    const qualityMet = state.qualityScore >= this.config.qualityThreshold;
    if (!qualityMet) {
      reasons.push(
        `Quality score ${(state.qualityScore * 100).toFixed(1)}% below threshold ${(this.config.qualityThreshold * 100).toFixed(1)}%`
      );
    }

    // Check for blocking issues
    const securityIssues = latestReview.issuesFound.filter(
      (i) => i.type === 'security' && i.severity === 'error'
    );
    if (securityIssues.length > 0) {
      blockingIssues.push(...securityIssues);
      reasons.push(`${securityIssues.length} critical security issue(s) found`);
    }

    // Check CI status
    if (ciStatus !== 'success') {
      reasons.push(`CI status: ${ciStatus} (must be success)`);
    }

    // Check if iterations exceeded
    const iterationsExceeded = state.currentIteration >= state.maxIterations;
    if (iterationsExceeded && !qualityMet) {
      reasons.push(
        `Reached max iterations (${state.maxIterations}) without meeting quality threshold`
      );
    }

    // Check cost limit
    const costExceeded = state.totalCost >= this.config.maxCostPerPR;
    if (costExceeded) {
      reasons.push(`Cost exceeded limit: $${state.totalCost.toFixed(2)} / $${this.config.maxCostPerPR.toFixed(2)}`);
    }

    // Check convergence - is it still improving?
    const isStagnant = state.convergenceStatus === 'stagnant';
    if (isStagnant && !qualityMet) {
      reasons.push('No improvement detected in recent iterations');
    }

    // Determine if merge is possible
    const canAutoMerge =
      this.config.autoMergeEnabled &&
      qualityMet &&
      state.qualityScore >= this.config.autoMergeThreshold &&
      blockingIssues.length === 0 &&
      ciStatus === 'success' &&
      !costExceeded;

    // Check if human approval is required
    const requiresHumanApproval = this.requiresHumanApproval(
      state,
      latestReview,
      qualityMet,
      ciStatus
    );

    // Make final decision
    const shouldMerge =
      canAutoMerge ||
      (qualityMet && blockingIssues.length === 0 && ciStatus === 'success' && !requiresHumanApproval);

    const decision: MergeDecision = {
      shouldMerge,
      reason: shouldMerge
        ? this.generateApprovalMessage(state, canAutoMerge)
        : this.generateBlockingMessage(reasons),
      requiresHumanApproval: requiresHumanApproval || !canAutoMerge,
      blockingIssues,
      qualityScore: state.qualityScore,
      iterationsUsed: state.currentIteration,
      totalCost: state.totalCost,
    };

    return decision;
  }

  /**
   * Check if human approval is required
   */
  private requiresHumanApproval(
    state: IterationState,
    review: CodexReviewResult,
    qualityMet: boolean,
    ciStatus: string
  ): boolean {
    const rules = this.config.requireHumanApprovalIf;

    // Quality below threshold
    if (rules.qualityScoreBelow && state.qualityScore < rules.qualityScoreBelow) {
      return true;
    }

    // Security issues found
    if (rules.securityIssuesFound && review.securityIssues.length > 0) {
      return true;
    }

    // Iterations exceeded
    if (rules.iterationsExceeded && state.currentIteration >= state.maxIterations) {
      return true;
    }

    // Cost exceeded
    if (rules.costExceeded && state.totalCost >= this.config.maxCostPerPR) {
      return true;
    }

    // Tests failing
    if (rules.tests_failing && ciStatus !== 'success') {
      return true;
    }

    return false;
  }

  /**
   * Generate approval message
   */
  private generateApprovalMessage(state: IterationState, autoMerge: boolean): string {
    const parts = [
      `Quality threshold met: ${(state.qualityScore * 100).toFixed(1)}%`,
      `Iterations used: ${state.currentIteration}/${state.maxIterations}`,
      `Total cost: $${state.totalCost.toFixed(2)}`,
      'All checks passed ✅',
    ];

    if (autoMerge) {
      parts.push('**Auto-merge enabled** - PR will be merged automatically');
    } else {
      parts.push('**Ready for your review** - Manual merge approval required');
    }

    return parts.join(' | ');
  }

  /**
   * Generate blocking message
   */
  private generateBlockingMessage(reasons: string[]): string {
    return `**Cannot merge yet**:\n\n${reasons.map((r) => `- ${r}`).join('\n')}`;
  }

  /**
   * Get recommended action
   */
  getRecommendedAction(decision: MergeDecision, state: IterationState): string {
    if (decision.shouldMerge && !decision.requiresHumanApproval) {
      return '✅ **Action**: Auto-merging (quality gates passed)';
    }

    if (decision.shouldMerge && decision.requiresHumanApproval) {
      return '👀 **Action**: Ready for your review and manual merge';
    }

    if (state.currentIteration >= state.maxIterations) {
      return '⚠️ **Action**: Max iterations reached - manual review required';
    }

    if (state.convergenceStatus === 'stagnant') {
      return '⚠️ **Action**: Not improving - consider manual fixes or closing PR';
    }

    if (decision.blockingIssues.length > 0) {
      return `🔴 **Action**: Fix ${decision.blockingIssues.length} blocking issue(s) before merge`;
    }

    return '🔄 **Action**: Continue iterations (quality not met yet)';
  }

  /**
   * Estimate iterations needed to meet threshold
   */
  estimateIterationsNeeded(
    currentScore: number,
    targetScore: number,
    history: Array<{ qualityDelta: number }>
  ): number {
    if (currentScore >= targetScore) {
      return 0;
    }

    // Calculate average quality improvement per iteration
    const averageImprovement =
      history.length > 0
        ? history.reduce((sum, r) => sum + r.qualityDelta, 0) / history.length
        : 0.1; // Default 10% improvement per iteration

    if (averageImprovement <= 0) {
      return -1; // Not improving, can't estimate
    }

    const neededImprovement = targetScore - currentScore;
    const estimatedIterations = Math.ceil(neededImprovement / averageImprovement);

    return estimatedIterations;
  }
}
