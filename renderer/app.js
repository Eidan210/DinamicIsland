// =============================================================================
//  renderer/app.js — Lógica de la interfaz del notch
// -----------------------------------------------------------------------------
//  Este archivo corre dentro de la página (Chromium) SIN acceso a Node.
//  Todo lo que necesita del sistema se lo pide a main.js mediante
//  `window.notch`, la API que define preload.js.
//
//  ÍNDICE
//    0. Utilidades
//    1. Elementos y estado
//    2. Clics que atraviesan la ventana
//    3. Auto-ocultar: aparecer al acercar el ratón, esconderse al alejarlo
//    4. Abrir y cerrar el panel
//    5. Reloj
//    6. Pestañas (indicador deslizante y transición entre vistas)
//    7. Ojos (parpadeo, mirar alrededor, seguir al ratón y emociones)
//    8. Pomodoro
//    9. Links
//   10. Arranque
// =============================================================================

'use strict';

// =============================================================================
// 0. Utilidades
// =============================================================================

// Curvas de animación (las mismas que en styles.css).
const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SPRING_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

// Si en Windows desactivas "Efectos de animación", respetamos esa preferencia.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Lanza una animación con la Web Animations API (como un @keyframes de CSS,
 * pero desde JS). No hace nada si las animaciones están desactivadas.
 * @returns {Animation | null}
 */
function animate(element, keyframes, options) {
  if (!element || reducedMotion.matches) return null;
  return element.animate(keyframes, options);
}

/** Cambia el texto solo si es distinto (cada cambio obliga a redibujar). */
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

/** 1499000 ms → "24:59" */
function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** plural(1, 'sesión', 'sesiones') → "1 sesión" */
function plural(count, singular, pluralWord) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// =============================================================================
// 1. Elementos del HTML y estado
// =============================================================================

const $ = (id) => document.getElementById(id);

const island = $('island');
const faceEl = $('face');
const eyesEl = $('eyes');
const eyeEls = document.querySelectorAll('.eye');

const dateEl = $('date');
const clockMainEl = $('clock-main');
const clockSecondsEl = $('clock-seconds');

const tabbar = $('tabbar');
const tabIndicator = $('tab-indicator');
const tabButtons = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');

// Pomodoro: pestaña Focus...
const pomodoroEl = $('pomodoro');
const pomoRingWrap = $('pomo-ring-wrap');
const pomoProgress = $('pomo-progress');
const pomoTime = $('pomo-time');
const pomoLabel = $('pomo-label');
const pomoMinutes = $('pomo-minutes');
const pomoMinus = $('pomo-minus');
const pomoPlus = $('pomo-plus');
const pomoToggle = $('pomo-toggle');
const pomoToggleText = $('pomo-toggle-text');
const pomoReset = $('pomo-reset');
const pomoCount = $('pomo-count');
// ...tarjeta de Home...
const homePomoProgress = $('home-pomo-progress');
const homePomoTime = $('home-pomo-time');
const homePomoLabel = $('home-pomo-label');
const homePomoToggle = $('home-pomo-toggle');
// ...y la píldora.
const activityEl = $('activity');
const activityProgress = $('activity-progress');
const activityText = $('activity-text');

// Links
const linksGrid = $('links-grid');
const linksEmpty = $('links-empty');
const homeLinks = $('home-links');
const homeLinksEmpty = $('home-links-empty');

// Estado. init() lo rellena con lo que diga main.js.
let settings = {
  shortcut: 'Control+Alt+T',
  locale: 'es-ES',
  hour12: false,
  autoHide: true,
  revealOnHover: true,
  pomodoroMinutes: 25,
};
let isExpanded = false; // ¿el panel está abierto?
let mouseInteractive = false; // ¿le hemos pedido a main que la ventana reciba clics?
let pointerInside = false; // ¿el ratón está dentro de la zona de la ventana?
let lastPointer = { x: 0, y: 0 }; // última posición conocida del ratón

// =============================================================================
// 2. Clics que atraviesan la ventana
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

island.addEventListener('mouseenter', () => {
  setMouseInteractive(true);
  cancelHide();
});
island.addEventListener('mouseleave', () => setMouseInteractive(false));

