# LLM² Framework

**Build production-ready LLM products WITH LLMs**

A comprehensive framework for ensuring quality, consistency, and scalability when building LLM-powered applications using LLM-driven development (like Claude Code).

## 🎯 What is LLM²?

**LLM² = LLM-Built × LLM-Powered Products**

This framework solves the unique challenge of building LLM products when the development itself is LLM-driven. It provides:

- ✅ **Evaluation Framework** - Test LLM outputs for quality
- ✅ **Prompt Management** - Version, test, and optimize prompts
- ✅ **Quality Monitoring** - Track metrics and detect degradation
- ✅ **Scalability Utilities** - Caching, rate-limiting, fallbacks

## 🚀 Quick Start

### Installation

```bash
cd llm-squared-framework
npm install
```

### Basic Example

```typescript
import {
  LLMEvaluator,
  PromptRegistry,
  QualityMonitor,
  SemanticCache,
} from 'llm-squared-framework';

// Initialize evaluator
const evaluator = new LLMEvaluator({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Evaluate LLM output
const result = await evaluator.evaluate(
  'Create a function to validate email addresses',
  'function validateEmail(email) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email); }'
);

console.log(`Score: ${result.scores.overall}/10`);
console.log(`Passed: ${result.passed}`);
```

## 📚 Core Modules

### 1. Evaluation System

Test LLM outputs against quality criteria using Claude-as-Judge.

```typescript
import { LLMEvaluator, GoldenDatasetManager } from 'llm-squared-framework';

// Create evaluator
const evaluator = new LLMEvaluator({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Evaluate output
const result = await evaluator.evaluate(taskDescription, llmOutput);

// Batch evaluation
const results = await evaluator.evaluateBatch([
  { taskDescription: '...', llmOutput: '...' },
  // ... more tasks
]);

// Work with golden datasets
const dataset = new GoldenDatasetManager('./data/golden-dataset.json');
await dataset.initialize({ name: 'My Dataset', version: '1.0.0', description: 'Test cases' });

await dataset.addEntry({
  input: 'Create email validator',
  expectedOutput: 'function validateEmail...',
  metadata: { category: 'validation', difficulty: 'easy' },
});
```

**See:** `examples/evaluation.ts` for full example

### 2. Prompt Management

Version control and performance tracking for prompts.

```typescript
import { PromptRegistry, PromptTester } from 'llm-squared-framework';

// Create registry
const registry = new PromptRegistry({
  storagePath: './data/prompts.json',
});

await registry.load();

// Register prompt
await registry.register({
  name: 'code-generator',
  version: 'v1.0.0',
  template: 'Create a {{language}} function that {{task}}',
  variables: ['language', 'task'],
  metadata: {
    createdAt: new Date().toISOString(),
    author: 'Kalpesh',
    description: 'Code generation prompt',
    tags: ['code', 'generation'],
  },
});

// Use prompt
const prompt = registry.getLatest('code-generator')!;
const rendered = registry.render(prompt, {
  language: 'TypeScript',
  task: 'validates email addresses',
});

// Test prompts
const tester = new PromptTester(registry, evaluator);
const report = await tester.testBatch('code-generator', 'v1.0.0', testCases);

// Compare versions
const comparison = await tester.compare(
  'code-generator',
  'v1.0.0',
  'v1.1.0',
  testCases
);
```

**See:** `examples/prompts.ts` for full example

### 3. Quality Monitoring

Track LLM feature performance over time and detect issues.

```typescript
import { QualityMonitor } from 'llm-squared-framework';

// Create monitor
const monitor = new QualityMonitor({
  storagePath: './data/metrics.json',
  alertThresholds: {
    accuracyDrop: 0.1, // Alert if accuracy drops by 10%
    costIncrease: 50, // Alert if cost increases by 50%
    latencyIncrease: 100, // Alert if latency doubles
    errorRateIncrease: 0.05, // Alert if error rate increases by 5%
  },
});

await monitor.load();

// Record metrics
const alerts = await monitor.recordMetrics({
  timestamp: new Date().toISOString(),
  llmFeatureId: 'brand-strategy-generator',
  metrics: {
    accuracy: 0.92,
    precision: 0.89,
    recall: 0.94,
    f1Score: 0.91,
    avgResponseTime: 2500,
    avgTokens: 1200,
    avgCost: 0.012,
    errorRate: 0.02,
  },
  aggregationPeriod: '1h',
});

// Check for quality issues
if (alerts.length > 0) {
  console.log('Quality alerts:', alerts);
}

// Get trends
const trend = monitor.getTrend('brand-strategy-generator', 'accuracy', '7d');
console.log(`Accuracy trend: ${trend.trend} (${trend.changePercent.toFixed(1)}%)`);
```

**See:** `examples/monitoring.ts` for full example

### 4. Scalability Utilities

Caching, rate-limiting, and fallback strategies for production.

```typescript
import {
  SemanticCache,
  RateLimiter,
  FallbackManager,
  commonStrategies,
} from 'llm-squared-framework';

// Semantic caching
const cache = new SemanticCache({
  storagePath: './data/cache.json',
  defaultTTL: 3600,
  maxEntries: 1000,
  similarityThreshold: 0.9,
});

await cache.load();

// Check cache first
const cached = cache.get('my-request-key');
if (!cached) {
  const result = await callLLM();
  await cache.set('my-request-key', result, 3600);
}

// Rate limiting
const limiter = new RateLimiter({
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  requestsPerDay: 10000,
  burstAllowance: 10,
});

await limiter.execute(async () => {
  return await callLLM();
});

// Fallback strategies
const fallback = new FallbackManager(commonStrategies);

const result = await fallback.execute(
  async () => await callPrimaryLLM(),
  {
    cacheKey: 'request-123',
    simpleFn: async () => await callSimplerModel(),
    ruleBasedFn: () => ruleBasedApproach(),
  }
);

if (result.success) {
  console.log(`Success using: ${result.strategyUsed}`);
} else {
  console.error('All strategies failed:', result.error);
}
```

