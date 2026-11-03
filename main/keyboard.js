// =============================================================================
//  main/keyboard.js — Gestión de eventos de teclado (Fase 11)
// -----------------------------------------------------------------------------
//  Recibe los eventos de Raw Input desde WinHelper:
//    • shift (down: true/false)
//    • caps-lock (active: true/false)
//    • copy, cut, paste
//    • right-ctrl-double-tap
// =============================================================================

'use strict';

const { onHelperMessage, sendToHelper } = require('./helper');
const { sendToRenderer } = require('./bridge');
const { toggleExpanded } = require('./window');

function initKeyboard() {
  onHelperMessage('keyboard', (message) => {
    if (!message || typeof message !== 'object') return;
    const { action } = message;

    // Doble Ctrl derecho (Fase 11 / Fase 14)
    if (action === 'right-ctrl-double-tap') {
      const { state } = require('./state');
      if (state.settings && state.settings.aiQuickReplyRightCtrl) {
        const aiQuick = require('./ai-quick');
        aiQuick.handleRightCtrlDoubleTap();
      } else {
        toggleExpanded();
      }
    }

    // Reenviar a la interfaz
    sendToRenderer('keyboard:event', message);
  });
}

function setKeyboardEnabled(enabled) {
  sendToHelper(enabled ? 'keyboard on' : 'keyboard off');
}

module.exports = { initKeyboard, setKeyboardEnabled };
