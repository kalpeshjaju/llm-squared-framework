# 🤖 Maker-Checker System - User Guide

> Complete guide for non-technical users

**Last Updated**: 2025-10-16

---

## What Is This?

An automated system where:
- **Claude (Maker)** creates or fixes code
- **Codex (Checker)** reviews the code
- They **iterate automatically** until the code is perfect
- **You do nothing** except merge when ready

---

## Quick Start (30 Minutes)

### Step 1: Get API Keys (10 minutes)

You need 3 API keys:

#### 1. GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Name it: "Maker-Checker System"
4. Select these permissions:
   - ✅ `repo` (all sub-options)
   - ✅ `workflow`
5. Click "Generate token"
6. **Copy the token** - you can't see it again!

#### 2. Claude API Key

1. Go to https://console.anthropic.com/settings/keys
2. Click "Create Key"
3. Name it: "Maker-Checker"
4. **Copy the key** (starts with `sk-ant-api03-`)

#### 3. OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Name it: "Maker-Checker Codex"
4. **Copy the key** (starts with `sk-`)

#### 4. Slack Webhook (Optional)

1. Go to https://api.slack.com/messaging/webhooks
2. Create a webhook for your workspace
3. **Copy the URL**

---

### Step 2: Add Keys to GitHub (5 minutes)

For each repository you want to enable:

1. Go to the repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `SLACK_WEBHOOK` | Your Slack webhook (optional) |

**Note**: `GITHUB_TOKEN` is automatically provided by GitHub Actions.

---

### Step 3: Copy System to Repository (10 minutes)

1. Copy the entire `maker-checker-system` folder to your repository:

```bash
# From Development directory
cp -r maker-checker-system/. your-repo-name/
```

2. Make sure these files are copied:
   - `.github/workflows/` (3 workflow files)
   - `config/autonomous-config.yml`
   - `scripts/` (all TypeScript files)
   - `package.json`

3. Install dependencies in your repository:

```bash
cd your-repo-name
npm install
```

4. Commit and push:

```bash
git add .
git commit -m "feat: add autonomous maker-checker system"
git push
```

---

### Step 4: Enable GitHub Actions (2 minutes)

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. If prompted, click **"I understand my workflows, go ahead and enable them"**

---

### Step 5: Test It! (5 minutes)

1. Create a test PR:

```bash
# Make a small change
echo "# Test" >> TEST.md
git checkout -b test-maker-checker
git add TEST.md
git commit -m "test: maker-checker"
git push -u origin test-maker-checker
```

2. Go to GitHub and create the PR

3. Watch the **Actions** tab - you should see "Autonomous Maker-Checker" running!

4. The bot will post comments on your PR showing its progress

---

## How It Works

### Automatic Flow

Once set up, this happens automatically for every PR:

```
1. You (or teammate) create a PR
   ↓
2. 🤖 GitHub Action triggers
   ↓
3. 🤖 Codex reviews the code (30-60 seconds)
   ↓
4. 🤖 Codex posts review comments on PR
   ↓
5. 🤖 Claude reads the feedback
   ↓
6. 🤖 Claude makes fixes and pushes new commits
   ↓
7. 🤖 Codex re-reviews the new code
   ↓
8. 🤖 Repeat steps 5-7 until perfect (max 5 times)
   ↓
9. ✅ Bot posts: "Ready to merge!"
   ↓
10. You review and click "Merge"
```

**You do**: Create PR, review final result, merge
**Bots do**: Everything else

---

## What You'll See

### On GitHub

The bot posts comments on your PR like this:

```markdown
## 🤖 Maker-Checker Bot

Iteration 1/5 - Codex reviewing...

Cost so far: $0.00
```

Then:

```markdown
## Quality Assessment - Iteration 1/5

**Overall Score**: 72.5% ⚠️ (Grade: C - Needs Work)

### Category Scores
- 🔒 Security: 85.0%
- ⚡ Performance: 68.0%
- 🔤 Type Safety: 70.0%
- 📝 Code Quality: 75.0%
- ✅ Best Practices: 65.0%

### Issues Found (8 total)
- **ERROR** `src/file.ts:42`: Password not hashed
- **WARNING** `src/file.ts:67`: Blocking operation
...
```

Then:

```markdown
## ✅ Claude Fixed Issues

**Issues Addressed**: 8
**Files Modified**: 2

Fixed all identified issues including password hashing and async operations.
```

Finally:

```markdown
## 🎯 Merge Decision

Quality threshold met: 87.3% | Iterations used: 2/5 | Total cost: $2.34 | All checks passed ✅

👀 **Action**: Ready for your review and manual merge
```

### On Slack (if enabled)

```
🤖 PR #123 (ui-ux-audit-tool)
Iteration 2 Complete
Quality: 0.75 → 0.87 (+0.12) 📈
Issues fixed: 8/8
Status: Re-reviewing...
```

```
🎉 PR #123 - Ready to Merge!
Final Quality: 0.87/1.0
Iterations: 2/5
Cost: $2.34
[Merge Now] [Review]
```

---

## Manual Commands

You can control the bot by commenting on PRs:

| Command | What It Does |
|---------|--------------|
| `/retry` | Restart the process from scratch |
| `/stop` | Stop the current process |
| `/status` | Show current status and progress |
| `/force-merge` | Bypass quality checks (not recommended!) |
| `/debug` | Show detailed debugging information |

**Example**: Comment `/retry` on a PR to restart the process.

---

## Configuration

### Change Settings (No Coding!)

