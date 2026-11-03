#!/usr/bin/env node
/**
 * test/e2e/runner.js — Opaque-box E2E Test Runner for Notch
 * 
 * Executes the 4-tier test suite:
 * - Tier 1: Feature Coverage (>=5 tests per feature for all 12 features)
 * - Tier 2: Boundary & Corner Cases (>=5 tests per feature for all 12 features)
 * - Tier 3: Cross-Feature Combinations (Pairwise interactions)
 * - Tier 4: Real-World Application Scenarios (User workflows)
 * 
 * Usage:
 *   node test/e2e/runner.js
 *   node test/e2e/runner.js --baseline
 *   node test/e2e/runner.js --tier=1
 *   node test/e2e/runner.js --feature=3
 *   node test/e2e/runner.js --tap
 */

'use strict';

const tier1 = require('./tier1-features.test');
const tier2 = require('./tier2-boundaries.test');
const tier3 = require('./tier3-combinations.test');
const tier4 = require('./tier4-scenarios.test');

const args = process.argv.slice(2);
const isBaseline = args.includes('--baseline') || args.includes('--allow-failures');
const isTap = args.includes('--tap');

const tierArg = args.find((a) => a.startsWith('--tier='));
const filterTier = tierArg ? parseInt(tierArg.split('=')[1], 10) : null;

const featArg = args.find((a) => a.startsWith('--feature='));
const filterFeature = featArg ? `F${featArg.split('=')[1]}-` : null;

// Aggregate all tests
let allTests = [
  ...tier1.tests,
  ...tier2.tests,
  ...tier3.tests,
  ...tier4.tests,
];

if (filterTier) {
  allTests = allTests.filter((t) => t.tier === filterTier);
}

if (filterFeature) {
  allTests = allTests.filter((t) => t.id.startsWith(filterFeature));
}

console.log('='.repeat(80));
console.log('  NOTCH — OPAQUE-BOX E2E TEST SUITE RUNNER');
console.log(`  Discovered: ${allTests.length} tests across 4 Tiers`);
if (isBaseline) console.log('  Mode: BASELINE RUN (records initial state against current branch)');
console.log('='.repeat(80));

async function run() {
  const results = [];
  let passCount = 0;
  let failCount = 0;

  const startTime = Date.now();

  for (let i = 0; i < allTests.length; i++) {
    const test = allTests[i];
    const tStart = Date.now();
    let status = 'PASS';
    let error = null;

    try {
      const res = test.fn();
      if (res && typeof res.then === 'function') {
        await res;
      }
      passCount++;
    } catch (err) {
      status = 'FAIL';
      error = err;
      failCount++;
    }

    const duration = Date.now() - tStart;
    results.push({ test, status, duration, error });

    if (isTap) {
      if (status === 'PASS') {
        console.log(`ok ${i + 1} - ${test.id} ${test.name}`);
      } else {
        console.log(`not ok ${i + 1} - ${test.id} ${test.name}`);
        console.log(`  ---`);
        console.log(`  message: "${error.message.replace(/"/g, '\\"')}"`);
        console.log(`  ...`);
      }
    } else {
      const symbol = status === 'PASS' ? '✓' : '✗';
      const colorTag = status === 'PASS' ? '[PASS]' : '[FAIL]';
      console.log(`  ${symbol} ${colorTag} [Tier ${test.tier}] ${test.id.padEnd(8)} ${test.name} (${duration}ms)`);
      if (status === 'FAIL') {
        console.log(`      Error: ${error.message}`);
      }
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log('\n' + '='.repeat(80));
  console.log('  TEST EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total tests:   ${allTests.length}`);
  console.log(`  Passed:        ${passCount} (${((passCount / allTests.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed:        ${failCount} (${((failCount / allTests.length) * 100).toFixed(1)}%)`);
  console.log(`  Duration:      ${totalDuration}ms`);

  // Tier breakdowns
  console.log('\n  TIER BREAKDOWN:');
  for (let t = 1; t <= 4; t++) {
    const tierResults = results.filter((r) => r.test.tier === t);
    if (tierResults.length === 0) continue;
    const tPass = tierResults.filter((r) => r.status === 'PASS').length;
    const tFail = tierResults.length - tPass;
    const tPct = ((tPass / tierResults.length) * 100).toFixed(1);
    const tierName =
      t === 1 ? 'Feature Coverage' :
      t === 2 ? 'Boundary & Corner Cases' :
      t === 3 ? 'Cross-Feature Combinations' : 'Real-World Scenarios';
    console.log(`    Tier ${t} (${tierName.padEnd(28)}): ${tPass}/${tierResults.length} passed (${tPct}%)`);
  }

  // Feature breakdowns for Tier 1 & 2
  console.log('\n  FEATURE BREAKDOWN (Tiers 1 & 2):');
  for (let f = 1; f <= 12; f++) {
    const fTag = `F${f}-`;
    const fResults = results.filter((r) => r.test.id.startsWith(fTag));
    if (fResults.length === 0) continue;
    const fPass = fResults.filter((r) => r.status === 'PASS').length;
    const fFail = fResults.length - fPass;
    const statusNote = fFail === 0 ? 'READY' : `${fFail} FAILING (Milestone pending)`;
    console.log(`    Feature ${String(f).padStart(2)}: ${fPass}/${fResults.length} passed — ${statusNote}`);
  }

  console.log('='.repeat(80));

  if (isBaseline) {
    console.log('  Baseline run complete. Results recorded.');
    process.exit(0);
  } else {
    if (failCount > 0) {
      console.log(`  Suite finished with ${failCount} failing tests.`);
      process.exit(1);
    } else {
      console.log('  All tests passed successfully!');
      process.exit(0);
    }
  }
}

run().catch((err) => {
  console.error('Fatal error during test runner execution:', err);
  process.exit(1);
});
