/**
 * Evaluation Module
 * Exports all evaluation-related functionality
 */

export { LLMEvaluator } from './evaluator.js';
export type { EvaluatorConfig, RawEvaluation } from './evaluator.js';

export { GoldenDatasetManager } from './golden-dataset.js';
export type { DatasetMetadata, GoldenDataset } from './golden-dataset.js';

export { EvaluationTestRunner } from './test-runner.js';
export type { TestRunConfig, TestRunResult } from './test-runner.js';
