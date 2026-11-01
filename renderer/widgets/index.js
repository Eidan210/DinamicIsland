// =============================================================================
//  renderer/widgets/index.js — El catálogo de widgets de Home
// -----------------------------------------------------------------------------
//  Cada widget vive en su archivo de esta carpeta y exporta su "ficha":
//    type          su nombre interno (el que se guarda en home.json)
//    name          el nombre que ves en el catálogo
//    description   una frase para el catálogo
//    icon          su icono (un <symbol> de index.html)
//    accent        su color (el halo, el brillo de novedades, el catálogo)
//    sizes         los tamaños que admite: '1x1' (1 celda) y/o '2x1' (2 celdas);
//                  el primero es el que se usa al añadirlo
//    goto          la página que abre al tocarlo (null = ninguna)
//    tap()         (opcional) qué hace al tocarlo, en lugar de abrir la página
//    init(context) se llama una vez al arrancar; context.isVisible() dice si
//                  el widget se ve ahora (panel abierto en Home y colocado)
//    render()      lo dibuja (al ver Home y cuando cambian sus datos)
//    news()        sus novedades ahora mismo, como una lista de "motivos"
//                  (textos). Si hay alguno que aún no viste, el widget brilla.
//
//  ⚠️ Los tipos y tamaños, iguales que en main/home.js.
// =============================================================================

import { clockWidget } from './clock.js';
import { musicWidget } from './music.js';
import { focusWidget } from './focus.js';
import { aiWidget } from './ai.js';
import { linksWidget } from './links.js';
import { batteryWidget } from './battery.js';
import { noteWidget } from './note.js';

/** Todos los widgets, en el orden del catálogo. */
export const WIDGETS = [clockWidget, musicWidget, focusWidget, aiWidget, linksWidget, batteryWidget, noteWidget];

export const WIDGET_BY_TYPE = new Map(WIDGETS.map((widget) => [widget.type, widget]));

/** Los 3 diseños que se pueden elegir en el modo edición. */
export const LAYOUT_PRESETS = [
  {
    name: 'Clásico',
    widgets: [
      { type: 'music', size: '2x1' },
      { type: 'focus', size: '1x1' },
      { type: 'ai', size: '1x1' },
      { type: 'links', size: '2x1' },
      { type: 'note', size: '2x1' },
    ],
  },
  {
    name: 'Trabajo',
    widgets: [
      { type: 'ai', size: '2x1' },
      { type: 'focus', size: '2x1' },
      { type: 'note', size: '2x1' },
      { type: 'clock', size: '1x1' },
      { type: 'links', size: '1x1' },
    ],
  },
  {
    name: 'Todo a la vista',
    widgets: [
      { type: 'clock', size: '1x1' },
      { type: 'music', size: '2x1' },
      { type: 'battery', size: '1x1' },
      { type: 'focus', size: '1x1' },
      { type: 'ai', size: '1x1' },
      { type: 'links', size: '1x1' },
      { type: 'note', size: '1x1' },
    ],
  },
];

/** Home la primera vez (el mismo que main/home.js). */
export const DEFAULT_LAYOUT = LAYOUT_PRESETS[0].widgets;
