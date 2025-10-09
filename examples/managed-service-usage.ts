/**
 * ManagedLLMService Example
 * Shows how to use the enforcement layer for automatic quality control
 */

import { ManagedLLMService } from '../src/core/managed-llm-service.js';
import 'dotenv/config';

async function main() {
  console.log('🚀 ManagedLLMService - Enforcement Layer Example\n');

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not found in environment');
    process.exit(1);
  }

  // 1. Initialize the service (do this once at app startup)
  console.log('⚙️  Initializing ManagedLLMService...\n');

  const llmService = new ManagedLLMService({
    apiKey: process.env.ANTHROPIC_API_KEY,

    // Quality enforcement (AUTOMATIC)
    autoEvaluate: true,          // ✅ Every output evaluated
    minQualityScore: 7,          // ✅ Block if score < 7/10
    blockOnLowQuality: true,     // ✅ Enforce quality gate

    // Performance (AUTOMATIC)
    enableCaching: true,         // ✅ Cache similar queries
    cacheTTL: 3600,              // 1 hour

    // Scaling (AUTOMATIC)
    enableRateLimiting: true,    // ✅ Prevent quota exhaustion
    requestsPerMinute: 60,
    requestsPerHour: 1000,

    // Monitoring (AUTOMATIC)
    enableMonitoring: true,      // ✅ Track all metrics

    // Model config
    model: 'claude-sonnet-4-20250514',
    temperature: 0.7,
    maxTokens: 4000,
  });

  await llmService.initialize();
  console.log('✅ Service initialized with automatic enforcement\n');

  // 2. Example 1: High-quality output (should pass)
  console.log('📝 Example 1: High-quality prompt\n');

  const goodRequest = {
    featureId: 'email-validation',
    taskDescription: 'Create a TypeScript function to validate email addresses',
    prompt: `Create a TypeScript function called validateEmail that:
- Takes an email string as input
- Returns a boolean indicating if valid
- Handles edge cases (empty string, null, invalid format)
- Includes error handling
- Is well-documented with JSDoc comments`,
  };

  const goodResult = await llmService.generate(goodRequest);

  if (goodResult.success) {
    console.log('✅ Request succeeded!');
    console.log(`   Quality Score: ${goodResult.metadata.qualityScore.toFixed(1)}/10`);
    console.log(`   Cached: ${goodResult.metadata.cached ? 'Yes' : 'No'}`);
    console.log(`   Cost: $${goodResult.metadata.cost.toFixed(4)}`);
    console.log(`   Latency: ${goodResult.metadata.latency}ms`);
    console.log(`\n   Generated code preview:`);
    console.log(`   ${goodResult.content.substring(0, 200)}...`);
  } else {
    console.log('❌ Request failed!');
    console.log(`   Reason: ${goodResult.reason}`);
    console.log(`   Error: ${goodResult.error}`);
  }

  // 3. Example 2: Try the same request again (should hit cache)
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('📝 Example 2: Same request (should hit cache)\n');

  const cachedResult = await llmService.generate(goodRequest);

  if (cachedResult.success) {
    console.log('✅ Request succeeded!');
    console.log(`   Cached: ${cachedResult.metadata.cached ? '💾 YES (instant!)' : 'No'}`);
    console.log(`   Cost: $${cachedResult.metadata.cost.toFixed(4)} (saved money!)`);
    console.log(`   Latency: ${cachedResult.metadata.latency}ms (much faster)`);
  }

  // 4. Example 3: Low-quality prompt (should be blocked)
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('📝 Example 3: Low-quality prompt (should be blocked)\n');

  const badRequest = {
    featureId: 'bad-example',
    taskDescription: 'Create an email validator',
    prompt: 'make email checker',  // Vague, low-quality prompt
  };

  const badResult = await llmService.generate(badRequest);

  if (!badResult.success) {
    console.log('🛑 Request BLOCKED by quality gate!');
    console.log(`   Reason: ${badResult.reason}`);
    console.log(`   Error: ${badResult.error}`);

    if (badResult.evaluation) {
      console.log(`\n   Quality scores:`);
      console.log(`     Overall: ${badResult.evaluation.scores.overall.toFixed(1)}/10`);
      console.log(`     Correctness: ${badResult.evaluation.scores.correctness.toFixed(1)}/10`);
      console.log(`     Quality: ${badResult.evaluation.scores.quality.toFixed(1)}/10`);
    }

    if (badResult.suggestions) {
      console.log(`\n   💡 Suggestions:`);
      badResult.suggestions.forEach(s => console.log(`      - ${s}`));
    }
  } else {
    console.log('✅ Passed (surprisingly!)');
  }

  // 5. Example 4: Bypass quality check (escape hatch)
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('📝 Example 4: Bypass quality check (escape hatch)\n');

  const bypassRequest = {
    featureId: 'creative-task',
    taskDescription: 'Write a creative brand tagline',
    prompt: 'Create 5 creative taglines for a luxury coffee brand',
    bypassQualityCheck: true,  // ⚠️ Use sparingly, logs warning
  };

  const bypassResult = await llmService.generate(bypassRequest);

  if (bypassResult.success) {
    console.log('✅ Request succeeded (quality check bypassed)');
    console.log(`   ⚠️  Note: Quality check was bypassed (use sparingly)`);
    console.log(`   Generated: ${bypassResult.content.substring(0, 150)}...`);
  }

  // 6. Show service statistics
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('📊 Service Statistics:\n');

  const stats = await llmService.getStats();

  if (stats.cacheStats) {
    console.log('💾 Cache:');
    console.log(`   Total entries: ${stats.cacheStats.totalEntries}`);
    console.log(`   Hit rate: ${stats.cacheStats.hitRate.toFixed(2)}`);
    console.log(`   Size: ${(stats.cacheStats.totalSize / 1024).toFixed(2)} KB`);
  }

  if (stats.rateLimitStatus) {
    console.log('\n⏱️  Rate Limits:');
    console.log(`   Remaining this minute: ${stats.rateLimitStatus.remaining.perMinute}`);
    console.log(`   Remaining this hour: ${stats.rateLimitStatus.remaining.perHour}`);
    console.log(`   Remaining today: ${stats.rateLimitStatus.remaining.perDay}`);
  }

  console.log('\n✅ Example completed!\n');
  console.log('💡 Key takeaways:');
  console.log('   1. Quality is automatically enforced');
  console.log('   2. Caching saves money and improves speed');
  console.log('   3. Rate limiting prevents quota issues');
  console.log('   4. All metrics are tracked automatically');
  console.log('   5. Low-quality outputs are blocked');
  console.log('\n🎯 Use this pattern in ALL your LLM projects!\n');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
