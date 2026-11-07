// E0: la Casa de Clawd (otra ventana) solo puede usar los canales marcados con { casa: true }.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const registered = {};
const ipcMain = {
  on: (channel, handler) => { registered[`on:${channel}`] = handler; },
  handle: (channel, handler) => { registered[`handle:${channel}`] = handler; },
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  return request === 'electron' ? { ipcMain } : originalLoad.call(this, request, ...rest);
};

const ISLA = 1;
const CASA = 2;
const EXTRAÑA = 3;

describe('bridge: remitentes permitidos', () => {
  before(() => {
    const { state } = require('../main/state');
    state.win = { isDestroyed: () => false, webContents: { id: ISLA } };
    require('../main/casa-clawd').getCasaWindow = () => ({ webContents: { id: CASA } });
    const { onRendererRequest, onRendererMessage } = require('../main/bridge');
    onRendererRequest('prueba:solo-isla', () => 'ok');
    onRendererRequest('prueba:con-casa', () => 'ok', { casa: true });
    onRendererMessage('prueba:aviso-casa', () => { registered.avisoRecibido = true; }, { casa: true });
  });

  const llamar = (canal, id) => registered[`handle:${canal}`]({ sender: { id } });

  it('la isla siempre puede', async () => {
    assert.equal(await llamar('prueba:solo-isla', ISLA), 'ok');
    assert.equal(await llamar('prueba:con-casa', ISLA), 'ok');
  });

  it('la Casa solo puede en canales con casa:true', async () => {
    assert.equal(await llamar('prueba:con-casa', CASA), 'ok');
    assert.equal(await llamar('prueba:solo-isla', CASA), null);
  });

  it('una ventana desconocida nunca puede', async () => {
    assert.equal(await llamar('prueba:con-casa', EXTRAÑA), null);
    assert.equal(await llamar('prueba:solo-isla', EXTRAÑA), null);
  });

  it('los avisos (send) siguen la misma regla', () => {
    registered['on:prueba:aviso-casa']({ sender: { id: EXTRAÑA } });
    assert.equal(registered.avisoRecibido, undefined);
    registered['on:prueba:aviso-casa']({ sender: { id: CASA } });
    assert.equal(registered.avisoRecibido, true);
  });

  it('solo los 7 canales que la Casa necesita llevan casa:true en ipc.js', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'main', 'ipc.js'), 'utf8');
    assert.equal((src.match(/\{ casa: true \}/g) || []).length, 7);
  });
});
