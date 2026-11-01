// =============================================================================
//  main/ai-sessions.js — Las sesiones de Claude Code (y Antigravity) en vivo
// -----------------------------------------------------------------------------
//  ai-server.js recibe los eventos y nos los pasa. Aquí:
//    • Guardamos cada sesión (proyecto, qué hace, cronómetro, pasos...) usando
//      la lógica de ai-logic.js, y se la mandamos a la página.
//    • Las peticiones que esperan tu respuesta (permisos, preguntas y planes)
//      se quedan "abiertas": la isla enseña la tarjeta y, cuando eliges, les
//      contestamos. Si no contestas en 590 s (el hook espera 600), o si
//      respondes en la terminal, la tarjeta se va sola.
//  Todo por eventos: un temporizador por decisión y otro por sesión (para
//  olvidar las que llevan 45 minutos sin dar señales), nada de sondeos.
// =============================================================================

'use strict';

const { sendToRenderer } = require('./bridge');
const { addNotice } = require('./notices');
const logic = require('./ai-logic');

const DECISION_TIMEOUT = 590 * 1000; // un poco menos que los 600 s que espera el hook
const SESSION_IDLE_MS = 45 * 60 * 1000; // sin señales en 45 min: la sesión se olvida
const AGY_QUIET_MS = 90 * 1000; // Antigravity no avisa al terminar: 90 s sin eventos = terminó
const MAX_PENDING = 8; // más decisiones a la vez → las que sobran, a la terminal
const BROADCAST_DELAY = 60; // ms: juntamos varios eventos seguidos en un solo envío

const sessions = new Map(); // id → { data, idleTimer, quietTimer }
const pending = new Map(); // id → { info, kind, payload, finish, timer }
let nextDecisionId = 1;
let ignoredDirs = []; // carpetas cuyos eventos no son sesiones de verdad (el chat de Notch)
let lastEventAt = 0; // cuándo llegó el último evento (para saber si ya está conectado)
let server = { listening: false, port: 0, error: '' };
let broadcastTimer = null;

/** Todo lo que la página necesita para dibujar la IA. */
function getAiState() {
  return {
    server: { ...server },
    lastEventAt,
    sessions: [...sessions.values()].map((entry) => entry.data).sort((a, b) => b.updatedAt - a.updatedAt),
    pending: [...pending.values()].map((entry) => entry.info).sort((a, b) => a.createdAt - b.createdAt),
  };
}

/** Manda el estado a la página (juntando los eventos que llegan seguidos). */
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    sendToRenderer('ai:state', getAiState());
  }, BROADCAST_DELAY);
}

function setServerStatus(status) {
  server = { ...status };
  broadcast();
}

/** Los eventos que vengan de estas carpetas se ignoran (el chat de Notch usa una propia). */
function setIgnoredDirs(dirs) {
  ignoredDirs = dirs.map(normalizeDir);
}

