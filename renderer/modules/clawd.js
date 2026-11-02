// =============================================================================
//  renderer/modules/clawd.js — Clawd, la mascota de la isla (Fase 5)
// -----------------------------------------------------------------------------
//  Clawd vive en la isla en lugar de los ojos (también en la mini-muesca).
//  Es un dibujo en pixel art (index.html) y aquí decidimos qué hace:
//
//  Lo que hace mientras dure (data-mode), de más a menos importante:
//    working   Claude trabaja: teclea con las patitas (ojos ámbar)
//    waiting   Claude te espera: ojos azules
//    focused   Pomodoro en marcha: ojos entrecerrados, concentrado (aunque suene música)
//    dancing   suena música: uno de sus 4 bailes (siempre el mismo con cada canción)
//    sleeping  llevas un rato sin tocar el PC (o lo bloqueaste): duerme, con "z"
//    tired     queda poca batería (20 % o menos) y no está cargando: ojos cansados
//    idle      nada especial: ojos verdes, parpadea y mira al ratón
//
//  Acciones cortas, encima de lo anterior:
//    salta contento cuando Claude termina · se sacude (y se enfada) con un
//    error · celebra el Pomodoro · se despierta contento al volver · se
//    enfada si lo tocas (con el panel abierto) y se marea a los 6 toques ·
//    da un paseíto de vez en cuando · se despide a la hora de "clawdByeTime".
//  Y lleva disfraz en Halloween y en Navidad.
//
//  Parpadear, despertarse al abrir, mirar al ratón y mirar alrededor los
//  lanza eyes.js (la misma lógica que tenían los ojos). Nada de sondeos: todo
//  se revisa cuando la isla revisa su forma, y cada acción tiene su temporizador.
//
//  Lo que se mueve sin parar (teclear, bailar, las "z", caminar, los destellos)
//  va a pasos con el reloj de beat.js, solo mientras se ve: aquí ponemos en
//  Clawd el paso del baile (data-f2, data-f4, data-f8, data-z) y el CSS
//  coloca patitas y bracitos. Las "z" suben un rato y luego se quedan quietas
//  (si duerme, es que no estás mirando).
// =============================================================================

import { $, animate, isMotionReduced, SPRING_POP } from './utils.js';
import { state } from './state.js';
import { runOnBeat, stopOnBeat } from './beat.js';

const DONE_MS = 1600; // feliz al terminar Claude
const ERROR_MS = 1800; // enfadado (ojos rojos) con un error
const ANGRY_MS = 900; // al tocarlo
const DIZZY_MS = 2600; // mareado
const DIZZY_TAPS = 6; // toques seguidos para marearlo...
const TAP_WINDOW_MS = 4000; // ...en este tiempo
const WAKE_HAPPY_MS = 1400; // contento al despertar
const BYE_MS = 6500; // lo que dura la despedida
const WALK_MIN_MS = 50 * 1000; // un paseíto cada 50-110 s (si está tranquilo y se ve)
const WALK_MAX_MS = 110 * 1000;
const LOW_BATTERY = 0.2;
// Los ojos según lo que hace (si no hay una expresión temporal)
const EYES = { working: 'open', waiting: 'open', dancing: 'happy', sleeping: 'closed', tired: 'tired', focused: 'tired', idle: 'open' };
// Lo que se mueve sin parar y en qué formas de la isla se ve (en las demás, quieto)
const MOTION_SHAPES = {
  working: ['mini', 'pill', 'activity', 'expanded'],
  dancing: ['pill', 'activity', 'expanded'],
  sleeping: ['mini', 'pill', 'activity', 'expanded'],
};
const SLEEP_MOTION_MS = 12 * 1000; // las "z" suben 12 s y luego se quedan quietas
const WALK_MS = 3600;

const root = document.documentElement;
const clawdEl = $('clawd');
const allEl = clawdEl.querySelector('.clawd-all');
const armRight = clawdEl.querySelector('.clawd-arm-r');
const blinkable = clawdEl.querySelectorAll('.eyes-open, .eyes-tired');
const eyeGroups = clawdEl.querySelectorAll('.clawd-eyes');

