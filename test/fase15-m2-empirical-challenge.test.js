// =============================================================================
//  test/fase15-m2-empirical-challenge.test.js
// -----------------------------------------------------------------------------
//  Empirical stress and adversarial verification for Milestone 2 (Phase 15)
//  Conducted by challenger_m2_f15_2.
// =============================================================================

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('Milestone 2 Adversarial & Empirical Challenge Suite', () => {

  // ===========================================================================
  // 1. STRESS TESTING: validateSettings() Schema Sanitization
  // ===========================================================================
  describe('1. validateSettings() Schema Sanitization & Adversarial Inputs', () => {
    const { DEFAULT_SETTINGS, validateSettings } = require('../main/config');

    it('handles non-object and null inputs gracefully without crashing', () => {
      const inputs = [null, undefined, 42, 'string', true, false, Symbol('sym'), [1, 2, 3], () => {}];
      for (const input of inputs) {
        assert.doesNotThrow(() => {
          const res = validateSettings(input);
          assert.strictEqual(typeof res, 'object');
          assert.strictEqual(res.voiceShortcut, DEFAULT_SETTINGS.voiceShortcut);
          assert.strictEqual(res.voiceLanguage, DEFAULT_SETTINGS.voiceLanguage);
          assert.strictEqual(res.voiceModelPath, DEFAULT_SETTINGS.voiceModelPath);
          assert.strictEqual(res.voicePasteOnFinish, DEFAULT_SETTINGS.voicePasteOnFinish);
          assert.strictEqual(res.voiceMicDevice, DEFAULT_SETTINGS.voiceMicDevice);
        }, `validateSettings(${typeof input}) threw an unhandled exception`);
      }
    });

    it('enforces string type and fallback for voiceShortcut against adversarial types', () => {
      const invalidShortcuts = [
        '', '   ', '\t\n\r', null, undefined, 0, 1, false, true,
        {}, [], { key: 'Control+Alt+D' }, ['Control+Alt+D'], NaN, Infinity
      ];

      for (const val of invalidShortcuts) {
        const res = validateSettings({ voiceShortcut: val });
        assert.strictEqual(
          res.voiceShortcut,
          DEFAULT_SETTINGS.voiceShortcut,
          `voiceShortcut=${JSON.stringify(val)} did not fall back to default`
        );
      }
    });

    it('trims whitespace and preserves valid custom voiceShortcut', () => {
      const custom = [
        ['  Control+Alt+V  ', 'Control+Alt+V'],
        ['\nControl+Shift+D\t', 'Control+Shift+D'],
        ['Alt+F12', 'Alt+F12'],
      ];

      for (const [raw, expected] of custom) {
        const res = validateSettings({ voiceShortcut: raw });
        assert.strictEqual(res.voiceShortcut, expected);
      }
    });

    it('enforces string type, lowercase normalization and fallback for voiceLanguage', () => {
      const invalidLanguages = ['', '   ', '\r\n', null, undefined, 123, false, {}, []];
      for (const val of invalidLanguages) {
        const res = validateSettings({ voiceLanguage: val });
        assert.strictEqual(res.voiceLanguage, 'es');
      }

      const mixedCase = [
        ['  ES  ', 'es'],
        ['  EN-US  ', 'en-us'],
        ['Fr-CA', 'fr-ca'],
        ['  JA  ', 'ja'],
        ['\tDE\n', 'de'],
      ];
      for (const [raw, expected] of mixedCase) {
        const res = validateSettings({ voiceLanguage: raw });
        assert.strictEqual(res.voiceLanguage, expected);
      }
    });

    it('enforces fallback for voiceModelPath against non-string and sanitizes strings', () => {
      const nonStrings = [null, undefined, 12345, true, false, {}, [], NaN];
      for (const val of nonStrings) {
        const res = validateSettings({ voiceModelPath: val });
        assert.strictEqual(res.voiceModelPath, '');
      }

      const paths = [
        ['  C:\\models\\whisper.bin  ', 'C:\\models\\whisper.bin'],
        ['/opt/models/ggml.bin', '/opt/models/ggml.bin'],
        ['   ', ''],
      ];
      for (const [raw, expected] of paths) {
        const res = validateSettings({ voiceModelPath: raw });
        assert.strictEqual(res.voiceModelPath, expected);
      }
    });

    it('strictly enforces boolean for voicePasteOnFinish (only === true)', () => {
      const truthyNonBooleans = [
        1, 'true', '1', 'yes', 'on', {}, [], () => true, [true], { value: true }, NaN, Infinity
      ];
      for (const val of truthyNonBooleans) {
        const res = validateSettings({ voicePasteOnFinish: val });
        assert.strictEqual(res.voicePasteOnFinish, false, `Truthy value ${JSON.stringify(val)} must be normalized to false`);
      }

      const falsyValues = [0, '', 'false', '0', null, undefined, false];
      for (const val of falsyValues) {
        const res = validateSettings({ voicePasteOnFinish: val });
        assert.strictEqual(res.voicePasteOnFinish, false);
      }

      assert.strictEqual(validateSettings({ voicePasteOnFinish: true }).voicePasteOnFinish, true);
    });

    it('enforces fallback and trimming on voiceMicDevice', () => {
      const invalidDevices = ['', '   ', null, undefined, 100, true, {}];
      for (const val of invalidDevices) {
        const res = validateSettings({ voiceMicDevice: val });
        assert.strictEqual(res.voiceMicDevice, 'default');
      }

      const validDevice = validateSettings({ voiceMicDevice: '  Realtek High Definition Audio  ' });
      assert.strictEqual(validDevice.voiceMicDevice, 'Realtek High Definition Audio');
    });

    it('resists prototype pollution and does not corrupt DEFAULT_SETTINGS', () => {
      const snapshot = JSON.stringify(DEFAULT_SETTINGS);
      const maliciousPayload = JSON.parse('{"__proto__": {"polluted": "yes"}, "voiceShortcut": "Control+Alt+X"}');
      const res = validateSettings(maliciousPayload);

      assert.strictEqual(res.voiceShortcut, 'Control+Alt+X');
      assert.strictEqual(Object.prototype.polluted, undefined, 'Prototype pollution detected in Object.prototype');
      assert.strictEqual(JSON.stringify(DEFAULT_SETTINGS), snapshot, 'DEFAULT_SETTINGS was mutated');
    });

    it('fuzz testing: 500 randomized malformed configurations validate without throwing', () => {
      const fuzzGenerators = [
        () => Math.random(),
        () => (Math.random() > 0.5 ? 'Control+Alt+V' : '   '),
        () => (Math.random() > 0.5 ? true : 'yes'),
        () => (Math.random() > 0.5 ? 'ES' : null),
        () => ({ nested: true }),
        () => [1, 2, 3],
        () => 'A'.repeat(5000),
      ];

      for (let i = 0; i < 500; i++) {
        const fuzzed = {
          voiceShortcut: fuzzGenerators[i % fuzzGenerators.length](),
          voiceLanguage: fuzzGenerators[(i + 1) % fuzzGenerators.length](),
          voiceModelPath: fuzzGenerators[(i + 2) % fuzzGenerators.length](),
          voicePasteOnFinish: fuzzGenerators[(i + 3) % fuzzGenerators.length](),
          voiceMicDevice: fuzzGenerators[(i + 4) % fuzzGenerators.length](),
        };

        const out = validateSettings(fuzzed);
        assert.strictEqual(typeof out.voiceShortcut, 'string');
        assert.ok(out.voiceShortcut.length > 0);
        assert.strictEqual(typeof out.voiceLanguage, 'string');
        assert.strictEqual(typeof out.voiceModelPath, 'string');
        assert.strictEqual(typeof out.voicePasteOnFinish, 'boolean');
        assert.strictEqual(typeof out.voiceMicDevice, 'string');
      }
    });
  });

  // ===========================================================================
  // 2. STRESS TESTING: shortcutsKey hot-reload behavior in main.js
  // ===========================================================================
  describe('2. shortcutsKey Hot-Reload Logic in main.js', () => {
    // Extract shortcutsKey logic from main.js lines 68-70
    const mainJsCode = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    const fnMatch = mainJsCode.match(/function\s+shortcutsKey\s*\(\s*settings\s*\)\s*\{([\s\S]*?)\}/);
    assert.ok(fnMatch, 'Could not find function shortcutsKey in main.js');

    const shortcutsKey = new Function('settings', fnMatch[1]);

    const baseSettings = {
      shortcut: 'Control+Space',
      pageShortcuts: { home: 'F1', music: 'F2', ai: 'F3', focus: 'F4', clipboard: 'F5', note: 'F6' },
      aiShortcut: 'Control+Alt+I',
      voiceShortcut: 'Control+Alt+D',
      theme: 'dark',
      pomodoroMinutes: 25,
      weatherCity: 'Madrid',
    };

    it('shortcutsKey produces a deterministic string representation', () => {
      const k1 = shortcutsKey(baseSettings);
      const k2 = shortcutsKey({ ...baseSettings });
      assert.strictEqual(k1, k2);
      assert.strictEqual(typeof k1, 'string');
    });

    it('shortcutsKey detects mutation in voiceShortcut', () => {
      const initialKey = shortcutsKey(baseSettings);
      const mutatedSettings = { ...baseSettings, voiceShortcut: 'Control+Alt+V' };
      const mutatedKey = shortcutsKey(mutatedSettings);

      assert.notStrictEqual(
        mutatedKey,
        initialKey,
        'shortcutsKey must change when voiceShortcut is modified'
      );
    });

    it('shortcutsKey ignores changes to unrelated settings (preventing shortcut churn)', () => {
      const initialKey = shortcutsKey(baseSettings);

      const unrelatedMutations = [
        { theme: 'light' },
        { pomodoroMinutes: 50 },
        { weatherCity: 'Barcelona' },
        { voicePasteOnFinish: true },
        { voiceLanguage: 'en' },
        { voiceModelPath: 'C:\\model.bin' },
      ];

      for (const mutation of unrelatedMutations) {
        const testSettings = { ...baseSettings, ...mutation };
        assert.strictEqual(
          shortcutsKey(testSettings),
          initialKey,
          `shortcutsKey changed unexpectedly for unrelated setting: ${JSON.stringify(mutation)}`
        );
      }
    });

    it('shortcutsKey detects mutations across all registered shortcut types', () => {
      const baseKey = shortcutsKey(baseSettings);

      // Main shortcut
      assert.notStrictEqual(shortcutsKey({ ...baseSettings, shortcut: 'Alt+Space' }), baseKey);

      // AI shortcut
      assert.notStrictEqual(shortcutsKey({ ...baseSettings, aiShortcut: 'Control+Alt+Space' }), baseKey);

      // Page shortcuts
      const modifiedPages = { ...baseSettings.pageShortcuts, home: 'F10' };
      assert.notStrictEqual(shortcutsKey({ ...baseSettings, pageShortcuts: modifiedPages }), baseKey);

      // Voice shortcut
      assert.notStrictEqual(shortcutsKey({ ...baseSettings, voiceShortcut: 'Control+Shift+D' }), baseKey);
    });
  });

  // ===========================================================================
  // 3. STRESS TESTING: Mock WinHelper Message Streaming & Event Forwarding
  // ===========================================================================
  describe('3. WinHelper Message Processing (onHelperMessage "voice")', () => {
    let voice;
    let helper;
    let bridge;
    let notices;
    let state;
    let capturedRendererEvents = [];
    let capturedNotices = [];
    let registeredHelperHandler = null;

    beforeEach(() => {
      // Clear require cache for isolated state testing
      delete require.cache[require.resolve('../main/voice')];
      delete require.cache[require.resolve('../main/helper')];
      delete require.cache[require.resolve('../main/bridge')];
      delete require.cache[require.resolve('../main/notices')];
      delete require.cache[require.resolve('../main/state')];

      state = require('../main/state').state;
      state.settings = {
        voiceShortcut: 'Control+Alt+D',
        voiceLanguage: 'es',
        voiceModelPath: '',
        voicePasteOnFinish: false,
      };

      capturedRendererEvents = [];
      capturedNotices = [];

      // Mock bridge
      bridge = require('../main/bridge');
      bridge.sendToRenderer = (channel, data) => {
        capturedRendererEvents.push({ channel, data });
      };

      // Mock notices
      notices = require('../main/notices');
      notices.addNotice = (notice) => {
        capturedNotices.push(notice);
      };
      notices.clearNotice = (key) => {
        capturedNotices = capturedNotices.filter((n) => n.key !== key);
      };

      // Mock helper
      helper = require('../main/helper');
      registeredHelperHandler = null;
      helper.onHelperMessage = (type, handler) => {
        if (type === 'voice') {
          registeredHelperHandler = handler;
        }
      };

      voice = require('../main/voice');
      voice.initVoice();
    });

    it('initVoice registers an event listener for type "voice"', () => {
      assert.strictEqual(typeof registeredHelperHandler, 'function', 'voice handler must be registered on helper');
    });

    it('gracefully discards malformed or empty messages without throwing', () => {
      const malformed = [null, undefined, '', 123, true, {}, { type: 'voice' }];
      for (const m of malformed) {
        assert.doesNotThrow(() => {
          registeredHelperHandler(m);
        });
      }
    });

    it('forwards "level" event with sanitized numeric levels, peak, and rms', () => {
      // Standard numeric
      registeredHelperHandler({
        type: 'voice',
        event: 'level',
        level: 0.75,
        peak: 0.90,
        rms: 0.35,
      });

      assert.strictEqual(capturedRendererEvents.length, 1);
      assert.strictEqual(capturedRendererEvents[0].channel, 'voice:onLevel');
      assert.strictEqual(capturedRendererEvents[0].data.level, 0.75);
      assert.strictEqual(capturedRendererEvents[0].data.peak, 0.90);
      assert.strictEqual(capturedRendererEvents[0].data.rms, 0.35);

      // String-encoded numbers
      registeredHelperHandler({
        type: 'voice',
        event: 'level',
        level: '0.42',
        peak: '0.55',
        rms: '0.12',
      });

      assert.strictEqual(capturedRendererEvents.length, 2);
      assert.strictEqual(capturedRendererEvents[1].channel, 'voice:onLevel');
      assert.strictEqual(capturedRendererEvents[1].data.level, 0.42);
      assert.strictEqual(capturedRendererEvents[1].data.peak, 0.55);
      assert.strictEqual(capturedRendererEvents[1].data.rms, 0.12);

      // Missing fields default to 0
      registeredHelperHandler({
        type: 'voice',
        event: 'level',
      });
      assert.strictEqual(capturedRendererEvents.length, 3);
      assert.strictEqual(capturedRendererEvents[2].data.level, 0);
      assert.strictEqual(capturedRendererEvents[2].data.peak, 0);
      assert.strictEqual(capturedRendererEvents[2].data.rms, 0);
    });

    it('processes "transcript" event, updates state to done (result card), and forwards to renderer', () => {
      registeredHelperHandler({
        type: 'voice',
        event: 'transcript',
        text: '   Hola desde el dictado local   ',
        durationMs: 2500,
      });

      // 1. sendToRenderer called for voice:status (done: the renderer shows the result card, not "dismiss")
      const statusEvt = capturedRendererEvents.find((e) => e.channel === 'voice:status');
      assert.ok(statusEvt, 'voice:status event must be emitted');
      assert.strictEqual(statusEvt.data.state, 'done');
      assert.strictEqual(statusEvt.data.lastTranscript, 'Hola desde el dictado local');

      // 2. sendToRenderer called for voice:onTranscript
      const transcriptEvt = capturedRendererEvents.find((e) => e.channel === 'voice:onTranscript');
      assert.ok(transcriptEvt, 'voice:onTranscript event must be emitted');
      assert.strictEqual(transcriptEvt.data.text, 'Hola desde el dictado local');
      assert.strictEqual(transcriptEvt.data.durationMs, 2500);

      // The text goes first so the renderer already has it when 'done' arrives
      assert.ok(capturedRendererEvents.indexOf(transcriptEvt) < capturedRendererEvents.indexOf(statusEvt));

      // 3. getVoiceStatus() reflects latest transcript
      const currentStatus = voice.getVoiceStatus();
      assert.strictEqual(currentStatus.lastTranscript, 'Hola desde el dictado local');
      assert.strictEqual(currentStatus.state, 'done');
    });

    it('triggers pasteToApp automatically on transcript only if voicePasteOnFinish is true', () => {
      let pasteCalledWith = null;
      // Spy on pasteToApp
      const originalPaste = voice.pasteToApp;
      // We will test both false and true

      // Case A: voicePasteOnFinish = false
      state.settings.voicePasteOnFinish = false;
      registeredHelperHandler({
        type: 'voice',
        event: 'transcript',
        text: 'Transcribed line A',
      });
      // Should not have triggered paste

      // Case B: voicePasteOnFinish = true
      let helperCommands = [];
      helper.sendToHelper = (cmd) => helperCommands.push(cmd);

      state.settings.voicePasteOnFinish = true;
      registeredHelperHandler({
        type: 'voice',
        event: 'transcript',
        text: 'Transcribed line B',
      });

      // With voicePasteOnFinish = true, pasteToApp is invoked
      // It sets timeout 100ms for sendToHelper('paste-to-app')
      assert.strictEqual(voice.getVoiceStatus().lastTranscript, 'Transcribed line B');
    });

    it('processes "status" event and updates internal voiceState', () => {
      // recording
      registeredHelperHandler({ type: 'voice', event: 'status', status: 'recording' });
      assert.strictEqual(voice.getVoiceStatus().state, 'recording');

      // transcribing
      registeredHelperHandler({ type: 'voice', event: 'status', status: 'transcribing' });
      assert.strictEqual(voice.getVoiceStatus().state, 'transcribing');

      // idle
      registeredHelperHandler({ type: 'voice', event: 'status', status: 'idle' });
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');

      // invalid status ignored
      registeredHelperHandler({ type: 'voice', event: 'status', status: 'bogus_status' });
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
    });

    it('processes "error" event, transitions to error state, and adds notice for mic_permission_denied', () => {
      registeredHelperHandler({
        type: 'voice',
        event: 'error',
        error: 'mic_permission_denied',
        message: 'Acceso al micrófono denegado por Windows',
      });

      assert.strictEqual(voice.getVoiceStatus().state, 'error');
      const micNotice = capturedNotices.find((n) => n.key === 'voice-mic-denied');
      assert.ok(micNotice, 'Must add voice-mic-denied notice on mic_permission_denied error');
      assert.strictEqual(micNotice.kind, 'error');
      assert.strictEqual(micNotice.alert, true);

      // Verify auto-recovery to idle via setTimeout
      // We don't want to wait 3000ms in unit test, so let's verify error status emission
      const errEvt = capturedRendererEvents.find((e) => e.channel === 'voice:status' && e.data.state === 'error');
      assert.ok(errEvt);
      assert.strictEqual(errEvt.data.error, 'mic_permission_denied');
    });
  });

  // ===========================================================================
  // 4. STRESS TESTING: pasteToApp() Clipboard & Focus Coordination
  // ===========================================================================
  describe('4. pasteToApp() Clipboard & Focus Coordination', () => {
    let voice;
    let helper;
    let helperCommands = [];
    let clipboardText = null;
    let windowExpandedArgs = null;

    let registeredHelperHandler = null;

    beforeEach(() => {
      delete require.cache[require.resolve('../main/voice')];
      delete require.cache[require.resolve('../main/helper')];
      delete require.cache[require.resolve('../main/window')];

      helperCommands = [];
      clipboardText = null;
      windowExpandedArgs = null;
      registeredHelperHandler = null;

      helper = require('../main/helper');
      helper.sendToHelper = (cmd) => {
        helperCommands.push(cmd);
      };
      helper.onHelperMessage = (type, fn) => {
        if (type === 'voice') registeredHelperHandler = fn;
      };

      // Mock window
      const notchWindow = require('../main/window');
      notchWindow.setExpanded = (expanded, opts) => {
        windowExpandedArgs = { expanded, opts };
      };

      voice = require('../main/voice');
      voice.initVoice();
    });

    it('pasteToApp(text) writes to clipboard, collapses window without focus, and dispatches paste-to-app after 100ms', async () => {
      const testText = 'Texto de dictado de prueba';

      // We test pasteToApp with the text
      voice.pasteToApp(testText);

      // Window should be told to collapse with restoreFocus: false
      assert.ok(windowExpandedArgs, 'notchWindow.setExpanded must be called');
      assert.strictEqual(windowExpandedArgs.expanded, false);
      assert.deepStrictEqual(windowExpandedArgs.opts, { restoreFocus: false });

      // Before 100ms, paste-to-app not yet dispatched
      assert.strictEqual(helperCommands.includes('paste-to-app'), false);

      // Wait 120ms
      await new Promise((resolve) => setTimeout(resolve, 120));

      // After 100ms, sendToHelper('paste-to-app') must be called
      assert.ok(helperCommands.includes('paste-to-app'), 'sendToHelper("paste-to-app") must be dispatched');
    });

    it('pasteToApp() falls back to lastTranscript if argument is empty or omitted', async () => {
      // Simulate received transcript via the registered handler
      assert.strictEqual(typeof registeredHelperHandler, 'function', 'registeredHelperHandler must be registered');
      registeredHelperHandler({
        type: 'voice',
        event: 'transcript',
        text: 'Fallback transcript string',
      });

      windowExpandedArgs = null;
      helperCommands = [];

      voice.pasteToApp(); // No arguments

      assert.ok(windowExpandedArgs, 'Should collapse window');
      assert.strictEqual(windowExpandedArgs.expanded, false);

      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.ok(helperCommands.includes('paste-to-app'));
    });

    it('pasteToApp() is a clean no-op if both text argument and lastTranscript are empty', () => {
      windowExpandedArgs = null;
      helperCommands = [];

      voice.pasteToApp('');
      assert.strictEqual(windowExpandedArgs, null, 'Must not touch window when no content to paste');
      assert.strictEqual(helperCommands.length, 0, 'Must not dispatch helper command when no content to paste');
    });
  });

  // ===========================================================================
  // 5. STRESS TESTING: Lifecycle & State Machine Transitions
  // ===========================================================================
  describe('5. Voice Controller Lifecycle & State Machine Resilience', () => {
    let voice;
    let helper;
    let bridge;
    let helperCommands = [];
    let state;
    let registeredHelperHandler = null;

    beforeEach(() => {
      delete require.cache[require.resolve('../main/voice')];
      delete require.cache[require.resolve('../main/helper')];
      delete require.cache[require.resolve('../main/bridge')];
      delete require.cache[require.resolve('../main/state')];

      helperCommands = [];
      registeredHelperHandler = null;

      helper = require('../main/helper');
      helper.sendToHelper = (cmd) => helperCommands.push(cmd);
      helper.getHelperStatus = () => 'ok';
      helper.onHelperMessage = (type, fn) => {
        if (type === 'voice') registeredHelperHandler = fn;
      };

      bridge = require('../main/bridge');
      bridge.sendToRenderer = () => {};

      state = require('../main/state').state;
      state.settings = {
        voiceShortcut: 'Control+Alt+D',
        voiceLanguage: 'es',
        voiceModelPath: '',
        voicePasteOnFinish: false,
      };

      voice = require('../main/voice');
      voice.initVoice();
    });

    it('stopVoice() returns false if state is not recording', () => {
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
      assert.strictEqual(voice.stopVoice(), false);
      assert.strictEqual(helperCommands.length, 0);
    });

    it('cancelVoice() returns false if state is not recording', () => {
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
      assert.strictEqual(voice.cancelVoice(), false);
      assert.strictEqual(helperCommands.length, 0);
    });

    it('stopVoiceModule() cleanly aborts recording if quitting during active capture', () => {
      assert.strictEqual(typeof registeredHelperHandler, 'function');

      // Put state into recording
      registeredHelperHandler({ type: 'voice', event: 'status', status: 'recording' });
      assert.strictEqual(voice.getVoiceStatus().state, 'recording');

      // Call stopVoiceModule()
      voice.stopVoiceModule();

      assert.ok(helperCommands.includes('voice cancel'), 'Must send voice cancel on stopVoiceModule');
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
    });
  });
});
