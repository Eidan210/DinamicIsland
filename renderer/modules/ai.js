// =============================================================================
//  renderer/modules/ai.js — Claude Code y Antigravity en la isla y en la página IA
// -----------------------------------------------------------------------------
//  main/ai-sessions.js nos manda el estado cada vez que pasa algo:
//    • sessions: cada sesión con su proyecto, qué hace, sus pasos y resultados.
//    • pending: lo que espera tu respuesta (permisos, preguntas y planes).
//  Aquí lo dibujamos:
//    • Isla: la actividad "Claude · Editando … 2:13" (y "Hecho" unos segundos
//      al terminar), su burbuja y la tarjeta de decisión, que salta por encima
//      de todo (con el panel abierto sale como tarjeta encima del contenido).
//    • Página IA (modo Sesiones): una tarjeta por sesión con su cronómetro y
//      los pasos Leer → Editar → Probar → Hecho; sin sesiones, cómo conectar.
//    • El widget de Home está en renderer/widgets/ai.js (se entera con onAiChange).
//  El cronómetro avanza una vez por segundo, solo mientras se ve.
// =============================================================================

import { $, setText, formatTime, plural } from './utils.js';
import { state } from './state.js';
import { getActivities, onShapeChange, updateShape } from './island.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange } from './tabs.js';
import { focusChatInput } from './chat.js';

const DONE_MS = 6000; // al terminar, la isla enseña "Hecho" estos milisegundos
export const SOURCE = {
  claude: { name: 'Claude', icon: '#i-claude' },
  agy: { name: 'Antigravity', icon: '#i-gemini' },
};
// Qué quiere hacer, para el título del permiso ("Claude quiere ejecutar")
const ACTIONS = {
  Bash: 'ejecutar',
  PowerShell: 'ejecutar',
  Edit: 'editar',
  MultiEdit: 'editar',
  NotebookEdit: 'editar',
  Write: 'crear o reescribir',
  Read: 'leer',
  WebFetch: 'abrir una web',
  WebSearch: 'buscar en internet',
};
export const STEPS = [
  ['read', 'Leer'],
  ['edit', 'Editar'],
  ['test', 'Probar'],
  ['done', 'Hecho'],
];

const island = $('island');
const aiEl = $('ai');
const activityEl = $('activity');
const activityUse = $('activity-ai-use');
const activityLabel = $('activity-ai-label');
const activityTime = $('activity-ai-time');
const bubbleAi = $('bubble-ai');
const bubbleUse = $('bubble-ai-use');
const decisionEl = $('decision');
const decisionIcon = $('decision-icon');
const decisionTitle = $('decision-title');
const decisionProject = $('decision-project');
const decisionCount = $('decision-count');
const decisionBody = $('decision-body');
const decisionActions = $('decision-actions');
const sessionsEl = $('ai-sessions');
const setupEl = $('ai-setup');
const setupStatus = $('ai-setup-status');
const serverEl = $('ai-server');
const countEl = $('ai-count');

let mode = 'auto'; // 'auto' | 'sessions' | 'chat' (auto: Sesiones si hay alguna, si no Chat)
let tickTimer = null;
let shownDecisionId = ''; // la decisión que enseña la tarjeta
// Lo que vas eligiendo en una pregunta: { id, index, selected: { pregunta: 'x' | ['x', 'y'] },
// other: { pregunta: 'texto' }, otherOpen: { pregunta: true } }
let questionState = null;
let deciding = false; // mientras main aplica tu respuesta, los botones se desactivan
const changeListeners = [];

/** Avisa a `listener()` cada vez que cambia algo de la IA (lo usa el widget de Home). */
export function onAiChange(listener) {
  changeListeners.push(listener);
}

// -----------------------------------------------------------------------------
// Estado
// -----------------------------------------------------------------------------

/** main.js nos manda el estado (al arrancar y cada vez que cambia). */
export function setAiState(next) {
  if (!next || typeof next !== 'object') return;
  const previous = new Map(state.ai.sessions.map((session) => [session.id, session.status]));
  state.ai = {
    server: next.server || { listening: false, port: 0, error: '' },
    lastEventAt: Number(next.lastEventAt) || 0,
    sessions: Array.isArray(next.sessions) ? next.sessions : [],
    pending: Array.isArray(next.pending) ? next.pending : [],
  };
  // Una sesión acaba de terminar: la isla enseña "Hecho" unos segundos.
  for (const session of state.ai.sessions) {
    const before = previous.get(session.id);
    if (before && before !== session.status && (session.status === 'done' || session.status === 'error')) {
      state.aiDoneUntil = Date.now() + DONE_MS;
      state.aiDoneId = session.id;
    }
  }
  renderAll();
  updateShape();
}

