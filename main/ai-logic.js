// =============================================================================
//  main/ai-logic.js — Qué significa cada evento de Claude Code (lógica pura)
// -----------------------------------------------------------------------------
//  Claude Code nos manda un JSON por cada cosa que pasa (sus "hooks"): empieza
//  una sesión, le escribes algo, va a usar una herramienta, pide permiso,
//  termina... Aquí traducimos esos JSON a lo que enseña la isla y preparamos
//  las respuestas (permitir, denegar, responder una pregunta, aprobar un plan).
//  También sirve para Antigravity (agy), cuyos eventos traduce ai-sessions.js.
//
//  No usa Electron: así se puede probar con Node sin abrir la app.
//  Los nombres de los campos son los de la documentación oficial:
//  https://code.claude.com/docs/en/hooks
// =============================================================================

'use strict';

// Herramientas de Claude Code según lo que hacen (pasos Leer → Editar → Probar → Hecho)
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch', 'ToolSearch']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

// Comandos que cuentan como "probar": tests...
const TEST_RE =
  /\b(test|tests|jest|vitest|pytest|mocha|playwright|rspec|phpunit|ctest|unittest)\b|\bgo test\b|\bcargo test\b|\bdotnet test\b/i;
// ...y compilaciones o comprobaciones (si fallan, enseñamos sus errores)
const BUILD_RE =
  /\b(build|tsc|typecheck|compile|lint|eslint|make|cmake|msbuild|gradle|gradlew|mvn|webpack|rollup|esbuild)\b|\bcargo (build|check)\b/i;

const MAX_FILES = 12; // archivos cambiados que guardamos por sesión
const MAX_ERROR_LINES = 3;
const TEXT_LIMIT = 300; // recortamos los textos largos (resúmenes, comandos...)

/** El nombre de la carpeta del proyecto ("C:\\Users\\yo\\Notch" → "Notch"), sea Windows o no. */
function projectName(cwd, fallback = 'Claude Code') {
  const parts = String(cwd || '').split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || fallback;
}