// Cuando la isla termina de crecer, encoger, aparecer o esconderse, puede que
// el cursor (quieto) haya quedado dentro o fuera: lo comprobamos de nuevo.
island.addEventListener('transitionend', (event) => {
  if (event.target !== island) return;
  if (['height', 'width', 'translate'].includes(event.propertyName)) {
    setMouseInteractive(island.matches(':hover'));
  }
});

// =============================================================================
// 3. Auto-ocultar
// -----------------------------------------------------------------------------
// Con "autoHide" el notch está escondido por encima del borde de la pantalla
// (así no tapa las pestañas del navegador). Aparece:
//   • al dejar el ratón en el borde de arriba, en el centro (zona caliente),
//   • con el atajo (abre el panel directamente),
//   • un momento al arrancar y cuando termina un Pomodoro.
// Se esconde sola cuando el ratón se aleja.
// =============================================================================

const HOT_ZONE_HEIGHT = 3; // px desde el borde de arriba de la pantalla
const HOT_ZONE_HALF_WIDTH = 130; // px a cada lado del centro
const NEAR_DISTANCE = 28; // px alrededor de la píldora que cuentan como "cerca"
const REVEAL_DELAY = 180; // ms con el ratón en la zona caliente para que aparezca
const HIDE_DELAY = 700; // ms que espera antes de esconderse cuando te alejas

let isShown = false; // ¿la píldora está a la vista?
let revealTimer = null;
let hideTimer = null;
let keepVisibleUntil = 0; // no esconder antes de este momento (saludo, avisos...)

function canAutoHide() {
  return settings.autoHide && !isExpanded;
}

function showIsland() {
  cancelHide();
  if (isShown) return;
  isShown = true;
  island.classList.remove('is-hidden'); // ← CSS: baja con un pequeño rebote
  // Al aparecer, los ojos miran hacia donde está el ratón (o al frente).
  if (pointerInside) lookAt(lastPointer.x, lastPointer.y);
  else resetLook();
  wakeEyes();
  updatePomodoroTicker();
}

function hideIsland() {
  hideTimer = null;
  if (!isShown || !canAutoHide() || mouseInteractive) return;
  const waitMore = keepVisibleUntil - Date.now();
  if (waitMore > 0) {
    scheduleHide(waitMore);
    return;
  }
  isShown = false;
  island.classList.add('is-hidden'); // ← CSS: coge impulso y sube
  updatePomodoroTicker();
}

function scheduleHide(delay = HIDE_DELAY) {
  if (!canAutoHide()) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideIsland, delay);
}

function cancelHide() {
  clearTimeout(hideTimer);
  hideTimer = null;
}

function cancelReveal() {
  clearTimeout(revealTimer);
  revealTimer = null;
}

/** Muestra la píldora durante `ms` milisegundos (o más, si le pones el ratón encima). */
function peekFor(ms) {
  keepVisibleUntil = Date.now() + ms;
  showIsland();
  scheduleHide(ms);
}

/** ¿Está el ratón en el borde de arriba, en el centro? */
function isInHotZone(x, y) {
  return y <= HOT_ZONE_HEIGHT && Math.abs(x - window.innerWidth / 2) <= HOT_ZONE_HALF_WIDTH;
}

/** ¿Está el ratón encima de la píldora o muy cerca? */
function isNearIsland(x, y) {
  const rect = island.getBoundingClientRect();
  return x >= rect.left - NEAR_DISTANCE && x <= rect.right + NEAR_DISTANCE && y <= rect.bottom + NEAR_DISTANCE;
}

// Solo recibimos movimientos cuando el ratón pasa por la zona de la ventana
// (820x318 px arriba en el centro); el resto de la pantalla no nos llega.
document.addEventListener('mousemove', (event) => {
  pointerInside = true;
  const x = event.clientX;
  const y = event.clientY;
  lastPointer = { x, y };
  if (isShown || isExpanded) lookAt(x, y);
  if (!canAutoHide()) return;

  if (!isShown) {
    // Escondida: si el ratón se queda un instante en la zona caliente, aparece.
    if (settings.revealOnHover && isInHotZone(x, y)) {
      if (!revealTimer) {
        revealTimer = setTimeout(() => {
          revealTimer = null;
          showIsland();
        }, REVEAL_DELAY);
      }
    } else {
      cancelReveal();
    }
  } else if (isInHotZone(x, y) || isNearIsland(x, y)) {
    cancelHide(); // sigues cerca: que no se vaya
  } else if (!hideTimer) {
    scheduleHide(); // te alejaste: se esconde en un momento
  }
});

