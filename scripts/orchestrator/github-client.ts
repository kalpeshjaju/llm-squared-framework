/**
 * GitHub Client - Interacts with GitHub API
 * Handles PR operations, comments, commits, etc.
 */

import { Octokit } from '@octokit/rest';
import type { PRContext, FileChange, Commit } from '../types.js';

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Get PR context with all relevant information
   */
  async getPRContext(owner: string, repo: string, prNumber: number): Promise<PRContext> {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const { data: files } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    const { data: commits } = await this.octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      number: prNumber,
      title: pr.title,
      description: pr.body || '',
      author: pr.user?.login || 'unknown',
      repository: repo,
      owner,
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      url: pr.html_url,
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author?.name || 'unknown',
        timestamp: c.commit.author?.date || new Date().toISOString(),
        filesChanged: [],
      })),
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status as FileChange['status'],
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
    };
  }

  /**
   * Post a comment on a PR
   */
  async postComment(owner: string, repo: string, prNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }

  /**
   * Update PR status check
   */
  async updateStatusCheck(
    owner: string,
    repo: string,
    sha: string,
    state: 'pending' | 'success' | 'failure' | 'error',
    context: string,
    description: string,
    targetUrl?: string
  ): Promise<void> {
    await this.octokit.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state,
      context,
      description,
      target_url: targetUrl,
    });
  }

  /**
   * Get PR comments
   */
  async getComments(owner: string, repo: string, prNumber: number): Promise<Array<{ user: string; body: string; createdAt: string }>> {
    const { data: comments } = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    return comments.map((c) => ({
      user: c.user?.login || 'unknown',
      body: c.body || '',
      createdAt: c.created_at,
    }));
  }

  /**
   * Check if PR has specific label
   */
  async hasLabel(owner: string, repo: string, prNumber: number, labelName: string): Promise<boolean> {
    const { data: labels } = await this.octokit.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number: prNumber,
    });

    return labels.some((label) => label.name === labelName);
  }

  /**
   * Add label to PR
   */
  async addLabel(owner: string, repo: string, prNumber: number, label: string): Promise<void> {
    await this.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: [label],
    });
  }

  /**
   * Remove label from PR
   */
  async removeLabel(owner: string, repo: string, prNumber: number, label: string): Promise<void> {
    try {
      await this.octokit.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: label,
      });
    } catch (error) {
      // Label might not exist, ignore error
    }
  }

  /**
   * Get PR diff
   */
  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: {
        format: 'diff',
      },
    });

    return data as unknown as string;
  }

  /**
   * Merge PR
   */
  async mergePR(
    owner: string,
    repo: string,
    prNumber: number,
    commitMessage?: string
  ): Promise<{ merged: boolean; sha: string }> {
    try {
      const { data } = await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        commit_message: commitMessage || 'Merged via Maker-Checker automation',
        merge_method: 'squash',
      });

      return {
        merged: data.merged,
        sha: data.sha,
      };
    } catch (error) {
      throw new Error(`Failed to merge PR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if PR is mergeable
   */
  async isPRMergeable(owner: string, repo: string, prNumber: number): Promise<boolean> {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return pr.mergeable === true && pr.mergeable_state === 'clean';
  }

  /**
   * Get CI status
   */
  async getCIStatus(owner: string, repo: string, ref: string): Promise<'success' | 'pending' | 'failure' | 'error'> {
    try {
      const { data: status } = await this.octokit.repos.getCombinedStatusForRef({
        owner,
        repo,
        ref,
      });

      return status.state as 'success' | 'pending' | 'failure' | 'error';
    } catch (error) {
      return 'error';
    }
  }
}