/** La sesión que enseña la isla: la que trabaja (la más reciente) o la que acaba de terminar. */
function getIslandSession() {
  const { sessions } = state.ai;
  const live = sessions.find((session) => session.status === 'working' || session.status === 'waiting');
  if (live) return live;
  if (Date.now() < state.aiDoneUntil) return sessions.find((session) => session.id === state.aiDoneId) || null;
  return null;
}

/** Cuánto lleva (o cuánto duró) el turno, en "2:13". */
function elapsedText(session, now = Date.now()) {
  if (!session?.startedAt) return '';
  const end = session.endedAt && session.status !== 'working' && session.status !== 'waiting' ? session.endedAt : now;
  return formatTime((end - session.startedAt) / 1000);
}

/** Qué hace, en una palabra: "Editando", "Esperando", "Hecho"... */
export function verbOf(session) {
  if (session.status === 'waiting') return 'Esperando';
  if (session.status === 'done') return 'Hecho';
  if (session.status === 'error') return 'Error';
  return session.tool?.verb || 'Pensando';
}

function isPageVisible() {
  return state.isExpanded && getCurrentTab() === 'ai';
}

// -----------------------------------------------------------------------------
// Dibujar
// -----------------------------------------------------------------------------

function renderAll() {
  renderIsland();
  renderDecision();
  renderPage();
  changeListeners.forEach((listener) => listener());
  scheduleTick();
}

/** La actividad de la isla y su burbuja. */
function renderIsland() {
  const session = getIslandSession();
  const source = SOURCE[session?.source] || SOURCE.claude;
  activityEl.dataset.ai = session?.status || '';
  activityEl.dataset.source = session?.source || 'claude';
  activityUse.setAttribute('href', source.icon);
  bubbleUse.setAttribute('href', source.icon);
  bubbleAi.dataset.status = session?.status || '';
  if (!session) return;
  setText(activityLabel, verbOf(session));
  setText(activityTime, elapsedText(session));
  activityEl.title = `${source.name} · ${session.project}`;
}

/** La página IA: modo (Sesiones o Chat), las tarjetas y el estado del servidor. */
function renderPage() {
  const { sessions, server, lastEventAt } = state.ai;
  const effective = mode === 'auto' ? (sessions.length || state.ai.pending.length ? 'sessions' : 'chat') : mode;
  if (aiEl.dataset.mode !== effective) {
    aiEl.dataset.mode = effective;
    aiEl.querySelectorAll('.seg[data-mode]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.mode === effective));
    });
  }
  const live = sessions.filter((session) => session.status === 'working' || session.status === 'waiting').length;
  countEl.hidden = !live;
  setText(countEl, String(live));

  serverEl.dataset.state = server.listening ? (lastEventAt ? 'connected' : 'listening') : server.error ? 'error' : 'off';
  setText(
    serverEl,
    server.listening
      ? lastEventAt
        ? 'Conectado'
        : `Escuchando · ${server.port}`
      : server.error === 'busy'
        ? `Puerto ${server.port} ocupado`
        : 'Apagado'
  );

  setupEl.hidden = sessions.length > 0;
  sessionsEl.hidden = sessions.length === 0;
  if (sessions.length) renderSessions(sessions);
}

