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

import { $, animate, cssEasing, setText, formatTime, plural, trackScrollEdges } from './utils.js';
import { state } from './state.js';
import { getActivities, onShapeChange, updateShape } from './island.js';
import { makeBeatSpinner } from './beat.js';
import { onPanelChange } from './panel.js';
import { getCurrentTab, onTabChange, setTabBadge, syncTallState } from './tabs.js';
import { focusChatInput, syncChatVisibility } from './chat.js';
import { testLight, stopLightByName } from './light.js';

const DONE_MS = 6000; // al terminar, la isla enseña "Hecho" estos milisegundos
const MODES = ['sessions', 'chat'];
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

const aiEl = $('ai');
const modeIndicator = $('ai-mode-indicator');
const modeButtons = [...document.querySelectorAll('#ai-modes .segment')];
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
let updateSessionEdges = () => {};
const sessionCards = new Map(); // id de sesión → nodos reutilizables de su tarjeta
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
  let finishedOk = false;
  for (const session of state.ai.sessions) {
    const before = previous.get(session.id);
    if (before && before !== session.status && (session.status === 'done' || session.status === 'error')) {
      state.aiDoneUntil = Date.now() + DONE_MS;
      state.aiDoneId = session.id;
      if (session.status === 'done') finishedOk = true;
    }
  }
  // Luz de agente (F2): borde mientras trabaja; al terminar, verde agua y se apaga.
  const wasWorking = [...previous.values()].includes('working');
  const isWorking = state.ai.sessions.some((session) => session.status === 'working');
  // Sin decisiones pendientes, la luz de "pide permiso" ya no tiene sentido (antes nunca se apagaba).
  // Va ANTES que la de agente: mientras el permiso está encendido (prioridad crítica) la de agente se ignora.
  if (state.ai.pending.length === 0) stopLightByName('permission');
  // testLight('agentWorking') es idempotente: si ya está encendida no reinicia la animación.
  if (isWorking) testLight('agentWorking');
  else if (wasWorking) {
    stopLightByName('agentWorking');
    if (finishedOk) testLight('agentDone');
  }
  renderAll();
  setTabBadge('ai', state.ai.pending.length, 'warning');
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
  if (session.status === 'idle') return 'En espera';
  return session.tool?.verb || 'Pensando';
}

/** Nombre corto y legible del modelo ("claude-opus-4-6[1m]" → "Opus 4.6"). */
function shortModelName(rawModel, sourceKey) {
  const raw = String(rawModel || '').trim();
  if (!raw) return sourceKey === 'agy' ? 'Antigravity' : '';
  const clean = raw.replace(/\[.*?\]/g, '').replace(/-\d{8}$/, '');
  const claudeMatch = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i.exec(clean);
  if (claudeMatch) {
    const family = claudeMatch[1].charAt(0).toUpperCase() + claudeMatch[1].slice(1).toLowerCase();
    const ver = claudeMatch[3] ? `${claudeMatch[2]}.${claudeMatch[3]}` : claudeMatch[2];
    return `${family} ${ver}`;
  }
  return clean.length > 22 ? `${clean.slice(0, 20)}…` : clean;
}

function isPageVisible() {
  return state.isExpanded && getCurrentTab() === 'ai';
}

/** Coloca la pastilla deslizante bajo "Sesiones" o "Chat". */
function moveModeIndicator(withAnimation) {
  const active = modeButtons.find((item) => item.dataset.mode === aiEl.dataset.mode);
  if (!active || !modeIndicator) return;
  modeIndicator.classList.toggle('no-animation', !withAnimation);
  modeIndicator.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
  modeIndicator.style.setProperty('--indicator-width', `${active.offsetWidth}px`);
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
  const sourceKey = session?.source || 'claude';
  const source = SOURCE[sourceKey] || SOURCE.claude;
  activityEl.dataset.ai = session?.status || '';
  activityEl.dataset.source = sourceKey;
  activityUse.setAttribute('href', source.icon);
  bubbleUse.setAttribute('href', source.icon);
  bubbleAi.dataset.source = sourceKey;
  bubbleAi.dataset.status = session?.status || '';
  if (!session) return;
  setText(activityLabel, verbOf(session));
  setText(activityTime, elapsedText(session));
  activityEl.title = `${source.name} · ${session.project}`;
}

