/**
 * Golden Dataset Manager
 * Manages curated test datasets for LLM evaluation
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { GoldenDatasetEntry } from '../types/index.js';

export interface DatasetMetadata {
  name: string;
  description: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  totalEntries: number;
  categories: string[];
}

export interface GoldenDataset {
  metadata: DatasetMetadata;
  entries: GoldenDatasetEntry[];
}

export class GoldenDatasetManager {
  private datasetPath: string;
  private dataset: GoldenDataset | null = null;

  constructor(datasetPath: string) {
    this.datasetPath = datasetPath;
  }

  /**
   * Initialize a new dataset
   */
  async initialize(metadata: Omit<DatasetMetadata, 'createdAt' | 'updatedAt' | 'totalEntries' | 'categories'>): Promise<void> {
    const dataset: GoldenDataset = {
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalEntries: 0,
        categories: [],
      },
      entries: [],
    };

    await this.saveDataset(dataset);
    this.dataset = dataset;
  }

  /**
   * Load dataset from file
   */
  async load(): Promise<GoldenDataset> {
    try {
      const content = await readFile(this.datasetPath, 'utf-8');
      this.dataset = JSON.parse(content) as GoldenDataset;
      return this.dataset;
    } catch (error) {
      throw new Error(
        `Failed to load golden dataset from ${this.datasetPath}: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        `Ensure file exists or initialize a new dataset with initialize().`
      );
    }
  }

  /**
   * Add entry to dataset
   */
  async addEntry(entry: Omit<GoldenDatasetEntry, 'id'>): Promise<string> {
    if (!this.dataset) {
      await this.load();
    }

    const id = this.generateId();
    const newEntry: GoldenDatasetEntry = {
      id,
      ...entry,
    };

    this.dataset!.entries.push(newEntry);
    await this.updateMetadata();
    await this.save();

    return id;
  }

  /**
   * Add multiple entries
   */
  async addBatch(entries: Array<Omit<GoldenDatasetEntry, 'id'>>): Promise<string[]> {
    const ids: string[] = [];

    for (const entry of entries) {
      const id = await this.addEntry(entry);
      ids.push(id);
    }

    return ids;
  }

  /**
   * Get entry by ID
   */
  async getEntry(id: string): Promise<GoldenDatasetEntry | null> {
    if (!this.dataset) {
      await this.load();
    }

    return this.dataset!.entries.find(e => e.id === id) || null;
  }

  /**
   * Get all entries
   */
  async getAllEntries(): Promise<GoldenDatasetEntry[]> {
    if (!this.dataset) {
      await this.load();
    }

    return this.dataset!.entries;
  }

  /**
   * Get entries by category
   */
  async getByCategory(category: string): Promise<GoldenDatasetEntry[]> {
    if (!this.dataset) {
      await this.load();
    }

    return this.dataset!.entries.filter(
      e => e.metadata?.category === category
    );
  }

  /**
   * Get entries by difficulty
   */
  async getByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): Promise<GoldenDatasetEntry[]> {
    if (!this.dataset) {
      await this.load();
    }

    return this.dataset!.entries.filter(
      e => e.metadata?.difficulty === difficulty
    );
  }

  /**
   * Get entries by tags
   */
  async getByTags(tags: string[]): Promise<GoldenDatasetEntry[]> {
    if (!this.dataset) {
      await this.load();
    }

    return this.dataset!.entries.filter(e => {
      const entryTags = e.metadata?.tags || [];
      return tags.some(tag => entryTags.includes(tag));
    });
  }

  /**
   * Get random sample
   */
  async getRandomSample(count: number): Promise<GoldenDatasetEntry[]> {
    if (!this.dataset) {
      await this.load();
    }

    const entries = [...this.dataset!.entries];
    const sample: GoldenDatasetEntry[] = [];

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const randomIndex = Math.floor(Math.random() * entries.length);
      sample.push(entries.splice(randomIndex, 1)[0]);
    }

    return sample;
  }

  /**
   * Update entry
   */
  async updateEntry(id: string, updates: Partial<Omit<GoldenDatasetEntry, 'id'>>): Promise<void> {
    if (!this.dataset) {
      await this.load();
    }

    const index = this.dataset!.entries.findIndex(e => e.id === id);
    if (index === -1) {
      throw new Error(`Entry with ID ${id} not found in dataset`);
    }

    this.dataset!.entries[index] = {
      ...this.dataset!.entries[index],
      ...updates,
    };

    await this.updateMetadata();
    await this.save();
  }

  /**
   * Delete entry
   */
  async deleteEntry(id: string): Promise<void> {
    if (!this.dataset) {
      await this.load();
    }

    const index = this.dataset!.entries.findIndex(e => e.id === id);
    if (index === -1) {
      throw new Error(`Entry with ID ${id} not found in dataset`);
    }

    this.dataset!.entries.splice(index, 1);
    await this.updateMetadata();
    await this.save();
  }

  /**
   * Get dataset statistics
   */
  async getStats(): Promise<{
    total: number;
    byCategory: Record<string, number>;
    byDifficulty: Record<string, number>;
    byTags: Record<string, number>;
  }> {
    if (!this.dataset) {
      await this.load();
    }

    const stats = {
      total: this.dataset!.entries.length,
      byCategory: {} as Record<string, number>,
      byDifficulty: {} as Record<string, number>,
      byTags: {} as Record<string, number>,
    };

    for (const entry of this.dataset!.entries) {
      // Count by category
      const category = entry.metadata?.category || 'uncategorized';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

      // Count by difficulty
      const difficulty = entry.metadata?.difficulty || 'unknown';
      stats.byDifficulty[difficulty] = (stats.byDifficulty[difficulty] || 0) + 1;

      // Count by tags
      const tags = entry.metadata?.tags || [];
      for (const tag of tags) {
        stats.byTags[tag] = (stats.byTags[tag] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Export dataset to JSON
   */
  async export(outputPath: string): Promise<void> {
    if (!this.dataset) {
      await this.load();
    }

    await this.saveDataset(this.dataset!, outputPath);
  }

  /**
   * Import dataset from JSON
   */
  async import(inputPath: string, merge: boolean = false): Promise<void> {
    try {
      const content = await readFile(inputPath, 'utf-8');
      const importedDataset = JSON.parse(content) as GoldenDataset;

      if (merge && this.dataset) {
        // Merge with existing dataset
        this.dataset.entries.push(...importedDataset.entries);
        await this.updateMetadata();
      } else {
        // Replace existing dataset
        this.dataset = importedDataset;
      }

      await this.save();
    } catch (error) {
      throw new Error(
        `Failed to import dataset from ${inputPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Save current dataset
   */
  private async save(): Promise<void> {
    if (!this.dataset) {
      throw new Error('No dataset loaded. Load or initialize a dataset first.');
    }

    await this.saveDataset(this.dataset);
  }

  /**
   * Save dataset to file
   */
  private async saveDataset(dataset: GoldenDataset, path?: string): Promise<void> {
    const targetPath = path || this.datasetPath;

    try {
      // Ensure directory exists
      await mkdir(dirname(targetPath), { recursive: true });

      // Write file
      await writeFile(
        targetPath,
        JSON.stringify(dataset, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new Error(
        `Failed to save dataset to ${targetPath}: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        `Check write permissions.`
      );
    }
  }

  /**
   * Update metadata
   */
  private async updateMetadata(): Promise<void> {
    if (!this.dataset) return;

    const categories = new Set<string>();
    this.dataset.entries.forEach(e => {
      if (e.metadata?.category) {
        categories.add(e.metadata.category);
      }
    });

    this.dataset.metadata.totalEntries = this.dataset.entries.length;
    this.dataset.metadata.categories = Array.from(categories);
    this.dataset.metadata.updatedAt = new Date().toISOString();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `entry_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
