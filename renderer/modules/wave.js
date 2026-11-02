// =============================================================================
//  renderer/modules/wave.js — La ola de la barra de progreso (página Música)
// -----------------------------------------------------------------------------
//  Como el reproductor de los móviles Samsung (y de Android): lo que ya sonó
//  es una ola suave que fluye hacia el tirador redondo y se aplana al llegar.
//    • Al darle a reproducir, la ola se levanta poco a poco; al pausar, se
//      calma hasta quedar en una línea recta.
//    • Son dos trazos que dibujamos aquí en un <canvas>: lo que ya sonó (del
//      color de la carátula) y lo que falta (gris). Para cada punto x:
//          altura = envolvente(x) × amplitud × seno(x − fase)
//      La envolvente vale 0 al principio de la barra y donde acaba la ola (ahí
//      nace y muere plana) y 1 en medio. Mover la fase hace fluir la ola.
//    • La ola acaba en el tirador. Al principio de la canción, como en
//      Android, sigue un poco más allá en gris: así se ve desde el primer
//      segundo, y se va llenando de color según suena.
//    • Mientras suena, se redibuja 24 veces por segundo con el reloj de
//      beat.js (mueve la fase, hace avanzar la barra y el tirador), en los
//      mismos instantes que la letra y el resto de la página. Es un canvas y
//      el tirador se mueve con translate: así Chromium no recalcula estilos ni
//      maqueta nada en cada dibujo (con SVG lo hacía, y la ola era lo que más
//      gastaba). Solo con la página Música a la vista, y se para en cuanto la
//      ola queda quieta.
//    • Con las animaciones apagadas, la ola no se mueve y la barra avanza una
//      vez por segundo (music.js llama a drawWave()).
// =============================================================================

import { isMotionReduced } from './utils.js';
import { runOnFrames, stopOnBeat } from './beat.js';

const WAVELENGTH = 60; // px: lo que mide una ola entera (cresta + valle)
const AMPLITUDE = 4.4; // px: lo que sube la cresta sobre la línea
const SPEED = 30; // px por segundo que fluye la ola hacia el tirador
const MIN_WAVE = 44; // px: la ola mide al menos esto (al principio pasa del tirador, en gris)
const RAMP_IN = 14; // px: al principio de la barra, la ola nace plana en este tramo
const TAPER = 40; // px antes de su final en los que la ola se va aplanando
const STEP = 2; // px entre punto y punto del dibujo
const RISE_MS = 170; // al reproducir, la ola se levanta en unas 3 veces esto
const CALM_MS = 120; // al pausar, se calma en unas 3 veces esto
const PAD = 4; // px que el canvas sobresale de la barra por cada lado (⚠️ igual que .bar-wave en styles.css)
const PLAYED_WIDTH = 3; // grosor de lo que ya sonó
const REST_WIDTH = 5; // grosor de lo que falta
const REST_ALPHA = 0.18;

let bar = null; // #player-bar
let canvas = null; // donde se dibuja la ola
let knob = null; // el tirador
let context = null;
let pixelRatio = 1;
let getProgress = () => null; // por dónde va la canción, de 0 a 1 (null = no se sabe)
let isPlaying = () => false;
let isVisible = () => false; // ¿panel abierto en la página Música?

let width = 0; // tamaño de la barra en px (lo mide un ResizeObserver)
let height = 0;
let amplitude = 0; // 0 = línea recta, 1 = ola entera
let target = 0; // hacia dónde va la amplitud (1 sonando, 0 en pausa)
let phase = 0; // px que ha fluido la ola
let running = false; // ¿se está moviendo? (apuntada al reloj de beat.js)
let lastTime = 0;

/** Suavizado de 0 a 1 (smoothstep): por debajo de 0 vale 0 y por encima de 1, 1. */
function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Los colores, del CSS (cambian con la carátula y con el tema claro u oscuro). */
function readColors() {
  const style = getComputedStyle(bar);
  const ink = style.getPropertyValue('--ink').trim() || '255, 255, 255';
  return {
    played: style.getPropertyValue('--music-accent').trim() || '#3dff8f',
    rest: `rgba(${ink}, ${REST_ALPHA})`,
  };
}

