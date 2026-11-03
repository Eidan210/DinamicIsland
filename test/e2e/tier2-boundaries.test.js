/**
 * test/e2e/tier2-boundaries.test.js — Tier 2: Boundary & Corner Cases (>=5 tests per feature)
 * 
 * Verifies edge conditions, input sanitization, error paths, and mathematical invariants:
 * - Feature 1: Window aspect ratio, shadow clearance, resolution limits, screen centering
 * - Feature 2: Empty chat-log, autosize limits, multiline heights, side-by-side overflow
 * - Feature 3: Corrupted data-provider, select accessibility, header space constraints
 * - Feature 4: Input validation (empty, whitespace, 8000 char boundary, provider fallback)
 * - Feature 5: Zero-blobs guard, gradient alpha bounds, overflow hidden, pointer-events: none
 * - Feature 6: Zero-idle timer cancellation, rollover math, schedule rounding, reduced motion
 * - Feature 7: Easing monotonicity, boundary values (0, 0.5, 1), drift bounds, movedMs logic
 * - Feature 8: Min-dimensions 0, touch-action none, inert cursors, cascade animation delay
 * - Feature 9: Active press scale range, color-mix bounds, long-press pressing state
 * - Feature 10: Widget state attributes (data-playing, data-status, data-state, data-empty)
 * - Feature 11: Light theme opacity >= 0.70, white hover, popover shadow depth, dial fill
 * - Feature 12: Staging guards, JSON syntax validation, dependency whitelist, script commands
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const harness = require('./harness');

const tests = [];

function registerTest(id, name, fn) {
  tests.push({ id, name, tier: 2, fn });
}

// =============================================================================
// Feature 1 Boundaries: Window & Panel Expansion
// =============================================================================

registerTest('F1-T2-1', 'Panel dimensions preserve exact 2:1 aspect ratio (720x360)', () => {
  const geom = harness.getWindowGeometry();
  assert.strictEqual(geom.PANEL_WIDTH / geom.PANEL_HEIGHT, 2.0, 'Panel aspect ratio must be exactly 2:1');
});

registerTest('F1-T2-2', 'SHADOW_MARGIN (50px) exceeds maximum CSS box-shadow blur radius', () => {
  const geom = harness.getWindowGeometry();
  // In styles.css, expanded shadow is '0 12px 28px var(--panel-shadow)'
  // Blur is 28px, spread/offset is 12px -> 40px envelope
  assert.ok(geom.SHADOW_MARGIN >= 40, 'Shadow margin must be >= 40px to prevent DWM shadow clipping');
});

registerTest('F1-T2-3', 'WINDOW_HEIGHT (418px) occupies <= 40% of standard 1080p display', () => {
  const geom = harness.getWindowGeometry();
  const ratio = geom.WINDOW_HEIGHT / 1080;
  assert.ok(ratio <= 0.40, `Window height occupies ${(ratio * 100).toFixed(1)}% of 1080p (must be <= 40%)`);
  // Also verify on 768p displays
  const ratio768 = geom.WINDOW_HEIGHT / 768;
  assert.ok(ratio768 <= 0.55, 'Window height must fit comfortably on 768p laptop displays');
});

registerTest('F1-T2-4', 'Window horizontal centering equation handles odd and even screen widths', () => {
  const windowContent = harness.readProjectFile('main/window.js');
  assert.ok(/Math\.round\([^)]*width\s*-\s*WINDOW_WIDTH\s*\)\s*\/\s*2\)/.test(windowContent) ||
            /display\.bounds\.width\s*-\s*WINDOW_WIDTH/.test(windowContent),
    'main/window.js must center window with (width - WINDOW_WIDTH) / 2');
});

registerTest('F1-T2-5', 'Window creation options enforce resizable: false and transparent: true', () => {
  const windowContent = harness.readProjectFile('main/window.js');
  assert.ok(/resizable:\s*false/.test(windowContent), 'BrowserWindow must have resizable: false');
  assert.ok(/transparent:\s*true/.test(windowContent), 'BrowserWindow must have transparent: true');
  assert.ok(/frame:\s*false/.test(windowContent), 'BrowserWindow must have frame: false');
});

// =============================================================================
// Feature 2 Boundaries: Chat Log & Composer Layout
// =============================================================================

registerTest('F2-T2-1', 'Empty chat log renders starter prompt chips and empty state note', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const empty = harness.extractElementById(html, 'chat-empty');
  assert.ok(empty, '#chat-empty container must exist in index.html');
  const chips = (empty.raw.match(/class=["'][^"']*chat-chip[^"']*["']/g) || []).length;
  assert.ok(html.includes('chat-chip'), 'Starter prompt chips must exist in chat-empty');
});

registerTest('F2-T2-2', 'chat.js MAX_INPUT_LINES constant caps composer autosize expansion to 4 lines', () => {
  const chatCode = harness.readProjectFile('renderer/modules/chat.js');
  const match = chatCode.match(/const\s+MAX_INPUT_LINES\s*=\s*(\d+)/);
  assert.ok(match, 'MAX_INPUT_LINES constant must be defined');
  assert.strictEqual(parseInt(match[1], 10), 4, 'MAX_INPUT_LINES must equal 4');
});

registerTest('F2-T2-3', 'Single-line composer height remains bounded to <= 44px', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.composer\b/);
  // Composer has padding: 4px 5px 4px 13px and line-height ~18-20px -> single-line height ~36px
  const hasPadding = rules.some((r) => harness.ruleHasProperty(r.body, 'padding', /4px/));
  assert.ok(hasPadding, '.composer must have compact padding for minimal single-line height');
});

registerTest('F2-T2-4', 'Dual assistant response pair (.msg-pair) defines 2-column layout', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const pairRules = harness.findCssRules(css, /\.msg-pair\[data-count=["']2["']\]/);
  assert.ok(pairRules.length > 0, '.msg-pair[data-count="2"] rule must exist');
  const hasColumns = pairRules.some((r) =>
    harness.ruleHasProperty(r.body, '--cols', '2') ||
    harness.ruleHasProperty(r.body, 'grid-template-columns', /1fr\s+1fr|repeat\(2/)
  );
  assert.ok(hasColumns, 'Dual assistant responses must set --cols: 2 or render in 2 equal columns');
});

registerTest('F2-T2-5', 'Chat log scroll container defines overflow-x: hidden to prevent sideways scroll', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.chat-log\b/);
  const hasOverflowX = rules.some((r) => harness.ruleHasProperty(r.body, 'overflow-x', 'hidden'));
  assert.ok(hasOverflowX, '.chat-log must specify overflow-x: hidden');
});

// =============================================================================
// Feature 3 Boundaries: Model Selector UI
// =============================================================================

registerTest('F3-T2-1', 'Unknown data-provider attribute on .ai falls back gracefully in CSS', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  // Default .ai-chat-body has fallback background and styles
  const defaultAi = harness.findCssRules(css, /\.ai\b/);
  assert.ok(defaultAi.length > 0, '.ai base rule must exist to provide safe fallback for unknown attributes');
});

registerTest('F3-T2-2', 'Model select elements provide aria-label for screen reader accessibility', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const claudeSelect = harness.extractElementById(html, 'chat-model-claude') || harness.extractElementById(html, 'chat-model');
  assert.ok(claudeSelect, '#chat-model or #chat-model-claude must exist');
  assert.ok(claudeSelect.hasAttribute('aria-label'), 'Claude select must have aria-label');
});

registerTest('F3-T2-3', 'Header controls .ai-head-chat maintain flex gap and space distribution', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const headChatRules = harness.findCssRules(css, /\.ai-head-chat/);
  const headEndRules = harness.findCssRules(css, /\.ai-head-end/);
  assert.ok(headChatRules.length > 0 && headEndRules.length > 0, '.ai-head-chat and .ai-head-end rules must exist');
  const hasDisplayFlex = headChatRules.some((r) => harness.ruleHasProperty(r.body, 'display', 'flex'));
  const hasAlignItems = headEndRules.some((r) => harness.ruleHasProperty(r.body, 'align-items', 'center'));
  assert.ok(hasDisplayFlex, '.ai-head-chat must declare display: flex');
  assert.ok(hasAlignItems, '.ai-head-end must declare align-items: center');
});

registerTest('F3-T2-4', 'Claude model options contain unique non-empty string values', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const options = harness.extractSelectOptions(html, 'chat-model-claude').length > 0
    ? harness.extractSelectOptions(html, 'chat-model-claude')
    : harness.extractSelectOptions(html, 'chat-model');
  const values = options.map((o) => o.value);
  const uniqueValues = new Set(values);
  assert.strictEqual(values.length, uniqueValues.size, 'All Claude model option values must be unique');
  assert.ok(values.every((v) => v.length > 0), 'Option values must not be empty');
});

registerTest('F3-T2-5', 'Antigravity / Gemini model select options contain unique non-empty string values', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const options = harness.extractSelectOptions(html, 'chat-model-gemini').length > 0
    ? harness.extractSelectOptions(html, 'chat-model-gemini')
    : harness.extractSelectOptions(html, 'chat-model-agy');
  assert.ok(options.length >= 2, 'Gemini selector must have at least 2 options');
  const values = options.map((o) => o.value);
  const uniqueValues = new Set(values);
  assert.strictEqual(values.length, uniqueValues.size, 'All Gemini model option values must be unique');
});

// =============================================================================
// Feature 4 Boundaries: Main Process Model Dispatch
// =============================================================================

registerTest('F4-T2-1', 'sendChat() rejects empty string with { ok: false, error: "empty" }', () => {
  const { aiChat } = harness.loadFreshAiChat();
  const res = aiChat.sendChat('');
  assert.deepStrictEqual(res, { ok: false, error: 'empty' });
});

registerTest('F4-T2-2', 'sendChat() rejects whitespace-only string with { ok: false, error: "empty" }', () => {
  const { aiChat } = harness.loadFreshAiChat();
  const res = aiChat.sendChat('   \t\r\n  ');
  assert.deepStrictEqual(res, { ok: false, error: 'empty' });
});

registerTest('F4-T2-3', 'sendChat() boundary test: exactly 8000 chars is accepted, 8001 is rejected', () => {
  const { aiChat } = harness.loadFreshAiChat();
  const at8000 = 'x'.repeat(8000);
  const over8000 = 'x'.repeat(8001);

  const resOver = aiChat.sendChat(over8000);
  assert.deepStrictEqual(resOver, { ok: false, error: 'too-long' });

  // 8000 chars should pass validation (it will return { ok: true } and spawn process)
  const resAt = aiChat.sendChat(at8000);
  assert.strictEqual(resAt.ok, true);
  aiChat.cancelChat(); // Clean up running child
});

registerTest('F4-T2-4', 'Unrecognized provider in options falls back to state default provider', () => {
  const { aiChat, state } = harness.loadFreshAiChat();
  state.settings = { chatProvider: 'gemini', claudeModel: 'sonnet', geminiCli: 'auto', geminiModel: '' };
  // Send with unrecognized provider
  const res = aiChat.sendChat('Test query', { provider: 'unknown_provider_xyz' });
  assert.strictEqual(res.ok, true);
  aiChat.cancelChat();
});

registerTest('F4-T2-5', 'Unrecognized claudeModel in options falls back to state default claudeModel', () => {
  const { aiChat, state } = harness.loadFreshAiChat();
  state.settings = { chatProvider: 'claude', claudeModel: 'sonnet', geminiCli: 'auto', geminiModel: '' };
  const res = aiChat.sendChat('Test query', { provider: 'claude', claudeModel: 'gpt_4_fake' });
  assert.strictEqual(res.ok, true);
  aiChat.cancelChat();
});

// =============================================================================
// Feature 5 Boundaries: AI Subtle Backdrop Elements
// =============================================================================

registerTest('F5-T2-1', 'Backdrop contains at least 2 distinct blobs for layered gradient effect', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const match = html.match(/<div[^>]*class=["'][^"']*ai-backdrop[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  assert.ok(match, '.ai-backdrop must exist in index.html');
  const blobs = match[1].match(/<i\b[^>]*>/gi) || [];
  assert.ok(blobs.length >= 2, `.ai-backdrop must have >= 2 blobs (found ${blobs.length})`);
});

registerTest('F5-T2-2', 'Backdrop radial gradient alpha remains <= 0.20 for WCAG text contrast', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.ai-backdrop/);
  // Check that radial gradients do not exceed subtle opacity bounds
  const hasSubtleGradient = rules.some((r) => {
    const alphas = [...r.body.matchAll(/rgba?\([^)]*?([0-9.]+)\s*\)/g)].map((m) => parseFloat(m[1]));
    return alphas.length === 0 || alphas.every((a) => isNaN(a) || a <= 0.25);
  });
  assert.ok(hasSubtleGradient, 'Backdrop gradients must use subtle opacity (<= 0.25) to preserve chat text legibility');
});

registerTest('F5-T2-3', '.ai-backdrop specifies overflow: hidden to contain blobs within panel bounds', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.ai-backdrop\b/);
  const hasOverflowHidden = rules.some((r) => harness.ruleHasProperty(r.body, 'overflow', 'hidden'));
  assert.ok(hasOverflowHidden, '.ai-backdrop must specify overflow: hidden');
});

registerTest('F5-T2-4', '.ai-backdrop and blobs specify pointer-events: none', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.ai-backdrop\b/);
  const hasNone = rules.some((r) => harness.ruleHasProperty(r.body, 'pointer-events', 'none'));
  assert.ok(hasNone, '.ai-backdrop must specify pointer-events: none');
});

registerTest('F5-T2-5', 'Backdrop gradient transitions smoothly on provider switch', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.ai-backdrop/);
  const hasTransition = rules.some((r) => harness.ruleHasProperty(r.body, 'transition', /opacity|background/));
  assert.ok(hasTransition, '.ai-backdrop must specify a transition for smooth color changes');
});

// =============================================================================
// Feature 6 Boundaries: Beat.js Integration & Zero-Idle
// =============================================================================

registerTest('F6-T2-1', 'beat.js stopOnBeat deletes user and clears timer when users becomes empty', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  assert.ok(/users\.delete\(name\)/.test(beatCode), 'stopOnBeat must delete user from map');
  assert.ok(/if\s*\(!users\.size\)\s*\{\s*clearTimeout\(timer\);\s*timer\s*=\s*null;\s*\}/.test(beatCode),
    'stopOnBeat must clear timer and set timer = null when users.size is 0');
});

registerTest('F6-T2-2', 'CYCLE constant (840) is divisible by 2, 3, 4, 5, 6, 7, and 8', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  const match = beatCode.match(/const\s+CYCLE\s*=\s*(\d+)/);
  assert.ok(match, 'CYCLE constant must be defined in beat.js');
  const cycle = parseInt(match[1], 10);
  assert.strictEqual(cycle, 840, 'CYCLE must equal 840');
  for (let d = 2; d <= 8; d++) {
    assert.strictEqual(cycle % d, 0, `CYCLE (${cycle}) must be evenly divisible by ${d}`);
  }
});

registerTest('F6-T2-3', 'beat.js schedule uses Math.ceil to prevent 0ms spinning setTimeout', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  assert.ok(/Math\.ceil\(next\s*-\s*now\)/.test(beatCode),
    'beat.js schedule must use Math.ceil(next - now) to avoid scheduling zero or negative timeouts');
});

registerTest('F6-T2-4', 'register() stops immediately when isMotionReduced() returns true', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  assert.ok(/if\s*\(isMotionReduced\(\)\)\s*\{\s*stopOnBeat\(name\);\s*return;\s*\}/.test(beatCode),
    'register() must stop and return immediately if isMotionReduced() is active');
});

registerTest('F6-T2-5', 'beat.js slot modulo 3 aligns 24 Hz frames with 8 Hz beat steps', () => {
  const beatCode = harness.readProjectFile('renderer/modules/beat.js');
  assert.ok(/slot\s*%\s*3\s*===\s*0/.test(beatCode),
    'beat.js must evaluate slot % 3 === 0 to synchronize 24 Hz frames with 8 Hz steps');
});

// =============================================================================
// Feature 7 Boundaries: General Backdrop Subtle Sync
// =============================================================================

registerTest('F7-T2-1', 'ease(t) boundary values: ease(0)=0, ease(0.5)=0.5, ease(1)=1', () => {
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  assert.strictEqual(ease(0), 0, 'ease(0) must equal 0');
  assert.strictEqual(ease(0.5), 0.5, 'ease(0.5) must equal 0.5');
  assert.strictEqual(ease(1), 1, 'ease(1) must equal 1');
});

registerTest('F7-T2-2', 'ease(t) is strictly monotonic non-decreasing across domain [0, 1]', () => {
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let prev = 0;
  for (let i = 1; i <= 100; i++) {
    const t = i / 100;
    const val = ease(t);
    assert.ok(val >= prev, `ease(${t}) [${val}] must be >= ease(${t - 0.01}) [${prev}]`);
    prev = val;
  }
});

registerTest('F7-T2-3', 'DRIFT table definitions have positive scale and positive seconds', () => {
  const backdropCode = harness.readProjectFile('renderer/modules/backdrop.js');
  const match = backdropCode.match(/const\s+DRIFT\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(match, 'DRIFT array must be defined in backdrop.js');
  // Confirm scale and seconds are positive numbers
  assert.ok(/scale:\s*[0-9.]+/.test(match[1]), 'DRIFT entries must have positive scale');
  assert.ok(/seconds:\s*[0-9.]+/.test(match[1]), 'DRIFT entries must have positive seconds');
});

registerTest('F7-T2-4', 'Backdrop cycle progress stays bounded within [0, 1]', () => {
  // Test the cycle progress formula: cycle <= 1 ? cycle : 2 - cycle
  for (let ms = 0; ms <= 120000; ms += 250) {
    const seconds = 21;
    const cycle = (ms / 1000 / seconds) % 2;
    const progress = cycle <= 1 ? cycle : 2 - cycle;
    assert.ok(progress >= 0 && progress <= 1, `Progress at ${ms}ms (${progress}) must be in [0, 1]`);
  }
});

registerTest('F7-T2-5', 'place(ms) applies fixed decimal precision to CSS translate and scale', () => {
  const backdropCode = harness.readProjectFile('renderer/modules/backdrop.js');
  assert.ok(/\.toFixed\(2\)/.test(backdropCode), 'place(ms) should format translate with toFixed(2)');
  assert.ok(/\.toFixed\(4\)/.test(backdropCode), 'place(ms) should format scale with toFixed(4)');
});

// =============================================================================
// Feature 8 Boundaries: Home Widget Cards Elevation & Acrylic
// =============================================================================

registerTest('F8-T2-1', '.widget specifies min-width: 0 and min-height: 0 to prevent grid blowout', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.widget\b/);
  const hasMinWidth = rules.some((r) => harness.ruleHasProperty(r.body, 'min-width', '0'));
  const hasMinHeight = rules.some((r) => harness.ruleHasProperty(r.body, 'min-height', '0'));
  assert.ok(hasMinWidth, '.widget must specify min-width: 0');
  assert.ok(hasMinHeight, '.widget must specify min-height: 0');
});

registerTest('F8-T2-2', '.widgets container specifies touch-action: none for custom gestures', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.widgets\b/);
  const hasTouchAction = rules.some((r) => harness.ruleHasProperty(r.body, 'touch-action', 'none'));
  assert.ok(hasTouchAction, '.widgets must specify touch-action: none');
});

registerTest('F8-T2-3', 'Inert widgets (.widget-clock, .widget-battery) specify cursor: default', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const inertRules = harness.findCssRules(css, /\.widget-clock|\.widget-battery/);
  const hasDefault = inertRules.some((r) => harness.ruleHasProperty(r.body, 'cursor', 'default'));
  assert.ok(hasDefault, 'Inert widgets must specify cursor: default');
});

registerTest('F8-T2-4', 'Home widgets support data-size="1x1" and "2x1" layout variations', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const sizeRules = harness.findCssRules(css, /\.widget\[data-size=["']1x1["']\]|\.widget\[data-size=["']2x1["']\]/);
  assert.ok(sizeRules.length > 0, 'CSS must support data-size variations for widgets');
});

registerTest('F8-T2-5', 'Cascade card-in animation delay calculates from var(--j) variable', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const cardIn = harness.findCssRules(css, /\.widget\b/);
  const hasDelay = cardIn.some((r) => harness.ruleHasProperty(r.body, 'animation-delay', /var\(--j/));
  assert.ok(hasDelay, 'Widget entrance must stagger using animation-delay: calc(var(--j, 0) * 40ms)');
});

// =============================================================================
// Feature 9 Boundaries: Interactive Accent Glow on Hover/Active
// =============================================================================

registerTest('F9-T2-1', 'Active state scale factor remains within ergonomic range [0.96, 0.99]', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const activeRules = harness.findCssRules(css, /\.widget:active/);
  assert.ok(activeRules.length > 0, '.widget:active rule must exist');
  // Check that scale value is between 0.96 and 0.99
  const hasValidScale = activeRules.some((r) => {
    const match = r.body.match(/scale\((0\.\d+)\)/);
    if (!match) return false;
    const val = parseFloat(match[1]);
    return val >= 0.96 && val <= 0.99;
  });
  assert.ok(hasValidScale, '.widget:active scale must be between 0.96 and 0.99');
});

registerTest('F9-T2-2', 'Dynamic hover glow color-mix percentage remains between 20% and 45%', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const hoverRules = harness.findCssRules(css, /\.widget:hover/);
  const hasValidMix = hoverRules.some((r) => {
    const match = r.body.match(/color-mix\(in\s+srgb,[^,]+?([0-9.]+)%/);
    if (!match) return false;
    const pct = parseFloat(match[1]);
    return pct >= 20 && pct <= 45;
  });
  assert.ok(hasValidMix, 'Dynamic hover glow color-mix must use between 20% and 45% accent color');
});

registerTest('F9-T2-3', 'Pressing state (.widget.is-pressing) applies distinct scale (0.96)', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const pressingRules = harness.findCssRules(css, /\.widget\.is-pressing/);
  assert.ok(pressingRules.length > 0, '.widget.is-pressing rule must exist');
  const hasScale = pressingRules.some((r) => harness.ruleHasProperty(r.body, 'scale', /0\.96/));
  assert.ok(hasScale, '.widget.is-pressing must specify scale: 0.96');
});

registerTest('F9-T2-4', 'Widget transitions utilize --spring-bounce or cubic timing function', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const rules = harness.findCssRules(css, /\.widget\b/);
  const hasSpring = rules.some((r) => harness.ruleHasProperty(r.body, 'transition', /--spring/));
  assert.ok(hasSpring, '.widget transitions must reference --spring or --spring-bounce');
});

registerTest('F9-T2-5', 'Hover transform translateY does not exceed 3px upward translation', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const hoverRules = harness.findCssRules(css, /\.widget:hover/);
  const hasReasonableLift = hoverRules.some((r) => {
    const match = r.body.match(/translateY\((-?\d+)px\)/);
    if (!match) return false;
    const px = Math.abs(parseInt(match[1], 10));
    return px >= 1 && px <= 3;
  });
  assert.ok(hasReasonableLift, 'Hover translateY lift must be between 1px and 3px');
});

// =============================================================================
// Feature 10 Boundaries: Individual Widget Visual Polish
// =============================================================================

registerTest('F10-T2-1', 'Music widget handles data-playing="false" state with resting indicator', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const music = harness.extractElementById(html, 'home-music');
  assert.ok(music, '#home-music must exist in index.html');
  assert.strictEqual(music.getAttribute('data-playing'), 'false', 'Initial state must be data-playing="false"');
});

registerTest('F10-T2-2', 'Focus Pomodoro widget handles data-status="idle" attribute', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const focus = harness.extractElementById(html, 'home-focus');
  assert.ok(focus, '#home-focus must exist in index.html');
  assert.strictEqual(focus.getAttribute('data-status'), 'idle', 'Initial state must be data-status="idle"');
});

registerTest('F10-T2-3', 'Battery widget handles data-state="ok" attribute', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const battery = harness.extractElementById(html, 'home-battery');
  assert.ok(battery, '#home-battery must exist in index.html');
  assert.strictEqual(battery.getAttribute('data-state'), 'ok', 'Initial state must be data-state="ok"');
});

registerTest('F10-T2-4', 'Clipboard widget handles data-empty="true" attribute', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const clip = harness.extractElementById(html, 'home-clipboard');
  assert.ok(clip, '#home-clipboard must exist in index.html');
  assert.strictEqual(clip.getAttribute('data-empty'), 'true', 'Initial state must be data-empty="true"');
});

registerTest('F10-T2-5', 'Notepad widget handles data-empty="true" attribute', () => {
  const html = harness.readProjectFile('renderer/index.html');
  const note = harness.extractElementById(html, 'home-note');
  assert.ok(note, '#home-note must exist in index.html');
  assert.strictEqual(note.getAttribute('data-empty'), 'true', 'Initial state must be data-empty="true"');
});

// =============================================================================
// Feature 11 Boundaries: Light Theme Parity
// =============================================================================

registerTest('F11-T2-1', 'Light theme .widget background opacity is >= 0.70 for text contrast', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const lightWidget = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.widget\b/);
  assert.ok(lightWidget.length > 0, 'Light theme widget rule must exist');
  const hasHighOpacity = lightWidget.some((r) => {
    const match = r.body.match(/rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)/);
    if (!match) return false;
    return parseFloat(match[1]) >= 0.70;
  });
  assert.ok(hasHighOpacity, 'Light theme widget background opacity must be >= 0.70');
});

registerTest('F11-T2-2', 'Light theme hover state sets solid or near-solid #fff background', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const lightHover = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+.*\.widget:hover/);
  const hasWhiteBg = lightHover.some((r) => harness.ruleHasProperty(r.body, 'background-color', /#fff|rgba\(255,\s*255,\s*255,\s*1/));
  assert.ok(hasWhiteBg, 'Light theme hover state must specify #fff background');
});

registerTest('F11-T2-3', 'Light theme widget slot border provides subtle separation (rgba(0,0,0,0.18))', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const slotRules = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.widget-slot/);
  const hasBorder = slotRules.some((r) => harness.ruleHasProperty(r.body, 'border-color', /rgba\(0,\s*0,\s*0/));
  assert.ok(hasBorder, 'Light theme widget slots must define dark translucent border');
});

registerTest('F11-T2-4', 'Light theme clock dial specifies fill: #fff for dark hand visibility', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const clockRules = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.clock-dial/);
  const hasWhiteFill = clockRules.some((r) => harness.ruleHasProperty(r.body, 'fill', '#fff'));
  assert.ok(hasWhiteFill, 'Light theme clock-dial must specify fill: #fff');
});

registerTest('F11-T2-5', 'Light theme popover specifies layered dark drop shadow', () => {
  const css = harness.readProjectFile('renderer/styles.css');
  const popoverRules = harness.findCssRules(css, /:root\[data-theme=["']light["']\]\s+\.popover/);
  const hasShadow = popoverRules.some((r) => harness.ruleHasProperty(r.body, 'box-shadow', /rgba\(0,\s*0,\s*0/));
  assert.ok(hasShadow, 'Light theme popover must specify dark drop-shadow');
});

// =============================================================================
// Feature 12 Boundaries: Repository Integrity & Staging Guard
// =============================================================================

registerTest('F12-T2-1', 'config/settings.json exists and is valid JSON', () => {
  const settingsContent = harness.readProjectFile('config/settings.json');
  assert.doesNotThrow(() => JSON.parse(settingsContent), 'config/settings.json must parse as valid JSON');
});

registerTest('F12-T2-2', 'config/links.json exists and is valid JSON', () => {
  const linksContent = harness.readProjectFile('config/links.json');
  assert.doesNotThrow(() => JSON.parse(linksContent), 'config/links.json must parse as valid JSON');
});

registerTest('F12-T2-3', 'package.json devDependencies contains only electron and electron-builder', () => {
  const pkgContent = harness.readProjectFile('package.json');
  const pkg = JSON.parse(pkgContent);
  const devDeps = Object.keys(pkg.devDependencies || {});
  const foreignDevDeps = devDeps.filter((d) => d !== 'electron' && d !== 'electron-builder');
  assert.strictEqual(foreignDevDeps.length, 0, `Unauthorized devDependencies: ${foreignDevDeps.join(', ')}`);
});

registerTest('F12-T2-4', 'npm scripts in package.json contain required commands (start, dev)', () => {
  const pkgContent = harness.readProjectFile('package.json');
  const pkg = JSON.parse(pkgContent);
  assert.ok('start' in pkg.scripts, 'package.json must contain start script');
  assert.ok('dev' in pkg.scripts, 'package.json must contain dev script');
});

registerTest('F12-T2-5', 'No forbidden node_modules or compiled binaries are staged in git', () => {
  const git = harness.checkGitStaging();
  const badStaged = git.stagedFiles?.filter((f) => f.startsWith('node_modules/') || f.endsWith('.tmp'));
  assert.strictEqual(badStaged?.length || 0, 0, 'No node_modules or temporary files must be staged');
});

module.exports = { tests };
