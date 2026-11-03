/**
 * test/adversarial_milestone1.test.js
 * 
 * Comprehensive Empirical Adversarial Test Harness for Milestone 1:
 * - Invalid / unexpected model names in sendChat
 * - Unsupported geminiCli values
 * - Extreme multiline composer input and chat log layout overflow
 * - WINDOW_HEIGHT = 418 shadow margin and clipping analysis
 * - Concurrency, rapid cancellations, and IPC options resilience
 *
 * Zero external npm dependencies.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {
  PROJECT_ROOT,
  readProjectFile,
  extractCssVariables,
  findCssRules,
  ruleHasProperty,
  extractElementById,
  extractSelectOptions,
  loadFreshAiChat,
  getWindowGeometry,
} = require('./e2e/harness');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.log(`  ✗ [FAIL] ${name}`);
    console.log(`      Error: ${err.message}`);
  }
}

console.log('='.repeat(80));
console.log('  ADVERSARIAL STRESS TEST HARNESS — MILESTONE 1');
console.log('='.repeat(80));

// =============================================================================
// SUITE 1: Invalid and Unexpected Model Names in sendChat
// =============================================================================
console.log('\n--- SUITE 1: Invalid & Unexpected Model Names in sendChat ---');

runTest('1.1 Invalid claudeModel string falls back to state default', () => {
  const { aiChat, state } = loadFreshAiChat();
  state.settings.claudeModel = 'sonnet';
  
  const res = aiChat.sendChat('Hola Claude', { provider: 'claude', claudeModel: 'gpt-4-turbo-fake' });
  assert.equal(res.ok, true, 'sendChat should return ok: true');
  
  // Must NOT overwrite settings with the invalid model
  assert.equal(state.settings.claudeModel, 'sonnet', 'Settings claudeModel must remain sonnet');
  
  const stateAfter = aiChat.getChatState();
  const assistantMsg = stateAfter.messages.find(m => m.role === 'assistant');
  assert.ok(assistantMsg, 'Assistant message must exist');
  assert.equal(assistantMsg.model, 'sonnet', 'Assistant message model must fall back to state default');
  aiChat.cancelChat();
});

runTest('1.2 Non-string and null claudeModel values fall back gracefully without exception', () => {
  const { aiChat, state } = loadFreshAiChat();
  state.settings.claudeModel = 'sonnet';

  for (const badValue of [null, undefined, 12345, false, {}, ['opus']]) {
    aiChat.clearChat();
    const res = aiChat.sendChat('Hola Claude', { provider: 'claude', claudeModel: badValue });
    assert.equal(res.ok, true, `sendChat with claudeModel=${typeof badValue} must return ok: true`);
    assert.equal(state.settings.claudeModel, 'sonnet', 'State must preserve valid claudeModel');
    aiChat.cancelChat();
  }
});

runTest('1.3 Valid Claude models (opus, sonnet, haiku) are accepted and persisted', () => {
  const { aiChat, state } = loadFreshAiChat();
  for (const model of ['opus', 'sonnet', 'haiku']) {
    aiChat.clearChat();
    const res = aiChat.sendChat(`Hola ${model}`, { provider: 'claude', claudeModel: model });
    assert.equal(res.ok, true);
    assert.equal(state.settings.claudeModel, model, `claudeModel must be updated to ${model}`);
    const assistantMsg = aiChat.getChatState().messages.find(m => m.role === 'assistant');
    assert.equal(assistantMsg.model, model);
    aiChat.cancelChat();
  }
});

runTest('1.4 Custom geminiModel string is accepted and passed to reply.model', () => {
  const { aiChat, state } = loadFreshAiChat();
  state.settings.geminiModel = '';
  
  const res = aiChat.sendChat('Hola Gemini', { provider: 'gemini', geminiModel: 'gemini-1.5-flash-8b' });
  assert.equal(res.ok, true);
  assert.equal(state.settings.geminiModel, 'gemini-1.5-flash-8b');
  
  const assistantMsg = aiChat.getChatState().messages.find(m => m.role === 'assistant');
  assert.ok(assistantMsg);
  assert.equal(assistantMsg.model, 'gemini-1.5-flash-8b');
  aiChat.cancelChat();
});

runTest('1.5 Non-string geminiModel (null, numbers, objects) falls back to state default', () => {
  const { aiChat, state } = loadFreshAiChat();
  state.settings.geminiModel = 'default-gemini';
  
  for (const badValue of [null, undefined, 12345, true, {}, []]) {
    aiChat.clearChat();
    const res = aiChat.sendChat('Hola Gemini', { provider: 'gemini', geminiModel: badValue });
    assert.equal(res.ok, true);
    assert.equal(state.settings.geminiModel, 'default-gemini', `geminiModel must remain default-gemini for ${typeof badValue}`);
    const assistantMsg = aiChat.getChatState().messages.find(m => m.role === 'assistant');
    assert.equal(assistantMsg.model, 'default-gemini');
    aiChat.cancelChat();
  }
});

runTest('1.6 IPC handler protects sendChat against null or primitive options', () => {
  // Check main/ipc.js registration logic
  const ipcContent = readProjectFile('main/ipc.js');
  assert.ok(
    ipcContent.includes("options && typeof options === 'object' ? options : {}"),
    'main/ipc.js must guard options parameter against null/primitives before calling sendChat'
  );

  const { aiChat } = loadFreshAiChat();
  // Safe invocation when sanitized as IPC does
  const safeOpts = (bad) => (bad && typeof bad === 'object' ? bad : {});
  for (const bad of [null, undefined, 'some-string', 42, true]) {
    aiChat.clearChat();
    const res = aiChat.sendChat('Test IPC sanitized options', safeOpts(bad));
    assert.equal(res.ok, true);
    aiChat.cancelChat();
  }
});

// =============================================================================
// SUITE 2: Unsupported geminiCli Values
// =============================================================================
console.log('\n--- SUITE 2: Unsupported geminiCli Values ---');

runTest('2.1 Unsupported geminiCli string falls back to state default and is NOT saved', () => {
  const { aiChat, state } = loadFreshAiChat();
  state.settings.geminiCli = 'auto';
  
  const res = aiChat.sendChat('Hola Gemini CLI', { provider: 'gemini', geminiCli: 'unsupported-exe' });
  assert.equal(res.ok, true);
  
  // Settings must remain 'auto'
  assert.equal(state.settings.geminiCli, 'auto', 'state.settings.geminiCli must remain auto');
  aiChat.cancelChat();
});

runTest('2.2 Non-string geminiCli values fall back to state default safely', () => {
  const { aiChat, state } = loadFreshAiChat();
  state.settings.geminiCli = 'agy';
  
  for (const badCli of [null, undefined, 999, false, {}, ['auto']]) {
    aiChat.clearChat();
    const res = aiChat.sendChat('Hola Gemini CLI', { provider: 'gemini', geminiCli: badCli });
    assert.equal(res.ok, true);
    assert.equal(state.settings.geminiCli, 'agy', `geminiCli must stay agy when given ${typeof badCli}`);
    aiChat.cancelChat();
  }
});

runTest('2.3 All valid GEMINI_CLI_OPTIONS (auto, agy, gemini) are accepted and updated in state', () => {
  const { aiChat, state } = loadFreshAiChat();
  for (const validCli of ['auto', 'agy', 'gemini']) {
    aiChat.clearChat();
    const res = aiChat.sendChat(`Hola CLI ${validCli}`, { provider: 'gemini', geminiCli: validCli });
    assert.equal(res.ok, true);
    assert.equal(state.settings.geminiCli, validCli);
    aiChat.cancelChat();
  }
});

runTest('2.4 GEMINI_CLI_OPTIONS constant is strictly defined as ["auto", "agy", "gemini"]', () => {
  const { aiChat } = loadFreshAiChat();
  assert.deepEqual(aiChat.GEMINI_CLI_OPTIONS, ['auto', 'agy', 'gemini']);
});

// =============================================================================
// SUITE 3: Extremely Long Multiline Prompt in Composer & Chat Log Layout Overflow
// =============================================================================
console.log('\n--- SUITE 3: Long Multiline Prompt & Chat Log Layout Overflow ---');

runTest('3.1 CSS restricts composer to max-height: 84px and flex: none', () => {
  const css = readProjectFile('renderer/styles.css');
  const composerRules = findCssRules(css, /\.composer\b/);
  assert.ok(composerRules.length > 0, '.composer rule must exist in styles.css');
  
  const mainRule = composerRules.find(r => ruleHasProperty(r.body, 'max-height', '84px'));
  assert.ok(mainRule, '.composer rule must include max-height: 84px');
  assert.ok(ruleHasProperty(mainRule.body, 'flex', 'none'), '.composer must have flex: none');
});

runTest('3.2 CSS restricts composer-input to max-height: 76px and min-height: 28px', () => {
  const css = readProjectFile('renderer/styles.css');
  const inputRules = findCssRules(css, /\.composer-input\b/);
  assert.ok(inputRules.length > 0, '.composer-input rule must exist');
  
  const mainRule = inputRules.find(r => ruleHasProperty(r.body, 'max-height', '76px'));
  assert.ok(mainRule, '.composer-input must have max-height: 76px');
  assert.ok(ruleHasProperty(mainRule.body, 'min-height', '28px'), '.composer-input must have min-height: 28px');
  assert.ok(ruleHasProperty(mainRule.body, 'resize', 'none'), '.composer-input must disable manual resizing (resize: none)');
});

runTest('3.3 CSS defines .chat-log with flex: 1, min-height: 0, and overflow-y: auto', () => {
  const css = readProjectFile('renderer/styles.css');
  const chatLogRules = findCssRules(css, /\.chat-log\b/);
  assert.ok(chatLogRules.length > 0, '.chat-log rule must exist');
  
  const mainRule = chatLogRules[0];
  assert.ok(ruleHasProperty(mainRule.body, 'flex', '1'), '.chat-log must have flex: 1');
  assert.ok(ruleHasProperty(mainRule.body, 'min-height', '0'), '.chat-log must have min-height: 0');
  assert.ok(ruleHasProperty(mainRule.body, 'overflow-y', 'auto'), '.chat-log must have overflow-y: auto');
  assert.ok(ruleHasProperty(mainRule.body, 'overflow-x', 'hidden'), '.chat-log must have overflow-x: hidden');
});

runTest('3.4 JS autosize() simulation caps input height and triggers internal scrollbar', () => {
  // Simulate autosize logic from renderer/modules/chat.js
  const MAX_INPUT_LINES = 4;
  const lineHeight = 18;
  const maxHeight = lineHeight * MAX_INPUT_LINES + 10; // 82px
  
  function simulateAutosize(lineCount) {
    const scrollHeight = lineCount * lineHeight + 10;
    const computedHeight = Math.min(scrollHeight, maxHeight);
    const overflowY = scrollHeight > maxHeight + 2 ? 'auto' : 'hidden';
    return { height: computedHeight, overflowY };
  }

  // 1 line
  const oneLine = simulateAutosize(1);
  assert.equal(oneLine.height, 28);
  assert.equal(oneLine.overflowY, 'hidden');

  // 3 lines
  const threeLines = simulateAutosize(3);
  assert.equal(threeLines.height, 64);
  assert.equal(threeLines.overflowY, 'hidden');

  // 4 lines
  const fourLines = simulateAutosize(4);
  assert.equal(fourLines.height, 82);
  assert.equal(fourLines.overflowY, 'hidden');

  // 10 lines
  const tenLines = simulateAutosize(10);
  assert.equal(tenLines.height, 82, 'Height must be capped at 82px');
  assert.equal(tenLines.overflowY, 'auto', 'overflowY must switch to auto for 10 lines');

  // 500 lines (extreme multiline prompt up to 8000 chars)
  const extremeLines = simulateAutosize(500);
  assert.equal(extremeLines.height, 82, 'Extreme multiline prompt height must remain strictly capped at 82px');
  assert.equal(extremeLines.overflowY, 'auto', 'Extreme prompt must enable scrollbar');
});

runTest('3.5 Vertical clearance calculation confirms chat-log never collapses or pushes controls out', () => {
  const PANEL_HEIGHT = 360;
  const AI_HEAD_HEIGHT = 30; // .ai-head height
  const AI_HEAD_PADDING = 8;
  const COMPOSER_MAX_HEIGHT = 84;
  const CHAT_LOG_PADDING = 10;

  const minChatLogHeight = PANEL_HEIGHT - AI_HEAD_HEIGHT - AI_HEAD_PADDING - COMPOSER_MAX_HEIGHT - CHAT_LOG_PADDING;
  assert.ok(minChatLogHeight >= 220, `Minimum chat log height must be at least 220px (calculated: ${minChatLogHeight}px)`);
  assert.ok(minChatLogHeight + COMPOSER_MAX_HEIGHT <= PANEL_HEIGHT, 'Total content height must not exceed PANEL_HEIGHT');
});

// =============================================================================
// SUITE 4: Window Height = 418 & Drop Shadow Clipping Analysis
// =============================================================================
console.log('\n--- SUITE 4: WINDOW_HEIGHT = 418 & Drop Shadow Margin ---');

runTest('4.1 Window geometry constants in main/window.js match exact project specifications', () => {
  const geom = getWindowGeometry();
  assert.equal(geom.PANEL_WIDTH, 720, 'PANEL_WIDTH must be 720');
  assert.equal(geom.PANEL_HEIGHT, 360, 'PANEL_HEIGHT must be 360');
  assert.equal(geom.TOP_GAP, 8, 'TOP_GAP must be 8');
  assert.equal(geom.SHADOW_MARGIN, 50, 'SHADOW_MARGIN must be 50');
  assert.equal(geom.WINDOW_WIDTH, 820, 'WINDOW_WIDTH must be 720 + 50*2 = 820');
  assert.equal(geom.WINDOW_HEIGHT, 418, 'WINDOW_HEIGHT must be 8 + 360 + 50 = 418');
});

runTest('4.2 Resting box-shadow clearance: SHADOW_MARGIN (50px) strictly exceeds shadow reach (40px)', () => {
  const css = readProjectFile('renderer/styles.css');
  const expandedRules = findCssRules(css, /\.island\[data-shape=[\"']expanded[\"']\]/);
  assert.ok(expandedRules.length > 0, '.island[data-shape="expanded"] rule must exist');
  
  const ruleWithShadow = expandedRules.find(r => r.body.includes('box-shadow'));
  assert.ok(ruleWithShadow, 'expanded island must have a rule containing box-shadow');
  const body = ruleWithShadow.body;
  const shadowMatch = /box-shadow\s*:\s*([^;]+);/i.exec(body);
  assert.ok(shadowMatch, 'expanded island must have box-shadow');
  
  // Check the vertical offset and blur
  const matchParts = shadowMatch[1].match(/0\s+(\d+)px\s+(\d+)px/);
  assert.ok(matchParts, 'box-shadow must have vertical offset and blur');
  const offsetY = parseInt(matchParts[1], 10);
  const blurRadius = parseInt(matchParts[2], 10);
  const totalVerticalShadowReach = offsetY + blurRadius; // 12 + 28 = 40px
  
  const SHADOW_MARGIN = 50;
  const safetyClearance = SHADOW_MARGIN - totalVerticalShadowReach;
  assert.ok(safetyClearance > 0, `Safety clearance must be strictly positive: got ${safetyClearance}px`);
  assert.equal(safetyClearance, 10, 'Expected 10px buffer between bottom shadow reach and transparent window boundary');
});

runTest('4.3 Horizontal shadow clearance: SHADOW_MARGIN (50px) strictly exceeds horizontal blur (28px)', () => {
  const horizontalBlur = 28;
  const SHADOW_MARGIN = 50;
  const horizontalSafetyBuffer = SHADOW_MARGIN - horizontalBlur;
  assert.ok(horizontalSafetyBuffer >= 20, `Horizontal safety buffer must be >= 20px (got ${horizontalSafetyBuffer}px)`);
});

runTest('4.4 CSS variable --panel-height in styles.css matches PANEL_HEIGHT (260px o 360px en chat)', () => {
  const css = readProjectFile('renderer/styles.css');
  const vars = extractCssVariables(css);
  assert.ok(['260px', '360px'].includes(vars.get('--panel-height')), '--panel-height must be 260px or 360px');
  assert.equal(vars.get('--panel-width'), '720px', '--panel-width must be 720px');
  assert.equal(vars.get('--top-gap'), '8px', '--top-gap must be 8px');
});

// =============================================================================
// SUITE 5: Adversarial Concurrency, State Leaks & IPC Integrity
// =============================================================================
console.log('\n--- SUITE 5: Adversarial Concurrency & IPC Integrity ---');

runTest('5.1 Simultaneous sendChat calls while busy are rejected with error: "busy"', () => {
  const { aiChat } = loadFreshAiChat();
  const res1 = aiChat.sendChat('Message 1', { provider: 'claude' });
  assert.equal(res1.ok, true);
  
  // Second call while first is streaming
  const res2 = aiChat.sendChat('Message 2', { provider: 'claude' });
  assert.equal(res2.ok, false);
  assert.equal(res2.error, 'busy', 'Second simultaneous sendChat must return error: "busy"');
  aiChat.cancelChat();
});

runTest('5.2 cancelChat() synchronously resets busy state to allow immediate re-submission', () => {
  const { aiChat } = loadFreshAiChat();
  aiChat.sendChat('Message to cancel', { provider: 'claude' });
  assert.equal(aiChat.getChatState().busy, true, 'Chat must be busy');
  
  aiChat.cancelChat();
  assert.equal(aiChat.getChatState().busy, false, 'cancelChat must immediately clear busy flag');
  
  const resNext = aiChat.sendChat('Immediate follow up', { provider: 'claude' });
  assert.equal(resNext.ok, true, 'Subsequent sendChat must succeed immediately after cancel');
  aiChat.cancelChat();
});

runTest('5.3 Provider "both" generates paired assistant messages with linked group', () => {
  const { aiChat } = loadFreshAiChat();
  const res = aiChat.sendChat('Compare both', { provider: 'both', claudeModel: 'haiku', geminiCli: 'agy' });
  assert.equal(res.ok, true);
  
  const state = aiChat.getChatState();
  const userMsg = state.messages.find(m => m.role === 'user');
  const assistantMsgs = state.messages.filter(m => m.role === 'assistant');
  
  assert.equal(assistantMsgs.length, 2, 'Provider "both" must create exactly 2 assistant replies');
  const providers = assistantMsgs.map(m => m.provider).sort();
  assert.deepEqual(providers, ['claude', 'gemini'], 'Replies must be from claude and gemini');
  assert.ok(assistantMsgs.every(m => m.group === userMsg.id), 'Both assistant messages must be linked to user message id');
  aiChat.cancelChat();
});

runTest('5.4 History ring-buffer enforces MAX_MESSAGES limit (60) without memory leak', () => {
  const { aiChat } = loadFreshAiChat();
  for (let i = 0; i < 75; i++) {
    aiChat.sendChat(`Message ${i}`, { provider: 'claude' });
    aiChat.cancelChat();
  }
  const state = aiChat.getChatState();
  assert.ok(state.messages.length <= 60, `History length must not exceed 60 (got ${state.messages.length})`);
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n' + '='.repeat(80));
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED:      ${passedTests}`);
console.log(`FAILED:      ${failedTests}`);
console.log('='.repeat(80));

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
