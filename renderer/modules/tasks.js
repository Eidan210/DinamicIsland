// =============================================================================
//  renderer/modules/tasks.js — Lista de tareas en la página Nota (Fase 12)
// -----------------------------------------------------------------------------
//  Muestra y gestiona las tareas:
//    • Casilla redonda interactiva para completar/desmarcar.
//    • Prioridad normal o urgente (rosa #F43F5E).
//    • Hora límite opcional (HH:MM).
//    • Campo rápido: escribe y pulsa Enter.
//    • Contador «Urgente · N pendientes» en la cabecera.
//    • Tareas completadas bajan al final tachadas.
// =============================================================================

import { $, setText, plural } from './utils.js';
import { testLight } from './light.js';

let tasksState = { tasks: [], urgentCount: 0, totalCount: 0 };
let isUrgentSelected = false;

let tasksListEl = null;
let tasksEmptyEl = null;
let tasksComposerEl = null;
let tasksInputEl = null;
let tasksUrgentBtn = null;
let tasksTimeInput = null;
let tasksCountEl = null;
let tasksUrgentChip = null;

export function initTasksModule() {
  tasksListEl = $('tasks-list');
  tasksEmptyEl = $('tasks-empty');
  tasksComposerEl = $('tasks-composer');
  tasksInputEl = $('tasks-input');
  tasksUrgentBtn = $('tasks-urgent-btn');
  tasksTimeInput = $('tasks-time-input');
  tasksCountEl = $('tasks-count');
  tasksUrgentChip = $('tasks-urgent-chip');

  if (tasksUrgentBtn) {
    tasksUrgentBtn.addEventListener('click', () => {
      isUrgentSelected = !isUrgentSelected;
      tasksUrgentBtn.setAttribute('aria-pressed', String(isUrgentSelected));
    });
  }

  if (tasksComposerEl) {
    tasksComposerEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = tasksInputEl ? tasksInputEl.value.trim() : '';
      if (!text) return;

      const priority = isUrgentSelected ? 'urgent' : 'normal';
      const dueTime = tasksTimeInput?.value || null;

      try {
        const res = await window.notch.tasks.add({ text, priority, dueTime });
        if (res?.ok) {
          tasksInputEl.value = '';
          if (tasksTimeInput) tasksTimeInput.value = '';
          isUrgentSelected = false;
          if (tasksUrgentBtn) tasksUrgentBtn.setAttribute('aria-pressed', 'false');
          if (priority === 'urgent') testLight('urgentTask');
        }
      } catch (err) {
        console.warn('[tasks] Error añadiendo tarea:', err);
      }
    });
  }

  if (window.notch?.tasks?.onChange) {
    window.notch.tasks.onChange(setTasks);
  }
}

export function setTasks(next) {
  if (!next || !Array.isArray(next.tasks)) return;
  tasksState = next;
  renderTasks();
}

export async function loadInitialTasks() {
  if (!window.notch?.tasks?.get) return;
  try {
    const initial = await window.notch.tasks.get();
    if (initial) setTasks(initial);
  } catch (err) {
    console.warn('[tasks] Error cargando tareas iniciales:', err);
  }
}

export function renderTasks() {
  if (!tasksListEl) tasksListEl = $('tasks-list');
  if (!tasksListEl) return;
  if (!tasksEmptyEl) tasksEmptyEl = $('tasks-empty');
  if (!tasksCountEl) tasksCountEl = $('tasks-count');
  if (!tasksUrgentChip) tasksUrgentChip = $('tasks-urgent-chip');

  const { tasks, urgentCount } = tasksState;

  // Contador en el segmento
  if (tasksCountEl) {
    const activeCount = tasks.filter((t) => !t.completed).length;
    setText(tasksCountEl, activeCount > 0 ? String(activeCount) : '');
  }

  // Chip de urgentes en cabecera
  if (tasksUrgentChip) {
    if (urgentCount > 0) {
      tasksUrgentChip.hidden = false;
      setText(tasksUrgentChip, `Urgente · ${plural(urgentCount, 'pendiente', 'pendientes')}`);
    } else {
      tasksUrgentChip.hidden = true;
    }
  }

  // Lista vacía
  if (tasksEmptyEl) {
    tasksEmptyEl.hidden = tasks.length > 0;
  }

  tasksListEl.replaceChildren();

  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = `task-item${task.priority === 'urgent' ? ' is-urgent' : ''}${task.completed ? ' is-completed' : ''}`;
    li.dataset.id = task.id;

    // Checkbox redondo
    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'task-checkbox';
    checkBtn.setAttribute('aria-checked', String(task.completed));
    checkBtn.title = task.completed ? 'Marcar como pendiente' : 'Completar tarea';
    if (task.completed) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M5 13l4 4L19 7');
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
      checkBtn.appendChild(svg);
    }
    checkBtn.addEventListener('click', async () => {
      try {
        await window.notch.tasks.toggle(task.id);
      } catch (err) {
        console.warn('[tasks] Error alternando tarea:', err);
      }
    });

    // Texto
    const titleSpan = document.createElement('span');
    titleSpan.className = 'task-title';
    titleSpan.textContent = task.text;

    li.append(checkBtn, titleSpan);

    // Hora límite
    if (task.dueTime) {
      const dueSpan = document.createElement('span');
      dueSpan.className = 'task-due';
      dueSpan.textContent = task.dueTime;
      li.append(dueSpan);
    }

    // Botón borrar
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'task-delete';
    delBtn.title = 'Eliminar tarea';
    const delSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    delSvg.setAttribute('viewBox', '0 0 24 24');
    const delPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    delPath.setAttribute('d', 'M18 6L6 18M6 6l12 12');
    delPath.setAttribute('stroke', 'currentColor');
    delPath.setAttribute('stroke-width', '2');
    delPath.setAttribute('stroke-linecap', 'round');
    delSvg.appendChild(delPath);
    delBtn.appendChild(delSvg);

    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await window.notch.tasks.remove(task.id);
      } catch (err) {
        console.warn('[tasks] Error eliminando tarea:', err);
      }
    });

    li.append(delBtn);
    tasksListEl.append(li);
  }
}
