# llm-squared-framework Enhancement Plan

> **Goal**: Add missing patterns from Phase 0 validation
> **Date**: 2025-10-10
> **Status**: Ready to implement

---

## Missing Patterns Identified

From Phase 0 validation across 3 projects, llm-squared-framework is missing:

1. ❌ **Budget Enforcement** (Dollar-based limits, not just rate limits)
2. ❌ **Schema Validation** (Zod-based output validation)

**Currently has**:
- ✅ Quality evaluation (Claude-as-Judge)
- ✅ Rate limiting (request count-based)
- ✅ Caching (semantic similarity)
- ✅ Monitoring (metrics tracking)
- ✅ Prompt registry

---

## Enhancement 1: Budget Enforcement

### Current State
**What exists**: Rate limiting by request count
```typescript
requestsPerMinute: 60,
requestsPerHour: 1000,
requestsPerDay: 10000,
```

**What's missing**: Dollar-based budget limits
- No daily/monthly cost limits
- No per-call cost limits
- No cost alerts at thresholds

### What to Add

**New Config Options**:
```typescript
export interface ManagedLLMConfig {
  // ... existing config ...

  // NEW: Budget enforcement
  enableBudgetEnforcement?: boolean;
  budgetLimits?: {
    dailyUSD?: number;       // e.g., 10
    monthlyUSD?: number;     // e.g., 200
    perCallUSD?: number;     // e.g., 0.50
  };
  budgetAlertThreshold?: number; // e.g., 0.80 (80%)
}
```

**Implementation**:

1. **Create `src/core/budget-enforcer.ts`**:
```typescript
export class BudgetEnforcer {
  private dailySpend: Map<string, number>; // featureId -> cost
  private monthlySpend: Map<string, number>;
  private readonly config: BudgetConfig;

  calculateCost(inputTokens: number, outputTokens: number): number {
    // Use pricing from config or default (Sonnet)
    const COST_PER_M_INPUT = 3;
    const COST_PER_M_OUTPUT = 15;

    return (
      (inputTokens / 1_000_000 * COST_PER_M_INPUT) +
      (outputTokens / 1_000_000 * COST_PER_M_OUTPUT)
    );
  }

  async checkBudget(featureId: string, estimatedCost: number): Promise<{
    allowed: boolean;
    reason?: string;
    currentSpend?: number;
    limit?: number;
  }> {
    const daily = this.dailySpend.get(featureId) || 0;
    const limit = this.config.budgetLimits?.dailyUSD;

    if (limit && daily + estimatedCost > limit) {
      return {
        allowed: false,
        reason: `Daily budget exceeded: $${daily.toFixed(2)} / $${limit}`,
        currentSpend: daily,
        limit
      };
    }

    // Warn at threshold
    if (limit && daily + estimatedCost > limit * this.config.budgetAlertThreshold!) {
      console.warn(
        `⚠️ Feature '${featureId}' at ${((daily / limit) * 100).toFixed(0)}% of daily budget`
      );
    }

    return { allowed: true };
  }

  recordCost(featureId: string, cost: number): void {
    const daily = this.dailySpend.get(featureId) || 0;
    this.dailySpend.set(featureId, daily + cost);

    const monthly = this.monthlySpend.get(featureId) || 0;
    this.monthlySpend.set(featureId, monthly + cost);
  }

  getDailyReport(): Record<string, { spend: number; limit: number; percent: number }> {
    // Return formatted report
  }
}
```

2. **Integrate into `ManagedLLMService`**:
```typescript
export class ManagedLLMService {
  private budgetEnforcer?: BudgetEnforcer;

  async generate(request: LLMRequest): Promise<LLMResponse | LLMError> {
    // 1. Estimate cost (before API call)
    if (this.budgetEnforcer) {
      const estimated = this.budgetEnforcer.calculateCost(
        request.prompt.length / 4, // rough estimate
        request.maxTokens || 4000
      );

      const budgetCheck = await this.budgetEnforcer.checkBudget(
        request.featureId,
        estimated
      );

      if (!budgetCheck.allowed) {
        return {
          success: false,
          error: budgetCheck.reason!,
          errorType: 'budget_exceeded'
        };
      }
    }

    // 2. Make API call (existing code)
    const response = await this.anthropic.messages.create({...});

    // 3. Record actual cost (after API call)
    if (this.budgetEnforcer) {
      const actualCost = this.budgetEnforcer.calculateCost(
        response.usage.input_tokens,
        response.usage.output_tokens
      );
      this.budgetEnforcer.recordCost(request.featureId, actualCost);
    }

    // ... rest of existing logic
  }

  getBudgetReport(): string {
    return this.budgetEnforcer?.getDailyReport() || 'Budget enforcement not enabled';
  }
}
```