// El ratón salió de la ventana entera (relatedTarget vacío = fuera de la página).
document.addEventListener('mouseout', (event) => {
  if (event.relatedTarget) return;
  pointerInside = false;
  cancelReveal();
  resetLook();
  if (isShown) scheduleHide();
});

// =============================================================================
// 4. Abrir y cerrar el panel
// -----------------------------------------------------------------------------
// Quien decide si el panel está abierto es main.js (porque el atajo global y el
// "clic fuera" ocurren allí). Nosotros solo pedimos cambios y animamos.
// =============================================================================

// Clic en la píldora → abrir.
island.addEventListener('click', () => {
  if (!isExpanded) window.notch.expand();
});

// Clic derecho → menú con Pomodoro y "Salir de Notch".
island.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.notch.showContextMenu();
});

// Teclado (solo con el panel abierto): Esc cierra, ← → cambian de pestaña.
document.addEventListener('keydown', (event) => {
  if (!isExpanded) return;
  if (event.key === 'Escape') window.notch.collapse();
  else if (event.key === 'ArrowRight') showTabByOffset(1);
  else if (event.key === 'ArrowLeft') showTabByOffset(-1);
});

// main.js nos avisa de cada cambio (atajo, Esc, clic fuera, clic en la píldora...).
window.notch.onExpandedChange((expanded) => {
  isExpanded = expanded;
  cancelReveal();
  island.classList.toggle('is-expanded', expanded); // ← esto dispara la animación CSS

  if (expanded) {
    cancelHide();
    isShown = true;
    island.classList.remove('is-hidden'); // si estaba escondida, baja y crece a la vez
    moveTabIndicator(false);
    renderPomodoro();
    startClock();
    popEyes();
  } else {
    stopClock(); // con el panel cerrado el reloj no se ve: no gastamos nada
    // Quitamos el foco del botón pulsado, para que no quede marcado al reabrir.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    // Con auto-ocultar, la píldora se esconde después de encogerse
    // (si el ratón sigue cerca, espera a que te alejes).
    scheduleHide(pointerInside ? HIDE_DELAY : 250);
  }
  updateActivity();
  updatePomodoroTicker();
});

// =============================================================================
// 5. Fecha y hora en vivo
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

  // "sábado, 31 de octubre" → "Sábado, 31 de octubre"
  setText(dateEl, capitalize(dateFormatter.format(now)));

  // formatToParts separa horas, minutos, segundos y a. m./p. m. para poder
  // pintar los segundos más tenues que la hora.
  const parts = {};
  for (const part of timeFormatter.formatToParts(now)) parts[part.type] = part.value;

  setText(clockMainEl, `${parts.hour}:${parts.minute}`);
  setText(clockSecondsEl, `:${parts.second}` + (parts.dayPeriod ? ` ${parts.dayPeriod}` : ''));
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

// =============================================================================
// 6. Pestañas (Home, Música, Focus, Claude)
// =============================================================================

const TAB_ORDER = ['home', 'music', 'focus', 'claude'];
let currentTab = 'home';

function getView(name) {
  return document.querySelector(`.view[data-view="${name}"]`);
}

function showTab(name) {
  if (!TAB_ORDER.includes(name)) return;

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === name;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  moveTabIndicator(true);
  if (name === currentTab) return;

  const previousTab = currentTab;
  currentTab = name;
  const oldView = getView(previousTab);
  const newView = getView(name);
  oldView.classList.remove('is-active');
  newView.classList.add('is-active');

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
function showTabByOffset(offset) {
  const index = (TAB_ORDER.indexOf(currentTab) + offset + TAB_ORDER.length) % TAB_ORDER.length;
  showTab(TAB_ORDER[index]);
}

/** Coloca el fondo deslizante debajo de la pestaña activa. */
function moveTabIndicator(withAnimation) {
  const activeButton = tabbar.querySelector('.tab.is-active');
  if (!activeButton) return;
  tabIndicator.classList.toggle('no-animation', !withAnimation);
  tabIndicator.style.setProperty('--indicator-x', `${activeButton.offsetLeft}px`);
  tabIndicator.style.setProperty('--indicator-width', `${activeButton.offsetWidth}px`);
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => showTab(button.dataset.tab));
});

