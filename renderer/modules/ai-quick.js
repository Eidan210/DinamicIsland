// =============================================================================
//  renderer/modules/ai-quick.js — Interfaz de IA rápida estilo Sentient OS (Fase 14)
// -----------------------------------------------------------------------------
//  Controla la caja de comandos ai-input (560x120), el chip de app previa,
//  el envío al chat de IA, el botón de copia y el pegado nativo en la app anterior.
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';
import { updateShape } from './island.js';
import { triggerLight, clearLight } from './light.js';

let quickViewEl;
let appChipEl;
let chipLabelEl;
let chipRemoveEl;
let attachBtnEl;
let screenPreviewWrapEl;
let screenPreviewImgEl;
let screenPreviewRemoveEl;
let inputEl;
let statusEl;
let statusTextEl;
let cancelBtnEl;
let responseWrapEl;
let responseEl;
let copyBtnEl;
let pasteBtnEl;
let closeBtnEl;
let modelBadgeEl;

let attachedScreenData = null;
let currentActiveApp = null;
let includeApp = true;
let isWorking = false;

export function initAiQuick() {
  quickViewEl = $('ai-input-view');
  appChipEl = $('ai-input-app-chip');
  chipLabelEl = $('ai-chip-label');
  chipRemoveEl = $('ai-chip-remove');
  attachBtnEl = $('ai-input-attach-btn');
  screenPreviewWrapEl = $('ai-screen-preview-wrap');
  screenPreviewImgEl = $('ai-screen-preview-img');
  screenPreviewRemoveEl = $('ai-screen-preview-remove');
  inputEl = $('ai-quick-input');
  statusEl = $('ai-input-status');
  statusTextEl = $('ai-status-text');
  cancelBtnEl = $('ai-cancel-btn');
  responseWrapEl = $('ai-input-response-wrap');
  responseEl = $('ai-input-response');
  copyBtnEl = $('ai-btn-copy');
  pasteBtnEl = $('ai-btn-paste');
  closeBtnEl = $('ai-input-close-btn');
  modelBadgeEl = $('ai-input-model-badge');

  if (!quickViewEl) return;

  // Escuchar apertura desde el proceso principal
  window.notch.aiQuick.onShow((data) => {
    state.aiQuickOpen = true;
    currentActiveApp = data?.activeApp || null;
    includeApp = Boolean(currentActiveApp && currentActiveApp.appName);

    updateModelBadge();

    if (includeApp && appChipEl) {
      appChipEl.hidden = false;
      if (chipLabelEl) chipLabelEl.textContent = `Viendo ${currentActiveApp.appName}`;
    } else if (appChipEl) {
      appChipEl.hidden = true;
    }

    // Limpiar estado de consulta anterior
    resetQueryUI();

    if (data?.prompt && inputEl) {
      inputEl.value = data.prompt;
    } else if (inputEl) {
      inputEl.value = '';
    }

    updateShape();
    setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }, 60);
  });

  // Escuchar cierre desde el proceso principal
  window.notch.aiQuick.onHide(() => {
    state.aiQuickOpen = false;
    resetQueryUI();
    updateShape();
  });

  // Botón cerrar (Esc)
  if (closeBtnEl) {
    closeBtnEl.addEventListener('click', () => {
      closeQuick();
    });
  }

  // Descartar chip de app activa
  if (chipRemoveEl) {
    chipRemoveEl.addEventListener('click', (e) => {
      e.stopPropagation();
      includeApp = false;
      if (appChipEl) appChipEl.hidden = true;
    });
  }

  // Adjuntar captura de pantalla
  if (attachBtnEl) {
    attachBtnEl.addEventListener('click', async () => {
      try {
        const dataUrl = await window.notch.aiQuick.captureScreen();
        if (dataUrl) {
          attachedScreenData = dataUrl;
          if (screenPreviewImgEl) screenPreviewImgEl.src = dataUrl;
          if (screenPreviewWrapEl) screenPreviewWrapEl.hidden = false;
        }
      } catch (err) {
        console.warn('[ai-quick] Error capturando pantalla:', err);
      }
    });
  }

  // Quitar captura
  if (screenPreviewRemoveEl) {
    screenPreviewRemoveEl.addEventListener('click', (e) => {
      e.stopPropagation();
      attachedScreenData = null;
      if (screenPreviewWrapEl) screenPreviewWrapEl.hidden = true;
    });
  }

  // Teclado en el input
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeQuick();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitQuery();
      }
    });
  }

  // Cancelar consulta en progreso
  if (cancelBtnEl) {
    cancelBtnEl.addEventListener('click', () => {
      window.notch.chat.cancel();
      finishWorking(true);
    });
  }

  // Botón copiar
  if (copyBtnEl) {
    copyBtnEl.addEventListener('click', () => {
      const text = responseEl ? (responseEl.textContent || '') : '';
      if (!text) return;
      navigator.clipboard.writeText(text);
      const span = copyBtnEl.querySelector('span');
      const orig = span ? span.textContent : '';
      if (span) span.textContent = '¡Copiado!';
      setTimeout(() => {
        if (span) span.textContent = orig;
      }, 1500);
    });
  }

  // Botón pegar en la app anterior
  if (pasteBtnEl) {
    pasteBtnEl.addEventListener('click', () => {
      const text = responseEl ? (responseEl.textContent || '') : '';
      window.notch.aiQuick.pasteToApp(text);
      state.aiQuickOpen = false;
      updateShape();
    });
  }

  // Escuchar streaming del chat
  window.notch.chat.onChange((msg) => {
    if (!state.aiQuickOpen) return;
    if (!msg || msg.role !== 'assistant') return;

    if (responseEl) responseEl.textContent = msg.text || '';
    if (responseWrapEl) responseWrapEl.hidden = false;

    const island = $('island');
    if (island) island.dataset.aiExpanded = 'true';

    if (msg.status === 'done') {
      finishWorking(false);
    } else if (msg.status === 'error') {
      finishWorking(false, msg.error || 'Error procesando solicitud');
    }
  });
}

