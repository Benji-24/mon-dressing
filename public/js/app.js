import { CATEGORIES, GENDERS, categoriesFor, COLORS, FITS, STYLES, SEASONS, STATUSES, OCCASIONS, STYLE_REQUESTS, WEAR_PREFS, catOf, colorOf, statusOf, isAvailable, seasonForDate } from './catalog.js';
import { db, uid, savePhoto, photoURL, deletePhotos, exportAll, importAll, storageInfo, requestPersist, getMeta, setMeta } from './db.js';
import { api, settings, loadImage, resizeTo, blobToBase64, fetchWeather } from './api.js';
import { generateOutfits, pickNext } from './stylist.js';
import { makeSticker } from './cutout.js';
import { renderOutfitImage } from './collage.js';
import { renderAvatar, SKIN_TONES, skinHex } from './avatar.js';
import { extractImage, b64ToBlob } from './aiavatar.js';
import { addHistory, filterHistory, summary, chartSVG, fmtRating } from './progress.js';

// ================= Utilitaires =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const haptic = () => { try { navigator.vibrate?.(8); } catch { /* iOS ignore */ } };

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  hanger: '<path d="M10 5.5a2 2 0 1 1 2 2v1.3"/><path d="M12 8.8 2.9 15.2A1.6 1.6 0 0 0 3.8 18h16.4a1.6 1.6 0 0 0 .9-2.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  locate: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  dress: '<path d="M9 3 8.2 9.5 4 21h16l-4.2-11.5L15 3"/><path d="M8.2 9.5h7.6M9 3h6"/>',
  shirt: '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  washer: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M8 6.5h.01M11 6.5h3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  hand: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L4 15a1.5 1.5 0 0 1 2.3-1.9L7 14"/>',
};
const icon = (n, extra = '') => `<svg class="i" ${extra} viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

const swatchStyle = (id) => `background:${colorOf(id)?.hex || '#333'}`;
const swatch = (id, size = 12) => `<span class="sw" style="${swatchStyle(id)};width:${size}px;height:${size}px"></span>`;
const statusColor = (s) => `var(--st-${s})`;

// ================= État =================
const state = {
  profile: null,
  me: null,
  history: [],
  pf: 'ai',
  pfTable: false,
  items: [],
  outfits: [],
  health: null, // réponse /api/health ou {error}
  lastExport: null,
  w: { q: '', status: 'all', cat: 'all', colors: [], brands: [], styles: [], sort: 'recent' },
  favQ: '',
  st: {
    mode: null, style: 'streetwear', customStyle: '', occasion: 'quotidien', season: seasonForDate(),
    tempMode: 'manual', temp: 18, weather: null, formality: null,
    preferColors: [], avoidColors: [], mustItems: [], shoesId: null,
    result: null, shownKeys: [], loading: false,
  },
};
const aiReady = () => !!(state.health?.configured?.ai && state.health?.configured?.password && state.health?.authorized);
const itemById = (id) => state.items.find((i) => i.id === id);

async function loadData() {
  const [items, outfits] = await Promise.all([db.all('items'), db.all('outfits')]);
  state.items = items;
  state.outfits = outfits;
  state.lastExport = await getMeta('lastExport');
  state.profile = await getMeta('profile');
  state.me = await getMeta('me');
  state.history = (await getMeta('history')) || [];
  applyProfile();
}

function applyProfile() {
  document.documentElement.dataset.profile = state.profile?.gender || 'm';
}
const gender = () => state.profile?.gender || 'm';
const visibleCategories = () => categoriesFor(gender(), state.items);

async function refreshHealth() {
  try { state.health = await api.health(); }
  catch (e) { state.health = { error: e.message, code: e.code }; }
  if (state.st.mode === null) state.st.mode = aiReady() ? 'ai' : 'local';
}

// ================= Toasts & dialogues =================
function toast(msg, { type = 'ok', action, onAction, timeout = 3200 } = {}) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { onAction?.(); el.remove(); };
  root.appendChild(el);
  while (root.children.length > 2) root.firstElementChild.remove();
  setTimeout(() => el.remove(), type === 'error' ? Math.max(timeout, 5500) : timeout);
}

function dialog({ title, text, buttons }) {
  return new Promise((resolve) => {
    const bd = document.createElement('div'); bd.className = 'backdrop'; bd.style.zIndex = 69;
    const d = document.createElement('div'); d.className = 'dialog'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p><div style="display:flex;flex-direction:column;gap:8px">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`;
    const close = (v) => { bd.remove(); d.remove(); resolve(v); };
    bd.onclick = () => close(null);
    d.querySelectorAll('button').forEach((b) => { b.onclick = () => close(buttons[+b.dataset.i].value); });
    document.body.append(bd, d);
  });
}
const confirmDialog = (title, text, ok = 'Confirmer', danger = false) => dialog({ title, text, buttons: [{ label: ok, value: true, cls: danger ? 'btn-danger' : 'btn-primary' }, { label: 'Annuler', value: false, cls: 'btn-ghost' }] });

// ================= Feuilles (bottom sheets) =================
const sheets = [];
function openSheet({ title, render, full = false, onClose }) {
  const root = $('#sheet-root');
  const bd = document.createElement('div'); bd.className = 'backdrop';
  const el = document.createElement('section'); el.className = `sheet${full ? ' full' : ''}`;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', title);
  const api = {
    el,
    closed: false,
    refresh() {
      const { body, foot } = render(api);
      el.innerHTML = `<header class="sheet-head"><h2>${esc(api.title || title)}</h2><button class="icon-btn" data-sheet-close aria-label="Fermer">${icon('x')}</button></header><div class="sheet-body">${body}</div>${foot ? `<footer class="sheet-foot">${foot}</footer>` : ''}`;
      el.querySelector('[data-sheet-close]').onclick = () => api.close();
      hydratePhotos(el);
    },
    async close(reason) {
      if (api.closed) return;
      if (api.beforeClose && reason !== 'force' && reason !== 'saved' && !(await api.beforeClose())) return;
      api.closed = true;
      el.classList.add('closing'); bd.style.opacity = '0'; bd.style.transition = 'opacity .2s';
      setTimeout(() => { el.remove(); bd.remove(); }, 220);
      sheets.splice(sheets.indexOf(api), 1);
      onClose?.(reason);
    },
  };
  bd.onclick = () => api.close();
  root.append(bd, el);
  sheets.push(api);
  api.refresh();
  return api;
}

// ================= Photos =================
async function hydratePhotos(root = document) {
  for (const el of $$('[data-photo]', root)) {
    const id = el.dataset.photo;
    if (!id || el.dataset.loaded === id) continue;
    el.dataset.loaded = id;
    const url = await photoURL(id);
    if (url) { el.style.backgroundImage = `url("${url}")`; el.innerHTML = ''; }
  }
}
function photoBox(item, cls = 'photo', extra = '') {
  const id = item?.photos?.[0];
  const ph = item ? `<span class="swatch-big" style="${swatchStyle(item.primaryColor)};width:44px;height:44px;border-radius:50%;display:block;border:1px solid var(--line-2)"></span>` : icon('shirt');
  return `<div class="${cls}" ${id ? `data-photo="${esc(id)}"` : ''} ${extra}>${ph}</div>`;
}

// ================= Navigation =================
const ROUTES = ['home', 'dressing', 'styliste', 'favoris', 'reglages', 'profil'];
const route = () => { const r = (location.hash || '#/home').replace('#/', '').split('?')[0]; return ROUTES.includes(r) ? r : 'home'; };
const go = (r) => { if (route() === r) render(); else location.hash = `#/${r}`; };

function renderTabbar() {
  const r = route();
  const tab = (id, ic, lbl) => `<a class="tab" href="#/${id}" ${r === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${lbl}</span></a>`;
  $('#tabbar').innerHTML = `${tab('home', 'home', 'Accueil')}${tab('dressing', 'hanger', 'Dressing')}<button class="tab-add" data-act="add-item" aria-label="Ajouter un vêtement"><span>${icon('plus')}</span></button>${tab('styliste', 'sparkle', 'Styliste')}${tab('favoris', 'heart', 'Favoris')}`;
}

function render(animate = false) {
  const r = route();
  const view = $('#view');
  if (!state.profile) {
    view.innerHTML = viewWelcome(); $('#tabbar').innerHTML = ''; $('#tabbar').hidden = true;
    return;
  }
  $('#tabbar').hidden = false;
  const html = { home: viewHome, dressing: viewDressing, styliste: viewStylist, favoris: viewFavorites, reglages: viewSettings, profil: viewMe }[r]();
  view.innerHTML = html;
  view.style.animation = 'none';
  if (animate) { void view.offsetWidth; view.style.animation = ''; }
  renderTabbar();
  hydratePhotos(view);
  if (r === 'profil') refreshMeAvatar();
}
const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };

const LOGO = `<div class="logo" aria-label="Mon dressing"><svg class="logo-mark" viewBox="64 24 384 376" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"><path d="M256 214v-26c0-14 8-20 22-24 22-6 38-22 38-48 0-28-24-48-52-48s-52 20-52 46"/><path d="M256 214 92 330c-18 13-10 40 12 40h304c22 0 30-27 12-40z"/></g><g fill="none" stroke="#F4F4F5" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" transform="translate(228 256) scale(1.05)"><path d="M0 0v66M0 0h30c14 0 22 9 22 19s-8 18-22 18H0M0 37h34c15 0 24 9 24 20s-9 18-24 18H0"/></g></svg><span class="logo-word">Mon dressing</span></div>`;

function viewWelcome() {
  return `
  <div class="welcome">
    <div class="logo big-logo" aria-label="Mon dressing"><svg class="logo-mark" viewBox="64 24 384 376" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"><path d="M256 214v-26c0-14 8-20 22-24 22-6 38-22 38-48 0-28-24-48-52-48s-52 20-52 46"/><path d="M256 214 92 330c-18 13-10 40 12 40h304c22 0 30-27 12-40z"/></g><g fill="none" stroke="#F4F4F5" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" transform="translate(228 256) scale(1.05)"><path d="M0 0v66M0 0h30c14 0 22 9 22 19s-8 18-22 18H0M0 37h34c15 0 24 9 24 20s-9 18-24 18H0"/></g></svg></div>
    <h1>Mon dressing</h1>
    <p class="muted">Ton dressing intelligent : ton linge, tes tenues, ton styliste.</p>
    <h2>Pour qui est ce dressing ?</h2>
    <div class="gender-grid">
      <button class="card gender-card" data-act="pick-gender" data-v="m"><span class="ico">${icon('shirt')}</span><span><strong>Masculin</strong><small>Hauts, pantalons, baskets…</small></span>${icon('right')}</button>
      <button class="card gender-card" data-act="pick-gender" data-v="f"><span class="ico">${icon('dress')}</span><span><strong>Féminin</strong><small>Robes, jupes, sacs en plus</small></span>${icon('right')}</button>
      <button class="card gender-card disabled" disabled aria-disabled="true"><span class="ico rainbow">${icon('heart')}</span><span><strong class="strike">LGBTQQIA2SNBP+</strong></span></button>
    </div>
    <p class="hint" style="text-align:center">Tu pourras changer ce choix plus tard dans Réglages.</p>
  </div>`;
}

// ================= ACCUEIL =================
function counts() {
  const c = { total: state.items.length, propre: 0, porte: 0, sale: 0, lavage: 0 };
  state.items.forEach((i) => { c[i.status] = (c[i.status] || 0) + 1; });
  return c;
}

function outfitPieces(o) {
  const s = o.slots || {};
  return [s.top, s.dress, s.layer, s.bottom, s.shoes, s.outer, ...(s.accessories || [])].filter(Boolean);
}
function outfitAvailability(o) {
  const ids = outfitPieces(o);
  const missing = ids.filter((id) => !itemById(id));
  const dirty = ids.map(itemById).filter((it) => it && !isAvailable(it));
  return { ok: !missing.length && !dirty.length, missing, dirty };
}
function mosaic(o) {
  const s = o.slots || {};
  const ids = [s.top || s.dress, s.bottom, s.shoes, s.outer || s.layer || (s.accessories || [])[0]];
  return `<div class="mosaic">${ids.map((id) => { const it = id && itemById(id); return it ? photoBox(it, '') : `<div class="ph">${id ? icon('alert') : ''}</div>`; }).join('')}</div>`;
}