/** La página IA: modo (Sesiones o Chat), las tarjetas y el estado del servidor. */
function renderPage({ animateMode = false } = {}) {
  const { sessions, server, lastEventAt } = state.ai;
  const effective = mode === 'auto' ? (sessions.length || state.ai.pending.length ? 'sessions' : 'chat') : mode;
  const previousMode = aiEl.dataset.mode;
  const modeChanged = previousMode !== effective;

  if (modeChanged) {
    aiEl.dataset.mode = effective;
    syncTallState();
  }
  modeButtons.forEach((item) => {
    const active = item.dataset.mode === effective;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
  });

  const live = sessions.filter((session) => session.status === 'working' || session.status === 'waiting').length;
  const countWasHidden = countEl.hidden;
  countEl.hidden = !live;
  setText(countEl, live ? String(live) : '');

  if (modeChanged || countWasHidden !== countEl.hidden) {
    moveModeIndicator(animateMode && isPageVisible());
  }

  if (modeChanged && animateMode && isPageVisible()) {
    const direction = MODES.indexOf(effective) > MODES.indexOf(previousMode) ? 1 : -1;
    const pane = aiEl.querySelector(`[data-ai-pane="${effective}"]`);
    animate(
      pane,
      [
        { opacity: 0, transform: `translateX(${20 * direction}px)`, filter: 'blur(4px)' },
        { opacity: 1, transform: 'translateX(0)', filter: 'blur(0px)' },
      ],
      { duration: 420, easing: cssEasing('--spring-open') }
    );
  }

  serverEl.dataset.state = server.listening ? (lastEventAt ? 'connected' : 'listening') : server.error ? 'error' : 'off';
  setText(
    serverEl,
    server.listening
      ? lastEventAt
        ? 'Conectado'
        : `Puerto ${server.port}`
      : server.error === 'busy'
        ? `Puerto ${server.port} ocupado`
        : 'Apagado'
  );

  setupEl.hidden = sessions.length > 0;
  sessionsEl.hidden = sessions.length === 0;
  sessionsEl.dataset.count = String(sessions.length);
  if (sessions.length) renderSessions(sessions);
  else clearSessionCards();
  syncChatVisibility();
}

function clearSessionCards() {
  if (!sessionCards.size) return;
  sessionCards.clear();
  sessionsEl.replaceChildren();
  updateSessionEdges();
}

/** Crea los elementos fijos de una tarjeta de sesión la primera vez que aparece. */
function createSessionCard(id) {
  const card = document.createElement('article');
  card.className = 'session';
  card.dataset.id = id;

  const head = document.createElement('header');
  head.className = 'session-head';
  const badge = document.createElement('span');
  badge.className = 'session-badge';
  const svgIcon = icon('#i-claude', 'session-icon');
  const iconUse = svgIcon.firstChild;
  badge.append(svgIcon);

  const projectEl = span('session-project', '');
  const modelEl = span('session-model', '');
  const timeEl = span('session-time', '');
  timeEl.dataset.id = id;
  head.append(badge, projectEl, modelEl, timeEl);

  const taskEl = span('session-task', '');
  const nowEl = document.createElement('p');
  nowEl.className = 'session-now';
  const verbEl = span('session-verb', '');
  const targetEl = span('session-target', '');
  nowEl.append(verbEl, targetEl);

  const stepsEl = document.createElement('ol');
  stepsEl.className = 'session-steps';
  const stepItems = STEPS.map(([key, label]) => {
    const item = document.createElement('li');
    item.dataset.step = key;
    item.textContent = label;
    stepsEl.append(item);
    return item;
  });

  const footEl = document.createElement('footer');
  footEl.className = 'session-foot';

  card.append(head, taskEl, nowEl, stepsEl, footEl);
  return { card, iconUse, projectEl, modelEl, timeEl, taskEl, verbEl, targetEl, stepItems, footEl };
}

