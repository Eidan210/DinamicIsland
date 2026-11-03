// =============================================================================
//  main/ai-chat.js — El chat de la página IA (Claude y Gemini)
// -----------------------------------------------------------------------------
//  No hay API keys: el chat usa los programas que ya tienes instalados y su
//  sesión iniciada:
//    • Claude → `claude -p` (Claude Code, con tu suscripción)
//    • Gemini → `agy -p` (Antigravity) y, si no está o falla, `gemini` (Gemini CLI)
//  Lo que escribes va SOLO al que elijas (Claude → Anthropic, Gemini → Google).
//  Notch no manda nada por su cuenta.
//
//  La conversación vive solo en memoria (al cerrar Notch se olvida) y a Claude
//  le pedimos que no la guarde (--no-session-persistence). Cada mensaje lanza
//  el programa con la conversación hasta ahora; la respuesta llega a trozos
//  (stream-json) y la página la va enseñando mientras se escribe.
//
//  Seguridad: tu texto nunca pasa por la línea de comandos de cmd.exe. A
//  Claude y a Gemini CLI se lo damos por su entrada estándar (stdin); a agy,
//  que es un .exe, como argumento sin pasar por ningún shell. Se ejecutan en
//  una carpeta vacía de Notch y sin herramientas (no pueden tocar tus archivos).
// =============================================================================

'use strict';

const { app, clipboard } = require('electron');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { state } = require('./state');
const { sendToRenderer } = require('./bridge');
const { saveSetting } = require('./config');
const { parseClaudeLine, parseGeminiLine, parseAgyLine, parseAgyError } = require('./ai-chat-parse');

const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
const GEMINI_CLI_OPTIONS = ['auto', 'agy', 'gemini'];
const PROVIDERS = ['gemini', 'claude', 'both'];
const MAX_MESSAGE_CHARS = 8000; // lo que puedes escribir en un mensaje
const MAX_HISTORY_CHARS = 12000; // la conversación que mandamos (lo más viejo se recorta)
const MAX_MESSAGES = 60; // mensajes que recordamos
const FIRST_OUTPUT_TIMEOUT = 60 * 1000; // si en 60 s no escribe nada, lo damos por colgado
const TOTAL_TIMEOUT = 5 * 60 * 1000; // ninguna respuesta puede tardar más de 5 minutos
const UPDATE_DELAY = 50; // ms: juntamos los trozos de texto antes de mandarlos a la página
const SYSTEM_PROMPT =
  'Eres el asistente de chat de Notch, una app de escritorio. Responde en el idioma del usuario, ' +
  'de forma clara y breve (usa listas cortas cuando ayuden). No tienes herramientas: no puedes leer ' +
  'archivos, ejecutar comandos ni navegar por internet.';

const LABELS = { claude: 'Claude', gemini: 'Gemini' };

const history = []; // [{ id, role, provider?, cli?, model?, text, status, error?, note? }]
const running = new Map(); // id de la respuesta → { child, cancelled }
const updateTimers = new Map();
let nextId = 1;
const executables = new Map(); // nombre → { file, isCmd } | { missingUntil }

/** La carpeta vacía donde se ejecutan los CLI (los eventos de esta carpeta se ignoran). */
function getChatDir() {
  return path.join(app.getPath('userData'), 'chat');
}

function ensureChatDir() {
  const dir = getChatDir();
  fs.mkdirSync(dir, { recursive: true });
  const promptFile = path.join(dir, 'system-prompt.txt');
  fs.writeFileSync(promptFile, SYSTEM_PROMPT, 'utf8');
  return { dir, promptFile };
}

// -----------------------------------------------------------------------------
// Encontrar y lanzar los programas
// -----------------------------------------------------------------------------

/**
 * Busca un programa en el PATH (where.exe en Windows). Prefiere el .exe; si
 * solo hay un .cmd (instalado con npm), lo marca para lanzarlo con cmd.exe.
 * NOTCH_CLAUDE_CMD / NOTCH_AGY_CMD / NOTCH_GEMINI_CMD sirven para las pruebas.
 */
function findExecutable(name) {
  const override = process.env[`NOTCH_${name.toUpperCase()}_CMD`];
  if (override) return Promise.resolve({ file: override, isCmd: /\.(cmd|bat)$/i.test(override) });
  const cached = executables.get(name);
  if (cached?.file) return Promise.resolve(cached);
  if (cached && Date.now() < cached.missingUntil) return Promise.resolve(null);

  const isWindows = process.platform === 'win32';
  return new Promise((resolve) => {
    execFile(isWindows ? 'where.exe' : 'which', [name], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      const lines = String(stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const exe = lines.find((line) => /\.exe$/i.test(line));
      const cmd = lines.find((line) => /\.(cmd|bat)$/i.test(line));
      let found = null;
      if (!isWindows && !error && lines[0]) found = { file: lines[0], isCmd: false };
      else if (exe) found = { file: exe, isCmd: false };
      else if (cmd) found = { file: cmd, isCmd: true };
      // Si no está, lo volvemos a buscar dentro de 30 s (por si lo acabas de instalar).
      executables.set(name, found || { missingUntil: Date.now() + 30 * 1000 });
      resolve(found);
    });
  });
}

