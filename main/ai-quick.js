// =============================================================================
//  main/ai-quick.js — IA rápida estilo Sentient OS (Fase 14)
// -----------------------------------------------------------------------------
//  Permite invocar la IA en una caja de comandos flotante desde cualquier app
//  usando un atajo global (Control+Alt+Space por defecto) o doble Ctrl derecho.
//  Incluye soporte opcional para chip de ventana previa y pegado directo.
// =============================================================================

'use strict';

const { clipboard, desktopCapturer } = require('electron');
const { state } = require('./state');
const { sendToRenderer } = require('./bridge');
const { sendToHelper, onHelperMessage } = require('./helper');

let activeApp = { appName: '', rawName: '', title: '' };

function initAiQuick() {
  // Escuchamos el reporte de la ventana en primer plano desde WinHelper
  onHelperMessage('foreground', (msg) => {
    if (msg && typeof msg === 'object') {
      activeApp = {
        appName: msg.appName || '',
        rawName: msg.rawName || '',
        title: msg.title || '',
      };
      if (state.settings && state.settings.aiActiveAppChip) {
        sendToRenderer('ai:active-app', activeApp);
      }
    }
  });

  // Habilitar seguimiento de primer plano si la configuración lo requiere
  if (state.settings && state.settings.aiActiveAppChip) {
    sendToHelper('foreground on');
  }
}

/** Abre la caja de comandos de IA rápida en la muesca. */
function openAiQuick(data = {}) {
  const { win } = state;
  if (!win || win.isDestroyed()) return;

  state.aiQuickOpen = true;

  if (state.settings && state.settings.aiActiveAppChip) {
    sendToHelper('get-foreground');
  }

  win.setIgnoreMouseEvents(false);
  win.focus();

  sendToRenderer('ai:quick-show', {
    prompt: data.prompt || '',
    quoted: data.quoted || '',
    activeApp: (state.settings && state.settings.aiActiveAppChip) ? activeApp : null,
  });
}

/** Cierra la caja de comandos y devuelve el foco si corresponde. */
function closeAiQuick(options = { restoreFocus: true }) {
  const { win } = state;
  if (!win || win.isDestroyed()) return;

  state.aiQuickOpen = false;
  sendToRenderer('ai:quick-hide');

  if (!state.isExpanded) {
    win.setIgnoreMouseEvents(true, { forward: true });
    if (options.restoreFocus) {
      const { giveFocusBack } = require('./window');
      giveFocusBack();
    }
  }
}

/** Alterna apertura / cierre de la caja de comandos de IA. */
function toggleAiQuick() {
  if (state.aiQuickOpen) {
    closeAiQuick();
  } else {
    openAiQuick();
  }
}

/** Flujo de respuesta rápida con doble Ctrl derecho. */
function handleRightCtrlDoubleTap() {
  try {
    const originalText = clipboard.readText();
    sendToHelper('copy-selection');

    setTimeout(() => {
      let selectedText = '';
      try {
        selectedText = clipboard.readText();
      } catch {}

      // Restauramos de inmediato el portapapeles original para no ensuciar el historial
      try {
        clipboard.writeText(originalText);
      } catch {}

      const hasSelection = Boolean(
        selectedText &&
        selectedText.trim() &&
        selectedText.trim() !== originalText.trim()
      );

      const prompt = hasSelection
        ? `Redacta una respuesta breve y natural, en el mismo idioma, a este mensaje. Responde solo con el texto de la respuesta.\n\n> ${selectedText.trim()}`
        : '';

      openAiQuick({
        prompt,
        quoted: hasSelection ? selectedText.trim() : '',
      });
    }, 90);
  } catch (error) {
    console.error('[ai-quick] Error en doble Ctrl derecho:', error);
    openAiQuick();
  }
}

/** Captura una miniatura de la pantalla principal reducida a 1280 px. */
async function captureScreen() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 },
    });
    if (!sources || sources.length === 0) return null;
    return sources[0].thumbnail.toDataURL();
  } catch (err) {
    console.error('[ai-quick] Error capturando pantalla:', err);
    return null;
  }
}

/** Copia la respuesta y pide a WinHelper que restaure el foco y pulse Ctrl+V. */
function pasteToApp(text) {
  if (typeof text === 'string' && text) {
    clipboard.writeText(text);
  }
  closeAiQuick({ restoreFocus: false });
  setTimeout(() => {
    sendToHelper('paste-to-app');
  }, 100);
}

module.exports = {
  initAiQuick,
  openAiQuick,
  closeAiQuick,
  toggleAiQuick,
  handleRightCtrlDoubleTap,
  captureScreen,
  pasteToApp,
  getActiveApp: () => activeApp,
};
