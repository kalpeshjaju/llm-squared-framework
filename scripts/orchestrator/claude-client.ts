/**
 * Claude Client - Communicates with Anthropic API
 * Handles code fixes and responses to Codex feedback
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeResponseResult, Issue, PRContext } from '../types.js';

export class ClaudeClient {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Generate code fixes based on Codex feedback
   */
  async respondToFeedback(
    prContext: PRContext,
    issues: Issue[],
    previousAttempts: number
  ): Promise<ClaudeResponseResult> {
    const startTime = Date.now();

    const prompt = this.buildPrompt(prContext, issues, previousAttempts);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

      // Calculate cost (Sonnet 4.5 pricing: $3/MTok input, $15/MTok output)
      const inputCost = (response.usage.input_tokens / 1000000) * 3;
      const outputCost = (response.usage.output_tokens / 1000000) * 15;
      const cost = inputCost + outputCost;

      // Parse Claude's response
      const result = this.parseClaudeResponse(responseText);

      return {
        status: 'success',
        commitSha: 'pending', // Will be filled by orchestrator after commit
        filesModified: result.filesModified,
        issuesAddressed: result.issuesAddressed,
        newCommits: [],
        explanation: result.explanation,
        cost,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        commitSha: '',
        filesModified: [],
        issuesAddressed: 0,
        newCommits: [],
        explanation: `Failed to generate fixes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        cost: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private buildPrompt(prContext: PRContext, issues: Issue[], previousAttempts: number): string {
    const issuesList = issues
      .map(
        (issue, i) =>
          `${i + 1}. **${issue.severity.toUpperCase()}** in \`${issue.file}:${issue.line}\`
   - Type: ${issue.type}
   - Issue: ${issue.message}
   - Suggestion: ${issue.suggestion || 'Fix this issue'}`
      )
      .join('\n\n');

    return `You are Claude, acting as the "Maker" in a Maker-Checker workflow for code review.

**Your Role**: Fix code issues identified by Codex (the Checker).

**PR Context**:
- Repository: ${prContext.repository}
- PR #${prContext.number}: ${prContext.title}
- Branch: ${prContext.branch}
- Files changed: ${prContext.files.length}
- Previous improvement attempts: ${previousAttempts}

**Issues to Fix** (${issues.length} total):

${issuesList}

**Instructions**:
1. Analyze each issue carefully
2. Provide specific code fixes
3. Explain your changes clearly
4. Focus on the root cause, not just symptoms
5. Ensure fixes don't introduce new issues

**Response Format** (use exactly this structure):

## Files Modified
- path/to/file1.ts
- path/to/file2.ts

## Issues Addressed
Fixed ${issues.length} issues:
1. [Brief description of fix for issue 1]
2. [Brief description of fix for issue 2]
...

## Code Changes

### path/to/file1.ts
\`\`\`typescript
// Your fixed code here
\`\`\`

### path/to/file2.ts
\`\`\`typescript
// Your fixed code here
\`\`\`

## Explanation
[Brief explanation of your approach and why these fixes work]

Now provide the fixes:`;
  }

  private parseClaudeResponse(response: string): {
    filesModified: string[];
    issuesAddressed: number;
    explanation: string;
  } {
    const filesModified: string[] = [];
    let issuesAddressed = 0;
    let explanation = '';

    // Extract files modified
    const filesMatch = response.match(/## Files Modified\n([\s\S]*?)(?=\n##|$)/);
    if (filesMatch) {
      const fileLines = filesMatch[1].trim().split('\n');
      filesModified.push(...fileLines.map((line) => line.replace(/^-\s*/, '').trim()).filter(Boolean));
    }

    // Extract issues addressed
    const issuesMatch = response.match(/## Issues Addressed\n([\s\S]*?)(?=\n##|$)/);
    if (issuesMatch) {
      const issueLines = issuesMatch[1].split('\n').filter((line) => line.match(/^\d+\./));
      issuesAddressed = issueLines.length;
    }

    // Extract explanation
    const explanationMatch = response.match(/## Explanation\n([\s\S]*?)$/);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    return {
      filesModified,
      issuesAddressed,
      explanation: explanation || 'Fixed identified issues',
    };
  }
}
