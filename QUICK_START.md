# LLM² Enforcement Layer - Quick Start Guide

> Get automatic quality control for your LLM-powered features in 5 minutes

---

## What is This?

An **enforcement layer** that makes LLM quality control **automatic and mandatory**. Every LLM call automatically gets:

✅ Quality evaluation (blocks if score < 7/10)
✅ Semantic caching (30-50% cost savings)
✅ Rate limiting (prevents quota exhaustion)
✅ Monitoring (all metrics tracked)

**You can't skip it** - it's enforced automatically.

---

## Installation

### Option 1: Local (for development)

```bash
cd your-project
npm install ../llm-squared-framework
```

### Option 2: From npm (when published)

```bash
npm install llm-squared-framework
```

---

## Usage (3 Steps)

### Step 1: Create Service File

Create `src/services/llm-service.ts`:

```typescript
import { ManagedLLMService } from 'llm-squared-framework';

export function createManagedLLMService() {
  return new ManagedLLMService({
    apiKey: process.env.ANTHROPIC_API_KEY,

    // Quality (AUTOMATIC)
    autoEvaluate: true,
    minQualityScore: 7,
    blockOnLowQuality: true,

    // Performance (AUTOMATIC)
    enableCaching: true,

    // Scaling (AUTOMATIC)
    enableRateLimiting: true,

    // Monitoring (AUTOMATIC)
    enableMonitoring: true,

    // Model config
    model: 'claude-sonnet-4-20250514',
    temperature: 0.7,
    maxTokens: 4000,
  });
}

let instance: ManagedLLMService | null = null;

export function getManagedLLMService() {
  if (!instance) instance = createManagedLLMService();
  return instance;
}

export async function initializeLLMService() {
  const service = getManagedLLMService();
  await service.initialize();
}
```

### Step 2: Initialize at Startup

In your `src/index.ts` or main entry point:

```typescript
import { initializeLLMService } from './services/llm-service.js';

async function main() {
  // Initialize enforcement layer
  await initializeLLMService();

  // Rest of your code...
}

main();
```

### Step 3: Replace API Calls

**Before** (direct API):
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: '...' });
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4000,
  messages: [{ role: 'user', content: 'Hello' }]
});

const text = response.content[0].text;
```

**After** (enforcement layer):
```typescript
import { getManagedLLMService } from './services/llm-service.js';

const service = getManagedLLMService();

const result = await service.generate({
  featureId: 'greeting-generator',
  taskDescription: 'Generate a friendly greeting',
  prompt: 'Hello',
});

if (!result.success) {
  console.error('Quality gate blocked:', result.error);
  return;
}

const text = result.content;
```

**That's it!** Quality control is now automatic.

---

## What Happens Now?

Every LLM call:

### 1. Checks Cache First
```
📍 Generating greeting...
   💾 Cache hit - instant response, $0 cost
```

### 2. Or Calls LLM + Evaluates
```
📍 Generating greeting...
   ✅ Quality Score: 8.5/10
   💰 Cost: $0.0012
   ⏱️  Latency: 1245ms
```

### 3. Or Blocks Low Quality
```
🛑 Request BLOCKED by quality gate!
   Reason: quality_too_low
   Error: Quality score 6.2/10 below minimum 7/10

   💡 Suggestions:
      - Review and improve the prompt
      - Add more context to the request
```

---

## Example Output

```bash
export ANTHROPIC_API_KEY='sk-ant-...'
npm run dev
```

```
✅ ManagedLLMService initialized with automatic enforcement

📍 1/3 - Generating market research...
   ✅ Quality Score: 8.5/10
   💰 Cost: $0.0245
   ⏱️  Latency: 3245ms

📍 2/3 - Generating customer personas...
   💾 Cache hit - instant response, $0 cost

📍 3/3 - Generating brand strategy...
   ✅ Quality Score: 9.1/10
   💰 Cost: $0.0198
   ⏱️  Latency: 2876ms

