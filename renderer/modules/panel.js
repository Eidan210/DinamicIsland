// =============================================================================
//  renderer/modules/panel.js — Abrir y cerrar el panel
// -----------------------------------------------------------------------------
//  Quien decide si el panel está abierto es main.js (porque el atajo global y
//  el "clic fuera" ocurren allí). Nosotros pedimos cambios (clic, Esc) y, cuando
//  main.js avisa, actualizamos la isla y avisamos a los módulos suscritos con
//  onPanelChange (el reloj, el Pomodoro, la música...).
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';
import { getActivity, handlePanelToggle, updateShape } from './island.js';
import { showTab, showTabByOffset, moveTabIndicator } from './tabs.js';
import { popEyes } from './eyes.js';

const island = $('island');
const panelListeners = [];

/** Avisa a `listener(abierto)` cada vez que el panel se abre o se cierra. */
export function onPanelChange(listener) {
  panelListeners.push(listener);
}

/** main.js nos avisa de cada cambio (atajo, Esc, clic fuera, clic en la isla...). */
function onExpandedChange(expanded) {
  state.isExpanded = expanded;
  handlePanelToggle(expanded);

  if (expanded) {
    moveTabIndicator(false);
    popEyes();
  } else if (document.activeElement instanceof HTMLElement) {
    // Quitamos el foco del botón pulsado, para que no quede marcado al reabrir.
    document.activeElement.blur();
  }

  panelListeners.forEach((listener) => listener(expanded));
  updateShape(); // ← la isla crece hasta ser el panel (o vuelve a su forma)
}

export function initPanel() {
  // Clic en la isla → abrir. Si muestra una actividad, se abre en su pestaña.
  island.addEventListener('click', () => {
    if (state.isExpanded) return;
    const activity = getActivity();
    if (state.shape === 'banner' || (state.shape === 'activity' && activity === 'music')) showTab('music');
    else if (state.shape === 'activity' && activity === 'pomodoro') showTab('focus');
    window.notch.expand();
  });

  // Clic derecho → menú con Pomodoro, música y "Salir de Notch".
  island.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.notch.showContextMenu();
  });

  // Teclado (solo con el panel abierto): Esc cierra, ← → cambian de pestaña.
  document.addEventListener('keydown', (event) => {
    if (!state.isExpanded) return;
    if (event.key === 'Escape') window.notch.collapse();
    else if (event.key === 'ArrowRight') showTabByOffset(1);
    else if (event.key === 'ArrowLeft') showTabByOffset(-1);
  });

  window.notch.onExpandedChange(onExpandedChange);
}