function viewHome() {
  const c = counts();
  const recent = [...state.outfits].sort((a, b) => (b.wornAt || b.createdAt).localeCompare(a.wornAt || a.createdAt)).slice(0, 8);
  const hour = new Date().getHours();
  const hello = hour < 6 ? 'Bonne nuit' : hour < 18 ? 'Bonjour' : 'Bonsoir';
  const daysSinceExport = state.lastExport ? (Date.now() - new Date(state.lastExport)) / 864e5 : Infinity;
  const empty = c.total === 0;
  return `
  <header class="topbar">
    ${LOGO}
    <span style="display:flex;gap:8px"><a class="icon-btn" href="#/profil" aria-label="Mon profil">${icon('user')}</a><a class="icon-btn" href="#/reglages" aria-label="Réglages">${icon('settings')}</a></span>
  </header>
  <p class="eyebrow" style="margin:14px 0 0">${hello} · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
  <section class="stats">
    <button class="card stat primary" data-act="goto-dressing" data-status="all"><b>${c.total}</b><span>${c.total > 1 ? 'pièces' : 'pièce'}</span></button>
    <button class="card stat" data-act="goto-dressing" data-status="propre"><b>${c.propre}</b><span><i class="dot" style="background:var(--st-propre)"></i>${c.propre > 1 ? 'propres' : 'propre'}</span></button>
    <button class="card stat" data-act="goto-dressing" data-status="sale"><b>${c.sale}</b><span><i class="dot" style="background:var(--st-sale)"></i>au sale</span></button>
  </section>
  <section class="hero-actions">
    <button class="card action-tile accent" data-act="add-item"><span class="ico">${icon('camera')}</span><span><strong>Ajouter un vêtement</strong><small>Photo + reconnaissance</small></span></button>
    <button class="card action-tile" data-act="goto" data-to="styliste"><span class="ico">${icon('sparkle')}</span><span><strong>Créer ma tenue</strong><small>${c.propre + c.porte} pièces dispo</small></span></button>
  </section>
  ${c.sale + c.lavage > 0 ? `<button class="card nudge" style="width:100%;text-align:left" data-act="goto-dressing" data-status="${c.sale ? 'sale' : 'lavage'}"><span class="ico" style="color:var(--st-${c.sale ? 'sale' : 'lavage'})">${icon('washer')}</span><p><b>${plural(c.sale, 'pièce', 'pièces')} au sale</b>${c.lavage ? ` · ${c.lavage} au lavage` : ''}<br>Mets à jour ton linge en un geste.</p>${icon('right')}</button>` : ''}
  ${!empty && daysSinceExport > 14 ? `<button class="card nudge" style="width:100%;text-align:left" data-act="goto" data-to="reglages"><span class="ico" style="color:var(--accent)">${icon('shield')}</span><p><b>${state.lastExport ? 'Dernière sauvegarde il y a ' + Math.floor(daysSinceExport) + ' jours' : 'Aucune sauvegarde pour l\'instant'}</b><br>Exporte ton dressing pour ne rien perdre.</p>${icon('right')}</button>` : ''}
  <div class="section-title"><h2>Dernières tenues</h2>${recent.length ? '<a class="link" href="#/favoris">Tout voir</a>' : ''}</div>
  ${recent.length ? `<div class="hscroll">${recent.map((o) => `<button class="card outfit-mini" data-act="open-outfit" data-id="${o.id}">${mosaic(o)}<strong>${esc(o.title)}</strong><small>${o.favorite ? '★ Favori · ' : ''}${fmtDate(o.wornAt || o.createdAt)}</small></button>`).join('')}</div>`
    : `<div class="empty">
        <div class="big">${icon(empty ? 'hanger' : 'sparkle')}</div>
        <h3>${empty ? 'Ton dressing est vide' : 'Aucune tenue pour l\'instant'}</h3>
        <p>${empty ? 'Commence par photographier 3 pièces : un haut, un bas et une paire de chaussures. Le styliste pourra ensuite composer tes looks.' : 'Demande une tenue au styliste puis enregistre-la ou indique que tu la portes.'}</p>
        <button class="btn btn-primary" data-act="${empty ? 'add-item' : 'goto'}" data-to="styliste">${icon(empty ? 'camera' : 'sparkle')}${empty ? 'Ajouter ma première pièce' : 'Créer ma tenue'}</button>
      </div>`}
  `;
}

