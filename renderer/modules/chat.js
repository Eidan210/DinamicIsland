// =============================================================================
//  renderer/modules/chat.js — El chat de la página IA (Claude y Gemini)
// -----------------------------------------------------------------------------
//  main/ai-chat.js lanza el CLI que elijas y nos va mandando cada mensaje
//  (nuevo o actualizado mientras se escribe). Aquí:
//    • Elegir con quién hablas: Gemini, Claude (con su modelo) o Ambos.
//    • Escribir: Enter manda, Mayús+Enter hace un salto de línea. Mientras
//      responde, el botón de enviar pasa a ser "parar".
//    • Las respuestas se ven mientras se escriben (el indicador de escritura
//      avanza con el reloj compartido de beat.js solo mientras se ve, sin
//      animaciones CSS infinitas). Con "Ambos", las dos van lado a lado.
//  El texto de las respuestas se pinta SIEMPRE como texto (nunca como HTML):
//  solo damos formato a los bloques de código, al `código` y a la **negrita**.
// =============================================================================

import { $, setText } from './utils.js';
import { state } from './state.js';
import { getCurrentTab } from './tabs.js';
import { runOnBeat, stopOnBeat } from './beat.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NAMES = { claude: 'Claude', gemini: 'Gemini' };
const ICONS = { claude: '#i-claude', gemini: '#i-gemini' };
const CLI_NAMES = { agy: 'Antigravity', gemini: 'Gemini CLI', claude: '' };
const PLACEHOLDERS = {
  gemini: 'Escribe a Gemini… (va a Google)',
  claude: 'Escribe a Claude… (va a Anthropic)',
  both: 'Escribe a los dos… (va a Google y a Anthropic)',
};
const EMPTY_COPIES = {
  gemini: 'Directo a Google · Sin guardar la conversación',
  claude: 'Directo a Anthropic · Sin guardar la conversación',
  both: 'Gemini y Claude lado a lado · Sin guardar la conversación',
};
const ERRORS = {
  busy: 'Espera a que termine la respuesta (o párala).',
  'too-long': 'El mensaje es demasiado largo (máximo 8000 caracteres).',
};
const MAX_INPUT_LINES = 4;

const aiEl = $('ai');
const log = $('chat-log');
const empty = $('chat-empty');
const emptyCopy = $('chat-empty-copy');
const form = $('chat-form');
const input = $('chat-input');
const sendButton = $('chat-send');
const providerEl = $('chat-provider');
const providerIndicator = $('chat-provider-indicator');
const providerButtons = [...document.querySelectorAll('#chat-provider .segment')];
const modelSelect = $('chat-model');
const newButton = $('chat-new');

const nodes = new Map(); // id del mensaje → su elemento

function createSvgIcon(href, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', href);
  svg.append(use);
  return svg;
}

/** Resume nombres largos de modelo ("claude-sonnet-4-6[1m]" → "Sonnet 4.6"). */
function shortModel(raw) {
  const text = String(raw || '').trim();
  if (!text || text === 'auto') return '';
  const clean = text.replace(/\[.*?\]/g, '').replace(/-\d{8}$/, '');
  const claude = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i.exec(clean);
  if (claude) {
    const name = claude[1].charAt(0).toUpperCase() + claude[1].slice(1).toLowerCase();
    const ver = claude[3] ? `${claude[2]}.${claude[3]}` : claude[2];
    return `${name} ${ver}`;
  }
  return clean;
}

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
// Indicador deslizante y reloj de streaming (beat.js)
// -----------------------------------------------------------------------------

function isChatVisible() {
  return state.isExpanded && getCurrentTab() === 'ai' && aiEl.dataset.mode === 'chat';
}

function moveProviderIndicator(withAnimation) {
  const active = providerButtons.find((item) => item.dataset.provider === state.chat.provider);
  if (!active || !providerIndicator) return;
  providerIndicator.classList.toggle('no-animation', !withAnimation);
  providerIndicator.style.setProperty('--indicator-x', `${active.offsetLeft}px`);
  providerIndicator.style.setProperty('--indicator-width', `${active.offsetWidth}px`);
}

function syncStreamingBeat() {
  if (state.chat.busy && isChatVisible()) {
    runOnBeat(
      'chat-stream',
      (step) => {
        log.dataset.beat = String(step % 4);
      },
      {
        onStop: () => {
          delete log.dataset.beat;
        },
      }
    );
  } else {
    stopOnBeat('chat-stream');
  }
}

/** Llamado por ai.js cuando se abre el panel, cambia la pestaña o pasa a Chat. */
export function syncChatVisibility() {
  moveProviderIndicator(false);
  syncStreamingBeat();
}

// -----------------------------------------------------------------------------
// Mensajes
// -----------------------------------------------------------------------------

async function copyReply(id, buttonEl) {
  let ok = false;
  try {
    ok = await window.notch.chat.copy(id);
  } catch {
    ok = false;
  }
  if (!ok) return;
  const useEl = buttonEl.querySelector('use');
  buttonEl.dataset.copied = 'true';
  if (useEl) useEl.setAttribute('href', '#i-check-mark');
  clearTimeout(buttonEl._copyTimer);
  buttonEl._copyTimer = setTimeout(() => {
    delete buttonEl.dataset.copied;
    if (useEl) useEl.setAttribute('href', '#i-copy');
  }, 1300);
}

