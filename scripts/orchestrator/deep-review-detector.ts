/**
 * Deep Review Detector
 *
 * Analyzes PR complexity and determines if a deep review is needed.
 * When triggered, prompts the user to run local deep review using Claude Pro.
 */

import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';

interface PRAnalysis {
  needsDeepReview: boolean;
  reasons: string[];
  metrics: {
    filesChanged: number;
    linesChanged: number;
    complexity: number;
    riskScore: number;
  };
}

interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
}

/**
 * Analyze PR complexity and determine if deep review is needed
 */
export async function analyzePRComplexity(config: GitHubConfig): Promise<PRAnalysis> {
  const octokit = new Octokit({ auth: config.token });

  // Get PR details
  const { data: pr } = await octokit.pulls.get({
    owner: config.owner,
    repo: config.repo,
    pull_number: config.prNumber,
  });

  // Get PR files
  const { data: files } = await octokit.pulls.listFiles({
    owner: config.owner,
    repo: config.repo,
    pull_number: config.prNumber,
  });

  const metrics = {
    filesChanged: files.length,
    linesChanged: files.reduce((sum, file) => sum + file.changes, 0),
    complexity: 0,
    riskScore: 0,
  };

  const reasons: string[] = [];
  let needsDeepReview = false;

  // Rule 1: Large number of files changed
  if (metrics.filesChanged > 10) {
    needsDeepReview = true;
    reasons.push(`📁 **Large changeset**: ${metrics.filesChanged} files modified (threshold: 10)`);
    metrics.complexity += 2;
  }

  // Rule 2: Large number of lines changed
  if (metrics.linesChanged > 500) {
    needsDeepReview = true;
    reasons.push(`📝 **Significant changes**: ${metrics.linesChanged} lines modified (threshold: 500)`);
    metrics.complexity += 2;
  }

  // Rule 3: Core system files modified
  const coreFiles = files.filter(file =>
    file.filename.includes('core') ||
    file.filename.includes('engine') ||
    file.filename.includes('system') ||
    file.filename.includes('config.ts') ||
    file.filename.includes('types.ts') ||
    file.filename.includes('index.ts')
  );

  if (coreFiles.length > 0) {
    needsDeepReview = true;
    reasons.push(`🔧 **Core system changes**: ${coreFiles.length} critical files modified`);
    metrics.complexity += 3;
    metrics.riskScore += 30;
  }

  // Rule 4: Security-sensitive files
  const securityFiles = files.filter(file =>
    file.filename.includes('auth') ||
    file.filename.includes('security') ||
    file.filename.includes('permissions') ||
    file.filename.includes('secrets') ||
    file.filename.includes('.env')
  );

  if (securityFiles.length > 0) {
    needsDeepReview = true;
    reasons.push(`🔐 **Security-sensitive changes**: ${securityFiles.length} security files modified`);
    metrics.complexity += 4;
    metrics.riskScore += 50;
  }

  // Rule 5: Database schema or migration files
  const dbFiles = files.filter(file =>
    file.filename.includes('migration') ||
    file.filename.includes('schema') ||
    file.filename.includes('database')
  );

  if (dbFiles.length > 0) {
    needsDeepReview = true;
    reasons.push(`🗄️ **Database changes**: ${dbFiles.length} database files modified`);
    metrics.complexity += 3;
    metrics.riskScore += 40;
  }

  // Rule 6: API or integration changes
  const apiFiles = files.filter(file =>
    file.filename.includes('api') ||
    file.filename.includes('endpoint') ||
    file.filename.includes('route') ||
    file.filename.includes('integration')
  );

  if (apiFiles.length > 3) {
    needsDeepReview = true;
    reasons.push(`🌐 **API changes**: ${apiFiles.length} API files modified`);
    metrics.complexity += 2;
    metrics.riskScore += 20;
  }

  // Rule 7: Test file ratio
  const testFiles = files.filter(file =>
    file.filename.includes('.test.') ||
    file.filename.includes('.spec.') ||
    file.filename.includes('__tests__')
  );
  const codeFiles = files.filter(file => !file.filename.includes('.test.') && !file.filename.includes('.spec.'));
  const testRatio = codeFiles.length > 0 ? testFiles.length / codeFiles.length : 1;

  if (testRatio < 0.3 && codeFiles.length > 5) {
    needsDeepReview = true;
    reasons.push(`⚠️ **Low test coverage**: Only ${Math.round(testRatio * 100)}% of files have tests (threshold: 30%)`);
    metrics.complexity += 2;
    metrics.riskScore += 25;
  }

  // Rule 8: Package.json or lock file changes (dependency updates)
  const dependencyFiles = files.filter(file =>
    file.filename.includes('package.json') ||
    file.filename.includes('package-lock.json') ||
    file.filename.includes('yarn.lock') ||
    file.filename.includes('requirements.txt') ||
    file.filename.includes('Gemfile')
  );

  if (dependencyFiles.length > 0) {
    needsDeepReview = true;
    reasons.push(`📦 **Dependency changes**: ${dependencyFiles.length} dependency files modified`);
    metrics.complexity += 1;
    metrics.riskScore += 15;
  }

  // Rule 9: Configuration files
  const configFiles = files.filter(file =>
    file.filename.includes('.github/workflows') ||
    file.filename.includes('config') ||
    file.filename.includes('.yml') ||
    file.filename.includes('.yaml')
  );

  if (configFiles.length > 2) {
    needsDeepReview = true;
    reasons.push(`⚙️ **Configuration changes**: ${configFiles.length} config files modified`);
    metrics.complexity += 1;
    metrics.riskScore += 10;
  }

  // Calculate overall risk score
  metrics.riskScore = Math.min(100, metrics.riskScore + (metrics.complexity * 5));

  return {
    needsDeepReview,
    reasons,
    metrics,
  };
}

