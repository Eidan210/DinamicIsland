// =============================================================================
//  renderer/modules/utils.js — Pequeñas utilidades que usan todos los módulos
// =============================================================================

// Curvas de animación (las mismas que en styles.css).
export const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const SPRING_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

// Si en Windows desactivas "Efectos de animación", respetamos esa preferencia.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Atajo para buscar un elemento por su id. */
export const $ = (id) => document.getElementById(id);

/**
 * Lanza una animación con la Web Animations API (como un @keyframes de CSS,
 * pero desde JS). No hace nada si las animaciones están desactivadas.
 * @returns {Animation | null}
 */
export function animate(element, keyframes, options) {
  if (!element || reducedMotion.matches) return null;
  return element.animate(keyframes, options);
}

/** Cambia el texto solo si es distinto (cada cambio obliga a redibujar). */
export function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

/** 1499000 ms → "24:59" (cuenta atrás del Pomodoro) */
export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 83.4 s → "1:23"; 3725 s → "1:02:05" (tiempos de canciones) */
export function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** plural(1, 'sesión', 'sesiones') → "1 sesión" */
export function plural(count, singular, pluralWord) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