📊 Service Statistics:
💾 Cache:
   Total entries: 12
   Hit rate: 0.45

⏱️  Rate Limits:
   Remaining this minute: 57
   Remaining this hour: 995
```

---

## Configuration

All configuration in `src/services/llm-service.ts`:

```typescript
{
  // Quality thresholds
  minQualityScore: 7,          // 0-10 scale (don't go below 6)
  blockOnLowQuality: true,     // Set to false to warn only

  // Cache settings
  enableCaching: true,
  cacheTTL: 3600,              // 1 hour (3600 seconds)

  // Rate limits
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  requestsPerDay: 10000,

  // Model
  model: 'claude-sonnet-4-20250514',
  temperature: 0.7,            // 0.0 = deterministic, 1.0 = creative
  maxTokens: 4000,
}
```

---

## Advanced: Escape Hatch

For creative tasks that shouldn't be evaluated:

```typescript
const result = await service.generate({
  featureId: 'creative-taglines',
  taskDescription: 'Generate creative taglines',
  prompt: 'Create 5 creative taglines...',
  bypassQualityCheck: true,  // ⚠️ Use sparingly
});
```

This:
- Skips quality evaluation
- Still caches result
- Still applies rate limits
- Logs a warning

---

## Monitoring

### View Statistics

```typescript
import { getLLMServiceStats } from './services/llm-service.js';

const stats = await getLLMServiceStats();

console.log('Cache Stats:', stats.cacheStats);
console.log('Rate Limits:', stats.rateLimitStatus);
```

### Stored Data

- `./data/*-llm-cache.json` - Cached responses
- `./data/*-llm-metrics.json` - Quality metrics
- `./data/*-prompts.json` - Versioned prompts

---

## Troubleshooting

### Error: "Missing Anthropic API key"

```bash
export ANTHROPIC_API_KEY='sk-ant-...'
```

### Error: "Quality gate blocked"

**Solutions**:
1. Improve your prompt (add context, examples)
2. Lower `minQualityScore` to 6 (not recommended below 6)
3. Use `bypassQualityCheck: true` for creative tasks

### Error: "Rate limit exceeded"

**Solutions**:
1. Wait for reset (time shown in error message)
2. Enable caching to reduce API calls
3. Increase rate limits in config

---

## Cost Savings

**Example**: Brand generation workflow (15 LLM calls)

Without caching:
- 15 calls × $0.04 = **$0.60 per run**

With caching (after first run):
- 7 calls × $0.04 = **$0.28 per run**
- **Savings: 53%** 💰

---

## Examples

### Full Example

See `/examples/managed-service-usage.ts`:

```bash
cd llm-squared-framework
export ANTHROPIC_API_KEY='sk-ant-...'
tsx examples/managed-service-usage.ts
```

### Real Integration

See brand-design-agent for complete integration:
- `/Users/kalpeshjaju/Development/brand-design-agent/src/services/llm-service.ts`
- `/Users/kalpeshjaju/Development/brand-design-agent/ENFORCEMENT_LAYER_INTEGRATION.md`

---

## Next Steps

1. ✅ Install framework
2. ✅ Create llm-service.ts
3. ✅ Initialize at startup
4. ✅ Replace API calls
5. ✅ Test with real workflow
6. 📊 Monitor metrics
7. 🎯 Tune quality threshold

---

## Documentation

- **This guide**: Quick start
- **CLAUDE.md**: Framework architecture
- **ENFORCEMENT_LAYER_IMPLEMENTATION_SUMMARY.md**: Complete implementation details
- **Examples**: `/examples/managed-service-usage.ts`

---

## Support

Questions? Check:
1. `CLAUDE.md` - Framework documentation
2. `ENFORCEMENT_LAYER_IMPLEMENTATION_SUMMARY.md` - Detailed guide
3. `/examples/managed-service-usage.ts` - Working example
4. MASTER_RULES.md - Global standards

---

**Version**: 0.2.0
**Status**: ✅ Production Ready
**License**: MIT
