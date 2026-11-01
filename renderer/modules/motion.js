// =============================================================================
//  renderer/modules/motion.js — ¿Animar o no?
// -----------------------------------------------------------------------------
//  settings.json → "animations":
//    "always"  anima siempre (por defecto). Muchos portátiles gamer traen
//              apagados los "Efectos de animación" de Windows para ir más
//              rápidos; Notch anima igual.
//    "system"  como Windows: si tienes los "Efectos de animación" apagados
//              (Configuración → Accesibilidad → Efectos visuales), no anima.
//    "off"     no anima nunca.
//  Lo apuntamos en <html data-reduce-motion="true|false">: styles.css (al
//  final) y utils.js (animate, setRollingText) lo miran.
// =============================================================================

import { state } from './state.js';

// Lo que pide Windows (cambia al momento si tocas el ajuste de Windows).
const systemReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

export function applyMotionSetting() {
  const mode = state.settings.animations;
  const reduce = mode === 'off' || (mode === 'system' && systemReduce.matches);
  document.documentElement.dataset.reduceMotion = String(reduce);
}

export function initMotion() {
  systemReduce.addEventListener('change', applyMotionSetting);
  applyMotionSetting();
}
