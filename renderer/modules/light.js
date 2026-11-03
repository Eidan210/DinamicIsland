// =============================================================================
//  renderer/modules/light.js — Motor de luz («Light Engine» — Fase 10)
// -----------------------------------------------------------------------------
//  La isla «emite luz»: cada evento del sistema tiene su color, su animación en
//  el contorno y un derrame ambiental suave hacia abajo.
//
//  Prioridades (de más a menos):
//    1. crítica: Claude pide permiso
//    2. alta:    Claude terminó, Focus terminado, agua o tarea urgente
//    3. media:   cargador, batería baja, portapapeles (copiar/cortar/pegar), volumen
//    4. ambiente: música sonando, IA trabajando
//
//  API unificada:
//    playLight(efecto, { color, prioridad, duracionMs, derrame, progreso, direccion })
//    stopLight(id)
//    testLight(nombreEvento)
// =============================================================================

import { $ } from './utils.js';
import { state } from './state.js';

const PRIORITIES = {
  critical: 1,
  high: 2,
  medium: 3,
  ambient: 4,
};

let lightEl = null;
let spillEl = null;
let sweepEl = null;
let fillEl = null;

let currentLight = null; // { id, name, effect, priority, priorityNum, color, timer }
let savedAmbient = null; // para restaurar la música o la IA tras un aviso de más prioridad
let nextLightId = 1;

/**
 * Inicializa el motor de luz conectando con los elementos del DOM.
 */
export function initLight() {
  lightEl = $('island-light');
  spillEl = $('island-spill');
  sweepEl = lightEl ? lightEl.querySelector('.light-sweep') : null;
  fillEl = lightEl ? lightEl.querySelector('.light-fill') : null;

  applyLightSettings();
}

/**
 * Aplica los ajustes de configuración (intensidad, derrame).
 */
export function applyLightSettings() {
  const intensity = (state.settings && Number(state.settings.lightIntensity)) || 100;
  const factor = Math.min(1.4, Math.max(0.6, intensity / 100));
  if (lightEl) lightEl.style.setProperty('--light-intensity', String(factor));
  if (spillEl) spillEl.style.setProperty('--light-intensity', String(factor));
}

/**
 * Reproduce un efecto de luz en la isla.
 * @param {string} effect 'border' | 'breathe' | 'sweep' | 'fill'
 * @param {object} [options]
 * @returns {number|null} ID del efecto o null si fue ignorado por prioridad
 */
export function playLight(effect, options = {}) {
  if (state.settings && state.settings.light === false) return null;
  if (!lightEl || !spillEl) return null;

  const priorityName = options.priority || 'medium';
  const priorityNum = PRIORITIES[priorityName] ?? PRIORITIES.medium;
  const color = options.color || '#3dff8f';
  const durationMs = options.durationMs ?? 1500;
  const spillAllowed = (state.settings && state.settings.lightSpill !== false) && (options.spill !== false);
  const progress = options.progress ?? 100;
  const direction = options.direction || 'ltr';
  const name = options.name || effect;

  // Si hay un efecto activo:
  if (currentLight) {
    // Si llega el mismo evento seguido (ej. 5 Ctrl+C en 1s), reiniciamos su temporizador sin parpadear
    if (currentLight.name === name) {
      clearTimeout(currentLight.timer);
      if (Number.isFinite(durationMs) && durationMs > 0) {
        currentLight.timer = setTimeout(() => stopLight(currentLight.id), durationMs);
      }
      return currentLight.id;
    }

    // Si el activo tiene mayor prioridad que el nuevo (número menor = más prioridad), se ignora el nuevo
    if (currentLight.priorityNum < priorityNum) {
      return null;
    }

    // Si el activo era de ambiente y entra uno prioritario, lo guardamos para restaurarlo después
    if (currentLight.priorityNum === PRIORITIES.ambient) {
      savedAmbient = { ...currentLight };
    }

    clearTimeout(currentLight.timer);
  }

  const id = nextLightId++;
  const effectRecord = {
    id,
    name,
    effect,
    priority: priorityName,
    priorityNum,
    color,
    timer: null,
  };

  currentLight = effectRecord;

  // Aplicar variables y estados CSS
  lightEl.style.setProperty('--light-color', color);
  lightEl.style.setProperty('--light-progress', `${progress}%`);
  lightEl.dataset.effect = effect;
  lightEl.dataset.direction = direction;
  lightEl.dataset.active = 'true';

  if (spillAllowed) {
    spillEl.style.setProperty('--spill-color', color);
    spillEl.dataset.active = 'true';
  } else {
    spillEl.dataset.active = 'false';
  }

  // Si tiene duración finita, programamos el cierre
  if (Number.isFinite(durationMs) && durationMs > 0) {
    effectRecord.timer = setTimeout(() => {
      stopLight(id);
    }, durationMs);
  }

  return id;
}

