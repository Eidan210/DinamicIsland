// =============================================================================
//  renderer/modules/tabs.js — Las páginas del panel
// -----------------------------------------------------------------------------
//  Home, Música, IA, Focus, Portapapeles y Nota (Ctrl+Alt+1…6).
//  El fondo de la pestaña activa se desliza de una a otra, y las vistas se
//  cruzan con un fundido suave (la vieja sale, la nueva entra con un leve zoom).
//  Cada cambio se le cuenta a main.js: así sabe que, si pulsas el atajo de la
//  página que ya se ve, debe cerrar el panel.
// =============================================================================

import { $, animate, cssEasing, prettyAccelerator, getMotionScale } from './utils.js';
import { state } from './state.js';

// ⚠️ Mismos nombres y orden que PAGES en main/state.js y que index.html.
const TAB_ORDER = ['home', 'music', 'ai', 'focus', 'clipboard', 'note'];
const TAB_NAMES = { home: 'Home', music: 'Música', ai: 'IA', focus: 'Focus', clipboard: 'Portapapeles', note: 'Nota' };

const panelEl = document.querySelector('.panel');
const tabbar = $('tabbar');
const tabIndicator = $('tab-indicator');
const tabButtons = document.querySelectorAll('.tab');
const tabListeners = [];

let currentTab = 'home';

function getView(name) {
  return document.querySelector(`.view[data-view="${name}"]`);
}

/** La página que se ve ahora. */
export function getCurrentTab() {
  return currentTab;
}

/** Avisa a `listener(nueva, anterior)` cada vez que cambia la página. */
export function syncTallState() {
  const isChat = getCurrentTab() === 'ai' && document.getElementById('ai')?.dataset.mode === 'chat';
  const island = document.getElementById('island');
  const panel = document.querySelector('.panel');
  if (island) island.dataset.tall = String(isChat);
  if (panel) panel.dataset.tall = String(isChat);
}

export function onTabChange(listener) {
  tabListeners.push(listener);
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
  panelEl.dataset.tab = name; // p. ej. la página Música pinta el fondo con la carátula
  window.notch.setCurrentTab(name);
  const oldView = getView(previousTab);
  const newView = getView(name);
  oldView.classList.remove('is-active');
  newView.classList.add('is-active');
  syncTallState();

  if (state.isExpanded) {
    // Cambio de página tipo Dynamic Island (~400 ms en total), con un leve zoom y un
    // deslizamiento corto en vertical, sin movimiento lateral brusco.
    // Sale la vieja (140 ms, --ease-in) y SOLO cuando termina entra la nueva (260 ms,
    // --ease-out): si se solapan, los textos de las dos páginas se pisan y se ve sucio.
    const scale = getMotionScale();
    const exitDuration = Math.round(140 * scale);
    const enterDuration = Math.round(260 * scale);
    const enterDelay = exitDuration;

    // Si cambias de página muy rápido, se corta lo anterior en vez de apilar animaciones.
    oldView.getAnimations().forEach((a) => a.cancel());
    newView.getAnimations().forEach((a) => a.cancel());

    animate(
      newView,
      [
        { opacity: 0, transform: 'translateY(6px) scale(0.97)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      {
        duration: enterDuration,
        delay: enterDelay,
        easing: cssEasing('--ease-out'),
        // 'backwards': durante el retraso la página nueva sigue invisible.
        // Sin esto se pintaba completa 80 ms y luego "saltaba" a 0: el parpadeo brusco.
        fill: 'backwards',
      }
    );
    animate(
      oldView,
      [
        // visibility: 'visible' mantiene la vista vieja a la vista mientras se va
        { opacity: 1, transform: 'translateY(0) scale(1)', visibility: 'visible' },
        { opacity: 0, transform: 'translateY(-4px) scale(0.985)', visibility: 'visible' },
      ],
      { duration: exitDuration, easing: cssEasing('--ease-in') }
    );
  }

  tabListeners.forEach((listener) => listener(name, previousTab));
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

/** Al pasar el ratón por una pestaña se ve su atajo: "Música · Ctrl+Alt+2". */
export function applyTabShortcuts() {
  const shortcuts = state.settings.pageShortcuts || {};
  tabButtons.forEach((button) => {
    const name = TAB_NAMES[button.dataset.tab];
    const accelerator = shortcuts[button.dataset.tab];
    button.title = accelerator ? `${name} · ${prettyAccelerator(accelerator)}` : name;
  });
}

/**
 * Muestra u oculta un badge de contador sobre una pestaña (ej. pestaña IA con «1»).
 * @param {string} tabName
 * @param {number} count
 * @param {string} [tone]
 */
export function setTabBadge(tabName, count, tone = 'warning') {
  const button = tabbar.querySelector(`.tab[data-tab="${tabName}"]`);
  if (!button) return;
  let badge = button.querySelector('.tab-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'tab-badge';
    button.append(badge);
  }
  const num = Number(count) || 0;
  if (num > 0) {
    badge.textContent = String(num);
    badge.dataset.tone = tone;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
  if (button.classList.contains('is-active')) {
    moveTabIndicator(false);
  }
}

export function initTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });

  // main.js puede pedir una página (atajos Ctrl+Alt+1…6, la notificación del Pomodoro...).
  window.notch.onShowTab((name) => showTab(name));

  // Si la página se recarga, empieza en Home: se lo decimos a main.js.
  panelEl.dataset.tab = currentTab;
  window.notch.setCurrentTab(currentTab);
}