/** Entrecomilla un argumento para cmd.exe (todos los argumentos son nuestros, nunca tu texto). */
function quoteForCmd(arg) {
  const text = String(arg);
  if (/^[A-Za-z0-9_\-.:\\/=]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Lanza el programa. Los .cmd (npm) solo se pueden lanzar a través de cmd.exe. */
function launch(executable, args, { cwd, stdin }) {
  const options = { cwd, windowsHide: true, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] };
  if (executable.isCmd) {
    const line = [executable.file, ...args].map(quoteForCmd).join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
      ...options,
      windowsVerbatimArguments: true,
    });
  }
  return spawn(executable.file, args, options);
}

/** Cierra el programa y todo lo que haya abierto (en Windows, con taskkill /T). */
function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else {
    child.kill('SIGTERM');
  }
}

// -----------------------------------------------------------------------------
// La conversación
// -----------------------------------------------------------------------------

let cachedAvailability = { claude: true, agy: true, gemini: true };

// Comprueba la disponibilidad de ejecutables en segundo plano
function refreshAvailability() {
  Promise.all([findExecutable('claude'), findExecutable('agy'), findExecutable('gemini')])
    .then(([claudeExe, agyExe, geminiExe]) => {
      cachedAvailability = {
        claude: Boolean(claudeExe),
        agy: Boolean(agyExe && !agyExe.isCmd),
        gemini: Boolean(geminiExe),
      };
    })
    .catch(() => {});
}
refreshAvailability();

function getChatState() {
  const claudeOverride = process.env.NOTCH_CLAUDE_CMD;
  const agyOverride = process.env.NOTCH_AGY_CMD;
  const geminiOverride = process.env.NOTCH_GEMINI_CMD;

  const available = {
    claude: claudeOverride !== undefined ? Boolean(claudeOverride) : cachedAvailability.claude,
    agy: agyOverride !== undefined ? Boolean(agyOverride) : cachedAvailability.agy,
    gemini: geminiOverride !== undefined ? Boolean(geminiOverride) : cachedAvailability.gemini,
  };

  return {
    messages: history.map((message) => ({ ...message })),
    busy: running.size > 0,
    provider: state.settings.chatProvider,
    claudeModel: state.settings.claudeModel,
    geminiCli: state.settings.geminiCli || 'auto',
    geminiModel: state.settings.geminiModel || '',
    available,
  };
}

/** Manda a la página un mensaje (nuevo o actualizado). Los trozos de texto, juntos cada 50 ms. */
function emitMessage(message, { now = false } = {}) {
  const send = () => {
    updateTimers.delete(message.id);
    sendToRenderer('chat:update', { message: { ...message }, busy: running.size > 0 });
  };
  clearTimeout(updateTimers.get(message.id));
  if (now) send();
  else updateTimers.set(message.id, setTimeout(send, UPDATE_DELAY));
}

/** La conversación como texto, para mandarla (lo más reciente cabe; lo viejo se recorta). */
function buildPrompt(provider) {
  const turns = history
    .filter((message) => message.text && message.status !== 'streaming')
    .map((message) => `${message.role === 'user' ? 'Usuario' : LABELS[message.provider] || 'Asistente'}: ${message.text}`);
  const last = history.filter((message) => message.role === 'user').at(-1)?.text || '';
  if (turns.length <= 1) return last;

  const kept = [];
  let size = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    size += turns[i].length + 2;
    if (size > MAX_HISTORY_CHARS && kept.length) break;
    kept.unshift(turns[i]);
  }
  return (
    `Esta es la conversación hasta ahora (tú eres ${LABELS[provider]}; puede que otro asistente también haya respondido):\n\n` +
    `${kept.join('\n\n')}\n\nResponde al último mensaje del usuario.`
  );
}

/**
 * Escribiste un mensaje. provider: 'gemini' | 'claude' | 'both'.
 * Devuelve { ok } o { ok: false, error }.
 */
