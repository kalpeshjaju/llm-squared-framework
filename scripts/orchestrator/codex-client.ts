/**
 * Codex Client - Communicates with OpenAI API (GPT-5-Codex)
 * Handles code review and quality assessment
 */

import OpenAI from 'openai';
import type { CodexReviewResult, Issue, PRContext, SecurityIssue, PerformanceIssue } from '../types.js';

export class CodexClient {
  private client: OpenAI;
  private model: string = 'gpt-5-codex';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Review PR code and identify issues
   */
  async reviewCode(prContext: PRContext, agentsContext?: string): Promise<CodexReviewResult> {
    const startTime = Date.now();

    const prompt = this.buildReviewPrompt(prContext, agentsContext);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are Codex, an expert code reviewer acting as the "Checker" in a Maker-Checker workflow. Your role is to identify issues, suggest improvements, and assess code quality objectively.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      });

      const responseText = response.choices[0]?.message?.content || '';

      // Calculate cost (GPT-5-Codex pricing: same as GPT-5)
      const inputCost = ((response.usage?.prompt_tokens || 0) / 1000000) * 3;
      const outputCost = ((response.usage?.completion_tokens || 0) / 1000000) * 15;
      const cost = inputCost + outputCost;

      // Parse Codex's review
      const result = this.parseCodexReview(responseText);

      return {
        status: 'success',
        issuesFound: result.issues,
        overallQuality: result.qualityScore,
        recommendations: result.recommendations,
        securityIssues: result.securityIssues,
        performanceIssues: result.performanceIssues,
        rawResponse: responseText,
        cost,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        issuesFound: [],
        overallQuality: 0,
        recommendations: [],
        securityIssues: [],
        performanceIssues: [],
        rawResponse: '',
        cost: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private buildReviewPrompt(prContext: PRContext, agentsContext?: string): string {
    const filesSummary = prContext.files
      .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
      .join('\n');

    const patches = prContext.files
      .filter((f) => f.patch)
      .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
      .join('\n\n');

    return `# Code Review Request

## PR Context
**Repository**: ${prContext.repository}
**PR #${prContext.number}**: ${prContext.title}
**Author**: ${prContext.author}
**Branch**: ${prContext.branch} → ${prContext.baseBranch}

**Description**:
${prContext.description}

## Files Changed (${prContext.files.length} files)
${filesSummary}

## Code Changes
${patches}

${agentsContext ? `## Repository Context\n${agentsContext}\n` : ''}

## Review Focus Areas
1. **Security**: Hardcoded secrets, injection risks, authentication issues
2. **Performance**: Blocking operations, inefficient algorithms, memory leaks
3. **Type Safety**: Missing types, unsafe assertions, any usage
4. **Code Quality**: Complexity, readability, maintainability
5. **Best Practices**: Project standards, framework patterns

## Response Format

Provide your review in this exact structure:

### Quality Score
Overall: [0.0-1.0]

### Issues Found

#### Security Issues
[List any security issues, or "None found"]

#### Performance Issues
[List any performance issues, or "None found"]

#### Type Safety Issues
[List any type safety issues, or "None found"]

#### Code Quality Issues
[List any code quality issues, or "None found"]

### Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
...

### Summary
[Brief summary of the review]

Now provide your detailed code review:`;
  }

  private parseCodexReview(response: string): {
    issues: Issue[];
    qualityScore: number;
    recommendations: string[];
    securityIssues: SecurityIssue[];
    performanceIssues: PerformanceIssue[];
  } {
    const issues: Issue[] = [];
    const securityIssues: SecurityIssue[] = [];
    const performanceIssues: PerformanceIssue[] = [];
    const recommendations: string[] = [];
    let qualityScore = 0.8; // Default

    // Extract quality score
    const scoreMatch = response.match(/Overall:\s*(\d+\.?\d*)/i);
    if (scoreMatch) {
      qualityScore = parseFloat(scoreMatch[1]);
    }

    // Extract recommendations
    const recMatch = response.match(/### Recommendations\n([\s\S]*?)(?=\n###|$)/);
    if (recMatch) {
      const recLines = recMatch[1].split('\n').filter((line) => line.match(/^\d+\./));
      recommendations.push(...recLines.map((line) => line.replace(/^\d+\.\s*/, '').trim()));
    }

    // Parse issues from different sections
    const securitySection = response.match(/#### Security Issues\n([\s\S]*?)(?=\n####|$)/);
    const performanceSection = response.match(/#### Performance Issues\n([\s\S]*?)(?=\n####|$)/);
    const typeSection = response.match(/#### Type Safety Issues\n([\s\S]*?)(?=\n####|$)/);
    const qualitySection = response.match(/#### Code Quality Issues\n([\s\S]*?)(?=\n####|$)/);

    // Extract security issues
    if (securitySection && !securitySection[1].includes('None found')) {
      const lines = securitySection[1].split('\n').filter((line) => line.trim() && !line.includes('None'));
      lines.forEach((line) => {
        const issue = this.parseIssueLine(line, 'security');
        if (issue) issues.push(issue);
      });
    }

    // Extract performance issues
    if (performanceSection && !performanceSection[1].includes('None found')) {
      const lines = performanceSection[1].split('\n').filter((line) => line.trim() && !line.includes('None'));
      lines.forEach((line) => {
        const issue = this.parseIssueLine(line, 'performance');
        if (issue) issues.push(issue);
      });
    }

    // Extract type safety issues
    if (typeSection && !typeSection[1].includes('None found')) {
      const lines = typeSection[1].split('\n').filter((line) => line.trim() && !line.includes('None'));
      lines.forEach((line) => {
        const issue = this.parseIssueLine(line, 'type_safety');
        if (issue) issues.push(issue);
      });
    }

    // Extract code quality issues
    if (qualitySection && !qualitySection[1].includes('None found')) {
      const lines = qualitySection[1].split('\n').filter((line) => line.trim() && !line.includes('None'));
      lines.forEach((line) => {
        const issue = this.parseIssueLine(line, 'code_quality');
        if (issue) issues.push(issue);
      });
    }

    return {
      issues,
      qualityScore,
      recommendations,
      securityIssues,
      performanceIssues,
    };
  }

  private parseIssueLine(line: string, type: Issue['type']): Issue | null {
    // Try to extract file and line number
    const fileMatch = line.match(/`([^`]+):(\d+)`/);

    if (!fileMatch) {
      // Generic issue without specific location
      return {
        type,
        severity: type === 'security' ? 'error' : 'warning',
        file: 'unknown',
        line: 0,
        message: line.replace(/^[-*]\s*/, '').trim(),
      };
    }

    return {
      type,
      severity: type === 'security' ? 'error' : 'warning',
      file: fileMatch[1],
      line: parseInt(fileMatch[2]),
      message: line.replace(/^[-*]\s*/, '').trim(),
    };
  }
}
