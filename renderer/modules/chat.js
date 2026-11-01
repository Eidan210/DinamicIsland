// =============================================================================
//  renderer/modules/chat.js — El chat de la página IA (Claude y Gemini)
// -----------------------------------------------------------------------------
//  main/ai-chat.js lanza el CLI que elijas y nos va mandando cada mensaje
//  (nuevo o actualizado mientras se escribe). Aquí:
//    • Elegir con quién hablas: Gemini, Claude (con su modelo) o Ambos.
//    • Escribir: Enter manda, Mayús+Enter hace un salto de línea. Mientras
//      responde, el botón de enviar pasa a ser "parar".
//    • Las respuestas se ven mientras se escriben. Con "Ambos", las dos van
//      lado a lado.
//  El texto de las respuestas se pinta SIEMPRE como texto (nunca como HTML):
//  solo damos formato a los bloques de código, al `código` y a la **negrita**.
// =============================================================================

import { $, setText } from './utils.js';
import { state } from './state.js';
import { getCurrentTab } from './tabs.js';

const NAMES = { claude: 'Claude', gemini: 'Gemini' };
const CLI_NAMES = { agy: 'Antigravity', gemini: 'Gemini CLI', claude: '' };
const PLACEHOLDERS = {
  gemini: 'Escribe a Gemini… (va a Google)',
  claude: 'Escribe a Claude… (va a Anthropic)',
  both: 'Escribe a los dos… (va a Google y a Anthropic)',
};
const ERRORS = {
  busy: 'Espera a que termine la respuesta (o párala).',
  'too-long': 'El mensaje es demasiado largo (máximo 8000 caracteres).',
};
const MAX_INPUT_LINES = 4;

const aiEl = $('ai');
const log = $('chat-log');
const empty = $('chat-empty');
const form = $('chat-form');
const input = $('chat-input');
const sendButton = $('chat-send');
const providerEl = $('chat-provider');
const modelSelect = $('chat-model');
const newButton = $('chat-new');

const nodes = new Map(); // id del mensaje → su elemento

// -----------------------------------------------------------------------------
// Formato del texto (seguro: solo nodos de texto)
// -----------------------------------------------------------------------------

/** `código` y **negrita** dentro de una línea. */
function inlineFormat(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) fragment.append(text.slice(last, match.index));
    const token = match[0];
    const element = document.createElement(token.startsWith('`') ? 'code' : 'strong');
    element.textContent = token.startsWith('`') ? token.slice(1, -1) : token.slice(2, -2);
    fragment.append(element);
    last = match.index + token.length;
  }
  if (last < text.length) fragment.append(text.slice(last));
  return fragment;
}