// ================= DRESSING =================
function filteredItems() {
  const w = state.w;
  const q = w.q.trim().toLowerCase();
  let list = state.items.filter((it) => {
    if (w.status !== 'all' && it.status !== w.status) return false;
    if (w.cat !== 'all' && it.category !== w.cat) return false;
    if (w.colors.length && ![it.primaryColor, ...(it.secondaryColors || [])].some((c) => w.colors.includes(c))) return false;
    if (w.brands.length && !w.brands.includes((it.brand || '').trim())) return false;
    if (w.styles.length && !w.styles.includes(it.style)) return false;
    if (q) {
      const hay = [it.name, it.brand, catOf(it.category)?.short, colorOf(it.primaryColor)?.label, ...(it.secondaryColors || []).map((c) => colorOf(c)?.label), STYLES.find((s) => s.id === it.style)?.label, it.notes, it.size].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const cmp = {
    recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
    ancien: (a, b) => a.createdAt.localeCompare(b.createdAt),
    nom: (a, b) => a.name.localeCompare(b.name, 'fr'),
    categorie: (a, b) => CATEGORIES.findIndex((c) => c.id === a.category) - CATEGORIES.findIndex((c) => c.id === b.category) || a.name.localeCompare(b.name, 'fr'),
    porte: (a, b) => (b.wearCount || 0) - (a.wearCount || 0),
  }[w.sort];
  return list.sort(cmp);
}
const activeFilterCount = () => state.w.colors.length + state.w.brands.length + state.w.styles.length + (state.w.sort !== 'recent' ? 1 : 0);

function itemCard(it) {
  const st = statusOf(it.status);
  return `<article class="item-card ${isAvailable(it) ? '' : 'unavailable'}">
    <button style="display:block;width:100%;text-align:left" data-act="open-item" data-id="${it.id}" aria-label="${esc(it.name)}">
      ${photoBox(it)}
      <div class="meta"><strong>${esc(it.name)}</strong><small>${swatch(it.primaryColor, 10)}${esc(catOf(it.category)?.short || '')}${it.brand ? ' · ' + esc(it.brand) : ''}${it.wearPref === 'never' ? ' · <span class="pref-tag">jamais</span>' : it.wearPref === 'rare' ? ' · <span class="pref-tag">rarement</span>' : it.wearPref === 'often' ? ' · <span class="pref-tag often">souvent</span>' : ''}</small></div>
    </button>
    <button class="status-btn" data-act="cycle-status" data-id="${it.id}" aria-label="Statut : ${esc(st.label)}. Toucher pour changer"><i class="dot" style="background:${statusColor(it.status)}"></i>${esc(st.label)}</button>
  </article>`;
}

function viewDressing() {
  const w = state.w;
  const c = counts();
  const seg = [['all', 'Tout', c.total], ['propre', 'Propres', c.propre], ['porte', 'Portés', c.porte], ['sale', 'Au sale', c.sale], ['lavage', 'Lavage', c.lavage]];
  return `
  <header class="topbar"><h1>Dressing</h1><button class="icon-btn" data-act="add-item" aria-label="Ajouter">${icon('plus')}</button></header>
  <div class="search">${icon('search')}<input type="search" id="w-search" placeholder="Rechercher une pièce, une marque…" value="${esc(w.q)}" autocomplete="off" enterkeyhint="search"><button class="clear" data-act="clear-search" aria-label="Effacer" ${w.q ? '' : 'hidden'}>${icon('x')}</button></div>
  <div class="segmented" role="group" aria-label="Disponibilité">${seg.map(([id, l, n]) => `<button data-act="w-status" data-v="${id}" aria-pressed="${w.status === id}">${id !== 'all' ? `<i class="dot" style="background:${statusColor(id)}"></i>` : ''}${l}<span class="count">${n}</span></button>`).join('')}</div>
  <div class="chips" role="group" aria-label="Catégories">
    <button class="chip" data-act="w-cat" data-v="all" aria-pressed="${w.cat === 'all'}">Toutes</button>
    ${visibleCategories().map((ct) => `<button class="chip" data-act="w-cat" data-v="${ct.id}" aria-pressed="${w.cat === ct.id}">${ct.short}</button>`).join('')}
  </div>
  <div id="w-results">${dressingResults()}</div>`;
}

function dressingResults() {
  const w = state.w;
  const list = filteredItems();
  const bulk = { sale: ['bulk', 'sale', 'lavage', `${icon('washer')}Tout mettre au lavage`], lavage: ['bulk', 'lavage', 'propre', `${icon('check')}Lavage terminé : tout est propre`], porte: ['bulk', 'porte', 'sale', `${icon('washer')}Tout mettre au sale`] }[w.status];
  const nf = activeFilterCount();
  return `
  <div class="toolbar">
    <span class="count">${plural(list.length, 'pièce', 'pièces')}</span>
    <button class="btn btn-sm btn-ghost" data-act="open-filters">${icon('sliders')}Filtres & tri${nf ? ` <span class="badge-n">${nf}</span>` : ''}</button>
  </div>
  ${bulk && list.length ? `<button class="btn btn-block" style="margin-bottom:12px" data-act="${bulk[0]}" data-from="${bulk[1]}" data-to="${bulk[2]}">${bulk[3]}</button>` : ''}
  ${list.length ? `<div class="grid">${list.map(itemCard).join('')}</div>` : state.items.length
    ? `<div class="empty"><div class="big">${icon('search')}</div><h3>Aucun résultat</h3><p>Aucune pièce ne correspond à ces filtres.</p><button class="btn" data-act="reset-filters">Réinitialiser les filtres</button></div>`
    : `<div class="empty"><div class="big">${icon('hanger')}</div><h3>Ton dressing est vide</h3><p>Ajoute tes vêtements, chaussures et accessoires pour commencer.</p><button class="btn btn-primary" data-act="add-item">${icon('camera')}Ajouter un vêtement</button></div>`}`;
}

function openFilters() {
  const brands = [...new Set(state.items.map((i) => (i.brand || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const usedColors = COLORS.filter((c) => state.items.some((i) => i.primaryColor === c.id || (i.secondaryColors || []).includes(c.id)));
  const draft = JSON.parse(JSON.stringify(state.w));
  const sorts = [['recent', 'Plus récents'], ['ancien', 'Plus anciens'], ['nom', 'Nom A → Z'], ['categorie', 'Catégorie'], ['porte', 'Plus portés']];
  const sh = openSheet({
    title: 'Filtres & tri',
    render: () => ({
      body: `
        <div class="field"><div class="label">Trier par</div><div class="chips wrap">${sorts.map(([id, l]) => `<button class="chip" data-f="sort" data-v="${id}" aria-pressed="${draft.sort === id}">${l}</button>`).join('')}</div></div>
        <div class="field"><div class="label">Couleur</div>${usedColors.length ? `<div class="swatches">${usedColors.map((c) => `<button class="swatch-btn" data-f="colors" data-v="${c.id}" aria-pressed="${draft.colors.includes(c.id)}" aria-label="${c.label}"><span style="${swatchStyle(c.id)}"></span></button>`).join('')}</div>` : '<p class="hint">Aucune couleur enregistrée.</p>'}</div>
        <div class="field"><div class="label">Marque</div>${brands.length ? `<div class="chips wrap">${brands.map((b) => `<button class="chip" data-f="brands" data-v="${esc(b)}" aria-pressed="${draft.brands.includes(b)}">${esc(b)}</button>`).join('')}</div>` : '<p class="hint">Aucune marque renseignée.</p>'}</div>
        <div class="field"><div class="label">Style</div><div class="chips wrap">${STYLES.map((s) => `<button class="chip" data-f="styles" data-v="${s.id}" aria-pressed="${draft.styles.includes(s.id)}">${s.label}</button>`).join('')}</div></div>`,
      foot: '<button class="btn btn-ghost" data-f-reset>Réinitialiser</button><button class="btn btn-primary" data-f-apply>Appliquer</button>',
    }),
  });
  sh.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (b) {
      const k = b.dataset.f, v = b.dataset.v;
      if (k === 'sort') { draft.sort = v; $$('[data-f="sort"]', sh.el).forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === v)); }
      else { const arr = draft[k]; const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); b.setAttribute('aria-pressed', i < 0); }
      return;
    }
    if (e.target.closest('[data-f-reset]')) { Object.assign(draft, { colors: [], brands: [], styles: [], sort: 'recent' }); sh.refresh(); }
    if (e.target.closest('[data-f-apply]')) { Object.assign(state.w, draft); sh.close(); rerender(); }
  });
}

async function setStatus(ids, status, { silent = false } = {}) {
  const now = new Date().toISOString();
  const prev = [];
  const updated = ids.map(itemById).filter(Boolean).map((it) => { prev.push({ ...it }); return { ...it, status, updatedAt: now }; });
  await db.putMany('items', updated);
  updated.forEach((u) => { const i = state.items.findIndex((x) => x.id === u.id); state.items[i] = u; });
  if (!silent) {
    toast(ids.length > 1 ? `${ids.length} pièces → ${statusOf(status).label}` : `${updated[0]?.name} → ${statusOf(status).label}`, {
      action: 'Annuler',
      onAction: async () => { await db.putMany('items', prev); prev.forEach((p) => { const i = state.items.findIndex((x) => x.id === p.id); state.items[i] = p; }); rerender(); refreshOpenSheets(); },
    });
  }
}

// ================= FICHE ARTICLE =================
function openItem(id) {
  const sh = openSheet({
    title: 'Pièce',
    full: true,
    render: () => {
      const it = itemById(id);
      if (!it) return { body: '<p class="muted">Cette pièce a été supprimée.</p>' };
      const photos = it.photos?.length ? it.photos : [null];
      const row = (k, v) => v ? `<div class="row"><span>${k}</span><span>${v}</span></div>` : '';
      return {
        body: `
          ${it.sticker ? `<div class="sticker-hero" data-photo="${esc(it.sticker)}"></div>` : ''}
          <div class="gallery">${photos.map((p) => p ? `<div data-photo="${esc(p)}"></div>` : `<div><span style="${swatchStyle(it.primaryColor)};width:90px;height:90px;border-radius:50%;display:block;border:1px solid var(--line-2)"></span></div>`).join('')}</div>
          ${photos.length > 1 ? `<p class="hint" style="text-align:center">${photos.length} photos · fais glisser</p>` : ''}
          <h3 class="detail-title">${esc(it.name)}</h3>
          <p class="muted" style="margin:0">${esc(catOf(it.category)?.label)}${it.brand ? ' · ' + esc(it.brand) : ''}</p>
          <div class="status-seg" role="group" aria-label="Statut">${STATUSES.map((s) => `<button data-st="${s.id}" aria-pressed="${it.status === s.id}" style="${it.status === s.id ? `color:${statusColor(s.id)}` : ''}"><i class="dot" style="background:${statusColor(s.id)}"></i>${s.label}</button>`).join('')}</div>
          <button class="btn btn-block" style="margin-top:10px" data-wear>${icon('hand')}Je le porte aujourd'hui</button>
          <div class="label" style="margin:18px 0 8px">Dans le styliste</div>
          <div class="status-seg" role="group" aria-label="Dans le styliste">${WEAR_PREFS.map((w) => `<button data-wp="${w.id}" aria-pressed="${(it.wearPref || 'normal') === w.id}">${w.label}</button>`).join('')}</div>
          ${it.wearNote ? `<p class="hint">« ${esc(it.wearNote)} »</p>` : ''}
          <div class="rows">
            ${row('Couleur', `${swatch(it.primaryColor)} ${esc(colorOf(it.primaryColor)?.label || '—')}`)}
            ${row('Couleurs secondaires', (it.secondaryColors || []).map((c) => `${swatch(c)} ${esc(colorOf(c)?.label)}`).join(' &nbsp;'))}
            ${row('Taille', esc(it.size))}
            ${row('Coupe', esc(FITS.find((f) => f.id === it.fit)?.label))}
            ${row('Style', esc(STYLES.find((s) => s.id === it.style)?.label))}
            ${row('Saison', (it.seasons || []).length === 4 ? 'Toutes saisons' : (it.seasons || []).map((s) => SEASONS.find((x) => x.id === s)?.label).join(', '))}
            ${row('Porté', it.wearCount ? `${plural(it.wearCount, 'fois', 'fois')}${it.lastWorn ? ' · dernière ' + fmtDate(it.lastWorn) : ''}` : '')}
            ${row('Ajouté le', fmtDate(it.createdAt))}
          </div>
          ${it.notes ? `<p class="muted" style="margin-top:16px;white-space:pre-wrap">${esc(it.notes)}</p>` : ''}`,
        foot: `<button class="btn btn-danger" data-del style="flex:0 0 56px" aria-label="Supprimer">${icon('trash')}</button><button class="btn btn-primary" data-edit>${icon('edit')}Modifier</button>`,
      };
    },
  });
  sh.kind = 'item';
  sh.el.addEventListener('click', async (e) => {
    const it = itemById(id);
    if (!it) return;
    const st = e.target.closest('[data-st]');
    if (st) { haptic(); await setStatus([id], st.dataset.st); sh.refresh(); rerender(); return; }
    const wp = e.target.closest('[data-wp]');
    if (wp) {
      const upd = { ...it, wearPref: wp.dataset.wp, updatedAt: new Date().toISOString() };
      await db.put('items', upd); state.items[state.items.indexOf(it)] = upd;
      toast(wp.dataset.wp === 'never' ? 'Le styliste ne proposera plus cette pièce' : wp.dataset.wp === 'rare' ? 'Le styliste la proposera rarement' : wp.dataset.wp === 'often' ? 'Le styliste la proposera plus souvent' : 'Réglage normal', { timeout: 1800 });
      sh.refresh(); rerender(); return;
    }
    if (e.target.closest('[data-wear]')) {
      const upd = { ...it, status: 'porte', wearCount: (it.wearCount || 0) + 1, lastWorn: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await db.put('items', upd); state.items[state.items.indexOf(it)] = upd;
      toast(`${it.name} marqué comme porté`); sh.refresh(); rerender(); return;
    }
    if (e.target.closest('[data-edit]')) { openItemForm(it); return; }
    if (e.target.closest('[data-del]')) {
      const ok = await confirmDialog('Supprimer cette pièce ?', `« ${it.name} » et ses photos seront définitivement supprimés. Les tenues qui l'utilisent l'indiqueront.`, 'Supprimer', true);
      if (!ok) return;
      await db.del('items', id); await deletePhotos([...(it.photos || []), ...(it.sticker ? [it.sticker] : [])]);
      state.items = state.items.filter((x) => x.id !== id);
      sh.close('force'); toast('Pièce supprimée'); rerender();
    }
  });
}
function refreshOpenSheets() { sheets.forEach((s) => { if (s.kind === 'item' || s.kind === 'outfit') s.refresh(); }); }

// ================= AJOUT / MODIFICATION =================
const BLANK = () => ({ name: '', category: null, primaryColor: null, secondaryColors: [], brand: '', size: '', fit: null, style: null, seasons: [], status: 'propre', notes: '', photos: [], sticker: null, wearPref: 'normal', wearNote: '' });

async function blobOfPhoto(id) {
  const rec = id ? await db.get('photos', id) : null;
  return rec ? new Blob([rec.data], { type: rec.type }) : null;
}
// Crée un sticker (PNG sans fond) à partir d'une photo déjà enregistrée ; retourne l'id du sticker.
async function stickerFromPhoto(photoId, onStatus) {
  const blob = await blobOfPhoto(photoId);
  if (!blob) throw new Error('Photo introuvable.');
  const { blob: png, method } = await makeSticker(blob, { onStatus });
  return { pid: await savePhoto(png), method };
}

function openItemForm(existing = null, { startWith } = {}) {
  const d = existing ? JSON.parse(JSON.stringify(existing)) : BLANK();
  if (!d.wearPref) d.wearPref = 'normal';
  if (d.wearNote == null) d.wearNote = '';
  const addedPhotos = [];
  const removedPhotos = [];
  const ai = { status: 'idle', fields: new Set(), msg: '', remark: '', confidence: null };
  let errors = {};
  let dirty = false;
  const stk = { status: 'idle', msg: '', method: null };
  let stkRun = 0;

  const chipGroup = (key, list, multi = false) => `<div class="chips wrap" data-group="${key}">${list.map((x) => `<button type="button" class="chip" data-k="${key}" data-v="${x.id}" data-multi="${multi}" aria-pressed="${multi ? d[key].includes(x.id) : d[key] === x.id}">${esc(x.label)}</button>`).join('')}</div>`;
  const swatchGroup = (key, multi) => `<div class="swatches" data-group="${key}">${COLORS.map((c) => `<button type="button" class="swatch-btn" data-k="${key}" data-v="${c.id}" data-multi="${multi}" aria-pressed="${multi ? d[key].includes(c.id) : d[key] === c.id}" aria-label="${c.label}"><span style="${swatchStyle(c.id)}"></span></button>`).join('')}</div><div class="swatch-name" data-name="${key}">${multi ? d[key].map((c) => colorOf(c)?.label).join(', ') || 'Aucune' : colorOf(d[key])?.label || 'Choisis une couleur'}</div>`;
  const tag = (k) => ai.fields.has(k) ? '<span class="ai-tag">IA · à vérifier</span>' : '';

  const aiBox = () => {
    if (ai.status === 'loading') return `<div class="ai-box"><span class="spinner" style="color:var(--accent)"></span><p><b>Analyse en cours…</b><br>L'IA identifie la catégorie, les couleurs, la coupe et la saison.</p></div>`;
    if (ai.status === 'done') return `<div class="ai-box">${icon('sparkle')}<p><b>Proposition de l'IA (confiance ${esc(ai.confidence)})</b><br>Vérifie et corrige les champs marqués « IA » avant d'enregistrer. La marque et la taille ne sont jamais devinées.${ai.remark ? `<br><span class="dim">${esc(ai.remark)}</span>` : ''}</p></div>`;
    if (ai.status === 'error') return `<div class="ai-box error">${icon('alert')}<p><b>Reconnaissance impossible</b><br>${esc(ai.msg)} Tu peux remplir les champs à la main.</p></div>`;
    if (ai.status === 'notclothing') return `<div class="ai-box error">${icon('alert')}<p><b>Aucun vêtement détecté</b><br>Essaie une photo où la pièce est bien visible, à plat ou portée, sur un fond simple.</p></div>`;
    if (ai.status === 'off') return `<div class="ai-box neutral">${icon('info')}<p><b>Reconnaissance IA non connectée.</b> ${esc(ai.msg || 'Remplis les champs à la main, ou connecte l\'IA dans Réglages.')}</p></div>`;
    return '';
  };

  const stickerBox = () => {
    if (!d.photos.length) return '';
    if (stk.status === 'loading') return `<div class="ai-box" style="margin-top:10px"><span class="spinner" style="color:var(--accent)"></span><p><b>Création du sticker…</b><br><span data-stk-msg>${esc(stk.msg || 'Retrait de l\'arrière-plan')}</span></p><button type="button" class="link" data-stk-skip>Passer</button></div>`;
    if (d.sticker) return `<div class="sticker-row"><div class="sticker-img" data-photo="${esc(d.sticker)}"></div><div><b>Sticker prêt</b><small>Sans fond, utilisé dans l'aperçu des tenues${stk.method === 'simple' ? ' (découpe simple sur fond uni)' : ''}.</small><button type="button" class="btn btn-sm btn-ghost" data-stk-make>Refaire</button></div></div>`;
    return `<div class="ai-box neutral" style="margin-top:10px">${icon('info')}<p><b>${stk.status === 'fail' ? 'Sticker non créé' : 'Pas de sticker'}</b><br>${esc(stk.msg || 'Sans sticker, la photo sera utilisée dans l\'aperçu des tenues.')}</p></div><button type="button" class="btn btn-sm btn-ghost" style="margin-top:10px" data-stk-make>Créer le sticker</button>`;
  };

  const sh = openSheet({
    title: existing ? 'Modifier la pièce' : 'Ajouter un vêtement',
    full: true,
    render: () => {
      const hasPhoto = d.photos.length > 0;
      const photoSection = !hasPhoto ? `
        <div class="photo-drop">
          <label class="photo-pick accent">${icon('camera')}Prendre une photo<input type="file" accept="image/*" capture="environment" class="sr" data-photo-input></label>
          <label class="photo-pick">${icon('image')}Galerie<input type="file" accept="image/*" class="sr" data-photo-input multiple></label>
        </div>
        <p class="hint">Astuce : pose la pièce à plat, bien éclairée, sur un fond uni.</p>`
        : `<div class="hero-photo ${ai.status === 'loading' ? 'scanning' : ''}" data-photo="${esc(d.photos[0])}"></div>
           <div class="thumbs" style="margin-top:10px">${d.photos.map((p, i) => `<div class="thumb" data-photo="${esc(p)}"><button type="button" class="x" data-rm-photo="${i}" aria-label="Retirer la photo">${icon('x')}</button></div>`).join('')}
             <label class="thumb add" aria-label="Ajouter une photo">${icon('plus')}<input type="file" accept="image/*" class="sr" data-photo-input multiple></label></div>
           ${aiReady() && ai.status !== 'loading' ? `<button type="button" class="btn btn-sm btn-ghost" style="margin-top:10px" data-analyze>${icon('sparkle')}${ai.status === 'done' ? 'Relancer l\'analyse IA' : 'Analyser avec l\'IA'}</button>` : ''}`;
      return {
        body: `
          ${photoSection}
          ${stickerBox()}
          ${aiBox()}
          <div class="field"><label for="f-name">Nom ${tag('name')}</label><input id="f-name" class="input ${errors.name ? 'invalid' : ''}" data-text="name" value="${esc(d.name)}" placeholder="Ex. Sweat à capuche gris" maxlength="60" autocomplete="off">${errors.name ? `<div class="err-text">${errors.name}</div>` : ''}</div>
          <div class="field"><div class="label">Catégorie ${tag('category')}</div>${chipGroup('category', visibleCategories().map((c) => ({ id: c.id, label: c.label })))}${errors.category ? `<div class="err-text">${errors.category}</div>` : ''}</div>
          <div class="field"><div class="label">Couleur principale ${tag('primaryColor')}</div>${swatchGroup('primaryColor', false)}${errors.primaryColor ? `<div class="err-text">${errors.primaryColor}</div>` : ''}</div>
          <div class="field"><div class="label">Couleurs secondaires ${tag('secondaryColors')}</div>${swatchGroup('secondaryColors', true)}</div>
          <div class="field"><div class="label">Coupe ${tag('fit')}</div>${chipGroup('fit', FITS)}</div>
          <div class="field"><div class="label">Style ${tag('style')}</div>${chipGroup('style', STYLES)}</div>
          <div class="field"><div class="label">Saison ${tag('seasons')}</div>${chipGroup('seasons', SEASONS, true)}<p class="hint">Sélectionne les 4 pour « toutes saisons ».</p></div>
          <div class="field" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label for="f-brand" class="label" style="display:block;margin-bottom:8px">Marque ${tag('brand')}</label><input id="f-brand" class="input" data-text="brand" value="${esc(d.brand)}" placeholder="Facultatif" maxlength="40" autocomplete="off"></div>
            <div><label for="f-size" class="label" style="display:block;margin-bottom:8px">Taille</label><input id="f-size" class="input" data-text="size" value="${esc(d.size)}" placeholder="M, 42, 32/32…" maxlength="20" autocomplete="off"></div>
          </div>
          <div class="field"><div class="label">Disponibilité</div>${chipGroup('status', STATUSES)}</div>
          <div class="field"><div class="label">Dans le styliste</div>${chipGroup('wearPref', WEAR_PREFS)}
            <input id="f-wearnote" class="input" style="margin-top:10px" data-text="wearNote" value="${esc(d.wearNote)}" placeholder="Pourquoi ? (ex. trop fin, je ne le mets plus)" maxlength="80" autocomplete="off">
            <p class="hint">« Souvent » : proposé plus volontiers. « Rarement » : proposé seulement si c'est vraiment le meilleur choix. « Jamais » : jamais proposé (sauf si tu l'imposes).</p></div>
          <div class="field"><label for="f-notes">Notes</label><textarea id="f-notes" class="input" data-text="notes" placeholder="Facultatif : matière, où l'acheter, entretien…" maxlength="500">${esc(d.notes)}</textarea></div>`,
        foot: `<button type="button" class="btn btn-ghost" data-cancel>Annuler</button><button type="button" class="btn btn-primary" data-save ${ai.status === 'loading' || stk.status === 'loading' ? 'disabled' : ''}>${icon('check')}Enregistrer</button>`,
      };
    },
    onClose: async (reason) => {
      if (reason !== 'saved' && addedPhotos.length) await deletePhotos(addedPhotos);
    },
  });
  sh.beforeClose = async () => (!dirty ? true : !!(await confirmDialog('Abandonner ?', 'Les informations saisies ne seront pas enregistrées.', 'Abandonner', true)));

  const keepScroll = (fn) => { const b = $('.sheet-body', sh.el); const y = b?.scrollTop || 0; fn(); const nb = $('.sheet-body', sh.el); if (nb) nb.scrollTop = y; };

  async function handleFiles(files) {
    const list = [...files].filter(Boolean);
    if (!list.length) return;
    const first = d.photos.length === 0;
    let analysisBlob = null;
    for (const f of list.slice(0, 6)) {
      try {
        const img = await loadImage(f);
        const blob = await resizeTo(img, 1400, 0.82);
        const pid = await savePhoto(blob);
        d.photos.push(pid); addedPhotos.push(pid); dirty = true;
        if (!analysisBlob) analysisBlob = await resizeTo(img, 1024, 0.8);
      } catch (e) { toast(e.message || 'Photo illisible.', { type: 'error' }); }
    }
    keepScroll(() => sh.refresh());
    // L'analyse IA passe en premier : la découpe du sticker occupe le processeur du téléphone
    // et ralentirait la réponse du serveur si les deux tournaient en même temps.
    if (first && analysisBlob && !existing) {
      if (aiReady()) await runAnalysis(analysisBlob);
      else { ai.status = 'off'; ai.msg = aiOffReason(); keepScroll(() => sh.refresh()); }
    }
    if (first && d.photos.length && !sh.closed) runSticker();
  }

  async function runSticker() {
    if (!d.photos.length) return;
    const run = ++stkRun;
    stk.status = 'loading'; stk.msg = '';
    keepScroll(() => sh.refresh());
    try {
      const { pid, method } = await stickerFromPhoto(d.photos[0], (m) => {
        if (run !== stkRun) return;
        stk.msg = m; const n = sh.el.querySelector('[data-stk-msg]'); if (n) n.textContent = m;
      });
      if (run !== stkRun || sh.closed) { await deletePhotos([pid]); return; }
      dropSticker();
      d.sticker = pid; addedPhotos.push(pid); stk.method = method; stk.status = 'done'; dirty = true;
    } catch (e) {
      if (run !== stkRun) return;
      stk.status = 'fail'; stk.msg = e.message;
    }
    if (!sh.closed) keepScroll(() => sh.refresh());
  }
  function dropSticker() {
    if (!d.sticker) return;
    const old = d.sticker; d.sticker = null;
    if (addedPhotos.includes(old)) { addedPhotos.splice(addedPhotos.indexOf(old), 1); deletePhotos([old]); } else removedPhotos.push(old);
  }

  async function runAnalysis(blob) {
    if (!blob) {
      const rec = await db.get('photos', d.photos[0]);
      if (!rec) return;
      const img = await loadImage(new Blob([rec.data], { type: rec.type }));
      blob = await resizeTo(img, 1024, 0.8);
    }
    ai.status = 'loading'; keepScroll(() => sh.refresh());
    try {
      const b64 = await blobToBase64(blob);
      const { suggestion: s } = await api.analyze(b64, 'image/jpeg', gender());
      if (sh.closed) return;
      if (!s.isClothing) { ai.status = 'notclothing'; keepScroll(() => sh.refresh()); return; }
      ai.fields.clear();
      const apply = (k, v) => { if (v == null || (Array.isArray(v) && !v.length) || v === '') return; d[k] = v; ai.fields.add(k); };
      if (!d.name) apply('name', s.name);
      apply('category', s.category); apply('primaryColor', s.primaryColor); apply('secondaryColors', s.secondaryColors);
      apply('fit', s.fit); apply('style', s.style); apply('seasons', s.seasons);
      if (s.brand && !d.brand) apply('brand', s.brand);
      ai.status = 'done'; ai.confidence = s.confidence; ai.remark = s.remark; dirty = true;
    } catch (e) {
      ai.status = 'error'; ai.msg = e.message;
    }
    if (!sh.closed) keepScroll(() => sh.refresh());
  }

  sh.el.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-photo-input]');
    if (inp) { handleFiles(inp.files); inp.value = ''; }
  });
  sh.el.addEventListener('input', (e) => {
    const t = e.target.closest('[data-text]');
    if (t) { d[t.dataset.text] = t.value; dirty = true; ai.fields.delete(t.dataset.text); if (errors[t.dataset.text]) { delete errors[t.dataset.text]; t.classList.remove('invalid'); t.nextElementSibling?.classList.contains('err-text') && t.nextElementSibling.remove(); } }
  });
  sh.el.addEventListener('click', async (e) => {
    const opt = e.target.closest('[data-k]');
    if (opt) {
      const k = opt.dataset.k, v = opt.dataset.v, multi = opt.dataset.multi === 'true';
      dirty = true; ai.fields.delete(k);
      if (multi) { const i = d[k].indexOf(v); i >= 0 ? d[k].splice(i, 1) : d[k].push(v); opt.setAttribute('aria-pressed', i < 0); }
      else { d[k] = d[k] === v && k !== 'status' ? null : v; $$(`[data-k="${k}"]`, sh.el).forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === d[k])); }
      if (k === 'primaryColor') { d.secondaryColors = d.secondaryColors.filter((c) => c !== d.primaryColor); $$('[data-k="secondaryColors"]', sh.el).forEach((x) => x.setAttribute('aria-pressed', d.secondaryColors.includes(x.dataset.v))); }
      const nameEl = $(`[data-name="${k}"]`, sh.el); if (nameEl) nameEl.textContent = multi ? d[k].map((c) => colorOf(c)?.label).join(', ') || 'Aucune' : colorOf(d[k])?.label || 'Choisis une couleur';
      const sec = $('[data-name="secondaryColors"]', sh.el); if (sec) sec.textContent = d.secondaryColors.map((c) => colorOf(c)?.label).join(', ') || 'Aucune';
      opt.closest('.field')?.querySelector('.ai-tag')?.remove();
      if (errors[k]) { delete errors[k]; opt.closest('.field').querySelector('.err-text')?.remove(); }
      return;
    }
    const rm = e.target.closest('[data-rm-photo]');
    if (rm) {
      const [pid] = d.photos.splice(+rm.dataset.rmPhoto, 1);
      if (addedPhotos.includes(pid)) { addedPhotos.splice(addedPhotos.indexOf(pid), 1); await deletePhotos([pid]); } else removedPhotos.push(pid);
      if (rm.dataset.rmPhoto === '0') { stkRun++; stk.status = 'idle'; stk.msg = ''; dropSticker(); }
      dirty = true; keepScroll(() => sh.refresh()); return;
    }
    if (e.target.closest('[data-stk-make]')) { runSticker(); return; }
    if (e.target.closest('[data-stk-skip]')) { stkRun++; stk.status = 'idle'; keepScroll(() => sh.refresh()); return; }
    if (e.target.closest('[data-analyze]')) { runAnalysis(); return; }
    if (e.target.closest('[data-cancel]')) { sh.close(); return; }
    if (e.target.closest('[data-save]')) {
      errors = {};
      if (!d.name.trim()) errors.name = 'Donne un nom à cette pièce.';
      if (!d.category) errors.category = 'Choisis une catégorie.';
      if (!d.primaryColor) errors.primaryColor = 'Choisis la couleur principale.';
      if (Object.keys(errors).length) {
        keepScroll(() => sh.refresh());
        $('.invalid, .err-text', sh.el)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Il manque des informations obligatoires.', { type: 'error', timeout: 2500 });
        return;
      }
      const now = new Date().toISOString();
      const item = {
        id: existing?.id || uid(),
        name: d.name.trim(), category: d.category, primaryColor: d.primaryColor,
        secondaryColors: d.secondaryColors.filter((c) => c !== d.primaryColor), brand: d.brand.trim(), size: d.size.trim(),
        fit: d.fit, style: d.style, seasons: d.seasons, status: d.status || 'propre', notes: d.notes.trim(), photos: d.photos, sticker: d.sticker || null, wearPref: d.wearPref || 'normal', wearNote: d.wearNote.trim(),
        wearCount: existing?.wearCount || 0, lastWorn: existing?.lastWorn || null,
        createdAt: existing?.createdAt || now, updatedAt: now,
      };
      try {
        await db.put('items', item);
        if (removedPhotos.length) await deletePhotos(removedPhotos);
      } catch (err) { toast(`Enregistrement impossible : ${err.message}`, { type: 'error' }); return; }
      const i = state.items.findIndex((x) => x.id === item.id);
      if (i >= 0) state.items[i] = item; else state.items.push(item);
      if (state.items.length === 1) requestPersist();
      addedPhotos.length = 0;
      sh.close('saved');
      toast(existing ? 'Modifications enregistrées' : `${item.name} ajouté à ton dressing`);
      rerender(); refreshOpenSheets();
    }
  });

  if (startWith) handleFiles(startWith);
  return sh;
}

