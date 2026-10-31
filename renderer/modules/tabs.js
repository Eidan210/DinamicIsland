// =============================================================================
//  renderer/modules/tabs.js — Pestañas (Home, Música, Focus, Claude)
// -----------------------------------------------------------------------------
//  El fondo de la pestaña activa se desliza de una a otra, y la vista nueva
//  entra por el lado hacia el que avanzas (como pasar páginas).
// =============================================================================

import { $, animate, SPRING } from './utils.js';
import { state } from './state.js';

const TAB_ORDER = ['home', 'music', 'focus', 'claude'];
const tabbar = $('tabbar');
const tabIndicator = $('tab-indicator');
const tabButtons = document.querySelectorAll('.tab');

let currentTab = 'home';

function getView(name) {
  return document.querySelector(`.view[data-view="${name}"]`);
}

export function showTab(name) {
  if (!TAB_ORDER.includes(name)) return;

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === name;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  moveTabIndicator(state.isExpanded);
  if (name === currentTab) return;

  const previousTab = currentTab;
  currentTab = name;
  const oldView = getView(previousTab);
  const newView = getView(name);
  oldView.classList.remove('is-active');
  newView.classList.add('is-active');
  if (!state.isExpanded) return; // con el panel cerrado no hace falta animar

  // La vista nueva entra por el lado hacia el que avanzas y la vieja sale por
  // el contrario (como pasar páginas).
  const direction = TAB_ORDER.indexOf(name) > TAB_ORDER.indexOf(previousTab) ? 1 : -1;
  animate(
    newView,
    [
      { opacity: 0, transform: `translateX(${30 * direction}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ],
    { duration: 420, easing: SPRING }
  );
  animate(
    oldView,
    [
      // visibility: 'visible' mantiene la vista vieja a la vista mientras se va
      { opacity: 1, transform: 'translateX(0)', visibility: 'visible' },
      { opacity: 0, transform: `translateX(${-30 * direction}px)`, visibility: 'visible' },
    ],
    { duration: 200, easing: 'ease-in' }
  );
}

/** Pestaña siguiente (+1) o anterior (-1), dando la vuelta al llegar al final. */
export function showTabByOffset(offset) {
  const index = (TAB_ORDER.indexOf(currentTab) + offset + TAB_ORDER.length) % TAB_ORDER.length;
  showTab(TAB_ORDER[index]);
}

/** Coloca el fondo deslizante debajo de la pestaña activa. */
export function moveTabIndicator(withAnimation) {
  const activeButton = tabbar.querySelector('.tab.is-active');
  if (!activeButton) return;
  tabIndicator.classList.toggle('no-animation', !withAnimation);
  tabIndicator.style.setProperty('--indicator-x', `${activeButton.offsetLeft}px`);
  tabIndicator.style.setProperty('--indicator-width', `${activeButton.offsetWidth}px`);
}

export function initTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });

  // Las tarjetas de Home llevan a su pestaña.
  document.querySelectorAll('.card[data-goto]').forEach((card) => {
    card.addEventListener('click', () => showTab(card.dataset.goto));
  });

  // main.js puede pedir una pestaña (p. ej. al pulsar la notificación del Pomodoro).
  window.notch.onShowTab((name) => showTab(name));
}
