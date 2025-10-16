/**
 * Iteration Limiter - Prevents infinite loops
 * Enforces maximum iteration counts and detects runaway processes
 */

import type { IterationState, MakerCheckerConfig } from '../types.js';

export class IterationLimiter {
  constructor(private config: MakerCheckerConfig) {}

  /**
   * Check if can start new iteration
   */
  canStartIteration(state: IterationState): {
    allowed: boolean;
    reason?: string;
  } {
    // Check max iterations
    if (state.currentIteration >= state.maxIterations) {
      return {
        allowed: false,
        reason: `Maximum iterations reached (${state.maxIterations})`,
      };
    }

    // Check if already in terminal state
    if (state.currentPhase === 'complete' || state.currentPhase === 'failed') {
      return {
        allowed: false,
        reason: `PR already in terminal state: ${state.currentPhase}`,
      };
    }

    // Check cost limit
    if (state.totalCost >= this.config.maxCostPerPR) {
      return {
        allowed: false,
        reason: `Cost limit exceeded: $${state.totalCost.toFixed(2)} / $${this.config.maxCostPerPR.toFixed(2)}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get iterations remaining
   */
  getIterationsRemaining(state: IterationState): number {
    return Math.max(0, state.maxIterations - state.currentIteration);
  }

  /**
   * Calculate iteration progress percentage
   */
  getProgressPercentage(state: IterationState): number {
    return (state.currentIteration / state.maxIterations) * 100;
  }

  /**
   * Estimate if will exceed iterations before meeting threshold
   */
  willLikelyExceedLimit(
    state: IterationState,
    currentQuality: number,
    targetQuality: number
  ): boolean {
    if (currentQuality >= targetQuality) {
      return false; // Already met threshold
    }

    // Calculate average improvement per iteration
    const history = state.history;
    if (history.length < 2) {
      return false; // Not enough data to estimate
    }

    const improvements = history
      .slice(1)
      .map((record, i) => {
        const prevQuality = history[i].codexReview?.overallQuality || 0;
        const currQuality = record.codexReview?.overallQuality || 0;
        return currQuality - prevQuality;
      })
      .filter((delta) => delta > 0); // Only count actual improvements

    if (improvements.length === 0) {
      return true; // No improvements detected
    }

    const avgImprovement = improvements.reduce((sum, val) => sum + val, 0) / improvements.length;
    const neededImprovement = targetQuality - currentQuality;
    const estimatedIterationsNeeded = Math.ceil(neededImprovement / avgImprovement);

    const iterationsRemaining = this.getIterationsRemaining(state);

    return estimatedIterationsNeeded > iterationsRemaining;
  }

  /**
   * Get recommendation based on iteration status
   */
  getRecommendation(
    state: IterationState,
    currentQuality: number,
    targetQuality: number
  ): string {
    const remaining = this.getIterationsRemaining(state);
    const progress = this.getProgressPercentage(state);

    if (remaining === 0) {
      return 'Max iterations reached. Consider manual review or increasing max_iterations.';
    }

    if (remaining <= 1) {
      if (currentQuality < targetQuality) {
        return 'Last iteration! Quality threshold not yet met. Consider manual fixes.';
      }
      return 'Last iteration available. Make it count!';
    }

    if (this.willLikelyExceedLimit(state, currentQuality, targetQuality)) {
      return `Warning: May not reach quality threshold (${(targetQuality * 100).toFixed(1)}%) with remaining ${remaining} iterations based on current improvement rate.`;
    }

    if (progress >= 75) {
      return `${remaining} iterations remaining. Push toward quality threshold.`;
    }

    return `${remaining} iterations remaining. Progress: ${progress.toFixed(0)}%`;
  }

  /**
   * Check for suspicious patterns (possible infinite loop indicators)
   */
  detectSuspiciousPatterns(state: IterationState): {
    suspicious: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Check for same issues repeating
    if (state.history.length >= 3) {
      const recentIssues = state.history.slice(-3).map((h) => h.issuesFound);

      // If issue count hasn't changed in last 3 iterations
      const allSame = recentIssues.every((count) => count === recentIssues[0]);
      if (allSame && recentIssues[0] > 0) {
        warnings.push('Same number of issues for 3+ iterations - possible stagnation');
      }
    }

    // Check for quality oscillation (going up and down)
    if (state.history.length >= 4) {
      const recentQuality = state.history
        .slice(-4)
        .map((h) => h.codexReview?.overallQuality || 0);

      let oscillations = 0;
      for (let i = 1; i < recentQuality.length - 1; i++) {
        const prev = recentQuality[i - 1];
        const curr = recentQuality[i];
        const next = recentQuality[i + 1];

        // Check if current is a peak or valley
        if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
          oscillations++;
        }
      }

      if (oscillations >= 2) {
        warnings.push('Quality score oscillating - fixes may be introducing new issues');
      }
    }

    // Check for rapid iterations (possible automated loop)
    if (state.history.length >= 5) {
      const recentTimestamps = state.history.slice(-5).map((h) => new Date(h.timestamp).getTime());

      const intervals = [];
      for (let i = 1; i < recentTimestamps.length; i++) {
        intervals.push(recentTimestamps[i] - recentTimestamps[i - 1]);
      }

      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;

      // If iterations are happening faster than 30 seconds on average
      if (avgInterval < 30000) {
        warnings.push('Iterations happening very rapidly - check for automation issues');
      }
    }

    return {
      suspicious: warnings.length > 0,
      warnings,
    };
  }
}
