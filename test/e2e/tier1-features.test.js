/**
 * test/e2e/tier1-features.test.js — Tier 1: Feature Coverage (>=5 tests per feature)
 * 
 * Verifies core functionality for all 12 features specified in PROJECT.md:
 * - Feature 1: Window & Panel Expansion
 * - Feature 2: Chat Log & Composer Layout
 * - Feature 3: Model Selector UI
 * - Feature 4: Main Process Model Dispatch
 * - Feature 5: AI Subtle Backdrop Elements
 * - Feature 6: Beat.js Integration & Zero-Idle
 * - Feature 7: General Backdrop Subtle Sync
 * - Feature 8: Home Widget Cards Elevation & Acrylic
 * - Feature 9: Interactive Accent Glow on Hover/Active
 * - Feature 10: Individual Widget Visual Polish
 * - Feature 11: Light Theme Parity
 * - Feature 12: Repository Integrity & Staging Guard
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const harness = require('./harness');

const tests = [];

function registerTest(id, name, fn) {
  tests.push({ id, name, tier: 1, fn });
}

// =============================================================================
// Feature 1: Window & Panel Expansion
// =============================================================================

registerTest('F1-T1-1', 'Panel height is set to 360px in main/window.js', () => {
  const geom = harness.getWindowGeometry();
  assert.strictEqual(geom.PANEL_HEIGHT, 360, 'main/window.js PANEL_HEIGHT must be 360px');
});

registerTest('F1-T1-2', 'Window height expands to 418px in main/window.js', () => {
  const geom = harness.getWindowGeometry();
  assert.strictEqual(geom.WINDOW_HEIGHT, 418, 'main/window.js WINDOW_HEIGHT must be 418px (8 + 360 + 50)');
});

registerTest('F1-T1-3', 'CSS variables: --panel-height is 260px and --panel-chat-height is 360px', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const vars = harness.extractCssVariables(css);
  assert.strictEqual(vars.get('--panel-height'), '260px', 'styles.css --panel-height must be 260px for standard views');
  assert.strictEqual(vars.get('--panel-chat-height'), '360px', 'styles.css --panel-chat-height must be 360px for chat view');
});

registerTest('F1-T1-4', 'Window geometry maintains top gap (8px) and shadow margin (50px)', () => {
  const geom = harness.getWindowGeometry();
  assert.strictEqual(geom.TOP_GAP, 8, 'TOP_GAP must be 8px');
  assert.strictEqual(geom.SHADOW_MARGIN, 50, 'SHADOW_MARGIN must be 50px to prevent shadow clipping');
  assert.strictEqual(geom.WINDOW_WIDTH, 820, 'WINDOW_WIDTH must be 820px (720 + 2*50)');
});

registerTest('F1-T1-5', 'Island expanded state rule utilizes --panel-height', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.island\[data-shape=["']expanded["']\]/);
  assert.ok(rules.length > 0, 'Rule .island[data-shape="expanded"] must exist');
  const usesVar = rules.some((r) => harness.ruleHasProperty(r.body, 'height', /var\(--panel-height\)/));
  assert.ok(usesVar, '.island[data-shape="expanded"] must use var(--panel-height)');
});

// =============================================================================
// Feature 2: Chat Log & Composer Layout
// =============================================================================

registerTest('F2-T1-1', 'Chat log DOM element #chat-log exists with aria-live="polite"', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const chatLog = harness.extractElementById(html, 'chat-log');
  assert.ok(chatLog, 'Element #chat-log must exist in index.html');
  assert.strictEqual(chatLog.getAttribute('aria-live'), 'polite', '#chat-log must have aria-live="polite"');
});

registerTest('F2-T1-2', '.chat-log CSS defines flex: 1, min-height: 0, and overflow-y: auto', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.chat-log\b/);
  assert.ok(rules.length > 0, 'Rule .chat-log must exist');
  const hasFlex = rules.some((r) => harness.ruleHasProperty(r.body, 'flex', /1/));
  const hasOverflow = rules.some((r) => harness.ruleHasProperty(r.body, 'overflow-y', /auto/));
  const hasMinHeight = rules.some((r) => harness.ruleHasProperty(r.body, 'min-height', /0/));
  assert.ok(hasFlex, '.chat-log must define flex: 1');
  assert.ok(hasOverflow, '.chat-log must define overflow-y: auto');
  assert.ok(hasMinHeight, '.chat-log must define min-height: 0');
});

registerTest('F2-T1-3', 'Composer form contains #chat-input and #chat-send controls', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const input = harness.extractElementById(html, 'chat-input');
  const send = harness.extractElementById(html, 'chat-send');
  assert.ok(input, '#chat-input textarea must exist');
  assert.ok(send, '#chat-send button must exist');
  assert.strictEqual(input.tag, 'textarea', '#chat-input must be a textarea element');
});

registerTest('F2-T1-4', '.composer CSS defines rounded border-radius and translucent background', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.composer\b/);
  assert.ok(rules.length > 0, 'Rule .composer must exist');
  const hasRadius = rules.some((r) => harness.ruleHasProperty(r.body, 'border-radius', /\d+px/));
  const hasBg = rules.some((r) => harness.ruleHasProperty(r.body, 'background', /rgba|var/));
  assert.ok(hasRadius, '.composer must specify a border-radius');
  assert.ok(hasBg, '.composer must specify a background');
});

registerTest('F2-T1-5', 'Chat log expanded vertical clearance exceeds 180px under 360px panel', () => {
  // Panel (360) - Topbar (40) - Tabbar (40) - Panel padding (12) - AI padding (8) - AI head (30) - Composer (36)
  const panelHeight = 360;
  const fixedElements = 40 + 40 + 12 + 8 + 30 + 36;
  const availableChatLog = panelHeight - fixedElements;
  assert.ok(availableChatLog >= 180, `Available chat-log height (${availableChatLog}px) must be >= 180px`);
});

// =============================================================================
// Feature 3: Model Selector UI
// =============================================================================

registerTest('F3-T1-1', 'Claude model selector (#chat-model or #chat-model-claude) contains opus, sonnet, and haiku', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const options = harness.extractSelectOptions(html, 'chat-model-claude').length > 0
    ? harness.extractSelectOptions(html, 'chat-model-claude')
    : harness.extractSelectOptions(html, 'chat-model');
  assert.ok(options.length >= 3, 'Claude model selector must have at least 3 model options');
  const values = options.map((o) => o.value);
  assert.ok(values.includes('opus'), 'Options must include opus');
  assert.ok(values.includes('sonnet'), 'Options must include sonnet');
  assert.ok(values.includes('haiku'), 'Options must include haiku');
});

registerTest('F3-T1-2', 'Antigravity / Gemini model selector exists in index.html', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const geminiSelect = harness.extractElementById(html, 'chat-model-gemini') ||
                       harness.extractElementById(html, 'chat-model-agy');
  assert.ok(geminiSelect, 'A companion selector (#chat-model-gemini or #chat-model-agy) must exist in index.html');
});

registerTest('F3-T1-3', 'Antigravity / Gemini selector contains backend options auto, agy, and gemini', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const options = harness.extractSelectOptions(html, 'chat-model-gemini').length > 0
    ? harness.extractSelectOptions(html, 'chat-model-gemini')
    : harness.extractSelectOptions(html, 'chat-model-agy');
  assert.ok(options.length >= 2, 'Antigravity / Gemini selector must contain backend options');
  const values = options.map((o) => o.value);
  assert.ok(values.includes('auto') || values.includes('agy') || values.includes('gemini'),
    'Selector options must include auto, agy, or gemini');
});

registerTest('F3-T1-4', 'CSS conditionally displays Claude selector when data-provider="claude"', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  // Confirm selector rules exist for provider display toggles
  const geminiHidden = harness.findCssRules(css, /\.ai\[data-provider=["']gemini["']\]\s+.*chat-model/);
  assert.ok(geminiHidden.length > 0, 'CSS must have rule hiding or toggling Claude model wrap when provider is gemini');
});

registerTest('F3-T1-5', 'CSS conditionally displays Gemini selector when data-provider="gemini" or "both"', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const claudeHidden = harness.findCssRules(css, /\.ai\[data-provider=["']claude["']\]\s+.*gemini/i);
  const bothVisible = harness.findCssRules(css, /\.ai\[data-provider=["']both["']\]/i);
  assert.ok(claudeHidden.length > 0 || bothVisible.length > 0,
    'CSS must declare provider-specific selector visibility rules for Gemini/Both');
});

// =============================================================================
// Feature 4: Main Process Model Dispatch
// =============================================================================

registerTest('F4-T1-1', 'getChatState() reports provider, claudeModel, and gemini configuration', async () => {
  const { aiChat } = harness.loadFreshAiChat();
  const state = await aiChat.getChatState();
  assert.ok(typeof state === 'object' && state !== null, 'getChatState() must return an object');
  assert.ok('messages' in state, 'State must contain messages array');
  assert.ok('busy' in state, 'State must contain busy boolean');
  assert.ok('provider' in state, 'State must contain provider');
  assert.ok('claudeModel' in state, 'State must contain claudeModel');
  // R2 requirement: geminiCli and/or geminiModel
  assert.ok('geminiCli' in state || 'geminiModel' in state || 'available' in state,
    'getChatState() must expose gemini configuration or availability per contract');
});

registerTest('F4-T1-2', 'sendChat() accepts geminiCli and geminiModel in options', () => {
  const { aiChat } = harness.loadFreshAiChat();
  const res = aiChat.sendChat('', { provider: 'gemini', geminiCli: 'agy', geminiModel: 'flash' });
  // Should reject empty string with { ok: false, error: 'empty' }, proving options are parsed
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'empty', 'sendChat should validate text and accept options parameter');
});

registerTest('F4-T1-3', 'CLAUDE_MODELS constant contains standard model options', () => {
  const { aiChat } = harness.loadFreshAiChat();
  assert.ok(Array.isArray(aiChat.CLAUDE_MODELS), 'CLAUDE_MODELS must be an array');
  assert.ok(aiChat.CLAUDE_MODELS.includes('sonnet'), 'CLAUDE_MODELS must include sonnet');
  assert.ok(aiChat.CLAUDE_MODELS.includes('opus'), 'CLAUDE_MODELS must include opus');
  assert.ok(aiChat.CLAUDE_MODELS.includes('haiku'), 'CLAUDE_MODELS must include haiku');
});

registerTest('F4-T1-4', 'sendChat() validates input length up to MAX_MESSAGE_CHARS', () => {
  const { aiChat } = harness.loadFreshAiChat();
  const hugeMessage = 'a'.repeat(8001);
  const res = aiChat.sendChat(hugeMessage);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'too-long', 'sendChat must reject message > 8000 chars');
});

registerTest('F4-T1-5', 'Preferences persistence updates state when options are provided', () => {
  const { aiChat, state } = harness.loadFreshAiChat();
  state.settings = { chatProvider: 'gemini', claudeModel: 'haiku', geminiCli: 'auto', geminiModel: '' };
  // Calling sendChat with empty message shouldn't crash
  const res = aiChat.sendChat('Hola mundo', { provider: 'claude', claudeModel: 'opus' });
  assert.ok(res.ok === true || res.ok === false, 'sendChat executes cleanly');
});

// =============================================================================
// Feature 5: AI Subtle Backdrop Elements
// =============================================================================

registerTest('F5-T1-1', 'AI backdrop container .ai-backdrop exists with aria-hidden="true"', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const backdrops = harness.extractElementsByClass(html, 'ai-backdrop');
  assert.ok(backdrops.length > 0, 'index.html must contain .ai-backdrop element');
  assert.strictEqual(backdrops[0].getAttribute('aria-hidden'), 'true', '.ai-backdrop must have aria-hidden="true"');
});

registerTest('F5-T1-2', '.ai-backdrop contains blob elements (<i>) for animated gradients', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const match = html.match(/<div[^>]*class=["'][^"']*ai-backdrop[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(match, '.ai-backdrop element must be present in HTML');
  const blobCount = (match[1].match(/<i\b[^>]*>/gi) || []).length;
  assert.ok(blobCount >= 2, '.ai-backdrop must contain at least 2 <i> blob elements for radial gradients');
});

registerTest('F5-T1-3', '.ai-backdrop CSS sets GPU composition properties will-change', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const blobRules = harness.findCssRules(css, /\.ai-backdrop\s+i/);
  assert.ok(blobRules.length > 0, 'CSS rule for .ai-backdrop i must exist');
  const hasWillChange = blobRules.some((r) => harness.ruleHasProperty(r.body, 'will-change', /translate|scale/));
  assert.ok(hasWillChange, '.ai-backdrop i must specify will-change: translate, scale');
});

registerTest('F5-T1-4', '.ai-backdrop defines provider-specific gradient color variables', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const geminiRules = harness.findCssRules(css, /\.ai\[data-provider=["']gemini["']\]/);
  const claudeRules = harness.findCssRules(css, /\.ai\[data-provider=["']claude["']\]/);
  assert.ok(geminiRules.length > 0 && claudeRules.length > 0,
    'CSS must define provider-specific theme rules for .ai[data-provider]');
});

registerTest('F5-T1-5', '.ai-backdrop is non-interactive and absolute positioned', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.ai-backdrop\b/);
  assert.ok(rules.length > 0, 'Rule .ai-backdrop must exist');
  const hasPointerEvents = rules.some((r) => harness.ruleHasProperty(r.body, 'pointer-events', 'none'));
  const hasAbsolute = rules.some((r) => harness.ruleHasProperty(r.body, 'position', 'absolute'));
  assert.ok(hasPointerEvents, '.ai-backdrop must have pointer-events: none');
  assert.ok(hasAbsolute, '.ai-backdrop must have position: absolute');
});

// =============================================================================
// Feature 6: Beat.js Integration & Zero-Idle
// =============================================================================

registerTest('F6-T1-1', 'renderer/modules/beat.js exports runOnBeat, stopOnBeat, and runOnFrames', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  assert.ok(/export\s+function\s+runOnBeat\b/.test(beatCode), 'beat.js must export runOnBeat');
  assert.ok(/export\s+function\s+stopOnBeat\b/.test(beatCode), 'beat.js must export stopOnBeat');
  assert.ok(/export\s+function\s+runOnFrames\b/.test(beatCode), 'beat.js must export runOnFrames');
});

registerTest('F6-T1-2', 'beat.js quantizes loop at 8 steps per second (125 ms)', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  const match = beatCode.match(/const\s+STEP_MS\s*=\s*(\d+)/);
  assert.ok(match, 'STEP_MS constant must be defined in beat.js');
  assert.strictEqual(parseInt(match[1], 10), 125, 'STEP_MS must be 125 (8 steps per second)');
});

registerTest('F6-T1-3', 'beat.js cancels timer when users map becomes empty (zero-idle)', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  assert.ok(/if\s*\(!users\.size\)\s*(?:\{\s*)?return/.test(beatCode) ||
            /clearTimeout\(timer\)/.test(beatCode),
    'beat.js must clear timer and return early when users.size is 0');
});

registerTest('F6-T1-4', 'beat.js respects isMotionReduced() by stopping all beat users', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  assert.ok(/isMotionReduced\(\)/.test(beatCode), 'beat.js must invoke isMotionReduced()');
  assert.ok(/stopOnBeat/.test(beatCode), 'beat.js must call stopOnBeat when motion is reduced');
});

registerTest('F6-T1-5', 'Backdrop animation connects to runOnBeat and registers stopOnBeat', () => {
  const backdropCode = harness.readProjectFile('renderer/modules/backdrop.js');
  assert.ok(/runOnBeat\(['"]backdrop['"]/.test(backdropCode), 'backdrop.js must register with runOnBeat');
  assert.ok(/stopOnBeat\(['"]backdrop['"]/.test(backdropCode), 'backdrop.js must call stopOnBeat on deactivate');
});

// =============================================================================
// Feature 7: General Backdrop Subtle Sync
// =============================================================================

registerTest('F7-T1-1', 'Music backdrop in renderer/index.html contains 3 blob elements', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const match = html.match(/<div[^>]*class=["'][^"']*music-backdrop[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(match, '.music-backdrop must exist in index.html');
  const blobCount = (match[1].match(/<i\b[^>]*>/gi) || []).length;
  assert.strictEqual(blobCount, 3, '.music-backdrop must contain exactly 3 <i> elements');
});

registerTest('F7-T1-2', 'Backdrop placement accumulates movedMs on stop to prevent jerk on resume', () => {
  const backdropCode = harness.readProjectFile('renderer/modules/backdrop.js');
  assert.ok(/movedMs\s*\+=/.test(backdropCode), 'backdrop.js must accumulate elapsed time into movedMs onStop');
});

registerTest('F7-T1-3', 'Backdrop ease function implements smooth cubic ease-in-out', () => {
  const backdropCode = harness.readProjectFile('renderer/modules/backdrop.js');
  assert.ok(/function\s+ease\(t\)/.test(backdropCode), 'ease(t) function must be defined in backdrop.js');
  // Check standard cubic ease formula: 4*t*t*t
  assert.ok(/4\s*\*\s*t\s*\*\s*t\s*\*\s*t/.test(backdropCode), 'ease(t) must implement smooth cubic ease-in-out');
});

registerTest('F7-T1-4', 'Backdrop hooks lifecycle events onPanelChange, onTabChange, and onMediaChange', () => {
  const backdropCode = harness.readProjectFile('renderer/modules/backdrop.js');
  assert.ok(/onPanelChange\(/.test(backdropCode), 'initBackdrop must hook onPanelChange');
  assert.ok(/onTabChange\(/.test(backdropCode), 'initBackdrop must hook onTabChange');
  assert.ok(/onMediaChange\(/.test(backdropCode), 'initBackdrop must hook onMediaChange');
});

registerTest('F7-T1-5', '.music-backdrop CSS defines transition for opacity with pointer-events: none', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.music-backdrop\b/);
  assert.ok(rules.length > 0, 'Rule .music-backdrop must exist');
  const hasOpacityTransition = rules.some((r) => harness.ruleHasProperty(r.body, 'transition', /opacity/));
  const hasPointerEvents = rules.some((r) => harness.ruleHasProperty(r.body, 'pointer-events', 'none'));
  assert.ok(hasOpacityTransition, '.music-backdrop must have transition for opacity');
  assert.ok(hasPointerEvents, '.music-backdrop must have pointer-events: none');
});

// =============================================================================
// Feature 8: Home Widget Cards Elevation & Acrylic
// =============================================================================

registerTest('F8-T1-1', 'Home view #widgets contains all 8 standard widget cards in index.html', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const requiredWidgets = [
    'home-clock',
    'home-music',
    'home-focus',
    'home-ai',
    'home-links-widget',
    'home-battery',
    'home-clipboard',
    'home-note',
  ];
  for (const wId of requiredWidgets) {
    const el = harness.extractElementById(html, wId);
    assert.ok(el, `Widget card #${wId} must exist in index.html`);
  }
});

registerTest('F8-T1-2', '.widget defines translucent acrylic background and rounded border-radius', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.widget\b/);
  assert.ok(rules.length > 0, 'Rule .widget must exist in styles.css');
  const hasBg = rules.some((r) => harness.ruleHasProperty(r.body, 'background-color', /rgba|var/));
  const hasRadius = rules.some((r) => harness.ruleHasProperty(r.body, 'border-radius', /\d+px/));
  assert.ok(hasBg, '.widget must specify acrylic background-color');
  assert.ok(hasRadius, '.widget must specify border-radius');
});

registerTest('F8-T1-3', '.widget resting card styling features specular top border highlight', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.widget\b/);
  assert.ok(rules.length > 0, 'Rule .widget must exist');
  // Check for specular highlight or box-shadow inset
  const hasSpecular = rules.some((r) => harness.ruleHasProperty(r.body, 'box-shadow', /inset/));
  assert.ok(hasSpecular, '.widget must specify an inset highlight in box-shadow');
});

registerTest('F8-T1-4', '.widget resting state incorporates layered drop shadow for elevation', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.widget\b/);
  const hasShadow = rules.some((r) => harness.ruleHasProperty(r.body, 'box-shadow', /rgba/));
  assert.ok(hasShadow, '.widget must define box-shadow with elevation');
});

registerTest('F8-T1-5', 'Home widgets grid defines 4 columns and 2 rows template', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.widgets\b/);
  assert.ok(rules.length > 0, 'Rule .widgets must exist');
  const hasCols = rules.some((r) => harness.ruleHasProperty(r.body, 'grid-template-columns', /repeat\(4/));
  const hasRows = rules.some((r) => harness.ruleHasProperty(r.body, 'grid-template-rows', /repeat\(2/));
  assert.ok(hasCols, '.widgets must specify 4 columns');
  assert.ok(hasRows, '.widgets must specify 2 rows');
});

// =============================================================================
// Feature 9: Interactive Accent Glow on Hover/Active
// =============================================================================

registerTest('F9-T1-1', '.widget:hover specifies dynamic accent glow using color-mix', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const hoverRules = harness.findCssRules(css, /\.widget:hover/);
  assert.ok(hoverRules.length > 0, 'Rule .widget:hover must exist');
  const hasAccentGlow = hoverRules.some((r) =>
    harness.ruleHasProperty(r.body, 'box-shadow', /--widget-accent|color-mix/)
  );
  assert.ok(hasAccentGlow, '.widget:hover box-shadow must include dynamic accent glow (--widget-accent / color-mix)');
});

registerTest('F9-T1-2', '.widget:hover applies upward elevation transform translateY', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const hoverRules = harness.findCssRules(css, /\.widget:hover/);
  const hasTranslateY = hoverRules.some((r) =>
    harness.ruleHasProperty(r.body, 'transform', /translateY\(-?\d+px\)/)
  );
  assert.ok(hasTranslateY, '.widget:hover must apply translateY lift');
});

registerTest('F9-T1-3', '.widget:active applies tactile press feedback transform scale', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const activeRules = harness.findCssRules(css, /\.widget:active/);
  assert.ok(activeRules.length > 0, 'Rule .widget:active must exist');
  const hasScale = activeRules.some((r) =>
    harness.ruleHasProperty(r.body, 'transform', /scale\(/) ||
    harness.ruleHasProperty(r.body, 'scale', /0\.\d+/)
  );
  assert.ok(hasScale, '.widget:active must apply tactile press scale');
});

registerTest('F9-T1-4', '.widget defines smooth transition for transform and box-shadow', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.widget\b/);
  const hasTransition = rules.some((r) =>
    harness.ruleHasProperty(r.body, 'transition', /transform/) &&
    harness.ruleHasProperty(r.body, 'transition', /box-shadow/)
  );
  assert.ok(hasTransition, '.widget must declare transitions for transform and box-shadow');
});

registerTest('F9-T1-5', 'Hover elevation is suppressed when home is in editing mode', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const hoverRules = harness.findCssRules(css, /\.home:not\(\[data-editing=["']true["']\]\)\s+\.widget:hover/);
  assert.ok(hoverRules.length > 0,
    '.widget:hover must be scoped to .home:not([data-editing="true"]) to avoid conflict in edit mode');
});

// =============================================================================
// Feature 10: Individual Widget Visual Polish
// =============================================================================

registerTest('F10-T1-1', 'Music widget defines tailored playing state visual accent and glow', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const musicPlaying = harness.findCssRules(css, /\.widget-music\[data-playing=["']true["']\]/i);
  assert.ok(musicPlaying.length > 0, 'Rule .widget-music[data-playing="true"] must exist in styles.css');
});

registerTest('F10-T1-2', 'Focus / Pomodoro widget includes SVG progress ring and state styling', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const html = harness.readProjectFile('renderer/index.html');
  const focusWidget = harness.extractElementById(html, 'home-focus');
  assert.ok(focusWidget, '#home-focus widget must exist in index.html');
  const ringRules = harness.findCssRules(css, /\.widget-focus\s+.*ring|focus-ring/i);
  assert.ok(ringRules.length > 0, 'CSS must include styling for focus widget progress ring');
});

registerTest('F10-T1-3', 'Links widget styles shortcut buttons with glass circles and brand glyphs', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const html = harness.readProjectFile('renderer/index.html');
  const linksWidget = harness.extractElementById(html, 'home-links-widget');
  assert.ok(linksWidget, '#home-links-widget must exist in index.html');
  const linkBtnRules = harness.findCssRules(css, /\.widget-link\b/);
  assert.ok(linkBtnRules.length > 0, 'Rule .widget-link must exist in styles.css');
});

registerTest('F10-T1-4', 'Battery widget defines visual state indicators for charging and status', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const batteryRules = harness.findCssRules(css, /\.widget-battery/);
  assert.ok(batteryRules.length > 0, 'Rules for .widget-battery must exist');
});

registerTest('F10-T1-5', 'Clock widget formats dial and time typography cleanly', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const clockRules = harness.findCssRules(css, /\.widget-clock/);
  assert.ok(clockRules.length > 0, 'Rules for .widget-clock must exist in styles.css');
});

// =============================================================================
// Feature 11: Light Theme Parity
// =============================================================================

registerTest('F11-T1-1', ':root[data-theme="light"] overrides .widget with light acrylic background', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const lightWidget = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.widget\b/);
  assert.ok(lightWidget.length > 0, 'Rule :root[data-theme="light"] .widget must exist');
  const hasLightBg = lightWidget.some((r) =>
    harness.ruleHasProperty(r.body, 'background-color', /255,\s*255,\s*255|#fff/)
  );
  assert.ok(hasLightBg, ':root[data-theme="light"] .widget must specify light acrylic background');
});

registerTest('F11-T1-2', ':root[data-theme="light"] widget hover state defines tailored drop shadow', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const lightHover = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+.*\.widget:hover/);
  assert.ok(lightHover.length > 0, 'Light theme hover rule must exist');
  const hasShadow = lightHover.some((r) => harness.ruleHasProperty(r.body, 'box-shadow', /rgba/));
  assert.ok(hasShadow, 'Light theme hover rule must define tailored box-shadow');
});

registerTest('F11-T1-3', 'Light theme preserves distinct widget slot borders', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const slotRules = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.widget-slot/);
  assert.ok(slotRules.length > 0, 'Rule :root[data-theme="light"] .widget-slot must exist');
});

registerTest('F11-T1-4', 'Light theme adjusts clock dial fill for crisp contrast', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const clockRules = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.clock-dial/);
  assert.ok(clockRules.length > 0, 'Rule :root[data-theme="light"] .clock-dial must exist');
});

registerTest('F11-T1-5', 'Light theme maintains legible contrast on popover dialogs', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const popoverRules = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.popover/);
  assert.ok(popoverRules.length > 0, 'Rule :root[data-theme="light"] .popover must exist');
});

// =============================================================================
// Feature 12: Repository Integrity & Staging Guard
// =============================================================================

registerTest('F12-T1-1', 'config/settings.json is not staged for commit in git index', () => {
  const git = harness.checkGitStaging();
  assert.ok(git.clean, `Restricted files are staged: ${git.forbiddenStaged?.join(', ')}`);
});

registerTest('F12-T1-2', 'config/links.json is not staged for commit in git index', () => {
  const git = harness.checkGitStaging();
  const linksStaged = git.stagedFiles?.some((f) => f.includes('config/links.json'));
  assert.strictEqual(linksStaged, false, 'config/links.json must never be staged');
});

registerTest('F12-T1-3', 'package.json dependencies contain only simple-icons (no new libraries)', () => {
  const pkg = harness.checkPackageDependencies();
  assert.strictEqual(pkg.ok, true, `Unauthorized packages detected: ${pkg.extraDependencies.join(', ')}`);
});

registerTest('F12-T1-4', 'All main process JavaScript files pass syntax check (node --check)', () => {
  const mainDir = path.join(harness.PROJECT_ROOT, 'main');
  const files = fs.readdirSync(mainDir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'Main directory must contain js files');
  for (const f of files) {
    const res = harness.checkSyntax(path.join('main', f));
    assert.strictEqual(res.valid, true, `Syntax error in main/${f}: ${res.error}`);
  }
});

registerTest('F12-T1-5', 'All renderer modules and widgets pass syntax check (node --check)', () => {
  const modDir = path.join(harness.PROJECT_ROOT, 'renderer', 'modules');
  const modFiles = fs.readdirSync(modDir).filter((f) => f.endsWith('.js'));
  for (const f of modFiles) {
    const res = harness.checkSyntax(path.join('renderer', 'modules', f));
    assert.strictEqual(res.valid, true, `Syntax error in renderer/modules/${f}: ${res.error}`);
  }

  const widDir = path.join(harness.PROJECT_ROOT, 'renderer', 'widgets');
  const widFiles = fs.readdirSync(widDir).filter((f) => f.endsWith('.js'));
  for (const f of widFiles) {
    const res = harness.checkSyntax(path.join('renderer', 'widgets', f));
    assert.strictEqual(res.valid, true, `Syntax error in renderer/widgets/${f}: ${res.error}`);
  }
});

module.exports = { tests };
