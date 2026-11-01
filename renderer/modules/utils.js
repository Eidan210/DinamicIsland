// =============================================================================
//  renderer/modules/utils.js — Pequeñas utilidades que usan todos los módulos
// =============================================================================

// Curvas de animación (las mismas que en styles.css).
export const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const SPRING_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/**
 * Una curva de muelle de styles.css (p. ej. '--spring-open'), para usarla en
 * animate(). Son curvas linear() largas: así solo están escritas en un sitio.
 */
export function cssEasing(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || SPRING;
}

/**
 * ¿Hay que animar? Lo decide el ajuste "animations" (motion.js lo pone en
 * <html data-reduce-motion>): por defecto se anima siempre, aunque Windows
 * tenga apagados los "Efectos de animación".
 */
export function isMotionReduced() {
  return document.documentElement.dataset.reduceMotion === 'true';
}

/** Atajo para buscar un elemento por su id. */
export const $ = (id) => document.getElementById(id);

/**
 * Lanza una animación con la Web Animations API (como un @keyframes de CSS,
 * pero desde JS). No hace nada si las animaciones están desactivadas.
 * @returns {Animation | null}
 */
export function animate(element, keyframes, options) {
  if (!element || isMotionReduced()) return null;
  return element.animate(keyframes, options);
}

/** Cambia el texto solo si es distinto (cada cambio obliga a redibujar). */
export function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

/**
 * Cambia un texto con números haciendo "rodar" los caracteres que cambian,
 * como los temporizadores del iPhone ("24:59" → "24:58": solo rueda el 9→8).
 * countDown: true → ruedan hacia abajo (para cuentas atrás o cuando baja).
 * Si cambia la longitud (p. ej. "25:00" → "¡Listo!"), se cambia sin más.
 * Usa SIEMPRE esta función para ese elemento (recuerda el texto anterior).
 */
export function setRollingText(element, text, { countDown = false } = {}) {
  const previous = element.dataset.rollText;
  if (previous === text) return;
  element.dataset.rollText = text;
  const before = [...(previous ?? '')];
  const after = [...text];
  if (previous === undefined || before.length !== after.length || isMotionReduced()) {
    element.textContent = text;
    return;
  }
  element.replaceChildren(
    ...after.map((char, index) => {
      if (char === before[index]) return char;
      const span = document.createElement('span');
      span.className = countDown ? 'roll-down' : 'roll-up';
      span.textContent = char;
      return span;
    })
  );
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

/**
 * Para una fila que se desplaza a los lados: marca si hay más contenido a la
 * izquierda (data-more-before) o a la derecha (data-more-after), y el CSS
 * difumina ese borde. Devuelve la función que lo revisa (llámala al redibujar).
 */
export function trackScrollEdges(element) {
  const update = () => {
    const max = element.scrollWidth - element.clientWidth;
    element.dataset.moreBefore = String(element.scrollLeft > 2);
    element.dataset.moreAfter = String(element.scrollLeft < max - 2);
  };
  element.addEventListener('scroll', update, { passive: true });
  return update;
}

/** "Control+Alt+3" → "Ctrl+Alt+3" (atajos de settings.json, más cortos para leer). */
export function prettyAccelerator(accelerator) {
  return String(accelerator).replace(/\b(CommandOrControl|CmdOrCtrl|Control)\b/gi, 'Ctrl');
}
