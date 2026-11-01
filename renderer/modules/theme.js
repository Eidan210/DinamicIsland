// =============================================================================
//  renderer/modules/theme.js — Tema claro u oscuro del panel
// -----------------------------------------------------------------------------
//  main/theme.js decide el tema ("theme" de settings.json; con "auto", el modo
//  de Windows) y nos lo manda. Lo ponemos en <html data-theme="light|dark"> y
//  styles.css (sección 14) hace el resto. La isla compacta es siempre negra.
// =============================================================================

const root = document.documentElement;

export function setTheme(theme) {
  root.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

export function initTheme() {
  window.notch.theme.onChange(setTheme);
}