function aiOffReason() {
  const h = state.health;
  if (!h || h.error) return h?.code === 'no-server' ? 'Le serveur IA n\'est pas encore installé (voir le guide).' : 'Serveur injoignable pour le moment.';
  if (!h.configured.password || !h.configured.ai) return 'Le serveur n\'a pas encore sa clé Gemini ou son mot de passe (voir le guide).';
  if (!h.authorized) return 'Saisis ton mot de passe dans Réglages pour activer l\'IA.';
  return '';
}

// ================= STYLISTE =================
function stylistRequest() {
  const s = state.st;
  return {
    style: s.style, customStyle: s.customStyle, occasion: s.occasion, season: s.season,
    temp: s.tempMode === 'live' && s.weather ? s.weather.temp : s.temp,
    formality: s.formality, preferColors: s.preferColors, avoidColors: s.avoidColors.filter((c) => !s.preferColors.includes(c)),
    mustItems: s.mustItems.filter((id) => itemById(id)), shoesId: s.shoesId && itemById(s.shoesId) ? s.shoesId : null,
    prefStyles: state.me?.prefStyles || [],
  };
}

// Ce qui part vers l'IA : style préféré et, si tu l'autorises, taille et poids. Jamais la photo du visage.
function aiProfile() {
  const me = state.me || {};
  const share = me.share !== false;
  return { gender: gender(), prefStyles: me.prefStyles || [], styleNote: me.styleNote || '', ...(share && me.height ? { heightCm: me.height } : {}), ...(share && me.weight ? { weightKg: me.weight } : {}) };
}

async function logGen(outfit, source) {
  if (!outfit) return;
  state.history = addHistory(state.history, { source, rating: outfit.rating, title: outfit.title });
  try { await setMeta('history', state.history); } catch { /* l'historique est secondaire */ }
}

