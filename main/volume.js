// =============================================================================
//  main/volume.js — El volumen de Windows (vía el WinHelper)
// -----------------------------------------------------------------------------
//  El helper nos avisa cada vez que cambia el volumen o el silencio:
//    {"type":"volume","level":0.42,"muted":false,"initial":false}
//  y se lo pasamos a la página, que enseña una barra en la isla 1,5 s.
//
//  El primer mensaje (initial: true) es el volumen que había al arrancar el
//  helper: lo guardamos, pero no se enseña (nadie lo ha cambiado).
//  Ojo: Windows 11 sigue enseñando su propio indicador; no se puede ocultar.
// =============================================================================

'use strict';

const { sendToRenderer } = require('./bridge');
const { onHelperMessage } = require('./helper');

const volume = {
  level: null, // de 0 a 1 (null = aún no lo sabemos)
  muted: false,
};

function onVolumeMessage(message) {
  const level = Number(message.level);
  if (!Number.isFinite(level)) return;
  volume.level = Math.min(1, Math.max(0, level));
  volume.muted = message.muted === true;
  if (message.initial === true) return;
  sendToRenderer('volume:changed', { ...volume });
}

// Nos suscribimos al helper en cuanto main.js carga este módulo.
onHelperMessage('volume', onVolumeMessage);

/** El último volumen conocido. */
function getVolumeState() {
  return { ...volume };
}

module.exports = { getVolumeState };
