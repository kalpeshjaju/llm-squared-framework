/**
 * Prompt Registry
 * Manages versioned prompts with performance tracking
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { PromptVersion } from '../types/index.js';

export interface PromptRegistryConfig {
  storagePath: string;
}

export interface PromptPerformanceUpdate {
  score: number;
  passed: boolean;
}

export class PromptRegistry {
  private storagePath: string;
  private prompts: Map<string, PromptVersion[]> = new Map();

  constructor(config: PromptRegistryConfig) {
    this.storagePath = config.storagePath;
  }

  /**
   * Load prompts from storage
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.storagePath, 'utf-8');
      const data = JSON.parse(content) as { prompts: PromptVersion[] };

      this.prompts.clear();
      for (const prompt of data.prompts) {
        const versions = this.prompts.get(prompt.name) || [];
        versions.push(prompt);
        this.prompts.set(prompt.name, versions);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet, start with empty registry
        this.prompts.clear();
      } else {
        throw new Error(
          `Failed to load prompt registry from ${this.storagePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Save prompts to storage
   */
  async save(): Promise<void> {
    const allPrompts: PromptVersion[] = [];
    for (const versions of this.prompts.values()) {
      allPrompts.push(...versions);
    }

    const data = { prompts: allPrompts };

    try {
      await mkdir(dirname(this.storagePath), { recursive: true });
      await writeFile(
        this.storagePath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new Error(
        `Failed to save prompt registry to ${this.storagePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Register a new prompt version
   */
  async register(prompt: Omit<PromptVersion, 'id'>): Promise<string> {
    const id = this.generateId();
    const newPrompt: PromptVersion = {
      id,
      ...prompt,
    };

    const versions = this.prompts.get(prompt.name) || [];
    versions.push(newPrompt);
    this.prompts.set(prompt.name, versions);

    await this.save();
    return id;
  }

  /**
   * Get a specific prompt version
   */
  get(name: string, version: string): PromptVersion | null {
    const versions = this.prompts.get(name);
    if (!versions) return null;

    return versions.find((p) => p.version === version) || null;
  }

  /**
   * Get latest version of a prompt
   */
  getLatest(name: string): PromptVersion | null {
    const versions = this.prompts.get(name);
    if (!versions || versions.length === 0) return null;

    // Sort by version (assuming semantic versioning)
    const sorted = [...versions].sort((a, b) =>
      this.compareVersions(b.version, a.version)
    );

    return sorted[0];
  }

  /**
   * Get all versions of a prompt
   */
  getAllVersions(name: string): PromptVersion[] {
    return this.prompts.get(name) || [];
  }

  /**
   * Get all prompt names
   */
  getAllNames(): string[] {
    return Array.from(this.prompts.keys());
  }

  /**
   * Update prompt performance metrics
   */
  async updatePerformance(
    id: string,
    update: PromptPerformanceUpdate
  ): Promise<void> {
    for (const versions of this.prompts.values()) {
      const prompt = versions.find((p) => p.id === id);
      if (prompt) {
        if (!prompt.performance) {
          prompt.performance = {
            avgScore: 0,
            totalEvaluations: 0,
            successRate: 0,
          };
        }

        // Update running average
        const total = prompt.performance.totalEvaluations;
        const newTotal = total + 1;
        const newAvgScore =
          (prompt.performance.avgScore * total + update.score) / newTotal;
        const newSuccessRate =
          (prompt.performance.successRate * total + (update.passed ? 1 : 0)) /
          newTotal;

        prompt.performance.avgScore = newAvgScore;
        prompt.performance.totalEvaluations = newTotal;
        prompt.performance.successRate = newSuccessRate;

        await this.save();
        return;
      }
    }

    throw new Error(`Prompt with ID ${id} not found`);
  }

  /**
   * Render prompt template with variables
   */
  render(prompt: PromptVersion, variables: Record<string, string>): string {
    let rendered = prompt.template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), value);
    }

    // Check for missing variables
    const missingVars = prompt.variables.filter((v) => !(v in variables));
    if (missingVars.length > 0) {
      throw new Error(
        `Missing required variables for prompt ${prompt.name}: ${missingVars.join(', ')}`
      );
    }

    return rendered;
  }

  /**
   * Search prompts by tags
   */
  searchByTags(tags: string[]): PromptVersion[] {
    const results: PromptVersion[] = [];

    for (const versions of this.prompts.values()) {
      for (const prompt of versions) {
        const promptTags = prompt.metadata.tags || [];
        if (tags.some((tag) => promptTags.includes(tag))) {
          results.push(prompt);
        }
      }
    }

    return results;
  }

  /**
   * Get best performing prompt for a name
   */
  getBestPerforming(name: string): PromptVersion | null {
    const versions = this.prompts.get(name);
    if (!versions || versions.length === 0) return null;

    // Filter versions with performance data
    const withPerformance = versions.filter((p) => p.performance);
    if (withPerformance.length === 0) return this.getLatest(name);

    // Sort by average score
    const sorted = [...withPerformance].sort(
      (a, b) => (b.performance?.avgScore || 0) - (a.performance?.avgScore || 0)
    );

    return sorted[0];
  }

  /**
   * Get prompt statistics
   */
  getStats(): {
    totalPrompts: number;
    totalVersions: number;
    avgVersionsPerPrompt: number;
    topPerformers: Array<{ name: string; version: string; avgScore: number }>;
  } {
    let totalVersions = 0;
    const allPrompts: PromptVersion[] = [];

    for (const versions of this.prompts.values()) {
      totalVersions += versions.length;
      allPrompts.push(...versions);
    }

    const withPerformance = allPrompts
      .filter((p) => p.performance)
      .sort(
        (a, b) =>
          (b.performance?.avgScore || 0) - (a.performance?.avgScore || 0)
      )
      .slice(0, 5);

    const topPerformers = withPerformance.map((p) => ({
      name: p.name,
      version: p.version,
      avgScore: p.performance?.avgScore || 0,
    }));

    return {
      totalPrompts: this.prompts.size,
      totalVersions,
      avgVersionsPerPrompt: totalVersions / Math.max(this.prompts.size, 1),
      topPerformers,
    };
  }

  /**
   * Export prompts to JSON
   */
  async export(outputPath: string): Promise<void> {
    const allPrompts: PromptVersion[] = [];
    for (const versions of this.prompts.values()) {
      allPrompts.push(...versions);
    }

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(
        outputPath,
        JSON.stringify({ prompts: allPrompts }, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new Error(
        `Failed to export prompts to ${outputPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `prompt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.replace(/^v/, '').split('.').map(Number);
    const bParts = b.replace(/^v/, '').split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }
}
