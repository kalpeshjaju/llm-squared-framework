/**
 * Security Checker - Validates no security issues before merge
 * Blocks merges if critical security vulnerabilities are present
 */

import type { CodexReviewResult, SecurityIssue, Issue } from '../types.js';

export class SecurityChecker {
  /**
   * Check for security issues
   */
  checkSecurity(review: CodexReviewResult): {
    hasCriticalIssues: boolean;
    hasHighIssues: boolean;
    criticalIssues: SecurityIssue[];
    highIssues: SecurityIssue[];
    allSecurityIssues: SecurityIssue[];
    blockingCount: number;
  } {
    const criticalIssues = review.securityIssues.filter((i) => i.severity === 'critical');
    const highIssues = review.securityIssues.filter((i) => i.severity === 'high');

    return {
      hasCriticalIssues: criticalIssues.length > 0,
      hasHighIssues: highIssues.length > 0,
      criticalIssues,
      highIssues,
      allSecurityIssues: review.securityIssues,
      blockingCount: criticalIssues.length + highIssues.length,
    };
  }

  /**
   * Determine if merge should be blocked
   */
  shouldBlockMerge(review: CodexReviewResult): boolean {
    const check = this.checkSecurity(review);
    return check.hasCriticalIssues || check.hasHighIssues;
  }

  /**
   * Generate security report
   */
  generateSecurityReport(review: CodexReviewResult): string {
    const check = this.checkSecurity(review);

    if (check.allSecurityIssues.length === 0) {
      return '## 🔒 Security Check\n\n✅ **No security issues found**\n';
    }

    let report = '## 🔒 Security Check\n\n';

    if (check.blockingCount > 0) {
      report += `🔴 **BLOCKING**: ${check.blockingCount} critical/high security issue(s) must be fixed before merge\n\n`;
    }

    if (check.criticalIssues.length > 0) {
      report += '### Critical Issues (Must Fix Immediately)\n';
      check.criticalIssues.forEach((issue, i) => {
        report += `${i + 1}. **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
        report += `   - ${issue.description}\n`;
        report += `   - **Recommendation**: ${issue.recommendation}\n\n`;
      });
    }

    if (check.highIssues.length > 0) {
      report += '### High Priority Issues (Must Fix Before Merge)\n';
      check.highIssues.forEach((issue, i) => {
        report += `${i + 1}. **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
        report += `   - ${issue.description}\n`;
        report += `   - **Recommendation**: ${issue.recommendation}\n\n`;
      });
    }

    const mediumLowIssues = check.allSecurityIssues.filter(
      (i) => i.severity === 'medium' || i.severity === 'low'
    );

    if (mediumLowIssues.length > 0) {
      report += `### Other Security Issues (${mediumLowIssues.length})\n`;
      mediumLowIssues.forEach((issue, i) => {
        report += `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.type} in \`${issue.file}:${issue.line}\`\n`;
      });
      report += '\n';
    }

    return report;
  }

  /**
   * Get common security issue patterns
   */
  categorizeSecurityIssues(issues: SecurityIssue[]): {
    categories: Map<string, SecurityIssue[]>;
    summary: string;
  } {
    const categories = new Map<string, SecurityIssue[]>();

    // Common security categories
    const categoryPatterns: Record<string, string[]> = {
      'Authentication & Authorization': ['auth', 'permission', 'access control', 'jwt', 'token'],
      'Input Validation': ['injection', 'xss', 'input', 'sanitize', 'validate'],
      'Data Protection': ['encrypt', 'password', 'secret', 'credential', 'api key'],
      'Configuration': ['hardcoded', 'config', 'environment', 'cors', 'csrf'],
      'Dependencies': ['dependency', 'package', 'vulnerability', 'outdated'],
    };

    // Categorize issues
    for (const issue of issues) {
      let categorized = false;

      for (const [category, patterns] of Object.entries(categoryPatterns)) {
        const matchesPattern = patterns.some(
          (pattern) =>
            issue.type.toLowerCase().includes(pattern) ||
            issue.description.toLowerCase().includes(pattern)
        );

        if (matchesPattern) {
          if (!categories.has(category)) {
            categories.set(category, []);
          }
          categories.get(category)!.push(issue);
          categorized = true;
          break;
        }
      }

      if (!categorized) {
        if (!categories.has('Other')) {
          categories.set('Other', []);
        }
        categories.get('Other')!.push(issue);
      }
    }

    // Generate summary
    const summary = Array.from(categories.entries())
      .map(([category, issues]) => `${category}: ${issues.length}`)
      .join(', ');

    return { categories, summary };
  }

  /**
   * Check for common dangerous patterns
   */
  checkDangerousPatterns(code: string): {
    found: boolean;
    patterns: Array<{ pattern: string; risk: string; line?: number }>;
  } {
    const patterns: Array<{ pattern: string; risk: string; line?: number }> = [];

    const dangerousPatterns = [
      { regex: /eval\s*\(/g, risk: 'eval() can execute arbitrary code' },
      { regex: /exec\s*\(/g, risk: 'exec() can lead to command injection' },
      { regex: /innerHTML\s*=/g, risk: 'innerHTML can introduce XSS vulnerabilities' },
      { regex: /dangerouslySetInnerHTML/g, risk: 'Dangerous React pattern for XSS' },
      { regex: /\$\{.*\}/g, risk: 'Template literal injection risk' },
      { regex: /process\.env\.\w+/g, risk: 'Environment variable may contain secrets' },
      { regex: /password\s*=\s*['"]/gi, risk: 'Hardcoded password detected' },
      { regex: /api[_-]?key\s*=\s*['"]/gi, risk: 'Hardcoded API key detected' },
    ];

    for (const { regex, risk } of dangerousPatterns) {
      const matches = code.matchAll(regex);
      for (const match of matches) {
        patterns.push({
          pattern: match[0],
          risk,
        });
      }
    }

    return {
      found: patterns.length > 0,
      patterns,
    };
  }
}