function sendChat(text, options = {}) {
  const message = String(text || '').trim();
  if (!message) return { ok: false, error: 'empty' };
  if (message.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'too-long' };
  if (running.size) return { ok: false, error: 'busy' };

  const provider = PROVIDERS.includes(options.provider) ? options.provider : state.settings.chatProvider;
  const claudeModel = CLAUDE_MODELS.includes(options.claudeModel) ? options.claudeModel : state.settings.claudeModel;
  const geminiCli = GEMINI_CLI_OPTIONS.includes(options.geminiCli) ? options.geminiCli : state.settings.geminiCli;
  const geminiModel = typeof options.geminiModel === 'string' ? options.geminiModel : state.settings.geminiModel;
  rememberPrefs(provider, claudeModel, geminiCli, geminiModel);

  const userMessage = { id: `m${nextId++}`, role: 'user', text: message, status: 'done' };
  history.push(userMessage);
  emitMessage(userMessage, { now: true });

  const targets = provider === 'both' ? ['gemini', 'claude'] : [provider];
  for (const target of targets) {
    const reply = {
      id: `m${nextId++}`,
      role: 'assistant',
      provider: target,
      cli: target === 'claude' ? 'claude' : '',
      model: target === 'claude' ? claudeModel : (geminiModel || state.settings.geminiModel),
      text: '',
      status: 'streaming',
      group: userMessage.id, // con "Ambos", las dos respuestas van juntas
    };
    history.push(reply);
    running.set(reply.id, { child: null, cancelled: false });
    emitMessage(reply, { now: true });
    const prompt = buildPrompt(target);
    const job = target === 'claude' ? runClaude(reply, prompt, claudeModel) : runGemini(reply, prompt, { cli: geminiCli, model: geminiModel });
    job
      .catch((error) => {
        reply.status = 'error';
        reply.error = error.message;
      })
      .finally(() => {
        running.delete(reply.id);
        emitMessage(reply, { now: true });
      });
  }
  while (history.length > MAX_MESSAGES) history.shift();
  return { ok: true };
}

/** Recuerda lo que elegiste en el selector (se guarda en settings.json). */
function rememberPrefs(provider, claudeModel, geminiCli, geminiModel) {
  if (provider && provider !== state.settings.chatProvider) {
    state.settings.chatProvider = provider;
    saveSetting('chatProvider', provider);
  }
  if (claudeModel && claudeModel !== state.settings.claudeModel) {
    state.settings.claudeModel = claudeModel;
    saveSetting('claudeModel', claudeModel);
  }
  if (geminiCli && geminiCli !== state.settings.geminiCli) {
    state.settings.geminiCli = geminiCli;
    saveSetting('geminiCli', geminiCli);
  }
  if (typeof geminiModel === 'string' && geminiModel !== state.settings.geminiModel) {
    state.settings.geminiModel = geminiModel;
    saveSetting('geminiModel', geminiModel);
  }
}

/** El botón de parar: corta las respuestas que se estén escribiendo. */
function cancelChat() {
  for (const job of running.values()) {
    job.cancelled = true;
    killTree(job.child);
  }
  running.clear();
}

/** "Nueva conversación": se olvida todo. */
function clearChat() {
  cancelChat();
  history.length = 0;
  sendToRenderer('chat:cleared');
}

// -----------------------------------------------------------------------------
// Ejecutar un programa y leer su respuesta
// -----------------------------------------------------------------------------

/**
 * Lanza el programa y va llenando reply.text con lo que escribe.
 * parseLine: la función de ai-chat-parse.js que entiende sus líneas.
 * Devuelve una promesa que se cumple al terminar (bien o mal).
 */
function runProcess(reply, executable, args, { stdin, parseLine, label }) {
  const { dir } = ensureChatDir();
  const job = running.get(reply.id);
  return new Promise((resolve) => {
    let child;
    try {
      child = launch(executable, args, { cwd: dir, stdin: stdin !== undefined });
    } catch (error) {
      resolve({ ok: false, error: `No se pudo abrir ${label}: ${error.message}` });
      return;
    }
    if (job) job.child = child;

    const decoder = new StringDecoder('utf8');
    let buffer = '';
    let stderr = '';
    let error = '';
    let gotText = false;
    let finished = false;

    const firstTimer = setTimeout(() => {
      error = `${label} no respondió en ${FIRST_OUTPUT_TIMEOUT / 1000} s`;
      killTree(child);
    }, FIRST_OUTPUT_TIMEOUT);
    const totalTimer = setTimeout(() => {
      error = `${label} tardó demasiado (más de 5 minutos)`;
      killTree(child);
    }, TOTAL_TIMEOUT);

    const handleLine = (line) => {
      const result = parseLine(line);
      if (!result) return;
      if (result.model) reply.model = result.model;
      if (result.delta) {
        reply.text += result.delta;
        gotText = true;
      }
      // El texto completo manda (salvo que sea un mensaje parcial y ya tengamos trozos).
      if (typeof result.full === 'string' && result.full && (!result.partial || !gotText)) {
        reply.text = result.full;
        gotText = true;
      }
      if (result.error) error = result.error;
      emitMessage(reply);
    };

    child.stdout.on('data', (chunk) => {
      clearTimeout(firstTimer);
      buffer += decoder.write(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handleLine);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-4000);
    });
    if (stdin !== undefined) {
      child.stdin.on('error', () => {}); // si el programa se cierra antes de leer, no pasa nada
      child.stdin.end(stdin, 'utf8');
    }

    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      buffer += decoder.end();
      if (buffer.trim()) handleLine(buffer);
      const cancelled = job?.cancelled === true;
      const stderrError = parseAgyError(stderr) || lastLine(stderr);
      if (cancelled) resolve({ ok: true, cancelled: true });
      else if (error) resolve({ ok: false, error, gotText });
      else if (code !== 0 && !gotText) resolve({ ok: false, error: stderrError || `${label} terminó con un error (${code})`, gotText });
      else if (!gotText) resolve({ ok: false, error: stderrError || `${label} no devolvió ninguna respuesta.`, gotText: false });
      else resolve({ ok: true, gotText });
    };
    child.on('error', (spawnError) => {
      error = `No se pudo abrir ${label}: ${spawnError.message}`;
      finish(-1);
    });
    child.on('close', (code) => finish(code));
  });
}

