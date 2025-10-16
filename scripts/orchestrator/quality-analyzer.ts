/**
 * Quality Analyzer - Calculates code quality scores
 * Analyzes Codex reviews and generates quality metrics
 */

import type { CodexReviewResult, QualityMetrics, Issue } from '../types.js';

export class QualityAnalyzer {
  /**
   * Calculate overall quality score from Codex review
   */
  calculateQualityScore(review: CodexReviewResult): number {
    if (review.status === 'error') {
      return 0;
    }

    // Start with Codex's overall quality assessment
    let score = review.overallQuality;

    // Apply penalties for issues
    const penalties = this.calculatePenalties(review);
    score = Math.max(0, score - penalties);

    // Ensure score is between 0 and 1
    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calculate detailed quality metrics
   */
  calculateMetrics(review: CodexReviewResult): QualityMetrics {
    const issues = review.issuesFound;

    // Count issues by type
    const securityIssues = issues.filter((i) => i.type === 'security');
    const performanceIssues = issues.filter((i) => i.type === 'performance');
    const typeSafetyIssues = issues.filter((i) => i.type === 'type_safety');
    const codeQualityIssues = issues.filter((i) => i.type === 'code_quality');
    const bestPracticeIssues = issues.filter((i) => i.type === 'best_practice');

    // Calculate scores for each category (1.0 = perfect, 0.0 = terrible)
    const security = this.calculateCategoryScore(securityIssues);
    const performance = this.calculateCategoryScore(performanceIssues);
    const typeSafety = this.calculateCategoryScore(typeSafetyIssues);
    const codeQuality = this.calculateCategoryScore(codeQualityIssues);
    const bestPractices = this.calculateCategoryScore(bestPracticeIssues);

    // Overall is weighted average
    const overallScore =
      security * 0.25 + // Security is most important
      performance * 0.2 +
      typeSafety * 0.2 +
      codeQuality * 0.2 +
      bestPractices * 0.15;

    return {
      overallScore,
      codeQuality,
      security,
      performance,
      typeSafety,
      bestPractices,
    };
  }

  /**
   * Calculate quality improvement between iterations
   */
  calculateImprovement(previousScore: number, currentScore: number): number {
    return currentScore - previousScore;
  }

  /**
   * Determine if quality is improving
   */
  isImproving(history: Array<{ qualityScore: number }>): boolean {
    if (history.length < 2) {
      return true; // First iteration always counts as improving
    }

    // Check last 3 iterations for improvement trend
    const recentHistory = history.slice(-3);
    let improvementCount = 0;

    for (let i = 1; i < recentHistory.length; i++) {
      if (recentHistory[i].qualityScore > recentHistory[i - 1].qualityScore) {
        improvementCount++;
      }
    }

    // Consider improving if majority of recent iterations show improvement
    return improvementCount >= Math.ceil(recentHistory.length / 2);
  }

  /**
   * Check if quality meets threshold
   */
  meetsThreshold(score: number, threshold: number): boolean {
    return score >= threshold;
  }

  /**
   * Get human-readable quality grade
   */
  getQualityGrade(score: number): {
    grade: string;
    label: string;
    emoji: string;
  } {
    if (score >= 0.95) {
      return { grade: 'A+', label: 'Excellent', emoji: '🌟' };
    } else if (score >= 0.9) {
      return { grade: 'A', label: 'Great', emoji: '✨' };
    } else if (score >= 0.85) {
      return { grade: 'B+', label: 'Good', emoji: '👍' };
    } else if (score >= 0.8) {
      return { grade: 'B', label: 'Acceptable', emoji: '👌' };
    } else if (score >= 0.7) {
      return { grade: 'C', label: 'Needs Work', emoji: '⚠️' };
    } else if (score >= 0.6) {
      return { grade: 'D', label: 'Poor', emoji: '❌' };
    } else {
      return { grade: 'F', label: 'Failing', emoji: '🔴' };
    }
  }

  /**
   * Generate quality summary for PR comment
   */
  generateSummary(
    metrics: QualityMetrics,
    iteration: number,
    maxIterations: number
  ): string {
    const grade = this.getQualityGrade(metrics.overallScore);

    return `## Quality Assessment - Iteration ${iteration}/${maxIterations}

**Overall Score**: ${(metrics.overallScore * 100).toFixed(1)}% ${grade.emoji} (Grade: ${grade.grade} - ${grade.label})

### Category Scores
- 🔒 **Security**: ${(metrics.security * 100).toFixed(1)}%
- ⚡ **Performance**: ${(metrics.performance * 100).toFixed(1)}%
- 🔤 **Type Safety**: ${(metrics.typeSafety * 100).toFixed(1)}%
- 📝 **Code Quality**: ${(metrics.codeQuality * 100).toFixed(1)}%
- ✅ **Best Practices**: ${(metrics.bestPractices * 100).toFixed(1)}%

---`;
  }

  private calculatePenalties(review: CodexReviewResult): number {
    let totalPenalty = 0;

    // Penalty based on number and severity of issues
    review.issuesFound.forEach((issue) => {
      if (issue.severity === 'error') {
        totalPenalty += 0.1; // -10% per error
      } else if (issue.severity === 'warning') {
        totalPenalty += 0.05; // -5% per warning
      } else {
        totalPenalty += 0.02; // -2% per info
      }
    });

    // Extra penalty for security issues
    review.securityIssues.forEach((issue) => {
      if (issue.severity === 'critical') {
        totalPenalty += 0.2; // -20% for critical security issues
      } else if (issue.severity === 'high') {
        totalPenalty += 0.15; // -15% for high security issues
      }
    });

    // Extra penalty for performance issues
    review.performanceIssues.forEach((issue) => {
      if (issue.impact === 'high') {
        totalPenalty += 0.1; // -10% for high-impact performance issues
      }
    });

    return totalPenalty;
  }

  private calculateCategoryScore(issues: Issue[]): number {
    if (issues.length === 0) {
      return 1.0; // Perfect score if no issues
    }

    let penalty = 0;

    issues.forEach((issue) => {
      if (issue.severity === 'error') {
        penalty += 0.15;
      } else if (issue.severity === 'warning') {
        penalty += 0.08;
      } else {
        penalty += 0.03;
      }
    });

    return Math.max(0, 1.0 - penalty);
  }
}
