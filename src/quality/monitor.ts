/**
 * Quality Monitor
 * Tracks LLM feature quality metrics over time and triggers alerts
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { QualityMetrics, QualityAlert } from '../types/index.js';

export interface MonitorConfig {
  storagePath: string;
  alertThresholds: {
    accuracyDrop: number; // Alert if accuracy drops by this much (0-1)
    costIncrease: number; // Alert if cost increases by this percentage
    latencyIncrease: number; // Alert if latency increases by this percentage
    errorRateIncrease: number; // Alert if error rate increases by this much (0-1)
  };
}

export interface MetricsHistory {
  llmFeatureId: string;
  metrics: QualityMetrics[];
  alerts: QualityAlert[];
}

export class QualityMonitor {
  private config: MonitorConfig;
  private history: Map<string, MetricsHistory> = new Map();

  constructor(config: MonitorConfig) {
    this.config = config;
  }

  /**
   * Load metrics history from storage
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.config.storagePath, 'utf-8');
      const data = JSON.parse(content) as { history: MetricsHistory[] };

      this.history.clear();
      for (const item of data.history) {
        this.history.set(item.llmFeatureId, item);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.history.clear();
      } else {
        throw new Error(
          `Failed to load metrics history from ${this.config.storagePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Save metrics history to storage
   */
  async save(): Promise<void> {
    const data = {
      history: Array.from(this.history.values()),
    };

    try {
      await mkdir(dirname(this.config.storagePath), { recursive: true });
      await writeFile(
        this.config.storagePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new Error(
        `Failed to save metrics history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Record new metrics
   */
  async recordMetrics(metrics: QualityMetrics): Promise<QualityAlert[]> {
    const featureId = metrics.llmFeatureId;

    // Get or create history for this feature
    let history = this.history.get(featureId);
    if (!history) {
      history = {
        llmFeatureId: featureId,
        metrics: [],
        alerts: [],
      };
      this.history.set(featureId, history);
    }

    // Add new metrics
    history.metrics.push(metrics);

    // Check for alerts
    const alerts = await this.checkForAlerts(featureId, metrics);

    // Add alerts to history
    history.alerts.push(...alerts);

    // Save
    await this.save();

    return alerts;
  }

  /**
   * Check for quality degradation and generate alerts
   */
  private async checkForAlerts(
    featureId: string,
    currentMetrics: QualityMetrics
  ): Promise<QualityAlert[]> {
    const history = this.history.get(featureId);
    if (!history || history.metrics.length < 2) {
      return []; // Need at least 2 data points for comparison
    }

    // Get baseline (average of previous 5 data points, or all if less)
    const previousMetrics = history.metrics.slice(-6, -1); // Exclude current
    const baseline = this.calculateBaseline(previousMetrics);

    const alerts: QualityAlert[] = [];

    // Check accuracy drop
    if (
      baseline.accuracy - currentMetrics.metrics.accuracy >
      this.config.alertThresholds.accuracyDrop
    ) {
      alerts.push({
        id: this.generateAlertId(),
        timestamp: new Date().toISOString(),
        severity: 'high',
        type: 'quality_degradation',
        message: `Accuracy dropped from ${(baseline.accuracy * 100).toFixed(1)}% to ${(currentMetrics.metrics.accuracy * 100).toFixed(1)}%`,
        currentValue: currentMetrics.metrics.accuracy,
        threshold: baseline.accuracy - this.config.alertThresholds.accuracyDrop,
        recommendations: [
          'Review recent prompt changes',
          'Check if input distribution has changed',
          'Run evaluation tests to identify regression',
        ],
      });
    }

    // Check cost increase
    const costIncreasePercent =
      ((currentMetrics.metrics.avgCost - baseline.avgCost) /
        baseline.avgCost) *
      100;
    if (costIncreasePercent > this.config.alertThresholds.costIncrease) {
      alerts.push({
        id: this.generateAlertId(),
        timestamp: new Date().toISOString(),
        severity: 'medium',
        type: 'cost_spike',
        message: `Cost increased by ${costIncreasePercent.toFixed(1)}%`,
        currentValue: currentMetrics.metrics.avgCost,
        threshold: baseline.avgCost * (1 + this.config.alertThresholds.costIncrease / 100),
        recommendations: [
          'Review recent changes that might increase token usage',
          'Consider caching frequently requested outputs',
          'Optimize prompts for token efficiency',
        ],
      });
    }

    // Check latency increase
    const latencyIncreasePercent =
      ((currentMetrics.metrics.avgResponseTime - baseline.avgResponseTime) /
        baseline.avgResponseTime) *
      100;
    if (
      latencyIncreasePercent > this.config.alertThresholds.latencyIncrease
    ) {
      alerts.push({
        id: this.generateAlertId(),
        timestamp: new Date().toISOString(),
        severity: 'medium',
        type: 'latency_increase',
        message: `Response time increased by ${latencyIncreasePercent.toFixed(1)}%`,
        currentValue: currentMetrics.metrics.avgResponseTime,
        threshold: baseline.avgResponseTime * (1 + this.config.alertThresholds.latencyIncrease / 100),
        recommendations: [
          'Check API status and performance',
          'Review prompt complexity',
          'Consider using faster models for non-critical tasks',
        ],
      });
    }

    // Check error rate increase
    if (
      currentMetrics.metrics.errorRate - baseline.errorRate >
      this.config.alertThresholds.errorRateIncrease
    ) {
      alerts.push({
        id: this.generateAlertId(),
        timestamp: new Date().toISOString(),
        severity: 'critical',
        type: 'error_rate_increase',
        message: `Error rate increased from ${(baseline.errorRate * 100).toFixed(1)}% to ${(currentMetrics.metrics.errorRate * 100).toFixed(1)}%`,
        currentValue: currentMetrics.metrics.errorRate,
        threshold: baseline.errorRate + this.config.alertThresholds.errorRateIncrease,
        recommendations: [
          'Check error logs for patterns',
          'Verify API connectivity',
          'Review recent code changes',
          'Add fallback strategies',
        ],
      });
    }

    return alerts;
  }

  /**
   * Calculate baseline from previous metrics
   */
  private calculateBaseline(metrics: QualityMetrics[]): QualityMetrics['metrics'] {
    if (metrics.length === 0) {
      throw new Error('No metrics provided for baseline calculation');
    }

    const sum = metrics.reduce(
      (acc, m) => ({
        accuracy: acc.accuracy + m.metrics.accuracy,
        precision: acc.precision + m.metrics.precision,
        recall: acc.recall + m.metrics.recall,
        f1Score: acc.f1Score + m.metrics.f1Score,
        avgResponseTime: acc.avgResponseTime + m.metrics.avgResponseTime,
        avgTokens: acc.avgTokens + m.metrics.avgTokens,
        avgCost: acc.avgCost + m.metrics.avgCost,
        errorRate: acc.errorRate + m.metrics.errorRate,
      }),
      {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        avgResponseTime: 0,
        avgTokens: 0,
        avgCost: 0,
        errorRate: 0,
      }
    );

    const count = metrics.length;

    return {
      accuracy: sum.accuracy / count,
      precision: sum.precision / count,
      recall: sum.recall / count,
      f1Score: sum.f1Score / count,
      avgResponseTime: sum.avgResponseTime / count,
      avgTokens: sum.avgTokens / count,
      avgCost: sum.avgCost / count,
      errorRate: sum.errorRate / count,
    };
  }

  /**
   * Get metrics for a feature
   */
  getMetrics(
    featureId: string,
    period?: '1h' | '1d' | '7d' | '30d'
  ): QualityMetrics[] {
    const history = this.history.get(featureId);
    if (!history) return [];

    if (!period) {
      return history.metrics;
    }

    // Filter by period
    const now = new Date();
    const cutoff = this.getCutoffDate(now, period);

    return history.metrics.filter(
      (m) => new Date(m.timestamp) >= cutoff
    );
  }

  /**
   * Get alerts for a feature
   */
  getAlerts(
    featureId: string,
    severity?: QualityAlert['severity']
  ): QualityAlert[] {
    const history = this.history.get(featureId);
    if (!history) return [];

    if (!severity) {
      return history.alerts;
    }

    return history.alerts.filter((a) => a.severity === severity);
  }

  /**
   * Get all active alerts (from last 24 hours)
   */
  getActiveAlerts(): QualityAlert[] {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const allAlerts: QualityAlert[] = [];

    for (const history of this.history.values()) {
      const recentAlerts = history.alerts.filter(
        (a) => new Date(a.timestamp) >= cutoff
      );
      allAlerts.push(...recentAlerts);
    }

    return allAlerts.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get trend analysis
   */
  getTrend(
    featureId: string,
    metric: keyof QualityMetrics['metrics'],
    period: '1h' | '1d' | '7d' | '30d'
  ): {
    current: number;
    previous: number;
    change: number;
    changePercent: number;
    trend: 'improving' | 'stable' | 'degrading';
  } {
    const metrics = this.getMetrics(featureId, period);
    if (metrics.length < 2) {
      return {
        current: 0,
        previous: 0,
        change: 0,
        changePercent: 0,
        trend: 'stable',
      };
    }

    const current = metrics[metrics.length - 1].metrics[metric];
    const previous = metrics[0].metrics[metric];
    const change = current - previous;
    const changePercent = (change / previous) * 100;

    let trend: 'improving' | 'stable' | 'degrading';
    if (Math.abs(changePercent) < 5) {
      trend = 'stable';
    } else if (change > 0) {
      // For most metrics, increase is good (except cost and error rate)
      trend =
        metric === 'avgCost' || metric === 'errorRate'
          ? 'degrading'
          : 'improving';
    } else {
      trend =
        metric === 'avgCost' || metric === 'errorRate'
          ? 'improving'
          : 'degrading';
    }

    return {
      current,
      previous,
      change,
      changePercent,
      trend,
    };
  }

  /**
   * Get cutoff date for period
   */
  private getCutoffDate(now: Date, period: '1h' | '1d' | '7d' | '30d'): Date {
    const ms = {
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    return new Date(now.getTime() - ms[period]);
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