let mood = ''; // expresión temporal: 'happy' | 'angry' | 'dizzy'
let moodUntil = 0;
let moodTimer = null;
let errorUntil = 0;
const previousStatus = new Map(); // estado anterior de cada sesión de IA (para ver cuándo termina)
let lastCelebration = 0;
let wasSleeping = false;
let taps = [];
let walkTimer = null;
let byeTimer = null;
let motion = ''; // lo que se mueve ahora: 'working' | 'dancing' | 'sleeping' | ''
let motionSince = 0;
const extras = new Map(); // movimientos cortos encima ('walking', 'celebrating') → hasta cuándo
let keepAwakeFor = () => {}; // lo pone initClawd (de island.js)

export function isClawdOn() {
  return state.settings.clawd !== false;
}

// -----------------------------------------------------------------------------
// Qué hace y qué cara pone
// -----------------------------------------------------------------------------

function computeMode() {
  const { ai, media, pomodoro, battery } = state;
  if (ai.sessions.some((session) => session.status === 'working')) return 'working';
  if (ai.pending.length || ai.sessions.some((session) => session.status === 'waiting')) return 'waiting';
  if (pomodoro.status === 'running') return 'focused';
  if (media.status === 'playing' && media.title) return 'dancing';
  if (state.clawdSleeping) return 'sleeping';
  if (battery.level <= LOW_BATTERY && !battery.charging) return 'tired';
  return 'idle';
}

/** El baile de cada canción: siempre el mismo para la misma canción (1 a 4). */
function danceFor(media) {
  let hash = 0;
  for (const char of `${media.title}\n${media.artist}`) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return String((hash % 4) + 1);
}

/** El disfraz: el de "clawdCostume" o, con "auto", según la fecha. */
function costumeFor(date = new Date()) {
  const choice = state.settings.clawdCostume;
  if (choice && choice !== 'auto') return choice;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month === 10 && day >= 24) return 'halloween'; // la última semana de octubre
  if (month === 12 && day >= 20 && day <= 26) return 'christmas';
  return 'none';
}

/** Una expresión durante un rato (luego vuelve a la de su modo). */
function setMood(name, ms) {
  mood = name;
  moodUntil = Date.now() + ms;
  clearTimeout(moodTimer);
  moodTimer = setTimeout(updateClawd, ms + 20);
}

/** Lo que acaba de pasar desde la última vez: Claude terminó o falló, Pomodoro, despertar. */
function detectEvents() {
  for (const session of state.ai.sessions) {
    const before = previousStatus.get(session.id);
    if (before && before !== session.status) {
      if (session.status === 'done') {
        setMood('happy', DONE_MS);
        jump();
      } else if (session.status === 'error') {
        errorUntil = Date.now() + ERROR_MS; // ¡se lo toma personal!
        setMood('angry', ERROR_MS);
        shake(10);
      }
    }
    previousStatus.set(session.id, session.status);
  }
  for (const id of previousStatus.keys()) {
    if (!state.ai.sessions.some((session) => session.id === id)) previousStatus.delete(id);
  }

  // Pomodoro terminado (pomodoro.js pone celebrateUntil): ¡a celebrar!
  if (state.celebrateUntil > lastCelebration && Date.now() < state.celebrateUntil) {
    lastCelebration = state.celebrateUntil;
    setMood('happy', state.celebrateUntil - Date.now());
    jump(2);
  }

  // Vuelves al PC: se despierta contento
  if (wasSleeping && !state.clawdSleeping) {
    setMood('happy', WAKE_HAPPY_MS);
    wakeClawd();
  }
  wasSleeping = state.clawdSleeping;
}

/** Revisa qué hace Clawd (lo llama eyes.js cada vez que la isla revisa su forma). */
export function updateClawd() {
  const on = isClawdOn();
  root.dataset.face = on ? 'clawd' : 'eyes';
  if (!on) {
    stopOnBeat('clawd'); // con los ojos de siempre no hay nada que mover
    return;
  }
  detectEvents();
  const now = Date.now();
  const mode = computeMode();
  clawdEl.dataset.mode = mode;
  clawdEl.dataset.eyes = now < moodUntil && mood ? mood : EYES[mode];
  clawdEl.dataset.dance = mode === 'dancing' ? danceFor(state.media) : '';
  clawdEl.dataset.costume = costumeFor();
  clawdEl.classList.toggle('is-error', now < errorUntil);
  const celebrating = now < state.celebrateUntil;
  clawdEl.classList.toggle('is-celebrating', celebrating);
  if (celebrating) extras.set('celebrating', state.celebrateUntil);
  else extras.delete('celebrating');
  updateMotion(mode);
  scheduleWalk();
}