function updateModelBadge() {
  if (!modelBadgeEl) return;
  const provider = state.settings.chatProvider || 'gemini';
  if (provider === 'claude') {
    modelBadgeEl.textContent = `Claude ${state.settings.claudeModel || 'Sonnet'}`;
  } else if (provider === 'both') {
    modelBadgeEl.textContent = 'Gemini + Claude';
  } else {
    modelBadgeEl.textContent = state.settings.geminiModel ? `Gemini (${state.settings.geminiModel})` : 'Gemini';
  }
}

function resetQueryUI() {
  attachedScreenData = null;
  if (screenPreviewWrapEl) screenPreviewWrapEl.hidden = true;
  if (statusEl) statusEl.hidden = true;
  if (responseWrapEl) responseWrapEl.hidden = true;
  if (responseEl) responseEl.textContent = '';
  const island = $('island');
  if (island) delete island.dataset.aiExpanded;
  isWorking = false;
  clearLight('aiWorking');
}

function closeQuick() {
  window.notch.aiQuick.close();
  state.aiQuickOpen = false;
  resetQueryUI();
  updateShape();
}

async function submitQuery() {
  let text = inputEl ? (inputEl.value || '').trim() : '';
  if (!text) return;

  if (includeApp && currentActiveApp && currentActiveApp.appName) {
    text = `[Contexto: usuario usando ${currentActiveApp.appName}${currentActiveApp.title ? ` - "${currentActiveApp.title}"` : ''}]\n${text}`;
  }

  isWorking = true;
  if (statusEl) statusEl.hidden = false;
  if (statusTextEl) statusTextEl.textContent = 'Trabajando…';
  triggerLight('aiWorking');

  try {
    const res = await window.notch.chat.send(text);
    if (!res || !res.ok) {
      finishWorking(false, 'No se pudo iniciar la consulta: ' + (res?.error || 'desconocido'));
    }
  } catch (err) {
    finishWorking(false, err.message);
  }
}

function finishWorking(cancelled = false, errorMessage = null) {
  isWorking = false;
  if (statusEl) statusEl.hidden = true;
  clearLight('aiWorking');

  if (cancelled) {
    if (responseEl && !responseEl.textContent) {
      if (responseWrapEl) responseWrapEl.hidden = true;
      const island = $('island');
      if (island) delete island.dataset.aiExpanded;
    }
  } else if (errorMessage) {
    if (responseEl) responseEl.textContent = `⚠️ ${errorMessage}`;
    if (responseWrapEl) responseWrapEl.hidden = false;
    const island = $('island');
    if (island) island.dataset.aiExpanded = 'true';
  } else {
    triggerLight('aiDone');
  }
}