/**
 * Post deep review prompt to GitHub PR
 */
export async function promptForDeepReview(config: GitHubConfig, analysis: PRAnalysis): Promise<void> {
  const octokit = new Octokit({ auth: config.token });

  const riskLevel =
    analysis.metrics.riskScore > 70 ? '🔴 **HIGH RISK**' :
    analysis.metrics.riskScore > 40 ? '🟠 **MEDIUM RISK**' :
    '🟡 **LOW RISK**';

  const message = `## 🔍 Deep Review Recommended

${riskLevel} - Risk Score: ${analysis.metrics.riskScore}/100

### Why Deep Review is Needed:

${analysis.reasons.map(r => `- ${r}`).join('\n')}

### PR Metrics:
- **Files Changed**: ${analysis.metrics.filesChanged}
- **Lines Changed**: ${analysis.metrics.linesChanged}
- **Complexity Score**: ${analysis.metrics.complexity}/10

---

### 🎯 Action Required:

**Run a deep review using your Claude Pro subscription (FREE):**

\`\`\`bash
cd ${config.repo}
npm run review:deep
\`\`\`

This will:
- ✅ Use your Claude Pro subscription (no API costs)
- ✅ Perform thorough analysis of all changes
- ✅ Check for edge cases and potential issues
- ✅ Generate detailed recommendations

**Estimated time:** 2-5 minutes

---

💡 The automated checks will continue, but a manual deep review is recommended for changes of this complexity.`;

  await octokit.issues.createComment({
    owner: config.owner,
    repo: config.repo,
    issue_number: config.prNumber,
    body: message,
  });

  console.log('✅ Deep review prompt posted to PR');
}

/**
 * Main function: Detect and prompt if needed
 */
export async function checkAndPromptDeepReview(): Promise<void> {
  const config: GitHubConfig = {
    token: process.env.GITHUB_TOKEN!,
    owner: process.env.GITHUB_REPOSITORY_OWNER!,
    repo: process.env.GITHUB_REPOSITORY!.split('/')[1],
    prNumber: parseInt(process.env.PR_NUMBER!),
  };

  console.log('🔍 Analyzing PR complexity...');

  const analysis = await analyzePRComplexity(config);

  console.log('\n📊 Analysis Results:');
  console.log(`  - Files Changed: ${analysis.metrics.filesChanged}`);
  console.log(`  - Lines Changed: ${analysis.metrics.linesChanged}`);
  console.log(`  - Complexity: ${analysis.metrics.complexity}/10`);
  console.log(`  - Risk Score: ${analysis.metrics.riskScore}/100`);
  console.log(`  - Needs Deep Review: ${analysis.needsDeepReview ? 'YES' : 'NO'}`);

  if (analysis.needsDeepReview) {
    console.log('\n⚠️ Deep review recommended!');
    console.log('Reasons:');
    analysis.reasons.forEach(reason => console.log(`  - ${reason}`));

    await promptForDeepReview(config, analysis);
  } else {
    console.log('\n✅ Standard automated review is sufficient');
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkAndPromptDeepReview().catch(error => {
    console.error('❌ Deep review detector failed:', error);
    process.exit(1);
  });
}
