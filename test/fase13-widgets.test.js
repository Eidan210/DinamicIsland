// =============================================================================
//  test/fase13-widgets.test.js — Pruebas de Fase 13: Widgets Nuevos para Home
// =============================================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DEFAULT_SETTINGS, validateSettings } = require('../main/config');
const { getWeather, describeWeatherCode, WEATHER_CODES } = require('../main/weather');

describe('Fase 13 — Widgets nuevos para Home', () => {
  describe('Ajustes de configuración (main/config.js)', () => {
    it('DEFAULT_SETTINGS incluye las opciones de los nuevos widgets', () => {
      assert.strictEqual(DEFAULT_SETTINGS.countdownDate, '2026-12-31');
      assert.strictEqual(DEFAULT_SETTINGS.countdownTitle, 'Fin de Campuslands');
      assert.deepStrictEqual(DEFAULT_SETTINGS.worldClockCities, ['America/Bogota', 'Europe/Madrid']);
      assert.strictEqual(DEFAULT_SETTINGS.weather, false, 'El clima debe estar apagado por defecto');
      assert.strictEqual(DEFAULT_SETTINGS.weatherCity, 'Bucaramanga');
      assert.strictEqual(DEFAULT_SETTINGS.weatherLat, 7.1193);
      assert.strictEqual(DEFAULT_SETTINGS.weatherLon, -73.1227);
    });

    it('validateSettings valida y ajusta opciones de los nuevos widgets', () => {
      const valid = validateSettings({
        countdownDate: '2027-06-15',
        countdownTitle: 'Mi graduación',
        worldClockCities: ['America/New_York', 'Asia/Tokyo'],
        weather: true,
        weatherCity: 'Medellín',
        weatherLat: 6.2442,
        weatherLon: -75.5812,
      });

      assert.strictEqual(valid.countdownDate, '2027-06-15');
      assert.strictEqual(valid.countdownTitle, 'Mi graduación');
      assert.deepStrictEqual(valid.worldClockCities, ['America/New_York', 'Asia/Tokyo']);
      assert.strictEqual(valid.weather, true);
      assert.strictEqual(valid.weatherCity, 'Medellín');
      assert.strictEqual(valid.weatherLat, 6.2442);
      assert.strictEqual(valid.weatherLon, -75.5812);

      // Fallbacks ante valores inválidos
      const fallback = validateSettings({
        countdownDate: 'fecha-mala',
        countdownTitle: '',
        worldClockCities: 'no-array',
        weather: 'invalid',
        weatherLat: 999, // fuera de rango
        weatherLon: -999,
      });

      assert.strictEqual(fallback.countdownDate, DEFAULT_SETTINGS.countdownDate);
      assert.strictEqual(fallback.countdownTitle, DEFAULT_SETTINGS.countdownTitle);
      assert.deepStrictEqual(fallback.worldClockCities, DEFAULT_SETTINGS.worldClockCities);
      assert.strictEqual(fallback.weather, false);
      assert.strictEqual(fallback.weatherLat, DEFAULT_SETTINGS.weatherLat);
      assert.strictEqual(fallback.weatherLon, DEFAULT_SETTINGS.weatherLon);
    });
  });

  describe('Catálogo en Backend (main/home.js)', () => {
    it('home.js define los nuevos tipos de widgets en WIDGET_SIZES', () => {
      const homeCode = fs.readFileSync(path.join(__dirname, '../main/home.js'), 'utf8');
      const requiredTypes = [
        'week',
        'next-event',
        'focus-today',
        'water',
        'tasks',
        'world-clock',
        'countdown',
        'weather',
      ];
      for (const type of requiredTypes) {
        const found = homeCode.includes(`${type}:`) || homeCode.includes(`'${type}':`) || homeCode.includes(`"${type}":`);
        assert.ok(found, `WIDGET_SIZES debe incluir ${type}`);
      }
    });
  });

  describe('Links a carpetas y programas (main/links.js)', () => {
    it('links.js soporta paths locales en normalizeLink y openLink', () => {
      const linksCode = fs.readFileSync(path.join(__dirname, '../main/links.js'), 'utf8');
      assert.ok(linksCode.includes('localPath'), 'Debe gestionar localPath');
      assert.ok(linksCode.includes('shell.openPath'), 'Debe usar shell.openPath para rutas locales');
    });
  });

  describe('Módulo de Clima Open-Meteo (main/weather.js)', () => {
    it('getWeather devuelve { enabled: false } cuando weather es false', async () => {
      const res = await getWeather();
      assert.strictEqual(res.enabled, false, 'No debe realizar llamadas a internet si weather: false');
    });

    it('describeWeatherCode traduce códigos WMO a español e iconos válidos', () => {
      assert.deepStrictEqual(describeWeatherCode(0), { label: 'Despejado', icon: 'sun' });
      assert.deepStrictEqual(describeWeatherCode(2), { label: 'Parcialmente nublado', icon: 'cloud-sun' });
      assert.deepStrictEqual(describeWeatherCode(3), { label: 'Nublado', icon: 'cloud' });
      assert.deepStrictEqual(describeWeatherCode(61), { label: 'Lluvia leve', icon: 'rain' });
      assert.deepStrictEqual(describeWeatherCode(95), { label: 'Tormenta eléctrica', icon: 'thunder' });
    });
  });

  describe('Estructura HTML (renderer/index.html)', () => {
    it('index.html contiene los artículos y símbolos SVG de los 8 nuevos widgets', () => {
      const html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
      const requiredWidgets = [
        'home-week',
        'home-next-event',
        'home-focus-today',
        'home-water',
        'home-tasks',
        'home-world-clock',
        'home-countdown',
        'home-weather',
      ];
      for (const id of requiredWidgets) {
        assert.ok(html.includes(`id="${id}"`), `index.html debe contener elemento #${id}`);
      }

      const requiredSymbols = [
        'id="i-w-week"',
        'id="i-w-event"',
        'id="i-w-water"',
        'id="i-w-tasks"',
        'id="i-w-world"',
        'id="i-w-countdown"',
        'id="i-w-weather"',
      ];
      for (const sym of requiredSymbols) {
        assert.ok(html.includes(sym), `index.html debe contener símbolo ${sym}`);
      }
    });
  });

  describe('Estilos CSS (renderer/styles.css)', () => {
    it('styles.css contiene las clases de los nuevos widgets', () => {
      const css = fs.readFileSync(path.join(__dirname, '../renderer/styles.css'), 'utf8');
      assert.ok(css.includes('.widget-week'), 'Debe definir .widget-week');
      assert.ok(css.includes('.widget-next-event'), 'Debe definir .widget-next-event');
      assert.ok(css.includes('.widget-focus-today'), 'Debe definir .widget-focus-today');
      assert.ok(css.includes('.widget-water'), 'Debe definir .widget-water');
      assert.ok(css.includes('.widget-tasks'), 'Debe definir .widget-tasks');
      assert.ok(css.includes('.widget-world-clock'), 'Debe definir .widget-world-clock');
      assert.ok(css.includes('.widget-countdown'), 'Debe definir .widget-countdown');
      assert.ok(css.includes('.widget-weather'), 'Debe definir .widget-weather');
    });
  });

  describe('Preload y puente IPC (preload.js)', () => {
    it('preload.js expone weather.get', () => {
      const preload = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
      assert.ok(preload.includes("weather:"), 'Debe exponer notch.weather');
      assert.ok(preload.includes("'weather:get'"), 'Debe invocar canal weather:get');
    });
  });
});
