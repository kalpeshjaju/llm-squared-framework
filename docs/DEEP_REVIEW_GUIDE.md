# 🔍 Deep Review System - User Guide

## Overview

The Deep Review system provides a **FREE, thorough code review** using your **Claude Pro subscription** when automated checks detect complex changes.

### Two-Tier Review System:

1. **Automated Quick Review (API-based)**
   - Runs automatically on every PR
   - Fast, lightweight checks
   - Cost: $1-3 per PR

2. **Deep Review (Claude Pro - FREE)**
   - Triggered for complex PRs
   - Uses Claude Code CLI (your Pro subscription)
   - Thorough, comprehensive analysis
   - Cost: **$0** (uses your existing subscription)

---

## How It Works

### Automatic Detection

When you create a PR, the system analyzes:

- **Files Changed**: Number of modified files
- **Lines Changed**: Total additions/deletions
- **Complexity**: Code complexity score
- **Risk Level**: Based on file types modified

### Triggers for Deep Review

The system will prompt you for a deep review when:

- ✅ **Large changeset**: >10 files changed
- ✅ **Significant changes**: >500 lines modified
- ✅ **Core system changes**: Critical files modified
- ✅ **Security-sensitive files**: Auth, secrets, permissions
- ✅ **Database changes**: Migrations, schema updates
- ✅ **API changes**: Multiple endpoints modified
- ✅ **Low test coverage**: <30% of files have tests
- ✅ **Dependency updates**: package.json changes
- ✅ **Configuration changes**: >2 config files modified

### Risk Scoring

- **🔴 High Risk (>70)**: Critical changes, must review
- **🟠 Medium Risk (40-70)**: Important changes, should review
- **🟡 Low Risk (<40)**: Minor changes, optional review

---

## Using Deep Review

### Step 1: GitHub Prompts You

When a PR needs deep review, you'll see a comment like this:

```
🔍 Deep Review Recommended

🔴 HIGH RISK - Risk Score: 85/100

Why Deep Review is Needed:
- 📁 Large changeset: 15 files modified
- 🔧 Core system changes: 3 critical files
- 🔐 Security-sensitive changes: 2 security files

Action Required:
cd your-repo
npm run review:deep
```

### Step 2: Run Deep Review Locally

```bash
# Navigate to your repository
cd your-repo

# Run deep review
npm run review:deep
```

**What happens:**
1. Analyzes all PR changes
2. Reads modified files and diffs
3. Sends comprehensive prompt to Claude Code CLI
4. Claude performs thorough analysis (2-5 minutes)
5. Saves detailed report

### Step 3: Review the Output

The system will:
- Display the full review in your terminal
- Save a detailed report to `.deep-reviews/`
- Provide actionable recommendations

---

## Deep Review Features

### Comprehensive Analysis Covers:

#### 1. Code Quality & Best Practices
- Coding standards compliance
- Readability and maintainability
- Code smells and anti-patterns
- Function/file size appropriateness

#### 2. Architecture & Design
- Architectural fit
- Design concerns
- Abstraction levels
- Separation of responsibilities

#### 3. Security & Safety
- Security vulnerabilities
- Input validation
- Secret handling
- Injection risks

#### 4. Performance & Scalability
- Performance bottlenecks
- Scalability issues
- Resource management
- Memory leaks

#### 5. Testing & Coverage
- Test comprehensiveness
- Edge case coverage
- Test quality
- Test structure

#### 6. Documentation & Maintainability
- Code self-documentation
- Complex logic explanations
- Documentation accuracy
- Future maintainability

#### 7. Error Handling & Resilience
- Error handling completeness
- Error message quality
- Failure resilience
- Edge case handling

#### 8. Dependencies & Integration
- Dependency appropriateness
- Version pinning
- Integration testing
- Breaking change documentation

---

## Review Output Format

### ✅ Strengths
Highlights what's well done in the PR

### ⚠️ Issues Found
Categorized by severity:
- 🔴 **Critical**: Must fix before merge
- 🟠 **High**: Should fix before merge
- 🟡 **Medium**: Should fix soon
- 🔵 **Low**: Nice to have

For each issue:
- **Location**: file:line
- **Issue**: What's wrong
- **Impact**: Why it matters
- **Recommendation**: How to fix

### 💡 Suggestions
Improvements to make code even better

### 🎯 Overall Assessment
- **Quality Score**: X/10
- **Risk Level**: Low/Medium/High
- **Recommendation**: Approve / Request Changes / Reject
- **Reasoning**: Detailed explanation

### 📋 Pre-merge Checklist
- [ ] All critical issues addressed
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Security review complete
- [ ] Performance acceptable

---

## Advanced Usage

### Review Specific PR Number

```bash
npm run review:deep 123
```

### Custom Output Directory

```bash
npm run review:deep --output ./my-reviews
```

### View Help

```bash
npm run review:deep:help
```

---

## Cost Comparison

### Standard PR (Simple Changes)
- **Automated review only**: $1-3
- **No deep review needed**: $0
- **Total**: $1-3

### Complex PR (Needs Deep Review)
- **Automated review**: $1-3
- **Deep review**: **$0** (uses Claude Pro)
- **Total**: $1-3

