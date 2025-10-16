# Project - Codex Agent Guide

## Repository Overview

This repository is part of Kalpesh's development ecosystem.

**Tech Stack**: TypeScript, Node.js

## Code Standards

### TypeScript Conventions

- **Strict mode**: Always enabled
- **No `any` types**: Use `unknown` or proper types
- **camelCase**: For variables/functions
- **Specific imports**: No wildcard imports

### File Size Limits

- **Files**: <500 lines (excellent), <600 (acceptable), >800 (MUST split)
- **Functions**: <100 lines (excellent), <150 (acceptable), >200 (MUST refactor)

### Error Handling

All errors must have context and actionable guidance:

```typescript
// Good
throw new Error(
  `Failed to process ${filename}: File not found. ` +
  `Check file path and permissions.`
);
```

## Testing

### Quality Gates

Before committing:

```bash
npm run type-check  # MUST pass
npm run lint       # MUST pass
npm test           # For significant changes
```

## When Reviewing Pull Requests

### Check For

- ✅ Type-check passes
- ✅ Linting passes
- ✅ Tests pass
- ✅ Files <500 lines
- ✅ Functions <100 lines
- ✅ Error messages have context
- ✅ No console.log statements
- ✅ No hardcoded secrets

### Common Issues to Watch

- ❌ Large files (>500 lines) - request split
- ❌ Generic error messages - request context
- ❌ Missing tests for new features
- ❌ `any` types - request proper typing
- ❌ Wildcard imports - request specific imports

---

**Last Updated**: 2025-10-16
**Maintained By**: Kalpesh Jaju
