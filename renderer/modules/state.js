// =============================================================================
//  renderer/modules/state.js — Estado compartido de la interfaz
// -----------------------------------------------------------------------------
//  Lo que varios módulos necesitan leer vive aquí, en un único objeto. Cada
//  módulo cambia solo "su" parte (p. ej. pomodoro.js cambia state.pomodoro) y
//  los demás la leen cuando la necesitan.
// =============================================================================

export const state = {
  // config/settings.json (main.js lo rellena al arrancar y cada vez que lo guardas)
  settings: {
    shortcut: 'Control+Alt+T',
    pageShortcuts: {},
    theme: 'auto',
    animations: 'always',
    locale: 'es-ES',
    hour12: false,
    autoHide: true,
    revealOnHover: true,
    pomodoroMinutes: 25,
    musicActivity: true,
    lyricsOffset: 0,
    lyricsVisible: true,
    volumeIndicator: true,
    glow: true,
    clawd: true,
    clawdSleepMinutes: 5,
    clawdByeTime: '18:00',
    clawdCostume: 'auto',
  },
  isExpanded: false, // ¿el panel está abierto?
  initialized: false, // ¿terminó el arranque?

  // Ratón (solo nos llegan sus movimientos cuando pasa por la zona de la ventana)
  mouseInteractive: false, // ¿le hemos pedido a main que la ventana reciba clics?
  pointerInside: false, // ¿el ratón está dentro de la zona de la ventana?
  lastPointer: { x: 0, y: 0 }, // última posición conocida

  // Forma actual de la isla:
  // 'mini' | 'pill' | 'activity' | 'volume' | 'banner' | 'alert' | 'drop' | 'decision' | 'expanded'
  shape: 'mini',
  aiQuickOpen: false, // ¿está abierta la caja de IA rápida? (Fase 14)
  fileDrag: false, // ¿estás arrastrando archivos sobre la isla? (tray.js)

  // Pomodoro (lo actualiza pomodoro.js con lo que manda main)
  pomodoro: {
    status: 'idle',
    durationMs: 25 * 60 * 1000,
    remainingMs: 25 * 60 * 1000,
    endsAt: null,
    minutes: 25,
    completedToday: 0,
  },
  celebrateUntil: 0, // hasta cuándo dura la celebración de "Pomodoro terminado"

  // Música (la actualiza music.js con lo que manda el helper)
  media: {
    available: 'starting',
    status: 'none',
    title: '',
    artist: '',
    album: '',
    appName: '',
    position: 0,
    duration: 0,
    rate: 1,
    timestamp: 0,
    canPlayPause: false,
    canNext: false,
    canPrevious: false,
    canSeek: false,
  },
  musicGraceUntil: 0, // la actividad de música aguanta un momento al dejar de sonar

  // Volumen de Windows (lo actualiza volume.js), de 0 a 1
  volume: { level: 0, muted: false },

  // Batería (la actualiza battery.js). En un PC de sobremesa: llena y "cargando".
  battery: { level: 1, charging: true },

  // IA: sesiones de Claude Code / Antigravity y decisiones pendientes (ai.js)
  ai: { server: { listening: false, port: 0, error: '' }, lastEventAt: 0, sessions: [], pending: [] },
  aiDoneUntil: 0, // al terminar una sesión, la isla enseña "Hecho" hasta entonces
  aiDoneId: '', // ...de esta sesión

  // Clawd: ¿llevas un rato sin tocar el PC (o está bloqueado)? (lo cuenta main.js)
  clawdSleeping: false,

  // Chat (chat.js)
  chat: { messages: [], busy: false, provider: 'gemini', claudeModel: 'sonnet' },
  // Dictado por voz (Fase 15, voice.js)
  voice: { status: 'idle', level: 0, transcript: '', error: null },
};
