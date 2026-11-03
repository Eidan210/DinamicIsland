// =============================================================================
//  main/water.js — Recordatorio y seguimiento de hidratación (Fase 12)
// -----------------------------------------------------------------------------
//  Guarda tu consumo diario en tu carpeta de datos de Notch:
//    %APPDATA%\Notch\agua.json
//
//  Comportamiento:
//    • Meta diaria (2000 ml) y vaso (250 ml).
//    • Recordatorio cada 60 min (solo entre las 7:00 y las 22:00).
//    • Aviso en la isla con botón "+250" y luz celeste respirante (Fase 10).
//    • Sin sondeos: temporizador exacto hasta la hora programada y reprogramación
//      al despertar de la suspensión del sistema (powerMonitor resume).
//    • Reinicio automático diario.
// =============================================================================

'use strict';

const { app, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { sendToRenderer } = require('./bridge');
const { addNotice, clearNotice } = require('./notices');
const { stripBom } = require('./config');

const DEFAULT_TARGET_ML = 2000;
const DEFAULT_CUP_ML = 250;
const DEFAULT_REMINDER_MINUTES = 60;

let waterData = {
  version: 1,
  date: getTodayDateString(),
  consumedMl: 0,
  targetMl: DEFAULT_TARGET_ML,
  cupMl: DEFAULT_CUP_ML,
  reminderMinutes: DEFAULT_REMINDER_MINUTES,
  lastReminderAt: 0,
};

let saveQueue = Promise.resolve();
let reminderTimer = null;

function getWaterPath() {
  const base = (app && typeof app.getPath === 'function')
    ? app.getPath('userData')
    : path.join(process.env.APPDATA || require('node:os').tmpdir(), 'Notch');
  return path.join(base, 'agua.json');
}

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadWater() {
  const filePath = getWaterPath();
  try {
    const raw = stripBom(await fs.promises.readFile(filePath, 'utf8'));
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const today = getTodayDateString();
      waterData = {
        version: 1,
        date: today,
        consumedMl: parsed.date === today ? Math.max(0, Number(parsed.consumedMl) || 0) : 0,
        targetMl: Math.max(500, Number(parsed.targetMl) || DEFAULT_TARGET_ML),
        cupMl: Math.max(50, Number(parsed.cupMl) || DEFAULT_CUP_ML),
        reminderMinutes: Math.max(15, Number(parsed.reminderMinutes) || DEFAULT_REMINDER_MINUTES),
        lastReminderAt: Number(parsed.lastReminderAt) || 0,
      };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[water] No se pudo leer ${filePath}: ${err.message}`);
    }
  }

  scheduleNextReminder();
  return getWaterState();
}

function getWaterState() {
  checkDayReset();
  return {
    date: waterData.date,
    consumedMl: waterData.consumedMl,
    targetMl: waterData.targetMl,
    cupMl: waterData.cupMl,
    reminderMinutes: waterData.reminderMinutes,
    percent: Math.min(100, Math.round((waterData.consumedMl / waterData.targetMl) * 100)),
  };
}

function checkDayReset() {
  const today = getTodayDateString();
  if (waterData.date !== today) {
    waterData.date = today;
    waterData.consumedMl = 0;
    saveWater();
  }
}

function broadcast() {
  sendToRenderer('water:state', getWaterState());
}

async function saveWater() {
  const job = saveQueue.then(async () => {
    const filePath = getWaterPath();
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(tempPath, JSON.stringify(waterData, null, 2) + '\n', 'utf8');
      await fs.promises.rename(tempPath, filePath);
    } catch (err) {
      console.warn(`[water] Error guardando ${filePath}: ${err.message}`);
    }
  });
  saveQueue = job;
  return job;
}

function drinkWater(ml = waterData.cupMl) {
  checkDayReset();
  const previous = waterData.consumedMl;
  waterData.consumedMl += Math.max(0, Number(ml) || waterData.cupMl);
  saveWater();
  clearNotice('water:reminder');
  broadcast();

  // Si con este vaso alcanzamos la meta diaria, felicitación
  if (previous < waterData.targetMl && waterData.consumedMl >= waterData.targetMl) {
    sendToRenderer('light:celebrateWater');
    addNotice({
      key: 'water:goal',
      kind: 'water',
      tone: 'success',
      title: '¡Meta de agua completada!',
      text: `Has alcanzado tus ${waterData.targetMl} ml de hoy. ¡Bien hecho!`,
      alert: true,
    });
  }

  scheduleNextReminder();
  return getWaterState();
}

function scheduleNextReminder() {
  clearTimeout(reminderTimer);
  const now = new Date();
  const currentHour = now.getHours();

  // Horario activo: entre las 7:00 y las 22:00
  if (currentHour < 7) {
    // Programar para las 7:00 de hoy
    const target = new Date(now);
    target.setHours(7, 0, 0, 0);
    reminderTimer = setTimeout(triggerReminder, target.getTime() - now.getTime());
    return;
  }

  if (currentHour >= 22) {
    // Programar para las 7:00 de mañana
    const target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(7, 0, 0, 0);
    reminderTimer = setTimeout(triggerReminder, target.getTime() - now.getTime());
    return;
  }

  // Entre las 7:00 y las 22:00: programar cada reminderMinutes
  const delayMs = waterData.reminderMinutes * 60 * 1000;
  reminderTimer = setTimeout(triggerReminder, delayMs);
}

function triggerReminder() {
  checkDayReset();
  waterData.lastReminderAt = Date.now();
  saveWater();

  addNotice({
    key: 'water:reminder',
    kind: 'water',
    tone: 'info',
    title: '💧 Hora de tomar agua',
    text: `${waterData.consumedMl}/${waterData.targetMl} ml`,
    alert: true,
  });

  sendToRenderer('light:waterReminder');
  scheduleNextReminder();
}

function initWater() {
  loadWater();

  // Al despertar el PC de la suspensión, recalculamos el recordatorio sin sondeos
  if (powerMonitor) {
    powerMonitor.on('resume', () => {
      checkDayReset();
      scheduleNextReminder();
      broadcast();
    });
  }
}

module.exports = {
  initWater,
  loadWater,
  getWaterState,
  drinkWater,
};