/** Una tarjeta por sesión. */
function renderSessions(sessions) {
  const cards = sessions.map((session) => {
    const source = SOURCE[session.source] || SOURCE.claude;
    const card = document.createElement('article');
    card.className = 'session';
    card.dataset.status = session.status;
    card.dataset.source = session.source;

    const head = document.createElement('header');
    head.className = 'session-head';
    head.append(icon(source.icon, 'session-icon'), span('session-project', session.project));
    const time = span('session-time', elapsedText(session));
    time.dataset.id = session.id;
    head.append(time);

    // Lo que le pediste, y qué hace ahora (o cómo terminó)
    const task = span('session-task', session.task || (session.status === 'idle' ? 'Esperando tu mensaje' : ''));
    const now = document.createElement('p');
    now.className = 'session-now';
    if (session.status === 'done') {
      now.append(span('session-verb', 'Hecho'), span('session-target', session.summary || 'Listo'));
    } else if (session.status === 'error') {
      now.append(span('session-verb', 'Error'), span('session-target', session.error?.text || ''));
    } else if (session.status === 'waiting') {
      now.append(span('session-verb', 'Esperando'), span('session-target', 'tu respuesta'));
    } else if (session.status === 'working') {
      now.append(span('session-verb', verbOf(session)), span('session-target', session.tool?.target || ''));
    }

    // Pasos: Leer → Editar → Probar → Hecho
    const steps = document.createElement('ol');
    steps.className = 'session-steps';
    for (const [key, label] of STEPS) {
      const item = document.createElement('li');
      item.textContent = label;
      const done = key === 'done' ? session.step === 'done' : session.steps?.[key];
      item.dataset.done = String(Boolean(done));
      item.dataset.current = String(session.step === key && session.status === 'working');
      steps.append(item);
    }

    // Resultados: archivos, tests y compilación
    const foot = document.createElement('footer');
    foot.className = 'session-foot';
    if (session.fileCount) {
      const files = span('session-files', plural(session.fileCount, 'archivo', 'archivos'));
      files.title = session.files.join('\n');
      foot.append(files);
    }
    if (session.tests) foot.append(span(`session-result is-${session.tests}`, session.tests === 'passed' ? 'Tests ✓' : 'Tests ✗'));
    if (session.build) foot.append(span(`session-result is-${session.build}`, session.build === 'passed' ? 'Build ✓' : 'Build ✗'));
    if (session.errors?.length) {
      const error = span('session-error', session.errors[0]);
      error.title = session.errors.join('\n');
      foot.append(error);
    }

    card.append(head, task, now, steps, foot);
    return card;
  });
  sessionsEl.replaceChildren(...cards);
}

// -----------------------------------------------------------------------------
// La tarjeta de decisión (permiso, pregunta o plan)
// -----------------------------------------------------------------------------

function renderDecision() {
  const { pending } = state.ai;
  const decision = pending[0];
  if (!decision) {
    decisionEl.dataset.kind = '';
    shownDecisionId = '';
    questionState = null;
    return;
  }
  // Solo la redibujamos si cambia la decisión (si no, perderías lo que vas eligiendo).
  if (decision.id === shownDecisionId && !deciding) {
    updateDecisionCount(pending.length);
    return;
  }
  shownDecisionId = decision.id;
  deciding = false;
  const source = SOURCE[decision.source] || SOURCE.claude;
  decisionEl.dataset.kind = decision.kind;
  decisionEl.dataset.source = decision.source;
  decisionIcon.setAttribute('href', source.icon);
  setText(decisionProject, decision.project || '');
  updateDecisionCount(pending.length);

  if (decision.kind === 'permission') {
    setText(decisionTitle, `${source.name} quiere ${ACTIONS[decision.tool] || `usar ${decision.tool}`}`);
    renderPermission(decision);
  } else if (decision.kind === 'question') {
    setText(decisionTitle, `${source.name} pregunta`);
    questionState = { id: decision.id, index: 0, selected: {}, other: {}, otherOpen: {} };
    renderQuestion(decision);
  } else {
    setText(decisionTitle, `${source.name} tiene un plan`);
    renderPlan(decision);
  }
}

function updateDecisionCount(count) {
  decisionCount.hidden = count < 2;
  setText(decisionCount, `1 de ${count}`);
}

function renderPermission(decision) {
  const command = document.createElement('pre');
  command.className = 'decision-command';
  command.dataset.shell = String(decision.tool === 'Bash' || decision.tool === 'PowerShell');
  command.textContent = decision.detail || decision.tool;
  const parts = [command];
  if (decision.description) parts.push(span('decision-note', decision.description));
  decisionBody.replaceChildren(...parts);

  const buttons = [button('Denegar', 'decision-btn is-deny', () => decide('deny'))];
  if (decision.canAlways) {
    const always = button(`Siempre: ${decision.alwaysLabel}`, 'decision-btn is-always', () => decide('always'));
    always.title = `Permitir y no volver a preguntar por «${decision.alwaysLabel}»`;
    buttons.push(always);
  }
  buttons.push(button('Permitir', 'decision-btn is-allow', () => decide('allow')));
  setActions(buttons);
}

