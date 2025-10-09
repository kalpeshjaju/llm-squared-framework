/**
 * LLM² Framework
 * Complete framework for building production-ready LLM products with LLMs
 *
 * ENFORCEMENT LAYER: All LLM calls should go through ManagedLLMService
 */

// PRIMARY EXPORT: Enforcement Layer (USE THIS)
export { ManagedLLMService } from './core/index.js';
export type {
  ManagedLLMConfig,
  LLMRequest as ManagedLLMRequest,
  LLMResponse as ManagedLLMResponse,
  LLMError as ManagedLLMError,
} from './core/index.js';

// Advanced modules (for customization)
export * from './evaluation/index.js';
export * from './prompts/index.js';
export * from './quality/index.js';
export * from './scalability/index.js';
export * from './types/index.js';

// Version
export const VERSION = '0.2.0';