**Savings**: Deep review adds $0 cost!

---

## Requirements

### For Automated Detection (Always Available)
- GitHub Actions enabled
- GITHUB_TOKEN configured
- Runs on every PR automatically

### For Local Deep Review (When Prompted)
- **Claude Code CLI installed**
- **Claude Pro subscription**
- Git repository with changes

### Installing Claude Code CLI

```bash
# Install globally
npm install -g @anthropic-ai/claude-cli

# Or use with npx (no install needed)
npx @anthropic-ai/claude-cli

# Verify installation
claude --version

# Authenticate (first time only)
claude auth
```

---

## Workflow Example

### Scenario: Adding Authentication System

**You create a PR** with:
- 12 files changed
- 800 lines added
- Changes to auth, security, and database files

**System detects complexity:**
- 🔴 High Risk Score: 95/100
- Multiple trigger conditions met

**GitHub comments:**
```
🔍 Deep Review Recommended

🔴 HIGH RISK - Risk Score: 95/100

Why:
- 📁 Large changeset: 12 files
- 🔧 Core system changes: 2 files
- 🔐 Security-sensitive: 3 files
- 🗄️ Database changes: 1 migration

Run: npm run review:deep
```

**You run deep review:**
```bash
cd your-repo
npm run review:deep
```

**Claude analyzes (3 minutes):**
- Reviews all auth logic
- Checks security vulnerabilities
- Validates database migration
- Tests error handling
- Checks for edge cases

**You get detailed report:**
- 5 critical issues found
- 8 suggestions for improvement
- Security recommendations
- Pre-merge checklist

**You address issues and merge confidently!**

---

## Troubleshooting

### "Claude CLI not found"

**Solution:**
```bash
npm install -g @anthropic-ai/claude-cli
# or
which claude  # verify it's installed
```

### "No changes found"

**Cause**: You're on the main/master branch

**Solution**: Create a feature branch with changes
```bash
git checkout -b feature/my-feature
# Make changes
npm run review:deep
```

### "Authentication failed"

**Solution**: Authenticate Claude CLI
```bash
claude auth
# Follow the prompts
```

### "Deep review taking too long"

**Normal**: Deep reviews take 2-5 minutes for thorough analysis

**If stuck >10 minutes**:
- Check your internet connection
- Verify Claude Pro subscription is active
- Try again: `npm run review:deep`

---

## Best Practices

### When to Run Deep Review

**Always run for:**
- Security-related changes
- Database migrations
- Core system refactoring
- Breaking API changes
- Large feature additions

**Optional for:**
- Simple bug fixes
- Documentation updates
- Minor style changes
- Test additions

### Review Frequency

- Run deep review **before requesting code review** from team
- Re-run after major changes to the PR
- Use for final sanity check before merge

### Acting on Feedback

1. **Critical issues**: Fix before requesting review
2. **High priority**: Fix before merge
3. **Medium priority**: Create follow-up issues
4. **Low priority**: Nice to have, optional

---

## FAQ

### Does this replace human code review?

**No!** This is an additional tool to:
- Catch issues before human review
- Provide thorough analysis quickly
- Ensure nothing is missed
- Improve code quality

Human review is still essential for:
- Business logic validation
- Team knowledge sharing
- Design discussions
- Context-specific decisions

### Why two review systems?

**Automated (API):**
- Fast, runs on every PR
- Catches common issues
- Provides baseline quality

**Deep Review (Claude Pro):**
- Thorough, run when needed
- Catches complex issues
- Free (uses your subscription)

### Can I run deep review on all PRs?

**Yes!** But recommended only when prompted because:
- Takes 2-5 minutes per review
- Most PRs don't need it
- Automated review is sufficient for simple changes

### What if I don't have Claude Pro?

The **automated review still works** with API keys.

Deep review is **optional** for extra thoroughness.

Consider upgrading to Claude Pro if you:
- Create many complex PRs
- Want free deep reviews
- Use Claude for development work

---

## Support

### Questions?
- Check the main [USER_GUIDE.md](./USER_GUIDE.md)
- Review [GitHub Actions logs](https://github.com/your-repo/actions)
- See examples in `.deep-reviews/` directory

### Issues?
- Verify Claude CLI installation: `claude --version`
- Check Claude Pro subscription status
- Ensure git repository has changes
- Review troubleshooting section above

---

## Summary

🎯 **What You Get:**
- Automatic detection of complex PRs
- Smart prompts when deep review needed
- FREE thorough analysis (uses Claude Pro)
- Detailed, actionable recommendations

💰 **Cost:**
- Automated checks: $1-3 per PR
- Deep review: **$0** (Claude Pro)

⚡ **When to Use:**
- System prompts you (always follow prompts!)
- Before requesting team review
- For critical/complex changes
- Final check before merge

🚀 **Next Steps:**
1. Wait for system to prompt you
2. Run `npm run review:deep` when prompted
3. Review detailed analysis
4. Address critical issues
5. Merge with confidence!

---

**Remember**: Deep review is **FREE** with your Claude Pro subscription!

Use it generously for important changes. ✨
