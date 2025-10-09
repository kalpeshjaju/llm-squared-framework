/**
 * Semantic Cache
 * Caches LLM responses with similarity-based retrieval
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { CacheEntry } from '../types/index.js';

export interface CacheConfig {
  storagePath: string;
  defaultTTL: number; // seconds
  maxEntries: number;
  similarityThreshold: number; // 0-1, for semantic matching
}

export class SemanticCache {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Load cache from storage
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.config.storagePath, 'utf-8');
      const data = JSON.parse(content) as { entries: CacheEntry[] };

      this.cache.clear();
      for (const entry of data.entries) {
        this.cache.set(entry.key, entry);
      }

      // Clean expired entries
      await this.cleanup();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache.clear();
      } else {
        throw new Error(
          `Failed to load cache from ${this.config.storagePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Save cache to storage
   */
  async save(): Promise<void> {
    const entries = Array.from(this.cache.values());

    try {
      await mkdir(dirname(this.config.storagePath), { recursive: true });
      await writeFile(
        this.config.storagePath,
        JSON.stringify({ entries }, null, 2),
        'utf-8'
      );
    } catch (error) {
      throw new Error(
        `Failed to save cache: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get cached value (exact match)
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // Update access metadata
    entry.metadata.accessCount++;
    entry.metadata.lastAccessedAt = new Date().toISOString();

    return entry.value;
  }

  /**
   * Set cache value
   */
  async set(key: string, value: string, ttl?: number, embedding?: number[]): Promise<void> {
    // Check if we need to evict
    if (this.cache.size >= this.config.maxEntries) {
      await this.evictLRU();
    }

    const entry: CacheEntry = {
      key,
      value,
      embedding,
      metadata: {
        createdAt: new Date().toISOString(),
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
        ttl: ttl || this.config.defaultTTL,
      },
    };

    this.cache.set(key, entry);
    await this.save();
  }

  /**
   * Find similar cached entries (semantic matching)
   */
  findSimilar(embedding: number[], threshold?: number): CacheEntry | null {
    const similarityThreshold = threshold || this.config.similarityThreshold;
    let bestMatch: CacheEntry | null = null;
    let bestScore = 0;

    for (const entry of this.cache.values()) {
      if (!entry.embedding) continue;

      // Check if expired
      if (this.isExpired(entry)) continue;

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(embedding, entry.embedding);

      if (similarity > bestScore && similarity >= similarityThreshold) {
        bestScore = similarity;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      // Update access metadata
      bestMatch.metadata.accessCount++;
      bestMatch.metadata.lastAccessedAt = new Date().toISOString();
    }

    return bestMatch;
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    await this.save();
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    await this.save();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    totalSize: number;
    hitRate: number;
    avgAccessCount: number;
    oldestEntry: string;
    newestEntry: string;
  } {
    const entries = Array.from(this.cache.values());

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        totalSize: 0,
        hitRate: 0,
        avgAccessCount: 0,
        oldestEntry: '',
        newestEntry: '',
      };
    }

    const totalSize = entries.reduce((sum, e) => sum + e.value.length, 0);
    const totalAccess = entries.reduce((sum, e) => sum + e.metadata.accessCount, 0);

    const sorted = [...entries].sort(
      (a, b) =>
        new Date(a.metadata.createdAt).getTime() -
        new Date(b.metadata.createdAt).getTime()
    );

    return {
      totalEntries: entries.length,
      totalSize,
      hitRate: totalAccess / entries.length,
      avgAccessCount: totalAccess / entries.length,
      oldestEntry: sorted[0].key,
      newestEntry: sorted[sorted.length - 1].key,
    };
  }

  /**
   * Cleanup expired entries
   */
  private async cleanup(): Promise<void> {
    let cleaned = false;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        cleaned = true;
      }
    }

    if (cleaned) {
      await this.save();
    }
  }

  /**
   * Evict least recently used entry
   */
  private async evictLRU(): Promise<void> {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      const lastAccess = new Date(entry.metadata.lastAccessedAt).getTime();
      if (lastAccess < lruTime) {
        lruTime = lastAccess;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      await this.save();
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    const createdAt = new Date(entry.metadata.createdAt).getTime();
    const ttlMs = entry.metadata.ttl * 1000;

    return now - createdAt > ttlMs;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
