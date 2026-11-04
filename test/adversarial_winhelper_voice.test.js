/**
 * test/adversarial_winhelper_voice.test.js
 * 
 * Empirical Adversarial Test Harness for WinHelper VoiceModule (Milestone 1):
 * - Spawns helpers/WinHelper/publish/WinHelper.exe as a native background subprocess
 * - Tests full stdin/stdout command protocol sequences (start, level, stop, cancel, status)
 * - Tests command aliases (voice:*, voice-*)
 * - Tests invalid, empty, and malformed JSON arguments
 * - Tests missing model structured error and state recovery
 * - Tests rapid state transitions, race conditions, and crash resilience
 * - Measures idle CPU (0%) and working set memory trimming
 * - Empirically verifies native Whisper runtime packaging & library resolution
 * 
 * Zero external npm dependencies. Standard Node.js only.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HELPER_EXE = path.join(PROJECT_ROOT, 'helpers', 'WinHelper', 'publish', 'WinHelper.exe');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    failures.push({ name, error: err });
    console.log(`  ✗ [FAIL] ${name}`);
    console.log(`      Error: ${err.message}`);
  }
}

/**
 * Robust Client for WinHelper.exe process over stdin/stdout
 */
class WinHelperClient {
  constructor() {
    this.process = null;
    this.stdoutLines = [];
    this.stderrLines = [];
    this.voiceEvents = [];
    this.eventListeners = [];
    this.closed = false;
    this.exitCode = null;
  }

