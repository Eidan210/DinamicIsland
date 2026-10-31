// =============================================================================
//  renderer/app.js — Lógica de la interfaz del notch
// -----------------------------------------------------------------------------
//  Este archivo corre dentro de la página (Chromium) SIN acceso a Node.
//  Todo lo que necesita del sistema se lo pide a main.js mediante
//  `window.notch`, la API que define preload.js.
// =============================================================================

'use strict';

// ---------- Elementos del HTML que vamos a usar ----------
const island = document.getElementById('island');
const eyes = document.querySelectorAll('.eye');
const dateEl = document.getElementById('date');
const clockMainEl = document.getElementById('clock-main');
const clockSecondsEl = document.getElementById('clock-seconds');
const greetingEl = document.getElementById('greeting');
const shortcutEls = document.querySelectorAll('[data-shortcut]');
const tabButtons = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');

// ---------- Estado ----------
// Valores por defecto; init() los reemplaza con los de config/settings.json.
let settings = { shortcut: 'Control+Alt+T', locale: 'es-ES', hour12: false };
let isExpanded = false;
let mouseInteractive = false; // ¿le hemos pedido a main que la ventana reciba clics?

// =============================================================================
// 1. Clics que atraviesan la ventana
// -----------------------------------------------------------------------------
// La ventana es mucho más grande que la píldora. Cuando el ratón NO está sobre
// la isla, main.js deja pasar los clics a las ventanas de abajo. Para eso le
// avisamos cada vez que el ratón entra o sale de la isla.
// =============================================================================

function setMouseInteractive(interactive) {
  if (interactive === mouseInteractive) return; // no mandamos mensajes repetidos
  mouseInteractive = interactive;
  window.notch.setMouseInteractive(interactive);
}

island.addEventListener('mouseenter', () => setMouseInteractive(true));
island.addEventListener('mouseleave', () => setMouseInteractive(false));

// Al terminar de abrirse/cerrarse, la isla pudo crecer o encoger bajo un cursor
// quieto: volvemos a comprobar si el ratón está encima.
island.addEventListener('transitionend', (event) => {
  if (event.target === island && event.propertyName === 'height') {
    setMouseInteractive(island.matches(':hover'));
  }
});

// =============================================================================
// 2. Abrir y cerrar
// -----------------------------------------------------------------------------
// Quien decide si el panel está abierto es main.js (porque el atajo global y el
// "clic fuera" ocurren allí). Nosotros solo pedimos cambios y animamos.
// =============================================================================

// Clic en la píldora cerrada → abrir.
island.addEventListener('click', () => {
  if (!isExpanded) window.notch.expand();
});

// Clic derecho → menú con "Salir de Notch".
island.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.notch.showContextMenu();
});

// Esc → cerrar.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isExpanded) window.notch.collapse();
});

// main.js nos avisa de cada cambio (atajo, Esc, clic fuera, clic en la píldora...).
window.notch.onExpandedChange((expanded) => {
  isExpanded = expanded;
  island.classList.toggle('is-expanded', expanded); // ← esto dispara la animación CSS

  if (expanded) {
    updateGreeting();
    startClock();
  } else {
    stopClock(); // con el panel cerrado el reloj no se ve: no gastamos nada
    // Quitamos el foco del botón que se pulsó, para que no quede marcado al reabrir.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
});

// =============================================================================
// 3. Fecha y hora en vivo
// -----------------------------------------------------------------------------
// Solo corre con el panel abierto. Se actualiza una vez por segundo, justo
// cuando cambia el segundo (así nunca va "atrasado" medio segundo).
// =============================================================================

let dateFormatter = null;
let timeFormatter = null;
let clockTimer = null;

/** Crea los formateadores de fecha/hora (una sola vez: crearlos es lo caro). */
function createFormatters() {
  const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: settings.hour12 };
  try {
    dateFormatter = new Intl.DateTimeFormat(settings.locale, dateOptions);
    timeFormatter = new Intl.DateTimeFormat(settings.locale, timeOptions);
  } catch {
    // Un "locale" mal escrito en settings.json (p. ej. "es_ES") lanza error.
    console.warn(`Idioma no válido en settings.json: "${settings.locale}". Uso es-ES.`);
    dateFormatter = new Intl.DateTimeFormat('es-ES', dateOptions);
    timeFormatter = new Intl.DateTimeFormat('es-ES', timeOptions);
  }
}

function renderClock() {
  const now = new Date();

  // "viernes, 31 de octubre" → "Viernes, 31 de octubre"
  const date = capitalize(dateFormatter.format(now));
  if (dateEl.textContent !== date) dateEl.textContent = date;

  // formatToParts separa horas, minutos, segundos y a. m./p. m. para poder
  // pintar los segundos más tenues que la hora.
  const parts = {};
  for (const part of timeFormatter.formatToParts(now)) parts[part.type] = part.value;

  clockMainEl.textContent = `${parts.hour}:${parts.minute}`;
  clockSecondsEl.textContent = `:${parts.second}` + (parts.dayPeriod ? ` ${parts.dayPeriod}` : '');
}

function startClock() {
  stopClock();
  const tick = () => {
    renderClock();
    // Esperamos justo hasta el siguiente cambio de segundo (1 vez por segundo).
    clockTimer = setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
}

function stopClock() {
  clearTimeout(clockTimer);
  clockTimer = null;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// =============================================================================
// 4. Pestañas (Home, Música, Focus, Claude)
// =============================================================================

function showTab(name) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === name;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  views.forEach((view) => {
    view.classList.toggle('is-active', view.dataset.view === name);
  });
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => showTab(button.dataset.tab));
});

// =============================================================================
// 5. Home: saludo según la hora
// =============================================================================

function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Buenas noches';
  if (hour >= 6 && hour < 12) greeting = 'Buenos días';
  else if (hour >= 12 && hour < 20) greeting = 'Buenas tardes';
  greetingEl.textContent = greeting;
}

/** "Control+Alt+T" → "Ctrl + Alt + T" (para mostrar el atajo en pantalla). */
function prettyShortcut(accelerator) {
  const names = { Control: 'Ctrl', CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl' };
  return accelerator
    .split('+')
    .map((key) => names[key] || key)
    .join(' + ');
}

// =============================================================================
// 6. Parpadeo de los ojos
// -----------------------------------------------------------------------------
// En lugar de una animación CSS infinita (que tendría a la GPU dibujando todo
// el rato), cada pocos segundos lanzamos UN parpadeo corto de 180 ms.
// =============================================================================

function blink() {
  // 1 de cada 5 veces, parpadeo doble: queda más natural.
  const times = Math.random() < 0.2 ? 2 : 1;
  eyes.forEach((eye) => {
    // Web Animations API: como un @keyframes de CSS, pero lanzado desde JS.
    eye.animate(
      [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }],
      { duration: 180, iterations: times, easing: 'ease-in-out' }
    );
  });
}

function scheduleBlink() {
  const delay = 2500 + Math.random() * 3500; // entre 2,5 y 6 segundos
  setTimeout(() => {
    blink();
    scheduleBlink();
  }, delay);
}

// =============================================================================
// 7. Arranque
// =============================================================================

async function init() {
  try {
    const saved = await window.notch.getSettings();
    if (saved) settings = { ...settings, ...saved };
  } catch (error) {
    console.warn('No se pudo leer la configuración, uso valores por defecto:', error);
  }

  createFormatters();
  shortcutEls.forEach((el) => {
    el.textContent = prettyShortcut(settings.shortcut);
  });
  scheduleBlink();
}

init();
