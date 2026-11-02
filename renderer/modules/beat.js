// =============================================================================
//  renderer/modules/beat.js — El "metrónomo" de lo que se mueve sin parar
// -----------------------------------------------------------------------------
//  Una animación CSS infinita obliga a Chromium a trabajar en CADA fotograma
//  (60 veces por segundo), aunque el dibujo cambie solo de vez en cuando, y en
//  una ventana transparente eso cuesta. Lo medimos: con música sonando, el
//  ecualizador y el baile de Clawd hacían gastar a Notch unas 15 veces más
//  CPU que en reposo.
//
//  Por eso lo que se mueve mientras dura un estado avanza con este reloj, y
//  todo en los mismos instantes (cada instante es un dibujo de Chromium):
//    • runOnBeat    8 pasos por segundo: Clawd bailando, tecleando o
//                   durmiendo, los iconos que giran, el fondo de la página
//                   Música.
//    • runOnFrames  24 veces por segundo, para lo que tiene que verse suave
//                   (el ecualizador, la ola y la letra de la página Música).
//                   Uno de cada tres coincide con un paso de los de arriba:
//                   no suman dibujos.
//  Entre medias no se hace nada, y el reloj solo corre mientras alguien lo
//  necesita (con las animaciones apagadas, nunca).
//
//    runOnBeat('nombre', (paso) => { ... }, { forMs, onStop })
//    runOnFrames('nombre', (ahora) => { ... }, { onStop })
//    stopOnBeat('nombre')   (para los dos)
// =============================================================================

import { isMotionReduced } from './utils.js';

const STEP_MS = 125; // 8 pasos por segundo
const FRAME_MS = STEP_MS / 3; // 41,7 ms: 24 por segundo, y uno de cada tres es un paso
const CYCLE = 840; // los pasos van de 0 a 839 (múltiplo de 2 a 8: los ciclos encajan)

const users = new Map(); // nombre → { onTick, onStop, until, everyFrame }
let timer = null;
let step = 0;
let lastSlot = -1; // el último instante atendido (para no repetirlo)

function schedule() {
  clearTimeout(timer);
  timer = null;
  if (!users.size) return;
  const period = [...users.values()].some((user) => user.everyFrame) ? FRAME_MS : STEP_MS;
  // Siempre en múltiplos exactos del periodo (contados desde el reloj del PC):
  // así los pasos y los dibujos caen en los mismos instantes. Redondeamos la
  // espera hacia arriba: mejor 1 ms tarde que antes de tiempo.
  const now = Date.now();
  const next = (Math.floor(now / period) + 1) * period;
  timer = setTimeout(tick, Math.ceil(next - now));
}

function tick() {
  timer = null;
  if (isMotionReduced()) {
    // Acaban de apagar las animaciones: todo a su postura de reposo.
    [...users.keys()].forEach(stopOnBeat);
    return;
  }
  const now = Date.now();
  const slot = Math.round(now / FRAME_MS); // los instantes, de 41,7 en 41,7 ms
  if (slot === lastSlot) {
    schedule(); // este instante ya lo atendimos
    return;
  }
  lastSlot = slot;
  for (const [name, user] of users) if (now >= user.until) stopOnBeat(name); // se acabó su tiempo
  // ¿Este instante es también un paso? (los pasos caen en múltiplos de 125 ms)
  const isStep = slot % 3 === 0;
  if (isStep) step = (step + 1) % CYCLE;
  const time = performance.now();
  for (const user of [...users.values()]) {
    if (user.everyFrame) user.onTick(time);
    else if (isStep) user.onTick(step);
  }
  schedule();
}

function register(name, user) {
  if (isMotionReduced()) {
    stopOnBeat(name);
    return;
  }
  const isNew = !users.has(name);
  const wasFast = [...users.values()].some((other) => other.everyFrame);
  users.set(name, user);
  if (isNew) user.onTick(user.everyFrame ? performance.now() : step); // el primero, ya
  // Si ahora hace falta ir más deprisa, se reprograma; si no, sigue como iba.
  if (!timer || (user.everyFrame && !wasFast)) schedule();
}

/** Llama a `onTick(paso)` 8 veces por segundo (forMs: solo ese tiempo; onStop: al parar). */
export function runOnBeat(name, onTick, { forMs = Infinity, onStop } = {}) {
  register(name, { onTick, onStop, until: Date.now() + forMs, everyFrame: false });
}

/** Llama a `onFrame(ahora)` 24 veces por segundo (ahora: performance.now()). */
export function runOnFrames(name, onFrame, { onStop } = {}) {
  register(name, { onTick: onFrame, onStop, until: Infinity, everyFrame: true });
}

/** Deja de llamarle (y le avisa con su onStop para que vuelva a su postura de reposo). */
export function stopOnBeat(name) {
  const user = users.get(name);
  if (!user) return;
  users.delete(name);
  user.onStop?.();
  if (!users.size) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * Hace girar a pasos (15° cada paso: una vuelta cada 3 s) los elementos que
 * cumplan `selector`. El selector incluye cuándo se ven (p. ej. solo con la
 * isla en forma de actividad). Devuelve la función que revisa cuáles giran:
 * llámala cuando algo cambie (la forma de la isla, la página, el estado...).
 */
export function makeBeatSpinner(name, selector) {
  let spinning = [];
  const rest = (list) => list.forEach((element) => element.style.removeProperty('rotate'));
  const onTick = (beat) => {
    for (const element of spinning) element.style.rotate = `${(beat * 15) % 360}deg`;
  };
  return function refreshSpinner() {
    const next = [...document.querySelectorAll(selector)];
    rest(spinning.filter((element) => !next.includes(element)));
    spinning = next;
    if (spinning.length) runOnBeat(name, onTick, { onStop: () => rest(spinning) });
    else stopOnBeat(name);
  };
}
