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
const idle = require('./idle');
const home = require('./home');
const clipboardHistory = require('./clipboard');
const tray = require('./tray');
const tasks = require('./tasks');
const water = require('./water');
const schedule = require('./schedule');
const focusStats = require('./focus-stats');
const weather = require('./weather');
const { app, clipboard, shell } = require('electron');
const config = require('./config');

/** Una lista de textos de la página (ids, rutas...), revisada. */
function stringList(value, max) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, max) : [];
}

function registerIpcHandlers() {
  // Ventana
  onRendererRequest('settings:get', () => state.settings);
  onRendererRequest('settings:save-key', (key, value) => {
    config.saveSetting(String(key), value);
    return { ok: true };
  });
  onRendererMessage('casa:open', () => {
    const casaClawd = require('./casa-clawd');
    casaClawd.openCasaClawd();
  });
  onRendererMessage('app:open-data-folder', () => {
    try {
      const dir = typeof app?.getPath === 'function' ? app.getPath('userData') : '';
      if (dir && typeof shell?.openPath === 'function') shell.openPath(dir);
    } catch (err) {
      console.warn('[ipc] Error abriendo carpeta de datos:', err);
    }
  });
  onRendererRequest('app:get-version', () => (typeof app?.getVersion === 'function' ? app.getVersion() : '0.18.0'));
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

  // Home: qué widgets se ven, en qué orden y de qué tamaño (userData/home.json)
  onRendererRequest('home:get', () => home.getHomeLayout());
  onRendererRequest('home:save', (widgets) => home.saveHomeLayout(widgets));

  // Música, letras, salidas de audio y volumen
  onRendererRequest('media:get', () => music.getMusicState());
  onRendererMessage('media:command', (command, value) => music.sendMediaCommand(String(command), Number(value)));
  onRendererMessage('media:set-activity', (enabled) => music.setMusicActivity(enabled === true));
  onRendererRequest('lyrics:get', () => lyrics.getLyricsState());
  onRendererMessage('lyrics:retry', () => lyrics.retryLyrics());
  onRendererRequest('lyrics:clear-cache', () => lyrics.clearCache());
  onRendererRequest('audio:get', () => audio.getAudioState());
  onRendererMessage('audio:set-output', (id) => audio.setOutputDevice(String(id)));
  onRendererRequest('volume:get', () => volume.getVolumeState());

  // Nota rápida
  onRendererRequest('note:get', () => note.readNote());
  onRendererRequest('note:save', (text) => note.saveNote(text));

  // Portapapeles: lo que copiaste (solo en memoria)
  onRendererRequest('clipboard:get', () => clipboardHistory.getClipboardState());
  onRendererRequest('clipboard:copy', (id) => clipboardHistory.copyClip(String(id)));
  onRendererRequest('clipboard:pin', (id, pinned) => clipboardHistory.pinClip(String(id), pinned === true));
  onRendererMessage('clipboard:remove', (id) => clipboardHistory.removeClip(String(id)));
  onRendererMessage('clipboard:clear', () => clipboardHistory.clearClips());
  onRendererMessage('clipboard:pause', (paused) => clipboardHistory.setClipboardPaused(paused === true));

  // Bandeja de archivos (la página nunca ve las rutas: las saca preload.js al soltar)
  onRendererRequest('tray:get', () => tray.getTrayState());
  onRendererRequest('tray:add', (paths) => tray.addPaths(stringList(paths, 200)));
  onRendererRequest('tray:pick', () => tray.pickFiles());
  onRendererMessage('tray:remove', (id) => tray.removeItem(String(id)));
  onRendererMessage('tray:clear', () => tray.clearTray());
  onRendererMessage('tray:refresh', () => tray.refreshTray());
  onRendererMessage('tray:drag', (ids) => tray.startDragOut(stringList(ids, tray.MAX_ITEMS)));
  onRendererMessage('tray:show', (id) => tray.showInFolder(String(id)));
  onRendererRequest('tray:open', (id) => tray.openFile(String(id)));

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

  // Clawd: ¿está dormido? (llevas un rato sin tocar el PC o está bloqueado)
  onRendererRequest('clawd:get', () => ({ sleeping: idle.isSleeping() }));

  // Chat
  onRendererRequest('chat:get', () => aiChat.getChatState());
  onRendererRequest('chat:send', (text, options) => aiChat.sendChat(String(text), options && typeof options === 'object' ? options : {}));
  onRendererRequest('chat:copy', (id) => aiChat.copyMessage(String(id)));
  onRendererMessage('chat:cancel', () => aiChat.cancelChat());
  onRendererMessage('chat:clear', () => aiChat.clearChat());

  // Tareas (Fase 12)
  onRendererRequest('tasks:get', () => tasks.getTasksState());
  onRendererRequest('tasks:add', (data) => tasks.addTask(data || {}));
  onRendererRequest('tasks:toggle', (id) => tasks.toggleTask(String(id)));
  onRendererRequest('tasks:remove', (id) => tasks.removeTask(String(id)));

  // Agua / Hidratación (Fase 12)
  onRendererRequest('water:get', () => water.getWaterState());
  onRendererRequest('water:drink', (ml) => water.drinkWater(ml));

  // Horario (Fase 12)
  onRendererRequest('schedule:get', () => schedule.getScheduleState());
  onRendererRequest('schedule:add', (data) => schedule.addEvent(data || {}));
  onRendererRequest('schedule:remove', (id) => schedule.removeEvent(String(id)));
  onRendererRequest('schedule:toggle', (id) => schedule.toggleEvent(String(id)));

  // Focus Stats (Fase 12)
  onRendererRequest('focus:get-stats', () => focusStats.getFocusStats());

  // Clima (Fase 13)
  onRendererRequest('weather:get', () => weather.getWeather());

  // IA Rápida (Fase 14)
  const aiQuick = require('./ai-quick');
  onRendererMessage('ai:quick-open', () => aiQuick.openAiQuick());
  onRendererMessage('ai:quick-close', () => aiQuick.closeAiQuick());
  onRendererMessage('ai:paste-to-app', (text) => aiQuick.pasteToApp(String(text || '')));
  onRendererRequest('ai:capture-screen', () => aiQuick.captureScreen());
  onRendererRequest('ai:get-active-app', () => aiQuick.getActiveApp());

  // Dictado por voz (Fase 15)
  const voice = require('./voice');
  onRendererMessage('voice:start', () => voice.startVoice());
  onRendererMessage('voice:stop', () => voice.stopVoice());
  onRendererMessage('voice:cancel', () => voice.cancelVoice());
  onRendererRequest('voice:status', () => voice.getVoiceStatus());
  onRendererMessage('voice:paste', (text) => voice.pasteToApp(String(text || '')));
  onRendererMessage('voice:open-privacy', () => voice.openMicPrivacySettings());
  onRendererRequest('voice:download-model', () => voice.downloadModel());

}

module.exports = { registerIpcHandlers };
