// =============================================================================
//  renderer/modules/wave.js — La ola de la barra de progreso (página Música)
// -----------------------------------------------------------------------------
//  Como el reproductor de los móviles Samsung (y de Android): lo que ya sonó
//  es una ola suave que fluye hacia el tirador redondo y se aplana al llegar.
//    • Al darle a reproducir, la ola se levanta poco a poco; al pausar, se
//      calma hasta quedar en una línea recta.
//    • Son dos <path> de SVG que dibujamos aquí: lo que ya sonó (del color de
//      la carátula) y lo que falta (gris). Para cada punto x:
//          altura = envolvente(x) × amplitud × seno(x − fase)
//      La envolvente vale 0 al principio de la barra y donde acaba la ola (ahí
//      nace y muere plana) y 1 en medio. Mover la fase hace fluir la ola.
//    • La ola acaba en el tirador. Al principio de la canción, como en
//      Android, sigue un poco más allá en gris: así se ve desde el primer
//      segundo, y se va llenando de color según suena.
//    • Mientras suena, un requestAnimationFrame mueve la fase y hace avanzar
//      la barra (--progress) de forma continua. Solo con la página Música a la
//      vista, como mucho unas 60-80 veces por segundo (en pantallas de 144 Hz
//      se salta fotogramas), y se para en cuanto la ola queda quieta.
//    • Con las animaciones apagadas, la ola no se mueve y la barra avanza una
//      vez por segundo (music.js llama a drawWave()).
// =============================================================================

import { isMotionReduced } from './utils.js';

const WAVELENGTH = 60; // px: lo que mide una ola entera (cresta + valle)
const AMPLITUDE = 4.4; // px: lo que sube la cresta sobre la línea
const SPEED = 30; // px por segundo que fluye la ola hacia el tirador
const MIN_WAVE = 44; // px: la ola mide al menos esto (al principio pasa del tirador, en gris)
const RAMP_IN = 14; // px: al principio de la barra, la ola nace plana en este tramo
const TAPER = 40; // px antes de su final en los que la ola se va aplanando
const STEP = 2; // px entre punto y punto del dibujo
const RISE_MS = 170; // al reproducir, la ola se levanta en unas 3 veces esto
const CALM_MS = 120; // al pausar, se calma en unas 3 veces esto
const MIN_FRAME_MS = 12; // no dibujar más de ~80 veces por segundo

let bar = null; // #player-bar (recibe --progress)
let playedPath = null; // el <path> de lo que ya sonó
let restPath = null; // el <path> de lo que falta
let getProgress = () => null; // por dónde va la canción, de 0 a 1 (null = no se sabe)
let isPlaying = () => false;
let isVisible = () => false; // ¿panel abierto en la página Música?

let width = 0; // tamaño de la barra en px (lo mide un ResizeObserver)
let height = 0;
let amplitude = 0; // 0 = línea recta, 1 = ola entera
let target = 0; // hacia dónde va la amplitud (1 sonando, 0 en pausa)
let phase = 0; // px que ha fluido la ola
let frame = null; // el requestAnimationFrame en marcha (o null)
let lastTime = 0;

/** Suavizado de 0 a 1 (smoothstep): por debajo de 0 vale 0 y por encima de 1, 1. */
function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Los dos dibujos: lo que ya sonó (de 0 al tirador) y lo que falta (del
 * tirador al final). progress = null: sin duración conocida, todo recto.
 */
function buildPaths(progress) {
  const middle = height / 2;
  const end = width * (progress ?? 0); // x del tirador
  const waveEnd = progress === null ? 0 : Math.min(Math.max(end, MIN_WAVE), width); // dónde acaba la ola
  const rampIn = Math.min(RAMP_IN, waveEnd * 0.25);
  const taper = Math.min(TAPER, waveEnd * 0.6);
  const k = (2 * Math.PI) / WAVELENGTH;
  const peak = AMPLITUDE * amplitude;
  const point = (x) => {
    const envelope = smooth(x / rampIn) * smooth((waveEnd - x) / taper);
    const y = middle - peak * envelope * Math.sin(k * (x - phase));
    return `${x.toFixed(1)} ${y.toFixed(2)}`;
  };
  // Puntos cada STEP px de `from` a `to` (el último, justo en `to`)
  const line = (from, to) => {
    let d = `M${point(from)}`;
    for (let x = from + STEP; x < to; x += STEP) d += `L${point(x)}`;
    return `${d}L${point(to)}`;
  };

  const played = end >= 1 ? line(0, end) : '';
  // Lo que falta: la ola hasta su final (si pasa del tirador) y luego recto.
  const rest = waveEnd > end ? `${line(end, waveEnd)}L${width.toFixed(1)} ${middle}` : `M${end.toFixed(1)} ${middle}L${width.toFixed(1)} ${middle}`;
  return { played, rest };
}

/** Dibuja la ola y coloca el tirador donde va la canción. */
export function drawWave() {
  if (!bar) return;
  const value = getProgress();
  const progress = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
  bar.style.setProperty('--progress', (progress ?? 0).toFixed(5));
  const { played, rest } = buildPaths(progress);
  playedPath.setAttribute('d', played);
  restPath.setAttribute('d', rest);
}

function tick(now) {
  frame = requestAnimationFrame(tick);
  const elapsed = now - lastTime;
  if (elapsed < MIN_FRAME_MS) return; // pantallas rápidas: este fotograma no hace falta
  lastTime = now;
  if (isMotionReduced()) {
    // Acaban de apagar las animaciones: la ola se queda quieta tal cual.
    amplitude = target;
    drawWave();
    stopLoop();
    return;
  }
  const seconds = Math.min(elapsed, 100) / 1000; // tras un parón, sin saltos bruscos
  phase = (phase + SPEED * seconds) % WAVELENGTH;
  // La amplitud se acerca a su objetivo cada vez más despacio (sin rebotes).
  const tau = (target > amplitude ? RISE_MS : CALM_MS) / 1000;
  amplitude += (target - amplitude) * (1 - Math.exp(-seconds / tau));
  if (Math.abs(target - amplitude) < 0.005) amplitude = target;
  drawWave();
  if (target === 0 && amplitude === 0) stopLoop(); // en pausa y ya en línea recta: a dormir
}

function startLoop() {
  if (frame !== null) return;
  lastTime = performance.now();
  frame = requestAnimationFrame(tick);
}

function stopLoop() {
  if (frame === null) return;
  cancelAnimationFrame(frame);
  frame = null;
}

/**
 * Decide si la ola tiene que moverse. Llámala cuando cambie la música
 * (reproducir, pausa, salto...) o cuando se abra o cierre la página Música.
 * instant: true = sin animar la subida o la bajada (al abrir la página).
 */
export function updateWave({ instant = false } = {}) {
  if (!bar) return;
  target = isPlaying() ? 1 : 0;
  if (!isVisible()) {
    stopLoop(); // no se ve: no gastamos nada
    amplitude = target;
    return;
  }
  const still = isMotionReduced();
  if (instant || still) amplitude = target;
  drawWave();
  if (!still && (target === 1 || amplitude !== target)) startLoop();
  else stopLoop();
}

export function initWave(options) {
  ({ bar, playedPath, restPath, getProgress, isPlaying, isVisible } = options);
  // La barra cambia de ancho si cambian los tiempos de los lados o se abre el
  // panel (cerrado mide 0): la medimos por eventos, sin preguntar en cada dibujo.
  new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    drawWave();
  }).observe(bar);
}
