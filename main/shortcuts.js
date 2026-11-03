// =============================================================================
//  main/shortcuts.js — Atajos de teclado globales
// -----------------------------------------------------------------------------
//  Funcionan aunque estés en otra app (todos se cambian en settings.json):
//    • "shortcut"       abre/cierra el panel (Ctrl+Alt+T por defecto).
//    • "pageShortcuts"  uno por página: Ctrl+Alt+1 Home, 2 Música, 3 IA,
//                       4 Focus, 5 Portapapeles y 6 Nota. Si esa página ya se
//                       ve, el mismo atajo cierra el panel.
//  Con teclado latinoamericano (Colombia), AltGr equivale a Ctrl+Alt, pero
//  AltGr + número no escribe ningún símbolo: por eso estos atajos no molestan.
// =============================================================================

'use strict';

const { globalShortcut } = require('electron');
const { PAGES, state } = require('./state');
const notchWindow = require('./window');
const { addNotice, clearNotice } = require('./notices');

/** "Control+Alt+3" → "Ctrl+Alt+3" (más corto para los avisos). */
function prettyAccelerator(accelerator) {
  return accelerator.replace(/\b(CommandOrControl|CmdOrCtrl|Control)\b/gi, 'Ctrl');
}

/** Intenta registrar un atajo. Devuelve true si lo consiguió. */
function tryRegister(accelerator, action) {
  try {
    return globalShortcut.register(accelerator, action);
  } catch (error) {
    // Pasa si el texto no es un atajo válido, p. ej. "Ctrl+Alt+" (falta la tecla).
    console.error(`[atajo] "${accelerator}" no es un atajo válido: ${error.message}`);
    return false;
  }
}

/** Registra (o vuelve a registrar, si cambió settings.json) todos los atajos globales. */
function registerShortcuts() {
  globalShortcut.unregisterAll();
  const failed = [];

  if (!tryRegister(state.settings.shortcut, notchWindow.toggleExpanded)) failed.push(state.settings.shortcut);

  // Fase 14: Atajo global de IA rápida
  if (state.settings.aiShortcut) {
    const aiQuick = require('./ai-quick');
    let ok = tryRegister(state.settings.aiShortcut, () => aiQuick.toggleAiQuick());
    if (!ok) {
      const alt = state.settings.aiShortcut === 'Control+Alt+Space' ? 'Control+Alt+I' : 'Control+Alt+Space';
      if (tryRegister(alt, () => aiQuick.toggleAiQuick())) {
        console.log(`[atajo] ${state.settings.aiShortcut} estaba ocupado por otra app; usando ${alt} como alternativa.`);
        ok = true;
      }
    }
    if (!ok) failed.push(state.settings.aiShortcut);
  }

  for (const page of PAGES) {
    const accelerator = state.settings.pageShortcuts[page];
    if (!accelerator) continue; // "" = esta página no tiene atajo
    if (!tryRegister(accelerator, () => notchWindow.togglePage(page))) failed.push(accelerator);
  }

  if (failed.length === 0) {
    clearNotice('shortcuts'); // si había un aviso de atajos, ya está resuelto
    return;
  }

  // Si falla, suele ser porque otra app ya usa ese atajo (Windows no deja que
  // dos apps tengan el mismo) o porque está repetido en settings.json.
  const list = failed.map(prettyAccelerator).join(', ');
  console.warn(`[atajo] No se pudieron registrar: ${list}. ¿Los usa otra app o están repetidos? Cámbialos en config/settings.json.`);
  addNotice({
    key: 'shortcuts',
    kind: 'keyboard',
    tone: 'warning',
    title: failed.length === 1 ? 'Un atajo no funciona' : `${failed.length} atajos no funcionan`,
    text: `${list}: los usa otra app o están repetidos. Cámbialos en settings.json.`,
    alert: true,
  });
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterShortcuts };
