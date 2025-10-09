# LLM² Framework - Claude Project Guide

## Project Overview

**LLM² Framework** is a production-ready framework for building LLM products WITH LLMs.

**Purpose**: Provide evaluation, prompt management, quality monitoring, and scalability utilities for LLM-powered applications built using LLM-driven development (like Claude Code).

**Status**: ✅ Core framework complete, ready for integration testing

## Quick Commands

```bash
# Development
npm run dev                 # Run main CLI
npm run build               # Build TypeScript to dist/
npm run type-check          # Type checking (MUST pass before commit)
npm run lint                # Lint code
npm run format              # Format with Prettier

# Testing
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
npm run test:eval           # Test evaluation system

# Quality
npm run quality:check       # Run quality checks
npm run quality:fix         # Fix quality issues

# Examples
tsx examples/basic-evaluation.ts  # Run evaluation example
```

## Architecture

### Core Modules

#### 1. Evaluation (`src/evaluation/`)
- **evaluator.ts** (362 lines) - Claude-as-Judge evaluator
- **golden-dataset.ts** (399 lines) - Test dataset management
- **test-runner.ts** (330 lines) - Automated testing
- **Purpose**: Evaluate LLM outputs for quality

#### 2. Prompts (`src/prompts/`)
- **registry.ts** (387 lines) - Versioned prompt storage
- **tester.ts** (264 lines) - Prompt testing and comparison
- **Purpose**: Manage and optimize prompts

#### 3. Quality (`src/quality/`)
- **monitor.ts** (452 lines) - Quality metrics tracking
- **checker.ts** (470 lines) - Pre-commit quality checks
- **Purpose**: Monitor and maintain quality

#### 4. Scalability (`src/scalability/`)
- **cache.ts** (269 lines) - Semantic caching
- **rate-limiter.ts** (130 lines) - Rate limiting
- **fallback.ts** (176 lines) - Fallback strategies
- **Purpose**: Production scalability

### File Size Status

✅ **All files meet requirements** (<500 lines)

Largest files:
- quality/monitor.ts: 452 lines ✅
- quality/checker.ts: 470 lines ✅
- golden-dataset.ts: 399 lines ✅
- registry.ts: 387 lines ✅

## Key Features

### 1. Evaluation System

**What it does**: Evaluates LLM outputs using Claude-as-Judge

**Key capabilities**:
- Single and batch evaluation
- Detailed scoring (correctness, quality, security, etc.)
- Golden dataset management
- Cost and performance tracking

**Usage**:
```typescript
const evaluator = new LLMEvaluator({ apiKey: process.env.ANTHROPIC_API_KEY });
const result = await evaluator.evaluate(taskDescription, llmOutput);
console.log(`Score: ${result.scores.overall}/10, Passed: ${result.passed}`);
```

### 2. Prompt Management

**What it does**: Versions prompts and tracks performance

**Key capabilities**:
- Semantic versioning for prompts
- Performance tracking (avg score, success rate)
- A/B testing between versions
- Variable templating

**Usage**:
```typescript
const registry = new PromptRegistry({ storagePath: './data/prompts.json' });
await registry.register({
  name: 'code-gen',
  version: 'v1.0.0',
  template: 'Create {{language}} code for {{task}}',
  variables: ['language', 'task'],
  metadata: { /* ... */ }
});

const prompt = registry.getLatest('code-gen');
const rendered = registry.render(prompt, { language: 'TypeScript', task: 'email validation' });
```

### 3. Quality Monitoring

**What it does**: Tracks metrics and alerts on degradation

**Key capabilities**:
- Real-time metric recording
- Anomaly detection
- Trend analysis
- Configurable alerts

**Usage**:
```typescript
const monitor = new QualityMonitor({
  storagePath: './data/metrics.json',
  alertThresholds: {
    accuracyDrop: 0.1,
    costIncrease: 50,
    latencyIncrease: 100,
    errorRateIncrease: 0.05,
  }
});

const alerts = await monitor.recordMetrics({ /* metrics */ });
if (alerts.length > 0) {
  console.log('Quality issues detected:', alerts);
}
```