function viewStylist() {
  const s = state.st;
  const avail = state.items.filter(isAvailable);
  const ready = aiReady();
  const f = s.formality;
  const fLabels = ['', 'Très décontracté', 'Décontracté', 'Intermédiaire', 'Habillé', 'Très habillé'];
  const weatherCard = s.tempMode === 'live' && s.weather
    ? `<div class="card weather"><div class="temp">${s.weather.temp}°</div><div class="info"><b>${esc(s.weather.label)}${s.weather.rain ? ' · pluie' : ''}</b>Météo réelle (ressenti) · min ${s.weather.min}° / max ${s.weather.max}° · Open-Meteo à ${fmtTime(s.weather.at)}</div><button class="icon-btn" data-act="st-manual" aria-label="Saisir la température">${icon('edit')}</button></div>`
    : `<div class="card weather"><div class="temp">${s.temp}°</div><div class="info"><b>Température saisie</b>Aucune météo en temps réel utilisée.</div><button class="btn btn-sm" data-act="st-live">${icon('locate')}Météo réelle</button></div>
       <input type="range" class="range" min="-10" max="40" step="1" value="${s.temp}" data-st-range="temp" aria-label="Température">`;
  const must = s.mustItems.map(itemById).filter(Boolean);
  const shoes = s.shoesId && itemById(s.shoesId);
  return `
  <header class="topbar"><h1>Mon styliste</h1></header>
  <div class="mode-switch" role="group" aria-label="Moteur">
    <button data-act="st-mode" data-v="ai" aria-pressed="${s.mode === 'ai'}">${icon('sparkle')}IA Gemini</button>
    <button data-act="st-mode" data-v="local" aria-pressed="${s.mode === 'local'}">${icon('cpu')}Algorithme local</button>
  </div>
  <p class="hint">${s.mode === 'ai' ? (ready ? 'L\'IA compose avec tes pièces disponibles uniquement. Elle ne peut rien inventer : chaque pièce est vérifiée.' : `IA indisponible : ${esc(aiOffReason())} L'algorithme local sera utilisé.`) : 'Règles de couleurs, formalité, météo et proportions. Fonctionne hors connexion, ce n\'est pas une IA.'}</p>
  ${avail.length < state.items.length ? `<p class="hint">${plural(state.items.length - avail.length, 'pièce est exclue', 'pièces sont exclues')} (au sale ou au lavage).</p>` : ''}

  <div class="field"><div class="label">Style</div><div class="chips wrap">${STYLE_REQUESTS.map((x) => `<button class="chip accent" data-act="st-set" data-k="style" data-v="${x.id}" aria-pressed="${s.style === x.id}">${x.label}</button>`).join('')}</div>
    ${s.style === 'mix' ? `<input class="input" style="margin-top:10px" data-st-text="customStyle" value="${esc(s.customStyle)}" placeholder="Ex. streetwear + touche chic" maxlength="120">` : ''}</div>
  <div class="field"><div class="label">Occasion</div><div class="chips wrap">${OCCASIONS.map((x) => `<button class="chip" data-act="st-set" data-k="occasion" data-v="${x.id}" aria-pressed="${s.occasion === x.id}">${x.label}</button>`).join('')}</div></div>
  <div class="field"><div class="label">Météo</div>${weatherCard}</div>
  <div class="field"><div class="label">Saison</div><div class="chips wrap">${SEASONS.map((x) => `<button class="chip" data-act="st-set" data-k="season" data-v="${x.id}" aria-pressed="${s.season === x.id}">${x.label}</button>`).join('')}</div></div>
  <div class="field"><div class="label"><span>Formalité · ${f == null ? 'automatique (selon l\'occasion)' : fLabels[f]}</span>${f != null ? '<button class="link" data-act="st-formality-auto" style="padding:0">Auto</button>' : ''}</div>
    <input type="range" class="range" min="1" max="5" step="1" value="${f ?? 3}" data-st-range="formality" aria-label="Formalité"><div class="range-labels"><span>Décontracté</span><span>Habillé</span></div></div>
  <div class="field"><div class="label">Couleurs à privilégier</div><div class="swatches">${COLORS.map((c) => `<button class="swatch-btn" data-act="st-color" data-k="preferColors" data-v="${c.id}" aria-pressed="${s.preferColors.includes(c.id)}" aria-label="${c.label}"><span style="${swatchStyle(c.id)}"></span></button>`).join('')}</div><div class="swatch-name">${s.preferColors.map((c) => colorOf(c).label).join(', ') || 'Aucune'}</div></div>
  <div class="field"><div class="label">Couleurs à éviter</div><div class="swatches">${COLORS.map((c) => `<button class="swatch-btn avoid" data-act="st-color" data-k="avoidColors" data-v="${c.id}" aria-pressed="${s.avoidColors.includes(c.id)}" aria-label="${c.label}"><span style="${swatchStyle(c.id)}"></span></button>`).join('')}</div><div class="swatch-name">${s.avoidColors.map((c) => colorOf(c).label).join(', ') || 'Aucune'}</div></div>
  <div class="field"><div class="label"><span>Pièces à porter absolument</span><button class="link" style="padding:0" data-act="st-pick" data-k="must">${must.length ? 'Modifier' : 'Choisir'}</button></div>
    ${must.length ? `<div class="picked">${must.map((it) => `<button class="chip" data-act="st-unpick" data-k="must" data-v="${it.id}">${swatch(it.primaryColor)}${esc(it.name)}${icon('x', 'style="width:14px;height:14px"')}</button>`).join('')}</div>` : '<p class="hint" style="margin:0">Aucune</p>'}</div>
  <div class="field"><div class="label"><span>Chaussures imposées</span><button class="link" style="padding:0" data-act="st-pick" data-k="shoes">${shoes ? 'Modifier' : 'Choisir'}</button></div>
    ${shoes ? `<div class="picked"><button class="chip" data-act="st-unpick" data-k="shoes" data-v="${shoes.id}">${swatch(shoes.primaryColor)}${esc(shoes.name)}${icon('x', 'style="width:14px;height:14px"')}</button></div>` : '<p class="hint" style="margin:0">Au choix du styliste</p>'}</div>

  <div class="sticky-cta"><button class="btn btn-primary btn-block" data-act="st-generate" ${s.loading ? 'disabled' : ''}>${s.loading ? '<span class="spinner"></span>Composition…' : `${icon('sparkle')}${s.result ? 'Nouvelle tenue' : 'Créer ma tenue'}`}</button></div>
  <div id="st-result">${renderResult()}</div>`;
}

function pieceTile(id, label, wide = false) {
  const it = id && itemById(id);
  if (!it) return '';
  return `<button class="piece ${wide ? 'wide' : ''}" data-act="open-item" data-id="${it.id}">${photoBox(it)}<div class="cap"><small>${label}</small><strong>${esc(it.name)}</strong></div></button>`;
}
function outfitBoard(o, warnMissing = true) {
  const s = o.slots;
  const tiles = [
    pieceTile(s.top, 'Haut'), pieceTile(s.dress, 'Robe'), pieceTile(s.bottom, 'Bas'),
    s.layer ? pieceTile(s.layer, 'Superposition') : '',
    s.outer ? pieceTile(s.outer, 'Veste') : '',
    s.shoes ? pieceTile(s.shoes, 'Chaussures') : (warnMissing ? '<div class="piece missing">Pas de chaussures disponibles</div>' : ''),
    ...(s.accessories || []).map((a) => pieceTile(a, 'Accessoire')),
  ].filter(Boolean);
  if (tiles.length % 2 === 1) { const last = tiles.pop(); tiles.push(last.replace('class="piece', 'class="piece wide')); }
  return `<div class="board">${tiles.join('')}</div>`;
}

function renderResult() {
  const r = state.st.result;
  if (!r) return '';
  const warns = [...(r.warnings || [])];
  if (!r.outfit) {
    return `<section class="result">${(r.missing || []).map((m) => `<div class="warn bad">${icon('alert')}<span>${esc(m.reason || m)}</span></div>`).join('')}${warns.map((w) => `<div class="warn">${icon('info')}<span>${esc(w)}</span></div>`).join('')}
      <div class="empty" style="margin-top:14px"><div class="big">${icon('hanger')}</div><h3>Impossible de composer une tenue</h3><p>Il faut au minimum un haut et un bas disponibles. Ajoute des pièces ou mets à jour ton linge.</p><button class="btn btn-primary" data-act="add-item">${icon('plus')}Ajouter un vêtement</button></div></section>`;
  }
  const o = r.outfit;
  const isAI = r.source === 'ai';
  const saved = state.outfits.find((x) => x.key === o.key && x.favorite);
  return `<section class="result">
    ${r.fallbackReason ? `<div class="warn">${icon('alert')}<span>L'IA n'a pas pu répondre : ${esc(r.fallbackReason)} Voici la proposition de l'algorithme local.</span></div>` : ''}
    <div class="result-head"><div><span class="source-tag ${isAI ? 'ai' : ''}">${icon(isAI ? 'sparkle' : 'cpu', 'style="width:14px;height:14px"')}${isAI ? 'Composée par l\'IA Gemini' : 'Composée par l\'algorithme local (sans IA)'}</span><h2>${esc(o.title)}</h2></div></div>
    ${outfitBoard(o)}
    <div class="card score">
      <div class="score-top"><span class="muted small" style="font-weight:700">Cohérence du look</span><b>${o.rating}<span class="dim" style="font-size:14px">/10</span></b></div>
      <div class="bar"><i style="width:${o.rating * 10}%"></i></div>
      <p>${esc(o.explanation)}</p>
      ${o.coherence ? `<p><b style="color:var(--text)">${esc(o.coherence)}</b></p>` : ''}
      <p class="dim small">${r.weatherNote}</p>
    </div>
    ${warns.map((w) => `<div class="warn">${icon('info')}<span>${esc(w)}</span></div>`).join('')}
    ${o.variants?.length ? `<div class="section-title" style="margin-top:20px"><h2 style="font-size:17px">Variantes possibles</h2></div><div class="variants">${o.variants.map((v, i) => { const it = itemById(v.itemId); return it ? `<button class="card variant" data-act="st-variant" data-i="${i}">${photoBox(it)}<span>${esc(v.note)}</span>${icon('swap')}</button>` : ''; }).join('')}</div>` : ''}
    <button class="btn btn-block" style="margin-top:16px" data-act="st-preview">${icon('image')}Aperçu : stickers &amp; avatar</button>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn" data-act="st-another">${icon('refresh')}Autre</button>
      <button class="btn ${saved ? '' : 'btn-primary'}" data-act="st-save" ${saved ? 'disabled' : ''}>${icon('star')}${saved ? 'Enregistrée' : 'Favori'}</button>
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:10px" data-act="st-wear">${icon('hand')}Je porte cette tenue aujourd'hui</button>
  </section>`;
}

function weatherNote(req) {
  const s = state.st;
  if (s.tempMode === 'live' && s.weather) return `Basé sur la météo réelle : ${s.weather.temp} °C ressentis (Open-Meteo, ${fmtTime(s.weather.at)}).`;
  return `Basé sur la température que tu as indiquée : ${req.temp} °C (pas de météo en temps réel).`;
}

function validateClientOutfit(o) {
  const ids = outfitPieces(o);
  const must = state.st.mustItems || [];
  return ids.every((id) => { const it = itemById(id); return it && isAvailable(it) && (it.wearPref !== 'never' || must.includes(id)); });
}

async function generate({ another = false } = {}) {
  const s = state.st;
  if (s.loading) return;
  const req = stylistRequest();
  const useAI = s.mode === 'ai' && aiReady();
  if (!another) s.shownKeys = [];

  // « Autre proposition » : on puise d'abord dans les tenues déjà calculées
  if (another && s.result?.pool?.length) {
    let remaining = s.result.pool.filter((o) => !s.shownKeys.includes(o.key) && validateClientOutfit(o));
    if (!remaining.length && s.result.source === 'local') { s.shownKeys = [s.result.outfit?.key].filter(Boolean); remaining = s.result.pool.filter((o) => !s.shownKeys.includes(o.key)); }
    if (remaining.length) {
      const next = pickNext(remaining, s.shownKeys);
      s.shownKeys.push(next.key);
      s.result = { ...s.result, outfit: next };
      logGen(next, s.result.source);
      updateResult(); return;
    }
  }

  // Vérification locale d'abord : s'il manque un haut ou un bas, inutile d'appeler l'IA
  const precheck = runLocal(req, false);
  if (!precheck.outfit) { s.result = precheck; updateResult(true); return; }

  if (useAI) {
    s.loading = true; updateGenerateBtn();
    try {
      const items = state.items.map(({ id, name, category, primaryColor, secondaryColors, fit, style, seasons, status, wearPref, wearNote }) => ({ id, name, category, primaryColor, secondaryColors, fit, style, seasons, status, wearPref, wearNote }));
      const weather = s.tempMode === 'live' && s.weather ? { source: 'live', ...s.weather } : null;
      const res = await api.style({ request: req, items, weather, excludeKeys: s.shownKeys, profile: aiProfile() });
      const all = (res.outfits || []).filter(validateClientOutfit);
      const pool = all.filter((o) => !s.shownKeys.includes(o.key));
      if (another && all.length && !pool.length) {
        // L'IA ne trouve rien de nouveau : on se rabat sur l'algorithme local, en le disant
        const local = runLocal(req);
        if (local.outfit && s.shownKeys.filter((k) => k === local.outfit.key).length === 1) {
          local.warnings = ['L\'IA n\'a pas trouvé d\'autre combinaison avec tes pièces disponibles : voici une alternative de l\'algorithme local.', ...local.warnings];
          s.result = local; s.loading = false; logGen(local.outfit, 'local'); updateResult(true); return;
        }
        throw new Error('Aucune autre combinaison possible avec tes pièces disponibles.');
      }
      const warnings = [];
      if (res.dropped) warnings.push(`${plural(res.dropped, 'proposition de l\'IA a été rejetée', 'propositions de l\'IA ont été rejetées')} car elles utilisaient des pièces inexistantes ou indisponibles.`);
      (res.missing || []).forEach((m) => warnings.push(m));
      const notIncluded = req.mustItems.filter((id) => pool[0] && !outfitPieces(pool[0]).includes(id));
      if (!pool.length) throw new Error(res.missing?.[0] || 'L\'IA n\'a proposé aucune tenue valide.');
      const outfit = pickNext(pool, s.shownKeys) || pool[0];
      if (notIncluded.length && !outfitPieces(outfit).some((id) => notIncluded.includes(id))) warnings.push('L\'IA n\'a pas pu intégrer toutes les pièces imposées.');
      s.shownKeys.push(outfit.key);
      s.result = { source: 'ai', outfit, pool, warnings, missing: [], weatherNote: weatherNote(req), request: req };
    } catch (e) {
      const local = runLocal(req);
      local.fallbackReason = e.message;
      s.result = local;
    }
    s.loading = false;
  } else {
    s.shownKeys.push(precheck.outfit.key);
    s.result = precheck;
  }
  logGen(s.result?.outfit, s.result?.source === 'ai' ? 'ai' : 'local');
  updateResult(true);
}

function runLocal(req, record = true) {
  const s = state.st;
  const res = generateOutfits(state.items, req);
  const outfit = pickNext(res.outfits, s.shownKeys);
  if (outfit && record) s.shownKeys.push(outfit.key);
  return { source: 'local', outfit, pool: res.outfits, warnings: res.warnings, missing: res.missing, weatherNote: weatherNote(req), request: req };
}

function updateGenerateBtn() { if (route() === 'styliste') { const y = window.scrollY; render(); window.scrollTo(0, y); } }
function updateResult(scroll = false) {
  if (route() !== 'styliste') return;
  render();
  const el = $('#st-result .result');
  if (el && scroll) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80);
}

function openPicker(kind) {
  const s = state.st;
  const isShoes = kind === 'shoes';
  const list = state.items.filter((it) => isAvailable(it) && (isShoes ? it.category === 'chaussures' : true))
    .sort((a, b) => CATEGORIES.findIndex((c) => c.id === a.category) - CATEGORIES.findIndex((c) => c.id === b.category));
  const sel = new Set(isShoes ? (s.shoesId ? [s.shoesId] : []) : s.mustItems);
  const sh = openSheet({
    title: isShoes ? 'Chaussures imposées' : 'Pièces à porter',
    full: true,
    render: () => ({
      body: list.length ? `<p class="hint" style="margin-top:0">${isShoes ? 'Choisis une paire.' : 'Choisis une ou plusieurs pièces (un haut + un pull pour superposer, par exemple).'} Seules les pièces disponibles sont affichées.</p>
        <div class="pick-list">${list.map((it) => `<button class="pick-item" data-pick="${it.id}" aria-pressed="${sel.has(it.id)}">${photoBox(it)}<small>${esc(it.name)}</small></button>`).join('')}</div>`
        : `<div class="empty"><div class="big">${icon(isShoes ? 'shirt' : 'hanger')}</div><h3>Rien de disponible</h3><p>${isShoes ? 'Aucune paire de chaussures propre enregistrée.' : 'Aucune pièce disponible.'}</p></div>`,
      foot: '<button class="btn btn-ghost" data-pick-clear>Aucune</button><button class="btn btn-primary" data-pick-ok>Valider</button>',
    }),
  });
  sh.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) {
      const id = b.dataset.pick;
      if (isShoes) { sel.clear(); sel.add(id); $$('[data-pick]', sh.el).forEach((x) => x.setAttribute('aria-pressed', x.dataset.pick === id)); }
      else { sel.has(id) ? sel.delete(id) : sel.add(id); b.setAttribute('aria-pressed', sel.has(id)); }
      return;
    }
    if (e.target.closest('[data-pick-clear]')) sel.clear();
    if (e.target.closest('[data-pick-clear]') || e.target.closest('[data-pick-ok]')) {
      if (isShoes) s.shoesId = [...sel][0] || null; else s.mustItems = [...sel];
      sh.close(); rerender();
    }
  });
}

async function saveOutfit(o, { favorite = true, worn = false } = {}) {
  const now = new Date().toISOString();
  let rec = state.outfits.find((x) => x.key === o.key);
  if (rec) rec = { ...rec, favorite: rec.favorite || favorite, wornAt: worn ? now : rec.wornAt, wornCount: (rec.wornCount || 0) + (worn ? 1 : 0) };
  else rec = { id: uid(), key: o.key, slots: o.slots, title: o.title, explanation: o.explanation, coherence: o.coherence || '', rating: o.rating, source: state.st.result?.source || 'local', favorite, createdAt: now, wornAt: worn ? now : null, wornCount: worn ? 1 : 0 };
  await db.put('outfits', rec);
  const i = state.outfits.findIndex((x) => x.id === rec.id);
  if (i >= 0) state.outfits[i] = rec; else state.outfits.push(rec);
  return rec;
}

async function wearOutfit(o) {
  const ids = outfitPieces(o);
  const now = new Date().toISOString();
  const upd = ids.map(itemById).filter(Boolean).map((it) => ({ ...it, status: 'porte', wearCount: (it.wearCount || 0) + 1, lastWorn: now, updatedAt: now }));
  await db.putMany('items', upd);
  upd.forEach((u) => { state.items[state.items.findIndex((x) => x.id === u.id)] = u; });
}

// ================= FAVORIS =================
function viewFavorites() {
  const total = state.outfits.filter((o) => o.favorite).length;
  return `
  <header class="topbar"><h1>Favoris</h1></header>
  ${total ? `<div class="search">${icon('search')}<input type="search" id="fav-search" placeholder="Rechercher une tenue ou une pièce…" value="${esc(state.favQ)}" autocomplete="off"></div>` : ''}
  <div id="fav-results">${favResults()}</div>`;
}

function favResults() {
  const q = state.favQ.trim().toLowerCase();
  const favs = state.outfits.filter((o) => o.favorite)
    .filter((o) => !q || [o.title, ...outfitPieces(o).map((id) => itemById(id)?.name)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = state.outfits.filter((o) => o.favorite).length;
  return `${favs.length ? favs.map((o) => {
    const a = outfitAvailability(o);
    const pill = a.ok ? `<span class="pill ok">${icon('check', 'style="width:14px;height:14px"')}Portable maintenant</span>`
      : `<span class="pill ko">${icon('alert', 'style="width:14px;height:14px"')}${a.missing.length ? 'Pièce supprimée' : `Incomplète : ${plural(a.dirty.length, 'pièce indisponible', 'pièces indisponibles')}`}</span>`;
    return `<button class="card fav" data-act="open-outfit" data-id="${o.id}">${mosaic(o)}<div class="body"><strong>${esc(o.title)}</strong><small>${plural(outfitPieces(o).length, 'pièce', 'pièces')} · ${fmtDate(o.createdAt)}</small><br>${pill}</div>${icon('right')}</button>`;
  }).join('') : total
    ? `<div class="empty"><div class="big">${icon('search')}</div><h3>Aucun résultat</h3></div>`
    : `<div class="empty"><div class="big">${icon('heart')}</div><h3>Aucune tenue favorite</h3><p>Crée une tenue avec le styliste puis appuie sur « Favori » pour la retrouver ici.</p><a class="btn btn-primary" href="#/styliste">${icon('sparkle')}Créer ma tenue</a></div>`}`;
}

// ----- Aperçu en stickers -----
async function outfitPieceImages(o) {
  const s = o.slots || {};
  const entries = [['top', s.top], ['dress', s.dress], ['layer', s.layer], ['bottom', s.bottom], ['shoes', s.shoes], ['outer', s.outer], ...(s.accessories || []).map((a) => ['accessory', a])];
  const pieces = [];
  for (const [role, id] of entries) {
    const it = id && itemById(id);
    if (!it) continue;
    let img = null, kind = 'color';
    try {
      const pid = it.sticker || it.photos?.[0];
      const b = pid ? await blobOfPhoto(pid) : null;
      if (b) { img = await loadImage(b); kind = it.sticker ? 'sticker' : 'photo'; }
    } catch { /* on retombe sur la pastille de couleur */ }
    pieces.push({ id: it.id, role, name: it.name, category: it.category, img, kind, color: colorOf(it.primaryColor)?.hex, colorLabel: colorOf(it.primaryColor)?.label });
  }
  return pieces;
}

function openOutfitPreview(o, startView = 'stickers') {
  const st = { view: startView, urls: {}, blobs: {}, err: null, noSticker: [], pieces: null };
  const accent = () => (gender() === 'f' ? '#FF8FC7' : '#C8F135');
  const sh = openSheet({
    title: 'Aperçu de la tenue',
    full: true,
    render: () => {
      const tabs = `<div class="segmented" role="group" aria-label="Type d'aperçu"><button data-pv="stickers" aria-pressed="${st.view === 'stickers'}">Stickers</button><button data-pv="avatar" aria-pressed="${st.view === 'avatar'}">Mon avatar</button><button data-pv="ai" aria-pressed="${st.view === 'ai'}">Avatar IA</button></div>`;
      const url = st.urls[st.view];
      let body;
      if (st.view === 'ai' && !url) {
        const ready = aiReady();
        body = st.aiBusy
          ? `<div class="empty"><span class="spinner" style="color:var(--accent)"></span><p><b>Création de ton avatar…</b><br>Ça prend en général 20 à 60 secondes. Garde l'app ouverte.</p></div>`
          : `${st.aiErr ? `<div class="warn bad" style="margin-top:12px">${icon('alert')}<span>${esc(st.aiErr)}</span></div>` : ''}
             <div class="card" style="padding:16px;margin-top:12px"><b>Avatar réaliste généré par IA</b>
               <p class="muted" style="margin:8px 0 12px">Gemini crée une image de toi portant cette tenue, d'après tes mensurations, ta photo de visage (seulement si tu l'autorises) et les photos de tes vêtements. Une génération utilise ton quota Google, et le résultat peut s'écarter de la réalité (visage, coupe, détails).</p>
               ${ready ? `<button type="button" class="btn btn-primary btn-block" data-ai-go>${icon('sparkle')}${st.aiErr ? 'Réessayer' : 'Générer mon avatar IA'}</button>` : `<div class="warn">${icon('info')}<span>L'IA n'est pas connectée : ${esc(aiOffReason())}</span></div>`}</div>`;
      } else if (st.err) body = `<div class="warn bad" style="margin-top:12px">${icon('alert')}<span>${esc(st.err)}</span></div>`;
      else if (!url) body = `<div class="empty"><span class="spinner" style="color:var(--accent)"></span><p>Composition de l'image…</p></div>`;
      else {
        const hasBody = !!(state.me && (state.me.height || state.me.face));
        const hint = st.view === 'avatar'
          ? `${hasBody ? '' : `<p class="hint">Cet avatar utilise des proportions moyennes. Renseigne ta taille, ton poids et ta photo dans <a href="#/profil" data-go-profil style="color:var(--accent)">Mon profil</a> pour qu'il te ressemble.</p>`}${st.noSticker.length ? `<p class="hint">${plural(st.noSticker.length, 'pièce n\'a pas', 'pièces n\'ont pas')} de sticker (${st.noSticker.map(esc).join(', ')}) : une forme de la bonne couleur la remplace.</p>` : ''}`
          : (st.noSticker.length ? `<p class="hint">${plural(st.noSticker.length, 'pièce n\'a pas', 'pièces n\'ont pas')} de sticker (${st.noSticker.map(esc).join(', ')}) : leur photo est utilisée à la place. Ouvre la pièce › Modifier › « Créer le sticker ».</p>` : '');
        body = `<img class="preview-img" style="margin-top:12px" src="${url}" alt="Aperçu de la tenue : ${esc(o.title)}">${st.view === 'ai' ? '<p class="hint">Image générée par IA : le visage et les détails peuvent différer de la réalité. Les vêtements sont recréés d\'après tes photos.</p>' : hint}`;
      }
      return { body: tabs + body, foot: url ? `<button type="button" class="btn btn-primary" data-save-img>${icon('download')}Enregistrer / partager</button>` : '' };
    },
    onClose: () => { Object.values(st.urls).forEach((u) => URL.revokeObjectURL(u)); },
  });
  async function build(view) {
    if (view === 'ai') { if (!sh.closed) sh.refresh(); return; }
    if (st.urls[view]) { if (!sh.closed) sh.refresh(); return; }
    try {
      st.pieces ||= await outfitPieceImages(o);
      if (!st.pieces.length) throw new Error('Aucune pièce de cette tenue n\'existe plus dans ton dressing.');
      st.noSticker = st.pieces.filter((p) => p.kind !== 'sticker').map((p) => p.name);
      let blob;
      if (view === 'avatar') {
        let face = null;
        try { const fb = state.me?.face ? await blobOfPhoto(state.me.face) : null; if (fb) face = await loadImage(fb); } catch { /* sans visage */ }
        blob = await renderAvatar({ me: state.me || {}, face, pieces: st.pieces, title: o.title, accent: accent() });
      } else blob = await renderOutfitImage({ title: o.title, pieces: st.pieces, accent: accent() });
      st.blobs[view] = blob; st.urls[view] = URL.createObjectURL(blob);
    } catch (e) { st.err = e.message || 'Impossible de créer l\'aperçu.'; }
    if (!sh.closed) sh.refresh();
  }
  build(st.view);
  async function generateAI() {
    const me = state.me || {};
    let includeFace = false;
    if (me.face) {
      if (me.faceToAI) includeFace = true;
      else {
        const c = await dialog({ title: 'Envoyer ta photo à Google ?', text: 'Pour que l\'avatar te ressemble, ta photo de visage sera envoyée à Google Gemini. Sur l\'offre gratuite de Google, les images envoyées peuvent servir à améliorer leurs produits. Tu peux aussi générer un avatar sans ta photo.', buttons: [{ label: 'Envoyer ma photo', value: 'face', cls: 'btn-primary' }, { label: 'Sans ma photo', value: 'noface', cls: 'btn-ghost' }, { label: 'Annuler', value: false, cls: 'btn-ghost' }] });
        if (!c) return;
        if (c === 'face') { includeFace = true; await saveMe({ faceToAI: true }); }
      }
    }
    st.aiBusy = true; st.aiErr = null; sh.refresh();
    try {
      st.pieces ||= await outfitPieceImages(o);
      if (!st.pieces.length) throw new Error('Aucune pièce de cette tenue n\'existe plus dans ton dressing.');
      const shot = async (img) => blobToBase64(await resizeTo(img, 448, 0.8));
      const pieces = [];
      for (const p of st.pieces) pieces.push({ role: p.role, name: p.name, color: p.colorLabel, ...(p.img ? { image: await shot(p.img), mime: 'image/jpeg' } : {}) });
      let face;
      if (includeFace) {
        const fb = await blobOfPhoto(me.face);
        if (fb) face = { image: await blobToBase64(await resizeTo(await loadImage(fb), 640, 0.82)), mime: 'image/jpeg' };
      }
      const prof = aiProfile();
      const res = await api.avatar({ gender: gender(), skin: me.skin, profile: { heightCm: prof.heightCm, weightKg: prof.weightKg }, pieces, ...(face ? { face } : {}) });
      const { mime, data } = extractImage(res);
      const blob = b64ToBlob(data, mime);
      st.blobs.ai = blob; st.urls.ai = URL.createObjectURL(blob);
    } catch (e) { st.aiErr = e.message || 'Génération impossible.'; }
    st.aiBusy = false;
    if (!sh.closed) sh.refresh();
  }
  sh.el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-ai-go]')) { generateAI(); return; }
    const pv = e.target.closest('[data-pv]');
    if (pv) { st.view = pv.dataset.pv; st.err = null; sh.refresh(); build(st.view); return; }
    if (e.target.closest('[data-go-profil]')) { e.preventDefault(); sh.close('force'); location.hash = '#/profil'; return; }
    const blob = st.blobs[st.view];
    if (!e.target.closest('[data-save-img]') || !blob) return;
    const name = `${st.view === 'ai' ? 'avatar-ia' : st.view === 'avatar' ? 'avatar' : 'tenue'}-${(o.title || 'mon-dressing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mon-dressing'}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: o.title }); return; }
    } catch (err) { if (err?.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = st.urls[st.view]; a.download = name; document.body.append(a); a.click(); a.remove();
    toast('Image enregistrée');
  });
}

function openOutfit(id) {
  const sh = openSheet({
    title: 'Tenue',
    full: true,
    render: () => {
      const o = state.outfits.find((x) => x.id === id);
      if (!o) return { body: '<p class="muted">Tenue supprimée.</p>' };
      const a = outfitAvailability(o);
      const status = a.ok ? `<div class="ai-box">${icon('check')}<p><b>Toutes les pièces sont disponibles.</b> Tu peux la porter aujourd'hui.</p></div>`
        : `<div class="warn bad">${icon('alert')}<span>Cette tenue ne peut pas être portée intégralement pour le moment : ${[...a.dirty.map((it) => `« ${esc(it.name)} » est ${esc(statusOf(it.status).label.toLowerCase())}`), ...(a.missing.length ? [`${plural(a.missing.length, 'pièce a été supprimée', 'pièces ont été supprimées')} du dressing`] : [])].join(' ; ')}.</span></div>`;
      return {
        body: `<h3 class="detail-title" style="margin-top:4px">${esc(o.title)}</h3>
          <p class="muted small" style="margin:0">${o.source === 'ai' ? 'Composée par l\'IA' : 'Composée par l\'algorithme local'} · ${fmtDate(o.createdAt)}${o.wornCount ? ` · portée ${plural(o.wornCount, 'fois', 'fois')}` : ''}</p>
          <div style="margin-top:14px">${status}</div>
          <button class="btn btn-block" style="margin-top:14px" data-preview>${icon('image')}Aperçu : stickers &amp; avatar</button>
          ${outfitBoard(o, false)}
          <div class="card score"><div class="score-top"><span class="muted small" style="font-weight:700">Cohérence</span><b>${o.rating}<span class="dim" style="font-size:14px">/10</span></b></div><div class="bar"><i style="width:${o.rating * 10}%"></i></div><p>${esc(o.explanation)}</p>${o.coherence ? `<p><b style="color:var(--text)">${esc(o.coherence)}</b></p>` : ''}</div>`,
        foot: `<button class="btn btn-danger" data-del style="flex:0 0 56px" aria-label="Supprimer">${icon('trash')}</button>${o.favorite ? '' : '<button class="btn" data-fav>★ Favori</button>'}<button class="btn btn-primary" data-wear ${a.ok ? '' : 'disabled'}>${icon('hand')}Je la porte</button>`,
      };
    },
  });
  sh.kind = 'outfit';
  sh.el.addEventListener('click', async (e) => {
    const o = state.outfits.find((x) => x.id === id);
    if (!o) return;
    if (e.target.closest('[data-preview]')) { openOutfitPreview(o); return; }
    if (e.target.closest('[data-wear]')) {
      await wearOutfit(o);
      const upd = { ...o, wornAt: new Date().toISOString(), wornCount: (o.wornCount || 0) + 1 };
      await db.put('outfits', upd); state.outfits[state.outfits.indexOf(o)] = upd;
      toast('Bonne journée ! Les pièces sont marquées « portées ».'); sh.refresh(); rerender();
    }
    if (e.target.closest('[data-fav]')) { const upd = { ...o, favorite: true }; await db.put('outfits', upd); state.outfits[state.outfits.indexOf(o)] = upd; toast('Ajoutée aux favoris'); sh.refresh(); rerender(); }
    if (e.target.closest('[data-del]')) {
      if (!(await confirmDialog('Supprimer cette tenue ?', 'Les vêtements restent dans ton dressing.', 'Supprimer', true))) return;
      await db.del('outfits', id); state.outfits = state.outfits.filter((x) => x.id !== id);
      sh.close('force'); toast('Tenue supprimée'); rerender();
    }
  });
}