**Files to Create**:
- `src/core/budget-enforcer.ts` (~200 lines)
- `src/core/budget-enforcer.test.ts` (~100 lines)

**Files to Modify**:
- `src/core/managed-llm-service.ts` (+50 lines)
- `src/types/index.ts` (add BudgetConfig types)

---

## Enhancement 2: Schema Validation

### Current State
**What exists**: Type definitions, TypeScript types

**What's missing**: Runtime validation with Zod
- No schema validation
- No type-safe parsing
- No validation error details

### What to Add

**New Config Options**:
```typescript
export interface LLMRequest {
  // ... existing fields ...

  // NEW: Schema validation
  outputSchema?: z.ZodSchema;  // Optional Zod schema
  validateOutput?: boolean;     // Default: true if schema provided
}

export interface LLMResponse {
  // ... existing fields ...

  // NEW: Validation info
  validated?: boolean;
  validationErrors?: string[];
}
```

**Implementation**:

1. **Add Zod dependency**:
```bash
npm install zod
```

2. **Create `src/core/schema-validator.ts`**:
```typescript
import { z } from 'zod';

export class SchemaValidator {
  validateOutput<T>(
    rawOutput: string,
    schema: z.ZodSchema<T>
  ): {
    success: boolean;
    data?: T;
    errors?: string[];
  } {
    try {
      // Parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawOutput);
      } catch {
        return {
          success: false,
          errors: [
            'Invalid JSON format',
            'LLM did not return valid JSON'
          ]
        };
      }

      // Validate against schema
      const result = schema.safeParse(parsed);

      if (!result.success) {
        return {
          success: false,
          errors: result.error.errors.map(err =>
            `${err.path.join('.')}: ${err.message}`
          )
        };
      }

      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      return {
        success: false,
        errors: [`Unexpected error: ${error}`]
      };
    }
  }
}

export class LLMOutputValidationError extends Error {
  constructor(
    message: string,
    public validationErrors: string[],
    public rawOutput: string
  ) {
    super(message);
    this.name = 'LLMOutputValidationError';
  }
}
```

3. **Integrate into `ManagedLLMService`**:
```typescript
export class ManagedLLMService {
  private schemaValidator = new SchemaValidator();

  async generate(request: LLMRequest): Promise<LLMResponse | LLMError> {
    // ... existing code to get response ...

    // NEW: Validate output if schema provided
    if (request.outputSchema && request.validateOutput !== false) {
      const validation = this.schemaValidator.validateOutput(
        response.content[0].text,
        request.outputSchema
      );

      if (!validation.success) {
        return {
          success: false,
          error: 'Output validation failed',
          errorType: 'validation_error',
          validationErrors: validation.errors
        };
      }

      return {
        success: true,
        content: validation.data, // Type-safe!
        validated: true,
        // ... rest of response
      };
    }

    // ... existing return
  }
}
```

**Files to Create**:
- `src/core/schema-validator.ts` (~100 lines)
- `src/core/schema-validator.test.ts` (~100 lines)

**Files to Modify**:
- `src/core/managed-llm-service.ts` (+30 lines)
- `src/types/index.ts` (add schema types)
- `package.json` (add zod dependency)

---

## Usage Examples

### With Budget Enforcement

```typescript
const service = new ManagedLLMService({
  apiKey: process.env.ANTHROPIC_API_KEY,

  // Existing features
  autoEvaluate: true,
  enableCaching: true,
  enableRateLimiting: true,

  // NEW: Budget enforcement
  enableBudgetEnforcement: true,
  budgetLimits: {
    dailyUSD: 10,
    monthlyUSD: 200,
    perCallUSD: 0.50
  },
  budgetAlertThreshold: 0.80  // Alert at 80%
});

const response = await service.generate({
  featureId: 'brand-analysis',
  taskDescription: 'Generate brand identity',
  prompt: 'Create a brand identity for...'
});

// Check budget status
console.log(service.getBudgetReport());
// Output:
// brand-analysis: $2.50 / $10.00 (25%)
```

