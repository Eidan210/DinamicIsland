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
