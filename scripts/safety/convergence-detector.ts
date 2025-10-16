/**
 * Convergence Detector - Detects when iterations stop improving
 * Prevents wasting iterations on stagnant code quality
 */

import type { IterationState, IterationRecord } from '../types.js';

export class ConvergenceDetector {
  private stagnationThreshold: number;

  constructor(stagnationThreshold: number = 3) {
    this.stagnationThreshold = stagnationThreshold;
  }

  /**
   * Detect if quality is converging (improving toward goal)
   */
  detectConvergence(state: IterationState): {
    status: 'improving' | 'stagnant' | 'regressing';
    confidence: number;
    reason: string;
  } {
    if (state.history.length < 2) {
      return {
        status: 'improving',
        confidence: 0.5,
        reason: 'Not enough iterations to determine trend',
      };
    }

    const recentHistory = state.history.slice(-this.stagnationThreshold);

    // Check quality trend
    const qualityTrend = this.analyzeQualityTrend(recentHistory);

    // Check issue trend
    const issueTrend = this.analyzeIssueTrend(recentHistory);

    // Combine signals
    if (qualityTrend.improving && issueTrend.decreasing) {
      return {
        status: 'improving',
        confidence: 0.9,
        reason: 'Quality increasing and issues decreasing',
      };
    }

    if (qualityTrend.stagnant && issueTrend.stagnant) {
      return {
        status: 'stagnant',
        confidence: 0.85,
        reason: 'No improvement in quality or issue count for multiple iterations',
      };
    }

    if (qualityTrend.regressing || issueTrend.increasing) {
      return {
        status: 'regressing',
        confidence: 0.8,
        reason: 'Quality decreasing or new issues being introduced',
      };
    }

    // Mixed signals - look at overall trend
    const overallTrend = this.calculateOverallTrend(recentHistory);

    if (overallTrend > 0.05) {
      return {
        status: 'improving',
        confidence: 0.6,
        reason: 'Slow but steady improvement',
      };
    }

    if (Math.abs(overallTrend) <= 0.05) {
      return {
        status: 'stagnant',
        confidence: 0.7,
        reason: 'Minimal change in recent iterations',
      };
    }

    return {
      status: 'regressing',
      confidence: 0.7,
      reason: 'Overall negative trend',
    };
  }

  /**
   * Predict if will reach threshold in remaining iterations
   */
  predictConvergence(
    state: IterationState,
    targetQuality: number
  ): {
    willReach: boolean;
    estimatedIterations: number;
    confidence: number;
  } {
    if (state.qualityScore >= targetQuality) {
      return {
        willReach: true,
        estimatedIterations: 0,
        confidence: 1.0,
      };
    }

    if (state.history.length < 2) {
      return {
        willReach: true,
        estimatedIterations: state.maxIterations - state.currentIteration,
        confidence: 0.3,
      };
    }

    // Calculate average improvement rate
    const improvements = [];
    for (let i = 1; i < state.history.length; i++) {
      const prevQuality = state.history[i - 1].codexReview?.overallQuality || 0;
      const currQuality = state.history[i].codexReview?.overallQuality || 0;
      improvements.push(currQuality - prevQuality);
    }

    const avgImprovement =
      improvements.reduce((sum, val) => sum + val, 0) / improvements.length;

    if (avgImprovement <= 0) {
      return {
        willReach: false,
        estimatedIterations: -1,
        confidence: 0.9,
      };
    }

    const neededImprovement = targetQuality - state.qualityScore;
    const estimatedIterations = Math.ceil(neededImprovement / avgImprovement);

    const iterationsRemaining = state.maxIterations - state.currentIteration;
    const willReach = estimatedIterations <= iterationsRemaining;

    // Calculate confidence based on consistency of improvements
    const improvementVariance = this.calculateVariance(improvements);
    const confidence = Math.max(0.4, 1.0 - improvementVariance);

    return {
      willReach,
      estimatedIterations,
      confidence,
    };
  }