/** Actualiza las tarjetas en su sitio (sin recrear el DOM en cada evento de herramienta). */
function renderSessions(sessions) {
  const seen = new Set();

  sessions.forEach((session, index) => {
    seen.add(session.id);
    let entry = sessionCards.get(session.id);
    const isNew = !entry;
    if (isNew) {
      entry = createSessionCard(session.id);
      sessionCards.set(session.id, entry);
    }

    const { card, iconUse, projectEl, modelEl, timeEl, taskEl, verbEl, targetEl, stepItems, footEl } = entry;
    const source = SOURCE[session.source] || SOURCE.claude;
    card.dataset.status = session.status;
    card.dataset.source = session.source;
    if (iconUse.getAttribute('href') !== source.icon) iconUse.setAttribute('href', source.icon);

    setText(projectEl, session.project || source.name);
    const modelLabel = shortModelName(session.model, session.source);
    modelEl.hidden = !modelLabel;
    setText(modelEl, modelLabel);
    setText(timeEl, elapsedText(session));

    setText(taskEl, session.task || (session.status === 'idle' ? 'Sesión abierta, esperando tarea' : ''));

    if (session.status === 'done') {
      setText(verbEl, 'Hecho');
      setText(targetEl, session.summary || 'Turno completado');
    } else if (session.status === 'error') {
      setText(verbEl, 'Error');
      setText(targetEl, session.error?.text || 'Revisa la terminal');
    } else if (session.status === 'waiting') {
      setText(verbEl, 'Esperando');
      setText(targetEl, 'tu respuesta');
    } else if (session.status === 'working') {
      setText(verbEl, verbOf(session));
      setText(targetEl, session.tool?.target || '');
    } else {
      setText(verbEl, 'Lista');
      setText(targetEl, '');
    }

    for (const item of stepItems) {
      const key = item.dataset.step;
      const done = key === 'done' ? session.step === 'done' : Boolean(session.steps?.[key]);
      item.dataset.done = String(done);
      item.dataset.current = String(session.step === key && session.status === 'working');
    }

    // Pie de resultados: archivos tocados, tests, build y primer error
    const footParts = [];
    if (session.fileCount) {
      const files = span('session-files', plural(session.fileCount, 'archivo', 'archivos'));
      files.title = session.files.join('\n');
      footParts.push(files);
    }
    if (session.tests) footParts.push(span(`session-result is-${session.tests}`, session.tests === 'passed' ? 'Tests ✓' : 'Tests ✗'));
    if (session.build) footParts.push(span(`session-result is-${session.build}`, session.build === 'passed' ? 'Build ✓' : 'Build ✗'));
    if (session.errors?.length) {
      const error = span('session-error', session.errors[0]);
      error.title = session.errors.join('\n');
      footParts.push(error);
    }
    footEl.replaceChildren(...footParts);

    // Mantener el orden sin desmontar los nodos que ya están en su sitio
    const currentAtSlot = sessionsEl.children[index];
    if (currentAtSlot !== card) sessionsEl.insertBefore(card, currentAtSlot || null);

    if (isNew && isPageVisible() && aiEl.dataset.mode === 'sessions') {
      animate(
        card,
        [
          { opacity: 0, transform: 'scale(0.96)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 340, easing: cssEasing('--spring-open') }
      );
    }
  });

  for (const [id, entry] of sessionCards) {
    if (!seen.has(id)) {
      entry.card.remove();
      sessionCards.delete(id);
    }
  }
  updateSessionEdges();
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
    testLight('permission');
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
  for (let i = 0; i < decision.questions.length; i++) {
    const question = decision.questions[i];
    const ans = answerFor(question);
    answers[question.question] = ans;
    answers[i] = ans;
  }
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
  if (choice === 'allow' || choice === 'always' || choice === 'approve' || choice === 'answer') {
    testLight('autoApproved');
  }
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
    for (const item of state.ai.sessions) {
      const entry = sessionCards.get(item.id);
      if (entry) setText(entry.timeEl, elapsedText(item, now));
    }
  }
  scheduleTick();
}

// -----------------------------------------------------------------------------
// Arranque
// -----------------------------------------------------------------------------

/** Cambia entre Sesiones y Chat (lo que elijas se mantiene mientras Notch esté abierto). */
function setMode(next) {
  mode = next;
  renderPage({ animateMode: true });
  if (next === 'chat' && isPageVisible()) focusChatInput();
  scheduleSpinners();
}

async function copySetup(kind, buttonEl, defaultLabel) {
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
        ? 'Copiado. Pégalo en ~/.gemini/config/hooks.json'
        : 'Copiado. Pégalo en ~/.claude/settings.json'
      : 'No se pudo copiar'
  );
  setupStatus.dataset.state = copied ? 'ok' : 'error';
  if (buttonEl) {
    const labelSpan = buttonEl.querySelector('span');
    if (labelSpan) {
      setText(labelSpan, copied ? 'Copiado ✓' : 'Error');
      clearTimeout(buttonEl._copyTimer);
      buttonEl._copyTimer = setTimeout(() => setText(labelSpan, defaultLabel), 1800);
    }
  }
}