/** Una ruta relativa al proyecto si está dentro de él ("C:\\p\\src\\a.js" → "src/a.js"). */
function relativePath(filePath, cwd) {
  const file = String(filePath || '').replace(/\\/g, '/');
  const base = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (base && file.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return file.slice(base.length + 1);
  return file;
}

/** Corta un texto a `max` caracteres (con "…") y lo deja en una sola línea si oneLine. */
function clip(text, max = TEXT_LIMIT, { oneLine = false } = {}) {
  let value = String(text ?? '');
  if (oneLine) value = value.replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** ¿En qué paso está con esta herramienta? 'read' | 'edit' | 'test' | null */
function stepOf(toolName, input = {}) {
  if (READ_TOOLS.has(toolName)) return 'read';
  if (EDIT_TOOLS.has(toolName)) return 'edit';
  if (SHELL_TOOLS.has(toolName)) {
    const command = String(input.command || '');
    if (TEST_RE.test(command) || BUILD_RE.test(command)) return 'test';
  }
  return null;
}

/**
 * Qué está haciendo, para la isla: un verbo ("Editando"), sobre qué ("app.js")
 * y el detalle completo (el comando exacto, la ruta...).
 */
function describeTool(toolName, input = {}, cwd = '') {
  const name = String(toolName || '');
  if (SHELL_TOOLS.has(name)) {
    const command = String(input.command || '');
    const verb = TEST_RE.test(command) ? 'Probando' : BUILD_RE.test(command) ? 'Compilando' : 'Ejecutando';
    return { verb, target: clip(command, 80, { oneLine: true }), detail: clip(command, 2000) };
  }
  if (EDIT_TOOLS.has(name) || name === 'Read' || name === 'NotebookRead') {
    const file = relativePath(input.file_path || input.notebook_path || '', cwd);
    const verb = name === 'Write' ? 'Creando' : EDIT_TOOLS.has(name) ? 'Editando' : 'Leyendo';
    return { verb, target: clip(file.split('/').at(-1), 60), detail: clip(file, 500) };
  }
  if (name === 'Grep' || name === 'Glob') {
    return { verb: 'Buscando', target: clip(input.pattern, 60, { oneLine: true }), detail: clip(input.pattern, 500) };
  }
  if (name === 'WebFetch') {
    let host = String(input.url || '');
    try {
      host = new URL(host).host;
    } catch {
      // si no es una URL válida, enseñamos el texto tal cual
    }
    return { verb: 'Leyendo web', target: clip(host, 60), detail: clip(input.url, 500) };
  }
  if (name === 'WebSearch') return { verb: 'Buscando', target: clip(input.query, 60, { oneLine: true }), detail: clip(input.query, 500) };
  if (name === 'Task' || name === 'Agent') {
    return { verb: 'Delegando', target: clip(input.description, 60, { oneLine: true }), detail: clip(input.prompt || input.description, 500) };
  }
  if (name === 'AskUserQuestion') return { verb: 'Pregunta', target: '', detail: '' };
  if (name === 'ExitPlanMode') return { verb: 'Plan listo', target: '', detail: '' };
  if (name.startsWith('mcp__')) {
    const [, server = '', tool = ''] = name.split('__');
    return { verb: 'Usando', target: clip(`${server} · ${tool}`, 60), detail: clip(JSON.stringify(input), 500) };
  }
  return { verb: 'Usando', target: clip(name, 60), detail: clip(JSON.stringify(input), 500) };
}

/** Las líneas de error interesantes de una compilación que falló (máximo 3). */
function errorLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .slice(1) // la primera es "Exit code N"
    .map((line) => line.trim())
    .filter((line) => /error|failed|fail\b|cannot|not found|✗|ERR!/i.test(line))
    .slice(0, MAX_ERROR_LINES)
    .map((line) => clip(line, 160));
}

/** Una sesión nueva (o reiniciada) con todo vacío. */
function createSession(payload, source = 'claude') {
  return {
    id: String(payload.session_id || ''),
    source,
    cwd: String(payload.cwd || ''),
    project: projectName(payload.cwd, source === 'agy' ? 'Antigravity' : 'Claude Code'),
    model: typeof payload.model === 'string' ? payload.model : '',
    mode: typeof payload.permission_mode === 'string' ? payload.permission_mode : '',
    status: 'idle', // 'idle' | 'working' | 'waiting' | 'done' | 'error'
    task: '', // lo que le pediste (la primera línea)
    startedAt: 0, // cuándo empezó el turno actual (para el cronómetro)
    endedAt: 0,
    tool: null, // { name, verb, target, detail } lo que hace ahora mismo
    step: null, // 'read' | 'edit' | 'test' | 'done'
    steps: { read: false, edit: false, test: false },
    files: [], // archivos que cambió en este turno (relativos al proyecto)
    fileCount: 0,
    tests: null, // null | 'passed' | 'failed'
    build: null, // null | 'passed' | 'failed'
    errors: [], // líneas de error de la compilación que falló
    summary: '', // su último mensaje al terminar
    error: null, // { type, text } si se paró por un error de la API
    updatedAt: Date.now(),
  };
}

/** Empieza un turno: todo lo del turno anterior se borra. */
function startTurn(session, prompt, now) {
  Object.assign(session, {
    status: 'working',
    task: clip(String(prompt || '').split(/\r?\n/).find((line) => line.trim()) || '', 120, { oneLine: true }),
    startedAt: now,
    endedAt: 0,
    tool: null,
    step: null,
    steps: { read: false, edit: false, test: false },
    files: [],
    fileCount: 0,
    tests: null,
    build: null,
    errors: [],
    summary: '',
    error: null,
  });
}

/** Mensajes de StopFailure (error de la API) en español. */
const STOP_ERRORS = {
  rate_limit: 'Límite de uso alcanzado',
  overloaded: 'Los servidores de Claude están saturados',
  authentication_failed: 'Hay que volver a iniciar sesión',
  oauth_org_not_allowed: 'Tu organización no permite este acceso',
  account_on_hold: 'Tu cuenta está en pausa',
  billing_error: 'Problema con la facturación',
  invalid_request: 'Petición no válida',
  model_not_found: 'Ese modelo no existe',
  server_error: 'Error del servidor de Claude',
  max_output_tokens: 'La respuesta era demasiado larga',
  cloud_credential_error: 'Error con las credenciales de la nube',
};

/**
 * Aplica un evento a la sesión (la cambia) y dice qué hacer después.
 * @returns {{ hold?: 'permission'|'question'|'plan', notice?: object }}
 *   hold: este evento espera tu respuesta (la isla enseña la tarjeta)
 *   notice: un aviso para el centro de avisos
 */
function applyEvent(session, payload, now = Date.now()) {
  const event = String(payload.hook_event_name || '');
  const toolName = String(payload.tool_name || '');
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const agentName = session.source === 'agy' ? 'Antigravity' : 'Claude';
  session.updatedAt = now;
  if (typeof payload.permission_mode === 'string') session.mode = payload.permission_mode;
  if (typeof payload.model === 'string' && payload.model) session.model = payload.model;
  if (payload.cwd) {
    session.cwd = String(payload.cwd);
    session.project = projectName(payload.cwd, session.source === 'agy' ? 'Antigravity' : 'Claude Code');
  }

  switch (event) {
    case 'SessionStart':
      if (typeof payload.model === 'string') session.model = payload.model;
      if (session.status !== 'working') session.status = 'idle';
      return {};

    case 'UserPromptSubmit':
      startTurn(session, payload.prompt, now);
      return {};

    case 'PreToolUse': {
      // Si no vimos el principio del turno (Notch arrancó después), lo empezamos aquí.
      if (session.status !== 'working' && session.status !== 'waiting') startTurn(session, '', now);
      session.status = 'working';
      session.tool = { name: toolName, ...describeTool(toolName, input, session.cwd) };
      const step = stepOf(toolName, input);
      if (step) {
        session.step = step;
        session.steps[step] = true;
      }
      if (toolName === 'AskUserQuestion' && Array.isArray(input.questions) && input.questions.length) {
        session.status = 'waiting';
        return { hold: 'question' };
      }
      if (toolName === 'ExitPlanMode') {
        session.status = 'waiting';
        return { hold: 'plan' };
      }
      return {};
    }

    case 'PermissionRequest':
      if (session.status !== 'working' && session.status !== 'waiting') startTurn(session, '', now);
      session.status = 'waiting';
      session.tool = { name: toolName, ...describeTool(toolName, input, session.cwd) };
      return { hold: 'permission' };

    case 'PostToolUse': {
      if (session.status === 'waiting') session.status = 'working';
      if (EDIT_TOOLS.has(toolName)) addFile(session, input.file_path || input.notebook_path, session.cwd);
      if (SHELL_TOOLS.has(toolName)) {
        const command = String(input.command || '');
        if (TEST_RE.test(command)) session.tests = 'passed';
        else if (BUILD_RE.test(command)) {
          session.build = 'passed';
          session.errors = [];
        }
      }
      return {};
    }

    case 'PostToolUseFailure': {
      if (session.status === 'waiting') session.status = 'working';
      if (SHELL_TOOLS.has(toolName) && !payload.is_interrupt) {
        const command = String(input.command || '');
        if (TEST_RE.test(command)) session.tests = 'failed';
        else if (BUILD_RE.test(command)) {
          session.build = 'failed';
          session.errors = errorLines(payload.error);
        }
      }
      return {};
    }

    case 'Notification': {
      const type = String(payload.notification_type || '');
      if (type === 'permission_prompt' || type === 'agent_needs_input' || type.startsWith('elicitation')) {
        // La terminal te está preguntando algo (no pasó por Notch o ya se agotó el tiempo).
        if (session.status === 'working') session.status = 'waiting';
      }
      if (type.startsWith('quota_')) {
        return {
          notice: {
            key: `ai:quota:${session.id}`,
            kind: 'ai',
            tone: 'warning',
            title: `${agentName}: límite de uso`,
            text: clip(payload.message || 'Se alcanzó el límite de uso.', 140, { oneLine: true }),
          },
        };
      }
      return {};
    }

    case 'Stop': {
      const duration = session.startedAt ? now - session.startedAt : 0;
      Object.assign(session, {
        status: 'done',
        step: 'done',
        endedAt: now,
        tool: null,
        summary: clip(payload.last_assistant_message || '', TEXT_LIMIT, { oneLine: true }),
      });
      // Avisamos solo de los turnos largos (o con fallos): los cortos los ves en la isla.
      const failed = session.tests === 'failed' || session.build === 'failed';
      if (duration < 20 * 1000 && !failed) return {};
      return {
        notice: {
          key: `ai:done:${session.id}`,
          kind: 'ai',
          tone: failed ? 'danger' : 'success',
          title: `${agentName} terminó · ${session.project}`,
          text: failed
            ? session.tests === 'failed'
              ? 'Los tests fallan'
              : 'La compilación tiene errores'
            : clip(session.summary || 'Listo', 140, { oneLine: true }),
        },
      };
    }

    case 'StopFailure': {
      const type = String(payload.error || 'unknown');
      const text =
        STOP_ERRORS[type] ||
        (session.source === 'agy' && type !== 'unknown' ? clip(type, 140, { oneLine: true }) : 'Error de la API');
      Object.assign(session, { status: 'error', endedAt: now, tool: null, error: { type, text } });
      return {
        notice: {
          key: `ai:error:${session.id}`,
          kind: 'ai',
          tone: 'danger',
          title: `${agentName} se detuvo · ${session.project}`,
          text,
          alert: true,
        },
      };
    }

    default:
      return {};
  }
}

function addFile(session, filePath, cwd) {
  if (!filePath) return;
  const file = relativePath(filePath, cwd);
  if (session.files.includes(file)) return;
  session.files.unshift(file);
  session.fileCount += 1;
  if (session.files.length > MAX_FILES) session.files.length = MAX_FILES;
}

// -----------------------------------------------------------------------------
// Decisiones (permisos, preguntas y planes)
// -----------------------------------------------------------------------------

/** "Permitir siempre": la regla que propone Claude Code, en corto ("npm test"). */
function alwaysLabel(suggestions) {
  if (!Array.isArray(suggestions)) return '';
  for (const suggestion of suggestions) {
    if (suggestion?.type === 'addRules' && suggestion.behavior === 'allow' && Array.isArray(suggestion.rules)) {
      const rule = suggestion.rules[0];
      // "domain:lrclib.net" (reglas de WebFetch) → "lrclib.net"
      if (rule) return clip(String(rule.ruleContent || rule.toolName || '').replace(/^domain:/, ''), 60, { oneLine: true });
    }
    if (suggestion?.type === 'setMode' && suggestion.mode === 'acceptEdits') return 'aceptar ediciones';
    if (suggestion?.type === 'addDirectories') return 'esta carpeta';
  }
  return '';
}

/** Lo que enseña la tarjeta de la isla para una decisión pendiente. */
function describeDecision(kind, payload, session) {
  const toolName = String(payload.tool_name || '');
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const base = {
    kind,
    sessionId: session.id,
    source: session.source,
    project: session.project,
    tool: toolName,
  };
  if (kind === 'permission') {
    const info = describeTool(toolName, input, session.cwd);
    const label = alwaysLabel(payload.permission_suggestions);
    return {
      ...base,
      verb: info.verb,
      detail: info.detail || toolName,
      description: clip(input.description || '', 160, { oneLine: true }),
      canAlways: Boolean(label),
      alwaysLabel: label,
    };
  }
  if (kind === 'question') {
    const questions = (Array.isArray(input.questions) ? input.questions : []).slice(0, 4).map((question) => ({
      question: clip(question?.question, 300),
      header: clip(question?.header, 24, { oneLine: true }),
      multiSelect: question?.multiSelect === true,
      options: (Array.isArray(question?.options) ? question.options : []).slice(0, 6).map((option) => ({
        label: clip(option?.label, 80, { oneLine: true }),
        description: clip(option?.description, 160, { oneLine: true }),
      })),
    }));
    return { ...base, questions };
  }
  // plan
  return { ...base, plan: clip(input.plan || '', 6000) };
}

function preToolUse(output) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...output } };
}