// Las tarjetas de Home llevan a su pestaña.
document.querySelectorAll('.card[data-goto]').forEach((card) => {
  card.addEventListener('click', () => showTab(card.dataset.goto));
});

// =============================================================================
// 7. Ojos
// -----------------------------------------------------------------------------
// Todo son animaciones cortas lanzadas de vez en cuando: nada se anima en
// bucle infinito (eso tendría a la GPU dibujando todo el rato).
// =============================================================================

/** Un parpadeo (a veces doble). */
function blink() {
  const times = Math.random() < 0.2 ? 2 : 1;
  eyeEls.forEach((eye) => {
    animate(eye, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }], {
      duration: 180,
      iterations: times,
      easing: 'ease-in-out',
    });
  });
}

function scheduleBlink() {
  const delay = 2500 + Math.random() * 3500; // entre 2,5 y 6 segundos
  setTimeout(() => {
    if (isShown || isExpanded) blink(); // escondida no hace falta parpadear
    scheduleBlink();
  }, delay);
}

/** Al aparecer, los ojos se abren como si el notch se despertara. */
function wakeEyes() {
  eyeEls.forEach((eye) => {
    animate(
      eye,
      [{ transform: 'scaleY(0.1)' }, { transform: 'scaleY(0.1)', offset: 0.4 }, { transform: 'scaleY(1)' }],
      { duration: 520, easing: SPRING_POP }
    );
  });
}

/** Al abrir el panel, los ojos dan un pequeño salto de alegría. */
function popEyes() {
  animate(eyesEl, [{ scale: '1' }, { scale: '1.3' }, { scale: '1' }], { duration: 420, easing: 'ease-out' });
}

/** Los ojos miran hacia el ratón (como mucho 3,5 px a los lados y 2,5 px arriba/abajo). */
function lookAt(x, y) {
  const rect = faceEl.getBoundingClientRect();
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy) || 1;
  const strength = Math.min(1, distance / 140); // cerca del centro se mueven menos
  eyesEl.style.setProperty('--look-x', `${((dx / distance) * strength * 3.5).toFixed(2)}px`);
  eyesEl.style.setProperty('--look-y', `${((dy / distance) * strength * 2.5).toFixed(2)}px`);
}

function resetLook() {
  eyesEl.style.setProperty('--look-x', '0px');
  eyesEl.style.setProperty('--look-y', '0px');
}

