// =============================================================================
//  main/schedule.js — Horario y eventos recurrentes semanales (Fase 12)
// -----------------------------------------------------------------------------
//  Guarda los eventos en tu carpeta de datos de Notch:
//    %APPDATA%\Notch\eventos.json
//
//  Cada evento tiene:
//    • id, título (ej. "Clase Campuslands"), días de la semana ([1..5] L-V) y hora (HH:MM).
//    • Se programa un temporizador exacto hasta el siguiente evento más próximo.
//    • Al llegar la hora, avisa en la isla y dispara su luz correspondiente.
// =============================================================================

'use strict';

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { sendToRenderer } = require('./bridge');
const { addNotice } = require('./notices');
const { stripBom } = require('./config');

let scheduleData = {
  version: 1,
  events: [],
};

let saveQueue = Promise.resolve();
let nextEventTimer = null;

function getSchedulePath() {
  const base = (app && typeof app.getPath === 'function')
    ? app.getPath('userData')
    : path.join(process.env.APPDATA || require('node:os').tmpdir(), 'Notch');
  return path.join(base, 'eventos.json');
}

async function loadSchedule() {
  const filePath = getSchedulePath();
  try {
    const raw = stripBom(await fs.promises.readFile(filePath, 'utf8'));
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.events)) {
      scheduleData = {
        version: 1,
        events: parsed.events.filter((e) => e && typeof e.id === 'string' && typeof e.title === 'string'),
      };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[schedule] No se pudo leer ${filePath}: ${err.message}`);
    }
  }

  scheduleNextUpcoming();
  return getScheduleState();
}

function getScheduleState() {
  return {
    events: [...scheduleData.events],
  };
}

function broadcast() {
  sendToRenderer('schedule:state', getScheduleState());
}

async function saveSchedule() {
  const job = saveQueue.then(async () => {
    const filePath = getSchedulePath();
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(tempPath, JSON.stringify(scheduleData, null, 2) + '\n', 'utf8');
      await fs.promises.rename(tempPath, filePath);
    } catch (err) {
      console.warn(`[schedule] Error guardando ${filePath}: ${err.message}`);
    }
  });
  saveQueue = job;
  return job;
}

function addEvent({ title, days = [1, 2, 3, 4, 5], time = '08:00' }) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return { ok: false, error: 'empty' };

  let validTime = '08:00';
  if (typeof time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim())) {
    validTime = time.trim();
  }

  const validDays = Array.isArray(days)
    ? days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [1, 2, 3, 4, 5];

  const newEvent = {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: cleanTitle,
    days: validDays.length ? validDays : [1, 2, 3, 4, 5],
    time: validTime,
    enabled: true,
  };

  scheduleData.events.push(newEvent);
  saveSchedule();
  scheduleNextUpcoming();
  broadcast();
  return { ok: true, event: newEvent };
}

function removeEvent(id) {
  const index = scheduleData.events.findIndex((e) => e.id === id);
  if (index === -1) return { ok: false };
  scheduleData.events.splice(index, 1);
  saveSchedule();
  scheduleNextUpcoming();
  broadcast();
  return { ok: true };
}

function toggleEvent(id) {
  const event = scheduleData.events.find((e) => e.id === id);
  if (!event) return { ok: false };
  event.enabled = !event.enabled;
  saveSchedule();
  scheduleNextUpcoming();
  broadcast();
  return { ok: true, enabled: event.enabled };
}

function scheduleNextUpcoming() {
  clearTimeout(nextEventTimer);
  const now = new Date();
  let earliestDiffMs = null;
  let nextEvent = null;

  for (const event of scheduleData.events) {
    if (!event.enabled || !Array.isArray(event.days) || !event.days.length || !event.time) continue;

    const [h, m] = event.time.split(':').map(Number);

    // Revisamos los próximos 7 días para encontrar la siguiente ocurrencia
    for (let offset = 0; offset < 7; offset++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + offset);
      candidate.setHours(h, m, 0, 0);

      const candidateDay = candidate.getDay(); // 0 = Domingo, 1 = Lunes...
      if (event.days.includes(candidateDay)) {
        const diffMs = candidate.getTime() - now.getTime();
        // Al menos 1 segundo en el futuro
        if (diffMs > 1000) {
          if (earliestDiffMs === null || diffMs < earliestDiffMs) {
            earliestDiffMs = diffMs;
            nextEvent = event;
          }
          break; // encontramos la más próxima para este evento
        }
      }
    }
  }

  if (earliestDiffMs !== null && nextEvent) {
    nextEventTimer = setTimeout(() => {
      addNotice({
        key: `schedule:${nextEvent.id}`,
        kind: 'schedule',
        tone: 'info',
        title: `Horario · ${nextEvent.title}`,
        text: `Son las ${nextEvent.time}`,
        alert: true,
      });
      sendToRenderer('light:focusDone');
      scheduleNextUpcoming();
    }, earliestDiffMs);
  }
}

function initSchedule() {
  loadSchedule();
}

module.exports = {
  initSchedule,
  loadSchedule,
  getScheduleState,
  addEvent,
  removeEvent,
  toggleEvent,
};