/**
 * La respuesta HTTP para Claude Code. null = sin decisión: Claude Code sigue
 * como siempre y te pregunta en la terminal.
 * @param {'permission'|'question'|'plan'} kind
 * @param {object} payload  el JSON que mandó Claude Code
 * @param {string} decision 'allow' | 'always' | 'deny' | 'answer' | 'approve' | 'reject' | 'terminal'
 * @param {object} [data]   en las preguntas: { answers: { "pregunta": "respuesta" } }
 */
function buildResponse(kind, payload, decision, data = {}) {
  if (decision === 'terminal') return null;
  if (kind === 'permission') {
    if (decision === 'allow') {
      return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
    }
    if (decision === 'always' && Array.isArray(payload.permission_suggestions) && payload.permission_suggestions.length) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'allow', updatedPermissions: payload.permission_suggestions },
        },
      };
    }
    if (decision === 'deny') {
      return {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'deny', message: 'El usuario lo denegó desde Notch.' },
        },
      };
    }
    return null;
  }
  if (kind === 'question') {
    const answers = cleanAnswers(payload, data.answers);
    if (decision !== 'answer' || !answers) return null;
    return preToolUse({ permissionDecision: 'allow', updatedInput: { ...payload.tool_input, answers } });
  }
  if (kind === 'plan') {
    if (decision === 'approve') return preToolUse({ permissionDecision: 'allow', updatedInput: { ...payload.tool_input } });
    if (decision === 'reject') {
      return preToolUse({
        permissionDecision: 'deny',
        permissionDecisionReason: 'El usuario rechazó el plan desde Notch. Sigue en modo plan y pregúntale qué cambiar.',
      });
    }
  }
  return null;
}

