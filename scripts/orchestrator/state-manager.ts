/**
 * State Manager - Tracks iteration state and history
 * Maintains the current state of each PR's maker-checker cycle
 */

import fs from 'fs';
import path from 'path';
import type { IterationState, IterationRecord, MakerCheckerConfig } from '../types.js';

export class StateManager {
  private stateDir: string;

  constructor(stateDir: string = '.maker-checker-state') {
    this.stateDir = stateDir;
    this.ensureStateDir();
  }

  private ensureStateDir(): void {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /**
   * Initialize state for a new PR
   */
  initializeState(
    prNumber: number,
    repository: string,
    config: MakerCheckerConfig
  ): IterationState {
    const state: IterationState = {
      prNumber,
      repository,
      currentIteration: 0,
      maxIterations: config.maxIterations,
      history: [],
      currentPhase: 'waiting',
      qualityScore: 0,
      convergenceStatus: 'improving',
      totalCost: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.saveState(state);
    return state;
  }

  /**
   * Get state for a PR
   */
  getState(prNumber: number, repository: string): IterationState | null {
    const filePath = this.getStateFilePath(prNumber, repository);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load state for PR #${prNumber}:`, error);
      return null;
    }
  }

  /**
   * Save state
   */
  saveState(state: IterationState): void {
    state.updatedAt = new Date().toISOString();
    const filePath = this.getStateFilePath(state.prNumber, state.repository);

    try {
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save state for PR #${state.prNumber}:`, error);
      throw error;
    }
  }

  /**
   * Update phase
   */
  updatePhase(
    state: IterationState,
    phase: IterationState['currentPhase']
  ): void {
    state.currentPhase = phase;
    this.saveState(state);
  }

  /**
   * Start new iteration
   */
  startIteration(state: IterationState): void {
    state.currentIteration += 1;
    state.currentPhase = 'codex_review';
    this.saveState(state);
  }

  /**
   * Record iteration result
   */
  recordIteration(
    state: IterationState,
    record: Omit<IterationRecord, 'timestamp' | 'durationSeconds'>
  ): void {
    const fullRecord: IterationRecord = {
      ...record,
      timestamp: new Date().toISOString(),
      durationSeconds: 0, // Will be calculated by orchestrator
    };

    state.history.push(fullRecord);
    state.totalCost += record.cost;
    state.qualityScore = record.codexReview?.overallQuality || state.qualityScore;

    this.saveState(state);
  }

  /**
   * Update convergence status
   */
  updateConvergence(
    state: IterationState,
    status: IterationState['convergenceStatus']
  ): void {
    state.convergenceStatus = status;
    this.saveState(state);
  }

  /**
   * Complete the maker-checker cycle
   */
  complete(state: IterationState, success: boolean): void {
    state.currentPhase = success ? 'complete' : 'failed';
    this.saveState(state);
  }

  /**
   * Check if PR has reached max iterations
   */
  hasReachedMaxIterations(state: IterationState): boolean {
    return state.currentIteration >= state.maxIterations;
  }

  /**
   * Get iteration statistics
   */
  getStatistics(state: IterationState): {
    totalIterations: number;
    totalCost: number;
    averageCostPerIteration: number;
    totalIssuesFound: number;
    totalIssuesFixed: number;
    qualityImprovement: number;
  } {
    const totalIterations = state.history.length;
    const totalIssuesFound = state.history.reduce((sum, r) => sum + r.issuesFound, 0);
    const totalIssuesFixed = state.history.reduce((sum, r) => sum + r.issuesFixed, 0);

    const firstQuality = state.history[0]?.codexReview?.overallQuality || 0;
    const lastQuality = state.history[state.history.length - 1]?.codexReview?.overallQuality || 0;
    const qualityImprovement = lastQuality - firstQuality;

    return {
      totalIterations,
      totalCost: state.totalCost,
      averageCostPerIteration: totalIterations > 0 ? state.totalCost / totalIterations : 0,
      totalIssuesFound,
      totalIssuesFixed,
      qualityImprovement,
    };
  }

  /**
   * Delete state (cleanup)
   */
  deleteState(prNumber: number, repository: string): void {
    const filePath = this.getStateFilePath(prNumber, repository);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * List all active states
   */
  listActiveStates(): IterationState[] {
    const states: IterationState[] = [];

    if (!fs.existsSync(this.stateDir)) {
      return states;
    }

    const files = fs.readdirSync(this.stateDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(this.stateDir, file), 'utf-8');
          const state = JSON.parse(content);
          if (state.currentPhase !== 'complete' && state.currentPhase !== 'failed') {
            states.push(state);
          }
        } catch (error) {
          console.error(`Failed to read state file ${file}:`, error);
        }
      }
    }

    return states;
  }

  private getStateFilePath(prNumber: number, repository: string): string {
    const safeRepo = repository.replace(/[^a-zA-Z0-9-]/g, '_');
    return path.join(this.stateDir, `${safeRepo}_pr_${prNumber}.json`);
  }
}