### 4. Scalability Utilities

**What it does**: Caching, rate-limiting, fallbacks

**Key capabilities**:
- Semantic caching (similarity-based)
- Token bucket rate limiting
- Multi-strategy fallbacks
- Automatic retries

**Usage**:
```typescript
// Caching
const cache = new SemanticCache({ /* config */ });
const cached = cache.get(key) || await cache.set(key, await callLLM());

// Rate limiting
const limiter = new RateLimiter({ requestsPerMinute: 60, /* ... */ });
await limiter.execute(() => callLLM());

// Fallbacks
const fallback = new FallbackManager(commonStrategies);
const result = await fallback.execute(() => callLLM(), { /* context */ });
```

## Development Workflow

### Before Making Changes

1. **Understand the module structure**
   - Each module is self-contained
   - All modules export via `index.ts`
   - Types are centralized in `src/types/`

2. **Check file sizes**
   - All files must be <500 lines
   - If editing large files, consider splitting

3. **Run tests**
   ```bash
   npm test
   ```

### Making Changes

1. **Edit code**
   - Follow TypeScript strict mode
   - Add JSDoc comments for public APIs
   - Keep functions <100 lines

2. **Type check**
   ```bash
   npm run type-check  # MUST pass
   ```

3. **Test changes**
   ```bash
   npm test  # Run relevant tests
   ```

4. **Build**
   ```bash
   npm run build
   ```

### Before Committing

```bash
# 1. Type check
npm run type-check    # MUST pass ✅

# 2. Lint
npm run lint          # MUST pass ✅

# 3. Test
npm test              # Run tests ✅

# 4. Build
npm run build         # Ensure builds ✅

# 5. Quality check (optional but recommended)
npm run quality:check
```

## Integration Guide

### Using in Other Projects

#### Option 1: Local Install
```bash
cd your-project
npm install ../llm-squared-framework
```

#### Option 2: Copy Module
```bash
cp -r llm-squared-framework/src/evaluation your-project/src/
```

#### Option 3: Import Directly
```typescript
// In your-project/src/index.ts
import { LLMEvaluator } from '../../llm-squared-framework/src/evaluation/evaluator.js';
```

### Integration Steps

1. **Install dependencies**
   ```bash
   npm install @anthropic-ai/sdk zod
   ```

2. **Set up environment**
   ```bash
   cp llm-squared-framework/.env.example .env
   # Add your ANTHROPIC_API_KEY
   ```

3. **Import and use**
   ```typescript
   import { LLMEvaluator } from 'llm-squared-framework';

   const evaluator = new LLMEvaluator({ apiKey: process.env.ANTHROPIC_API_KEY });
   const result = await evaluator.evaluate(task, output);
   ```

## Examples

All examples are in `examples/` directory:

- **basic-evaluation.ts** - Shows evaluation workflow
- Run with: `tsx examples/basic-evaluation.ts`

### Adding New Examples

1. Create file in `examples/`
2. Import from `../src/`
3. Add clear console output
4. Handle errors gracefully

## Testing

### Test Structure

```
tests/
├── evaluation.test.ts    # Evaluation tests
├── prompts.test.ts       # Prompt tests
├── quality.test.ts       # Quality tests
└── scalability.test.ts   # Scalability tests
```

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test evaluation

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';
import { LLMEvaluator } from '../src/evaluation/evaluator.js';