// -----------------------------------------------------------------------------
// Lo que se mueve sin parar, a pasos (reloj de beat.js)
// -----------------------------------------------------------------------------

/** ¿Se mueve ahora (y se ve)? Arranca o para el reloj de sus pasos. */
function updateMotion(mode) {
  const next = MOTION_SHAPES[mode]?.includes(state.shape) ? mode : '';
  if (next !== motion) {
    motion = next;
    motionSince = Date.now();
  }
  const now = Date.now();
  let until = 0;
  if (motion === 'sleeping') until = motionSince + SLEEP_MOTION_MS;
  else if (motion) until = Infinity;
  for (const end of extras.values()) until = Math.max(until, end);
  if (until > now) runOnBeat('clawd', setFrame, { forMs: until - now, onStop: restPose });
  else stopOnBeat('clawd');
}

/** Un paso: el CSS mira estos números para colocar patitas, bracitos y "z". */
function setFrame(beat) {
  setData('f2', beat % 2); // cambia en cada paso (125 ms)
  setData('f4', Math.floor(beat / 2) % 2); // cada 2 pasos (250 ms)
  setData('f8', beat % 8); // 8 posturas seguidas (un ciclo por segundo)
  const z = Math.floor(beat / 3) % 7; // las "z": 7 posiciones, una cada 375 ms
  setData('z', z);
  setData('z2', (z + 4) % 7); // la segunda, desfasada
}

/** Sin pasos: la postura de reposo (las "z" se quedan quietas a media altura). */
function restPose() {
  for (const key of ['f2', 'f4', 'f8', 'z', 'z2']) delete clawdEl.dataset[key];
}

function setData(key, value) {
  const text = String(value);
  if (clawdEl.dataset[key] !== text) clawdEl.dataset[key] = text;
}

// -----------------------------------------------------------------------------
// Acciones cortas (animaciones de una vez; con las animaciones apagadas, nada)
// -----------------------------------------------------------------------------

/** Salta (estirándose y aplastándose al caer). */
function jump(times = 1) {
  animate(
    allEl,
    [
      { transform: 'translateY(0) scale(1, 1)' },
      { transform: 'translateY(0) scale(1.15, 0.85)', offset: 0.15 },
      { transform: 'translateY(-4px) scale(0.92, 1.1)', offset: 0.45 },
      { transform: 'translateY(0) scale(1.1, 0.9)', offset: 0.8 },
      { transform: 'translateY(0) scale(1, 1)' },
    ],
    { duration: 560, iterations: times, easing: 'ease-out', delay: 120 }
  );
}

/** Se sacude a los lados (a saltos de píxel). */
function shake(times = 6) {
  const frames = [];
  for (let i = 0; i <= times; i++) frames.push({ transform: `translateX(${i === times ? 0 : i % 2 ? 1 : -1}px)` });
  animate(allEl, frames, { duration: times * 70, easing: `steps(${times}, end)` });
}

/** Se tambalea, mareado. */
function wobble() {
  animate(
    allEl,
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-14deg)' },
      { transform: 'rotate(12deg)' },
      { transform: 'rotate(-9deg)' },
      { transform: 'rotate(6deg)' },
      { transform: 'rotate(0deg)' },
    ],
    { duration: DIZZY_MS, easing: 'ease-in-out' }
  );
}

/** Saluda con el brazo. */
function wave() {
  animate(armRight, [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }], {
    duration: 420,
    iterations: 6,
    easing: 'steps(2, jump-none)',
  });
}

/** Un paseíto: va a un lado y al otro moviendo las patitas. */
function walk() {
  if (isMotionReduced()) return;
  clawdEl.classList.add('is-walking');
  extras.set('walking', Date.now() + WALK_MS);
  updateMotion(clawdEl.dataset.mode);
  const steps = animate(
    clawdEl,
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-8px)', offset: 0.3 },
      { transform: 'translateX(8px)', offset: 0.75 },
      { transform: 'translateX(0)' },
    ],
    { duration: WALK_MS, easing: 'steps(18, end)' }
  );
  const stop = () => {
    clawdEl.classList.remove('is-walking');
    extras.delete('walking');
    updateMotion(clawdEl.dataset.mode);
  };
  if (steps) steps.finished.then(stop, stop);
  else stop();
}