  async start() {
    if (!fs.existsSync(HELPER_EXE)) {
      throw new Error(`WinHelper.exe not found at: ${HELPER_EXE}. Run npm run build:helper first.`);
    }

    this.process = spawn(HELPER_EXE, [], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let buffer = '';
    this.process.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop(); // keep remainder

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        this.stdoutLines.push(line);

        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.type === 'voice') {
            this.voiceEvents.push(parsed);
            for (let i = this.eventListeners.length - 1; i >= 0; i--) {
              const listener = this.eventListeners[i];
              if (listener.predicate(parsed)) {
                this.eventListeners.splice(i, 1);
                listener.resolve(parsed);
              }
            }
          }
        } catch {
          // Non-JSON stdout line
        }
      }
    });

    this.process.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (text) {
        this.stderrLines.push(text);
      }
    });

    this.process.on('close', (code) => {
      this.closed = true;
      this.exitCode = code;
      for (const listener of this.eventListeners) {
        listener.reject(new Error(`WinHelper process exited with code ${code} while waiting for event`));
      }
      this.eventListeners = [];
    });

    // Wait for initial ready event with polling up to 4000ms
    const startWait = Date.now();
    while (Date.now() - startWait < 4000) {
      if (this.stdoutLines.some((l) => l.includes('"type":"ready"'))) break;
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  async ensureAlive() {
    if (this.closed || !this.process) {
      this.closed = false;
      this.exitCode = null;
      this.stdoutLines = [];
      this.stderrLines = [];
      this.voiceEvents = [];
      this.eventListeners = [];
      await this.start();
    }
    return this;
  }

  sendCommand(cmd) {
    if (this.closed || !this.process) {
      throw new Error('Cannot send command to closed WinHelper process');
    }
    this.process.stdin.write(cmd + '\n');
  }

  clearVoiceEvents() {
    this.voiceEvents = [];
  }

  waitForVoiceEvent(predicate, timeoutMs = 4000) {
    const existing = this.voiceEvents.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.eventListeners.findIndex((l) => l.timer === timer);
        if (idx !== -1) this.eventListeners.splice(idx, 1);
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for matching voice event`));
      }, timeoutMs);

      this.eventListeners.push({
        predicate,
        resolve: (ev) => {
          clearTimeout(timer);
          resolve(ev);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });
    });
  }

  getWorkingSetBytes() {
    if (this.closed || !this.process) return 0;
    try {
      const pid = this.process.pid;
      const cmd = `powershell -NoProfile -NonInteractive -Command "(Get-Process -Id ${pid}).WorkingSet64"`;
      const out = execSync(cmd, { timeout: 3000 }).toString().trim();
      return parseInt(out, 10) || 0;
    } catch {
      return 0;
    }
  }

  getCpuTimeMs() {
    if (this.closed || !this.process) return 0;
    try {
      const pid = this.process.pid;
      const cmd = `powershell -NoProfile -NonInteractive -Command "(Get-Process -Id ${pid}).TotalProcessorTime.TotalMilliseconds"`;
      const out = execSync(cmd, { timeout: 3000 }).toString().trim();
      return parseFloat(out) || 0;
    } catch {
      return 0;
    }
  }

  async close() {
    if (this.closed || !this.process) return;
    try {
      this.process.stdin.end();
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
    try {
      if (!this.closed) this.process.kill();
    } catch {}
  }
}

// =============================================================================
// MAIN TEST HARNESS RUNNER
// =============================================================================
async function runAllSuites() {
  console.log('='.repeat(80));
  console.log('  ADVERSARIAL EMPIRICAL STRESS TEST HARNESS — WINHELPER VOICE MODULE');
  console.log('='.repeat(80));

  let client = new WinHelperClient();
  await client.start();

  async function ensureClient() {
    if (!client || client.closed) {
      client = new WinHelperClient();
      await client.start();
    }
    return client;
  }

  try {
    // -------------------------------------------------------------------------
    // SUITE 1: Baseline Protocol Sequences & Handshakes
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 1: Baseline Protocol Sequences & Handshakes ---');

    await runTest('1.1 WinHelper startup emits ready and establishes stdin/stdout IPC', async () => {
      const c = await ensureClient();
      assert.ok(c.process.pid > 0, 'WinHelper must have a valid process ID');
      const readyLine = c.stdoutLines.find((l) => l.includes('"type":"ready"'));
      assert.ok(readyLine, 'WinHelper must emit {"type":"ready"} on startup');
    });

    await runTest('1.2 "voice status" query returns status: idle in resting state', async () => {
      client.clearVoiceEvents();
      client.sendCommand('voice status');
      const ev = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev.type, 'voice');
      assert.strictEqual(ev.status, 'idle');
    });

    await runTest('1.3 "voice start" initiates recording and emits status: recording', async () => {
      client.clearVoiceEvents();
      client.sendCommand('voice start');
      const ev = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev.type, 'voice');
      assert.strictEqual(ev.status, 'recording');
    });

    await runTest('1.4 Active recording streams RMS level events at ~20 Hz with valid numeric bounds', async () => {
      client.clearVoiceEvents();
      const levelEvents = [];
      const startTime = Date.now();

      // Collect level events over 1200ms
      while (Date.now() - startTime < 1200) {
        try {
          const ev = await client.waitForVoiceEvent((e) => e.event === 'level', 800);
          levelEvents.push(ev);
          client.clearVoiceEvents();
        } catch {
          break;
        }
      }

      assert.ok(levelEvents.length >= 3, `Expected at least 3 level events in 1200ms, got ${levelEvents.length}`);
      for (const ev of levelEvents) {
        assert.strictEqual(typeof ev.level, 'number', 'level must be a number');
        assert.strictEqual(typeof ev.rms, 'number', 'rms must be a number');
        assert.ok(ev.level >= 0.0 && ev.level <= 1.0, `level ${ev.level} must be within [0.0, 1.0]`);
        assert.ok(ev.rms >= 0.0, `rms ${ev.rms} must be non-negative`);
      }
    });

    await runTest('1.5 "voice cancel" aborts recording and immediately returns status: idle', async () => {
      client.clearVoiceEvents();
      client.sendCommand('voice cancel');
      const ev = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev.status, 'idle', 'voice cancel must return status: idle');
    });

    await runTest('1.6 Command aliases support colon and hyphen formats (voice:status, voice-start, voice:cancel)', async () => {
      client.clearVoiceEvents();
      client.sendCommand('voice:status');
      const ev1 = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev1.status, 'idle');

      client.clearVoiceEvents();
      client.sendCommand('voice-start');
      const ev2 = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev2.status, 'recording');

      client.clearVoiceEvents();
      client.sendCommand('voice:cancel');
      const ev3 = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev3.status, 'idle');
    });

    // -------------------------------------------------------------------------
    // SUITE 2: Edge Cases, Malformed Arguments & Model Missing Error
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 2: Edge Cases, Malformed Arguments & Error Handling ---');

    await runTest('2.1 Empty lines and whitespace over stdin do not crash the process', async () => {
      await client.ensureAlive();
      client.sendCommand('');
      client.sendCommand('   ');
      client.sendCommand('\t\t   \n');
      await new Promise((r) => setTimeout(r, 100));

      client.clearVoiceEvents();
      client.sendCommand('voice status');
      const ev = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev.status, 'idle');
    });

    await runTest('2.2 Unknown commands return no crash and log warning cleanly to stderr', async () => {
      await client.ensureAlive();
      const stderrCountBefore = client.stderrLines.length;
      client.sendCommand('voice unknown_command_123');
      client.sendCommand('nonexistent_module_foo bar');
      await new Promise((r) => setTimeout(r, 200));

      assert.ok(
        client.stderrLines.length > stderrCountBefore,
        'Unknown command should be logged to stderr'
      );
      assert.ok(!client.closed, 'Process must remain alive after unknown commands');
    });

    await runTest('2.3 Malformed JSON in voice start options is handled safely without crashing', async () => {
      await client.ensureAlive();
      client.clearVoiceEvents();
      client.sendCommand('voice start {malformed_json_not_quoted');
      const evStart = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(evStart.status, 'recording', 'Should fall back to raw argument interpretation');

      client.clearVoiceEvents();
      client.sendCommand('voice cancel');
      const evCancel = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(evCancel.status, 'idle');
    });

    await runTest('2.4 Missing model file emits structured error: model_missing and resets to idle', async () => {
      await client.ensureAlive();
      client.clearVoiceEvents();
      const fakeModelPath = 'C:\\NonExistentDirectory\\definitely_missing_whisper_model_404.bin';
      client.sendCommand(`voice start ${JSON.stringify({ modelPath: fakeModelPath, language: 'es' })}`);
      
      const evRec = await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'recording');
      assert.ok(evRec);

      await new Promise((r) => setTimeout(r, 250));

      client.clearVoiceEvents();
      client.sendCommand('voice stop');

      const evTrans = await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'transcribing');
      assert.ok(evTrans);

      const evErr = await client.waitForVoiceEvent((e) => e.event === 'error');
      assert.strictEqual(evErr.type, 'voice');
      assert.strictEqual(evErr.error, 'model_missing');
      assert.ok(evErr.message.includes(fakeModelPath), 'Error message must cite missing model path');

      const evIdle = await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'idle');
      assert.ok(evIdle, 'Status must cleanly reset to idle after model_missing error');
    });

    await runTest('2.5 Empty modelPath emits structured error: model_missing and returns to idle', async () => {
      await client.ensureAlive();
      client.clearVoiceEvents();
      client.sendCommand(`voice start ${JSON.stringify({ modelPath: '', language: 'es' })}`);
      await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'recording');
      await new Promise((r) => setTimeout(r, 150));

      client.clearVoiceEvents();
      client.sendCommand('voice stop');
      const evErr = await client.waitForVoiceEvent((e) => e.event === 'error');
      assert.strictEqual(evErr.error, 'model_missing');

      const evIdle = await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'idle');
      assert.ok(evIdle);
    });

    await runTest('2.6 Extreme string arguments (>4KB Unicode) in start options do not overflow', async () => {
      await client.ensureAlive();
      client.clearVoiceEvents();
      const hugePath = 'C:\\models\\' + 'ñáç_テスト_🔥_'.repeat(300) + '.bin';
      client.sendCommand(`voice start ${JSON.stringify({ modelPath: hugePath, language: 'zh-Hans' })}`);
      
      const evStart = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(evStart.status, 'recording');

      client.clearVoiceEvents();
      client.sendCommand('voice cancel');
      const evCancel = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(evCancel.status, 'idle');
    });

    // -------------------------------------------------------------------------
    // SUITE 3: Concurrency, Rapid State Transitions & Race Conditions
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 3: Concurrency, Rapid Transitions & Stdin Flooding ---');

    await runTest('3.1 Double start while already recording is ignored without interrupting recording', async () => {
      await client.ensureAlive();
      try {
        client.clearVoiceEvents();
        client.sendCommand('voice start');
        await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'recording');

        client.clearVoiceEvents();
        client.sendCommand('voice start'); // second start while recording
        await new Promise((r) => setTimeout(r, 400));

        client.clearVoiceEvents();
        client.sendCommand('voice status');
        const ev = await client.waitForVoiceEvent((e) => e.event === 'status');
        assert.strictEqual(ev.status, 'recording', 'Must still remain in recording state');
      } finally {
        client.sendCommand('voice cancel');
        await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'idle');
      }
    });

    await runTest('3.2 Spurious voice stop and cancel while idle are gracefully ignored', async () => {
      await client.ensureAlive();
      client.clearVoiceEvents();
      client.sendCommand('voice stop');
      client.sendCommand('voice cancel');
      await new Promise((r) => setTimeout(r, 200));

      client.sendCommand('voice status');
      const ev = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev.status, 'idle', 'Status must remain idle when stopping or cancelling from idle');
    });

    await runTest('3.3 Stdin flooding: 60 interleaved voice status and cancel commands do not hang', async () => {
      await client.ensureAlive();
      for (let i = 0; i < 30; i++) {
        client.sendCommand('voice status');
        client.sendCommand('voice cancel');
      }

      await new Promise((r) => setTimeout(r, 400));
      assert.ok(!client.closed, 'Process must be alive after command burst');

      client.clearVoiceEvents();
      client.sendCommand('voice status');
      const ev = await client.waitForVoiceEvent((e) => e.event === 'status');
      assert.strictEqual(ev.status, 'idle');
    });

    // -------------------------------------------------------------------------
    // SUITE 4: CPU Consumption & Working Set Memory Trimming
    // -------------------------------------------------------------------------
    console.log('\n--- SUITE 4: Idle CPU & Working Set Memory Trimming ---');

    await runTest('4.1 WinHelper consumes 0% CPU during resting idle state', async () => {
      await client.ensureAlive();
      const cpuTime1 = client.getCpuTimeMs();
      await new Promise((r) => setTimeout(r, 2000));
      const cpuTime2 = client.getCpuTimeMs();

      const deltaCpuMs = cpuTime2 - cpuTime1;
      console.log(`      Resting CPU time over 2000ms: ${deltaCpuMs.toFixed(1)} ms`);
      assert.ok(deltaCpuMs < 100, `Idle CPU time (${deltaCpuMs}ms) must be near zero (< 100ms over 2s)`);
    });

    await runTest('4.2 Working set memory is trimmed via EmptyWorkingSet() after recording/cleanup', async () => {
      await client.ensureAlive();
      // 1. Record for 1.2 seconds to allocate audio memory buffers
      client.clearVoiceEvents();
      client.sendCommand('voice start');
      await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'recording');

      await new Promise((r) => setTimeout(r, 1200));
      const wsDuringRecording = client.getWorkingSetBytes();
      const wsDuringMb = (wsDuringRecording / (1024 * 1024)).toFixed(2);

      // 2. Cancel recording (which calls GC.Collect and EmptyWorkingSet)
      client.sendCommand('voice cancel');
      await client.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'idle');

      await new Promise((r) => setTimeout(r, 400));
      const wsAfterTrim = client.getWorkingSetBytes();
      const wsAfterMb = (wsAfterTrim / (1024 * 1024)).toFixed(2);

      console.log(`      Working set during recording: ${wsDuringMb} MB, after trim: ${wsAfterMb} MB`);
      assert.ok(
        wsAfterTrim <= wsDuringRecording || wsAfterTrim < 45 * 1024 * 1024,
        `Working set must be trimmed. During: ${wsDuringMb} MB, After: ${wsAfterMb} MB`
      );
    });

  } finally {
    await client.close();
  }

  // ---------------------------------------------------------------------------
  // SUITE 5: Adversarial Stress Testing & Vulnerability Verification
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Adversarial Stress Testing & Vulnerabilities ---');

  await runTest('5.1 Adversarial Stress: Rapid start/cancel state changes and NAudio handle lifecycle', async () => {
    const stressClient = new WinHelperClient();
    await stressClient.start();

    try {
      for (let i = 0; i < 15; i++) {
        stressClient.sendCommand('voice start');
        stressClient.sendCommand('voice cancel');
      }

      await new Promise((r) => setTimeout(r, 800));

      const invalidHandleErrors = stressClient.stderrLines.filter((l) =>
        l.includes('InvalidHandle') || l.includes('waveIn') || l.includes('AccessViolation')
      );

      if (stressClient.closed) {
        throw new Error(
          `CRITICAL VULNERABILITY CONFIRMED: WinHelper crashed on rapid start/cancel! ` +
          `ExitCode=${stressClient.exitCode}. Error: ${stressClient.stderrLines.join(' ')}`
        );
      }

      if (invalidHandleErrors.length > 0) {
        throw new Error(
          `RACE CONDITION & RESOURCE LIFECYCLE DEFECT: WaveInEvent handle disposed while active: ` +
          invalidHandleErrors.slice(0, 3).join(' | ')
        );
      }
    } finally {
      await stressClient.close();
    }
  });

  await runTest('5.2 Adversarial Check: Native whisper.dll presence in helpers/WinHelper/publish/runtimes/win-x64/', async () => {
    const runtimeDir = path.join(PROJECT_ROOT, 'helpers', 'WinHelper', 'publish', 'runtimes', 'win-x64');
    const whisperDll = path.join(runtimeDir, 'whisper.dll');
    const exists = fs.existsSync(whisperDll);

    console.log(`      Verification: ${whisperDll} exists? ${exists}`);
    if (!exists) {
      throw new Error(
        `CRITICAL PACKAGING DEFECT CONFIRMED: helpers/WinHelper/publish/runtimes/win-x64/whisper.dll does NOT exist! ` +
        `PublishSingleFile in WinHelper.csproj stripped unmanaged native runtimes from output directory.`
      );
    }
  });

  await runTest('5.3 Adversarial Check: WhisperFactory loads native library when model file exists', async () => {
    const dummyModel = path.join(PROJECT_ROOT, 'test', 'temp_dummy_model.bin');
    fs.writeFileSync(dummyModel, Buffer.from('DUMMY_GGML_HEADER_DATA_1234567890'));

    const whisperClient = new WinHelperClient();
    await whisperClient.start();

    try {
      whisperClient.clearVoiceEvents();
      whisperClient.sendCommand(`voice start ${JSON.stringify({ modelPath: dummyModel, language: 'es' })}`);
      await whisperClient.waitForVoiceEvent((e) => e.event === 'status' && e.status === 'recording');
      await new Promise((r) => setTimeout(r, 200));

      whisperClient.clearVoiceEvents();
      whisperClient.sendCommand('voice stop');

      const errEv = await whisperClient.waitForVoiceEvent((e) => e.event === 'error');
      console.log(`      Whisper stop result: error=${errEv.error}, message=${errEv.message}`);

      if (errEv.message.includes('Native Library not found in default paths')) {
        throw new Error(
          `UNRESOLVED NATIVE DEPENDENCY: Whisper.net failed with: "${errEv.message}". whisper.dll is not accessible at runtime.`
        );
      }
    } finally {
      await whisperClient.close();
      try { fs.unlinkSync(dummyModel); } catch {}
    }
  });

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log('  TEST EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total tests:   ${totalTests}`);
  console.log(`  Passed:        ${passedTests}`);
  console.log(`  Failed:        ${failedTests}`);
  console.log('='.repeat(80));

  if (failedTests > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`  ✗ ${f.name}`);
      console.log(`      ${f.error.message}\n`);
    }
  }

  return failedTests === 0;
}

if (require.main === module) {
  runAllSuites().then((success) => {
    process.exitCode = success ? 0 : 1;
  });
}

module.exports = { runAllSuites };