/** De vez en cuando, si no tienes el ratón cerca, mira a un lado y a otro. */
function glance() {
  const side = Math.random() < 0.5 ? -1 : 1;
  animate(
    eyesEl,
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(${3.5 * side}px)`, offset: 0.2 },
      { transform: `translateX(${3.5 * side}px)`, offset: 0.45 },
      { transform: `translateX(${-3.5 * side}px)`, offset: 0.6 },
      { transform: `translateX(${-3.5 * side}px)`, offset: 0.85 },
      { transform: 'translateX(0)' },
    ],
    { duration: 2200, easing: 'ease-in-out' }
  );
}

function scheduleGlance() {
  setTimeout(() => {
    if ((isShown || isExpanded) && !pointerInside) glance();
    scheduleGlance();
  }, 8000 + Math.random() * 7000); // entre 8 y 15 segundos
}

/** Expresión según lo que pasa: feliz al terminar un Pomodoro, concentrada durante. */
function updateMood() {
  const celebrating = Date.now() < celebrateUntil;
  faceEl.classList.toggle('is-happy', celebrating);
  faceEl.classList.toggle('is-focused', !celebrating && pomodoro.status === 'running');
}

// =============================================================================
// 8. Pomodoro
// -----------------------------------------------------------------------------
// El temporizador "de verdad" vive en main.js. Aquí solo lo dibujamos en tres
// sitios: la pestaña Focus, la tarjeta de Home y la píldora (actividad en vivo).
// Con `endsAt` calculamos el tiempo restante nosotros mismos, sin preguntar.
// =============================================================================

const POMODORO_LABELS = { idle: 'Listo', running: 'Enfocado', paused: 'En pausa', finished: '¡Hecho!' };
const POMODORO_BUTTON = { idle: 'Iniciar', running: 'Pausar', paused: 'Seguir', finished: 'Otra vez' };
const STEP_MINUTES = 5;
const MAX_MINUTES = 180;
const CELEBRATION_MS = 5000;

let pomodoro = {
  status: 'idle',
  durationMs: 25 * 60 * 1000,
  remainingMs: 25 * 60 * 1000,
  endsAt: null,
  minutes: 25,
  completedToday: 0,
};
let pomodoroTicker = null;
let celebrateUntil = 0;

function getRemainingMs(state = pomodoro) {
  if (state.status === 'running' && state.endsAt) return Math.max(0, state.endsAt - Date.now());
  return state.remainingMs;
}

/** Cuánto llevas, de 0 (nada) a 1 (terminado). */
function getProgress(state = pomodoro) {
  if (state.status === 'finished') return 1;
  if (!state.durationMs) return 0;
  return Math.min(1, Math.max(0, 1 - getRemainingMs(state) / state.durationMs));
}

/** main.js nos manda el estado nuevo cada vez que cambia. */
function onPomodoroState(state) {
  const previous = pomodoro;
  pomodoro = state;
  // Si el progreso salta (reinicio, cambio de duración...), el anillo se anima.
  const jumped = Math.abs(getProgress(previous) - getProgress(state)) > 0.02;
  renderPomodoro({ animateRings: jumped });
  updatePomodoroTicker();
  if (previous.status === 'running' && state.status === 'finished') celebrate();
  updateMood();
  updateActivity();
}

/** Dibuja el Pomodoro completo (textos, botones y anillos). */
function renderPomodoro({ animateRings = false } = {}) {
  const { status } = pomodoro;
  const time = formatCountdown(getRemainingMs());
  const label = POMODORO_LABELS[status] || '';
  const running = status === 'running';
  const locked = running || status === 'paused'; // a mitad de sesión no se cambia la duración

  // Pestaña Focus
  pomodoroEl.dataset.status = status;
  setText(pomoTime, time);
  setText(pomoLabel, label);
  setText(pomoMinutes, `${pomodoro.minutes} min`);
  setText(pomoCount, `${plural(pomodoro.completedToday, 'sesión', 'sesiones')} hoy`);
  setText(pomoToggleText, POMODORO_BUTTON[status] || 'Iniciar');
  pomoToggle.dataset.running = String(running);
  pomoToggle.classList.toggle('is-running', running);
  pomoReset.disabled = status === 'idle';
  pomoMinus.disabled = locked || pomodoro.minutes <= STEP_MINUTES;
  pomoPlus.disabled = locked || pomodoro.minutes >= MAX_MINUTES;

  // Tarjeta de Home
  setText(homePomoTime, time);
  setText(homePomoLabel, label);
  homePomoToggle.dataset.running = String(running);
  homePomoToggle.setAttribute('aria-label', running ? 'Pausar Pomodoro' : 'Iniciar Pomodoro');

  // Píldora
  setText(activityText, status === 'finished' ? '¡Listo!' : time);

  setRings(getProgress(), animateRings);
}

/** Lo único que cambia cada segundo: el tiempo y los anillos. */
function renderPomodoroTick() {
  const time = formatCountdown(getRemainingMs());
  setText(pomoTime, time);
  setText(homePomoTime, time);
  setText(activityText, time);
  setRings(getProgress(), false);
}

function setRings(progress, withAnimation) {
  [pomoProgress, homePomoProgress, activityProgress].forEach((ring) => setRing(ring, progress, withAnimation));
}

/**
 * Pinta un anillo de progreso. Gracias a pathLength="100" en el HTML,
 * stroke-dashoffset 100 = vacío y 0 = completo.
 */
function setRing(circle, progress, withAnimation) {
  const offset = 100 * (1 - progress);
  const previousOffset = Number(circle.dataset.offset ?? 100);
  circle.dataset.offset = String(offset);
  circle.style.strokeDashoffset = String(offset);

  if (withAnimation && Math.abs(previousOffset - offset) > 1) {
    circle.classList.remove('is-empty');
    const animation = animate(circle, [{ strokeDashoffset: previousOffset }, { strokeDashoffset: offset }], {
      duration: 750,
      easing: SPRING,
    });
    if (animation) {
      // Al terminar, si se quedó a 0 %, ocultamos el puntito que dejaría.
      animation.onfinish = () => circle.classList.toggle('is-empty', Number(circle.dataset.offset) >= 99.9);
      return;
    }
  }
  circle.classList.toggle('is-empty', progress <= 0.001);
}

/**
 * Cuenta atrás en pantalla. Solo funciona si el Pomodoro está en marcha Y se
 * ve (panel abierto o píldora asomada): escondido no gasta nada.
 */
function updatePomodoroTicker() {
  clearTimeout(pomodoroTicker);
  pomodoroTicker = null;
  if (pomodoro.status !== 'running' || !(isExpanded || isShown)) return;

  const tick = () => {
    renderPomodoroTick();
    const remaining = getRemainingMs();
    if (remaining <= 0) return; // main.js nos avisará de que terminó
    // Esperamos justo hasta que cambie el segundo de la cuenta atrás (+20 ms de margen).
    pomodoroTicker = setTimeout(tick, (remaining % 1000 || 1000) + 20);
  };
  tick();
}

/** Píldora ancha con anillo y cuenta atrás mientras hay un Pomodoro en marcha. */
function updateActivity() {
  const celebrating = Date.now() < celebrateUntil;
  const status = celebrating ? 'finished' : pomodoro.status;
  const active = !isExpanded && (celebrating || status === 'running' || status === 'paused');
  island.classList.toggle('has-activity', active);
  activityEl.dataset.status = status;
}

/** ¡Pomodoro terminado! Ojos felices, rebote y destello verde. */
function celebrate() {
  celebrateUntil = Date.now() + CELEBRATION_MS;
  if (!isExpanded) peekFor(CELEBRATION_MS); // aunque estuviera escondida, se asoma
  updateMood();
  updateActivity();

  animate(island, [{ scale: '1' }, { scale: '1.12' }, { scale: '0.97' }, { scale: '1' }], {
    duration: 650,
    delay: 300,
    easing: 'ease-out',
  });
  animate(
    island,
    [{ boxShadow: '0 0 0 0 rgba(61, 255, 143, 0.6)' }, { boxShadow: '0 0 0 18px rgba(61, 255, 143, 0)' }],
    { duration: 1000, delay: 300, iterations: 2 }
  );
  if (isExpanded) {
    animate(pomoRingWrap, [{ scale: '1' }, { scale: '1.08' }, { scale: '1' }], { duration: 600, easing: SPRING_POP });
  }

  // Pasada la celebración, la cara y la píldora vuelven a la normalidad.
  setTimeout(() => {
    updateMood();
    updateActivity();
  }, CELEBRATION_MS + 50);
}

function togglePomodoro() {
  if (pomodoro.status === 'running') window.notch.pomodoro.pause();
  else window.notch.pomodoro.start();
}

/** Botones − / +: de 5 en 5 minutos (entre 5 y 180). */
function changeMinutes(direction) {
  const current = pomodoro.minutes;
  const next =
    direction > 0
      ? Math.floor(current / STEP_MINUTES) * STEP_MINUTES + STEP_MINUTES
      : Math.ceil(current / STEP_MINUTES) * STEP_MINUTES - STEP_MINUTES;
  window.notch.pomodoro.setMinutes(Math.min(MAX_MINUTES, Math.max(STEP_MINUTES, next)));
  // El número entra desde arriba o desde abajo, según subas o bajes.
  animate(
    pomoMinutes,
    [
      { transform: `translateY(${direction > 0 ? 7 : -7}px)`, opacity: 0.2 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    { duration: 280, easing: SPRING }
  );
}

pomoToggle.addEventListener('click', togglePomodoro);
pomoReset.addEventListener('click', () => window.notch.pomodoro.reset());
pomoMinus.addEventListener('click', () => changeMinutes(-1));
pomoPlus.addEventListener('click', () => changeMinutes(1));
homePomoToggle.addEventListener('click', (event) => {
  event.stopPropagation(); // que no cuente también como clic en la tarjeta
  togglePomodoro();
});

// =============================================================================
// 9. Links
// -----------------------------------------------------------------------------
// main.js nos manda nombre, inicial y color de cada link (no las urls): para
// abrir uno le decimos su número y main.js lo abre en tu navegador.
// =============================================================================

const HOME_LINKS_MAX = 6; // círculos que caben en la tarjeta de Home
let links = [];

function renderLinks() {
  // Pestaña Focus: todos
  linksGrid.replaceChildren(...links.map((link, index) => createLinkButton(link, index)));
  linksEmpty.hidden = links.length > 0;

  // Tarjeta de Home: hasta 6. Si hay más, el último hueco es "+N".
  const visible = links.length > HOME_LINKS_MAX ? links.slice(0, HOME_LINKS_MAX - 1) : links;
  const items = visible.map((link, index) => createMiniLink(link, index));
  if (links.length > HOME_LINKS_MAX) items.push(createMoreChip(links.length - visible.length));
  homeLinks.replaceChildren(...items);
  homeLinksEmpty.hidden = links.length > 0;
}

/** Botón redondo grande con la inicial y el nombre debajo (pestaña Focus). */
function createLinkButton(link, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-btn';
  button.title = `${link.name} · ${link.host}`;
  paintLink(button, link, index);

  const circle = document.createElement('span');
  circle.className = 'link-circle';
  circle.textContent = link.initial; // textContent (no innerHTML): nunca ejecuta nada
  const name = document.createElement('span');
  name.className = 'link-name';
  name.textContent = link.name;
  button.append(circle, name);

  button.addEventListener('click', () => openLink(index, circle));
  return button;
}

/** Círculo pequeño (tarjeta de Home). */
function createMiniLink(link, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-link';
  button.title = `${link.name} · ${link.host}`;
  button.textContent = link.initial;
  paintLink(button, link, index);
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // que no cuente también como clic en la tarjeta
    openLink(index, button);
  });
  return button;
}

/** "+3": al pulsarlo, la tarjeta te lleva a Focus, donde están todos. */
function createMoreChip(count) {
  const chip = document.createElement('span');
  chip.className = 'mini-link more';
  chip.textContent = `+${count}`;
  chip.style.setProperty('--i', String(HOME_LINKS_MAX - 1));
  return chip;
}

/** Color, color del texto y posición (para la entrada en cascada) como variables CSS. */
function paintLink(element, link, index) {
  element.style.setProperty('--link-color', link.color);
  element.style.setProperty('--link-text', link.textColor);
  element.style.setProperty('--i', String(index));
}

function openLink(index, circle) {
  animate(circle, [{ scale: '1' }, { scale: '0.85' }, { scale: '1.15' }, { scale: '1' }], {
    duration: 420,
    easing: 'ease-out',
  });
  window.notch.links.open(index);
}

// =============================================================================
// 10. Arranque
// =============================================================================

/** Aplica la configuración (al arrancar y cada vez que guardas settings.json). */
function applySettings() {
  createFormatters();
  if (isExpanded) renderClock();
  if (!settings.autoHide) showIsland(); // siempre visible
  else if (!isExpanded) scheduleHide();
}

// Avisos de main.js (se registran ya, antes de que termine init()).
window.notch.onSettingsChange((newSettings) => {
  settings = { ...settings, ...newSettings };
  applySettings();
});
window.notch.pomodoro.onChange(onPomodoroState);
window.notch.links.onChange((newLinks) => {
  links = Array.isArray(newLinks) ? newLinks : [];
  renderLinks();
});
window.notch.onShowTab((name) => showTab(name));

async function init() {
  try {
    const [savedSettings, pomodoroState, savedLinks] = await Promise.all([
      window.notch.getSettings(),
      window.notch.pomodoro.getState(),
      window.notch.links.getAll(),
    ]);
    if (savedSettings) settings = { ...settings, ...savedSettings };
    if (pomodoroState) pomodoro = pomodoroState;
    if (Array.isArray(savedLinks)) links = savedLinks;
  } catch (error) {
    console.warn('No se pudo cargar el estado inicial, uso valores por defecto:', error);
  }

  applySettings();
  renderPomodoro();
  renderLinks();
  updateMood();
  updateActivity();
  moveTabIndicator(false);
  scheduleBlink();
  scheduleGlance();

  // Al arrancar se asoma un momento, para que sepas que está funcionando.
  if (settings.autoHide) peekFor(2400);
  else showIsland();
}

init();
