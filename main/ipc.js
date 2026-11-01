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
const lyrics = require('./lyrics');
const audio = require('./audio');
const volume = require('./volume');
const note = require('./note');
const notices = require('./notices');
const theme = require('./theme');
const aiSessions = require('./ai-sessions');
const aiServer = require('./ai-server');
const aiChat = require('./ai-chat');
const { clipboard } = require('electron');

function registerIpcHandlers() {
  // Ventana
  onRendererRequest('settings:get', () => state.settings);
  onRendererRequest('theme:get', () => theme.getEffectiveTheme());
  onRendererMessage('notch:set-mouse-interactive', (interactive) => notchWindow.setMouseInteractive(interactive === true));
  onRendererMessage('notch:expand', () => notchWindow.setExpanded(true));
  onRendererMessage('notch:collapse', () => notchWindow.setExpanded(false, { restoreFocus: true }));
  onRendererMessage('notch:context-menu', () => notchWindow.showContextMenu());
  onRendererMessage('notch:release-focus', () => notchWindow.releaseFocus());
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

  // Música, letras, salidas de audio y volumen
  onRendererRequest('media:get', () => music.getMusicState());
  onRendererMessage('media:command', (command, value) => music.sendMediaCommand(String(command), Number(value)));
  onRendererMessage('media:set-activity', (enabled) => music.setMusicActivity(enabled === true));
  onRendererRequest('lyrics:get', () => lyrics.getLyricsState());
  onRendererMessage('lyrics:retry', () => lyrics.retryLyrics());
  onRendererRequest('audio:get', () => audio.getAudioState());
  onRendererMessage('audio:set-output', (id) => audio.setOutputDevice(String(id)));
  onRendererRequest('volume:get', () => volume.getVolumeState());

  // Nota rápida
  onRendererRequest('note:get', () => note.readNote());
  onRendererRequest('note:save', (text) => note.saveNote(text));

  // Centro de avisos
  onRendererRequest('notices:get', () => notices.getNotices());
  onRendererMessage('notices:clear', () => notices.clearAllNotices());

  // IA: sesiones de Claude Code / Antigravity y sus decisiones
  onRendererRequest('ai:get', () => aiSessions.getAiState());
  onRendererRequest('ai:decide', (id, decision, data) => aiSessions.decide(String(id), String(decision), data));
  // Copia la configuración para pegar (Notch no toca tus archivos): 'claude' o 'agy'
  onRendererRequest('ai:copy-setup', (kind) => {
    clipboard.writeText(aiServer.getSetupText(kind === 'agy' ? 'agy' : 'claude'));
    return true;
  });

  // Chat
  onRendererRequest('chat:get', () => aiChat.getChatState());
  onRendererRequest('chat:send', (text, options) => aiChat.sendChat(String(text), options && typeof options === 'object' ? options : {}));
  onRendererMessage('chat:cancel', () => aiChat.cancelChat());
  onRendererMessage('chat:clear', () => aiChat.clearChat());
}

module.exports = { registerIpcHandlers };
