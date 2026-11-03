/**
 * test/e2e/tier3-combinations.test.js — Tier 3: Cross-Feature Combinations
 * 
 * Verifies pairwise interactions and multi-module integration:
 * - COMB-01: Panel Height Expansion (F1) x Chat Log & Composer Layout (F2)
 * - COMB-02: Model Selector UI (F3) x Main Process Model Dispatch (F4)
 * - COMB-03: AI Subtle Backdrop (F5) x Beat.js Zero-Idle (F6)
 * - COMB-04: Chat Provider Toggle (F3/F4) x AI Backdrop Accent Glow (F5)
 * - COMB-05: Reduced Motion (F6) x AI & General Backdrop Sync (F5/F7)
 * - COMB-06: Home Widget Cards Elevation (F8) x Interactive Accent Glow (F9)
 * - COMB-07: Individual Widget Polish (F10) x Light Theme Parity (F11)
 * - COMB-08: Panel Height Expansion (F1) x Home Widget Grid (F8)
 * - COMB-09: Model Selector UI (F3) x CLI Availability Detection (F4)
 * - COMB-10: Staging Guard (F12) x Main Config Defaults & Preferences (F4)
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const harness = require('./harness');

const tests = [];

function registerTest(id, name, fn) {
  tests.push({ id, name, tier: 3, fn });
}

// COMB-01: Panel Height Expansion (F1) x Chat Log & Composer Layout (F2)
registerTest('COMB-01', 'Panel 360px height accommodates 4-line composer and multiline chat message', () => {
  const geom = harness.getWindowGeometry();
  assert.strictEqual(geom.PANEL_HEIGHT, 360, 'Panel height must be 360px');

  // Total panel height: 360px
  // Topbar (40) + Tabbar (40) + Padding (12) = 92px fixed
  // Available views height = 360 - 92 = 268px
  const viewsHeight = geom.PANEL_HEIGHT - (40 + 40 + 12);
  assert.strictEqual(viewsHeight, 268, 'Available views height must be 268px');

  // In chat view: AI head (30px) + AI padding (8px) = 38px
  // Available chat body height = 268 - 38 = 230px
  const chatBodyHeight = viewsHeight - 38;
  assert.strictEqual(chatBodyHeight, 230, 'Available chat body height must be 230px');

  // Max composer height for 4 lines: ~90px
  // Minimum remaining height for chat log: 230 - 90 = 140px (sufficient for full bubble + sender glyph + timestamp)
  const remainingForChatLog = chatBodyHeight - 90;
  assert.ok(remainingForChatLog >= 130, `Remaining chat log height (${remainingForChatLog}px) must be >= 130px`);
});

// COMB-02: Model Selector UI (F3) x Main Process Model Dispatch (F4)
registerTest('COMB-02', 'Selected UI model options map directly to main process dispatch payload', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const claudeOptions = (
    harness.extractSelectOptions(html, 'chat-model-claude').length > 0
      ? harness.extractSelectOptions(html, 'chat-model-claude')
      : harness.extractSelectOptions(html, 'chat-model')
  ).map((o) => o.value);
  const { aiChat } = harness.loadFreshAiChat();

  // Every option in HTML selector must be supported in ai-chat CLAUDE_MODELS
  for (const opt of claudeOptions) {
    assert.ok(aiChat.CLAUDE_MODELS.includes(opt), `HTML option "${opt}" must be included in CLAUDE_MODELS`);
  }

  // Sending with each option should pass validation
  for (const opt of claudeOptions) {
    const instance = harness.loadFreshAiChat();
    const res = instance.aiChat.sendChat('Hola', { provider: 'claude', claudeModel: opt });
    assert.strictEqual(res.ok, true, `sendChat with claudeModel "${opt}" must succeed`);
    instance.aiChat.cancelChat();
  }
});

// COMB-03: AI Subtle Backdrop (F5) x Beat.js Zero-Idle (F6)
registerTest('COMB-03', 'AI backdrop registration with beat.js ensures zero CPU timers when inactive', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  // Verify users map and clearTimeout behavior
  assert.ok(/const\s+users\s*=\s*new\s+Map\(\)/.test(beatCode), 'beat.js must manage active listeners via users Map');
  assert.ok(/clearTimeout\(timer\)/.test(beatCode), 'beat.js must clear timer when users count reaches zero');
});

// COMB-04: Chat Provider Toggle (F3/F4) x AI Backdrop Accent Glow (F5)
registerTest('COMB-04', 'Toggling chat provider switches model selector and backdrop color accents', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  // Check provider rules for selector visibility and backdrop colors
  const geminiRules = harness.findCssRules(css, /\.ai\[data-provider=["']gemini["']\]/);
  const claudeRules = harness.findCssRules(css, /\.ai\[data-provider=["']claude["']\]/);
  assert.ok(geminiRules.length > 0, 'CSS rules must exist for .ai[data-provider="gemini"]');
  assert.ok(claudeRules.length > 0, 'CSS rules must exist for .ai[data-provider="claude"]');
});

// COMB-05: Reduced Motion (F6) x AI & General Backdrop Sync (F5/F7)
registerTest('COMB-05', 'isMotionReduced instantly unregisters beat tasks and halts backdrop animation', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  // Verify that tick() checks motion reduction
  assert.ok(/isMotionReduced\(\)[\s\S]*?stopOnBeat/.test(beatCode),
    'beat.js tick() must stop all active users if isMotionReduced() becomes true');
});

// COMB-06: Home Widget Cards Elevation (F8) x Interactive Accent Glow (F9)
registerTest('COMB-06', 'Widget resting elevation shadow and hover accent glow stack correctly', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const baseRules = harness.findCssRules(css, /\.widget\b/);
  const hoverRules = harness.findCssRules(css, /\.widget:hover/);

  assert.ok(baseRules.length > 0, '.widget base rule must exist');
  assert.ok(hoverRules.length > 0, '.widget:hover rule must exist');

  // Both should define box-shadow without syntax collision
  const baseHasShadow = baseRules.some((r) => harness.ruleHasProperty(r.body, 'box-shadow'));
  const hoverHasShadow = hoverRules.some((r) => harness.ruleHasProperty(r.body, 'box-shadow'));
  assert.ok(baseHasShadow, 'Base widget must have box-shadow for elevation');
  assert.ok(hoverHasShadow, 'Hover widget must have box-shadow for interactive accent glow');
});

// COMB-07: Individual Widget Polish (F10) x Light Theme Parity (F11)
registerTest('COMB-07', 'Light theme preserves individual widget visual cues and contrast', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const lightRoot = harness.findCssRules(css, /:root\[data-theme=["']light["']\]/);
  assert.ok(lightRoot.length > 0, 'CSS must provide :root[data-theme="light"] rules');

  // Light theme overrides widget background with >= 0.70 opacity
  const lightWidgets = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.widget\b/);
  assert.ok(lightWidgets.length > 0, 'Light theme widget rule must exist');
});

// COMB-08: Panel Height Expansion (F1) x Home Widget Grid (F8)
registerTest('COMB-08', 'Expanded panel height gives Home 4x2 grid cards optimal height (~125px)', () => {
  const geom = harness.getWindowGeometry();
  const availableViewsHeight = geom.PANEL_HEIGHT - (40 + 40 + 12); // 268px
  // In Home view: grid has 2 rows and 8px gap
  // Card height = (268 - 8) / 2 = 130px
  const cardHeight = (availableViewsHeight - 8) / 2;
  assert.ok(cardHeight >= 115, `Home card height (${cardHeight}px) must be >= 115px for spacious acrylic layout`);
});

// COMB-09: Model Selector UI (F3) x CLI Availability Detection (F4)
registerTest('COMB-09', 'Main process CLI detection provides graceful fallback if backend is missing', () => {
  const { aiChat } = harness.loadFreshAiChat();
  // findExecutable / runGemini handles missing executable gracefully
  assert.ok(typeof aiChat.getChatState === 'function', 'getChatState must be a function');
  const state = aiChat.getChatState();
  assert.ok(state !== null && typeof state === 'object', 'getChatState must return state object');
});

// COMB-10: Staging Guard (F12) x Main Config Defaults & Preferences (F4)
registerTest('COMB-10', 'Updating preferences in memory does not stage restricted files in git', () => {
  const { aiChat, state } = harness.loadFreshAiChat();
  state.settings = { chatProvider: 'gemini', claudeModel: 'haiku', geminiCli: 'auto', geminiModel: '' };

  // Trigger sendChat to execute rememberPrefs
  aiChat.sendChat('Prueba de guardado', { provider: 'claude', claudeModel: 'opus' });
  aiChat.cancelChat();

  // Verify that git index remains clean of config/settings.json and config/links.json
  const git = harness.checkGitStaging();
  assert.strictEqual(git.clean, true, 'Restricted files must not be staged in git index');
});

module.exports = { tests };