/** El elemento de un mensaje (lo crea la primera vez). */
function messageNode(message) {
  let node = nodes.get(message.id);
  if (node) return node;
  node = document.createElement('div');
  node.className = `msg ${message.role === 'user' ? 'msg-user' : 'msg-ai'}`;
  node.dataset.id = message.id;
  if (message.role === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    node.append(bubble);
    log.append(node);
  } else {
    const head = document.createElement('div');
    head.className = 'msg-head';
    const providerIcon = createSvgIcon('#i-gemini', 'msg-icon');
    const name = document.createElement('span');
    name.className = 'msg-name';
    const meta = document.createElement('span');
    meta.className = 'msg-meta';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'msg-copy';
    copyBtn.title = 'Copiar respuesta';
    copyBtn.setAttribute('aria-label', 'Copiar respuesta');
    copyBtn.hidden = true;
    copyBtn.append(createSvgIcon('#i-copy', ''));
    copyBtn.addEventListener('click', () => copyReply(message.id, copyBtn));
    head.append(providerIcon, name, meta, copyBtn);

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
  const iconUse = node.querySelector('.msg-icon use');
  const expectedIcon = ICONS[message.provider] || '#i-w-ai';
  if (iconUse && iconUse.getAttribute('href') !== expectedIcon) iconUse.setAttribute('href', expectedIcon);

  setText(node.querySelector('.msg-name'), NAMES[message.provider] || 'IA');
  const cli = CLI_NAMES[message.cli] || '';
  const modelText = shortModel(message.model);
  setText(node.querySelector('.msg-meta'), [modelText, message.provider === 'gemini' ? cli : ''].filter(Boolean).join(' · '));

  const copyBtn = node.querySelector('.msg-copy');
  if (copyBtn) copyBtn.hidden = !message.text || message.status === 'streaming';

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
  if (message.status === 'cancelled') notes.push('Respuesta detenida');
  setText(status, notes.join(' · '));
}

/** ¿Estás viendo el final de la conversación? (entonces seguimos bajando con lo nuevo) */
function isNearBottom() {
  return log.scrollHeight - log.scrollTop - log.clientHeight < 40;
}

function scrollToBottom() {
  log.scrollTop = log.scrollHeight;
}

function syncComposerEmpty() {
  form.dataset.empty = String(!input.value.trim());
}

function renderComposer({ animateProvider = false } = {}) {
  const { busy, provider, claudeModel } = state.chat;
  aiEl.dataset.chatBusy = String(busy);
  aiEl.dataset.provider = provider;
  form.dataset.busy = String(busy);
  syncComposerEmpty();
  sendButton.setAttribute('aria-label', busy ? 'Parar' : 'Enviar');
  sendButton.title = busy ? 'Parar la respuesta' : 'Enviar (Enter)';
  input.placeholder = PLACEHOLDERS[provider] || PLACEHOLDERS.gemini;
  if (emptyCopy) setText(emptyCopy, EMPTY_COPIES[provider] || EMPTY_COPIES.gemini);

  providerButtons.forEach((segment) => {
    const active = segment.dataset.provider === provider;
    segment.classList.toggle('is-active', active);
    segment.setAttribute('aria-checked', String(active));
  });
  moveProviderIndicator(animateProvider && isChatVisible());

  if (modelSelect.value !== claudeModel) modelSelect.value = claudeModel;
  const hasMessages = state.chat.messages.length > 0;
  empty.hidden = hasMessages;
  newButton.disabled = !hasMessages && !busy;
  syncStreamingBeat();
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

/** El cuadro crece con el texto (hasta 4 líneas) sin mostrar barra vertical antes de tiempo. */
function autosize() {
  input.style.height = 'auto';
  const lineHeight = parseFloat(getComputedStyle(input).lineHeight) || 18;
  const maxHeight = lineHeight * MAX_INPUT_LINES + 10;
  const needed = input.scrollHeight;
  input.style.height = `${Math.min(needed, maxHeight)}px`;
  input.style.overflowY = needed > maxHeight + 2 ? 'auto' : 'hidden';
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
    syncComposerEmpty();
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
    if (!isChatVisible()) return;
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
    syncComposerEmpty();
    autosize();
  });
  providerButtons.forEach((segment) => {
    segment.addEventListener('click', () => {
      state.chat.provider = segment.dataset.provider;
      renderComposer({ animateProvider: true });
      input.focus({ preventScroll: true });
    });
  });
  empty.querySelectorAll('.chat-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const promptText = chip.dataset.prompt || '';
      input.value = promptText;
      input.setCustomValidity('');
      input.title = '';
      syncComposerEmpty();
      autosize();
      input.focus({ preventScroll: true });
      input.setSelectionRange(promptText.length, promptText.length);
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

  autosize();
  window.notch.chat.onUpdate(onUpdate);
  window.notch.chat.onClear(onClear);
  renderComposer();
}
