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
    locale: 'es-ES',
    hour12: false,
    autoHide: true,
    revealOnHover: true,
    pomodoroMinutes: 25,
    musicActivity: true,
  },
  isExpanded: false, // ¿el panel está abierto?
  initialized: false, // ¿terminó el arranque?

  // Ratón (solo nos llegan sus movimientos cuando pasa por la zona de la ventana)
  mouseInteractive: false, // ¿le hemos pedido a main que la ventana reciba clics?
  pointerInside: false, // ¿el ratón está dentro de la zona de la ventana?
  lastPointer: { x: 0, y: 0 }, // última posición conocida

  // Forma actual de la isla: 'mini' | 'pill' | 'activity' | 'banner' | 'expanded'
  shape: 'mini',

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
};