Edit `config/autonomous-config.yml`:

```yaml
# How many improvement attempts?
max_iterations: 5

# What quality score is needed?
quality_threshold: 0.85

# Auto-merge when quality exceeds this?
auto_merge_enabled: false
auto_merge_threshold: 0.90

# Cost protection
max_cost_per_pr: 5.00        # Stop at $5 per PR
monthly_cost_cap: 100.00     # Stop at $100/month
```

### Common Configurations

**Fast (Good for internal tools)**:
```yaml
max_iterations: 3
quality_threshold: 0.80
auto_merge_enabled: true
```

**Balanced (Recommended)**:
```yaml
max_iterations: 5
quality_threshold: 0.85
auto_merge_enabled: false
```

**Strict (Best for production)**:
```yaml
max_iterations: 7
quality_threshold: 0.90
auto_merge_enabled: false
```

---

## Cost Management

### Typical Costs

**Per PR** (2-3 iterations):
- Claude: $0.80 - $1.50
- Codex: $0.50 - $1.00
- **Total: $1.30 - $2.50 per PR**

**Monthly** (20 PRs):
- **$26 - $50/month**

**Cost Savings**:
- Manual code review: ~$500-1000/month (developer time)
- Bug fixes later: ~$1000+/month (technical debt)
- **ROI: ~20x savings**

### Built-In Cost Protection

The system automatically:
- ✅ Stops at $5 per PR (configurable)
- ✅ Stops at $100/month (configurable)
- ✅ Warns at 75% of limit
- ✅ Sends weekly cost reports

### View Costs

1. Check GitHub Actions logs for per-PR costs
2. Weekly cost reports in GitHub Issues
3. Slack notifications (if enabled)

---

## Troubleshooting

### Bot Not Starting?

**Check**:
1. Are GitHub Actions enabled? (Actions tab)
2. Are API keys set? (Settings → Secrets)
3. Is the workflow file present? (`.github/workflows/autonomous-maker-checker.yml`)

**Fix**:
- Enable Actions in repository settings
- Verify all 3 API keys are set correctly
- Re-push the workflow files

### Bot Posted Error?

**Check**:
- Click the Actions tab
- Find the failed run
- Look at the error message

**Common fixes**:
- API key invalid → Update in Secrets
- API rate limit → Wait an hour, try again
- Cost cap exceeded → Check config, increase if needed

### Quality Not Improving?

**After 3+ iterations without improvement**:

The bot will post:
```
⚠️ Stagnation Detected
Quality not improving after 3 iterations.
Recommendation: Manual review may be needed.
```

**What to do**:
1. Review the bot's feedback manually
2. Make manual fixes if needed
3. Comment `/retry` to restart
4. Or just merge if quality is "good enough"

### Cost Too High?

**Reduce costs by**:
1. Lower `max_iterations` (3 instead of 5)
2. Raise `quality_threshold` slightly
3. Review fewer PRs automatically

Edit `config/autonomous-config.yml`:
```yaml
max_iterations: 3              # Fewer attempts
max_cost_per_pr: 3.00         # Lower cap
```

---

## Best Practices

### ✅ Do

- Let the bot handle routine code reviews
- Review the final result before merging
- Check weekly cost reports
- Adjust config based on your needs
- Use for all PRs, not just large ones

### ❌ Don't

- Don't bypass quality checks without good reason
- Don't ignore cost warnings
- Don't merge without reviewing final code
- Don't set quality threshold too low
- Don't disable safety features

---

## FAQ

**Q: Does it work for all programming languages?**
A: Yes! Codex and Claude support all major languages.

**Q: Will it merge automatically?**
A: Only if you set `auto_merge_enabled: true`. Default is `false` (you approve).

**Q: What if I disagree with the bot?**
A: You have final say! Review and merge/reject as you see fit.

**Q: Can I use it on private repos?**
A: Yes! It works on both public and private repositories.

**Q: Does it replace human code review?**
A: No, it **augments** it. The bot catches common issues, you provide strategic review.

**Q: What if the bot makes mistakes?**
A: Codex re-reviews after Claude's changes. You're the final checkpoint.

**Q: How long does it take?**
A: 2-5 minutes per iteration. Total: 5-25 minutes for full cycle.

**Q: Can I pause it?**
A: Yes! Comment `/stop` on any PR.

---

## Support

### Getting Help

1. **Check this guide first**
2. **Check Actions logs** for error details
3. **Check STATUS.md** for known issues
4. **Comment `/debug`** on the PR for diagnostics

### Reporting Issues

If something's broken:
1. Note the PR number
2. Copy the error from Actions logs
3. Create a GitHub issue with details

---

## Summary

### What You Set Up (One Time)
- ✅ Get 3 API keys (10 min)
- ✅ Add keys to GitHub Secrets (5 min)
- ✅ Copy system to repository (10 min)
- ✅ Enable Actions (2 min)
- ✅ Test with sample PR (5 min)

**Total**: 30 minutes one-time setup

### What Happens After
- ✅ Create PR (you do this)
- ✅ Bot runs automatically (0 effort from you)
- ✅ Bot posts updates (you watch)
- ✅ Bot says "Ready" (2-5 iterations)
- ✅ You review and merge (final decision is yours)

**Time per PR**: 5-10 minutes total (mostly automated)
**Cost per PR**: $1-3 (ROI: 20x savings)

---

**Ready to get started? Follow Step 1!**

---

**Created**: 2025-10-16
**For**: Non-technical users
**System**: Maker-Checker MVP