/** Una pregunta (si hay varias, de una en una; "Responder" en la última). */
function renderQuestion(decision) {
  const question = decision.questions[questionState.index];
  if (!question) return;
  const total = decision.questions.length;
  const text = document.createElement('p');
  text.className = 'decision-question';
  text.textContent = question.question;
  if (total > 1) text.prepend(span('decision-step', `${questionState.index + 1}/${total}`));

  const key = question.question;
  const chosen = questionState.selected[key];
  const otherOpen = questionState.otherOpen[key] === true;
  const choices = document.createElement('div');
  choices.className = 'decision-choices';
  choices.setAttribute('role', question.multiSelect ? 'group' : 'radiogroup');
  for (const option of question.options) {
    const selected = question.multiSelect ? chosen?.includes(option.label) : !otherOpen && chosen === option.label;
    const choice = button(option.label, 'choice', () => pick(question, option.label));
    choice.title = option.description || '';
    choice.setAttribute(question.multiSelect ? 'aria-pressed' : 'aria-checked', String(Boolean(selected)));
    if (!question.multiSelect) choice.setAttribute('role', 'radio');
    choices.append(choice);
  }
  // "Otra": escribir tu propia respuesta (en las de varias opciones, se suma a lo marcado)
  if (otherOpen) {
    const input = document.createElement('input');
    input.className = 'choice-input';
    input.maxLength = 500;
    input.placeholder = question.multiSelect ? 'Añade otra respuesta' : 'Escribe tu respuesta';
    input.value = questionState.other[key] || '';
    input.addEventListener('input', () => {
      questionState.other[key] = input.value;
      updateQuestionButton(decision);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && input.value.trim()) nextQuestion(decision);
    });
    choices.append(input);
    requestAnimationFrame(() => input.focus());
  } else {
    choices.append(button('Otra…', 'choice is-other', () => {
      questionState.otherOpen[key] = true;
      renderQuestion(decision);
    }));
  }
  decisionBody.replaceChildren(text, choices);

  const last = questionState.index === total - 1;
  const next = button(last ? 'Responder' : 'Siguiente', 'decision-btn is-allow', () => nextQuestion(decision));
  next.id = 'decision-next';
  setActions([next]);
  updateQuestionButton(decision);
}

function pick(question, label) {
  const decision = state.ai.pending.find((item) => item.id === questionState?.id);
  if (!decision) return;
  const key = question.question;
  if (question.multiSelect) {
    const list = Array.isArray(questionState.selected[key]) ? questionState.selected[key] : [];
    questionState.selected[key] = list.includes(label) ? list.filter((item) => item !== label) : [...list, label];
  } else {
    questionState.selected[key] = label;
    questionState.otherOpen[key] = false; // elegir una opción cierra "Otra"
  }
  renderQuestion(decision);
}

/** La respuesta de una pregunta, como texto ("" si aún no hay). */
function answerFor(question) {
  const key = question.question;
  const other = questionState.otherOpen[key] ? String(questionState.other[key] || '').trim() : '';
  if (question.multiSelect) {
    const list = Array.isArray(questionState.selected[key]) ? questionState.selected[key] : [];
    return [...list, other].filter(Boolean).join(', ');
  }
  return questionState.otherOpen[key] ? other : String(questionState.selected[key] || '');
}

/** ¿Ya hay respuesta para la pregunta actual? */
function currentAnswer(decision) {
  return answerFor(decision.questions[questionState.index]);
}

function updateQuestionButton(decision) {
  const next = $('decision-next');
  if (next) next.disabled = deciding || !currentAnswer(decision);
}

function nextQuestion(decision) {
  if (!currentAnswer(decision)) return;
  if (questionState.index < decision.questions.length - 1) {
    questionState.index += 1;
    renderQuestion(decision);
    return;
  }
  const answers = {};
  for (const question of decision.questions) answers[question.question] = answerFor(question);
  decide('answer', { answers });
}

function renderPlan(decision) {
  const plan = document.createElement('div');
  plan.className = 'decision-plan';
  plan.tabIndex = 0; // se puede desplazar con el teclado
  // Un markdown muy sencillo: títulos y listas como líneas (siempre como texto, nunca HTML).
  for (const rawLine of String(decision.plan || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const row = document.createElement('p');
    const heading = /^#{1,6}\s+/.exec(line);
    const bullet = /^\s*([-*+]|\d+\.)\s+/.exec(line);
    if (heading) {
      row.className = 'plan-heading';
      row.textContent = line.slice(heading[0].length);
    } else if (bullet) {
      row.className = 'plan-item';
      row.textContent = `${/\d/.test(bullet[1]) ? bullet[1] : '•'} ${line.slice(bullet[0].length).replace(/\*\*/g, '')}`;
    } else {
      row.textContent = line.replace(/\*\*/g, '');
    }
    plan.append(row);
  }
  decisionBody.replaceChildren(plan);
  setActions([
    button('Rechazar', 'decision-btn is-deny', () => decide('reject')),
    button('Aprobar', 'decision-btn is-allow', () => decide('approve')),
  ]);
}

/** Los botones de abajo, con "En la terminal" a la izquierda (deja que conteste la terminal). */
function setActions(buttons) {
  const terminal = button('En la terminal', 'decision-terminal', () => decide('terminal'));
  terminal.prepend(icon('#i-terminal', 'decision-terminal-icon'));
  terminal.title = 'Que te pregunte la terminal (Notch no decide)';
  const spacer = document.createElement('span');
  spacer.className = 'decision-spacer';
  decisionActions.replaceChildren(terminal, spacer, ...buttons);
}

/** Manda tu respuesta a main. Con el panel cerrado, el foco vuelve a tu app. */
async function decide(choice, data) {
  const decision = state.ai.pending[0];
  if (!decision || deciding) return;
  deciding = true;
  decisionActions.querySelectorAll('button').forEach((item) => (item.disabled = true));
  decisionEl.dataset.answered = choice;
  let applied = false;
  try {
    applied = await window.notch.ai.decide(decision.id, choice, data);
  } catch {
    applied = false;
  }
  if (!state.isExpanded) window.notch.releaseFocus();
  if (!applied) {
    // Ya no estaba pendiente (p. ej. respondiste en la terminal): se redibuja con lo que llegue.
    deciding = false;
    shownDecisionId = '';
    renderDecision();
  }
}

// -----------------------------------------------------------------------------
// Utilidades de dibujo
// -----------------------------------------------------------------------------

function span(className, text) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

function icon(href, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', href);
  svg.append(use);
  return svg;
}

function button(text, className, onClick) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  element.addEventListener('click', (event) => {
    event.stopPropagation(); // que el clic no abra el panel
    onClick();
  });
  return element;
}