  /**
   * Generate convergence report
   */
  generateReport(state: IterationState, targetQuality: number): string {
    const detection = this.detectConvergence(state);
    const prediction = this.predictConvergence(state, targetQuality);

    let report = '## 📈 Convergence Analysis\n\n';

    // Current status
    report += `**Status**: `;
    if (detection.status === 'improving') {
      report += '✅ Improving';
    } else if (detection.status === 'stagnant') {
      report += '⚠️ Stagnant';
    } else {
      report += '🔴 Regressing';
    }
    report += ` (${(detection.confidence * 100).toFixed(0)}% confidence)\n`;
    report += `**Reason**: ${detection.reason}\n\n`;

    // Prediction
    report += `**Prediction**: `;
    if (prediction.willReach) {
      report += `✅ Will likely reach ${(targetQuality * 100).toFixed(1)}% quality threshold`;
      if (prediction.estimatedIterations > 0) {
        report += ` in ~${prediction.estimatedIterations} more iteration(s)`;
      }
    } else {
      report += `⚠️ Unlikely to reach ${(targetQuality * 100).toFixed(1)}% with remaining iterations`;
    }
    report += `\n`;

    // Quality trend visualization
    report += '\n**Quality Trend**:\n';
    report += this.generateTrendVisualization(state);

    return report;
  }

  private analyzeQualityTrend(history: IterationRecord[]): {
    improving: boolean;
    stagnant: boolean;
    regressing: boolean;
  } {
    const qualities = history.map((h) => h.codexReview?.overallQuality || 0);

    let improvingCount = 0;
    let regressingCount = 0;
    let sameCount = 0;

    for (let i = 1; i < qualities.length; i++) {
      const delta = qualities[i] - qualities[i - 1];
      if (delta > 0.02) improvingCount++; // Improving by >2%
      else if (delta < -0.02) regressingCount++; // Regressing by >2%
      else sameCount++; // Roughly the same
    }

    return {
      improving: improvingCount > regressingCount && improvingCount > 0,
      stagnant: sameCount >= qualities.length - 1,
      regressing: regressingCount > improvingCount,
    };
  }

  private analyzeIssueTrend(history: IterationRecord[]): {
    decreasing: boolean;
    stagnant: boolean;
    increasing: boolean;
  } {
    const issueCounts = history.map((h) => h.issuesFound);

    let decreasingCount = 0;
    let increasingCount = 0;
    let sameCount = 0;

    for (let i = 1; i < issueCounts.length; i++) {
      if (issueCounts[i] < issueCounts[i - 1]) decreasingCount++;
      else if (issueCounts[i] > issueCounts[i - 1]) increasingCount++;
      else sameCount++;
    }

    return {
      decreasing: decreasingCount > increasingCount,
      stagnant: sameCount >= issueCounts.length - 1,
      increasing: increasingCount > decreasingCount,
    };
  }

  private calculateOverallTrend(history: IterationRecord[]): number {
    if (history.length < 2) return 0;

    const firstQuality = history[0].codexReview?.overallQuality || 0;
    const lastQuality = history[history.length - 1].codexReview?.overallQuality || 0;

    return (lastQuality - firstQuality) / history.length; // Average improvement per iteration
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

    return variance;
  }

  private generateTrendVisualization(state: IterationState): string {
    const history = state.history.slice(-5); // Last 5 iterations

    if (history.length === 0) {
      return '_No data available_\n';
    }

    let viz = '```\n';
    const maxQuality = Math.max(...history.map((h) => h.codexReview?.overallQuality || 0));

    history.forEach((record, i) => {
      const quality = record.codexReview?.overallQuality || 0;
      const barLength = Math.round((quality / maxQuality) * 20);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      viz += `Iter ${record.iteration}: ${bar} ${(quality * 100).toFixed(1)}%\n`;
    });

    viz += '```\n';
    return viz;
  }
}
