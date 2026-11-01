// =============================================================================
//  renderer/widgets/links.js — Widget Links: los logos de tus webs
// -----------------------------------------------------------------------------
//  1x1: hasta 8 logos pequeños (2 filas de 4).
//  2x1: hasta 6 logos con su nombre debajo.
//  Si hay más, el último hueco es "+N" (y un toque fuera de los logos abre
//  Focus, donde están todos). Los logos salen de Simple Icons (main/links.js).
// =============================================================================

import { $ } from '../modules/utils.js';
import { fillLinkCircle, getLinks, onLinksChange, openLink, paintLink } from '../modules/links.js';

const MAX_LINKS = { '1x1': 8, '2x1': 6 };

const widget = $('home-links-widget');
const list = $('home-links');
const empty = $('home-links-empty');

let drawn = { links: null, size: '' }; // lo último que dibujamos (para no rehacerlo si no cambió)

function render() {
  const links = getLinks();
  const size = widget.dataset.size || '2x1';
  if (drawn.links === links && drawn.size === size) return;
  drawn = { links, size };

  const max = MAX_LINKS[size] || 6;
  const visible = links.length > max ? links.slice(0, max - 1) : links;
  const items = visible.map((link, index) => createLink(link, index, size === '2x1'));
  if (links.length > max) items.push(createMoreChip(links.length - visible.length, max - 1));
  list.replaceChildren(...items);
  // 1x1: en 2 filas parejas (6 links → 3 y 3; 8 → 4 y 4)
  list.style.setProperty('--cols', String(Math.min(4, Math.max(1, Math.ceil(items.length / 2)))));
  empty.hidden = links.length > 0;
  widget.dataset.empty = String(links.length === 0);
}

/** Un logo (y, en 2x1, el nombre debajo). */
function createLink(link, index, withName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'widget-link';
  button.title = `${link.name} · ${link.host}`;
  paintLink(button, link, index);
  const circle = document.createElement('span');
  circle.className = 'widget-link-circle';
  fillLinkCircle(circle, link);
  button.append(circle);
  if (withName) {
    const name = document.createElement('span');
    name.className = 'widget-link-name';
    name.textContent = link.name;
    button.append(name);
  }
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // abrir el link no cuenta como tocar el widget
    openLink(index, circle);
  });
  return button;
}

/** "+3": los que no caben (están todos en Focus). */
function createMoreChip(count, index) {
  const chip = document.createElement('span');
  chip.className = 'widget-link is-more';
  chip.style.setProperty('--i', String(index));
  const circle = document.createElement('span');
  circle.className = 'widget-link-circle';
  circle.textContent = `+${count}`;
  chip.append(circle);
  return chip;
}

export const linksWidget = {
  type: 'links',
  name: 'Links',
  description: 'Tus webs favoritas, con su logo',
  icon: 'i-w-links',
  accent: 'var(--links-color)',
  sizes: ['2x1', '1x1'],
  goto: 'focus',
  init() {
    onLinksChange(render);
  },
  render,
  // Novedad: cambiaste los links (al guardar config/links.json)
  news: () => {
    const links = getLinks();
    return links.length ? [`links:${links.map((link) => link.name).join('|')}`] : [];
  },
};