// -----------------------------------------------------------------------------
// Cronómetro (1 vez por segundo, solo mientras se ve)
// -----------------------------------------------------------------------------

function needsTick() {
  const hasLive = state.ai.sessions.some((session) => session.status === 'working' || session.status === 'waiting');
  if (!hasLive) return false;
  const islandShowsAi = state.shape === 'activity' && getActivities()[0] === 'ai';
  return islandShowsAi || isPageVisible();
}

function scheduleTick() {
  clearTimeout(tickTimer);
  tickTimer = null;
  if (!needsTick()) return;
  // Esperamos justo hasta el siguiente segundo del cronómetro.
  const session = getIslandSession() || state.ai.sessions[0];
  const elapsed = session?.startedAt ? Date.now() - session.startedAt : 0;
  tickTimer = setTimeout(tick, 1000 - (elapsed % 1000) + 15);
}

function tick() {
  const now = Date.now();
  const session = getIslandSession();
  if (session) setText(activityTime, elapsedText(session, now));
  if (isPageVisible()) {
    sessionsEl.querySelectorAll('.session-time').forEach((element) => {
      const item = state.ai.sessions.find((candidate) => candidate.id === element.dataset.id);
      if (item) setText(element, elapsedText(item, now));
    });
  }
  scheduleTick();
}

// -----------------------------------------------------------------------------
// Arranque
// -----------------------------------------------------------------------------

/** Cambia entre Sesiones y Chat (lo que elijas se mantiene mientras Notch esté abierto). */
function setMode(next) {
  mode = next;
  renderPage();
  if (next === 'chat' && isPageVisible()) focusChatInput();
}

async function copySetup(kind) {
  let copied = false;
  try {
    copied = await window.notch.ai.copySetup(kind);
  } catch {
    copied = false;
  }
  setText(
    setupStatus,
    copied
      ? kind === 'agy'
        ? 'Copiado: pégalo en ~/.gemini/config/hooks.json'
        : 'Copiado: pégalo en ~/.claude/settings.json'
      : 'No se pudo copiar'
  );
  setupStatus.dataset.state = copied ? 'ok' : 'error';
}

export function initAi() {
  aiEl.querySelectorAll('.seg[data-mode]').forEach((segment) => {
    segment.addEventListener('click', () => setMode(segment.dataset.mode));
  });
  $('ai-copy-claude').addEventListener('click', () => copySetup('claude'));
  $('ai-copy-agy').addEventListener('click', () => copySetup('agy'));
  $('ai-copy-head').addEventListener('click', async () => {
    await copySetup('claude');
    const head = $('ai-copy-head');
    head.textContent = setupStatus.dataset.state === 'ok' ? 'Copiado ✓' : 'No se pudo copiar';
    setTimeout(() => (head.textContent = 'Copiar configuración'), 2000);
  });
  // Los clics dentro de la tarjeta de decisión no abren el panel.
  decisionEl.addEventListener('click', (event) => event.stopPropagation());

  window.notch.ai.onChange(setAiState);
  onPanelChange(() => renderAll());
  onTabChange((tab) => {
    if (tab === 'ai') {
      renderPage();
      if (aiEl.dataset.mode === 'chat') focusChatInput();
    }
    scheduleTick();
  });
  onShapeChange(scheduleTick);
}
