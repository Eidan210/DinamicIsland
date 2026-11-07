// =============================================================================
//  renderer/modules/island-style.js — Estilo de la isla (Fase E)
// -----------------------------------------------------------------------------
//  islandStyle ('notch' | 'floating'), glass (cristal simulado) y glassTint.
//  Todo se hace en CSS a partir de atributos de <html>; aquí solo se copian
//  los ajustes. main.js lo llama al cargar y cada vez que cambia settings.json.
// =============================================================================

import { state } from './state.js';

const HEX = /^#[0-9a-f]{6}$/i;

export function applyIslandStyle() {
  const root = document.documentElement;
  const settings = state.settings || {};
  root.dataset.islandStyle = settings.islandStyle === 'floating' ? 'floating' : 'notch';
  root.dataset.islandGlass = String(settings.glass === true);
  // El tinte llega validado desde main/config.js; aquí se vuelve a comprobar porque
  // acaba dentro de CSS.
  if (HEX.test(settings.glassTint)) root.style.setProperty('--glass-tint', settings.glassTint);
  else root.style.removeProperty('--glass-tint');
}