/**
 * Detiene un efecto de luz específico o el actual.
 * @param {number} [id] ID del efecto a detener (si se omite, detiene el actual)
 */
export function stopLight(id) {
  if (!currentLight) return;
  if (id && currentLight.id !== id) return;

  clearTimeout(currentLight.timer);
  currentLight = null;

  // Si teníamos un efecto de ambiente pausado (música o IA), lo reanudamos
  if (savedAmbient) {
    const ambient = savedAmbient;
    savedAmbient = null;
    playLight(ambient.effect, {
      name: ambient.name,
      color: ambient.color,
      priority: ambient.priority,
      durationMs: Infinity,
    });
    return;
  }

  // Apagar elementos visuales
  if (lightEl) {
    lightEl.dataset.active = 'false';
    lightEl.dataset.effect = '';
  }
  if (spillEl) {
    spillEl.dataset.active = 'false';
  }
}

/**
 * Catálogo de eventos del documento con sus colores y animaciones exactas.
 */
export const LIGHT_EVENTS = {
  permission: {
    effect: 'breathe',
    color: '#F59E0B',
    priority: 'critical',
    durationMs: Infinity,
    spill: true,
  },
  autoApproved: {
    effect: 'border',
    color: '#22C55E',
    priority: 'high',
    durationMs: 900,
    spill: false,
  },
  claudeDone: {
    effect: 'sweep',
    color: '#2DD4BF',
    priority: 'high',
    durationMs: 1500,
    spill: false,
  },
  aiWorking: {
    effect: 'breathe',
    color: '#a98bff',
    priority: 'ambient',
    durationMs: Infinity,
    spill: false,
  },
  chargerConnected: {
    effect: 'fill',
    color: '#22C55E',
    priority: 'medium',
    durationMs: 2500,
    progress: 100,
    spill: true,
  },
  chargerDisconnected: {
    effect: 'fill',
    color: '#ffc94d',
    priority: 'medium',
    durationMs: 2000,
    progress: 80,
    spill: false,
  },
  batteryLow: {
    effect: 'breathe',
    color: '#F43F5E',
    priority: 'medium',
    durationMs: 5000,
    spill: true,
  },
  shiftCaps: {
    effect: 'border',
    color: '#ffffff',
    priority: 'medium',
    durationMs: 300,
    spill: false,
  },
  copy: {
    effect: 'sweep',
    color: '#3B82F6',
    priority: 'medium',
    durationMs: 700,
    direction: 'ltr',
    spill: false,
  },
  cut: {
    effect: 'border',
    color: '#FB7185',
    priority: 'medium',
    durationMs: 800,
    spill: true,
  },
  paste: {
    effect: 'sweep',
    color: '#E5E7EB',
    priority: 'medium',
    durationMs: 700,
    direction: 'rtl',
    spill: false,
  },
  volume: {
    effect: 'fill',
    color: '#ffffff',
    priority: 'medium',
    durationMs: 1200,
    progress: 70,
    spill: false,
  },
  focusDone: {
    effect: 'sweep',
    color: '#22C55E',
    priority: 'high',
    durationMs: 1500,
    spill: true,
  },
  waterReminder: {
    effect: 'breathe',
    color: '#38BDF8',
    priority: 'high',
    durationMs: 3000,
    spill: true,
  },
  urgentTask: {
    effect: 'border',
    color: '#F43F5E',
    priority: 'high',
    durationMs: 1500,
    spill: true,
  },
  celebrateWater: {
    effect: 'sweep',
    color: '#06B6D4',
    priority: 'high',
    durationMs: 2000,
    spill: true,
  },
  music: {
    effect: 'border',
    color: 'var(--music-accent, #3dff8f)',
    priority: 'ambient',
    durationMs: Infinity,
    spill: false,
  },
};

/**
 * Permite probar visualmente cualquier evento de la tabla de la Fase 10.
 * @param {string} eventName
 */
export function testLight(eventName) {
  const conf = LIGHT_EVENTS[eventName];
  if (!conf) {
    console.warn(`[light] Evento de luz no reconocido: ${eventName}`);
    return null;
  }
  return playLight(conf.effect, { ...conf, name: eventName });
}

/**
 * Devuelve el estado actual de la luz activa.
 */
export function getCurrentLight() {
  return currentLight ? { ...currentLight } : null;
}
