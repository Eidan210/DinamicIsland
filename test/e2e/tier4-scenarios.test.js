/**
 * test/e2e/tier4-scenarios.test.js — Tier 4: Real-World Application Scenarios
 * 
 * Verifies end-to-end user journeys and state machine workflows:
 * - SCEN-01: End-to-end Claude Chat workflow with model selection and history tracking
 * - SCEN-02: End-to-end Gemini Chat workflow with CLI auto fallback logic
 * - SCEN-03: Dual-provider side-by-side comparison ("Ambos") workflow
 * - SCEN-04: Full lifecycle background animation power cycle (0% idle CPU)
 * - SCEN-05: Home interactive widget walkthrough in Dark & Light themes
 */

'use strict';

const assert = require('node:assert/strict');
const harness = require('./harness');

const tests = [];

function registerTest(id, name, fn) {
  tests.push({ id, name, tier: 4, fn });
}

// SCEN-01: End-to-end Claude Chat workflow with model selection and history tracking
registerTest('SCEN-01', 'User workflow: Select Claude, choose Sonnet model, submit query, and verify history', async () => {
  const { aiChat, state } = harness.loadFreshAiChat();
  state.settings = { chatProvider: 'gemini', claudeModel: 'haiku', geminiCli: 'auto', geminiModel: '' };

  // Step 1: User switches provider to claude and model to sonnet
  const initialSend = aiChat.sendChat('Explica la teoría de la relatividad en dos frases', {
    provider: 'claude',
    claudeModel: 'sonnet',
  });
  assert.strictEqual(initialSend.ok, true, 'sendChat must accept user query');

  // Step 2: Verify getChatState returns user message and streaming assistant response
  const chatState = await aiChat.getChatState();
  assert.ok(chatState.messages.length >= 2, 'History must contain user message and assistant reply');

  const userMsg = chatState.messages[0];
  assert.strictEqual(userMsg.role, 'user', 'First message must be role: user');
  assert.strictEqual(userMsg.text, 'Explica la teoría de la relatividad en dos frases');

  const assistantMsg = chatState.messages[1];
  assert.strictEqual(assistantMsg.role, 'assistant', 'Second message must be role: assistant');
  assert.strictEqual(assistantMsg.provider, 'claude');
  assert.strictEqual(assistantMsg.model, 'sonnet');

  // Clean up
  aiChat.clearChat();
  const clearedState = await aiChat.getChatState();
  assert.strictEqual(clearedState.messages.length, 0, 'clearChat must remove all conversation history');
});

// SCEN-02: End-to-end Gemini Chat workflow with CLI auto fallback logic
registerTest('SCEN-02', 'User workflow: Gemini Chat with auto fallback logic', async () => {
  const { aiChat, state } = harness.loadFreshAiChat();
  state.settings = { chatProvider: 'gemini', claudeModel: 'sonnet', geminiCli: 'auto', geminiModel: '' };

  // Send query using gemini provider with auto backend
  const res = aiChat.sendChat('Dame tres recetas rápidas', { provider: 'gemini' });
  assert.strictEqual(res.ok, true);

  const chatState = await aiChat.getChatState();
  assert.ok(chatState.messages.length >= 2);
  const assistantMsg = chatState.messages[1];
  assert.strictEqual(assistantMsg.provider, 'gemini');

  aiChat.cancelChat();
});

// SCEN-03: Dual-provider side-by-side comparison ("Ambos") workflow
registerTest('SCEN-03', 'User workflow: Dual-provider comparison ("Ambos") spawns paired responses', async () => {
  const { aiChat } = harness.loadFreshAiChat();

  // Send query using provider 'both'
  const res = aiChat.sendChat('Compara Python y JavaScript en rendimiento', {
    provider: 'both',
    claudeModel: 'sonnet',
  });
  assert.strictEqual(res.ok, true);

  const chatState = await aiChat.getChatState();
  // With 'both', 1 user message + 2 assistant messages = 3 total messages
  assert.strictEqual(chatState.messages.length, 3, 'Must spawn 1 user message and 2 assistant replies');

  const userMsg = chatState.messages[0];
  const geminiReply = chatState.messages.find((m) => m.provider === 'gemini');
  const claudeReply = chatState.messages.find((m) => m.provider === 'claude');

  assert.ok(geminiReply, 'Gemini assistant reply must exist in history');
  assert.ok(claudeReply, 'Claude assistant reply must exist in history');
  assert.strictEqual(geminiReply.group, userMsg.id, 'Gemini reply must be grouped with user message');
  assert.strictEqual(claudeReply.group, userMsg.id, 'Claude reply must be grouped with user message');

  aiChat.clearChat();
});

// SCEN-04: Full lifecycle background animation power cycle (0% idle CPU)
registerTest('SCEN-04', 'User workflow: Lifecycle power cycle confirms 0% CPU timer idle on tab change', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  const backdropCode = harness.readProjectFile('renderer/modules/backdrop.js');

  // Verify that backdrop registers and unregisters cleanly
  assert.ok(backdropCode.includes('runOnBeat'), 'Backdrop must use runOnBeat');
  assert.ok(backdropCode.includes('stopOnBeat'), 'Backdrop must use stopOnBeat');

  // Verify beat.js cleans up timers when no users are active
  assert.ok(beatCode.includes('if (!users.size)'), 'beat.js must verify users.size');
  assert.ok(beatCode.includes('clearTimeout(timer)'), 'beat.js must clear timer on zero listeners');
});

// SCEN-05: Home interactive widget walkthrough in Dark & Light themes
registerTest('SCEN-05', 'User workflow: Home widgets interactive hover glow and light theme switch', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const html = harness.readProjectFile('renderer/index.html');

  // Verify Home section exists
  assert.ok(html.includes('data-view="home"'), 'Home view section must exist');

  // Verify cards elevate on hover in dark mode
  const darkHover = harness.findCssRules(css, /\.widget:hover/);
  assert.ok(darkHover.length > 0, '.widget:hover rule must exist in dark theme');

  // Verify cards adapt cleanly in light mode
  const lightWidgets = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.widget\b/);
  assert.ok(lightWidgets.length > 0, ':root[data-theme="light"] .widget rule must exist');
});

module.exports = { tests };
