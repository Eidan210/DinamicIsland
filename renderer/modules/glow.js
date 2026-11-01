// =============================================================================
//  renderer/modules/glow.js — El brillo alrededor de la isla (Fase 4)
// -----------------------------------------------------------------------------
//  Un brillo de color que cuenta lo que pasa sin tener que mirar el panel:
//    • atención (azul, late): Claude te espera (un permiso, una pregunta, un
//      plan, la terminal te pregunta algo) o acaba de terminar.
//    • trabajando (naranja): Claude (o Antigravity) está trabajando.
//    • volumen (blanco): mientras se ve la barra del volumen.
//    • música (el color de la carátula): con la música en la isla.
//  Si hay varios a la vez, gana el que pide atención. La atención se queda
//  hasta que pasas el ratón por la isla (entonces se pone verde un momento,
//  "visto", y se desvanece despacio) o hasta que la abres. Con el panel
//  abierto no hay brillo: su fondo es translúcido y el color lo teñiría.
//
//  Aquí solo decidimos el estado (data-glow en la isla). Los colores y la
//  animación están todos juntos en styles.css (sección 1b).
//  Todo por eventos: cada vez que la isla revisa su forma (island.js), al
//  pasar el ratón y al abrir el panel. Un único temporizador para el verde.
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';
import { getActivities, onShapeChange } from './island.js';
import { onPanelChange } from './panel.js';

const SEEN_MS = 1200; // lo que dura el verde de "visto" antes de desvanecerse

const island = $('island');

const acknowledged = new Set(); // los motivos de atención que ya viste
let seenUntil = 0; // hasta cuándo se ve el verde
let seenTimer = null;

/**
 * Lo que ahora mismo pide tu atención, como una lista de "motivos" con un
 * nombre único (así un mismo motivo no vuelve a avisar cuando ya lo viste).
 */
function attentionCauses() {
  const causes = [];
  const { pending, sessions } = state.ai;
  for (const decision of pending) causes.push(`decision:${decision.id}`);
  for (const session of sessions) {
    // La terminal le pregunta algo (sin pasar por Notch)
    if (session.status === 'waiting' && !pending.some((decision) => decision.sessionId === session.id)) {
      causes.push(`waiting:${session.id}`);
    }
    // Acaba de terminar (o se paró por un error): cada turno es un motivo nuevo
    if ((session.status === 'done' || session.status === 'error') && session.endedAt) {
      causes.push(`${session.status}:${session.id}:${session.endedAt}`);
    }
  }
  return causes;
}

/** El brillo que toca (sin contar la atención ni el verde). */
function baseGlow() {
  if (state.isExpanded) return '';
  if (state.shape === 'volume') return 'volume';
  if (state.shape !== 'activity' && state.shape !== 'decision') return '';
  const main = getActivities()[0];
  if (main === 'ai' && state.ai.sessions.some((session) => session.status === 'working')) return 'working';
  if (main === 'music') return 'music';
  return '';
}

/**
 * Pasaste el ratón o abriste la isla: lo que pedía atención ya está visto.
 * Con el ratón, se pone verde un momento; al abrir el panel, sin más.
 */
function acknowledge() {
  const causes = attentionCauses();
  const hadUnseen = causes.some((cause) => !acknowledged.has(cause));
  causes.forEach((cause) => acknowledged.add(cause));
  if (!hadUnseen || !state.settings.glow || state.isExpanded) return;
  seenUntil = Date.now() + SEEN_MS;
  clearTimeout(seenTimer);
  seenTimer = setTimeout(updateGlow, SEEN_MS + 20);
  updateGlow();
}

/** Revisa qué brillo toca y lo pone en la isla. */
export function updateGlow() {
  if (!state.settings.glow) {
    island.dataset.glow = '';
    island.dataset.glowFade = '';
    return;
  }
  const causes = attentionCauses();
  // Al arrancar lo que ya hubiera cuenta como visto (no avisamos de lo viejo).
  if (!state.initialized) causes.forEach((cause) => acknowledged.add(cause));
  // Olvidamos los motivos que ya no existen (si vuelven, vuelven a avisar).
  for (const cause of acknowledged) if (!causes.includes(cause)) acknowledged.delete(cause);

  const unseen = causes.some((cause) => !acknowledged.has(cause));
  // Con el panel abierto o el ratón ya encima de la isla, lo nuevo se ve al momento.
  if (unseen && (state.isExpanded || state.mouseInteractive)) {
    acknowledge();
    return;
  }

  const previous = island.dataset.glow || '';
  let next = baseGlow();
  if (state.isExpanded) next = '';
  else if (unseen) next = 'attention';
  else if (Date.now() < seenUntil) next = 'seen';
  // Al salir del verde, se desvanece despacio (y la siguiente vez, normal).
  island.dataset.glowFade = previous === 'seen' && next !== 'seen' ? 'slow' : '';
  island.dataset.glow = next;
}

export function initGlow() {
  island.addEventListener('mouseenter', acknowledge);
  onPanelChange((expanded) => {
    if (expanded) acknowledge();
    updateGlow();
  });
  // island.js nos avisa cada vez que revisa su forma (cambia la IA, el volumen, la música...)
  onShapeChange(updateGlow);
}
