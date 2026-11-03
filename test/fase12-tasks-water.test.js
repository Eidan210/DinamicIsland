// =============================================================================
//  test/fase12-tasks-water.test.js — Pruebas de Fase 12: Tareas, Agua y Horario
// =============================================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_SETTINGS, validateSettings } = require('../main/config');

describe('Fase 12 — Tareas, Agua y Horario', () => {
  describe('Ajustes de configuración (main/config.js)', () => {
    it('DEFAULT_SETTINGS incluye las opciones de agua y foco', () => {
      assert.strictEqual(DEFAULT_SETTINGS.waterTargetMl, 2000);
      assert.strictEqual(DEFAULT_SETTINGS.waterCupMl, 250);
      assert.strictEqual(DEFAULT_SETTINGS.waterReminderMinutes, 60);
      assert.strictEqual(DEFAULT_SETTINGS.focusTargetMinutes, 120);
      assert.strictEqual(DEFAULT_SETTINGS.focusLongBreakMinutes, 15);
    });

    it('validateSettings valida y ajusta rangos de agua y foco', () => {
      const valid = validateSettings({
        waterTargetMl: 2500,
        waterCupMl: 300,
        waterReminderMinutes: 45,
        focusTargetMinutes: 180,
        focusLongBreakMinutes: 20,
      });
      assert.strictEqual(valid.waterTargetMl, 2500);
      assert.strictEqual(valid.waterCupMl, 300);
      assert.strictEqual(valid.waterReminderMinutes, 45);
      assert.strictEqual(valid.focusTargetMinutes, 180);
      assert.strictEqual(valid.focusLongBreakMinutes, 20);

      const clamped = validateSettings({
        waterTargetMl: 10,       // menor a 500
        waterCupMl: 5,          // menor a 50
        waterReminderMinutes: 5, // menor a 15
        focusTargetMinutes: 5,   // menor a 15
        focusLongBreakMinutes: 2,// menor a 5
      });
      assert.strictEqual(clamped.waterTargetMl, DEFAULT_SETTINGS.waterTargetMl);
      assert.strictEqual(clamped.waterCupMl, DEFAULT_SETTINGS.waterCupMl);
      assert.strictEqual(clamped.waterReminderMinutes, DEFAULT_SETTINGS.waterReminderMinutes);
      assert.strictEqual(clamped.focusTargetMinutes, DEFAULT_SETTINGS.focusTargetMinutes);
      assert.strictEqual(clamped.focusLongBreakMinutes, DEFAULT_SETTINGS.focusLongBreakMinutes);
    });
  });

  describe('Estructura de interfaz (HTML & CSS)', () => {
    it('index.html contiene el segmento de Tareas y Nota rápida', () => {
      const html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
      assert.ok(html.includes('id="note-page"'), 'Debe existir #note-page');
      assert.ok(html.includes('id="note-segments"'), 'Debe existir #note-segments');
      assert.ok(html.includes('data-segment="tasks"'), 'Debe incluir segmento tasks');
      assert.ok(html.includes('id="tasks-urgent-chip"'), 'Debe incluir chip de urgentes');
      assert.ok(html.includes('id="tasks-composer"'), 'Debe incluir formulario rápida de tareas');
      assert.ok(html.includes('id="tasks-input"'), 'Debe incluir input de tarea');
      assert.ok(html.includes('id="tasks-urgent-btn"'), 'Debe incluir botón urgente');
      assert.ok(html.includes('id="tasks-list"'), 'Debe incluir lista de tareas');
    });

    it('styles.css contiene las clases de tareas y color urgente #F43F5E', () => {
      const css = fs.readFileSync(path.join(__dirname, '../renderer/styles.css'), 'utf8');
      assert.ok(css.includes('.note-page'), 'Debe definir .note-page');
      assert.ok(css.includes('.tasks-container'), 'Debe definir .tasks-container');
      assert.ok(css.includes('.task-item'), 'Debe definir .task-item');
      assert.ok(css.includes('.task-checkbox'), 'Debe definir .task-checkbox');
      assert.ok(css.includes('#F43F5E'), 'Debe incluir color rosa urgente #F43F5E');
    });
  });

  describe('Preload y puente IPC', () => {
    it('preload.js expone tasks, water, schedule, focusStats y light.onTrigger', () => {
      const preload = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
      assert.ok(preload.includes('tasks: {'), 'Debe exponer tasks');
      assert.ok(preload.includes('water: {'), 'Debe exponer water');
      assert.ok(preload.includes('schedule: {'), 'Debe exponer schedule');
      assert.ok(preload.includes('focusStats: {'), 'Debe exponer focusStats');
      assert.ok(preload.includes('light: {'), 'Debe exponer light');
      assert.ok(preload.includes('light:urgentTask'), 'Debe escuchar light:urgentTask');
      assert.ok(preload.includes('light:waterReminder'), 'Debe escuchar light:waterReminder');
      assert.ok(preload.includes('light:celebrateWater'), 'Debe escuchar light:celebrateWater');
    });
  });

  describe('Módulos de backend', () => {
    it('main/tasks.js existe y exporta sus funciones principales', () => {
      const tasks = require('../main/tasks');
      assert.strictEqual(typeof tasks.initTasks, 'function');
      assert.strictEqual(typeof tasks.loadTasks, 'function');
      assert.strictEqual(typeof tasks.getTasksState, 'function');
      assert.strictEqual(typeof tasks.addTask, 'function');
      assert.strictEqual(typeof tasks.toggleTask, 'function');
      assert.strictEqual(typeof tasks.removeTask, 'function');
    });

    it('main/water.js existe y exporta sus funciones principales', () => {
      const water = require('../main/water');
      assert.strictEqual(typeof water.initWater, 'function');
      assert.strictEqual(typeof water.loadWater, 'function');
      assert.strictEqual(typeof water.getWaterState, 'function');
      assert.strictEqual(typeof water.drinkWater, 'function');
    });

    it('main/schedule.js existe y exporta sus funciones principales', () => {
      const schedule = require('../main/schedule');
      assert.strictEqual(typeof schedule.initSchedule, 'function');
      assert.strictEqual(typeof schedule.loadSchedule, 'function');
      assert.strictEqual(typeof schedule.getScheduleState, 'function');
      assert.strictEqual(typeof schedule.addEvent, 'function');
      assert.strictEqual(typeof schedule.removeEvent, 'function');
      assert.strictEqual(typeof schedule.toggleEvent, 'function');
    });

    it('main/focus-stats.js existe y exporta sus funciones principales', () => {
      const focus = require('../main/focus-stats');
      assert.strictEqual(typeof focus.initFocusStats, 'function');
      assert.strictEqual(typeof focus.loadFocusStats, 'function');
      assert.strictEqual(typeof focus.getFocusStats, 'function');
      assert.strictEqual(typeof focus.recordFocusBlock, 'function');
    });

    it('schedule.addEvent valida título y hora', () => {
      const schedule = require('../main/schedule');
      const bad = schedule.addEvent({ title: '   ' });
      assert.strictEqual(bad.ok, false);
      assert.strictEqual(bad.error, 'empty');

      const good = schedule.addEvent({ title: 'Clase Node', time: '14:30', days: [1, 3, 5] });
      assert.strictEqual(good.ok, true);
      assert.strictEqual(good.event.title, 'Clase Node');
      assert.strictEqual(good.event.time, '14:30');
      assert.deepStrictEqual(good.event.days, [1, 3, 5]);

      // Limpiar el evento de prueba
      schedule.removeEvent(good.event.id);
    });
  });
});
