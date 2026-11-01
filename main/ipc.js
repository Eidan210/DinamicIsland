// =============================================================================
//  main/ipc.js — Lo que la página puede pedirle al proceso principal
// -----------------------------------------------------------------------------
//  Cada canal de aquí corresponde a una función de window.notch en preload.js.
//  Mirar este archivo es la forma rápida de saber TODO lo que la página puede
//  hacer (y nada más).
// =============================================================================

'use strict';

const { PAGES, state } = require('./state');
const { onRendererMessage, onRendererRequest } = require('./bridge');
const notchWindow = require('./window');
const pomodoro = require('./pomodoro');
const links = require('./links');
const music = require('./music');
const volume = require('./volume');
const note = require('./note');
const notices = require('./notices');
const theme = require('./theme');

function registerIpcHandlers() {
  // Ventana
  onRendererRequest('settings:get', () => state.settings);
  onRendererRequest('theme:get', () => theme.getEffectiveTheme());
  onRendererMessage('notch:set-mouse-interactive', (interactive) => notchWindow.setMouseInteractive(interactive === true));
  onRendererMessage('notch:expand', () => notchWindow.setExpanded(true));
  onRendererMessage('notch:collapse', () => notchWindow.setExpanded(false, { restoreFocus: true }));
  onRendererMessage('notch:context-menu', () => notchWindow.showContextMenu());
  onRendererMessage('notch:tab-changed', (tab) => {
    if (PAGES.includes(tab)) state.currentTab = tab;
  });

  // Pomodoro
  onRendererRequest('pomodoro:get', () => pomodoro.getPomodoroState());
  onRendererMessage('pomodoro:start', () => pomodoro.startPomodoro());
  onRendererMessage('pomodoro:pause', () => pomodoro.pausePomodoro());
  onRendererMessage('pomodoro:reset', () => pomodoro.resetPomodoro());
  onRendererMessage('pomodoro:set-minutes', (minutes) => pomodoro.setPomodoroMinutes(minutes));

  // Links
  onRendererRequest('links:get', () => links.getLinksForRenderer());
  onRendererMessage('links:open', (index) => links.openLink(index));

  // Música y volumen
  onRendererRequest('media:get', () => music.getMusicState());
  onRendererMessage('media:command', (command, value) => music.sendMediaCommand(String(command), Number(value)));
  onRendererRequest('volume:get', () => volume.getVolumeState());

  // Nota rápida
  onRendererRequest('note:get', () => note.readNote());
  onRendererRequest('note:save', (text) => note.saveNote(text));

  // Centro de avisos
  onRendererRequest('notices:get', () => notices.getNotices());
  onRendererMessage('notices:clear', () => notices.clearAllNotices());
}

module.exports = { registerIpcHandlers };
