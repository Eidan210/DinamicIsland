// =============================================================================
//  renderer/modules/links.js — Los links (pestaña Focus y tarjeta de Home)
// -----------------------------------------------------------------------------
//  main.js nos manda nombre, inicial y color de cada link (no las urls): para
//  abrir uno le decimos su número y main.js lo abre en tu navegador.
// =============================================================================

import { $, animate } from './utils.js';

const HOME_LINKS_MAX = 6; // círculos que caben en la tarjeta de Home

const linksGrid = $('links-grid');
const linksEmpty = $('links-empty');
const homeLinks = $('home-links');
const homeLinksEmpty = $('home-links-empty');

let links = [];

/** Guarda la lista nueva y la dibuja. */
export function setLinks(newLinks) {
  links = Array.isArray(newLinks) ? newLinks : [];
  renderLinks();
}

function renderLinks() {
  // Pestaña Focus: todos
  linksGrid.replaceChildren(...links.map((link, index) => createLinkButton(link, index)));
  linksEmpty.hidden = links.length > 0;

  // Tarjeta de Home: hasta 6. Si hay más, el último hueco es "+N".
  const visible = links.length > HOME_LINKS_MAX ? links.slice(0, HOME_LINKS_MAX - 1) : links;
  const items = visible.map((link, index) => createMiniLink(link, index));
  if (links.length > HOME_LINKS_MAX) items.push(createMoreChip(links.length - visible.length));
  homeLinks.replaceChildren(...items);
  homeLinksEmpty.hidden = links.length > 0;
}

/** Botón redondo grande con la inicial y el nombre debajo (pestaña Focus). */
function createLinkButton(link, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-btn';
  button.title = `${link.name} · ${link.host}`;
  paintLink(button, link, index);

  const circle = document.createElement('span');
  circle.className = 'link-circle';
  circle.textContent = link.initial; // textContent (no innerHTML): nunca ejecuta nada
  const name = document.createElement('span');
  name.className = 'link-name';
  name.textContent = link.name;
  button.append(circle, name);

  button.addEventListener('click', () => openLink(index, circle));
  return button;
}

/** Círculo pequeño (tarjeta de Home). */
function createMiniLink(link, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-link';
  button.title = `${link.name} · ${link.host}`;
  button.textContent = link.initial;
  paintLink(button, link, index);
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // que no cuente también como clic en la tarjeta
    openLink(index, button);
  });
  return button;
}

/** "+3": al pulsarlo, la tarjeta te lleva a Focus, donde están todos. */
function createMoreChip(count) {
  const chip = document.createElement('span');
  chip.className = 'mini-link more';
  chip.textContent = `+${count}`;
  chip.style.setProperty('--i', String(HOME_LINKS_MAX - 1));
  return chip;
}

/** Color, color del texto y posición (para la entrada en cascada) como variables CSS. */
function paintLink(element, link, index) {
  element.style.setProperty('--link-color', link.color);
  element.style.setProperty('--link-text', link.textColor);
  element.style.setProperty('--i', String(index));
}

function openLink(index, circle) {
  animate(circle, [{ scale: '1' }, { scale: '0.85' }, { scale: '1.15' }, { scale: '1' }], {
    duration: 420,
    easing: 'ease-out',
  });
  window.notch.links.open(index);
}

export function initLinks() {
  // Al guardar config/links.json, main.js nos manda la lista nueva.
  window.notch.links.onChange(setLinks);
}
