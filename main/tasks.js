// =============================================================================
//  main/tasks.js — Tareas de la página Nota (Fase 12)
// -----------------------------------------------------------------------------
//  Se guardan de forma atómica en tu carpeta de datos de Notch:
//    %APPDATA%\Notch\tareas.json
//
//  Cada tarea tiene:
//    • id, texto, prioridad ('normal' | 'urgent') y hora opcional (HH:MM).
//    • Al marcarla como completada, baja al final tachada.
//    • Se purgan automáticamente al cambiar de día.
//    • Si vence una tarea urgente con hora, salta un aviso y luz roja en la isla.
// =============================================================================

'use strict';

const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { sendToRenderer } = require('./bridge');
const { addNotice } = require('./notices');
const { stripBom } = require('./config');

const MAX_TASK_CHARS = 240;
const MAX_TASKS = 100;

let tasksData = {
  version: 1,
  lastPurgeDate: getTodayDateString(),
  tasks: [],
};

let saveQueue = Promise.resolve();
let dueTimer = null;
const notifiedDue = new Set(); // ids de tareas ya avisadas hoy

function getTasksPath() {
  const base = (app && typeof app.getPath === 'function')
    ? app.getPath('userData')
    : path.join(process.env.APPDATA || require('node:os').tmpdir(), 'Notch');
  return path.join(base, 'tareas.json');
}

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadTasks() {
  const filePath = getTasksPath();
  try {
    const raw = stripBom(await fs.promises.readFile(filePath, 'utf8'));
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tasks)) {
      tasksData = {
        version: 1,
        lastPurgeDate: String(parsed.lastPurgeDate || getTodayDateString()),
        tasks: parsed.tasks.filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string'),
      };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[tasks] No se pudo leer ${filePath}: ${err.message}`);
    }
  }

  purgeOldCompleted();
  scheduleNextDueCheck();
  return getTasksState();
}

function purgeOldCompleted() {
  const today = getTodayDateString();
  if (tasksData.lastPurgeDate !== today) {
    tasksData.tasks = tasksData.tasks.filter((t) => !t.completed);
    tasksData.lastPurgeDate = today;
    notifiedDue.clear();
    saveTasks();
  }
}

function getTasksState() {
  // Orden: no completadas primero (urgentes arriba), completadas al final
  const active = tasksData.tasks.filter((t) => !t.completed);
  const completed = tasksData.tasks.filter((t) => t.completed);

  active.sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
    return b.createdAt - a.createdAt;
  });

  completed.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  return {
    tasks: [...active, ...completed],
    urgentCount: active.filter((t) => t.priority === 'urgent').length,
    totalCount: tasksData.tasks.length,
  };
}

function broadcast() {
  sendToRenderer('tasks:state', getTasksState());
}

async function saveTasks() {
  const job = saveQueue.then(async () => {
    const filePath = getTasksPath();
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(tempPath, JSON.stringify(tasksData, null, 2) + '\n', 'utf8');
      await fs.promises.rename(tempPath, filePath);
    } catch (err) {
      console.warn(`[tasks] Error guardando ${filePath}: ${err.message}`);
    }
  });
  saveQueue = job;
  return job;
}

function addTask({ text, priority = 'normal', dueTime = null }) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return { ok: false, error: 'empty' };
  if (cleanText.length > MAX_TASK_CHARS) return { ok: false, error: 'too-long' };
  if (tasksData.tasks.length >= MAX_TASKS) return { ok: false, error: 'full' };

  let validDueTime = null;
  if (typeof dueTime === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(dueTime.trim())) {
    validDueTime = dueTime.trim();
  }

  const newTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: cleanText,
    priority: priority === 'urgent' ? 'urgent' : 'normal',
    dueTime: validDueTime,
    completed: false,
    completedAt: null,
    createdAt: Date.now(),
  };

  tasksData.tasks.unshift(newTask);
  saveTasks();
  scheduleNextDueCheck();
  broadcast();
  return { ok: true, task: newTask };
}

function toggleTask(id) {
  const task = tasksData.tasks.find((t) => t.id === id);
  if (!task) return { ok: false };
  task.completed = !task.completed;
  task.completedAt = task.completed ? Date.now() : null;
  saveTasks();
  scheduleNextDueCheck();
  broadcast();
  return { ok: true, completed: task.completed };
}

function removeTask(id) {
  const index = tasksData.tasks.findIndex((t) => t.id === id);
  if (index === -1) return { ok: false };
  tasksData.tasks.splice(index, 1);
  saveTasks();
  scheduleNextDueCheck();
  broadcast();
  return { ok: true };
}

function scheduleNextDueCheck() {
  clearTimeout(dueTimer);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let nextTargetMinutes = null;
  let hasPendingDueNow = false;

  for (const task of tasksData.tasks) {
    if (task.completed || task.priority !== 'urgent' || !task.dueTime) continue;

    const [h, m] = task.dueTime.split(':').map(Number);
    const taskMinutes = h * 60 + m;

    if (taskMinutes <= currentMinutes) {
      if (!notifiedDue.has(task.id)) {
        notifiedDue.add(task.id);
        hasPendingDueNow = true;
        addNotice({
          key: `task:${task.id}`,
          kind: 'task',
          tone: 'danger',
          title: 'Tarea urgente vencida',
          text: task.text,
          alert: true,
        });
        sendToRenderer('light:urgentTask', { taskId: task.id, text: task.text });
      }
    } else {
      if (nextTargetMinutes === null || taskMinutes < nextTargetMinutes) {
        nextTargetMinutes = taskMinutes;
      }
    }
  }

  if (nextTargetMinutes !== null) {
    const diffMs = (nextTargetMinutes - currentMinutes) * 60 * 1000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    dueTimer = setTimeout(scheduleNextDueCheck, Math.max(1000, diffMs + 500));
  }
}

function initTasks() {
  loadTasks();
}

module.exports = {
  initTasks,
  loadTasks,
  getTasksState,
  addTask,
  toggleTask,
  removeTask,
};