/** El canvas, del tamaño de la barra (y nítido en pantallas con zoom). */
function fitCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round((width + PAD * 2) * ratio);
  const pixelHeight = Math.round((height + PAD * 2) * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight || ratio !== pixelRatio) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    pixelRatio = ratio;
  }
}

/**
 * Los dos trazos: lo que ya sonó (de 0 al tirador) y lo que falta (del
 * tirador al final). progress = null: sin duración conocida, todo recto.
 */
function strokeWave(progress, colors) {
  const middle = height / 2;
  const end = width * (progress ?? 0); // x del tirador
  const waveEnd = progress === null ? 0 : Math.min(Math.max(end, MIN_WAVE), width); // dónde acaba la ola
  const rampIn = Math.min(RAMP_IN, waveEnd * 0.25);
  const taper = Math.min(TAPER, waveEnd * 0.6);
  const k = (2 * Math.PI) / WAVELENGTH;
  const peak = AMPLITUDE * amplitude;
  const y = (x) => {
    if (x >= waveEnd) return middle;
    const envelope = smooth(x / rampIn) * smooth((waveEnd - x) / taper);
    return middle - peak * envelope * Math.sin(k * (x - phase));
  };
  // Un trazo de `from` a `to`, con puntos cada STEP px (el último, justo en `to`)
  const line = (from, to) => {
    context.moveTo(from, y(from));
    for (let x = from + STEP; x < to; x += STEP) context.lineTo(x, y(x));
    context.lineTo(to, y(to));
  };

  // Lo que falta: la ola hasta su final (si pasa del tirador) y luego recto.
  context.beginPath();
  line(end, width);
  context.lineWidth = REST_WIDTH;
  context.strokeStyle = colors.rest;
  context.stroke();

  if (end >= 1) {
    context.beginPath();
    line(0, end);
    context.lineWidth = PLAYED_WIDTH;
    context.strokeStyle = colors.played;
    context.stroke();
  }
  return end;
}

/** Dibuja la ola y coloca el tirador donde va la canción. */
export function drawWave() {
  if (!bar || !context || width <= 0 || !isVisible()) return; // oculta: se dibuja al volver
  const value = getProgress();
  const progress = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
  fitCanvas();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, PAD * pixelRatio, PAD * pixelRatio);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const end = strokeWave(progress, readColors());
  knob.style.translate = `${end.toFixed(1)}px 0`;
}

function tick(now) {
  const elapsed = now - lastTime;
  lastTime = now;
  if (isMotionReduced()) {
    // Acaban de apagar las animaciones: la ola se queda quieta tal cual.
    amplitude = target;
    drawWave();
    stopLoop();
    return;
  }
  const seconds = Math.min(elapsed, 150) / 1000; // tras un parón, sin saltos bruscos
  phase = (phase + SPEED * seconds) % WAVELENGTH;
  // La amplitud se acerca a su objetivo cada vez más despacio (sin rebotes).
  const tau = (target > amplitude ? RISE_MS : CALM_MS) / 1000;
  amplitude += (target - amplitude) * (1 - Math.exp(-seconds / tau));
  if (Math.abs(target - amplitude) < 0.005) amplitude = target;
  drawWave();
  if (target === 0 && amplitude === 0) stopLoop(); // en pausa y ya en línea recta: a dormir
}

function startLoop() {
  if (running) return;
  running = true;
  lastTime = performance.now();
  runOnFrames('wave', tick, { onStop: () => (running = false) });
}

function stopLoop() {
  stopOnBeat('wave');
  running = false;
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
  ({ bar, canvas, knob, getProgress, isPlaying, isVisible } = options);
  context = canvas.getContext('2d');
  // La barra cambia de ancho si cambian los tiempos de los lados o se abre el
  // panel (cerrado mide 0): la medimos por eventos, sin preguntar en cada dibujo.
  new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    drawWave();
  }).observe(bar);
}
