/**
 * Quality Gates - Enforces quality thresholds before merge
 * Ensures code meets minimum standards before allowing merge
 */

import type { CodexReviewResult, QualityMetrics, MakerCheckerConfig } from '../types.js';

export class QualityGates {
  constructor(private config: MakerCheckerConfig) {}

  /**
   * Check if code passes all quality gates
   */
  checkGates(
    review: CodexReviewResult,
    metrics: QualityMetrics,
    ciStatus: 'success' | 'pending' | 'failure' | 'error'
  ): {
    passed: boolean;
    failedGates: string[];
    warnings: string[];
  } {
    const failedGates: string[] = [];
    const warnings: string[] = [];

    // Gate 1: Overall quality threshold
    if (metrics.overallScore < this.config.qualityThreshold) {
      failedGates.push(
        `Overall quality ${(metrics.overallScore * 100).toFixed(1)}% below threshold ${(this.config.qualityThreshold * 100).toFixed(1)}%`
      );
    }

    // Gate 2: Security - No critical security issues
    const criticalSecurity = review.securityIssues.filter(
      (issue) => issue.severity === 'critical' || issue.severity === 'high'
    );
    if (criticalSecurity.length > 0) {
      failedGates.push(`${criticalSecurity.length} critical/high security issue(s) found`);
    }

    // Gate 3: Security score minimum
    if (metrics.security < 0.7) {
      failedGates.push(`Security score ${(metrics.security * 100).toFixed(1)}% below minimum 70%`);
    }

    // Gate 4: No error-level issues
    const errorIssues = review.issuesFound.filter((issue) => issue.severity === 'error');
    if (errorIssues.length > 0) {
      failedGates.push(`${errorIssues.length} error-level issue(s) must be fixed`);
    }

    // Gate 5: CI must pass
    if (ciStatus !== 'success') {
      failedGates.push(`CI status is '${ciStatus}', must be 'success'`);
    }

    // Warnings (not blocking, but should be addressed)

    // Performance below 70%
    if (metrics.performance < 0.7) {
      warnings.push(`Performance score ${(metrics.performance * 100).toFixed(1)}% is below recommended 70%`);
    }

    // Type safety below 80%
    if (metrics.typeSafety < 0.8) {
      warnings.push(`Type safety ${(metrics.typeSafety * 100).toFixed(1)}% is below recommended 80%`);
    }

    // Code quality below 75%
    if (metrics.codeQuality < 0.75) {
      warnings.push(`Code quality ${(metrics.codeQuality * 100).toFixed(1)}% is below recommended 75%`);
    }

    // Many warning-level issues
    const warningIssues = review.issuesFound.filter((issue) => issue.severity === 'warning');
    if (warningIssues.length > 10) {
      warnings.push(`${warningIssues.length} warning-level issues found (recommended to address)`);
    }

    return {
      passed: failedGates.length === 0,
      failedGates,
      warnings,
    };
  }

  /**
   * Generate quality gate report
   */
  generateReport(
    gateCheck: { passed: boolean; failedGates: string[]; warnings: string[] }
  ): string {
    let report = '## Quality Gates\n\n';

    if (gateCheck.passed) {
      report += '✅ **All quality gates passed!**\n\n';
    } else {
      report += '🔴 **Quality gates FAILED**\n\n';
      report += '### Blocking Issues\n';
      gateCheck.failedGates.forEach((gate, i) => {
        report += `${i + 1}. ❌ ${gate}\n`;
      });
      report += '\n';
    }

    if (gateCheck.warnings.length > 0) {
      report += '### Warnings (Non-blocking)\n';
      gateCheck.warnings.forEach((warning, i) => {
        report += `${i + 1}. ⚠️ ${warning}\n`;
      });
      report += '\n';
    }

    return report;
  }

  /**
   * Check if auto-merge is safe
   */
  isAutoMergeSafe(
    review: CodexReviewResult,
    metrics: QualityMetrics,
    ciStatus: string
  ): boolean {
    // Stricter requirements for auto-merge
    const autoMergeThreshold = this.config.autoMergeThreshold;

    return (
      metrics.overallScore >= autoMergeThreshold &&
      metrics.security >= 0.9 && // Higher security requirement
      review.securityIssues.length === 0 &&
      review.issuesFound.filter((i) => i.severity === 'error').length === 0 &&
      ciStatus === 'success'
    );
  }

  /**
   * Estimate effort needed to pass gates
   */
  estimateEffortToPass(
    metrics: QualityMetrics,
    review: CodexReviewResult
  ): {
    effort: 'low' | 'medium' | 'high';
    description: string;
  } {
    const overallGap = this.config.qualityThreshold - metrics.overallScore;
    const errorCount = review.issuesFound.filter((i) => i.severity === 'error').length;
    const securityCount = review.securityIssues.length;

    // High effort scenarios
    if (overallGap > 0.2 || errorCount > 10 || securityCount > 3) {
      return {
        effort: 'high',
        description: 'Significant work needed - many issues or large quality gap',
      };
    }

    // Medium effort scenarios
    if (overallGap > 0.1 || errorCount > 5 || securityCount > 1) {
      return {
        effort: 'medium',
        description: 'Moderate work needed - several issues to address',
      };
    }

    // Low effort scenarios
    return {
      effort: 'low',
      description: 'Minor fixes needed - close to passing all gates',
    };
  }
}
