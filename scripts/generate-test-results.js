// Generate test results JSON for the Test Health Dashboard
// Usage: node scripts/generate-test-results.js

import { startVitest } from 'vitest/node';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '..', 'public', 'test-results.json');

async function run() {
  const vitest = await startVitest('test', [], {
    run: true,
    reporters: ['json'],
    outputFile: { json: outputPath + '.raw' },
  });

  if (!vitest) {
    console.error('Failed to start Vitest');
    process.exit(1);
  }

  await vitest.close();

  // Read the raw JSON output from Vitest
  const { readFileSync, unlinkSync } = await import('fs');
  let raw;
  try {
    raw = JSON.parse(readFileSync(outputPath + '.raw', 'utf-8'));
  } catch {
    // Fallback: try to collect from vitest state
    console.error('Could not read raw JSON output');
    process.exit(1);
  }

  // Transform into our dashboard format
  const timestamp = new Date().toISOString();
  const testSuites = (raw.testResults || []).map(suite => {
    const fileName = suite.name.split('/').pop();
    const tests = (suite.assertionResults || []).map(t => ({
      name: t.fullName || t.title,
      status: t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped',
      duration: t.duration || 0,
    }));
    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed').length;
    const skipped = tests.filter(t => t.status === 'skipped').length;
    return {
      file: fileName,
      total: tests.length,
      passed,
      failed,
      skipped,
      duration: suite.endTime - suite.startTime,
      tests,
    };
  });

  const totalPassed = testSuites.reduce((s, f) => s + f.passed, 0);
  const totalFailed = testSuites.reduce((s, f) => s + f.failed, 0);
  const totalSkipped = testSuites.reduce((s, f) => s + f.skipped, 0);
  const totalTests = totalPassed + totalFailed + totalSkipped;

  const results = {
    timestamp,
    summary: {
      total: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      passRate: totalTests > 0 ? Math.round((totalPassed / totalTests) * 10000) / 100 : 0,
      duration: raw.testResults ? raw.testResults.reduce((s, f) => s + (f.endTime - f.startTime), 0) : 0,
    },
    suites: testSuites,
  };

  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Test results written to ${outputPath}`);
  console.log(`  Total: ${totalTests} | Passed: ${totalPassed} | Failed: ${totalFailed} | Pass rate: ${results.summary.passRate}%`);

  // Clean up raw file
  try { unlinkSync(outputPath + '.raw'); } catch {}
}

run().catch(err => {
  console.error('Error generating test results:', err);
  process.exit(1);
});