let stickerBatchRunning = false;
async function makeMissingStickers() {
  if (stickerBatchRunning) return;
  const todo = state.items.filter((i) => i.photos?.length && !i.sticker);
  if (!todo.length) { toast('Toutes les pièces ont déjà un sticker.'); return; }
  stickerBatchRunning = true;
  let ok = 0, fail = 0, lastErr = '';
  for (let n = 0; n < todo.length; n++) {
    toast(`Sticker ${n + 1} / ${todo.length}…`, { timeout: 60000 });
    try {
      const { pid } = await stickerFromPhoto(todo[n].photos[0]);
      const upd = { ...todo[n], sticker: pid, updatedAt: new Date().toISOString() };
      await db.put('items', upd); state.items[state.items.findIndex((x) => x.id === upd.id)] = upd; ok++;
    } catch (e) { fail++; lastErr = e.message; }
  }
  stickerBatchRunning = false;
  toast(`${plural(ok, 'sticker créé', 'stickers créés')}${fail ? ` · ${plural(fail, 'échec', 'échecs')} (${lastErr})` : ''}`, { type: fail ? 'error' : 'ok', timeout: 5000 });
  rerender();
}

// ================= MON PROFIL =================
const meVal = () => state.me || {};
async function saveMe(patch) {
  state.me = { ...(state.me || {}), ...patch };
  await setMeta('me', state.me);
}
let meAvatarRun = 0;
async function refreshMeAvatar() {
  const run = ++meAvatarRun;
  const img = $('#me-avatar-img'); if (!img) return;
  try {
    const me = meVal();
    let face = null;
    try { const fb = me.face ? await blobOfPhoto(me.face) : null; if (fb) face = await loadImage(fb); } catch { /* sans visage */ }
    const blob = await renderAvatar({ me, face, pieces: [], title: 'Mon avatar', accent: gender() === 'f' ? '#FF8FC7' : '#C8F135' });
    if (run !== meAvatarRun || !$('#me-avatar-img')) return;
    const old = img.dataset.url; if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(blob); img.dataset.url = url; img.src = url; img.hidden = false;
    $('#me-avatar-wait')?.remove();
  } catch { /* l'aperçu est facultatif */ }
}

