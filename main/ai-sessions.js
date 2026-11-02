// =============================================================================
//  main/ai-sessions.js — Las sesiones de Claude Code y Antigravity en vivo
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
const AGY_QUIET_MS = 90 * 1000; // respaldo si una sesión de Antigravity no llega a mandar Stop
const MAX_PENDING = 8; // más decisiones a la vez → las que sobran, a la terminal
const BROADCAST_DELAY = 60; // ms: juntamos varios eventos seguidos en un solo envío

const sessions = new Map(); // id → { data, idleTimer, quietTimer, lastPrompt }
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
    entry = {
      data: logic.createSession({ ...payload, session_id: id }, source),
      idleTimer: null,
      quietTimer: null,
      lastPrompt: '',
    };
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
  const payloadData = data && typeof data === 'object' ? data : {};
  const response =
    entry.info.source === 'agy'
      ? logic.buildAgyResponse(entry.kind, entry.payload, choice, payloadData)
      : logic.buildResponse(entry.kind, entry.payload, choice, payloadData);
  if (response === null && choice !== 'terminal') return false; // p. ej. faltan respuestas
  entry.finish(response);
  return true;
}

/** Al apagar el servidor: todo lo pendiente vuelve a la terminal. */
function releaseAll() {
  for (const decision of [...pending.values()]) decision.finish(null);
}

// -----------------------------------------------------------------------------
// Eventos de Antigravity (agy)
// -----------------------------------------------------------------------------
// Antigravity manda su estado en camelCase por stdin ({ conversationId,
// workspacePaths, modelName, lastUserInput, toolCall: { name, args } }).
// Lo traducimos al formato interno y, en PreToolUse de comandos o ediciones,
// enseñamos la tarjeta de permiso en la isla (Permitir / Denegar / En la terminal).

// Nombres de herramientas de agy → los equivalentes de Claude Code (para el verbo)
const AGY_TOOLS = {
  run_command: 'Bash',
  write_to_file: 'Write',
  write_file: 'Write',
  replace_file_content: 'Edit',
  multi_replace_file_content: 'MultiEdit',
  replace: 'Edit',
  edit_file: 'Edit',
  view_file: 'Read',
  view_file_outline: 'Read',
  view_code_item: 'Read',
  read_file: 'Read',
  grep_search: 'Grep',
  find_by_name: 'Glob',
  list_dir: 'Glob',
  read_url_content: 'WebFetch',
  search_web: 'WebSearch',
  invoke_subagent: 'Agent',
};

function firstString(object, keys) {
  for (const key of keys) {
    if (typeof object?.[key] === 'string' && object[key]) return object[key];
  }
  return '';
}

/** Extrae el texto real cuando agy envuelve el mensaje en <USER_REQUEST>...</USER_REQUEST>. */
function cleanAgyPrompt(raw) {
  const text = String(raw || '');
  const match = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i.exec(text);
  return (match ? match[1] : text).trim();
}

/** Respaldo por si una sesión de agy se cierra sin llegar a mandar Stop. */
function armQuietTimer(entry, id) {
  clearTimeout(entry.quietTimer);
  if (entry.data.status !== 'working') return;
  entry.quietTimer = setTimeout(() => {
    if (entry.data.status !== 'working') return;
    logic.applyEvent(entry.data, { hook_event_name: 'Stop', session_id: id });
    entry.lastPrompt = '';
    broadcast();
  }, AGY_QUIET_MS);
}

function ensureTaskHint(session, prompt) {
  if (!prompt || session.task) return;
  const line = String(prompt).split(/\r?\n/).find((item) => item.trim()) || '';
  if (line) session.task = line.trim().slice(0, 120);
}

/**
 * Un evento de Antigravity (POST /agy/<evento>).
 * @param {string} eventName
 * @param {object} payload
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} el JSON de salida para el hook de Antigravity
 */