// Los iconos que giran mientras Claude o Antigravity trabajan: en la isla, en
// su burbuja, en el widget y en la página IA. Giran a pasos (reloj de beat.js)
// y solo los que se ven: sin animaciones CSS infinitas.
const refreshSpinners = makeBeatSpinner(
  'ai-spin',
  [
    '.island[data-shape="activity"] .activity[data-ai="working"] .activity-ai-icon',
    '.bubble.is-visible[data-status="working"] .bubble-ai-icon',
    '.island[data-shape="expanded"] .view.is-active .widget-ai[data-status="working"] .widget-icon svg',
    '.island[data-shape="expanded"] .view.is-active .session[data-status="working"] .session-icon',
  ].join(', ')
);

/** Revisa qué iconos giran cuando acaba de cambiar todo (la isla, la página, el widget...). */
let spinnersPending = false;
function scheduleSpinners() {
  if (spinnersPending) return;
  spinnersPending = true;
  queueMicrotask(() => {
    spinnersPending = false;
    refreshSpinners();
  });
}

export function initAi() {
  updateSessionEdges = trackScrollEdges(sessionsEl);
  // Con varias sesiones, la rueda del ratón desplaza la fila de lado sin barra vertical
  sessionsEl.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && sessionsEl.scrollWidth > sessionsEl.clientWidth) {
        event.preventDefault();
        sessionsEl.scrollLeft += event.deltaY;
      }
    },
    { passive: false }
  );

  modeButtons.forEach((segment) => {
    segment.addEventListener('click', () => setMode(segment.dataset.mode));
  });

  const btnClaude = $('ai-copy-claude');
  const btnAgy = $('ai-copy-agy');
  const btnHeadClaude = $('ai-copy-head');
  const btnHeadAgy = $('ai-copy-agy-head');

  btnClaude.addEventListener('click', () => copySetup('claude', btnClaude, 'Claude Code'));
  btnAgy.addEventListener('click', () => copySetup('agy', btnAgy, 'Antigravity'));
  btnHeadClaude.addEventListener('click', () => copySetup('claude', btnHeadClaude, 'Hooks Claude'));
  btnHeadAgy.addEventListener('click', () => copySetup('agy', btnHeadAgy, 'Antigravity'));

  // Los clics dentro de la tarjeta de decisión no abren el panel.
  decisionEl.addEventListener('click', (event) => event.stopPropagation());

  moveModeIndicator(false);
  window.notch.ai.onChange(setAiState);
  onPanelChange(() => {
    renderAll();
    requestAnimationFrame(() => {
      moveModeIndicator(false);
      updateSessionEdges();
      syncChatVisibility();
    });
    scheduleSpinners();
  });
  onTabChange((tab) => {
    if (tab === 'ai') {
      renderPage();
      requestAnimationFrame(() => {
        moveModeIndicator(false);
        updateSessionEdges();
        syncChatVisibility();
      });
      if (aiEl.dataset.mode === 'chat') focusChatInput();
    } else {
      syncChatVisibility();
    }
    scheduleTick();
    scheduleSpinners();
  });
  onShapeChange(() => {
    scheduleTick();
    scheduleSpinners();
  });
  onAiChange(scheduleSpinners);
}
