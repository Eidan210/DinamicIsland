// =============================================================================
//  test/fase15-m2-timer-adversarial.test.js
// -----------------------------------------------------------------------------
//  Empirical Adversarial Stress & Timer Lifecycle Challenge for Milestone 2
//  Conducted by challenger_m2_f15_1_i2.
// =============================================================================

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('Milestone 2 Adversarial Timer & State Machine Challenge Suite', () => {

  // ===========================================================================
  // SUITE 1: State Machine Recovery & errorTimer Lifecycle (3000ms)
  // ===========================================================================
  describe('Suite 1: errorTimer Lifecycle & Single/Multiple Error Auto-Recovery', () => {
    let voice;
    let helper;
    let bridge;
    let notices;
    let state;
    let registeredHelperHandler = null;
    let emittedRendererEvents = [];
    let noticesList = [];

    beforeEach(() => {
      delete require.cache[require.resolve('../main/voice')];
      delete require.cache[require.resolve('../main/helper')];
      delete require.cache[require.resolve('../main/bridge')];
      delete require.cache[require.resolve('../main/notices')];
      delete require.cache[require.resolve('../main/state')];

      emittedRendererEvents = [];
      noticesList = [];
      registeredHelperHandler = null;

      state = require('../main/state').state;
      state.settings = {
        voiceShortcut: 'Control+Alt+D',
        voiceLanguage: 'es',
        voiceModelPath: path.join(ROOT, 'test', 'nonexistent_missing_model.bin'),
        voicePasteOnFinish: false,
      };

      bridge = require('../main/bridge');
      bridge.sendToRenderer = (channel, data) => {
        emittedRendererEvents.push({ channel, data });
      };

      notices = require('../main/notices');
      notices.addNotice = (n) => noticesList.push(n);
      notices.clearNotice = (k) => {
        noticesList = noticesList.filter((n) => n.key !== k);
      };

      helper = require('../main/helper');
      helper.sendToHelper = () => {};
      helper.getHelperStatus = () => 'ok';
      helper.onHelperMessage = (type, fn) => {
        if (type === 'voice') registeredHelperHandler = fn;
      };

      voice = require('../main/voice');
      voice.initVoice();
    });

    afterEach(() => {
      if (voice && typeof voice.stopVoiceModule === 'function') {
        voice.stopVoiceModule();
      }
    });

    it('recovers from error to idle at exactly 3000ms (not at 2999ms)', (t) => {
      t.mock.timers.enable();

      assert.strictEqual(voice.getVoiceStatus().state, 'idle');

      // Trigger error by calling startVoice() with missing model
      const started = voice.startVoice();
      assert.strictEqual(started, false);
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // Check events
      const errEvts = emittedRendererEvents.filter(
        (e) => e.channel === 'voice:status' && e.data.state === 'error'
      );
      assert.ok(errEvts.length >= 1, 'Must emit voice:status error');

      // Advance timers by 2999ms
      t.mock.timers.tick(2999);
      assert.strictEqual(voice.getVoiceStatus().state, 'error', 'Must still be in error state at 2999ms');

      // Advance 1ms more (reaching 3000ms)
      t.mock.timers.tick(1);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle', 'Must recover to idle state at 3000ms');

      // Verify that voice:status idle was emitted
      const lastStatus = emittedRendererEvents[emittedRendererEvents.length - 1];
      assert.strictEqual(lastStatus.channel, 'voice:status');
      assert.strictEqual(lastStatus.data.state, 'idle');
    });

    it('handles 100 rapid error events without leaking timers, resetting countdown each time', (t) => {
      t.mock.timers.enable();

      assert.strictEqual(typeof registeredHelperHandler, 'function');

      // Send 100 error events in rapid sequence at 10ms intervals
      for (let i = 0; i < 100; i++) {
        registeredHelperHandler({
          type: 'voice',
          event: 'error',
          error: 'mic_permission_denied',
          message: `Attempt ${i}`,
        });
        if (i < 99) {
          t.mock.timers.tick(10); // 10ms between events
        }
        assert.strictEqual(voice.getVoiceStatus().state, 'error');
      }

      // The 100th error occurred at the current tick.
      // 3000ms timer from the 100th error should fire at +3000ms.
      // At +2999ms after the 100th error, state must still be error:
      t.mock.timers.tick(2999);
      assert.strictEqual(voice.getVoiceStatus().state, 'error', 'Must still be in error 2999ms after last error');

      // Tick 1ms more: exactly 3000ms after the 100th error
      t.mock.timers.tick(1);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle', 'Must transition to idle exactly 3000ms after last error');

      // Tick an extra 5000ms to guarantee no duplicate/stray timers fire
      const eventsCountAtIdle = emittedRendererEvents.length;
      t.mock.timers.tick(5000);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
      assert.strictEqual(emittedRendererEvents.length, eventsCountAtIdle, 'No stray timer events should fire');
    });

    it('cancelVoice() during error cancels timer and transitions to idle immediately', (t) => {
      t.mock.timers.enable();

      // Put into error
      voice.startVoice(); // Fails due to missing model
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // Advance 1500ms (halfway)
      t.mock.timers.tick(1500);
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // User presses cancel / Esc
      const cancelled = voice.cancelVoice();
      assert.strictEqual(cancelled, true, 'cancelVoice() must return true on error state');
      assert.strictEqual(voice.getVoiceStatus().state, 'idle', 'State must immediately be idle');

      const eventsCountAfterCancel = emittedRendererEvents.length;

      // Advance beyond the original 3000ms mark (advance 2000ms more -> total 3500ms)
      t.mock.timers.tick(2000);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
      // No duplicate status events fired from an uncancelled timer
      assert.strictEqual(emittedRendererEvents.length, eventsCountAfterCancel);
    });

    it('cancelVoice() when idle is clean no-op returning false', () => {
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
      const res = voice.cancelVoice();
      assert.strictEqual(res, false);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
    });

    it('stopVoiceModule() clears active errorTimer', (t) => {
      t.mock.timers.enable();

      voice.startVoice(); // Enters error
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // Stop module (app quitting or tearing down)
      voice.stopVoiceModule();

      const eventsCount = emittedRendererEvents.length;
      t.mock.timers.tick(5000);
      // No timer fires to mutate state or emit events
      assert.strictEqual(emittedRendererEvents.length, eventsCount);
    });
  });

  // ===========================================================================
  // SUITE 2: Rapid Toggles & Immediate Error Recovery
  // ===========================================================================
  describe('Suite 2: Rapid Toggles during Error & Immediate Recovery', () => {
    let voice;
    let helper;
    let helperCommands = [];
    let state;
    let dummyModelPath;

    beforeEach(() => {
      delete require.cache[require.resolve('../main/voice')];
      delete require.cache[require.resolve('../main/helper')];
      delete require.cache[require.resolve('../main/bridge')];
      delete require.cache[require.resolve('../main/notices')];
      delete require.cache[require.resolve('../main/state')];

      helperCommands = [];

      state = require('../main/state').state;
      state.settings = {
        voiceShortcut: 'Control+Alt+D',
        voiceLanguage: 'es',
        voiceModelPath: path.join(ROOT, 'test', 'nonexistent_missing_model.bin'),
        voicePasteOnFinish: false,
      };

      helper = require('../main/helper');
      helper.sendToHelper = (cmd) => helperCommands.push(cmd);
      helper.getHelperStatus = () => 'ok';
      helper.onHelperMessage = () => {};

      // Create a dummy model file (> 1MB) in test directory
      dummyModelPath = path.join(ROOT, 'test', 'temp_valid_model.bin');
      const dummyBuffer = Buffer.alloc(1024 * 1024 + 100, 0x55);
      fs.writeFileSync(dummyModelPath, dummyBuffer);

      voice = require('../main/voice');
      voice.initVoice();
    });

    afterEach(() => {
      if (voice && typeof voice.stopVoiceModule === 'function') {
        voice.stopVoiceModule();
      }
      try {
        if (fs.existsSync(dummyModelPath)) fs.unlinkSync(dummyModelPath);
      } catch {}
    });

    it('50 rapid toggleVoice() invocations while model missing produces zero crashes and recovers to idle', (t) => {
      t.mock.timers.enable();

      assert.strictEqual(voice.getVoiceStatus().state, 'idle');

      // 50 rapid toggles with model missing
      for (let i = 0; i < 50; i++) {
        assert.doesNotThrow(() => {
          voice.toggleVoice();
        }, `toggleVoice() failed on iteration ${i}`);
        assert.strictEqual(voice.getVoiceStatus().state, 'error');
        if (i < 49) {
          t.mock.timers.tick(20);
        }
      }

      // After 50 toggles, advance 2999ms after the 50th toggle
      t.mock.timers.tick(2999);
      assert.strictEqual(voice.getVoiceStatus().state, 'error', 'Must still be in error at 2999ms after last toggle');

      // Tick 1ms (exactly 3000ms after last toggle)
      t.mock.timers.tick(1);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle', 'Auto-recovery must restore state to idle at 3000ms');
    });

    it('startVoice() immediately recovers from error to recording when model is provided', (t) => {
      t.mock.timers.enable();

      // 1. Force into error state
      assert.strictEqual(voice.startVoice(), false);
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // 2. Advance 1000ms
      t.mock.timers.tick(1000);
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // 3. Configure valid model path
      state.settings.voiceModelPath = dummyModelPath;
      assert.strictEqual(voice.isModelAvailable(), true);

      // 4. Immediately trigger startVoice()
      const started = voice.startVoice();
      assert.strictEqual(started, true, 'startVoice() must succeed immediately from error state');
      assert.strictEqual(voice.getVoiceStatus().state, 'recording');
      assert.ok(helperCommands.some((c) => c.startsWith('voice start')));

      // 5. Advance 2500ms (crossing the original 3000ms threshold from the initial error)
      t.mock.timers.tick(2500);

      // State MUST remain 'recording' and NOT be pulled back to 'idle' by stale errorTimer!
      assert.strictEqual(
        voice.getVoiceStatus().state,
        'recording',
        'Stale errorTimer must NOT overwrite active recording state'
      );
    });

    it('toggleVoice() immediately recovers from error to recording, then stops to transcribing', (t) => {
      t.mock.timers.enable();

      // Put into error
      voice.startVoice();
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // Fix condition
      state.settings.voiceModelPath = dummyModelPath;

      // Toggle voice (Control+Alt+D): should start recording
      voice.toggleVoice();
      assert.strictEqual(voice.getVoiceStatus().state, 'recording');

      // Toggle voice again: should stop recording and enter transcribing
      voice.toggleVoice();
      assert.strictEqual(voice.getVoiceStatus().state, 'transcribing');
      assert.ok(helperCommands.includes('voice stop'));
    });
  });

  // ===========================================================================
  // SUITE 3: downloadModel() Error State Recovery & Concurrency
  // ===========================================================================
  describe('Suite 3: downloadModel() Error Recovery & Concurrency Guards', () => {
    let voice;
    let dummyModelPath;
    let state;

    beforeEach(() => {
      delete require.cache[require.resolve('../main/voice')];
      delete require.cache[require.resolve('../main/helper')];
      delete require.cache[require.resolve('../main/bridge')];
      delete require.cache[require.resolve('../main/notices')];
      delete require.cache[require.resolve('../main/state')];

      state = require('../main/state').state;
      state.settings = {
        voiceShortcut: 'Control+Alt+D',
        voiceLanguage: 'es',
        voiceModelPath: path.join(ROOT, 'test', 'nonexistent_missing_model.bin'),
        voicePasteOnFinish: false,
      };

      dummyModelPath = path.join(ROOT, 'test', 'temp_download_test_model.bin');
      const dummyBuffer = Buffer.alloc(1024 * 1024 + 100, 0xAA);
      fs.writeFileSync(dummyModelPath, dummyBuffer);

      voice = require('../main/voice');
      voice.initVoice();
    });

    afterEach(() => {
      if (voice && typeof voice.stopVoiceModule === 'function') {
        voice.stopVoiceModule();
      }
      try {
        if (fs.existsSync(dummyModelPath)) fs.unlinkSync(dummyModelPath);
      } catch {}
    });

    it('downloadModel() resets error state to idle if model already exists', async () => {
      // Put in error state
      voice.startVoice();
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // Point settings to existing model
      state.settings.voiceModelPath = dummyModelPath;

      const res = await voice.downloadModel();
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.alreadyExists, true);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle', 'State must reset to idle');
    });
  });

  // ===========================================================================
  // SUITE 4: Mic Permission TTL Caching & Non-blocking Latency Stress
  // ===========================================================================
  describe('Suite 4: checkMicPermission() TTL Caching & Zero-Blocking Latency', () => {
    let voice;

    beforeEach(() => {
      delete require.cache[require.resolve('../main/voice')];
      voice = require('../main/voice');
    });

    it('1,000 cached checkMicPermission queries execute in under 10ms with zero event loop lag', () => {
      // Pre-warm cache
      voice.checkMicPermission();

      const t0 = performance.now();
      for (let i = 0; i < 1000; i++) {
        const res = voice.checkMicPermission();
        assert.strictEqual(typeof res, 'boolean');
      }
      const elapsed = performance.now() - t0;

      // 1000 queries should take < 10ms total (average < 0.01ms per call)
      assert.ok(
        elapsed < 10,
        `1000 cached mic checks took ${elapsed.toFixed(2)}ms (expected < 10ms)`
      );
    });

    it('invalidateMicPermissionCache() returns a promise and refreshes cache asynchronously', async () => {
      const p = voice.invalidateMicPermissionCache();
      assert.ok(p && typeof p.then === 'function', 'Must return a Promise');
      const result = await p;
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  // ===========================================================================
  // SUITE 5: Full Life-Cycle Stress (Start -> Error -> Cancel -> Start -> Record -> Stop -> Transcript -> Idle)
  // ===========================================================================
  describe('Suite 5: End-to-End Voice Cycle Stress Under Adverse Timing', () => {
    let voice;
    let helper;
    let bridge;
    let helperCommands = [];
    let state;
    let dummyModelPath;
    let registeredHelperHandler = null;
    let emittedEvents = [];

    beforeEach(() => {
      delete require.cache[require.resolve('../main/voice')];
      delete require.cache[require.resolve('../main/helper')];
      delete require.cache[require.resolve('../main/bridge')];
      delete require.cache[require.resolve('../main/notices')];
      delete require.cache[require.resolve('../main/state')];

      helperCommands = [];
      emittedEvents = [];
      registeredHelperHandler = null;

      state = require('../main/state').state;
      state.settings = {
        voiceShortcut: 'Control+Alt+D',
        voiceLanguage: 'es',
        voiceModelPath: path.join(ROOT, 'test', 'nonexistent_missing_model.bin'),
        voicePasteOnFinish: false,
      };

      bridge = require('../main/bridge');
      bridge.sendToRenderer = (ch, data) => emittedEvents.push({ ch, data });

      helper = require('../main/helper');
      helper.sendToHelper = (cmd) => helperCommands.push(cmd);
      helper.getHelperStatus = () => 'ok';
      helper.onHelperMessage = (type, fn) => {
        if (type === 'voice') registeredHelperHandler = fn;
      };

      dummyModelPath = path.join(ROOT, 'test', 'temp_e2e_model.bin');
      const dummyBuffer = Buffer.alloc(1024 * 1024 + 100, 0x12);
      fs.writeFileSync(dummyModelPath, dummyBuffer);

      voice = require('../main/voice');
      voice.initVoice();
    });

    afterEach(() => {
      if (voice && typeof voice.stopVoiceModule === 'function') {
        voice.stopVoiceModule();
      }
      try {
        if (fs.existsSync(dummyModelPath)) fs.unlinkSync(dummyModelPath);
      } catch {}
    });

    it('completes the entire lifecycle cleanly under adverse state transitions', (t) => {
      t.mock.timers.enable();

      // Step 1: Attempt to start without model -> enters 'error'
      assert.strictEqual(voice.startVoice(), false);
      assert.strictEqual(voice.getVoiceStatus().state, 'error');

      // Step 2: Cancel while in error -> returns true and enters 'idle'
      assert.strictEqual(voice.cancelVoice(), true);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');

      // Step 3: Provide model
      state.settings.voiceModelPath = dummyModelPath;

      // Step 4: Start recording -> enters 'recording'
      assert.strictEqual(voice.startVoice(), true);
      assert.strictEqual(voice.getVoiceStatus().state, 'recording');
      assert.ok(helperCommands.some((c) => c.startsWith('voice start')));

      // Step 5: Stop recording -> enters 'transcribing'
      assert.strictEqual(voice.stopVoice(), true);
      assert.strictEqual(voice.getVoiceStatus().state, 'transcribing');
      assert.ok(helperCommands.includes('voice stop'));

      // Step 6: WinHelper emits transcript -> enters 'idle'
      assert.strictEqual(typeof registeredHelperHandler, 'function');
      registeredHelperHandler({
        type: 'voice',
        event: 'transcript',
        text: 'Prueba de ciclo completo exitosa',
        durationMs: 1450,
      });

      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
      assert.strictEqual(voice.getVoiceStatus().lastTranscript, 'Prueba de ciclo completo exitosa');

      // Step 7: Advance timer by 10s to ensure no lingering side effects
      t.mock.timers.tick(10000);
      assert.strictEqual(voice.getVoiceStatus().state, 'idle');
    });
  });
});