async function handleAgyEvent(eventName, payload, signal) {
  const toolCall = payload.toolCall && typeof payload.toolCall === 'object' ? payload.toolCall : null;
  const rawId = firstString(payload, ['conversationId', 'conversation_id', 'session_id', 'sessionId']) || 'sesion';
  const id = `agy:${rawId}`;
  const workspaceFromList = Array.isArray(payload.workspacePaths)
    ? payload.workspacePaths.find((item) => typeof item === 'string' && item.trim()) || ''
    : '';
  const cwd =
    workspaceFromList || firstString(payload, ['cwd', 'workspace', 'workspacePath', 'workspace_path', 'projectRoot']);
  if (isIgnored(cwd)) {
    return eventName === 'PreToolUse' ? { decision: 'deny', reason: 'El chat de Notch no usa herramientas.' } : {};
  }
  lastEventAt = Date.now();

  const rawTool = toolCall ? String(toolCall.name || '') : String(payload.tool_name || '');
  const args = (toolCall && typeof toolCall.args === 'object' && toolCall.args ? toolCall.args : payload.tool_input) || {};
  const toolName = AGY_TOOLS[rawTool] || rawTool;
  const input = {
    command: firstString(args, ['CommandLine', 'command', 'commandLine', 'cmd']),
    description: firstString(args, ['toolSummary', 'description', 'Description', 'Role']),
    prompt: firstString(args, ['Prompt', 'prompt']),
    file_path: firstString(args, ['Path', 'TargetFile', 'AbsolutePath', 'file_path', 'path', 'filePath']),
    pattern: firstString(args, ['Query', 'Pattern', 'SearchPattern', 'DirectoryPath', 'pattern', 'query']),
    url: firstString(args, ['Url', 'url']),
    query: firstString(args, ['query', 'Query']),
  };

  const model = firstString(payload, ['modelName', 'model']);
  const prompt = cleanAgyPrompt(payload.lastUserInput || payload.prompt || '');
  const entry = getSession(id, { cwd, model }, 'agy');
  const translated = {
    session_id: id,
    cwd,
    model,
    tool_name: toolName,
    tool_input: input,
    prompt,
  };

  if (eventName === 'SessionStart') {
    logic.applyEvent(entry.data, { ...translated, hook_event_name: 'SessionStart' });
    broadcast();
    return {};
  }

  if (eventName === 'PreInvocation' || eventName === 'UserPromptSubmit') {
    // PreInvocation salta antes de cada llamada al modelo dentro del mismo turno;
    // solo reiniciamos el turno si la sesión estaba parada o cambió lo que le pediste.
    const isNewTurn =
      (entry.data.status !== 'working' && entry.data.status !== 'waiting') ||
      Boolean(prompt && prompt !== entry.lastPrompt);
    if (isNewTurn) {
      entry.lastPrompt = prompt;
      logic.applyEvent(entry.data, { ...translated, hook_event_name: 'UserPromptSubmit' });
    } else {
      entry.data.updatedAt = Date.now();
      entry.data.tool = null; // entre herramientas vuelve a "Pensando"
    }
    armQuietTimer(entry, id);
    broadcast();
    return {};
  }

  if (eventName === 'PreToolUse') {
    logic.applyEvent(entry.data, { ...translated, hook_event_name: 'PreToolUse' });
    ensureTaskHint(entry.data, prompt);
    if (!logic.needsAgyPermission(toolName)) {
      armQuietTimer(entry, id);
      broadcast();
      return { decision: 'ask' };
    }
    clearTimeout(entry.quietTimer);
    logic.applyEvent(entry.data, { ...translated, hook_event_name: 'PermissionRequest' });
    broadcast();
    const response = await waitForDecision('permission', translated, entry.data, signal);
    armQuietTimer(entry, id);
    return response || { decision: 'ask' };
  }

  if (eventName === 'Stop') {
    clearTimeout(entry.quietTimer);
    entry.lastPrompt = '';
    for (const decision of [...pending.values()]) {
      if (decision.info.sessionId === id) decision.finish(null);
    }
    const failedStop =
      payload.terminationReason === 'ERROR' || (typeof payload.error === 'string' && Boolean(payload.error.trim()));
    const result = logic.applyEvent(entry.data, {
      ...translated,
      hook_event_name: failedStop ? 'StopFailure' : 'Stop',
      error: failedStop ? String(payload.error || 'server_error').trim() : '',
    });
    if (result.notice) addNotice(result.notice);
    broadcast();
    return {};
  }

  // PostToolUse (o cualquier otro evento con herramienta)
  logic.applyEvent(entry.data, { ...translated, hook_event_name: 'PreToolUse' });
  ensureTaskHint(entry.data, prompt);
  const hasError = typeof payload.error === 'string' && Boolean(payload.error.trim());
  logic.applyEvent(entry.data, {
    ...translated,
    hook_event_name: hasError ? 'PostToolUseFailure' : 'PostToolUse',
    error: hasError ? payload.error : '',
  });
  entry.data.status = 'working';
  armQuietTimer(entry, id);
  broadcast();
  return {};
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