/**
 * Revisa las respuestas que manda la página: solo preguntas que existen y
 * textos razonables. Devuelve { "pregunta": "respuesta" } o null si falta alguna.
 */
function cleanAnswers(payload, answers) {
  if (!answers || typeof answers !== 'object') return null;
  const questions = Array.isArray(payload.tool_input?.questions) ? payload.tool_input.questions : [];
  const result = {};
  for (const question of questions) {
    const text = String(question?.question || '');
    const answer = answers[text];
    if (typeof answer !== 'string' || !answer.trim()) return null;
    result[text] = answer.trim().slice(0, 2000);
  }
  return Object.keys(result).length ? result : null;
}

/** ¿Esta herramienta de Antigravity debe pedir permiso en la isla? */
function needsAgyPermission(toolName) {
  return SHELL_TOOLS.has(toolName) || EDIT_TOOLS.has(toolName);
}

/**
 * La respuesta JSON para el hook PreToolUse de Antigravity (stdout).
 * 'allow' ejecuta sin preguntar; 'deny' bloquea; 'ask' delega a la terminal.
 */
function buildAgyResponse(kind, payload, decision) {
  if (kind !== 'permission') return {};
  if (decision === 'allow') return { decision: 'allow' };
  if (decision === 'deny') return { decision: 'deny', reason: 'El usuario lo denegó desde Notch.' };
  if (decision === 'terminal') return { decision: 'ask' };
  return null;
}

module.exports = {
  projectName,
  relativePath,
  stepOf,
  describeTool,
  errorLines,
  createSession,
  applyEvent,
  describeDecision,
  buildResponse,
  buildAgyResponse,
  needsAgyPermission,
  alwaysLabel,
};