**See:** `examples/scalability.ts` for full example

## 🏗️ Project Structure

```
llm-squared-framework/
├── src/
│   ├── evaluation/       # LLM evaluation (Claude-as-Judge)
│   ├── prompts/          # Prompt versioning and testing
│   ├── quality/          # Quality monitoring and checks
│   ├── scalability/      # Caching, rate-limiting, fallbacks
│   ├── types/            # TypeScript type definitions
│   └── index.ts          # Main exports
│
├── examples/             # Usage examples
├── docs/                 # Comprehensive documentation
├── config/               # Configuration files
└── tests/                # Test suite
```

## 📖 Documentation

- **[Getting Started Guide](./docs/GETTING-STARTED.md)** - Complete setup walkthrough
- **[API Reference](./docs/API.md)** - Full API documentation
- **[Integration Guide](./docs/INTEGRATION.md)** - How to integrate into your projects
- **[Best Practices](./docs/BEST-PRACTICES.md)** - Production tips
- **[Architecture](./docs/ARCHITECTURE.md)** - System design overview

## 🎓 Examples

All examples are in the `examples/` directory:

- `evaluation.ts` - Complete evaluation workflow
- `prompts.ts` - Prompt management and testing
- `monitoring.ts` - Quality monitoring setup
- `scalability.ts` - Caching and rate-limiting
- `full-integration.ts` - End-to-end example

Run examples:

```bash
npm run build
tsx examples/evaluation.ts
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test evaluation
```

## 🛠️ Development

### Prerequisites

- Node.js >= 20.0.0
- Anthropic API key

### Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run type checking
npm run type-check

# Run linting
npm run lint

# Run tests
npm test
```

### Quality Standards

All code in this framework follows strict quality standards:

- **Files**: <500 lines (token efficiency for Claude Code)
- **Functions**: <100 lines
- **Type Safety**: Strict TypeScript mode
- **Test Coverage**: >80%
- **Documentation**: All public APIs documented

## 🚀 Using in Your Projects

### Option 1: Install as Dependency

```bash
# From local path
npm install ../llm-squared-framework

# Or from npm (if published)
npm install llm-squared-framework
```

### Option 2: Copy Components

Copy specific modules you need into your project:

```bash
cp -r llm-squared-framework/src/evaluation ./src/
```

### Option 3: Use as Template

Use this framework as a starting point for your LLM project:

```bash
npm run init:project my-llm-app
```

## 📊 Framework Benefits

### Before LLM² Framework

- ❌ No way to measure LLM output quality
- ❌ Prompts scattered, no versioning
- ❌ Quality degrades silently over time
- ❌ No caching, expensive API costs
- ❌ No fallback when APIs fail
- ❌ Inconsistent quality across projects

### After LLM² Framework

- ✅ Automated quality evaluation
- ✅ Versioned prompts with performance tracking
- ✅ Quality monitoring with alerts
- ✅ Smart caching (30-50% cost savings)
- ✅ Graceful fallback strategies
- ✅ Consistent standards everywhere

## 🎯 Who Is This For?

**Perfect for:**

- 👨‍💻 Developers building LLM-powered apps
- 🤖 Teams using Claude Code or similar AI dev tools
- 🚀 Founders building LLM products solo
- 📊 Anyone who needs production-quality LLM features

**Especially valuable if:**

- You're building multiple LLM features
- You're using LLMs to build your product
- You need to ensure consistent quality
- You're scaling LLM usage
- You want to optimize costs

## 📈 Roadmap

### v0.1.0 (Current)

- ✅ Core evaluation system
- ✅ Prompt management
- ✅ Quality monitoring
- ✅ Basic scalability utilities

### v0.2.0 (Planned)

- [ ] A/B testing for prompts
- [ ] Advanced analytics dashboard
- [ ] Multi-provider support (OpenAI, etc.)
- [ ] Automated prompt optimization

### v1.0.0 (Future)

- [ ] Web UI for management
- [ ] Real-time collaboration features
- [ ] Enterprise integrations
- [ ] Advanced ML optimizations

## 🤝 Contributing

This framework is designed for Kalpesh's LLM projects. If you want to adapt it for your use:

1. Fork the repository
2. Customize for your needs
3. Follow the quality standards
4. Share improvements back!

## 📝 License

MIT License - feel free to use and modify

## 💡 Philosophy

This framework embodies these principles:

1. **Quality over Speed** - Fast iteration with high quality
2. **Evaluation First** - Measure everything
3. **Token Efficient** - Optimize for Claude Code usage
4. **Production Ready** - Built for real products
5. **Simple but Complete** - Everything you need, nothing you don't

## 🙏 Acknowledgments

Built with insights from:

- [PromptFoo](https://www.promptfoo.dev/) - LLM testing inspiration
- [LangChain](https://www.langchain.com/) - LLM application patterns
- [Anthropic](https://www.anthropic.com/) - Claude API and best practices

---

**Built by Kalpesh with Claude Code** 🤖

For questions, issues, or feedback, see `docs/SUPPORT.md`