### With Schema Validation

```typescript
import { z } from 'zod';

// Define schema
const BrandIdentitySchema = z.object({
  name: z.string().min(1),
  tagline: z.string().min(10),
  colors: z.array(z.string()).min(3).max(5),
  tone: z.enum(['professional', 'playful', 'innovative']),
  keywords: z.array(z.string()).max(10)
});

type BrandIdentity = z.infer<typeof BrandIdentitySchema>;

// Use with validation
const response = await service.generate({
  featureId: 'brand-generation',
  taskDescription: 'Generate brand identity',
  prompt: 'Create a brand identity...',
  outputSchema: BrandIdentitySchema,  // NEW!
  validateOutput: true
});

if (response.success) {
  const brand: BrandIdentity = response.content; // Type-safe!
  console.log(brand.name);
  console.log(brand.colors);
} else if (response.errorType === 'validation_error') {
  console.error('Validation errors:', response.validationErrors);
}
```

---

## Implementation Timeline

### Week 1: Budget Enforcement
- [ ] Day 1-2: Create `budget-enforcer.ts`
- [ ] Day 3: Integrate into `ManagedLLMService`
- [ ] Day 4: Write tests
- [ ] Day 5: Update documentation

### Week 2: Schema Validation
- [ ] Day 1-2: Create `schema-validator.ts`
- [ ] Day 3: Integrate into `ManagedLLMService`
- [ ] Day 4: Write tests
- [ ] Day 5: Update documentation

### Week 3: Testing & Integration
- [ ] Test in brand-design-agent
- [ ] Test in flyberry-brand-research
- [ ] Update example projects
- [ ] Write migration guide

### Week 4: Release
- [ ] Update CHANGELOG.md
- [ ] Bump version to 0.3.0
- [ ] npm publish
- [ ] Update all projects to use new version

---

## Testing Plan

### Unit Tests

**Budget Enforcer**:
```typescript
describe('BudgetEnforcer', () => {
  it('should allow calls under budget', () => {
    const enforcer = new BudgetEnforcer({ dailyUSD: 10 });
    const result = enforcer.checkBudget('feature', 5);
    expect(result.allowed).toBe(true);
  });

  it('should block calls over budget', () => {
    const enforcer = new BudgetEnforcer({ dailyUSD: 10 });
    enforcer.recordCost('feature', 9);
    const result = enforcer.checkBudget('feature', 2);
    expect(result.allowed).toBe(false);
  });

  it('should alert at threshold', () => {
    // Test 80% alert
  });
});
```

**Schema Validator**:
```typescript
describe('SchemaValidator', () => {
  const schema = z.object({ name: z.string() });

  it('should validate correct output', () => {
    const validator = new SchemaValidator();
    const result = validator.validateOutput('{"name": "Test"}', schema);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'Test' });
  });

  it('should reject invalid JSON', () => {
    const validator = new SchemaValidator();
    const result = validator.validateOutput('invalid', schema);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Invalid JSON format');
  });

  it('should reject schema mismatch', () => {
    const validator = new SchemaValidator();
    const result = validator.validateOutput('{"wrong": "field"}', schema);
    expect(result.success).toBe(false);
  });
});
```

### Integration Tests

**Test in brand-design-agent**:
```typescript
// Update llm-service.ts
const service = new ManagedLLMService({
  // ... existing config ...
  enableBudgetEnforcement: true,
  budgetLimits: { dailyUSD: 10 }
});

// Test with real calls
const response = await service.generate({
  featureId: 'test',
  prompt: 'Test prompt',
  outputSchema: TestSchema
});

expect(response.success).toBe(true);
expect(response.validated).toBe(true);
```

---

## Migration Guide for Existing Projects

### brand-design-agent

**Current** (`src/services/llm-service.ts`):
```typescript
export function createManagedLLMService() {
  return new ManagedLLMService({
    apiKey: process.env.ANTHROPIC_API_KEY,
    autoEvaluate: true,
    enableCaching: true,
    enableRateLimiting: true,
    // ...
  });
}
```

