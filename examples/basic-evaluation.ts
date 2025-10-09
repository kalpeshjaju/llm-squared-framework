/**
 * Basic Evaluation Example
 * Shows how to evaluate LLM outputs for quality
 */

import { LLMEvaluator } from '../src/evaluation/evaluator.js';
import 'dotenv/config';

async function main() {
  console.log('🧪 LLM² Framework - Basic Evaluation Example\n');

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment');
    console.error('   Create a .env file with: ANTHROPIC_API_KEY=your_key');
    process.exit(1);
  }

  // Initialize evaluator
  const evaluator = new LLMEvaluator({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514',
    temperature: 0.0,
  });

  console.log('✅ Evaluator initialized\n');

  // Example 1: Good code
  console.log('📝 Example 1: Evaluating GOOD code\n');

  const goodTask = 'Create a TypeScript function to validate email addresses';
  const goodCode = `function validateEmail(email: string): boolean {
  if (typeof email !== 'string') {
    throw new Error('Email must be a string');
  }

  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email.trim());
}`;

  const goodResult = await evaluator.evaluate(goodTask, goodCode);

  console.log(`Overall Score: ${goodResult.scores.overall}/10`);
  console.log(`Status: ${goodResult.passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`\nDetailed Scores:`);
  console.log(`  Correctness: ${goodResult.scores.correctness}/10`);
  console.log(`  Quality: ${goodResult.scores.quality}/10`);
  console.log(`  Security: ${goodResult.scores.security}/10`);
  console.log(`  Performance: ${goodResult.scores.performance}/10`);
  console.log(`  Maintainability: ${goodResult.scores.maintainability}/10`);

  if (goodResult.recommendations.length > 0) {
    console.log(`\n💡 Recommendations:`);
    goodResult.recommendations.forEach((rec) => console.log(`  - ${rec}`));
  }

  console.log(`\n💰 Cost: $${(goodResult.metadata?.estimatedCost as number)?.toFixed(4)}`);
  console.log(`⏱️  Time: ${goodResult.metadata?.evaluationTime}ms`);

  // Example 2: Bad code
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('📝 Example 2: Evaluating BAD code\n');

  const badTask = 'Create a function to validate email addresses';
  const badCode = `function validate(e) {
  return e.includes('@');
}`;

  const badResult = await evaluator.evaluate(badTask, badCode);

  console.log(`Overall Score: ${badResult.scores.overall}/10`);
  console.log(`Status: ${badResult.passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`\nDetailed Scores:`);
  console.log(`  Correctness: ${badResult.scores.correctness}/10`);
  console.log(`  Quality: ${badResult.scores.quality}/10`);
  console.log(`  Security: ${badResult.scores.security}/10`);
  console.log(`  Performance: ${badResult.scores.performance}/10`);
  console.log(`  Maintainability: ${badResult.scores.maintainability}/10`);

  if (badResult.recommendations.length > 0) {
    console.log(`\n💡 Recommendations:`);
    badResult.recommendations.forEach((rec) => console.log(`  - ${rec}`));
  }

  console.log(`\n💰 Cost: $${(badResult.metadata?.estimatedCost as number)?.toFixed(4)}`);
  console.log(`⏱️  Time: ${badResult.metadata?.evaluationTime}ms`);

  // Example 3: Batch evaluation
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('📝 Example 3: Batch Evaluation\n');

  const batchTasks = [
    {
      taskDescription: 'Create a function to check if a number is prime',
      llmOutput: `function isPrime(n: number): boolean {
  if (n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}`,
    },
    {
      taskDescription: 'Create a function to reverse a string',
      llmOutput: `function reverseString(str: string): string {
  return str.split('').reverse().join('');
}`,
    },
  ];

  const batchResults = await evaluator.evaluateBatch(batchTasks);

  console.log(`Evaluated ${batchResults.length} items:\n`);
  batchResults.forEach((result, i) => {
    console.log(`${i + 1}. Score: ${result.scores.overall.toFixed(1)}/10 - ${result.passed ? '✅' : '❌'}`);
  });

  // Get summary statistics
  const stats = LLMEvaluator.getSummaryStats(batchResults);

  console.log(`\n📊 Summary:`);
  console.log(`  Pass Rate: ${(stats.passRate * 100).toFixed(1)}%`);
  console.log(`  Avg Score: ${stats.avgOverallScore.toFixed(2)}/10`);
  console.log(`  Total Cost: $${stats.totalCost.toFixed(4)}`);
  console.log(`  Avg Time: ${stats.avgTime.toFixed(0)}ms`);

  console.log('\n✅ Examples completed!\n');
  console.log('💡 Next steps:');
  console.log('   - Try with your own code');
  console.log('   - Set up golden datasets for regression testing');
  console.log('   - Integrate into your CI/CD pipeline');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
