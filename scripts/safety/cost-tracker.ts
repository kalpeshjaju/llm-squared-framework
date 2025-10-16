/**
 * Cost Tracker - Monitors API spending and enforces cost limits
 * Prevents runaway costs by tracking and limiting API usage
 */

import fs from 'fs';
import path from 'path';
import type { CostTracking, MakerCheckerConfig } from '../types.js';

export class CostTracker {
  private costDir: string;
  private config: MakerCheckerConfig;

  constructor(config: MakerCheckerConfig, costDir: string = '.maker-checker-costs') {
    this.config = config;
    this.costDir = costDir;
    this.ensureCostDir();
  }

  private ensureCostDir(): void {
    if (!fs.existsSync(this.costDir)) {
      fs.mkdirSync(this.costDir, { recursive: true });
    }
  }

  /**
   * Record cost for a PR
   */
  recordCost(prNumber: number, repository: string, claudeCost: number, codexCost: number): void {
    const tracking: CostTracking = {
      prNumber,
      repository,
      totalCost: claudeCost + codexCost,
      claudeCost,
      codexCost,
      iterations: 1,
      timestamp: new Date().toISOString(),
    };

    // Append to daily log
    this.appendToDailyLog(tracking);

    // Update PR-specific tracking
    this.updatePRTracking(tracking);
  }

  /**
   * Check if PR has exceeded cost limit
   */
  hasExceededPRLimit(prNumber: number, repository: string): boolean {
    const tracking = this.getPRTracking(prNumber, repository);
    if (!tracking) {
      return false;
    }

    return tracking.totalCost >= this.config.maxCostPerPR;
  }

  /**
   * Check if monthly cost limit is approaching or exceeded
   */
  checkMonthlyLimit(): {
    exceeded: boolean;
    warning: boolean;
    totalCost: number;
    limit: number;
    percentage: number;
  } {
    const monthlyCost = this.getMonthlyCost();
    const percentage = (monthlyCost / this.config.monthlyCostCap) * 100;

    return {
      exceeded: monthlyCost >= this.config.monthlyCostCap,
      warning: percentage >= 75, // Warning at 75%
      totalCost: monthlyCost,
      limit: this.config.monthlyCostCap,
      percentage,
    };
  }

  /**
   * Get total cost for a PR
   */
  getPRCost(prNumber: number, repository: string): number {
    const tracking = this.getPRTracking(prNumber, repository);
    return tracking?.totalCost || 0;
  }

  /**
   * Get monthly cost
   */
  getMonthlyCost(): number {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const logFile = path.join(this.costDir, `${currentMonth}.log`);

    if (!fs.existsSync(logFile)) {
      return 0;
    }

    const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
    let total = 0;

    for (const line of lines) {
      try {
        const tracking = JSON.parse(line);
        total += tracking.totalCost;
      } catch (error) {
        // Skip invalid lines
      }
    }

    return total;
  }

  /**
   * Generate cost report
   */
  generateReport(): string {
    const monthlyCost = this.getMonthlyCost();
    const monthlyLimit = this.checkMonthlyLimit();

    const report = `# Cost Report

## Monthly Summary
- **Total Spent**: $${monthlyCost.toFixed(2)}
- **Monthly Cap**: $${this.config.monthlyCostCap.toFixed(2)}
- **Usage**: ${monthlyLimit.percentage.toFixed(1)}%
- **Status**: ${monthlyLimit.exceeded ? '🔴 EXCEEDED' : monthlyLimit.warning ? '⚠️ WARNING' : '✅ OK'}

## Per-PR Breakdown
${this.getPRBreakdown()}

## Recommendations
${this.getRecommendations(monthlyLimit)}
`;

    return report;
  }

  private appendToDailyLog(tracking: CostTracking): void {
    const date = new Date(tracking.timestamp);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const logFile = path.join(this.costDir, `${monthKey}.log`);

    const line = JSON.stringify(tracking) + '\n';
    fs.appendFileSync(logFile, line, 'utf-8');
  }

  private updatePRTracking(tracking: CostTracking): void {
    const filePath = this.getPRTrackingPath(tracking.prNumber, tracking.repository);

    let existing: CostTracking | null = null;
    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (error) {
        // File corrupted, start fresh
      }
    }

    if (existing) {
      existing.totalCost += tracking.totalCost;
      existing.claudeCost += tracking.claudeCost;
      existing.codexCost += tracking.codexCost;
      existing.iterations += 1;
      existing.timestamp = tracking.timestamp;
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(tracking, null, 2), 'utf-8');
    }
  }

  private getPRTracking(prNumber: number, repository: string): CostTracking | null {
    const filePath = this.getPRTrackingPath(prNumber, repository);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
      return null;
    }
  }

  private getPRTrackingPath(prNumber: number, repository: string): string {
    const safeRepo = repository.replace(/[^a-zA-Z0-9-]/g, '_');
    return path.join(this.costDir, `pr_${safeRepo}_${prNumber}.json`);
  }

  private getPRBreakdown(): string {
    const files = fs.readdirSync(this.costDir).filter((f) => f.startsWith('pr_'));

    if (files.length === 0) {
      return '_No PRs tracked this month_';
    }

    const breakdown = files
      .map((file) => {
        try {
          const tracking = JSON.parse(fs.readFileSync(path.join(this.costDir, file), 'utf-8'));
          return `- PR #${tracking.prNumber} (${tracking.repository}): $${tracking.totalCost.toFixed(2)} (${tracking.iterations} iterations)`;
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .join('\n');

    return breakdown;
  }

  private getRecommendations(monthlyLimit: any): string {
    const recs: string[] = [];

    if (monthlyLimit.exceeded) {
      recs.push('🔴 **URGENT**: Monthly cost cap exceeded. Review configuration and consider pausing automation.');
    } else if (monthlyLimit.warning) {
      recs.push('⚠️ **WARNING**: Approaching monthly cost cap. Monitor closely.');
    }

    const avgPerPR = this.getAverageCostPerPR();
    if (avgPerPR > this.config.maxCostPerPR * 0.8) {
      recs.push(`⚠️ Average cost per PR ($${avgPerPR.toFixed(2)}) is high. Consider reducing max_iterations.`);
    }

    if (recs.length === 0) {
      recs.push('✅ All cost metrics look good!');
    }

    return recs.join('\n');
  }

  private getAverageCostPerPR(): number {
    const files = fs.readdirSync(this.costDir).filter((f) => f.startsWith('pr_'));

    if (files.length === 0) {
      return 0;
    }

    let total = 0;
    let count = 0;

    for (const file of files) {
      try {
        const tracking = JSON.parse(fs.readFileSync(path.join(this.costDir, file), 'utf-8'));
        total += tracking.totalCost;
        count++;
      } catch (error) {
        // Skip invalid files
      }
    }

    return count > 0 ? total / count : 0;
  }
}