**After enhancement**:
```typescript
export function createManagedLLMService() {
  return new ManagedLLMService({
    apiKey: process.env.ANTHROPIC_API_KEY,
    autoEvaluate: true,
    enableCaching: true,
    enableRateLimiting: true,

    // NEW: Add budget enforcement
    enableBudgetEnforcement: true,
    budgetLimits: {
      dailyUSD: 10,
      monthlyUSD: 200,
      perCallUSD: 0.50
    },
    budgetAlertThreshold: 0.80
  });
}

// NEW: Define schemas
export const BrandIdentitySchema = z.object({
  name: z.string(),
  tagline: z.string(),
  colors: z.array(z.string()),
  // ...
});

// NEW: Use with validation
export async function generateBrandContent(
  featureId: string,
  taskDescription: string,
  prompt: string
) {
  const service = getManagedLLMService();

  return service.generate({
    featureId,
    taskDescription,
    prompt,
    outputSchema: BrandIdentitySchema  // NEW!
  });
}
```

---

## Benefits After Enhancement

### Before
- ✅ Quality evaluation
- ✅ Caching
- ⚠️ Rate limiting (request count only)
- ⚠️ No budget enforcement
- ⚠️ No schema validation

### After
- ✅ Quality evaluation
- ✅ Caching
- ✅ Rate limiting (request count)
- ✅ **Budget enforcement (dollar-based)** ⬅️ NEW
- ✅ **Schema validation (Zod)** ⬅️ NEW

### Feature Parity with ui-ux-audit-tool

| Feature | ui-ux (standalone) | llm-squared (before) | llm-squared (after) |
|---------|-------------------|---------------------|---------------------|
| Cost Monitoring | ✅ | ✅ | ✅ |
| Budget Enforcement | ✅ | ❌ | ✅ NEW |
| Prompt Versioning | ✅ | ✅ | ✅ |
| Schema Validation | ✅ | ❌ | ✅ NEW |
| Quality Evaluation | ❌ | ✅ | ✅ |
| Caching | ❌ | ✅ | ✅ |
| Rate Limiting | ❌ | ✅ | ✅ |

**Result**: llm-squared becomes the **complete solution** for all projects!

---

## Documentation Updates

### Files to Update

1. **README.md**:
   - Add budget enforcement section
   - Add schema validation section
   - Update feature list

2. **QUICK_START.md**:
   - Add budget config example
   - Add schema usage example

3. **CLAUDE.md**:
   - Update feature list
   - Add new config options
   - Update usage examples

4. **CHANGELOG.md**:
   ```markdown
   ## [0.3.0] - 2025-10-XX

   ### Added
   - Budget enforcement (dollar-based limits)
   - Schema validation with Zod
   - Budget alerts at configurable thresholds
   - Daily/monthly/per-call cost limits
   - Type-safe output parsing

   ### Enhanced
   - ManagedLLMService now includes budget checks
   - LLMRequest supports outputSchema
   - LLMResponse includes validation info
   ```

---

## Rollout Plan

### Phase 1: Implement (Week 1-2)
- Add budget enforcer
- Add schema validator
- Write unit tests
- Update types

### Phase 2: Test (Week 3)
- Test in brand-design-agent
- Test in flyberry-brand-research
- Fix any issues
- Update examples

### Phase 3: Release (Week 4)
- Update documentation
- Bump version to 0.3.0
- Publish to npm (if local, just build)
- Update all projects

---

## Success Metrics

**After enhancement, projects using llm-squared will have**:
- ✅ 100% feature parity with standalone patterns
- ✅ Budget protection (no surprise bills)
- ✅ Type-safe outputs (no runtime errors)
- ✅ All production features (quality, caching, rate limiting)
- ✅ One framework to rule them all

**No need for**:
- ❌ Copy-pasting standalone files
- ❌ Multiple solutions (standalone vs framework)
- ❌ Manual budget tracking

---

**Status**: Ready to implement
**Priority**: High (completes Phase 0 findings)
**Estimated Effort**: 4 weeks
**Impact**: Makes llm-squared the complete solution for all LLM projects
