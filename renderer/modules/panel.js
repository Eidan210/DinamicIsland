// =============================================================================
//  renderer/modules/panel.js — Abrir y cerrar el panel
// -----------------------------------------------------------------------------
//  Quien decide si el panel está abierto es main.js (porque los atajos
//  globales y el "clic fuera" ocurren allí). Nosotros pedimos cambios (clic,
//  Esc) y, cuando main.js avisa, actualizamos la isla y avisamos a los módulos
//  suscritos con onPanelChange (el reloj, el Pomodoro, la música, la nota...).
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';
import { getActivity, handlePanelToggle, updateShape } from './island.js';
import { showTab, showTabByOffset, moveTabIndicator } from './tabs.js';
import { popEyes } from './eyes.js';

const stage = $('stage');
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

/** ¿Estás escribiendo en un cuadro de texto? (entonces las flechas son tuyas) */
function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('textarea, input, select'));
}

export function initPanel() {
  // Clic en la isla → abrir. Si muestra una actividad, se abre en su página.
  island.addEventListener('click', () => {
    if (state.isExpanded) return;
    const activity = getActivity();
    if (state.shape === 'banner' || (state.shape === 'activity' && activity === 'music')) showTab('music');
    else if (state.shape === 'activity' && activity === 'pomodoro') showTab('focus');
    window.notch.expand();
  });

  // Clic en una burbuja → abrir en la página de esa actividad.
  document.querySelectorAll('.bubble').forEach((bubble) => {
    bubble.addEventListener('click', () => {
      if (state.isExpanded) return;
      showTab(bubble.dataset.goto);
      window.notch.expand();
    });
  });

  // Clic derecho (en la isla o en una burbuja) → menú con Pomodoro, música y
  // "Salir de Notch". En la nota no: ahí sale el de Cortar/Copiar/Pegar (main/window.js).
  stage.addEventListener('contextmenu', (event) => {
    if (isTyping(event.target)) return;
    event.preventDefault();
    window.notch.showContextMenu();
  });

  // Teclado (solo con el panel abierto): Esc cierra, ← → cambian de página.
  // Si otro módulo ya usó la tecla (p. ej. Esc cierra antes la lista de
  // avisos), lo marca con preventDefault y aquí no hacemos nada.
  document.addEventListener('keydown', (event) => {
    if (!state.isExpanded || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      window.notch.collapse();
      return;
    }
    if (isTyping(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowRight') showTabByOffset(1);
    else if (event.key === 'ArrowLeft') showTabByOffset(-1);
  });

  window.notch.onExpandedChange(onExpandedChange);
}