function viewMe() {
  const me = meVal();
  const hist = filterHistory(state.history, state.pf);
  const sm = summary(hist);
  const trend = sm.trend == null ? '' : sm.trend > 0.25 ? `<span class="up">▲ +${fmtRating(sm.trend)}</span>` : sm.trend < -0.25 ? `<span class="down">▼ ${fmtRating(sm.trend)}</span>` : '<span>≈ stable</span>';
  const pfBtn = (id, l) => `<button data-act="me-pf" data-v="${id}" aria-pressed="${state.pf === id}">${l}</button>`;
  const rows = [...hist].reverse().slice(0, 15).map((h) => `<tr><td>${fmtDate(h.at)}</td><td>${esc(h.title)}</td><td>${h.source === 'ai' ? 'IA' : 'Local'}</td><td><b>${h.rating}</b>/10</td></tr>`).join('');
  return `
  <header class="topbar"><a class="icon-btn" href="#/home" aria-label="Retour">${icon('left')}</a><h1 style="font-size:22px">Mon profil</h1><span style="width:44px"></span></header>

  <div class="card me-avatar"><div id="me-avatar-wait"><span class="spinner" style="color:var(--accent)"></span></div><img id="me-avatar-img" alt="Mon avatar" hidden></div>
  <p class="hint" style="text-align:center">Avatar stylisé calculé sur ton téléphone d'après tes mesures. Ce n'est pas une photo réaliste.</p>

  <div class="section-title"><h2>Mon corps</h2></div>
  <div class="card set-group" style="padding:16px">
    <div class="two-col">
      <div class="field"><label class="label" for="me-height">Taille (cm)</label><input id="me-height" class="input" type="number" inputmode="numeric" min="120" max="215" placeholder="Ex. 178" value="${esc(me.height ?? '')}"></div>
      <div class="field"><label class="label" for="me-weight">Poids (kg)</label><input id="me-weight" class="input" type="number" inputmode="decimal" min="30" max="250" placeholder="Facultatif" value="${esc(me.weight ?? '')}"></div>
    </div>
    <div class="field"><div class="label">Teint de l'avatar</div>
      <div class="swatches">${SKIN_TONES.map((t) => `<button class="swatch-btn" data-act="me-skin" data-v="${t.id}" aria-pressed="${(me.skin || 'moyen') === t.id}" aria-label="${t.label}"><span style="background:${t.hex}"></span></button>`).join('')}</div></div>
    <div class="field"><div class="label">Ma photo de visage</div>
      <div class="btn-row" style="flex-wrap:wrap">
        <label class="btn" style="cursor:pointer">${icon('camera')}Prendre<input type="file" accept="image/*" capture="user" class="sr" data-me-face="cam"></label>
        <label class="btn" style="cursor:pointer">${icon('image')}Galerie<input type="file" accept="image/*" class="sr" data-me-face="gallery"></label>
        ${me.face ? `<button class="btn" data-act="me-face-flip">${icon('refresh')}Retourner</button><button class="btn btn-ghost" data-act="me-face-remove" aria-label="Retirer la photo">${icon('trash')}</button>` : ''}
      </div>
      <p class="hint">Une photo de face, bien éclairée. Si elle est à l'envers de ce que tu attends (effet miroir), touche « Retourner » : ton choix est retenu pour les prochaines photos prises avec l'appareil. Elle reste sur ton téléphone : <b>elle n'est jamais envoyée à l'IA</b>. Elle est incluse dans ta sauvegarde exportée.</p></div>
  </div>

  <div class="section-title"><h2>Mon style</h2></div>
  <div class="card set-group" style="padding:16px">
    <div class="field"><div class="label">Mes styles préférés</div>
      <div class="chips wrap">${STYLES.map((x) => `<button class="chip accent" data-act="me-style" data-v="${x.id}" aria-pressed="${(me.prefStyles || []).includes(x.id)}">${x.label}</button>`).join('')}</div></div>
    <div class="field"><label class="label" for="me-note">Mon style en quelques mots</label><input id="me-note" class="input" maxlength="120" placeholder="Ex. oversize, tons terre, un peu vintage" value="${esc(me.styleNote || '')}" autocomplete="off"></div>
    <label class="check-row"><input type="checkbox" id="me-share" ${me.share === false ? '' : 'checked'}><span><b>Adapter les coupes à ma morphologie</b><small>Envoie ma taille et mon poids à l'IA (Gemini) avec ma demande de tenue, rien d'autre. Ma photo n'est jamais envoyée.</small></span></label>
    <label class="check-row" style="margin-top:12px"><input type="checkbox" id="me-faceai" ${me.faceToAI ? 'checked' : ''}><span><b>Autoriser l'avatar IA à utiliser ma photo de visage</b><small>Quand je génère un avatar IA, ma photo est envoyée à Google Gemini pour que l'image me ressemble. Sinon, elle ne quitte jamais mon téléphone. Je peux décocher à tout moment.</small></span></label>
    <p class="hint">Mes styles préférés et mes mots-clés sont utilisés par le styliste IA et par l'algorithme local.</p>
  </div>

  <div class="section-title"><h2>Progression</h2></div>
  <div class="card set-group" style="padding:16px">
    <div class="segmented" role="group" aria-label="Source des tenues">${pfBtn('ai', 'Tenues IA')}${pfBtn('local', 'Locales')}${pfBtn('all', 'Toutes')}</div>
    ${hist.length ? `
    <div class="pf-stats"><div><b>${sm.count}</b><span>tenue${sm.count > 1 ? 's' : ''}</span></div><div><b>${fmtRating(sm.avg)}</b><span>moyenne /10</span></div><div><b>${sm.best}</b><span>meilleure</span></div><div><b>${trend || '—'}</b><span>tendance</span></div></div>
    <h3 class="pf-title">Cohérence de chaque tenue créée</h3>
    ${state.pfTable ? `<table class="pf-table"><thead><tr><th>Date</th><th>Tenue</th><th>Source</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>` : chartSVG(hist)}
    <p class="pf-tip" id="pf-tip" aria-live="polite">${state.pfTable ? '15 dernières tenues' : 'Touche un point pour voir la tenue.'}</p>
    <button class="btn btn-sm btn-ghost" data-act="me-table">${state.pfTable ? 'Voir la courbe' : 'Voir en tableau'}</button>
    <p class="hint">La note est celle que le styliste donne à la cohérence (couleurs, coupes, formalité). Elle mesure la tenue, pas toi. Chaque tenue affichée par le styliste ajoute un point.</p>`
    : `<div class="empty" style="padding:20px 0 6px"><div class="big">${icon('sparkle')}</div><h3>Pas encore de courbe</h3><p>${state.pf === 'ai' ? 'Crée une tenue avec le styliste en mode IA' : 'Crée une tenue avec le styliste'} : chaque tenue ajoute un point à ta courbe.</p><button class="btn btn-primary" data-act="goto" data-to="styliste">${icon('sparkle')}Créer ma tenue</button></div>`}
  </div>`;
}