/** El texto de una respuesta: bloques ``` como código; el resto, párrafos con formato. */
function formatText(text) {
  const fragment = document.createDocumentFragment();
  const parts = String(text || '').split(/```/);
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      // Dentro de ```: la primera línea puede ser el lenguaje (```js)
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = part.replace(/^[\w+-]*\n/, '').replace(/\n$/, '');
      pre.append(code);
      fragment.append(pre);
      return;
    }
    const lines = part.split('\n');
    lines.forEach((line, lineIndex) => {
      const bullet = /^\s*[-*+]\s+/.exec(line);
      fragment.append(inlineFormat(bullet ? `• ${line.slice(bullet[0].length)}` : line));
      if (lineIndex < lines.length - 1) fragment.append(document.createElement('br'));
    });
  });
  return fragment;
}

// -----------------------------------------------------------------------------
// Mensajes
// -----------------------------------------------------------------------------

/** El elemento de un mensaje (lo crea la primera vez). */
function messageNode(message) {
  let node = nodes.get(message.id);
  if (node) return node;
  node = document.createElement('div');
  node.className = `msg ${message.role === 'user' ? 'msg-user' : 'msg-ai'}`;
  node.dataset.id = message.id;
  if (message.role === 'user') {
    node.append(document.createElement('div'));
    node.firstChild.className = 'msg-bubble';
    log.append(node);
  } else {
    const head = document.createElement('div');
    head.className = 'msg-head';
    const name = document.createElement('span');
    name.className = 'msg-name';
    const meta = document.createElement('span');
    meta.className = 'msg-meta';
    head.append(name, meta);
    const body = document.createElement('div');
    body.className = 'msg-body';
    const status = document.createElement('div');
    status.className = 'msg-status';
    node.append(head, body, status);
    // Con "Ambos", las respuestas del mismo mensaje van juntas, lado a lado.
    let pair = log.querySelector(`.msg-pair[data-group="${CSS.escape(message.group || message.id)}"]`);
    if (!pair) {
      pair = document.createElement('div');
      pair.className = 'msg-pair';
      pair.dataset.group = message.group || message.id;
      log.append(pair);
    }
    pair.append(node);
    pair.dataset.count = String(pair.children.length);
  }
  nodes.set(message.id, node);
  return node;
}

function renderMessage(message) {
  const node = messageNode(message);
  if (message.role === 'user') {
    setText(node.firstChild, message.text);
    return;
  }
  node.dataset.provider = message.provider;
  node.dataset.status = message.status;
  setText(node.querySelector('.msg-name'), NAMES[message.provider] || 'IA');
  const cli = CLI_NAMES[message.cli] || '';
  setText(node.querySelector('.msg-meta'), [message.model, message.provider === 'gemini' ? cli : ''].filter(Boolean).join(' · '));

  const body = node.querySelector('.msg-body');
  // Solo rehacemos el texto si cambió (llega a trozos mientras se escribe).
  if (body.dataset.text !== message.text) {
    body.dataset.text = message.text;
    body.replaceChildren(formatText(message.text));
  }
  const status = node.querySelector('.msg-status');
  const notes = [];
  if (message.note) notes.push(message.note);
  if (message.status === 'error') notes.push(message.error || 'No se pudo responder');
  if (message.status === 'cancelled') notes.push('Parado');
  setText(status, notes.join(' · '));
}

/** ¿Estás viendo el final de la conversación? (entonces seguimos bajando con lo nuevo) */
function isNearBottom() {
  return log.scrollHeight - log.scrollTop - log.clientHeight < 40;
}

function scrollToBottom() {
  log.scrollTop = log.scrollHeight;
}

function renderComposer() {
  const { busy, provider, claudeModel } = state.chat;
  aiEl.dataset.chatBusy = String(busy);
  aiEl.dataset.provider = provider;
  sendButton.setAttribute('aria-label', busy ? 'Parar' : 'Enviar');
  sendButton.title = busy ? 'Parar la respuesta' : 'Enviar (Enter)';
  input.placeholder = PLACEHOLDERS[provider] || PLACEHOLDERS.gemini;
  providerEl.querySelectorAll('.seg').forEach((segment) => {
    segment.setAttribute('aria-checked', String(segment.dataset.provider === provider));
  });
  if (modelSelect.value !== claudeModel) modelSelect.value = claudeModel;
  empty.hidden = state.chat.messages.length > 0;
}

/** main.js manda un mensaje nuevo o actualizado. */
function onUpdate({ message, busy } = {}) {
  if (!message?.id) return;
  const follow = isNearBottom();
  const index = state.chat.messages.findIndex((item) => item.id === message.id);
  if (index === -1) state.chat.messages.push(message);
  else state.chat.messages[index] = message;
  state.chat.busy = busy === true;
  renderMessage(message);
  renderComposer();
  if (follow || message.role === 'user') scrollToBottom();
}

function onClear() {
  state.chat.messages = [];
  state.chat.busy = false;
  nodes.clear();
  log.replaceChildren();
  renderComposer();
}

/** Al arrancar: la conversación que hubiera (si recargas la página) y lo elegido. */
export function loadChat(initial) {
  if (!initial) return;
  state.chat.provider = initial.provider || state.chat.provider;
  state.chat.claudeModel = initial.claudeModel || state.chat.claudeModel;
  onClear();
  for (const message of initial.messages || []) onUpdate({ message, busy: initial.busy });
  renderComposer();
}

/** settings.json cambió (p. ej. lo editaste a mano): el selector lo refleja. */
export function applyChatSettings() {
  if (state.chat.busy) return;
  state.chat.provider = state.settings.chatProvider || state.chat.provider;
  state.chat.claudeModel = state.settings.claudeModel || state.chat.claudeModel;
  renderComposer();
}

// -----------------------------------------------------------------------------
// Escribir y mandar
// -----------------------------------------------------------------------------

/** El cuadro crece con el texto (hasta 4 líneas). */
function autosize() {
  input.style.height = 'auto';
  const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 18;
  input.style.height = `${Math.min(input.scrollHeight, lineHeight * MAX_INPUT_LINES + 16)}px`;
}

async function submit() {
  if (state.chat.busy) {
    window.notch.chat.cancel();
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  let result;
  try {
    result = await window.notch.chat.send(text, { provider: state.chat.provider, claudeModel: state.chat.claudeModel });
  } catch {
    result = { ok: false };
  }
  if (result?.ok) {
    input.value = '';
    autosize();
    return;
  }
  // No se mandó: lo dejamos escrito y avisamos en el propio cuadro.
  input.setCustomValidity(ERRORS[result?.error] || '');
  input.title = ERRORS[result?.error] || '';
}

/** Pone el cursor en el cuadro del chat (al abrir la página en modo Chat). */
export function focusChatInput() {
  requestAnimationFrame(() => {
    if (!state.isExpanded || getCurrentTab() !== 'ai' || aiEl.dataset.mode !== 'chat') return;
    input.focus({ preventScroll: true });
  });
}

export function initChat() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  input.addEventListener('keydown', (event) => {
    // Enter manda; Mayús+Enter, salto de línea (y nada mientras escribes con un IME)
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  input.addEventListener('input', () => {
    input.setCustomValidity('');
    input.title = '';
    autosize();
  });
  providerEl.querySelectorAll('.seg').forEach((segment) => {
    segment.addEventListener('click', () => {
      state.chat.provider = segment.dataset.provider;
      renderComposer();
      input.focus({ preventScroll: true });
    });
  });
  modelSelect.addEventListener('change', () => {
    state.chat.claudeModel = modelSelect.value;
    renderComposer();
  });
  newButton.addEventListener('click', () => {
    window.notch.chat.clear();
    input.focus({ preventScroll: true });
  });

  window.notch.chat.onUpdate(onUpdate);
  window.notch.chat.onClear(onClear);
  renderComposer();
}
