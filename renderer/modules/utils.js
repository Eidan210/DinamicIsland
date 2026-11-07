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

/**
 * Devuelve el factor de escala de movimiento actual (--motion-scale).
 * 1 = normal, 4 = cámara lenta, 0 = animaciones reducidas o apagadas.
 */
export function getMotionScale() {
  if (typeof document === 'undefined') return 1;
  if (isMotionReduced()) return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--motion-scale').trim();
  const val = parseFloat(raw);
  return Number.isFinite(val) ? val : 1;
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
export function setRollingText(element, text, { countDown, align = 'right' } = {}) {
  const previous = element.dataset.rollText;
  if (previous === text) return;
  element.dataset.rollText = text;
  const before = [...(previous ?? '')];
  const after = [...text];
  if (previous === undefined || isMotionReduced()) {
    element.textContent = text;
    return;
  }

  let isDown = countDown;
  if (isDown === undefined) {
    const numPrev = parseFloat(previous.replace(/[^\d.-]/g, ''));
    const numNext = parseFloat(text.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(numPrev) && !Number.isNaN(numNext)) {
      isDown = numNext < numPrev;
    } else {
      isDown = false;
    }
  }

  const hasDigits = /\d/.test(text) && /\d/.test(previous);
  if (before.length !== after.length && (!hasDigits || align !== 'right')) {
    element.textContent = text;
    return;
  }

  const offset = before.length - after.length;
  element.replaceChildren(
    ...after.map((char, index) => {
      const beforeIndex = index + offset;
      const prevChar = beforeIndex >= 0 && beforeIndex < before.length ? before[beforeIndex] : undefined;
      if (char === prevChar) return char;
      const span = document.createElement('span');
      span.className = isDown ? 'roll-down' : 'roll-up';
      span.textContent = char;
      return span;
    })
  );
}

/**
 * Crea un rodillo numérico reutilizable (estilo cuentakilómetros) para reloj,
 * porcentajes y temporizadores.
 */
export function createNumberRoller(element, options = {}) {
  if (element) element.style.fontVariantNumeric = 'tabular-nums';
  return {
    set(value, opt = {}) {
      setRollingText(element, String(value), { ...options, ...opt });
    },
    getElement() {
      return element;
    },
  };
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

/** Resume ids de modelo: "claude-sonnet-4-6[1m]" → "Sonnet 4.6", "gemini-3.8-flash-high" → "Gemini 3.8 Flash". */
export function shortModel(raw) {
  const text = String(raw || '').trim();
  if (!text || text === 'auto') return '';
  const clean = text.replace(/\[.*?\]/g, '').replace(/-\d{8}$/, '');
  const claude = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i.exec(clean);
  if (claude) {
    const name = capitalize(claude[1].toLowerCase());
    const ver = claude[3] ? `${claude[2]}.${claude[3]}` : claude[2];
    return `${name} ${ver}`;
  }
  const gemini = /^gemini-(.+)$/i.exec(clean);
  if (gemini) {
    // el último trozo "high/medium/low" es el nivel de esfuerzo, no parte del nombre
    const parts = gemini[1].split('-').filter((w, i, all) => !(i === all.length - 1 && all.length > 1 && /^(low|medium|high|xhigh)$/i.test(w)));
    return `Gemini ${parts.map(capitalize).join(' ')}`;
  }
  return clean;
}