// ================= RÉGLAGES =================
let storageCache = null;
function viewSettings() {
  const h = state.health;
  const line = (ok, txt) => `<div class="conn"><i class="dot" style="background:${ok ? 'var(--accent)' : ok === null ? 'var(--dim)' : 'var(--danger)'}"></i>${txt}</div>`;
  const server = !h ? line(null, 'Vérification…') : h.error ? line(false, h.code === 'no-server' ? 'Serveur IA absent (app publiée sans serveur)' : 'Serveur injoignable') : line(true, 'Serveur en ligne');
  const key = h && !h.error ? line(h.configured.ai, h.configured.ai ? 'Clé Gemini configurée (cachée sur le serveur)' : 'Clé Gemini manquante sur le serveur') : '';
  const pass = h && !h.error ? line(h.authorized, h.authorized ? 'Mot de passe correct' : h.configured.password ? 'Mot de passe à saisir ou incorrect' : 'Mot de passe pas encore défini sur le serveur') : '';
  const si = storageCache;
  const mb = (b) => (b / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  return `
  <header class="topbar"><a class="icon-btn" href="#/home" aria-label="Retour">${icon('left')}</a><h1 style="font-size:22px">Réglages</h1><span style="width:44px"></span></header>

  <a class="card action-tile" href="#/profil" style="margin-bottom:14px"><span class="ico">${icon('user')}</span><span><strong>Mon profil &amp; progression</strong><small>Taille, style, avatar, courbe de tes tenues</small></span></a>
  <div class="section-title"><h2>Profil</h2></div>
  <div class="card set-group" style="padding:16px">
    <div class="segmented" role="group" aria-label="Profil">${GENDERS.map((g) => `<button data-act="set-gender" data-v="${g.id}" aria-pressed="${gender() === g.id}">${g.label}</button>`).join('')}</div>
    <p class="hint">Le profil féminin ajoute les robes, jupes et sacs. Tes pièces ne sont jamais supprimées en changeant de profil.</p>
    <div class="gender-card disabled inline" aria-disabled="true"><span class="ico rainbow">${icon('heart')}</span><span><strong class="strike">LGBTQQIA2SNBP+</strong></span></div>
  </div>

  <div class="section-title"><h2>Connexion IA</h2></div>
  <div class="card set-group" style="padding:16px">
    <div style="display:flex;flex-direction:column;gap:8px">${server}${key}${pass}</div>
    <div class="field" style="margin-top:16px"><label for="pw">Mot de passe de l'app</label>
      <input id="pw" class="input" type="password" autocomplete="current-password" value="${esc(settings.password)}" placeholder="Celui défini lors de l'installation">
      <p class="hint">Il empêche les inconnus d'utiliser ton quota d'IA. La clé Gemini, elle, ne quitte jamais le serveur.</p></div>
    <button class="btn btn-primary btn-block" data-act="save-password">${icon('check')}Enregistrer et tester</button>
  </div>

  <div class="section-title"><h2>Stickers</h2></div>
  <div class="card set-group" style="padding:16px">
    <p style="margin:0 0 12px">Chaque pièce peut avoir un <b style="color:var(--text)">sticker</b> (photo sans fond) pour l'aperçu des tenues. ${state.items.filter((i) => i.photos?.length && !i.sticker).length ? `<b style="color:var(--text)">${plural(state.items.filter((i) => i.photos?.length && !i.sticker).length, 'pièce n\'a pas', 'pièces n\'ont pas')}</b> encore de sticker.` : 'Toutes tes pièces avec photo ont un sticker.'}</p>
    <button class="btn btn-block" data-act="make-stickers" ${state.items.some((i) => i.photos?.length && !i.sticker) ? '' : 'disabled'}>${icon('image')}Créer les stickers manquants</button>
    <p class="hint">Détourage fait sur ton téléphone. Le premier téléchargement du modèle prend un moment, ensuite c'est plus rapide.</p>
  </div>

  <div class="section-title"><h2>Sauvegarde</h2></div>
  <div class="card set-group" style="padding:16px">
    <p style="margin:0 0 14px">Ton dressing est stocké <b style="color:var(--text)">sur cet iPhone uniquement</b>. Exporte régulièrement un fichier de sauvegarde (photos incluses) dans « Fichiers » ou iCloud Drive.</p>
    <p class="small dim" style="margin:0 0 14px">Dernière sauvegarde : ${state.lastExport ? fmtDate(state.lastExport) + ' à ' + fmtTime(state.lastExport) : 'jamais'}</p>
    <div class="btn-row"><button class="btn" data-act="export">${icon('download')}Exporter</button><label class="btn" style="cursor:pointer">${icon('upload')}Importer<input type="file" accept="application/json,.json" class="sr" id="import-file"></label></div>
  </div>

  <div class="section-title"><h2>Stockage</h2></div>
  <div class="card set-group">
    <div class="row"><span>Pièces</span><span>${state.items.length}</span></div>
    <div class="row"><span>Tenues enregistrées</span><span>${state.outfits.length}</span></div>
    <div class="row"><span>Espace utilisé</span><span>${si?.usage != null ? mb(si.usage) : '—'}</span></div>
    <div class="row"><span>Stockage protégé</span><span>${si?.persisted == null ? '—' : si.persisted ? 'Oui' : `Non <button class="link" data-act="persist" style="padding:0 0 0 6px">Activer</button>`}</span></div>
    <div class="row"><span>Mode</span><span>${matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'App installée' : 'Navigateur'}</span></div>
  </div>
  ${!(matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? `<div class="warn" style="margin-top:12px">${icon('info')}<span>Installe l\'app sur l'écran d'accueil (Partager › Sur l'écran d'accueil) <b>avant</b> de remplir ton dressing : l'app installée et Safari ont des stockages séparés.</span></div>` : ''}

  <div class="section-title"><h2>Zone sensible</h2></div>
  <button class="btn btn-danger btn-block" data-act="wipe">${icon('trash')}Effacer toutes les données</button>
  <p class="hint" style="text-align:center;margin-top:20px">Mon dressing · version 1.1 · données stockées localement</p>`;
}

async function doExport() {
  try {
    const blob = await exportAll();
    const name = `mon-dressing-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    let shared = false;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Sauvegarde Mon dressing' }); shared = true; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    if (!shared) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
    state.lastExport = new Date().toISOString(); await setMeta('lastExport', state.lastExport);
    toast(`Sauvegarde créée (${(blob.size / 1048576).toFixed(1).replace('.', ',')} Mo)`); rerender();
  } catch (e) { toast(`Export impossible : ${e.message}`, { type: 'error' }); }
}

async function doImport(file) {
  if (!file) return;
  const mode = await dialog({
    title: 'Importer la sauvegarde',
    text: `« ${file.name} » — fusionner avec le dressing actuel, ou remplacer entièrement ?`,
    buttons: [{ label: 'Fusionner', value: 'merge', cls: 'btn-primary' }, { label: 'Remplacer tout', value: 'replace', cls: 'btn-danger' }, { label: 'Annuler', value: null, cls: 'btn-ghost' }],
  });
  if (!mode) return;
  try {
    const text = await file.text();
    const r = await importAll(text, mode);
    await loadData();
    toast(`Import réussi : ${plural(r.items, 'pièce', 'pièces')}, ${plural(r.outfits, 'tenue', 'tenues')}`); rerender();
  } catch (e) { toast(e.message, { type: 'error' }); }
}

// ================= Événements globaux =================
const actions = {
  'add-item': () => openItemForm(),
  goto: (el) => go(el.dataset.to),
  'goto-dressing': (el) => { state.w.status = el.dataset.status || 'all'; state.w.cat = 'all'; go('dressing'); },
  'open-item': (el) => openItem(el.dataset.id),
  'open-outfit': (el) => openOutfit(el.dataset.id),
  'st-preview': () => { const o = state.st.result?.outfit; if (o) openOutfitPreview(o); },
  'make-stickers': () => makeMissingStickers(),
  'cycle-status': async (el) => {
    const it = itemById(el.dataset.id); if (!it) return;
    const order = STATUSES.map((s) => s.id);
    haptic();
    await setStatus([it.id], order[(order.indexOf(it.status) + 1) % order.length]);
    rerender();
  },
  'w-status': (el) => { state.w.status = el.dataset.v; rerender(); },
  'w-cat': (el) => { state.w.cat = el.dataset.v; rerender(); },
  'clear-search': () => { state.w.q = ''; rerender(); },
  'reset-filters': () => { Object.assign(state.w, { q: '', status: 'all', cat: 'all', colors: [], brands: [], styles: [], sort: 'recent' }); rerender(); },
  'open-filters': () => openFilters(),
  bulk: async (el) => {
    const ids = state.items.filter((i) => i.status === el.dataset.from).map((i) => i.id);
    if (!ids.length) return;
    await setStatus(ids, el.dataset.to); rerender();
  },
  'st-mode': (el) => {
    if (el.dataset.v === 'ai' && !aiReady()) toast(aiOffReason(), { type: 'error' });
    state.st.mode = el.dataset.v; rerender();
  },
  'st-set': (el) => { state.st[el.dataset.k] = el.dataset.v; rerender(); },
  'st-color': (el) => {
    const arr = state.st[el.dataset.k]; const v = el.dataset.v; const i = arr.indexOf(v);
    i >= 0 ? arr.splice(i, 1) : arr.push(v);
    const other = el.dataset.k === 'preferColors' ? 'avoidColors' : 'preferColors';
    state.st[other] = state.st[other].filter((c) => c !== v);
    rerender();
  },
  'st-formality-auto': () => { state.st.formality = null; rerender(); },
  'st-live': async (el) => {
    el.disabled = true; el.innerHTML = '<span class="spinner"></span>Localisation…';
    try { state.st.weather = await fetchWeather(); state.st.tempMode = 'live'; toast(`Météo réelle : ${state.st.weather.temp} °C ressentis`); }
    catch (e) { toast(e.message, { type: 'error' }); }
    rerender();
  },
  'st-manual': () => { state.st.tempMode = 'manual'; if (state.st.weather) state.st.temp = state.st.weather.temp; rerender(); },
  'st-pick': (el) => openPicker(el.dataset.k),
  'st-unpick': (el) => { if (el.dataset.k === 'shoes') state.st.shoesId = null; else state.st.mustItems = state.st.mustItems.filter((x) => x !== el.dataset.v); rerender(); },
  'st-generate': () => generate(),
  'st-another': () => generate({ another: true }),
  'st-variant': (el) => {
    const r = state.st.result; const v = r?.outfit?.variants?.[+el.dataset.i]; if (!v) return;
    const old = r.outfit.slots[v.slot];
    const slots = { ...r.outfit.slots, [v.slot]: v.itemId };
    const variants = r.outfit.variants.filter((x) => x !== v);
    if (old) variants.unshift({ slot: v.slot, itemId: old, note: `Revenir à ${itemById(old)?.name || 'la pièce d\'origine'}` });
    r.outfit = { ...r.outfit, slots, variants: variants.slice(0, 3), rating: v.rating || r.outfit.rating, title: r.outfit.title, explanation: `${r.outfit.explanation} Variante : ${v.note}.`, key: `${slots.top || slots.dress}|${slots.bottom}|${slots.shoes}|${slots.outer}|${slots.layer}` };
    updateResult();
  },
  'st-save': async () => { const o = state.st.result?.outfit; if (!o) return; await saveOutfit(o, { favorite: true }); toast('Tenue ajoutée aux favoris'); updateResult(); },
  'st-wear': async () => {
    const o = state.st.result?.outfit; if (!o) return;
    await wearOutfit(o); await saveOutfit(o, { favorite: false, worn: true });
    toast('Bonne journée ! Les pièces sont marquées « portées ».'); updateResult();
  },
  'save-password': async () => {
    settings.password = $('#pw').value.trim();
    state.health = null; rerender();
    await refreshHealth(); rerender();
    toast(aiReady() ? 'IA connectée' : aiOffReason(), { type: aiReady() ? 'ok' : 'error' });
    if (aiReady()) state.st.mode = 'ai';
  },
  'pick-gender': async (el) => {
    state.profile = { gender: el.dataset.v }; await setMeta('profile', state.profile); applyProfile();
    location.hash = '#/home'; render(true); window.scrollTo(0, 0);
    toast(el.dataset.v === 'f' ? 'Profil féminin activé' : 'Profil masculin activé');
  },
  'me-skin': async (el) => { await saveMe({ skin: el.dataset.v }); rerender(); },
  'me-style': async (el) => {
    const cur = new Set(meVal().prefStyles || []);
    cur.has(el.dataset.v) ? cur.delete(el.dataset.v) : cur.add(el.dataset.v);
    await saveMe({ prefStyles: [...cur] }); rerender();
  },
  'me-face-flip': async () => {
    const old = meVal().face; if (!old) return;
    const img = await loadImage(await blobOfPhoto(old));
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0);
    const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Retournement impossible.'))), 'image/jpeg', 0.88));
    const pid = await savePhoto(blob);
    const patch = { face: pid };
    if (meVal().faceSource === 'cam') patch.flipCamera = !meVal().flipCamera; // retenu pour les prochaines photos prises à l'appareil
    await saveMe(patch); await deletePhotos([old]);
    rerender(); toast('Photo retournée');
  },
  'me-face-remove': async () => {
    const old = meVal().face; await saveMe({ face: null });
    if (old) await deletePhotos([old]);
    rerender(); toast('Photo retirée');
  },
  'me-pf': (el) => { state.pf = el.dataset.v; rerender(); },
  'me-table': () => { state.pfTable = !state.pfTable; rerender(); },
  'set-gender': async (el) => {
    state.profile = { gender: el.dataset.v }; await setMeta('profile', state.profile); applyProfile();
    state.w.cat = 'all'; rerender(); toast('Profil modifié');
  },
  export: () => doExport(),
  persist: async () => { const ok = await requestPersist(); storageCache = await storageInfo(); toast(ok ? 'Stockage protégé' : 'Le navigateur a refusé (installe l\'app sur l\'écran d\'accueil).', { type: ok ? 'ok' : 'error' }); rerender(); },
  wipe: async () => {
    if (!(await confirmDialog('Tout effacer ?', 'Toutes tes pièces, photos et tenues seront supprimées de cet appareil. Exporte une sauvegarde avant si besoin.', 'Tout effacer', true))) return;
    if (!(await confirmDialog('Vraiment ?', 'Cette action est irréversible.', 'Oui, tout effacer', true))) return;
    const keepProfile = state.profile; await db.clearAll(); if (keepProfile) await setMeta('profile', keepProfile); await loadData(); state.st.result = null; toast('Données effacées'); go('home');
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch((err) => toast(err.message || 'Une erreur est survenue.', { type: 'error' })); }
});

let searchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'w-search') {
    state.w.q = e.target.value;
    const clr = $('[data-act="clear-search"]'); if (clr) clr.hidden = !state.w.q;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { const box = $('#w-results'); if (box) { box.innerHTML = dressingResults(); hydratePhotos(box); } }, 150);
  }
  if (e.target.id === 'fav-search') {
    state.favQ = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { const box = $('#fav-results'); if (box) { box.innerHTML = favResults(); hydratePhotos(box); } }, 150);
  }
  const r = e.target.dataset?.stRange;
  if (r) {
    state.st[r] = Number(e.target.value);
    if (r === 'temp') { const t = e.target.closest('.field').querySelector('.temp'); if (t) t.textContent = `${e.target.value}°`; }
    if (r === 'formality') { const l = e.target.closest('.field').querySelector('.label span'); if (l) l.textContent = `Formalité · ${['', 'Très décontracté', 'Décontracté', 'Intermédiaire', 'Habillé', 'Très habillé'][e.target.value]}`; }
  }
  if (e.target.dataset?.stText) state.st[e.target.dataset.stText] = e.target.value;
});
document.addEventListener('click', (e) => {
  const hit = e.target.closest('.ch-hit');
  if (!hit) return;
  const h = filterHistory(state.history, state.pf)[Number(hit.dataset.i)];
  const tip = $('#pf-tip');
  if (h && tip) tip.textContent = `${h.title} · ${h.rating}/10 · ${fmtDate(h.at)} · ${h.source === 'ai' ? 'créée par l\'IA' : 'algorithme local'}`;
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'me-height' || t.id === 'me-weight') {
    const raw = t.value.trim();
    const [lo, hi, key, label] = t.id === 'me-height' ? [120, 215, 'height', 'La taille'] : [30, 250, 'weight', 'Le poids'];
    if (raw === '') { await saveMe({ [key]: null }); refreshMeAvatar(); return; }
    const v = Number(raw.replace(',', '.'));
    if (!(v >= lo && v <= hi)) { toast(`${label} doit être entre ${lo} et ${hi}.`, { type: 'error' }); t.value = meVal()[key] ?? ''; return; }
    await saveMe({ [key]: Math.round(v * 10) / 10 }); refreshMeAvatar(); toast('Profil enregistré', { timeout: 1200 });
  }
  if (t.id === 'me-note') { await saveMe({ styleNote: t.value.trim().slice(0, 120) }); toast('Profil enregistré', { timeout: 1200 }); }
  if (t.id === 'me-share') { await saveMe({ share: t.checked }); }
  if (t.id === 'me-faceai') { await saveMe({ faceToAI: t.checked }); }
  if (t.matches?.('[data-me-face]') && t.files?.[0]) {
    const file = t.files[0]; t.value = '';
    try {
      const img = await loadImage(file);
      // recadrage portrait 3:4 au centre, 600×800
      const c = document.createElement('canvas'); c.width = 600; c.height = 800;
      const g = c.getContext('2d');
      const ar = 3 / 4; let sw = img.width, sh = img.width / ar;
      if (sh > img.height) { sh = img.height; sw = sh * ar; }
      const fromCam = t.dataset.meFace === 'cam';
      if (fromCam && meVal().flipCamera) { g.translate(600, 0); g.scale(-1, 1); }
      g.drawImage(img, (img.width - sw) / 2, Math.max(0, (img.height - sh) / 2 - img.height * 0.04), sw, sh, 0, 0, 600, 800);
      const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Photo illisible.'))), 'image/jpeg', 0.85));
      const pid = await savePhoto(blob);
      const old = meVal().face; await saveMe({ face: pid, faceSource: fromCam ? 'cam' : 'gallery' });
      if (old) await deletePhotos([old]);
      rerender(); toast('Photo enregistrée sur ton téléphone');
    } catch (err) { toast(err.message || 'Photo illisible.', { type: 'error' }); }
  }
  if (t.dataset?.stRange === 'formality') rerender();
  if (e.target.id === 'import-file') { doImport(e.target.files[0]); e.target.value = ''; }
});

window.addEventListener('hashchange', async () => {
  while (sheets.length) await sheets[sheets.length - 1].close('force');
  if (route() === 'reglages') { storageCache = await storageInfo(); refreshHealth().then(() => route() === 'reglages' && rerender()); }
  render(true); window.scrollTo(0, 0);
});
window.addEventListener('online', () => refreshHealth().then(rerender));

// ================= Démarrage =================
async function start() {
  try { await loadData(); }
  catch (e) {
    $('#view').innerHTML = `<div class="empty" style="margin-top:40px"><div class="big">${icon('alert')}</div><h3>Stockage inaccessible</h3><p>${esc(e.message)} En navigation privée, Safari bloque le stockage : ouvre l\'app dans un onglet normal.</p></div>`;
    return;
  }
  if (route() === 'reglages') storageCache = await storageInfo();
  render();
  refreshHealth().then(() => { if (route() === 'styliste' || route() === 'reglages') rerender(); });
  if (state.items.length) requestPersist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non disponible */ });
  }
}
start();

// Exposé pour les tests automatisés
window.__drip = { state, generateOutfits };
