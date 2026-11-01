// =============================================================================
//  main/audio.js — Las salidas de audio (altavoces, auriculares...)
// -----------------------------------------------------------------------------
//  El WinHelper nos manda la lista de salidas cada vez que cambia:
//    {"type":"audio-devices","devices":[{"id":"...","name":"...","isDefault":true}]}
//  y, cuando eliges otra en la página Música, le pedimos que la haga
//  predeterminada ("set-output <id>"). Si Windows no lo permite, sale un
//  aviso y todo sigue igual.
// =============================================================================

'use strict';

const { sendToRenderer } = require('./bridge');
const { onHelperMessage, onHelperStatus, sendToHelper } = require('./helper');
const { addNotice, clearNotice } = require('./notices');

const RESULT_TIMEOUT = 6000; // si el helper no contesta en 6 s, damos el cambio por fallido
// Forma de los ids de Windows: {0.0.0.00000000}.{guid}. Solo mandamos al
// helper ids con esta forma y que estén en la lista que él mismo nos dio.
const DEVICE_ID = /^\{[0-9.]+\}\.\{[0-9a-f-]+\}$/i;
const MAX_DEVICES = 32;

const audio = {
  devices: [], // [{ id, name, isDefault }]
  pendingId: null, // la salida que estamos poniendo
  pendingTimer: null,
};

function getAudioState() {
  return { devices: audio.devices, pendingId: audio.pendingId };
}

function sendAudioState() {
  sendToRenderer('audio:state', getAudioState());
}

function cleanDevices(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((device) => device && typeof device.id === 'string' && DEVICE_ID.test(device.id))
    .slice(0, MAX_DEVICES)
    .map((device) => ({
      id: device.id,
      name: String(device.name || 'Salida de audio').slice(0, 120),
      isDefault: device.isDefault === true,
    }));
}

/** La página pide usar otra salida. */
function setOutputDevice(id) {
  const device = audio.devices.find((item) => item.id === id);
  if (!device || device.isDefault || audio.pendingId) return;
  audio.pendingId = id;
  sendToHelper(`set-output ${id}`);
  sendAudioState();
  // Un helper antiguo (sin recompilar) no contesta: no nos quedamos esperando.
  audio.pendingTimer = setTimeout(() => finishChange(false), RESULT_TIMEOUT);
}

function finishChange(ok) {
  if (!audio.pendingId) return;
  clearTimeout(audio.pendingTimer);
  audio.pendingId = null;
  if (ok) {
    clearNotice('audio-output');
  } else {
    addNotice({
      key: 'audio-output',
      kind: 'error',
      tone: 'warning',
      title: 'No se pudo cambiar la salida de audio',
      text: 'Windows no lo permitió. Cámbiala en Configuración → Sistema → Sonido.',
      alert: true,
    });
  }
  sendAudioState();
}

onHelperMessage('audio-devices', (message) => {
  audio.devices = cleanDevices(message.devices);
  sendAudioState();
});

onHelperMessage('audio-output-result', (message) => finishChange(message.ok === true));

onHelperStatus((status) => {
  if (status === 'ok') return; // la lista llega enseguida
  audio.devices = [];
  finishChange(false);
  sendAudioState();
});

module.exports = { getAudioState, setOutputDevice };
