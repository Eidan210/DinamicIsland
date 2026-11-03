// =============================================================================
//  renderer/widgets/tasks.js — Widget Tareas: pendientes con las urgentes primero
// -----------------------------------------------------------------------------
//  Muestra las tareas pendientes leídas de tareas.json (main/tasks.js).
//  Las urgentes aparecen arriba con su indicador rosa (#F43F5E).
//  Permite tachar/completar una tarea al pulsar sobre ella.
// =============================================================================

import { $, setText } from '../modules/utils.js';

const countEl = $('home-tasks-count');
const listEl = $('home-tasks-list');

let tasksData = [];

async function loadTasks() {
  if (window.notch?.tasks?.get) {
    try {
      const res = await window.notch.tasks.get();
      tasksData = res?.tasks || [];
    } catch {
      tasksData = [];
    }
  }
}

function render() {
  if (!listEl) return;
  const pending = tasksData.filter((t) => !t.done);
  // Ordenar: urgentes primero, luego por orden de creación
  const sorted = [...pending].sort((a, b) => {
    if (a.urgent && !b.urgent) return -1;
    if (!a.urgent && b.urgent) return 1;
    return 0;
  });

  setText(countEl, String(pending.length));
  listEl.replaceChildren();

  if (sorted.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'tasks-widget-empty';
    empty.textContent = 'Todo terminado';
    listEl.appendChild(empty);
    return;
  }

  // Mostrar hasta 3 tareas en 2x1 (o 2 en 1x1)
  const preview = sorted.slice(0, 3);
  preview.forEach((task) => {
    const item = document.createElement('li');
    item.className = `tasks-widget-item${task.urgent ? ' is-urgent' : ''}`;

    const check = document.createElement('span');
    check.className = 'tasks-widget-check';
    check.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-check-mark"></use></svg>';

    const label = document.createElement('span');
    label.className = 'tasks-widget-label';
    label.textContent = task.text;

    item.append(check, label);

    item.addEventListener('click', (event) => {
      event.stopPropagation(); // Evita navegar a la pestaña Nota
      if (window.notch?.tasks?.toggle) {
        window.notch.tasks.toggle(task.id).then((res) => {
          if (res?.tasks) {
            tasksData = res.tasks;
            render();
          }
        });
      }
    });

    listEl.appendChild(item);
  });
}

export const tasksWidget = {
  type: 'tasks',
  name: 'Tareas',
  description: 'Tus tareas pendientes y urgentes',
  icon: 'i-w-tasks',
  accent: '#F43F5E',
  sizes: ['2x1', '1x1'],
  goto: 'note',
  init() {
    loadTasks().then(() => render());
    if (window.notch?.tasks?.onChange) {
      window.notch.tasks.onChange((data) => {
        if (data?.tasks) tasksData = data.tasks;
        render();
      });
    }
  },
  render: () => render(),
  news: () => [],
};
