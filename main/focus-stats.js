// =============================================================================
//  main/focus-stats.js — Historial de Focus y descansos largos (Fase 12)
// -----------------------------------------------------------------------------
//  Guarda los minutos de concentración por día en:
//    %APPDATA%\Notch\focus.json
//
//  Comportamiento:
//    • Meta diaria (120 min por defecto).
//    • Registro histórico por fecha (YYYY-MM-DD).
//    • Descanso largo automático de 15 min tras cada 4 bloques de Pomodoro.
// =============================================================================

'use strict';

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { sendToRenderer } = require('./bridge');
const { addNotice } = require('./notices');
const { stripBom } = require('./config');

const DEFAULT_TARGET_MINUTES = 120;
const LONG_BREAK_BLOCKS = 4;
const LONG_BREAK_MINUTES = 15;

let focusData = {
  version: 1,
  history: {},
  dailyTargetMinutes: DEFAULT_TARGET_MINUTES,
  completedBlocksToday: 0,
  lastDate: getTodayDateString(),
};

let saveQueue = Promise.resolve();

function getFocusPath() {
  const base = (app && typeof app.getPath === 'function')
    ? app.getPath('userData')
    : path.join(process.env.APPDATA || require('node:os').tmpdir(), 'Notch');
  return path.join(base, 'focus.json');
}

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadFocusStats() {
  const filePath = getFocusPath();
  try {
    const raw = stripBom(await fs.promises.readFile(filePath, 'utf8'));
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const today = getTodayDateString();
      focusData = {
        version: 1,
        history: parsed.history && typeof parsed.history === 'object' ? parsed.history : {},
        dailyTargetMinutes: Math.max(15, Number(parsed.dailyTargetMinutes) || DEFAULT_TARGET_MINUTES),
        completedBlocksToday: parsed.lastDate === today ? Math.max(0, Number(parsed.completedBlocksToday) || 0) : 0,
        lastDate: today,
      };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[focus-stats] No se pudo leer ${filePath}: ${err.message}`);
    }
  }

  checkDayReset();
  return getFocusStats();
}

function checkDayReset() {
  const today = getTodayDateString();
  if (focusData.lastDate !== today) {
    focusData.lastDate = today;
    focusData.completedBlocksToday = 0;
    saveFocusStats();
  }
}

function getFocusStats() {
  checkDayReset();
  const today = getTodayDateString();
  const todayMinutes = focusData.history[today] || 0;

  return {
    todayMinutes,
    dailyTargetMinutes: focusData.dailyTargetMinutes,
    completedBlocksToday: focusData.completedBlocksToday,
    percent: Math.min(100, Math.round((todayMinutes / focusData.dailyTargetMinutes) * 100)),
    history: { ...focusData.history },
  };
}

function broadcast() {
  sendToRenderer('focus:stats', getFocusStats());
}

async function saveFocusStats() {
  const job = saveQueue.then(async () => {
    const filePath = getFocusPath();
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(tempPath, JSON.stringify(focusData, null, 2) + '\n', 'utf8');
      await fs.promises.rename(tempPath, filePath);
    } catch (err) {
      console.warn(`[focus-stats] Error guardando ${filePath}: ${err.message}`);
    }
  });
  saveQueue = job;
  return job;
}

function recordFocusBlock(minutes) {
  checkDayReset();
  const today = getTodayDateString();
  const added = Math.max(1, Math.round(Number(minutes) || 25));

  focusData.history[today] = (focusData.history[today] || 0) + added;
  focusData.completedBlocksToday += 1;
  saveFocusStats();
  broadcast();

  // Cada 4 bloques: aviso de descanso largo de 15 minutos
  if (focusData.completedBlocksToday % LONG_BREAK_BLOCKS === 0) {
    addNotice({
      key: 'focus:long-break',
      kind: 'pomodoro',
      tone: 'success',
      title: '¡Descanso largo ganado!',
      text: `Has completado 4 bloques de enfoque seguidos. Tómate ${LONG_BREAK_MINUTES} minutos de descanso.`,
      alert: true,
    });
  }

  return getFocusStats();
}

function initFocusStats() {
  loadFocusStats();
}

module.exports = {
  initFocusStats,
  loadFocusStats,
  getFocusStats,
  recordFocusBlock,
};