function lastLine(text) {
  return (
    String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1) || ''
  ).slice(0, 300);
}

/** Aplica el resultado de runProcess a la respuesta. */
function applyResult(reply, result) {
  if (result.cancelled) reply.status = 'cancelled';
  else if (!result.ok) {
    reply.status = 'error';
    reply.error = result.error;
  } else reply.status = 'done';
}

/** Claude: `claude -p` sin herramientas, sin guardar la sesión y con un prompt de chat. */
async function runClaude(reply, prompt, model) {
  const executable = await findExecutable('claude');
  if (!executable) {
    applyResult(reply, { ok: false, error: 'No encuentro Claude Code (el comando claude). Instálalo o revisa el PATH.' });
    return;
  }
  const { promptFile } = ensureChatDir();
  const args = [
    '-p',
    '--model',
    model,
    '--tools',
    '',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--system-prompt-file',
    promptFile,
  ];
  const result = await runProcess(reply, executable, args, { stdin: prompt, parseLine: parseClaudeLine, label: 'Claude Code' });
  applyResult(reply, result);
}

/** Gemini: Antigravity (agy) o Gemini CLI, según "geminiCli" (auto = agy y, si falla, Gemini CLI). */
async function runGemini(reply, prompt, options = {}) {
  const choice = options.cli || state.settings.geminiCli;
  const model = typeof options.model === 'string' ? options.model : state.settings.geminiModel;
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${prompt}`;
  const agy = choice !== 'gemini' ? await findExecutable('agy') : null;
  // agy recibe el texto como argumento: solo si es un .exe (sin pasar por cmd.exe).
  if (agy && !agy.isCmd) {
    reply.cli = 'agy';
    emitMessage(reply);
    const args = ['--output-format', 'stream-json', '--disable-slash-commands'];
    if (model) args.push('--model', model);
    args.push(`-p=${fullPrompt}`);
    const result = await runProcess(reply, agy, args, { parseLine: parseAgyLine, label: 'Antigravity' });
    if (result.ok || result.cancelled || result.gotText || choice === 'agy') {
      applyResult(reply, result);
      return;
    }
    // agy falló sin escribir nada: probamos con Gemini CLI
    reply.note = `Antigravity falló (${result.error}); responde Gemini CLI`;
  }
  if (choice === 'agy') {
    applyResult(reply, { ok: false, error: 'No encuentro Antigravity (agy.exe). Instálalo o cambia "geminiCli".' });
    return;
  }
  const gemini = await findExecutable('gemini');
  if (!gemini) {
    applyResult(reply, {
      ok: false,
      error: reply.note || 'No encuentro Antigravity (agy) ni Gemini CLI (gemini). Instala uno de los dos.',
    });
    return;
  }
  reply.cli = 'gemini';
  reply.text = '';
  emitMessage(reply);
  const args = ['--output-format', 'stream-json'];
  const validGeminiModel = model && model !== 'auto' && model !== 'gemini-2.0' && /^[a-zA-Z0-9_.-]+$/.test(model);
  if (validGeminiModel) args.push('-m', model);
  const result = await runProcess(reply, gemini, args, { stdin: fullPrompt, parseLine: parseGeminiLine, label: 'Gemini CLI' });
  applyResult(reply, result);
}

/** Copia al portapapeles el texto completo de un mensaje del chat. */
function copyMessage(id) {
  const entry = history.find((item) => item.id === id);
  if (!entry?.text) return false;
  clipboard.writeText(entry.text);
  return true;
}

/** Al salir de Notch: que no quede ningún programa del chat abierto. */
function stopChat() {
  cancelChat();
}

module.exports = { getChatDir, getChatState, sendChat, cancelChat, clearChat, copyMessage, stopChat, CLAUDE_MODELS, GEMINI_CLI_OPTIONS };
