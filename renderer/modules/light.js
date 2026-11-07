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

import { $, isMotionReduced } from './utils.js';
import { runOnFrames, stopOnBeat } from './beat.js';
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
let haloEl = null; // halo de escucha (F1): fuera de la isla, sigue el nivel del micrófono
let haloCoreEl = null;
let agentSweepTimer = null; // barrido opcional (F2) mientras un agente trabaja

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
  haloEl = $('island-halo');
  haloCoreEl = haloEl ? haloEl.querySelector('.halo-core') : null;

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
  if (haloEl) haloEl.style.setProperty('--light-intensity', String(factor));
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
    breaths: Number(options.breaths) || 0,
    timer: null,
  };

  currentLight = effectRecord;

  // Aplicar variables y estados CSS
  lightEl.style.setProperty('--light-color', color);
  lightEl.style.setProperty('--light-progress', `${progress}%`);
  lightEl.dataset.effect = effect;
  lightEl.dataset.direction = direction;
  lightEl.dataset.active = 'true';
  // Regla de consumo: unas pocas respiraciones y luego quieto. N respiraciones = 2N-1
  // medios ciclos (empieza bajo y acaba en la intensidad plena, sin salto).
  lightEl.dataset.breaths = effectRecord.breaths > 0 ? String(effectRecord.breaths) : '';
  if (effectRecord.breaths > 0) lightEl.style.setProperty('--breath-halves', String(2 * effectRecord.breaths - 1));
  if (effect === 'agent') scheduleAgentSweep();
  else clearAgentSweep();

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
  clearAgentSweep();

  // Si teníamos un efecto de ambiente pausado (música o IA), lo reanudamos
  if (savedAmbient) {
    const ambient = savedAmbient;
    savedAmbient = null;
    playLight(ambient.effect, {
      name: ambient.name,
      color: ambient.color,
      priority: ambient.priority,
      breaths: ambient.breaths,
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
    breaths: 4, // 4 respiraciones y se queda fijo hasta que respondas
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
    breaths: 3,
    spill: false,
  },
  // F2: borde de degradado (naranja → rosa → violeta) mientras Claude Code o Antigravity trabajan
  agentWorking: {
    effect: 'agent',
    color: '#EC4899',
    priority: 'ambient',
    durationMs: Infinity,
    spill: false,
  },
  // F2: al terminar, borde verde agua + un barrido y se apaga (~1,2 s)
  agentDone: {
    effect: 'finish',
    color: '#2DD4BF',
    priority: 'high',
    durationMs: 1200,
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

/** Quita un efecto por nombre, esté activo o guardado como ambiente a restaurar. */
export function stopLightByName(name) {
  if (savedAmbient && savedAmbient.name === name) savedAmbient = null;
  if (currentLight && currentLight.name === name) stopLight();
}

// -----------------------------------------------------------------------------
// F2 · Barrido opcional cada ~15 s mientras trabaja un agente (ajuste "agentSweep").
// Un solo temporizador encadenado; solo existe mientras el efecto 'agent' está activo.
// -----------------------------------------------------------------------------
const AGENT_SWEEP_EVERY_MS = 15000;
const AGENT_SWEEP_DURATION_MS = 1300;

function scheduleAgentSweep() {
  clearAgentSweep();
  if (!(state.settings && state.settings.agentSweep === true) || isMotionReduced()) return;
  agentSweepTimer = setTimeout(() => {
    if (!lightEl || !currentLight || currentLight.effect !== 'agent') return;
    lightEl.dataset.sweep = 'true';
    agentSweepTimer = setTimeout(() => {
      if (lightEl) delete lightEl.dataset.sweep;
      if (currentLight && currentLight.effect === 'agent') scheduleAgentSweep();
    }, AGENT_SWEEP_DURATION_MS);
  }, AGENT_SWEEP_EVERY_MS);
}

function clearAgentSweep() {
  clearTimeout(agentSweepTimer);
  agentSweepTimer = null;
  if (lightEl) delete lightEl.dataset.sweep;
}

// -----------------------------------------------------------------------------
// F1 · Halo de escucha: azul y blanco, su intensidad sigue el nivel del micrófono.
// voice.js llama a startListenHalo() al empezar a grabar, setListenLevel() con cada
// nivel (~10 por segundo) y stopListenHalo() al terminar. Solo corre mientras se graba
// y solo anima opacity y scale de una capa ya dibujada.
// -----------------------------------------------------------------------------
const HALO_ATTACK_MS = 60; // sube rápido...
const HALO_RELEASE_MS = 220; // ...y baja despacio
let haloTarget = 0;
let haloLevel = 0;
let haloLastFrame = 0;

export function startListenHalo() {
  if (!haloEl || !haloCoreEl || (state.settings && state.settings.light === false)) return;
  haloEl.dataset.active = 'true';
  haloTarget = 0;
  haloLevel = 0;
  if (isMotionReduced()) {
    haloCoreEl.style.opacity = '0.55'; // sin animaciones: halo fijo
    haloCoreEl.style.scale = '1';
    return;
  }
  haloLastFrame = performance.now();
  runOnFrames('listen-halo', () => {
    const now = performance.now();
    const dt = now - haloLastFrame;
    haloLastFrame = now;
    const tau = haloTarget > haloLevel ? HALO_ATTACK_MS : HALO_RELEASE_MS;
    haloLevel += (haloTarget - haloLevel) * (1 - Math.exp(-dt / tau));
    haloCoreEl.style.opacity = String(0.18 + 0.82 * haloLevel);
    haloCoreEl.style.scale = String(0.9 + 0.2 * haloLevel);
  });
}

/** level: 0 (silencio) a 1 (voz fuerte). El habla normal llega baja, así que se amplifica. */
export function setListenLevel(level) {
  haloTarget = Math.min(1, Math.max(0, (Number(level) || 0) * 1.6));
}

export function stopListenHalo() {
  stopOnBeat('listen-halo');
  haloTarget = 0;
  if (haloEl) haloEl.dataset.active = 'false'; // se apaga con el fundido de 300 ms del CSS
}
