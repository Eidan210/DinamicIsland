// Estilo Apple · Bloque 3: nombres de modelo legibles, copys sin separadores y estados vacíos planos.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const { shortModel } = require('../renderer/modules/utils.js');

describe('shortModel', () => {
  it('quita el nivel de esfuerzo de Gemini y capitaliza', () => {
    assert.equal(shortModel('gemini-3.8-flash-high'), 'Gemini 3.8 Flash');
    assert.equal(shortModel('gemini-4-argon-medium'), 'Gemini 4 Argon');
    assert.equal(shortModel('gemini-flash'), 'Gemini Flash');
  });

  it('sigue resumiendo Claude y respeta auto/vacío', () => {
    assert.equal(shortModel('claude-sonnet-4-6[1m]'), 'Sonnet 4.6');
    assert.equal(shortModel('auto'), '');
    assert.equal(shortModel(''), '');
    assert.equal(shortModel(undefined), '');
  });
});

describe('estilo Apple: textos y estados vacíos', () => {
  const css = read('renderer/styles.css');

  it('los copys del chat vacío no usan el separador "·"', () => {
    const chat = read('renderer/modules/chat.js');
    const block = chat.slice(chat.indexOf('const EMPTY_COPIES'), chat.indexOf('const ERRORS'));
    assert.ok(block.includes('gemini:') && !block.includes('·'), block);
    assert.ok(!read('renderer/index.html').includes('Sin guardar la conversación'));
  });

  it('la insignia del modelo no va en mayúsculas', () => {
    const rule = /\.ai-input-model-badge \{[^}]*\}/.exec(css)[0];
    assert.ok(!/uppercase/.test(rule), rule);
  });

  it('el icono del estado vacío del portapapeles es plano (sin círculo de color)', () => {
    const rule = /\.clip-empty-icon \{[^}]*\}/.exec(css)[0];
    assert.ok(!/border-radius|background/.test(rule), rule);
  });

  it('el selector segmentado usa los tokens de la barra de pestañas', () => {
    assert.match(css, /\.segmented \{[^}]*background: var\(--tab-track\)/);
    assert.match(css, /\.segmented-indicator \{[^}]*background: var\(--tab-thumb\)/);
  });
});

describe('estilo Apple: Casa de Clawd', () => {
  const css = read('renderer/casa-clawd.css');
  const html = read('renderer/casa-clawd.html');
  const js = read('renderer/casa-clawd.js');

  it('usa el verde de la isla como acento y deja el naranja solo para el logo', () => {
    assert.match(css, /--accent: #30d158;/);
    assert.match(css, /--clawd-orange: #f59e0b;/);
    assert.match(css, /data-theme="light"\] \{[^}]*--accent: #1f7a35;/); // AA con texto blanco en el botón primario
    assert.match(css, /\.casa-clawd-icon \{[^}]*background: var\(--clawd-orange\)/);
    assert.ok(!/radial-gradient/.test(css), 'sin degradado decorativo de fondo');
  });

  it('la navegación y los títulos no están numerados', () => {
    assert.ok(!html.includes('nav-num') && !css.includes('nav-num'));
    assert.ok(!/<h3>\d+\./.test(html));
  });

  it('el estado del servidor usa los tokens y no colores sueltos ni brillos', () => {
    assert.ok(!/#22c55e|#ef4444|boxShadow/.test(js));
  });
});

describe('tarjeta del dictado', () => {
  const css = read('renderer/styles.css');
  const voice = read('renderer/modules/voice.js');

  it('el resultado es una tarjeta cuya altura sale del texto (--voice-card-h)', () => {
    assert.match(css, /data-voice-state="done"\][^{}]*\{[^}]*height: var\(--voice-card-h/);
    assert.match(voice, /setProperty\('--voice-card-h'/);
  });

  it('el texto completo se lee: sin tope de 2 líneas y con scroll a partir de 6 filas', () => {
    const rule = /\.voice-banner\[data-state="done"\] \.voice-transcript \{[^}]*\}/.exec(css)[0];
    assert.ok(/max-height: calc\(6 \* 1\.4em\)/.test(rule) && /overflow-y: auto/.test(rule), rule);
  });

  it('descartar la tarjeta le dice a main que vuelva a idle', () => {
    const fn = voice.slice(voice.indexOf('export function dismissVoice'), voice.indexOf('/** Manejo de cambios de estado'));
    assert.match(fn, /status === 'done'\) window\.notch\.voice\?\.cancel\(\)/);
  });
});