describe('LLMEvaluator', () => {
  it('should evaluate LLM output', async () => {
    const evaluator = new LLMEvaluator({ apiKey: 'test-key' });
    // ... test code
  });
});
```

## Code Standards

### TypeScript

- **Strict mode**: Enabled
- **No `any`**: Use specific types or `unknown`
- **ES Modules**: Always use `.js` in imports
- **Naming**: camelCase for variables/functions, PascalCase for classes

### Files

- **Max size**: 500 lines
- **Single responsibility**: One module per concern
- **Clear names**: Descriptive, not cryptic

### Functions

- **Max length**: 100 lines
- **Single purpose**: Do one thing well
- **Clear names**: Verb-based, descriptive

### Comments

- **JSDoc**: For all public APIs
- **Inline**: For complex logic only
- **Why, not what**: Explain reasoning, not obvious code

### Error Messages

**Always include context**:
- What failed
- Why it matters
- How to fix

```typescript
// ❌ Bad
throw new Error('Failed');

// ✅ Good
throw new Error(
  `Failed to load prompt registry from ${path}: file not found. ` +
  `Ensure file exists or run 'npm run init:prompts' to create it.`
);
```

## Known Issues

### 1. No Tests Yet ⚠️
**Status**: Framework code complete, tests TODO
**Impact**: Can't verify correctness
**Fix**: Add comprehensive test suite (in progress)

### 2. Examples Need API Key ⚠️
**Status**: Examples require ANTHROPIC_API_KEY
**Workaround**: Set up .env file with your key
**Fix**: Add mock examples that don't need API

### 3. No CLI Yet
**Status**: Library only, no CLI interface
**Future**: Add CLI for common operations

## Dependencies

### Production

- `@anthropic-ai/sdk` - Claude API
- `zod` - Schema validation
- `chalk` - Terminal colors
- `ora` - Spinners
- `commander` - CLI framework (for future CLI)

### Development

- `typescript` - Type checking
- `vitest` - Testing
- `eslint` - Linting
- `prettier` - Formatting
- `tsx` - TypeScript execution

## Performance

### Evaluation Costs

- **Per evaluation**: ~$0.003-0.01
- **1000 evaluations**: ~$3-10
- **Model**: Claude Sonnet 4.5

### Token Efficiency

- **All files**: <500 lines ✅
- **Total codebase**: ~3,500 lines
- **Average file**: ~350 lines
- **Optimized for Claude Code sessions**

## For Kalpesh

### How to Use This Framework

1. **In your LLM projects**, import modules:
   ```typescript
   import { LLMEvaluator } from '../llm-squared-framework/src/evaluation';
   ```

2. **Evaluate LLM features** before shipping:
   ```bash
   tsx examples/basic-evaluation.ts
   ```

3. **Monitor quality** in production:
   - Record metrics after each LLM call
   - Check for alerts daily
   - Review trends weekly

4. **Optimize prompts**:
   - Version all prompts
   - Test before deploying
   - Compare versions to find best

### Integration Priority

**Apply to these projects first**:
1. ✅ **brand-design-agent** - Add evaluation for brand outputs
2. ✅ **ui-ux-audit-tool** - Monitor LLM analysis quality
3. ✅ **flyberry-brand-research** - Complete implementation with framework

### Next Steps

1. **This Week**: Test framework with brand-design-agent
2. **Next Week**: Add to ui-ux-audit-tool
3. **Month End**: All projects using framework

## Troubleshooting

### Error: "ANTHROPIC_API_KEY not found"
**Fix**: Create `.env` file with your API key

### Error: "Cannot find module"
**Fix**: Run `npm install` and `npm run build`

### Error: "Type errors"
**Fix**: Run `npm run type-check` to see details

### Slow evaluations
**Reason**: API latency (2-5 seconds per evaluation)
**Optimization**: Use batch evaluation or caching

## Future Enhancements

### v0.2.0 (Next)
- [ ] Add comprehensive test suite
- [ ] Add CLI interface
- [ ] Add dashboard for metrics
- [ ] Support OpenAI models

### v1.0.0 (Future)
- [ ] Web UI for management
- [ ] Real-time monitoring dashboard
- [ ] Advanced analytics
- [ ] Team collaboration features

---

**Last Updated**: 2025-10-09
**Version**: 0.1.0
**Status**: Core complete, testing in progress

For questions or issues, ask Claude or check README.md