/** Programa el siguiente paseíto (solo si está tranquilo y se ve). */
function scheduleWalk() {
  if (walkTimer) return;
  walkTimer = setTimeout(
    () => {
      walkTimer = null;
      const visible = state.shape === 'pill' || state.shape === 'expanded';
      if (isClawdOn() && visible && clawdEl.dataset.mode === 'idle') walk();
      scheduleWalk();
    },
    WALK_MIN_MS + Math.random() * (WALK_MAX_MS - WALK_MIN_MS)
  );
}

// -----------------------------------------------------------------------------
// Lo que antes hacían los ojos (eyes.js lo llama)
// -----------------------------------------------------------------------------

/** Parpadeo (los ojos abiertos o cansados se cierran un instante). */
export function blinkClawd(times = 1) {
  blinkable.forEach((group) => {
    animate(group, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.1)' }, { transform: 'scaleY(1)' }], {
      duration: 180,
      iterations: times,
      easing: 'steps(3, jump-none)',
    });
  });
}

/** Al despertar la isla (o volver al PC), abre los ojos y da un saltito. */
export function wakeClawd() {
  blinkable.forEach((group) => {
    animate(group, [{ transform: 'scaleY(0.1)' }, { transform: 'scaleY(0.1)', offset: 0.4 }, { transform: 'scaleY(1)' }], {
      duration: 520,
      easing: SPRING_POP,
    });
  });
  animate(allEl, [{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], {
    duration: 360,
    easing: 'steps(3, jump-none)',
  });
}

/** Al abrir el panel: un saltito de alegría. */
export function popClawd() {
  animate(allEl, [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }], {
    duration: 420,
    easing: 'ease-out',
  });
}

/** Mira a un lado y al otro (un píxel). */
export function glanceClawd(side) {
  eyeGroups.forEach((group) => {
    animate(
      group,
      [
        { transform: 'translateX(0)' },
        { transform: `translateX(${side}px)`, offset: 0.2 },
        { transform: `translateX(${side}px)`, offset: 0.45 },
        { transform: `translateX(${-side}px)`, offset: 0.6 },
        { transform: `translateX(${-side}px)`, offset: 0.85 },
        { transform: 'translateX(0)' },
      ],
      { duration: 2200, easing: 'steps(1, end)' }
    );
  });
}

// -----------------------------------------------------------------------------
// Despedida al final del día ("clawdByeTime", p. ej. "18:00")
// -----------------------------------------------------------------------------

/** Cuánto falta hasta la próxima vez que el reloj marque esa hora. */
function msUntil(time, now = new Date()) {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

/** Programa la despedida (un único temporizador hasta esa hora). */
export function scheduleBye() {
  clearTimeout(byeTimer);
  byeTimer = null;
  const time = state.settings.clawdByeTime;
  if (!isClawdOn() || !time) return;
  byeTimer = setTimeout(() => {
    if (isClawdOn() && !state.clawdSleeping) sayBye();
    scheduleBye(); // y mañana otra vez
  }, msUntil(time));
}

/** ¡Hasta mañana! La isla se queda a la vista unos segundos y Clawd saluda. */
function sayBye() {
  keepAwakeFor(BYE_MS);
  setMood('happy', BYE_MS);
  updateClawd();
  wave();
}

// -----------------------------------------------------------------------------
// Arranque
// -----------------------------------------------------------------------------

/** main.js nos cuenta si llevas un rato sin tocar el PC (o está bloqueado). */
export function setClawdSleeping(sleeping) {
  state.clawdSleeping = sleeping === true;
  updateClawd();
}

/**
 * @param {{ keepAwakeFor: (ms: number) => void }} options
 *   keepAwakeFor: que la isla se quede como píldora un rato (para la despedida)
 */
export function initClawd(options = {}) {
  if (typeof options.keepAwakeFor === 'function') keepAwakeFor = options.keepAwakeFor;

  // Tocarlo (con el panel abierto): se enfada; a los 6 toques seguidos, se marea.
  clawdEl.addEventListener('click', (event) => {
    event.stopPropagation();
    const now = Date.now();
    taps = taps.filter((time) => now - time < TAP_WINDOW_MS);
    taps.push(now);
    if (taps.length >= DIZZY_TAPS) {
      taps = [];
      setMood('dizzy', DIZZY_MS);
      wobble();
    } else {
      setMood('angry', ANGRY_MS);
      shake();
    }
    updateClawd();
  });

  window.notch.clawd.onSleepChange(setClawdSleeping);
  scheduleBye();
  updateClawd();
}