function normalizeDir(dir) {
  return String(dir || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function isIgnored(cwd) {
  const dir = normalizeDir(cwd);
  return Boolean(dir) && ignoredDirs.includes(dir);
}

/** La sesión con este id (la crea si no existe) y reinicia su temporizador de olvido. */
function getSession(id, payload, source) {
  let entry = sessions.get(id);
  if (!entry) {
    entry = { data: logic.createSession({ ...payload, session_id: id }, source), idleTimer: null, quietTimer: null };
    sessions.set(id, entry);
  }
  clearTimeout(entry.idleTimer);
  entry.idleTimer = setTimeout(() => removeSession(id), SESSION_IDLE_MS);
  return entry;
}

function removeSession(id) {
  const entry = sessions.get(id);
  if (!entry) return;
  clearTimeout(entry.idleTimer);
  clearTimeout(entry.quietTimer);
  sessions.delete(id);
  // Si quedaba algo pendiente de esa sesión, lo soltamos (vuelve a la terminal).
  for (const decision of [...pending.values()]) {
    if (decision.info.sessionId === id) decision.finish(null);
  }
  broadcast();
}

// -----------------------------------------------------------------------------
// Eventos de Claude Code
// -----------------------------------------------------------------------------

/**
 * Un evento de Claude Code (el JSON de su hook).
 * @param {object} payload
 * @param {AbortSignal} [signal]  se activa si Claude Code cuelga la conexión
 * @returns {Promise<object|null>} la respuesta para Claude Code (null = sin decisión)
 */
async function handleClaudeEvent(payload, signal) {
  const id = String(payload.session_id || '');
  if (!id || isIgnored(payload.cwd)) return null;
  lastEventAt = Date.now();

  if (payload.hook_event_name === 'SessionEnd') {
    removeSession(id);
    return null;
  }

  const entry = getSession(id, payload, 'claude');
  const result = logic.applyEvent(entry.data, payload);
  if (result.notice) addNotice(result.notice);
  broadcast();
  if (!result.hold) return null;
  return waitForDecision(result.hold, payload, entry.data, signal);
}

/** Deja una decisión pendiente hasta que elijas (o se agote el tiempo, o cuelguen). */
function waitForDecision(kind, payload, session, signal) {
  if (pending.size >= MAX_PENDING || signal?.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = `d${nextDecisionId++}`;
    const now = Date.now();
    const info = { id, createdAt: now, expiresAt: now + DECISION_TIMEOUT, ...logic.describeDecision(kind, payload, session) };

    const onAbort = () => finish(null); // respondiste en la terminal o se agotó el tiempo del hook
    function finish(response) {
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(id);
      signal?.removeEventListener('abort', onAbort);
      // Si la sesión ya no espera nada más, vuelve a "trabajando".
      const stillWaiting = [...pending.values()].some((other) => other.info.sessionId === session.id);
      if (session.status === 'waiting' && !stillWaiting) session.status = 'working';
      broadcast();
      resolve(response);
    }

    pending.set(id, { info, kind, payload, finish, timer: setTimeout(() => finish(null), DECISION_TIMEOUT) });
    signal?.addEventListener('abort', onAbort, { once: true });
    broadcast();
  });
}

/**
 * Elegiste en la isla. Devuelve true si se aplicó.
 * @param {string} id        la decisión
 * @param {string} decision  'allow' | 'always' | 'deny' | 'answer' | 'approve' | 'reject' | 'terminal'
 * @param {object} [data]    { answers } para las preguntas
 */
function decide(id, decision, data) {
  const entry = pending.get(String(id));
  if (!entry) return false;
  const choice = String(decision);
  const response = logic.buildResponse(entry.kind, entry.payload, choice, data && typeof data === 'object' ? data : {});
  if (response === null && choice !== 'terminal') return false; // p. ej. faltan respuestas
  entry.finish(response);
  return true;
}

/** Al apagar el servidor: todo lo pendiente vuelve a la terminal. */
function releaseAll() {
  for (const decision of [...pending.values()]) decision.finish(null);
}

// -----------------------------------------------------------------------------
// Eventos de Antigravity (agy) — en prueba
// -----------------------------------------------------------------------------
// agy no documenta todavía el JSON de sus hooks y cada fuente dice una cosa.
// Aceptamos las dos formas conocidas ({ conversationId, toolCall: { name, args } }
// y { session_id, tool_name, tool_input }) y lo traducimos a lo de Claude Code.
// Solo enseñamos el estado: nunca decidimos nada por agy.

// Nombres de herramientas de agy → los equivalentes de Claude Code (para el verbo)
const AGY_TOOLS = {
  run_command: 'Bash',
  write_to_file: 'Write',
  write_file: 'Write',
  replace_file_content: 'Edit',
  multi_replace_file_content: 'Edit',
  replace: 'Edit',
  edit_file: 'Edit',
  view_file: 'Read',
  read_file: 'Read',
  grep_search: 'Grep',
  find_by_name: 'Glob',
  list_dir: 'Glob',
  read_url_content: 'WebFetch',
  search_web: 'WebSearch',
};

function firstString(object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] === 'string' && object[key]) return object[key];
  }
  return '';
}

function handleAgyEvent(eventName, payload) {
  const toolCall = payload.toolCall && typeof payload.toolCall === 'object' ? payload.toolCall : null;
  const id = `agy:${firstString(payload, ['conversationId', 'conversation_id', 'session_id', 'sessionId']) || 'sesion'}`;
  const cwd = firstString(payload, ['cwd', 'workspace', 'workspacePath', 'workspace_path', 'projectRoot']);
  if (isIgnored(cwd)) return null;
  lastEventAt = Date.now();

  const rawTool = toolCall ? String(toolCall.name || '') : String(payload.tool_name || '');
  const args = (toolCall ? toolCall.args : payload.tool_input) || {};
  const toolName = AGY_TOOLS[rawTool] || rawTool;
  const input = {
    command: firstString(args, ['command', 'CommandLine', 'commandLine', 'cmd']),
    file_path: firstString(args, ['file_path', 'TargetFile', 'AbsolutePath', 'path', 'filePath']),
    pattern: firstString(args, ['pattern', 'Query', 'query', 'SearchPattern']),
    url: firstString(args, ['url', 'Url']),
    query: firstString(args, ['query', 'Query']),
  };
  const known = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
  const event = known.includes(eventName) ? eventName : rawTool ? 'PostToolUse' : 'UserPromptSubmit';

  const entry = getSession(id, { cwd }, 'agy');
  const translated = {
    session_id: id,
    cwd,
    tool_name: toolName,
    tool_input: input,
    prompt: payload.lastUserInput || payload.prompt || '',
  };
  // De agy casi solo llega el "después" de cada herramienta: primero aplicamos
  // el "antes" (qué hace y en qué paso va) y luego el "después" (archivos, tests).
  if (event === 'PostToolUse') logic.applyEvent(entry.data, { ...translated, hook_event_name: 'PreToolUse' });
  const result = logic.applyEvent(entry.data, { ...translated, hook_event_name: event });
  if (event === 'PostToolUse' || event === 'PreToolUse') entry.data.status = 'working';
  if (result.notice && event === 'Stop') addNotice({ ...result.notice, title: result.notice.title.replace('Claude', 'Antigravity') });

  // agy no siempre avisa al terminar: tras un rato sin eventos lo damos por terminado.
  clearTimeout(entry.quietTimer);
  if (entry.data.status === 'working') {
    entry.quietTimer = setTimeout(() => {
      if (entry.data.status !== 'working') return;
      logic.applyEvent(entry.data, { hook_event_name: 'Stop', session_id: id });
      broadcast();
    }, AGY_QUIET_MS);
  }
  broadcast();
  return null;
}

module.exports = {
  getAiState,
  setServerStatus,
  setIgnoredDirs,
  handleClaudeEvent,
  handleAgyEvent,
  decide,
  releaseAll,
};
