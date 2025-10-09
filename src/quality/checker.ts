/**
 * Quality Checker
 * Pre-commit and CI checks for code quality and LLM features
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

export interface QualityCheckResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
  };
}

export interface QualityCheckerConfig {
  projectRoot: string;
  rules: {
    maxFileSize: number; // Max lines per file
    maxFunctionSize: number; // Max lines per function
    requireTests: boolean;
    requireDocumentation: boolean;
    checkTokenEfficiency: boolean;
  };
}

export class QualityChecker {
  private config: QualityCheckerConfig;

  constructor(config: QualityCheckerConfig) {
    this.config = config;
  }

  /**
   * Run all quality checks
   */
  async runAll(): Promise<QualityCheckResult> {
    console.log('🔍 Running quality checks...\n');

    const checks: QualityCheckResult['checks'] = [];

    // Check file sizes
    checks.push(...(await this.checkFileSizes()));

    // Check function sizes
    checks.push(...(await this.checkFunctionSizes()));

    // Check for test coverage
    if (this.config.rules.requireTests) {
      checks.push(...(await this.checkTestCoverage()));
    }

    // Check documentation
    if (this.config.rules.requireDocumentation) {
      checks.push(...(await this.checkDocumentation()));
    }

    // Check token efficiency
    if (this.config.rules.checkTokenEfficiency) {
      checks.push(...(await this.checkTokenEfficiency()));
    }

    // Generate summary
    const summary = {
      total: checks.length,
      passed: checks.filter((c) => c.passed).length,
      warnings: checks.filter((c) => c.severity === 'warning').length,
      errors: checks.filter((c) => c.severity === 'error').length,
    };

    const passed = summary.errors === 0;

    this.printResults({ passed, checks, summary });

    return { passed, checks, summary };
  }

  /**
   * Check file sizes
   */
  private async checkFileSizes(): Promise<QualityCheckResult['checks']> {
    const checks: QualityCheckResult['checks'] = [];
    const files = await this.getSourceFiles();

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n').length;

      if (lines > this.config.rules.maxFileSize) {
        checks.push({
          name: `File size: ${file}`,
          passed: false,
          message: `File has ${lines} lines (max: ${this.config.rules.maxFileSize}). Consider splitting into smaller modules.`,
          severity: 'error',
        });
      } else if (lines > this.config.rules.maxFileSize * 0.8) {
        checks.push({
          name: `File size: ${file}`,
          passed: true,
          message: `File has ${lines} lines (approaching limit of ${this.config.rules.maxFileSize})`,
          severity: 'warning',
        });
      }
    }

    if (checks.length === 0) {
      checks.push({
        name: 'File sizes',
        passed: true,
        message: 'All files are within size limits',
        severity: 'info',
      });
    }

    return checks;
  }

  /**
   * Check function sizes
   */
  private async checkFunctionSizes(): Promise<QualityCheckResult['checks']> {
    const checks: QualityCheckResult['checks'] = [];
    const files = await this.getSourceFiles();

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const functions = this.extractFunctions(content);

      for (const func of functions) {
        if (func.lines > this.config.rules.maxFunctionSize) {
          checks.push({
            name: `Function size: ${func.name} in ${file}`,
            passed: false,
            message: `Function has ${func.lines} lines (max: ${this.config.rules.maxFunctionSize}). Consider breaking into smaller functions.`,
            severity: 'error',
          });
        }
      }
    }

    if (checks.length === 0) {
      checks.push({
        name: 'Function sizes',
        passed: true,
        message: 'All functions are within size limits',
        severity: 'info',
      });
    }

    return checks;
  }

  /**
   * Check test coverage
   */
  private async checkTestCoverage(): Promise<QualityCheckResult['checks']> {
    const checks: QualityCheckResult['checks'] = [];

    try {
      const sourceFiles = await this.getSourceFiles();
      const testFiles = await this.getTestFiles();

      const sourceCount = sourceFiles.length;
      const testCount = testFiles.length;
      const coverage = testCount / sourceCount;

      if (coverage < 0.5) {
        checks.push({
          name: 'Test coverage',
          passed: false,
          message: `Only ${testCount} test files for ${sourceCount} source files (${(coverage * 100).toFixed(1)}% coverage). Aim for at least 50%.`,
          severity: 'error',
        });
      } else if (coverage < 0.8) {
        checks.push({
          name: 'Test coverage',
          passed: true,
          message: `${testCount} test files for ${sourceCount} source files (${(coverage * 100).toFixed(1)}% coverage). Consider adding more tests.`,
          severity: 'warning',
        });
      } else {
        checks.push({
          name: 'Test coverage',
          passed: true,
          message: `Good test coverage: ${(coverage * 100).toFixed(1)}%`,
          severity: 'info',
        });
      }
    } catch (error) {
      checks.push({
        name: 'Test coverage',
        passed: false,
        message: `Failed to check test coverage: ${error}`,
        severity: 'warning',
      });
    }

    return checks;
  }

  /**
   * Check documentation
   */
  private async checkDocumentation(): Promise<QualityCheckResult['checks']> {
    const checks: QualityCheckResult['checks'] = [];
    const requiredDocs = ['README.md', 'CLAUDE.md'];

    for (const doc of requiredDocs) {
      const docPath = join(this.config.projectRoot, doc);
      try {
        await stat(docPath);
        checks.push({
          name: `Documentation: ${doc}`,
          passed: true,
          message: `${doc} exists`,
          severity: 'info',
        });
      } catch (error) {
        checks.push({
          name: `Documentation: ${doc}`,
          passed: false,
          message: `${doc} is missing. Add project documentation.`,
          severity: 'error',
        });
      }
    }

    return checks;
  }

  /**
   * Check token efficiency
   */
  private async checkTokenEfficiency(): Promise<QualityCheckResult['checks']> {
    const checks: QualityCheckResult['checks'] = [];
    const files = await this.getSourceFiles();

    let totalLines = 0;
    let totalCommentLines = 0;

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');
      totalLines += lines.length;

      const commentLines = lines.filter(
        (line) =>
          line.trim().startsWith('//') || line.trim().startsWith('*')
      ).length;
      totalCommentLines += commentLines;
    }

    const commentRatio = totalCommentLines / totalLines;

    if (commentRatio > 0.3) {
      checks.push({
        name: 'Token efficiency',
        passed: false,
        message: `Comments are ${(commentRatio * 100).toFixed(1)}% of code (max recommended: 20%). Remove redundant comments.`,
        severity: 'warning',
      });
    } else {
      checks.push({
        name: 'Token efficiency',
        passed: true,
        message: `Good code-to-comment ratio: ${(commentRatio * 100).toFixed(1)}%`,
        severity: 'info',
      });
    }

    return checks;
  }

  /**
   * Get all source files
   */
  private async getSourceFiles(): Promise<string[]> {
    const srcDir = join(this.config.projectRoot, 'src');
    return this.findFiles(srcDir, /\.(ts|tsx|js|jsx)$/, /\.(test|spec)\./);
  }

  /**
   * Get all test files
   */
  private async getTestFiles(): Promise<string[]> {
    const srcDir = join(this.config.projectRoot, 'src');
    return this.findFiles(srcDir, /\.(test|spec)\.(ts|tsx|js|jsx)$/);
  }

  /**
   * Find files matching pattern
   */
  private async findFiles(
    dir: string,
    includePattern: RegExp,
    excludePattern?: RegExp
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            files.push(...(await this.findFiles(fullPath, includePattern, excludePattern)));
          }
        } else if (entry.isFile()) {
          if (
            includePattern.test(entry.name) &&
            (!excludePattern || !excludePattern.test(entry.name))
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }

    return files;
  }

  /**
   * Extract functions from code
   */
  private extractFunctions(content: string): Array<{ name: string; lines: number }> {
    const functions: Array<{ name: string; lines: number }> = [];

    // Simple regex-based extraction (works for most cases)
    const functionRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*(?:async\s*)?\()/g;
    const lines = content.split('\n');

    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1] || match[2] || match[3];
      const startLine = content.substring(0, match.index).split('\n').length;

      // Count lines until matching closing brace
      let braceCount = 0;
      let functionLines = 0;
      let foundStart = false;

      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('{')) {
          braceCount += (line.match(/{/g) || []).length;
          foundStart = true;
        }
        if (line.includes('}')) {
          braceCount -= (line.match(/}/g) || []).length;
        }

        if (foundStart) {
          functionLines++;
        }

        if (foundStart && braceCount === 0) {
          functions.push({ name, lines: functionLines });
          break;
        }
      }
    }

    return functions;
  }

  /**
   * Print results
   */
  private printResults(result: QualityCheckResult): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 QUALITY CHECK RESULTS`);
    console.log(`${'='.repeat(60)}\n`);

    // Group by severity
    const errors = result.checks.filter((c) => c.severity === 'error');
    const warnings = result.checks.filter((c) => c.severity === 'warning');
    const infos = result.checks.filter((c) => c.severity === 'info');

    if (errors.length > 0) {
      console.log(`❌ ERRORS (${errors.length}):\n`);
      errors.forEach((check) => {
        console.log(`  ${check.name}`);
        console.log(`  ${check.message}\n`);
      });
    }

    if (warnings.length > 0) {
      console.log(`⚠️  WARNINGS (${warnings.length}):\n`);
      warnings.forEach((check) => {
        console.log(`  ${check.name}`);
        console.log(`  ${check.message}\n`);
      });
    }

    if (infos.length > 0) {
      console.log(`✅ PASSED (${infos.length}):\n`);
      infos.forEach((check) => {
        console.log(`  ${check.name}`);
      });
      console.log();
    }

    console.log(`${'='.repeat(60)}`);
    console.log(`Total: ${result.summary.total} checks`);
    console.log(`Passed: ${result.summary.passed}`);
    console.log(`Warnings: ${result.summary.warnings}`);
    console.log(`Errors: ${result.summary.errors}`);
    console.log(`${'='.repeat(60)}\n`);

    if (result.passed) {
      console.log(`✅ All checks passed!`);
    } else {
      console.log(`❌ Quality checks failed. Fix errors before committing.`);
    }
  }
}
