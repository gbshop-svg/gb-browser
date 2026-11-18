/* GB Browser — interface du gestionnaire de profils */
'use strict';

// `gb` est fourni par preload.js (contextBridge)
const S = {
  data: null,
  page: 'profiles',
  filter: 'all',
  search: '',
  proxyFilter: 'all',
  proxySearch: '',
  logFilter: 'all',
  logSearch: '',
  dotbTab: 'activity',
  importTab: 'brave',
  ram: null,
  healthTab: 'score',
  healthFilter: 'all',
  healthSearch: '',
  dotbProgress: {},
  selected: new Set(),
  dotb: {},          // cache par endpoint : { loading, rows, error, at }
  drafts: {},        // saisies en cours (survivent aux rafraîchissements)
};

// ── Icônes ───────────────────────────────────────────
const P = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  puzzle: '<path d="M19.4 14.6a2 2 0 1 0 0-3.2V7a1 1 0 0 0-1-1h-4.4a2 2 0 1 0-3.2 0H6.4a1 1 0 0 0-1 1v4.4a2 2 0 1 1 0 3.2V19a1 1 0 0 0 1 1h4.4a2 2 0 1 1 3.2 0h4.4a1 1 0 0 0 1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  play: '<path d="m6 3 14 9-14 9V3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  xcircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  tag: '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.6-8.6a1 1 0 0 0 0-1.41z"/><path d="M7 7h.01"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
};
const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;

const STATUSES = [
  { k: 'ready', label: 'Ready', color: '#22c55e' },
  { k: 'warmed', label: 'Warmed', color: '#06b6d4' },
  { k: 'wallet', label: 'WALLET ON', color: '#a855f7' },
  { k: 'issue', label: 'Issue', color: '#f59e0b' },
  { k: 'ban', label: 'Ban', color: '#ef4444' },
  { k: 'dead', label: 'DEAD', color: '#9ca3af' },
];
const statusOf = (k) => STATUSES.find((s) => s.k === k);
const AV_COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#ef4444', '#14b8a6', '#f97316', '#84cc16', '#a855f7'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pcode = (n) => 'P' + String(n).padStart(3, '0');
const timeFr = (iso) => new Date(iso).toLocaleTimeString('fr-FR');

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 7000 : 3500);
}

// ── Données ──────────────────────────────────────────
async function refresh() {
  S.data = await gb.invoke('gb:state');
  render();
}

gb.on('gb:state', (d) => {
  S.data = d;
  const ids = new Set(d.profiles.map((p) => p.id));
  for (const id of [...S.selected]) if (!ids.has(id)) S.selected.delete(id);
  render();
});
gb.on('gb:dotb-progress', (d) => {
  if (d.text) S.dotbProgress[d.accountId] = d.text; else delete S.dotbProgress[d.accountId];
  if (S.page === 'dotb') render();
});
gb.on('gb:morning', (m) => { S.morning = m; if (S.page === 'health') render(); });
let logTimer = null;
gb.on('gb:log', (e) => {
  if (!S.data) return;
  S.data.logs.push(e);
  if (S.data.logs.length > 1000) S.data.logs.shift();
  if (S.page === 'journal' && !logTimer) logTimer = setTimeout(() => { logTimer = null; render(); }, 150);
});

// ── DotB ─────────────────────────────────────────────
const DOTB_TABS = [
  { k: 'activity', label: 'Activité', ep: '/accounts' },
  { k: 'accounts', label: 'Comptes Vinted', ep: '/accounts' },
];

function arrayFrom(d) {
  if (Array.isArray(d)) return d;
  if (!d || typeof d !== 'object') return [];
  for (const k of ['data', 'accounts', 'items', 'orders', 'customers', 'notifications', 'events', 'results']) {
    if (Array.isArray(d[k])) return d[k];
    if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) { const inner = arrayFrom(d[k]); if (inner.length) return inner; }
  }
  return [];
}

async function loadDotb(ep, force = false) {
  if (!S.data || !S.data.settings.hasDotbToken) return;
  const cur = S.dotb[ep];
  if (cur && (cur.loading || (!force && cur.rows))) return;
  S.dotb[ep] = { ...(cur || {}), loading: true };
  render();
  const r = await gb.invoke('dotb:get', ep);
  if (r && !r.error) S.dotb[ep] = { rows: arrayFrom(r.data), error: '', at: new Date().toISOString() };
  else {
    const msg = r && r.status === 401 ? 'Token DotB refusé (401)'
      : r && r.status === 403 ? 'Accès refusé (403) — l’API nécessite l’offre Boutique AI'
      : r && r.status === 429 ? 'Trop de requêtes (limite 60/min) — réessaie dans une minute'
      : (r && (r.message || (r.data && r.data.error && (r.data.error.message || r.data.error)) || `Erreur ${r.status}`)) || 'Erreur';
    S.dotb[ep] = { rows: [], error: String(msg) };
  }
  render();
}
const dotbAccounts = () => (S.dotb['/accounts'] && S.dotb['/accounts'].rows) || null;
const dotbError = () => (S.dotb['/accounts'] && S.dotb['/accounts'].error) || '';
const accLabel = (a) => a.username || a.login || a.vinted_username || a.vinted_login || a.name || a.email || a.id;
function accOnline(a) {
  const b = a.bridge_status ?? a.bridgeStatus ?? (a.bridge && (a.bridge.status ?? a.bridge.online ?? a.bridge.connected)) ?? a.bridge_online ?? a.bridge_connected ?? a.online ?? a.connected;
  if (b === true) return true;
  if (b === false || b == null) return false;
  return /online|connected|active|^ok$|true|en ligne/i.test(String(b));
}
function dotbStateOf(p) {
  if (!p.dotbAccountId) return { cls: 'grey', label: 'Non lié' };
  const accs = dotbAccounts();
  if (!accs) return { cls: 'grey', label: p.dotbAccountLabel || 'Lié' };
  const a = accs.find((x) => String(x.id) === String(p.dotbAccountId));
  if (!a) return { cls: 'orange', label: 'Compte introuvable' };
  return accOnline(a) ? { cls: 'green', label: 'En ligne' } : { cls: 'grey', label: 'Hors ligne' };
}

// ── Rendu général ────────────────────────────────────
function isLight(d) {
  const t = d.settings.theme;
  return t === 'light' || (t === 'system' && !d.settings.systemDark);
}

function render() {
  if (!S.data) return;
  const d = S.data;
  document.body.classList.toggle('light', isLight(d));
  $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.page === S.page));
  $('#nc-profiles').textContent = d.profiles.length;
  $('#nc-proxies').textContent = d.profiles.filter((p) => p.px).length;
  $('#nc-ext').textContent = d.extensions.filter((e) => e.enabled).length;
  $('#nc-acc').textContent = (d.accounts || []).filter((a) => !a.addedProfileId).length;
  $('#nc-health').textContent = d.profiles.filter((p) => p.health && (p.health.level === 'fragile' || p.health.level === 'critique' || p.health.prudenceAdvised)).length;

  const accs = dotbAccounts();
  const online = accs ? accs.filter(accOnline).length : 0;
  $('#nc-dotb').className = 'dot ' + (d.settings.hasDotbToken && accs && !dotbError() ? 'ok' : '');
  $('#nc-dotb-sub').textContent = !d.settings.hasDotbToken ? 'non configuré' : dotbError() ? 'erreur API' : accs ? `${online} compte(s) en ligne` : 'connexion…';
  $('#st-relay').textContent = d.relays ? `${d.relays} actif(s)` : 'en veille';
  $('#sd-relay').className = 'sdot ' + (d.relays ? 'ok' : '');
  $('#st-browser').textContent = d.browser ? `${d.browser.name} trouvé` : 'Brave introuvable';
  $('#st-browser').title = d.browser ? d.browser.path : '';
  $('#sd-browser').className = 'sdot ' + (d.browser ? (d.browser.name === 'Brave' ? 'ok' : 'warn') : 'err');
  $('#version').textContent = `v${d.version} · GB Browser`;
  const u = d.update || {};
  $('#update-box').innerHTML = u.status === 'ready'
    ? `<button class="btn sm primary" style="width:100%" data-act="update-install">${ic('download')}Installer la v${esc(u.version)}</button>`
    : u.status === 'downloading' ? `<div class="st-sub">Téléchargement v${esc(u.version)} · ${u.percent || 0} %</div>` : '';

  const main = $('#main');
  const active = document.activeElement;
  const focusId = active && main.contains(active) && active.id ? active.id : null;
  const caret = focusId && 'selectionStart' in active ? active.selectionStart : null;
  const scrollers = $$('.table-scroll, .page-body', main).map((el) => el.scrollTop);

  main.innerHTML = ({
    profiles: pageProfiles, proxies: pageProxies, dotb: pageDotb,
    extensions: pageExtensions, journal: pageJournal, settings: pageSettings,
    health: pageHealth, accounts: pageAccounts,
  }[S.page] || pageProfiles)();

  $$('.table-scroll, .page-body', main).forEach((el, i) => { if (scrollers[i]) el.scrollTop = scrollers[i]; });
  for (const [id, v] of Object.entries(S.drafts)) {
    const el = document.getElementById(id);
    if (el && main.contains(el) && el.type !== 'checkbox') el.value = v;
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch {} }
  }
}

function head(title, sub, actions = '') {
  return `<div class="page-head">
    <div><h1>${title}</h1><div class="sub">${sub}</div></div>
    <div class="actions">${actions}${actions ? '<span class="vsep"></span>' : ''}
      <button class="btn icon ghost" data-act="refresh" title="Rafraîchir">${ic('refresh')}</button>
      <button class="btn icon ghost" data-act="theme" title="Thème clair / sombre">${ic('sun')}</button>
    </div></div>`;
}

function avatar(p) {
  return `<div class="avatar" style="background:${AV_COLORS[(p.num - 1) % AV_COLORS.length]}">${p.num}${p.open ? '<span class="on"></span>' : ''}</div>`;
}
const VINTED_ICON = 'https://www.vinted.fr/favicon.ico';
let vintedIconOk = true;
// Icône Vinted indisponible (hors ligne…) : on la masque partout
document.addEventListener('error', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('vimg')) { e.target.style.display = 'none'; vintedIconOk = false; }
}, true);
function vintedChip(p) {
  const v = p.vinted;
  const img = vintedIconOk ? `<img class="vimg" src="${VINTED_ICON}" alt="">` : '';
  if (!v) return `<span class="vchip" title="Pas encore vérifié — ouvre le profil ou ⋯ › Vérifier la connexion Vinted">${img}?</span>`;
  if (v.logged === true) return `<span class="vchip on" title="Connecté à Vinted (vérifié auprès de Vinted à ${timeFr(v.at)})">${img}${esc(v.login || 'Connecté')}</span>`;
  if (v.logged === false) return `<span class="vchip off" title="Vinted dit : non connecté (vérifié à ${timeFr(v.at)})">${img}Déconnecté</span>`;
  return `<span class="vchip" style="color:#fbbf24;border-color:rgba(245,158,11,.35)" title="Un cookie de session existe, mais Vinted ne l’a pas encore confirmé : ouvre le profil">${img}À confirmer</span>`;
}
function planDay(p) { return p.warmPlan ? Math.floor((Date.now() - Date.parse(p.warmPlan.start)) / 864e5) + 1 : null; }
function minis(p) {
  const out = [];
  if (p.keepAlive) out.push('<span class="mini b" title="Relancé automatiquement s’il plante">RELANCE</span>');
  if (p.dotbAuto) out.push('<span class="mini g" title="Automatisations DotB démarrées à chaque ouverture">DOTB AUTO</span>');
  const d = planDay(p);
  if (d && d <= 7) out.push(`<span class="mini o" title="Plan de chauffe 7 jours">CHAUFFE J${d}/7</span>`);
  else if (p.autoWarm) out.push('<span class="mini o" title="Warm automatique chaque jour">WARM AUTO</span>');
  return out.length ? `<span class="minis">${out.join('')}</span>` : '';
}
function profileCell(p, withVinted = false) {
  return `<div class="pcell">${avatar(p)}<div><div class="pname">${esc(p.name)}${withVinted ? vintedChip(p) : ''}</div><div class="pmeta">${pcode(p.num)} · :${p.port}${withVinted ? minis(p) : ''}</div></div></div>`;
}

// ── Page Profils ─────────────────────────────────────
function filteredProfiles() {
  const q = S.search.trim().toLowerCase();
  return S.data.profiles
    .filter((p) => (S.filter === 'all' ? true : S.filter === 'open' ? p.open : p.status === S.filter))
    .filter((p) => !q || [p.name, p.notes, p.px && p.px.label, p.proxyTest && p.proxyTest.ip, pcode(p.num), p.dotbAccountLabel, ...(p.tags || [])].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.num - b.num);
}

function pageProfiles() {
  const d = S.data;
  const ps = d.profiles;
  const openN = ps.filter((p) => p.open).length;
  const list = filteredProfiles();
  const allSel = list.length > 0 && list.every((p) => S.selected.has(p.id));
  const linked = ps.filter((p) => p.dotbAccountId).length;
  const accs = dotbAccounts();
  const onlineLinked = accs ? ps.filter((p) => p.dotbAccountId && dotbStateOf(p).cls === 'green').length : 0;
  const lastAt = S.dotb['/accounts'] && S.dotb['/accounts'].at;

  const chips = [{ k: 'all', label: 'Tous', n: ps.length }, { k: 'open', label: 'Ouverts', n: openN, color: '#3b82f6' }]
    .concat(STATUSES.map((s) => ({ k: s.k, label: s.label, color: s.color, n: ps.filter((p) => p.status === s.k).length })));

  const strip = d.settings.hasDotbToken
    ? `<span class="live ${dotbError() ? '' : 'ok'}"></span><b>DotB</b><b>${onlineLinked} profil(s) en ligne</b>
       <span class="muted">·</span><span class="muted">${linked} lié(s) sur ${ps.length}</span>
       <span class="muted">·</span><span class="muted">${dotbError() ? esc(dotbError()) : lastAt ? `dernière synchro ${timeFr(lastAt)}` : 'connexion…'}</span>`
    : `<span class="live"></span><b>DotB</b><span class="muted">non configuré — ajoute ton token API pour voir l’état de tes comptes</span>`;

  return `${head('Profils', `${ps.length} profils · ${openN} ouvert(s)`, `
      <button class="btn" data-act="brave-import">${ic('download')}Importer Brave / Scalency</button>
      <button class="btn" data-act="cookie-import">${ic('upload')}Importer des connexions</button>
      <button class="btn" data-act="open-ready">${ic('play')}Lancer READY</button>
      <button class="btn primary" data-act="new-profile">${ic('plus')}Nouveau profil</button>`)}
  <div class="page-body">
    <div class="card strip">${strip}<span class="right" data-go="dotb">Réglages ›</span></div>
    <div class="card stats">
      ${stat('users', '#6366f1', ps.length, 'Profils au total')}
      ${stat('monitor', '#06b6d4', openN, 'Ouverts maintenant')}
      ${stat('check', '#22c55e', ps.filter((p) => p.status === 'ready').length, 'Prêts (Ready)')}
      ${stat('globe', '#a855f7', ps.filter((p) => p.px).length, 'Proxies configurés', `<small> · ${ps.filter((p) => p.proxyTest && p.proxyTest.ok).length} OK</small>`)}
      ${stat('bolt', '#f59e0b', `${linked}/${ps.length}`, 'Liés à DotB')}
    </div>
    <div class="card table-card" style="flex:1;min-height:300px">
      <div class="toolbar">
        ${chips.map((c) => `<span class="chip ${S.filter === c.k ? 'active' : ''}" data-filter="${c.k}">${c.color ? `<span class="cd" style="background:${c.color}"></span>` : ''}${c.label} <span class="n">${c.n}</span></span>`).join('')}
        <div class="search">${ic('search')}<input id="search" placeholder="Rechercher nom, note, IP…" value="${esc(S.search)}"><span class="kbd">Ctrl F</span></div>
      </div>
      ${S.selected.size ? `<div class="bulk">
        <span class="n">${S.selected.size} sélectionné(s)</span>
        <button class="btn sm" data-act="bulk-open">${ic('play')}Ouvrir</button>
        <button class="btn sm" data-act="bulk-close">${ic('square')}Fermer</button>
        <button class="btn sm" data-act="bulk-status">${ic('tag')}Statut</button>
        <button class="btn sm" data-act="bulk-warm">${ic('flame')}Warm</button>
        <button class="btn sm" data-act="bulk-auto">${ic('bolt')}Options auto</button>
        <button class="btn sm danger" data-act="bulk-delete">${ic('trash')}Supprimer</button>
        <button class="btn sm ghost" data-act="bulk-clear" style="margin-left:auto">Désélectionner</button></div>` : ''}
      <div class="table-scroll">
        ${ps.length === 0 ? `<div class="empty"><div class="empty-ico">${ic('users')}</div><h3>Aucun profil</h3>
          <div>Un profil = un compte Vinted, avec son propre Brave, ses cookies et son proxy.</div>
          <div class="inline" style="justify-content:center"><button class="btn" data-act="brave-import">${ic('download')}Importer depuis Brave</button><button class="btn primary" data-act="new-profile">${ic('plus')}Nouveau profil</button></div></div>` : `
        <table><thead><tr>
          <th style="width:36px"><input type="checkbox" id="sel-all" ${allSel ? 'checked' : ''}></th>
          <th>Profil ▲</th><th>Tags</th><th>Proxy</th><th>DotB</th><th>Statut</th><th style="text-align:right">Actions</th>
        </tr></thead><tbody>${list.map(rowProfile).join('')}</tbody></table>
        ${list.length === 0 ? '<div class="empty">Aucun profil ne correspond.</div>' : ''}`}
      </div>
      ${ps.length ? `<div class="table-foot">${list.length} profil(s) affiché(s) sur ${ps.length}</div>` : ''}
    </div>
  </div>`;
}

function stat(icon, color, v, l, extra = '') {
  return `<div class="stat"><div class="si" style="background:${color}22;color:${color}">${ic(icon)}</div><div><div class="v">${v}${extra}</div><div class="l">${l}</div></div></div>`;
}

function proxyCell(p) {
  if (!p.px) return `<div class="pxy-none">Sans proxy</div><div class="pxy-sub">IP réelle du PC</div>`;
  const t = p.proxyTest;
  const sub = t ? (t.ok ? `${esc(t.ip)} · ${esc(t.countryCode || '')}` : '<span style="color:#f87171">hors ligne</span>') : 'non testé';
  return `<div class="pxy">${esc(p.px.label)}</div><div class="pxy-sub">${sub}</div>`;
}

function rowProfile(p) {
  const st = statusOf(p.status);
  const ds = dotbStateOf(p);
  const dotbCell = `<span class="badge ${ds.cls}" title="${esc(p.dotbAccountLabel || '')}"><span class="bd" style="background:${ds.cls === 'green' ? '#22c55e' : ds.cls === 'orange' ? '#f59e0b' : 'var(--text-3)'}"></span>${esc(ds.label)}</span>`;
  const busy = p.busy ? `<span class="busy-label" title="${esc(p.busy)}"><span class="spin"></span>${esc(p.busy.length > 28 ? p.busy.slice(0, 27) + '…' : p.busy)}</span>${p.busy.startsWith('Warm') ? `<button class="btn sm" data-act="warm-stop" data-id="${p.id}">Arrêter</button>` : ''}` : '';
  const action = p.launching && !p.open
    ? `<button class="btn wait-btn" disabled><span class="spin"></span>Lancement…</button>`
    : p.open
      ? `<button class="btn close-btn" data-act="close" data-id="${p.id}">${ic('square')}Fermer</button>`
      : `<button class="btn open-btn" data-act="open" data-id="${p.id}">${ic('play')}Ouvrir</button>`;
  return `<tr class="${S.selected.has(p.id) ? 'sel' : ''}" data-row="${p.id}">
    <td><input type="checkbox" data-sel="${p.id}" ${S.selected.has(p.id) ? 'checked' : ''}></td>
    <td>${profileCell(p, true)}</td>
    <td><div class="tags">${(p.tags || []).map((t, i) => `<span class="tag" title="Clic pour retirer" data-act="rm-tag" data-id="${p.id}" data-i="${i}">${esc(t)}</span>`).join('')}<span class="addtag" data-act="add-tag" data-id="${p.id}">+ Tag</span></div></td>
    <td>${proxyCell(p)}</td>
    <td>${dotbCell}</td>
    <td><span class="badge grey status-click" data-act="row-status" data-id="${p.id}">${st ? `<span class="bd" style="background:${st.color}"></span>${st.label}` : '—'}</span></td>
    <td><div class="row-actions">${busy}${action}<span class="more" data-act="row-menu" data-id="${p.id}">${ic('dots')}</span></div></td>
  </tr>`;
}

// ── Page Santé ───────────────────────────────────────
function healthIssues(p) {
  const out = [];
  if (p.vinted && p.vinted.logged === false) out.push('Vinted déconnecté');
  if (p.px && p.proxyTest && !p.proxyTest.ok) out.push('Proxy hors ligne');
  const accs = dotbAccounts();
  if (p.dotbAccountId && accs) {
    const a = accs.find((x) => String(x.id) === String(p.dotbAccountId));
    if (a && !accOnline(a) && p.open) out.push('DotB hors ligne');
  }
  return out;
}
const fmtGo = (b) => (b / 1073741824).toFixed(1).replace('.', ',') + ' Go';
const fmtMo = (b) => Math.round(b / 1048576) + ' Mo';
function ago(iso) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
}
let ramTimer = null;
async function loadRam() {
  S.ram = await gb.invoke('sys:ram');
  if (S.page === 'health') render();
}

const LEVELS = {
  critique: { label: 'Critique', color: '#ef4444', cls: 'red' },
  fragile: { label: 'Fragile', color: '#f97316', cls: 'orange' },
  surveiller: { label: 'À surveiller', color: '#f59e0b', cls: 'orange' },
  solide: { label: 'Solide', color: '#22c55e', cls: 'green' },
  ferme: { label: 'Fermé par Vinted', color: '#9ca3af', cls: '' },
};
const ORIGINS = { moi: 'Créé par moi', achete: 'Acheté', perso: 'Ancien compte perso', autre: 'Autre' };
function ageOf(p) {
  const c = p.sheet && p.sheet.createdOn;
  if (!c) return '—';
  const d = Math.floor((Date.now() - Date.parse(c)) / 864e5);
  return d < 30 ? `${d} j` : d < 365 ? `${Math.floor(d / 30)} mois` : `${(d / 365).toFixed(1).replace('.', ',')} an(s)`;
}
function restrSummary(p) {
  const rs = (p.restrictions || []).filter((r) => Date.now() - Date.parse(r.at) < 30 * 864e5);
  if (!rs.length) return '<span class="muted">aucune</span>';
  const by = {};
  rs.forEach((r) => { by[r.motif] = (by[r.motif] || 0) + 1; });
  const last = rs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const lbl = { automatisation: 'automatisation', non_lu: 'motif non lu', autre: 'autre' };
  return `${Object.entries(by).map(([k, v]) => `<span class="pill ${k === 'automatisation' ? 'red' : 'orange'}">${lbl[k] || k} × ${v}</span>`).join(' ')}<div class="pmeta">dernière le ${new Date(last.at).toLocaleDateString('fr-FR')}${last.liftedAt ? ' · levée' : ''}</div>`;
}
function prudenceCell(p) {
  if (p.prudenceOn) return `<span class="pill orange">En prudence</span><div class="pmeta">jusqu’à ${new Date(p.prudence.until).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div>`;
  if (p.health && p.health.prudenceAdvised) return '<span class="pill red">Conseillée</span>';
  return '<span class="dash">—</span>';
}

function morningCard() {
  const d = S.data;
  const r = (d.reports || [])[d.reports.length - 1];
  const running = (S.morning && S.morning.running) || d.morningRunning;
  const mc = d.settings.morningCheck || {};
  return `<div class="card"><div class="card-head ${r && r.issues.length ? '' : 'nob'}">
    <div class="hi" style="color:#60a5fa;background:rgba(59,130,246,.12)">${ic('clock')}</div>
    <div style="flex:1"><h3>Contrôle du matin ${r ? (r.issues.length ? `<span class="pill orange">${r.issues.length} point(s) à voir</span>` : '<span class="pill green">rien à signaler</span>') : ''}</h3>
      <div class="hs">${running ? `<span class="inline"><span class="spin"></span>Contrôle en cours${S.morning && S.morning.current ? ' · ' + esc(S.morning.current) : ''}…</span>`
        : r ? `Dernier contrôle ${new Date(r.at).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} : ${r.ok} compte(s) OK sur ${r.total}` : 'Pas encore de contrôle'} · ${mc.enabled !== false ? `chaque jour à ${mc.hour ?? 8} h` : 'automatique désactivé'}</div></div>
    <div class="ha"><button class="btn sm" data-act="morning-run" ${running ? 'disabled' : ''}>${ic('refresh')}Lancer maintenant</button></div></div>
    ${r && r.issues.length ? `<div class="card-body" style="gap:6px">${r.issues.map((i) => `<div class="inline" style="font-size:12.5px"><span class="li" style="color:#fbbf24;width:14px">${ic('alert')}</span>${esc(i)}</div>`).join('')}</div>` : ''}
  </div>`;
}

function pageHealthScore() {
  const d = S.data;
  const ps = [...d.profiles];
  const H = (p) => p.health || { score: 0, level: 'critique' };
  const cnt = (f) => ps.filter(f).length;
  const counts = {
    all: ps.length,
    critique: cnt((p) => H(p).level === 'critique'), fragile: cnt((p) => H(p).level === 'fragile'),
    surveiller: cnt((p) => H(p).level === 'surveiller'), solide: cnt((p) => H(p).level === 'solide'),
    advised: cnt((p) => H(p).prudenceAdvised), prudence: cnt((p) => p.prudenceOn), ferme: cnt((p) => H(p).level === 'ferme'),
  };
  const todo = ps.filter((p) => H(p).level !== 'solide' && H(p).level !== 'ferme').sort((a, b) => H(a).score - H(b).score).slice(0, 5);
  const q = S.healthSearch.trim().toLowerCase();
  const list = ps.filter((p) => {
    const h = H(p);
    if (S.healthFilter === 'advised') return h.prudenceAdvised;
    if (S.healthFilter === 'prudence') return p.prudenceOn;
    if (S.healthFilter !== 'all') return h.level === S.healthFilter;
    return true;
  }).filter((p) => !q || [p.name, pcode(p.num), p.vinted && p.vinted.login].join(' ').toLowerCase().includes(q)).sort((a, b) => H(a).score - H(b).score);
  const tile = (k, label, n, sub, color) => `<div class="stat status-click" data-hfilter="${k}" style="flex-direction:column;align-items:flex-start;gap:2px;${S.healthFilter === k ? 'background:var(--hover)' : ''}"><div class="l">${label}</div><div class="v" style="color:${color}">${n}</div><div class="l">${sub}</div></div>`;
  const chips = [['all', 'Tous'], ['critique', 'Critiques'], ['fragile', 'Fragiles'], ['surveiller', 'À surveiller'], ['solide', 'Solides'], ['advised', 'Prudence conseillée'], ['prudence', 'En prudence'], ['ferme', 'Fermés']];
  return `
    <div class="card" style="display:grid;grid-template-columns:repeat(7,1fr)">
      ${tile('solide', 'Solides', counts.solide, 'score 75 et plus', '#22c55e')}
      ${tile('surveiller', 'À surveiller', counts.surveiller, '55 à 74', '#f59e0b')}
      ${tile('fragile', 'Fragiles', counts.fragile, '35 à 54', '#f97316')}
      ${tile('critique', 'Critiques', counts.critique, 'moins de 35', '#ef4444')}
      ${tile('advised', 'Prudence conseillée', counts.advised, 'pas encore posée', '#ef4444')}
      ${tile('prudence', 'Prudence en cours', counts.prudence, 'DotB en pause', '#f59e0b')}
      ${tile('ferme', 'Fermés par Vinted', counts.ferme, 'comptes en fin de vie', '#9ca3af')}
    </div>
    <div class="card"><div class="setrow" style="border-top:none">
      <div class="st"><b>Prudence automatique de 48 h après une restriction</b><span>Dès qu’une restriction est repérée (bandeau Vinted, message de l’équipe Vinted via DotB, ou signalée par toi), GB arrête les automatisations DotB du compte et ne les relance qu’à la fin des 48 h. Les ventes et messages déjà reçus ne sont pas touchés.</span></div>
      <div class="toggle ${d.settings.autoPrudence !== false ? 'on' : ''}" data-act="tg-setting" data-k="autoPrudence"></div></div></div>
    ${morningCard()}
    ${todo.length ? `<div class="card"><div class="card-head"><div><h3>Comptes à traiter</h3><div class="hs">les plus fragiles d’abord</div></div></div>
      ${todo.map((p) => { const h = H(p); const L = LEVELS[h.level]; return `<div class="setrow"><div style="width:34px">${avatar(p)}</div><div class="st"><b>${esc(p.name)} <span class="pill ${L.cls}">${L.label} · ${h.score}</span></b><span>${esc(h.advice)}</span></div>
        <div class="inline">${h.prudenceAdvised ? `<button class="btn sm" data-act="h-prudence" data-id="${p.id}" data-h="48">Mettre en prudence</button>` : ''}<button class="btn sm" data-act="h-sheet" data-id="${p.id}">Fiche</button></div></div>`; }).join('')}</div>` : ''}
    <div class="card table-card" style="flex:1;min-height:300px">
      <div class="toolbar">
        ${chips.map(([k, l]) => `<span class="chip ${S.healthFilter === k ? 'active' : ''}" data-hfilter="${k}">${l} <span class="n">${counts[k]}</span></span>`).join('')}
        <div class="search">${ic('search')}<input id="health-search" placeholder="Chercher un compte" value="${esc(S.healthSearch)}"></div>
      </div>
      <div class="table-scroll">
      <table><thead><tr><th>Compte</th><th>Score</th><th>Niveau</th><th>Facteur principal</th><th>Ancienneté</th><th>Origine</th><th>Restrictions (30 j)</th><th>Vues</th><th>Publiés auj.</th><th>Cookies</th><th>Prudence</th><th></th></tr></thead>
      <tbody>${list.map((p) => { const h = H(p); const L = LEVELS[h.level]; return `<tr>
        <td>${profileCell(p, true)}</td>
        <td><b style="font-size:17px;color:${L.color}">${h.score}</b></td>
        <td><span class="pill ${L.cls}"><span class="pd"></span>${L.label}</span></td>
        <td style="max-width:220px">${esc(h.main)}</td>
        <td>${ageOf(p)}</td>
        <td>${esc(ORIGINS[(p.sheet || {}).origin] || 'Inconnue')}</td>
        <td>${restrSummary(p)}</td>
        <td>${p.vstats ? `${p.vstats.views} <span class="muted">sur ${p.vstats.items} annonce(s)</span>` : '<span class="muted">à l’ouverture</span>'}</td>
        <td>${p.pubToday == null ? '<span class="dash">—</span>' : p.pubToday}</td>
        <td>${p.cookies ? `${p.cookies.total} <span class="muted">· ${p.cookies.sites} sites</span>` : '<span class="muted">après un warm</span>'}</td>
        <td>${prudenceCell(p)}</td>
        <td><button class="btn sm" data-act="h-sheet" data-id="${p.id}">Fiche</button></td>
      </tr>`; }).join('')}</tbody></table>
      ${list.length ? '' : '<div class="empty">Aucun compte dans ce filtre.</div>'}
      </div>
    </div>`;
}

function pageHealth() {
  const tabs = `<div class="seg" style="align-self:flex-start"><span class="${S.healthTab === 'score' ? 'active' : ''}" data-htab="score">Score des comptes</span><span class="${S.healthTab === 'tech' ? 'active' : ''}" data-htab="tech">Technique (proxy, DotB, RAM)</span></div>`;
  if (S.healthTab === 'score') {
    return `${head('Santé des comptes', 'Score sur 100, restrictions Vinted, prudence et conseils', '')}<div class="page-body">${tabs}${pageHealthScore()}</div>`;
  }
  return pageHealthTech(tabs);
}

function pageHealthTech(tabs) {
  const d = S.data;
  const ps = [...d.profiles].sort((a, b) => a.num - b.num);
  const ram = S.ram || { profiles: {}, total: 0, free: 0 };
  const usedByProfiles = Object.values(ram.profiles || {}).reduce((a, b) => a + b, 0);
  const issues = ps.filter((p) => healthIssues(p).length);
  const accs = dotbAccounts() || [];
  return `${head('Santé des comptes', 'Technique : Vinted, DotB, proxy, empreinte, chauffe et RAM', `
      <button class="btn" data-act="ram-purge">${ic('refresh')}Libérer la RAM</button>
      <button class="btn" data-act="ram-refresh">${ic('cpu')}Mesurer la RAM</button>`)}
  <div class="page-body">${tabs}
    <div class="card stats">
      ${stat('monitor', '#06b6d4', ps.filter((p) => p.open).length, 'Profils ouverts')}
      ${stat('check', '#22c55e', ps.filter((p) => p.vinted && p.vinted.logged).length, 'Vinted connectés')}
      ${stat('bolt', '#f59e0b', accs.filter(accOnline).length, 'DotB en ligne')}
      ${stat('alert', '#ef4444', issues.length, 'Profils à problème')}
      ${stat('cpu', '#a855f7', ram.total ? fmtGo(usedByProfiles) : '—', ram.total ? `RAM des profils · ${fmtGo(ram.total - ram.free)} / ${fmtGo(ram.total)} utilisés` : 'RAM des profils')}
    </div>
    <div class="card table-card" style="flex:1;min-height:300px">
      <div class="table-scroll">
      <table><thead><tr><th>Profil</th><th>État</th><th>Proxy · pays</th><th>DotB</th><th>Empreinte</th><th>Chauffe</th><th>Relance</th><th>DotB auto</th></tr></thead>
      <tbody>${ps.map((p) => {
        const iss = healthIssues(p);
        const r = ram.profiles && ram.profiles[p.id];
        const ds = dotbStateOf(p);
        const day = planDay(p);
        const fp = p.fp;
        return `<tr class="hrow">
          <td>${profileCell(p, true)}${iss.length ? `<div style="margin-top:4px">${iss.map((x) => `<span class="pill red">${esc(x)}</span>`).join(' ')}</div>` : ''}</td>
          <td>${p.open ? `<span class="state ok">Ouvert</span>${r ? `<div class="pmeta">${fmtMo(r)}</div><div class="ramb"><i style="width:${Math.min(100, (r / 1073741824) * 100)}%"></i></div>` : ''}` : `<span class="state wait">Fermé</span><div class="pmeta">${ago(p.lastOpened)}</div>`}</td>
          <td>${p.px ? (p.proxyTest ? (p.proxyTest.ok ? `<span class="state ok">${esc(p.proxyTest.countryCode || '')} · ${p.proxyTest.ms} ms</span><div class="pmeta">${esc(p.proxyTest.timezone || '')}</div>` : '<span class="state off">Hors ligne</span>') : '<span class="state wait">Non testé</span>') : '<span class="state real">IP réelle</span>'}</td>
          <td><span class="badge ${ds.cls}">${esc(ds.label)}</span>${p.dotbStartedAt ? `<div class="pmeta">lancé ${ago(p.dotbStartedAt)}</div>` : ''}</td>
          <td>${fp ? `<div class="pmeta" style="font-family:inherit">${fp.screen.width}×${fp.screen.height} · ${fp.cores} cœurs · ${fp.memory} Go</div><div class="pmeta" title="${esc(fp.gpu.renderer)}">${esc((fp.gpu.renderer.split(', ')[1] || '').replace(/ \(0x[0-9A-F]+\).*/, ''))}</div>` : '<span class="muted">à la 1re ouverture</span>'}</td>
          <td>${day && day <= 7 ? `<span class="pill orange">Jour ${day}/7</span>` : p.warmPlan && p.warmPlan.done ? '<span class="pill green">Chauffé</span>' : ''}<div class="pmeta">${p.lastWarm ? 'warm ' + ago(p.lastWarm) : 'jamais warmé'}${p.warmCount ? ` · ${p.warmCount}×` : ''}</div></td>
          <td><div class="toggle ${p.keepAlive ? 'on' : ''}" data-act="tg-keep" data-id="${p.id}"></div></td>
          <td><div class="toggle ${p.dotbAuto ? 'on' : ''}" data-act="tg-dotbauto" data-id="${p.id}"></div></td>
        </tr>`;
      }).join('')}</tbody></table>
      ${ps.length ? '' : '<div class="empty">Aucun profil</div>'}
      </div>
    </div>
  </div>`;
}

// ── Page Comptes à créer ─────────────────────────────
function pageAccounts() {
  const accs = [...(S.data.accounts || [])].sort((a, b) => (a.addedProfileId ? 1 : 0) - (b.addedProfileId ? 1 : 0) || Date.parse(b.at) - Date.parse(a.at));
  const edit = S.editAcc ? accs.find((a) => a.id === S.editAcc) : null;
  const v = edit || {};
  const status = (a) => {
    if (a.addedProfileId) { const p = prof(a.addedProfileId); return `<span class="pill blue">Dans le navigateur${p ? ' · ' + pcode(p.num) : ''}</span>`; }
    if (!a.createdAt) return '<span class="pill">Pas encore créé</span>';
    const left = 24 * 3600e3 - (Date.now() - Date.parse(a.createdAt));
    if (left <= 0) return '<span class="pill green">Prêt à ajouter ✓</span>';
    const h = Math.floor(left / 3600e3), m = Math.floor((left % 3600e3) / 60000);
    return `<span class="pill orange ready-in">Prêt dans ${h} h ${String(m).padStart(2, '0')}</span>`;
  };
  return `${head('Comptes à créer', 'Note tes nouveaux comptes Vinted : GB compte 24 h avant de te dire de les ajouter')}
  <div class="page-body">
    <div class="card">
      <div class="card-head"><div class="hi" style="background:var(--grad);color:#fff">${ic('userplus')}</div>
        <div><h3>${edit ? 'Modifier le compte' : 'Nouveau compte'}</h3><div class="hs">Le mot de passe est chiffré sur ce PC (Windows). Clique « Créé » quand le compte vient d’être créé sur Vinted.</div></div></div>
      <div class="card-body">
        <div class="form-grid">
          <div class="field"><label>Email</label><input class="input" id="ac-email" value="${esc(v.email || '')}" placeholder="exemple@gmail.com"></div>
          <div class="field"><label>Numéro de téléphone</label><input class="input" id="ac-phone" value="${esc(v.phone || '')}" placeholder="06 12 34 56 78"></div>
          <div class="field"><label>Pseudo Vinted</label><input class="input" id="ac-pseudo" value="${esc(v.pseudo || '')}" placeholder="juliette579"></div>
          <div class="field"><label>Mot de passe</label><input class="input" id="ac-pass" type="password" placeholder="${edit && v.hasPassword ? '•••••• enregistré (laisser vide pour garder)' : 'facultatif'}"></div>
          <div class="field"><label>Proxy prévu</label><input class="input mono" id="ac-proxy" value="${esc(v.proxy || '')}" placeholder="ip:port:user:pass (facultatif)"></div>
          <div class="field"><label>Notes</label><input class="input" id="ac-notes" value="${esc(v.notes || '')}" placeholder="facultatif"></div>
        </div>
      </div>
      <div class="card-foot">
        ${edit ? '<button class="btn" data-act="acc-cancel">Annuler</button>' : ''}
        <button class="btn" data-act="acc-save">${ic('check')}Enregistrer</button>
        ${edit && edit.createdAt ? '' : `<button class="btn primary" data-act="acc-save-created">${ic('clock')}Enregistrer et marquer « Créé »</button>`}
      </div>
    </div>
    <div class="card table-card">
      ${accs.length === 0 ? `<div class="empty"><div class="empty-ico">${ic('userplus')}</div><h3>Aucun compte en cours</h3><div>Ajoute un compte au moment où tu le crées sur Vinted.</div></div>` : `
      <table><thead><tr><th>Compte</th><th>Email</th><th>Téléphone</th><th>Mot de passe</th><th>Créé</th><th>État</th><th style="text-align:right">Actions</th></tr></thead><tbody>
      ${accs.map((a) => `<tr>
        <td class="pname">${esc(a.pseudo || '—')}</td>
        <td><span class="copyable" data-act="acc-copy" data-v="${esc(a.email || '')}" title="Copier">${esc(a.email || '—')}</span></td>
        <td><span class="copyable" data-act="acc-copy" data-v="${esc(a.phone || '')}" title="Copier">${esc(a.phone || '—')}</span></td>
        <td>${a.hasPassword ? `<span class="copyable" data-act="acc-copy-pass" data-id="${a.id}" title="Copier le mot de passe">•••••• copier</span>` : '<span class="dash">—</span>'}</td>
        <td class="muted">${a.createdAt ? new Date(a.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
        <td>${status(a)}</td>
        <td><div class="row-actions">
          ${!a.createdAt ? `<button class="btn sm" data-act="acc-created" data-id="${a.id}">${ic('clock')}Créé</button>` : ''}
          ${a.createdAt && !a.addedProfileId ? `<button class="btn sm ${Date.now() - Date.parse(a.createdAt) >= 864e5 ? 'primary' : ''}" data-act="acc-add" data-id="${a.id}">${ic('plus')}Ajouter au navigateur</button>` : ''}
          ${a.addedProfileId ? `<button class="btn sm" data-act="open" data-id="${a.addedProfileId}">${ic('play')}Ouvrir</button>` : ''}
          <span class="more" data-act="acc-menu" data-id="${a.id}">${ic('dots')}</span>
        </div></td></tr>`).join('')}
      </tbody></table>`}
    </div>
  </div>`;
}

// ── Page Proxies ─────────────────────────────────────
function proxyState(p) {
  if (p.busy === 'Test du proxy…') return { k: 'wait', html: '<span class="state wait"><span class="spin"></span>Test…</span>' };
  if (!p.px) return { k: 'none', html: '<span class="state real">IP réelle</span>' };
  if (!p.proxyTest) return { k: 'untested', html: '<span class="state wait">Non testé</span>' };
  if (p.proxyTest.ok) return { k: 'ok', html: `<span class="state ok">En ligne · ${p.proxyTest.ms} ms</span>` };
  return { k: 'off', html: `<span class="state off" title="${esc(p.proxyTest.error)}">Hors ligne</span>` };
}

function pageProxies() {
  const d = S.data;
  const ps = [...d.profiles].sort((a, b) => a.num - b.num);
  const counts = {
    all: ps.length,
    set: ps.filter((p) => p.px).length,
    none: ps.filter((p) => !p.px).length,
    off: ps.filter((p) => p.px && p.proxyTest && !p.proxyTest.ok).length,
  };
  const q = S.proxySearch.trim().toLowerCase();
  const list = ps
    .filter((p) => S.proxyFilter === 'all' || (S.proxyFilter === 'set' ? p.px : S.proxyFilter === 'none' ? !p.px : p.px && p.proxyTest && !p.proxyTest.ok))
    .filter((p) => !q || [p.name, pcode(p.num), p.px && p.px.label, p.px && p.px.user, p.proxyTest && p.proxyTest.ip].join(' ').toLowerCase().includes(q));
  const chips = [['all', 'Tous'], ['set', 'Configurés'], ['none', 'Sans proxy'], ['off', 'Hors ligne']];

  return `${head('Proxies', 'Un proxy dédié par profil, routé localement par GB', `
      <button class="btn" data-act="proxy-test-all">${ic('pulse')}Tester tout</button>
      <button class="btn primary" data-act="proxy-import">${ic('upload')}Importer des proxies</button>`)}
  <div class="page-body">
    <div class="card"><div class="card-head nob">
      <div class="hi">${ic('server')}</div>
      <div><h3>Relais proxy GB <span class="pill ${d.relays ? 'green' : ''}"><span class="pd"></span>${d.relays ? 'Actif' : 'En veille'}</span></h3>
      <div class="hs">${d.relays ? `${d.relays} profil(s) passent par le relais local` : 'Intégré à GB, rien à installer : il démarre tout seul quand un profil utilise un proxy avec identifiant.'}</div></div>
    </div></div>
    <div class="card table-card" style="flex:1;min-height:300px">
      <div class="toolbar">
        ${chips.map(([k, l]) => `<span class="chip ${S.proxyFilter === k ? 'active' : ''}" data-pfilter="${k}">${l} <span class="n">${counts[k]}</span></span>`).join('')}
        <div class="search">${ic('search')}<input id="proxy-search" placeholder="Filtrer…" value="${esc(S.proxySearch)}"></div>
      </div>
      <div class="table-scroll">
      ${ps.length === 0 ? '<div class="empty"><h3>Aucun profil</h3><div>Crée d’abord des profils, ou importe des proxies en cochant « créer un profil par proxy ».</div></div>' : `
      <table><thead><tr><th>Profil</th><th>Type</th><th>Serveur</th><th>Identifiant / tunnel</th><th>État</th><th>IP web · IP WebRTC</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${list.map((p) => {
        const s = proxyState(p);
        const t = p.proxyTest;
        return `<tr>
          <td>${profileCell(p)}</td>
          <td>${p.px ? `<b>${p.px.scheme === 'http' ? 'HTTP' : 'SOCKS5'}</b>` : '<span class="dash">—</span>'}</td>
          <td class="pxy">${p.px ? `${esc(p.px.host)}:${p.px.port}` : '<span class="dash">–</span>'}</td>
          <td class="pxy">${p.px ? (p.px.auth ? `${esc(p.px.user)} <span class="muted">· relais GB</span>` : '<span class="muted">sans identifiant</span>') : '<span class="dash">–</span>'}</td>
          <td>${s.html}</td>
          <td class="pxy" title="${esc((p.ipHistory || []).slice(-8).reverse().map((h) => `${h.ip} (${h.country}) depuis ${new Date(h.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`).join('\n'))}">${t && t.ok ? `${esc(t.ip)} <span class="muted">${esc(t.countryCode || '')}</span> · <span class="muted">WebRTC bloqué</span>` : p.px ? '<span class="muted">WebRTC bloqué</span>' : '<span class="dash">–</span>'}
            ${p.px && p.shared && p.shared.ipWith.length ? `<div><span class="pill red">même IP que ${esc(p.shared.ipWith.join(', '))}</span></div>` : ''}
            ${(p.ipHistory || []).length > 1 ? `<div class="pmeta">${p.ipHistory.length} IP différentes vues</div>` : ''}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-act="proxy-edit" data-id="${p.id}">${ic('edit')}Modifier</button>
            <button class="btn sm" data-act="proxy-test" data-id="${p.id}" ${p.px ? '' : 'disabled'}>${ic('pulse')}Tester</button>
          </div></td></tr>`;
      }).join('')}</tbody></table>
      ${list.length === 0 ? '<div class="empty">Aucun profil dans ce filtre.</div>' : ''}`}
      </div>
    </div>
  </div>`;
}

// ── Page DotB ────────────────────────────────────────
function fmtVal(k, v) {
  if (v == null || v === '') return '<span class="dash">—</span>';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'object') {
    if ('amount' in v) return esc(`${v.amount} ${v.currency_code || v.currency || ''}`.trim());
    if (Array.isArray(v)) return esc(v.length + ' élément(s)');
    const s = v.name || v.title || v.username || v.status || v.id;
    return s != null ? esc(s) : '<span class="dash">…</span>';
  }
  if (/(_at|date|time)$/i.test(k) && typeof v === 'string' && !isNaN(Date.parse(v))) return esc(new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }));
  const s = String(v);
  return esc(s.length > 80 ? s.slice(0, 80) + '…' : s);
}

const PREFERRED_COLS = ['username', 'login', 'title', 'name', 'type', 'status', 'state', 'price', 'total', 'amount', 'brand', 'size', 'buyer', 'customer', 'account', 'account_id', 'message', 'created_at', 'updated_at', 'id'];
function columnsFor(rows) {
  const keys = new Set();
  rows.slice(0, 20).forEach((r) => Object.keys(r || {}).forEach((k) => keys.add(k)));
  const pref = PREFERRED_COLS.filter((k) => keys.has(k));
  const rest = [...keys].filter((k) => !pref.includes(k) && rows.some((r) => r[k] != null && typeof r[k] !== 'object'));
  return [...pref, ...rest].slice(0, 7);
}

const SRC_LABELS = {
  ai_message: 'Réponses IA', manuel: 'Envoyés à la main', offre: 'Offres envoyées',
  favorite_message: 'Messages aux favoris', favourite_message: 'Messages aux favoris', favorites: 'Messages aux favoris',
  auto_message: 'Messages auto', order_confirmation: 'Confirmations de commande', smart_agent: 'Smart agent',
};
const srcLabel = (k) => SRC_LABELS[k] || k.replace(/_/g, ' ');
const sumObj = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
function autoCount(o) { return Object.entries(o || {}).filter(([k]) => k !== 'manuel' && k !== 'offre').reduce((a, [, v]) => a + v, 0); }

function activityBody() {
  const d = S.data;
  const accs = dotbAccounts() || [];
  const act = d.dotbActivity || {};
  const ov = d.dotbOverview;
  const all = (ov && ov.events && ov.events._all) || {};
  const evAll = ov && ov.events ? Object.values(ov.events).filter((x, i, arr) => x !== ov.events._all).reduce((acc, e) => { for (const [k, v] of Object.entries(e)) acc[k] = (acc[k] || 0) + v; return acc; }, {}) : {};
  const byProfile = {};
  d.profiles.forEach((p) => { if (p.dotbAccountId) byProfile[String(p.dotbAccountId)] = p; });
  const totals = Object.values(act).reduce((t, a) => { t.auto += autoCount(a.sent24); t.offers += a.offers24 || 0; t.unread += a.unread || 0; return t; }, { auto: 0, offers: 0, unread: 0 });
  return `
    <div class="overview" style="border-bottom:1px solid var(--border)">
      ${stat('bolt', '#f59e0b', totals.auto, 'Messages auto (24 h)')}
      ${stat('pulse', '#a855f7', totals.offers, 'Offres envoyées (24 h)')}
      ${stat('info', '#3b82f6', ov && ov.counts ? ov.counts.unread_total : '—', 'Notifications non lues')}
      ${stat('check', '#22c55e', evAll['publish.succeeded'] != null ? `${evAll['publish.succeeded'] || 0}<small> · ${evAll['publish.failed'] || 0} échec(s)</small>` : '—', 'Publications (7 j)')}
    </div>
    <div class="inline" style="padding:12px 14px 0">
      <button class="btn sm primary" data-act="dotb-activity-all">${ic('refresh')}Tout analyser</button>
      <span class="muted" style="font-size:12px">L’API DotB ne donne pas de compteur direct : GB lit les conversations récentes (15 max par compte, 30 s environ) et compte ce que DotB a envoyé automatiquement.</span>
    </div>
    <div class="acc-grid">${accs.map((a) => {
      const id = String(a.id);
      const st = act[id];
      const prog = S.dotbProgress[id];
      const prof = byProfile[id];
      const notif = ov && ov.counts && (ov.counts.accounts || []).find((x) => String(x.vinted_account_id) === id);
      const ev = (ov && ov.events && ov.events[id]) || {};
      return `<div class="acc-card">
        <div class="ah">${prof ? avatar(prof) : ''}<div style="flex:1;min-width:0"><b>${esc(accLabel(a))}</b><div class="pmeta">${prof ? `${pcode(prof.num)} · ${esc(prof.name)}` : 'non lié à un profil'}</div></div>
          ${accOnline(a) ? '<span class="state ok">En ligne</span>' : '<span class="state wait">Hors ligne</span>'}</div>
        ${st ? `<div class="ab">
          <div class="kpi"><div class="kv2">${autoCount(st.sent24)}</div><div class="kl">messages auto · 24 h</div></div>
          <div class="kpi"><div class="kv2">${autoCount(st.sent7)}</div><div class="kl">messages auto · 7 j</div></div>
          <div class="kpi"><div class="kv2">${st.offers24}</div><div class="kl">offres envoyées · 24 h</div></div>
          <div class="kpi"><div class="kv2">${st.offersAccepted7}<small class="muted"> / ${st.offers7}</small></div><div class="kl">offres acceptées · 7 j</div></div>
          <div class="kpi"><div class="kv2">${st.unread}</div><div class="kl">conversations non lues</div></div>
          <div class="kpi"><div class="kv2">${notif ? notif.unread : '—'}</div><div class="kl">notifications non lues</div></div>
          ${Object.keys(st.sent7).length ? `<div class="src-list">${Object.entries(st.sent7).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<span class="pill ${k === 'manuel' ? '' : 'blue'}">${esc(srcLabel(k))} : ${v}${st.sent24[k] ? ` (${st.sent24[k]} auj.)` : ''}</span>`).join('')}</div>` : ''}
          ${ev['publish.succeeded'] || ev['order.created'] ? `<div class="src-list"><span class="pill green">${ev['publish.succeeded'] || 0} publication(s) · 7 j</span><span class="pill">${ev['order.created'] || 0} commande(s) · 7 j</span></div>` : ''}
        </div>` : `<div class="card-body"><span class="muted">Pas encore analysé.</span></div>`}
        <div class="af">${prog ? `<span class="spin"></span>${esc(prog)}` : st ? `${st.scanned} conv. lues sur ${st.listed} · ${timeFr(st.at)}${st.lastAuto ? ` · dernier envoi auto ${new Date(st.lastAuto).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}` : ''}
          <span style="margin-left:auto"></span>
          ${prof ? `<button class="btn sm" data-act="open" data-id="${prof.id}">${ic('play')}Ouvrir</button>` : ''}
          <button class="btn sm" data-act="dotb-activity" data-acc="${esc(id)}" ${prog ? 'disabled' : ''}>${ic('refresh')}Analyser</button></div>
      </div>`;
    }).join('') || '<div class="empty">Aucun compte DotB.</div>'}</div>`;
}

function pageDotb() {
  const d = S.data;
  const tab = DOTB_TABS.find((t) => t.k === S.dotbTab) || DOTB_TABS[0];
  const cache = S.dotb[tab.ep];
  const byAcc = {};
  d.profiles.forEach((p) => { if (p.dotbAccountId) byAcc[String(p.dotbAccountId)] = p; });

  let body;
  if (!d.settings.hasDotbToken) {
    body = `<div class="empty"><div class="empty-ico">${ic('key')}</div><h3>Token API non configuré</h3><div>Colle ton token DotB (offre Boutique AI → Paramètres → API) ci-dessus.</div></div>`;
  } else if (!cache || (cache.loading && !cache.rows)) {
    body = '<div class="empty"><div class="inline" style="justify-content:center"><span class="spin"></span>Chargement…</div></div>';
  } else if (cache.error) {
    body = `<div class="empty"><h3>Impossible de charger</h3><div>${esc(cache.error)}</div></div>`;
  } else if (!cache.rows.length) {
    body = '<div class="empty"><h3>Rien pour l’instant</h3></div>';
  } else if (tab.k === 'activity') {
    body = activityBody();
  } else if (tab.k === 'accounts') {
    body = `<table><thead><tr><th>Compte Vinted</th><th>ID DotB</th><th>Pont (extension)</th><th>Profil GB</th><th style="text-align:right">Actions</th></tr></thead><tbody>
      ${cache.rows.map((a) => {
        const prof = byAcc[String(a.id)];
        return `<tr><td class="pname">${esc(accLabel(a))}</td><td class="mono">${esc(a.id)}</td>
          <td>${accOnline(a) ? '<span class="state ok">En ligne</span>' : '<span class="state wait">Hors ligne</span>'}</td>
          <td>${prof ? `<div class="pcell">${avatar(prof)}<div><div class="pname">${esc(prof.name)}</div><div class="pmeta">${pcode(prof.num)}</div></div></div>` : '<span class="dash">Non lié</span>'}</td>
          <td><div class="row-actions">${prof ? `<button class="btn sm open-btn" data-act="open" data-id="${prof.id}">${ic('play')}Ouvrir</button>` : `<button class="btn sm" data-act="dotb-link" data-acc="${esc(a.id)}" data-label="${esc(accLabel(a))}">${ic('link')}Lier à un profil</button>`}</div></td></tr>`;
      }).join('')}</tbody></table>`;
  } else {
    const cols = columnsFor(cache.rows);
    body = `<table><thead><tr>${cols.map((c) => `<th>${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>
      ${cache.rows.map((r) => `<tr>${cols.map((c) => `<td>${fmtVal(c, r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  return `${head('DotB', 'Automatisation Vinted · API publique dotb.io', `
      <button class="btn" data-ext="https://dotb.io/app">${ic('ext')}Dashboard DotB</button>
      ${d.settings.hasDotbToken ? `<button class="btn" data-act="dotb-reload">${ic('refresh')}Recharger</button>` : ''}`)}
  <div class="page-body">
    <div class="card"><div class="card-head nob">
      <div class="hi">${ic('key')}</div>
      <div style="flex:1"><h3>Token API ${d.settings.hasDotbToken ? (dotbError() ? '<span class="pill red"><span class="pd"></span>Erreur</span>' : '<span class="pill green"><span class="pd"></span>Connecté</span>') : '<span class="pill"><span class="pd"></span>Non configuré</span>'}</h3>
        <div class="hs">Stocké sur ce PC uniquement. Limite DotB : 60 requêtes / minute.</div></div>
      <div class="ha" style="width:52%"><div class="input-row" style="width:100%">
        <input class="input mono" id="dotb-token" type="password" placeholder="${d.settings.hasDotbToken ? '•••••••• enregistré — colle un nouveau token pour le remplacer' : 'Colle ton token DotB'}">
        <button class="btn primary" data-act="dotb-save">Enregistrer</button>
        ${d.settings.hasDotbToken ? '<button class="btn danger" data-act="dotb-remove">Retirer</button>' : ''}
      </div></div>
    </div></div>
    <div class="card"><div class="card-head nob">
      <div class="hi" style="color:#fbbf24;background:rgba(245,158,11,.14)">${ic('users')}</div>
      <div style="flex:1"><h3>Connexion DotB dans les profils</h3><div class="hs">Connecte-toi à DotB une seule fois dans un profil, puis copie cette session dans tous les autres : pas besoin de retaper tes identifiants.</div></div>
      <div class="ha"><select class="input" id="dotb-src" style="width:230px">${[...d.profiles].sort((a, b) => a.num - b.num).map((p) => `<option value="${p.id}">${pcode(p.num)} · ${esc(p.name)}</option>`).join('')}</select>
        <button class="btn primary" data-act="dotb-copy-session">${ic('copy')}Copier vers tous</button></div>
    </div></div>
    <div class="card table-card" style="flex:1;min-height:300px">
      <div class="tabs">${DOTB_TABS.map((t) => `<span class="tab ${t.k === tab.k ? 'active' : ''}" data-dtab="${t.k}">${t.label}${S.dotb[t.ep] && S.dotb[t.ep].rows ? ` <span class="muted">${S.dotb[t.ep].rows.length}</span>` : ''}</span>`).join('')}</div>
      <div class="table-scroll">${body}</div>
      ${cache && cache.at ? `<div class="table-foot">Mis à jour à ${timeFr(cache.at)}</div>` : ''}
    </div>
  </div>`;
}

// ── Page Extensions ──────────────────────────────────
function dotbExtCard() {
  const d = S.data;
  const e = d.extensions.find((x) => x.webstoreId === d.dotbExtId);
  const st = d.dotbInstalling ? '<span class="pill blue"><span class="spin" style="width:10px;height:10px"></span>Installation…</span>'
    : !e ? '<span class="pill red"><span class="pd"></span>Non installée</span>'
    : e.enabled ? '<span class="pill green"><span class="pd"></span>Active dans tous les profils</span>' : '<span class="pill orange"><span class="pd"></span>Désactivée</span>';
  return `<div class="card"><div class="dotb-ext">
    <div class="dl">${ic('bolt')}</div>
    <div style="flex:1"><h3 style="font-size:15px;display:flex;gap:8px;align-items:center">DotB ${st}</h3>
      <div class="hs" style="font-size:12.5px;color:var(--text-3);margin-top:3px">${e ? `Version ${esc(e.version)} · mise à jour ${e.updatedAt ? new Date(e.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'} · ` : ''}installée d’office dans chaque profil, sans page de bienvenue.</div></div>
    ${e ? `<div class="toggle ${e.enabled ? 'on' : ''}" data-act="ext-toggle" data-id="${e.id}" title="Activer / désactiver dans tous les profils"></div>` : ''}
    <button class="btn ${e ? '' : 'primary'}" data-act="dotb-ext-reinstall" ${d.dotbInstalling ? 'disabled' : ''}>${ic(e ? 'refresh' : 'download')}${e ? 'Mettre à jour DotB' : 'Installer DotB'}</button>
    <button class="btn" data-ext="https://dotb.io/app">${ic('ext')}Dashboard</button>
  </div></div>`;
}
function pageExtensions() {
  const ex = S.data.extensions.filter((e) => e.webstoreId !== S.data.dotbExtId);
  const active = S.data.extensions.filter((e) => e.enabled).length;
  const srcLabel = { webstore: 'Chrome Web Store', fichier: 'Fichier', dossier: 'Dossier' };
  return `${head('Extensions', `${active} extension(s) active(s) · chargées à chaque ouverture d’un profil`, `
      <button class="btn" data-act="ext-file">${ic('upload')}Importer un fichier</button>
      <button class="btn" data-act="ext-folder">${ic('folder')}Importer un dossier</button>`)}
  <div class="page-body">
    ${dotbExtCard()}
    <div class="card">
      <div class="card-head"><div class="hi" style="color:#60a5fa;background:rgba(59,130,246,.12)">${ic('link')}</div>
        <div><h3>Ajouter depuis le Chrome Web Store</h3><div class="hs">Colle le lien de la page de l’extension : elle est téléchargée, gardée avec son identifiant officiel et mise à jour automatiquement.</div></div></div>
      <div class="card-body">
        <div class="input-row"><input class="input mono" id="ext-url" placeholder="https://chromewebstore.google.com/detail/…"><button class="btn primary" data-act="ext-webstore" id="ext-add-btn">${ic('plus')}Ajouter</button></div>
        <div class="foot-note">Pour une extension hors Web Store (.crx, .zip ou dossier décompressé), utilise les boutons d’import en haut à droite. Les profils déjà ouverts prennent les changements à leur prochaine ouverture.</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>Autres extensions chargées dans tous les profils</h3></div>
        ${ex.some((e) => e.webstoreId) ? `<div class="ha"><button class="btn sm" data-act="ext-update">${ic('refresh')}Vérifier les mises à jour</button></div>` : ''}</div>
      ${ex.length === 0 ? `<div class="empty" style="padding:60px 20px"><div class="empty-ico">${ic('puzzle')}</div><h3>Aucune autre extension</h3>
        <div>Ajoute une extension du Chrome Web Store ou importe un fichier :<br>elle sera chargée dans chaque profil Brave.</div></div>` : `
      <table><thead><tr><th>Extension</th><th>Version</th><th>Source</th><th>Mise à jour</th><th>Active</th><th style="text-align:right">Actions</th></tr></thead><tbody>
      ${ex.map((e) => `<tr><td><div class="pname">${esc(e.name)}</div>${e.extId ? `<div class="pmeta">${esc(e.extId)}</div>` : ''}</td><td>${esc(e.version)}</td>
        <td>${srcLabel[e.source] || '—'}</td><td class="muted">${e.updatedAt ? new Date(e.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
        <td><div class="toggle ${e.enabled ? 'on' : ''}" data-act="ext-toggle" data-id="${e.id}"></div></td>
        <td><div class="row-actions"><button class="btn sm danger" data-act="ext-delete" data-id="${e.id}">${ic('trash')}Retirer</button></div></td></tr>`).join('')}
      </tbody></table>`}
    </div>
    <div class="foot-note">Les extensions sont chargées avec leur identifiant officiel, comme si tu les avais installées à la main. Les pages de bienvenue qu’elles ouvrent au premier lancement sont fermées automatiquement (réglable dans Paramètres).</div>
  </div>`;
}

// ── Page Journal ─────────────────────────────────────
function pageJournal() {
  const all = S.data.logs;
  const counts = { all: all.length, error: 0, warn: 0, success: 0 };
  all.forEach((l) => { if (counts[l.level] !== undefined) counts[l.level]++; });
  const q = S.logSearch.trim().toLowerCase();
  const list = [...all].reverse().filter((l) => (S.logFilter === 'all' || l.level === S.logFilter) && (!q || l.msg.toLowerCase().includes(q)));
  const icon = { info: 'info', success: 'check', warn: 'alert', error: 'xcircle' };
  const chips = [['all', 'Tout'], ['error', 'Erreurs'], ['warn', 'Avertissements'], ['success', 'Succès']];
  return `${head('Journal', `${all.length} évènement(s)`, `
      <button class="btn" data-act="log-copy">${ic('copy')}Copier</button>
      <button class="btn" data-act="log-clear">${ic('trash')}Effacer</button>`)}
  <div class="page-body">
    <div class="card table-card" style="flex:1;min-height:300px">
      <div class="toolbar">
        ${chips.map(([k, l]) => `<span class="chip ${S.logFilter === k ? 'active' : ''}" data-lfilter="${k}">${l} <span class="n">${counts[k]}</span></span>`).join('')}
        <div class="search">${ic('search')}<input id="log-search" placeholder="Filtrer le journal…" value="${esc(S.logSearch)}"></div>
      </div>
      <div class="table-scroll">
        ${list.map((l) => `<div class="log-line ${l.level}"><span class="t">${timeFr(l.t)}</span><span class="li">${ic(icon[l.level] || 'info')}</span><span class="m">${esc(l.msg)}</span></div>`).join('') || '<div class="empty">Rien à afficher</div>'}
      </div>
    </div>
  </div>`;
}

// ── Page Paramètres ──────────────────────────────────
function pageSettings() {
  const d = S.data;
  const s = d.settings;
  const browserPath = S.drafts['set-browser'] ?? (s.browserPath || (d.browser ? d.browser.path : ''));
  const theme = s.theme || 'dark';
  return `${head('Paramètres', 'Navigateur, proxies, DotB et préférences')}
  <div class="page-body">
    <div class="grid2">
      <div class="col">
        <div class="card">
          <div class="card-head"><div class="hi" style="color:#f59e0b;background:rgba(245,158,11,.12)">${ic('globe')}</div>
            <div><h3>Navigateur</h3><div class="hs">Brave est lancé avec un dossier isolé par profil.</div></div></div>
          <div class="card-body">
            <div class="field"><label>Chemin de brave.exe ${d.browser ? '<span class="pill green"><span class="pd"></span>trouvé</span>' : '<span class="pill red"><span class="pd"></span>introuvable</span>'}</label>
              <div class="input-row"><input class="input mono" id="set-browser" value="${esc(browserPath)}" placeholder="C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"><button class="btn" data-act="pick-browser">${ic('folder')}Parcourir</button></div>
              ${d.browser ? '' : `<div class="hint">Brave n’est pas installé ? <span class="st-sub link" style="display:inline" data-ext="https://brave.com/fr/download/">Télécharger Brave</span></div>`}</div>
            <div class="field"><label>Dossier des profils</label>
              <div class="input-row"><input class="input mono" id="set-profiles" value="${esc(s.profilesDir)}"><button class="btn" data-act="pick-profiles">${ic('folder')}Parcourir</button></div>
              <div class="hint">Les profils existants restent dans l’ancien dossier si tu le changes.</div></div>
          </div>
          <div class="card-foot"><button class="btn primary" data-act="save-browser">${ic('check')}Enregistrer</button></div>
        </div>

        <div class="card">
          <div class="card-head"><div class="hi" style="color:#60a5fa;background:rgba(59,130,246,.12)">${ic('pulse')}</div>
            <div><h3>Tests de proxy</h3><div class="hs">Connexion à travers chaque proxy pour lire l’IP publique et le pays.</div></div></div>
          <div class="card-body">
            <div class="field" style="max-width:260px"><label>Délai max. (s)</label><input class="input" id="set-timeout" type="number" min="2" max="60" value="${esc(s.proxyTimeout)}"></div>
            <div class="hint">WebRTC est bloqué hors proxy dans chaque profil qui a un proxy : pas de fuite de l’IP réelle par UDP.</div>
          </div>
          <div class="card-foot"><button class="btn primary" data-act="save-timeout">${ic('check')}Enregistrer</button></div>
        </div>

        <div class="card">
          <div class="card-head"><div class="hi" style="color:#22c55e;background:rgba(34,197,94,.12)">${ic('shield')}</div>
            <div><h3>Protection et performances</h3><div class="hs">Empreinte par profil, notifications Windows et économie de RAM.</div></div></div>
          <div class="setrow" style="border-top:none"><div class="st"><b>Empreinte unique par profil</b><span>Écran, carte graphique (même marque que ton PC), cœurs, mémoire, plus langue et fuseau calés sur le pays du proxy.</span></div>
            <div class="toggle ${s.fpEnabled !== false ? 'on' : ''}" data-act="tg-setting" data-k="fpEnabled"></div></div>
          <div class="setrow"><div class="st"><b>Autoriser les cookies tiers</b><span>Brave bloque par défaut les cookies déposés par d’autres sites (pubs, mesures d’audience). Activé, le warm en récolte davantage. GB affiche le nombre de cookies du profil après chaque warm (page Santé).</span></div>
            <div class="toggle ${s.allow3pCookies !== false ? 'on' : ''}" data-act="tg-setting" data-k="allow3pCookies"></div></div>
          <div class="setrow"><div class="st"><b>Économiseur de mémoire</b><span>Brave met en veille les onglets inactifs (warm, pages ouvertes à la main). Les onglets Vinted et la page DotB sont protégés par la petite extension « GB » et ne dorment jamais. Plus une purge de la RAM toutes les 20 min.</span></div>
            <div class="toggle ${s.memorySaver !== false ? 'on' : ''}" data-act="tg-setting" data-k="memorySaver"></div></div>
          <div class="setrow"><div class="st"><b>Économie de RAM</b><span>Un processus par site, cache limité, services Google inutiles coupés. Ne touche pas aux onglets Vinted ni à DotB.</span></div>
            <div class="toggle ${s.ecoRam !== false ? 'on' : ''}" data-act="tg-setting" data-k="ecoRam"></div></div>
          <div class="setrow"><div class="st"><b>Démarrer avec Windows</b><span>Au démarrage du PC ou du VPS, GB Browser se lance tout seul et rouvre un par un les profils qui étaient ouverts (DotB relancé). Sur un VPS, la session Windows doit s’ouvrir automatiquement.</span></div>
            <div class="toggle ${s.autoStart !== false ? 'on' : ''}" data-act="tg-setting" data-k="autoStart"></div></div>
          <div class="setrow"><div class="st"><b>Redémarrage de nuit (4 h)</b><span>Chaque nuit, les profils ouverts sont fermés puis rouverts un par un : la RAM repart à zéro, DotB et ses automatisations sont relancés. Évite les ralentissements après plusieurs jours.</span></div>
            <div class="toggle ${s.nightlyRestart !== false ? 'on' : ''}" data-act="tg-setting" data-k="nightlyRestart"></div></div>
          <div class="setrow"><div class="st"><b>Boucliers Brave coupés partout</b><span>Brave ne bloque plus rien (cookies, pubs, traqueurs) sur aucun site : il se comporte comme un navigateur classique et le warm récolte un maximum de cookies. Attention : les pubs consomment un peu plus de données sur les proxys facturés au Go. Appliqué à la prochaine ouverture du profil.</span></div>
            <div class="toggle ${s.shieldsOffAll !== false ? 'on' : ''}" data-act="tg-setting" data-k="shieldsOffAll"></div></div>
          <div class="setrow"><div class="st"><b>Boucliers Brave coupés sur Vinted</b><span>Sur vinted.fr (et DotB), Brave ne bloque rien et ne brouille pas l’empreinte : le site se comporte comme chez un acheteur normal. Les boucliers restent actifs sur les autres sites. Appliqué à la prochaine ouverture du profil.</span></div>
            <div class="toggle ${s.shieldsOffVinted !== false ? 'on' : ''}" data-act="tg-setting" data-k="shieldsOffVinted"></div></div>
          <div class="setrow"><div class="st"><b>Logo Vinted dans la barre des tâches</b><span>Chaque profil a son propre bouton dans la barre des tâches Windows, avec le logo Vinted et son nom (P001 Julia…) au lieu du lion Brave. Prend effet sur les profils ouverts dans les 15 s.</span></div>
            <div class="toggle ${s.vintedIcon !== false ? 'on' : ''}" data-act="tg-setting" data-k="vintedIcon"></div></div>
          <div class="setrow"><div class="st"><b>Notifications Windows</b><span>Plantage, compte Vinted déconnecté, DotB hors ligne, proxy en panne, nouvelle commande, compte prêt (24 h), chauffe terminée.</span></div>
            <div class="toggle ${s.notify !== false ? 'on' : ''}" data-act="tg-setting" data-k="notify"></div></div>
        </div>

        <div class="card">
          <div class="card-head"><div class="hi" style="color:#60a5fa;background:rgba(59,130,246,.12)">${ic('clock')}</div>
            <div><h3>Surveillance</h3><div class="hs">Contrôle du matin et alerte de rythme de publication DotB.</div></div></div>
          <div class="setrow" style="border-top:none"><div class="st"><b>Contrôle du matin</b><span>Chaque jour, GB vérifie tous les comptes (même fermés) : Vinted connecté, proxy, restrictions, DotB, IP partagée. Résumé en notification et dans Santé.</span></div>
            <div class="hours"><input class="input" id="set-mhour" type="number" min="0" max="23" value="${(s.morningCheck || {}).hour ?? 8}"> h <button class="btn sm" data-act="save-morning">OK</button></div>
            <div class="toggle ${(s.morningCheck || {}).enabled !== false ? 'on' : ''}" data-act="tg-morning"></div></div>
          <div class="setrow"><div class="st"><b>Alerte de publications DotB</b><span>Prévient (sans rien bloquer) quand un compte publie beaucoup dans la journée. En prudence : dès la 1re publication.</span></div>
            <div class="hours">Normal <input class="input" id="set-pubn" type="number" min="1" value="${(s.pubAlert || {}).normal ?? 40}"> Fragile <input class="input" id="set-pubf" type="number" min="1" value="${(s.pubAlert || {}).fragile ?? 15}"> / jour <button class="btn sm" data-act="save-pub">OK</button></div></div>
        </div>

        <div class="card">
          <div class="card-head"><div class="hi" style="color:#f97316;background:rgba(249,115,22,.12)">${ic('flame')}</div>
            <div><h3>Warm</h3><div class="hs">Navigation humaine : leboncoin, Wikipédia, sites FR (cookies acceptés), puis une balade sur Vinted (recherches, annonces regardées, sans favori ni message).</div></div></div>
          <div class="setrow" style="border-top:none"><div class="st"><b>Durée</b><span>Court ≈ 2-3 min · Normal ≈ 5-8 min · Long ≈ 10-15 min</span></div>
            <div class="seg">${['court', 'normal', 'long'].map((k) => `<span class="${(s.warmIntensity || 'court') === k ? 'active' : ''}" data-warm="${k}">${k[0].toUpperCase() + k.slice(1)}</span>`).join('')}</div></div>
          <div class="setrow"><div class="st"><b>Plage horaire des warms automatiques</b><span>Warm quotidien et plan de chauffe 7 jours : à une heure au hasard dans cette plage.</span></div>
            <div class="hours"><input class="input" id="set-wfrom" type="number" min="0" max="23" value="${(s.autoWarm || {}).from ?? 9}"> h à <input class="input" id="set-wto" type="number" min="1" max="24" value="${(s.autoWarm || {}).to ?? 21}"> h <button class="btn sm" data-act="save-whours">OK</button></div></div>
          <div class="setrow"><div class="st"><b>Fermer les pages de bienvenue</b><span>Ferme les onglets de bienvenue de DotB et des extensions à l’ouverture d’un profil.</span></div>
            <div class="toggle ${s.closeWelcome !== false ? 'on' : ''}" data-act="toggle-welcome"></div></div>
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="card-head"><div class="hi" style="color:#f59e0b;background:rgba(245,158,11,.12)">${ic('bolt')}</div>
            <div><h3>DotB</h3><div class="hs">${s.hasDotbToken ? (dotbError() ? esc(dotbError()) : 'Token API enregistré') : 'Token API non configuré'}</div></div>
            <div class="ha"><button class="btn sm" data-go="dotb">Ouvrir la page DotB ›</button></div></div>
        </div>

        <div class="card">
          <div class="card-head"><div class="hi" style="background:var(--grad);color:#fff">${ic('home')}</div>
            <div><h3>Groupe Barbaray</h3><div class="hs">Liens utilisés par GB Browser.</div></div></div>
          <div class="card-body">
            <div class="field"><label>URL de l’app</label><input class="input mono" id="set-gb" value="${esc(s.gbUrl)}"></div>
            <div class="field"><label>Clé GB Browser (site → Comptes & GB Browser)</label><input class="input mono" type="password" id="set-gbkey" placeholder="${s.hasGbKey ? 'Clé enregistrée — colle une nouvelle clé pour la remplacer' : 'gbk_…'}">
              <div class="hint">${s.gbLink && s.gbLink.at ? (s.gbLink.ok ? `✅ Comptes envoyés au site ${new Date(s.gbLink.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (toutes les 5 min)` : `⚠️ ${esc(s.gbLink.error || 'Envoi impossible')}`) : (s.hasGbKey ? 'Premier envoi dans un instant.' : 'Avec la clé, la santé de tes comptes s’affiche sur le site et dans le compte rendu du soir.')}</div></div>
            <div class="field"><label>Pages ouvertes au lancement d’un profil (une par ligne)</label><textarea class="input" id="set-starts" style="min-height:64px">${esc((s.startUrls || []).join('\n'))}</textarea>
              <div class="hint">Seules ces pages s’ouvrent : l’ancienne session n’est pas restaurée.</div></div>
          </div>
          <div class="card-foot"><button class="btn" data-act="gb-push">${ic('refresh')}Tester l’envoi</button><button class="btn primary" data-act="save-links">${ic('check')}Enregistrer</button></div>
        </div>

        <div class="card">
          <div class="card-head nob"><div class="hi" style="color:#a78bfa;background:rgba(139,92,246,.14)">${ic('moon')}</div>
            <div><h3>Apparence</h3><div class="hs">Thème de l’interface.</div></div></div>
          <div class="theme-tiles">
            <div class="tile ${theme === 'dark' ? 'active' : ''}" data-theme="dark"><div class="prev"><i style="background:#0d1220;flex:.3"></i><i style="background:#0b0f19"></i></div><div class="tl">${ic('moon')}Nuit GB</div></div>
            <div class="tile ${theme === 'light' ? 'active' : ''}" data-theme="light"><div class="prev"><i style="background:#e5e9f2;flex:.3"></i><i style="background:#ffffff"></i></div><div class="tl">${ic('sun')}Clair</div></div>
            <div class="tile ${theme === 'system' ? 'active' : ''}" data-theme="system"><div class="prev"><i style="background:#0b0f19"></i><i style="background:#ffffff"></i></div><div class="tl">${ic('monitor')}Comme Windows</div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="hi">${ic('download')}</div>
            <div><h3>Import depuis Scalency</h3><div class="hs">Dossier où Scalency range ses profils Brave.</div></div></div>
          <div class="card-body"><div class="input-row"><input class="input mono" id="set-scalency" value="${esc(s.scalencyDir || '')}" placeholder="C:\\Profiles"><button class="btn" data-act="pick-scalency">${ic('folder')}Parcourir</button><button class="btn primary" data-act="save-scalency">Enregistrer</button></div></div>
        </div>

        <div class="card">
          <div class="card-head nob"><div class="hi">${ic('folder')}</div>
            <div style="min-width:0"><h3>Version ${esc(d.version)} · Données</h3><div class="hs mono">${esc(d.dataDir)}</div></div>
            <div class="ha"><button class="btn sm" data-act="update-check">${ic('refresh')}Vérifier les mises à jour</button><button class="btn sm" data-act="open-data">Ouvrir</button></div></div>
          <div class="setrow"><div class="st"><b>Mise à jour automatique</b><span>GB Browser installé (.exe) se met à jour tout seul depuis GitHub : téléchargement en arrière-plan, installation au prochain redémarrage.</span></div>
            <div class="toggle ${s.autoUpdate !== false ? 'on' : ''}" data-act="tg-setting" data-k="autoUpdate"></div></div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── Menus et popovers ────────────────────────────────
function closeMenu() { $('#menu-root').innerHTML = ''; }
function placeAt(el, anchor) {
  const r = anchor.getBoundingClientRect();
  const h = el.offsetHeight, w = el.offsetWidth;
  let top = r.bottom + 4;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
  el.style.top = top + 'px';
  el.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
}
function openMenu(anchor, items) {
  const root = $('#menu-root');
  root.innerHTML = `<div class="menu">${items.map((it, i) => it === '-' ? '<div class="sep"></div>'
    : it.header ? `<div class="mh">${esc(it.header)}</div>`
    : `<div class="mi ${it.danger ? 'danger' : ''}" data-mi="${i}">${it.icon ? ic(it.icon) : ''}${it.dot ? `<span style="width:8px;height:8px;border-radius:50%;background:${it.dot};margin:0 3px"></span>` : ''}${esc(it.label)}</div>`).join('')}</div>`;
  const m = root.firstChild;
  m.querySelectorAll('svg').forEach((s) => { s.style.width = '15px'; s.style.height = '15px'; });
  placeAt(m, anchor);
  m.addEventListener('click', (e) => {
    const el = e.target.closest('[data-mi]');
    if (!el) return;
    closeMenu();
    items[+el.dataset.mi].run();
  });
}
function statusMenu(anchor, ids) {
  openMenu(anchor, [{ header: 'Statut' }, ...STATUSES.map((s) => ({ label: s.label, dot: s.color, run: () => gb.invoke('profile:setStatus', ids, s.k) })),
    '-', { label: 'Aucun statut', run: () => gb.invoke('profile:setStatus', ids, 'none') }]);
}
function tagPopover(anchor, p) {
  const root = $('#menu-root');
  root.innerHTML = '<div class="popover menu"><input class="input" id="tag-input" placeholder="Nouveau tag…"><button class="btn sm primary" id="tag-ok">Ajouter</button></div>';
  const pop = root.firstChild;
  placeAt(pop, anchor);
  const input = $('#tag-input');
  input.focus();
  const add = async () => {
    const v = input.value.trim();
    if (!v) return closeMenu();
    const tags = [...new Set([...(p.tags || []), ...v.split(',').map((t) => t.trim()).filter(Boolean)])];
    closeMenu();
    await gb.invoke('profile:update', p.id, { tags });
  };
  $('#tag-ok').addEventListener('click', add);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
}

// ── Modales ──────────────────────────────────────────
function modal(title, body, footer, wide = false) {
  $('#modal-root').innerHTML = `<div class="overlay"><div class="modal ${wide ? 'wide' : ''}">
    <div class="modal-h">${title}<span class="x" data-close>✕</span></div>
    <div class="modal-b">${body}</div>
    ${footer ? `<div class="modal-f">${footer}</div>` : ''}</div></div>`;
  const ov = $('.overlay');
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModal(); });
  $$('[data-close]', ov).forEach((el) => el.addEventListener('click', closeModal));
  const first = $('input:not([type=checkbox]),textarea', ov);
  if (first) first.focus();
  return ov;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function dotbAccountField(current) {
  const accs = dotbAccounts();
  if (accs && accs.length) {
    return `<select class="input" id="pm-dotb"><option value="">— Aucun —</option>${accs.map((a) => `<option value="${esc(a.id)}" ${String(a.id) === String(current || '') ? 'selected' : ''}>${esc(accLabel(a))}${accOnline(a) ? ' · en ligne' : ''}</option>`).join('')}</select>`;
  }
  return `<input class="input" id="pm-dotb" placeholder="${S.data.settings.hasDotbToken ? 'ID du compte DotB' : 'Configure le token DotB pour choisir dans la liste'}" value="${esc(current || '')}">`;
}

function profileModal(p) {
  const d = S.data;
  if (d.settings.hasDotbToken) loadDotb('/accounts');
  const isNew = !p;
  p = p || { name: '', tags: [], status: 'none', proxy: '', notes: '', startUrl: '', dotbAccountId: null };
  const ov = modal(isNew ? 'Nouveau profil' : `Modifier le profil · ${pcode(p.num)}`, `
    <div class="row2">
      <div class="field"><label>Nom</label><input class="input" id="pm-name" value="${esc(p.name)}" placeholder="ex. juliette579"></div>
      <div class="field"><label>Statut</label><select class="input" id="pm-status"><option value="none">—</option>${STATUSES.map((s) => `<option value="${s.k}" ${p.status === s.k ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
    </div>
    ${isNew ? '<div class="field"><label>Nombre de profils à créer</label><input class="input" id="pm-count" type="number" min="1" max="100" value="1"><div class="hint">Au-delà de 1, les profils sont numérotés : « nom 1 », « nom 2 »…</div></div>' : ''}
    <div class="field"><label>Tags</label><input class="input" id="pm-tags" value="${esc((p.tags || []).join(', '))}" placeholder="femme, vintage (séparés par des virgules)"></div>
    <div class="field"><label>Proxy</label>
      <div class="input-row"><input class="input mono" id="pm-proxy" value="${esc(p.proxy || '')}" placeholder="ip:port:identifiant:motdepasse — vide = IP réelle du PC"><button class="btn" id="pm-test">${ic('pulse')}Tester</button></div>
      <div class="hint" id="pm-test-res">Formats : ip:port · ip:port:user:pass · user:pass@ip:port · socks5://ip:port</div></div>
    <div class="field"><label>Compte DotB</label><div id="pm-dotb-wrap">${dotbAccountField(p.dotbAccountId)}</div></div>
    <div class="field"><label>Page d’ouverture spécifique (optionnel, sinon les pages des Paramètres)</label><input class="input mono" id="pm-start" value="${esc(p.startUrl || '')}" placeholder="${esc(d.settings.startUrl)}"></div>
    <div class="field"><label>Notes</label><textarea class="input" id="pm-notes" style="min-height:60px;font-family:inherit">${esc(p.notes || '')}</textarea></div>
    <div class="field"><label>Automatisation</label>
      <label class="inline" style="cursor:pointer;margin-bottom:6px"><input type="checkbox" id="pm-keep" ${p.keepAlive ? 'checked' : ''}> Relancer automatiquement s’il plante</label>
      <label class="inline" style="cursor:pointer;margin-bottom:6px"><input type="checkbox" id="pm-dotbauto" ${p.dotbAuto ? 'checked' : ''}> Démarrer les automatisations DotB à chaque ouverture (likes, Smart Agent v2, commandes, bridge — 2 h)</label>
      <label class="inline" style="cursor:pointer"><input type="checkbox" id="pm-autowarm" ${p.autoWarm ? 'checked' : ''}> Warm automatique chaque jour</label></div>
  `, `<button class="btn" data-close>Annuler</button><button class="btn primary" id="pm-save">${isNew ? 'Créer' : 'Enregistrer'}</button>`);

  $('#pm-test', ov).addEventListener('click', async () => {
    const raw = $('#pm-proxy', ov).value.trim();
    if (!raw) return ($('#pm-test-res', ov).textContent = 'Aucun proxy : le profil sortira avec l’IP réelle du PC.');
    $('#pm-test-res', ov).innerHTML = '<span class="inline"><span class="spin"></span>Test en cours…</span>';
    const r = await gb.invoke('proxy:testRaw', raw);
    $('#pm-test-res', ov).innerHTML = r.ok ? `<span style="color:#4ade80">En ligne — ${esc(r.ip)} · ${esc(r.country)} (${r.ms} ms)</span>` : `<span style="color:#f87171">Échec : ${esc(r.error)}</span>`;
  });
  $('#pm-save', ov).addEventListener('click', async () => {
    const dotbId = $('#pm-dotb', ov).value.trim() || null;
    const accs = dotbAccounts() || [];
    const acc = dotbId && accs.find((x) => String(x.id) === dotbId);
    const data = {
      name: $('#pm-name', ov).value.trim() || (isNew ? '' : p.name),
      status: $('#pm-status', ov).value,
      tags: $('#pm-tags', ov).value.split(',').map((t) => t.trim()).filter(Boolean),
      proxy: $('#pm-proxy', ov).value.trim(),
      dotbAccountId: dotbId,
      dotbAccountLabel: acc ? String(accLabel(acc)) : (dotbId ? p.dotbAccountLabel || '' : ''),
      startUrl: $('#pm-start', ov).value.trim(),
      notes: $('#pm-notes', ov).value,
      keepAlive: $('#pm-keep', ov).checked,
      dotbAuto: $('#pm-dotbauto', ov).checked,
      autoWarm: $('#pm-autowarm', ov).checked,
    };
    if (isNew) data.count = $('#pm-count', ov).value;
    const r = isNew ? await gb.invoke('profile:create', data) : await gb.invoke('profile:update', p.id, data);
    if (r && r.ok === false) return toast(r.error, 'err');
    closeModal();
    toast(isNew ? 'Profil créé' : 'Profil enregistré', 'ok');
  });
}

function proxyModal(p) {
  const px = p.px || { scheme: 'http', host: '', port: '', user: '' };
  let pass = '';
  if (p.proxy) {
    // récupère le mot de passe depuis la ligne brute
    const raw = p.proxy.replace(/^[a-z0-9]+:\/\//i, '');
    const at = raw.lastIndexOf('@');
    if (at !== -1) { const cred = raw.slice(0, at); const c = cred.indexOf(':'); pass = c === -1 ? '' : decodeURIComponent(cred.slice(c + 1)); }
    else { const parts = raw.split(':'); if (parts.length >= 4) pass = parts.slice(3).join(':'); }
  }
  const ov = modal(`Configurer le proxy · ${pcode(p.num)} ${esc(p.name)}`, `
    <div class="field"><label>Coller une ligne complète</label><input class="input mono" id="px-line" placeholder="ip:port:identifiant:motdepasse ou http://user:pass@ip:port"><div class="hint">Remplit les champs ci-dessous automatiquement.</div></div>
    <div class="row2">
      <div class="field"><label>Type</label><select class="input" id="px-type"><option value="http" ${px.scheme === 'http' ? 'selected' : ''}>HTTP / HTTPS</option><option value="socks5" ${px.scheme !== 'http' ? 'selected' : ''}>SOCKS5</option></select></div>
      <div class="field"><label>Port</label><input class="input mono" id="px-port" value="${esc(px.port)}" placeholder="8080"></div>
    </div>
    <div class="field"><label>Serveur</label><input class="input mono" id="px-host" value="${esc(px.host)}" placeholder="51.15.12.34 ou proxy.fournisseur.com"></div>
    <div class="row2">
      <div class="field"><label>Identifiant</label><input class="input mono" id="px-user" value="${esc(px.user || '')}" placeholder="optionnel"></div>
      <div class="field"><label>Mot de passe</label><input class="input mono" id="px-pass" type="password" value="${esc(pass)}" placeholder="optionnel"></div>
    </div>
    <div class="hint" id="px-res">Un proxy par compte Vinted, idéalement résidentiel en France. Les proxies SOCKS5 avec identifiant ne sont pas gérés : prends la version HTTP chez ton fournisseur.</div>
  `, `${p.px ? `<button class="btn danger" id="px-remove" style="margin-right:auto">${ic('trash')}Retirer le proxy</button>` : ''}
      <button class="btn" id="px-test">${ic('pulse')}Tester</button><button class="btn primary" id="px-save">Enregistrer</button>`);

  const build = () => {
    const type = $('#px-type', ov).value, host = $('#px-host', ov).value.trim(), port = $('#px-port', ov).value.trim();
    const user = $('#px-user', ov).value.trim(), pw = $('#px-pass', ov).value;
    if (!host && !port) return '';
    const cred = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pw)}@` : '';
    return `${type}://${cred}${host}:${port}`;
  };
  $('#px-line', ov).addEventListener('input', (e) => {
    const s = e.target.value.trim();
    let scheme = 'http', rest = s;
    const m = s.match(/^([a-z0-9]+):\/\//i);
    if (m) { scheme = /socks/i.test(m[1]) ? 'socks5' : 'http'; rest = s.slice(m[0].length); }
    let host = '', port = '', user = '', pw = '';
    const at = rest.lastIndexOf('@');
    if (at !== -1) {
      const cred = rest.slice(0, at), c = cred.indexOf(':');
      user = c === -1 ? cred : cred.slice(0, c); pw = c === -1 ? '' : cred.slice(c + 1);
      [host, port] = rest.slice(at + 1).replace(/\/+$/, '').split(':');
    } else {
      const parts = rest.split(':');
      host = parts[0]; port = parts[1] || '';
      if (parts.length >= 4) { user = parts[2]; pw = parts.slice(3).join(':'); }
    }
    $('#px-type', ov).value = scheme; $('#px-host', ov).value = host || ''; $('#px-port', ov).value = port || '';
    $('#px-user', ov).value = decodeURIComponent(user || ''); $('#px-pass', ov).value = decodeURIComponent(pw || '');
  });
  $('#px-test', ov).addEventListener('click', async () => {
    const raw = build();
    if (!raw) return ($('#px-res', ov).textContent = 'Renseigne au moins le serveur et le port.');
    $('#px-res', ov).innerHTML = '<span class="inline"><span class="spin"></span>Test en cours…</span>';
    const r = await gb.invoke('proxy:testRaw', raw);
    $('#px-res', ov).innerHTML = r.ok ? `<span style="color:#4ade80">En ligne — ${esc(r.ip)} · ${esc(r.country)} · ${esc(r.city || '')} (${r.ms} ms)</span>` : `<span style="color:#f87171">Échec : ${esc(r.error)}</span>`;
  });
  $('#px-save', ov).addEventListener('click', async () => {
    const r = await gb.invoke('proxy:set', p.id, build());
    if (r && r.ok === false) return toast(r.error, 'err');
    closeModal();
    toast('Proxy enregistré', 'ok');
    if (build()) gb.invoke('proxy:test', p.id);
  });
  const rm = $('#px-remove', ov);
  if (rm) rm.addEventListener('click', async () => { await gb.invoke('proxy:set', p.id, ''); closeModal(); toast('Proxy retiré : IP réelle du PC'); });
}

function proxyImportModal() {
  const free = S.data.profiles.filter((p) => !p.px).sort((a, b) => a.num - b.num);
  const ov = modal('Importer des proxies', `
    <div class="field"><label>Un proxy par ligne</label>
      <textarea class="input" id="pi-text" style="min-height:190px" placeholder="51.15.12.34:8080:user:pass&#10;51.15.12.35:8080:user:pass&#10;socks5://51.15.12.36:1080"></textarea>
      <div class="hint" id="pi-count">Attribués dans l’ordre aux profils sans proxy (${free.length} disponible(s)${free.length ? ` : ${free.slice(0, 4).map((p) => pcode(p.num)).join(', ')}${free.length > 4 ? '…' : ''}` : ''}).</div></div>
    <label class="inline" style="cursor:pointer"><input type="checkbox" id="pi-create"> Créer un nouveau profil pour chaque proxy en trop</label>
  `, `<button class="btn" data-close>Annuler</button><button class="btn primary" id="pi-go">${ic('upload')}Importer</button>`);
  $('#pi-go', ov).addEventListener('click', async () => {
    const r = await gb.invoke('proxy:import', { text: $('#pi-text', ov).value, createMissing: $('#pi-create', ov).checked });
    closeModal();
    if (r.assigned) toast(`${r.assigned} proxy(s) attribué(s)${r.created ? `, ${r.created} profil(s) créé(s)` : ''}`, 'ok');
    if (r.left) toast(`${r.left} proxy(s) non attribué(s) : plus assez de profils sans proxy`, 'err');
    if (r.bad.length) toast(`Lignes illisibles : ${r.bad.slice(0, 3).join(' · ')}${r.bad.length > 3 ? '…' : ''}`, 'err');
  });
}

async function braveImportModal(tab) {
  S.importTab = tab || S.importTab || 'brave';
  const isS = S.importTab === 'scalency';
  const r = isS ? await gb.invoke('scalency:list') : await gb.invoke('brave:list');
  const list = (r && r.profiles) || [];
  const tabs = `<div class="seg" style="align-self:flex-start"><span class="${isS ? '' : 'active'}" data-imp="brave">Depuis Brave</span><span class="${isS ? 'active' : ''}" data-imp="scalency">Depuis Scalency</span></div>`;
  const warnTxt = isS
    ? '<b>Ferme Scalency et tous ses profils avant d’importer.</b> Chaque dossier de profil Scalency (Brave) est copié tel quel dans GB : connexion Vinted, cookies, extensions. Scalency n’est pas modifié.'
    : '<b>Ferme complètement Brave avant d’importer</b>, sinon les cookies sont verrouillés. Chaque profil Brave est copié dans un profil GB. Ton Brave d’origine n’est pas modifié.';
  const ov = modal('Importer des profils', `
    ${tabs}
    <div class="notice warn">${warnTxt}</div>
    ${list.length === 0 ? `<div class="empty"><h3>Aucun profil trouvé</h3><div class="mono">${esc(r && r.dir)}</div>${isS ? '<div style="margin-top:6px">Indique le bon dossier dans Paramètres › Import depuis Scalency.</div>' : ''}</div>` : `
    <label class="inline" style="cursor:pointer"><input type="checkbox" id="bi-all" checked> Tout sélectionner (${list.length})</label>
    <div class="check-list">${list.map((p, i) => `<label><input type="checkbox" class="bi" value="${i}" checked>
      <div style="flex:1"><div class="pname">${esc(p.name)}</div><div class="cl-sub">${esc(isS ? p.path : p.dir)}${p.user ? ' · ' + esc(p.user) : ''}</div></div></label>`).join('')}</div>`}
    <div class="hint">Après l’import, GB vérifie dans chaque profil que le compte Vinted est bien connecté (résultat dans le Journal et sur la ligne du profil).</div>
    <div class="hint" id="bi-progress"></div>
  `, list.length ? `<button class="btn" data-close>Annuler</button><button class="btn primary" id="bi-go">${ic('download')}Importer</button>` : '<button class="btn" data-close>Fermer</button>', true);
  $$('[data-imp]', ov).forEach((el) => el.addEventListener('click', () => braveImportModal(el.dataset.imp)));
  if (!list.length) return;
  $('#bi-all', ov).addEventListener('change', (e) => $$('.bi', ov).forEach((c) => { c.checked = e.target.checked; }));
  $('#bi-go', ov).addEventListener('click', async () => {
    const chosen = $$('.bi', ov).filter((c) => c.checked).map((c) => list[+c.value]);
    if (!chosen.length) return toast('Sélectionne au moins un profil', 'err');
    $('#bi-go', ov).disabled = true;
    $('#bi-go', ov).innerHTML = '<span class="spin"></span>Import…';
    const off = gb.on('gb:import-progress', (pr) => { if (!pr.done && $('#bi-progress')) $('#bi-progress').textContent = `Copie ${pr.index + 1}/${pr.total} : ${pr.name}…`; });
    const res = isS ? await gb.invoke('scalency:import', chosen) : await gb.invoke('brave:import', chosen.map((x) => x.dir));
    off();
    closeModal();
    const ok = res.filter((x) => x.ok).length;
    if (ok) toast(`${ok} profil(s) importé(s) — vérification de la connexion Vinted en cours…`, 'ok');
    res.filter((x) => !x.ok).forEach((x) => toast(`${x.name} : ${x.error}`, 'err'));
  });
}

function cookieImportModal(preselect) {
  const ps = [...S.data.profiles].sort((a, b) => a.num - b.num);
  const ov = modal('Importer des connexions', `
    <div class="notice">Importe les cookies d’un compte (export JSON de l’extension <b>Cookie-Editor</b> ou équivalent) dans un profil : le compte Vinted sera connecté à l’ouverture, sans retaper le mot de passe.</div>
    <div class="field"><label>Profil de destination</label>
      <select class="input" id="ci-target"><option value="__new">+ Nouveau profil</option>${ps.map((p) => `<option value="${p.id}" ${preselect === p.id ? 'selected' : ''}>${pcode(p.num)} · ${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field" id="ci-name-wrap" ${preselect ? 'style="display:none"' : ''}><label>Nom du nouveau profil</label><input class="input" id="ci-name" placeholder="ex. juliette579"></div>
    <div class="field"><label>Cookies (JSON)</label>
      <textarea class="input" id="ci-json" style="min-height:150px" placeholder='[{"domain":".vinted.fr","name":"access_token_web","value":"…"}]'></textarea>
      <div class="inline" style="margin-top:8px"><button class="btn sm" id="ci-file">${ic('folder')}Choisir un fichier .json</button><span class="hint" id="ci-info"></span></div></div>
  `, `<button class="btn" data-close>Annuler</button><button class="btn primary" id="ci-go">${ic('upload')}Importer</button>`);
  $('#ci-target', ov).addEventListener('change', (e) => { $('#ci-name-wrap', ov).style.display = e.target.value === '__new' ? '' : 'none'; });
  $('#ci-file', ov).addEventListener('click', async () => {
    const f = await gb.invoke('file:readText', [{ name: 'Cookies', extensions: ['json', 'txt'] }]);
    if (!f) return;
    $('#ci-json', ov).value = f.text;
    $('#ci-info', ov).textContent = f.name;
    if ($('#ci-target', ov).value === '__new' && !$('#ci-name', ov).value) $('#ci-name', ov).value = f.name.replace(/\.(json|txt)$/i, '');
  });
  $('#ci-go', ov).addEventListener('click', async () => {
    const target = $('#ci-target', ov).value;
    const text = $('#ci-json', ov).value.trim();
    if (!text) return toast('Colle les cookies ou choisis un fichier', 'err');
    $('#ci-go', ov).disabled = true;
    $('#ci-go', ov).innerHTML = '<span class="spin"></span>Import…';
    const r = await gb.invoke('profile:importCookies', { id: target === '__new' ? null : target, newName: $('#ci-name', ov).value.trim(), text });
    closeModal();
    if (r && r.ok) toast(`${r.count} cookies importés`, 'ok');
    else toast(`Import impossible : ${(r && r.error) || 'erreur'}`, 'err');
  });
}

function sheetModal(p) {
  const sh = p.sheet || {};
  const h = p.health || {};
  const L = LEVELS[h.level] || LEVELS.critique;
  const rs = [...(p.restrictions || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const lbl = { automatisation: 'Pour automatisation', non_lu: 'Motif non lu', autre: 'Autre motif' };
  const src = { manuel: 'signalée par toi', vinted: 'bandeau Vinted', dotb: 'message Vinted (DotB)' };
  const ov = modal(`Fiche du compte · ${pcode(p.num)} ${esc(p.name)}`, `
    <div class="inline" style="gap:14px"><b style="font-size:30px;color:${L.color}">${h.score ?? '—'}</b><div><span class="pill ${L.cls}">${L.label}</span><div class="hint" style="margin-top:4px">${esc(h.advice || '')}</div></div></div>
    ${(h.factors || []).length ? `<div class="src-list">${h.factors.map((f) => `<span class="pill">${esc(f.label)} − ${f.pts}</span>`).join('')}</div>` : ''}
    <div class="row2">
      <div class="field"><label>Origine du compte</label><select class="input" id="sh-origin"><option value="">Inconnue</option>${Object.entries(ORIGINS).map(([k, v]) => `<option value="${k}" ${sh.origin === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Date de création sur Vinted</label><input class="input" id="sh-created" type="date" value="${esc(sh.createdOn || '')}"></div>
    </div>
    <div class="field"><label>Notes</label><input class="input" id="sh-notes" value="${esc(sh.notes || '')}"></div>
    <label class="inline" style="cursor:pointer"><input type="checkbox" id="sh-closed" ${p.closedByVinted ? 'checked' : ''}> Compte fermé par Vinted</label>
    <div class="field"><label>Restrictions Vinted</label>
      <div class="check-list">${rs.map((r) => `<label style="cursor:default"><div style="flex:1"><b>${lbl[r.motif] || r.motif}</b> · ${new Date(r.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}<div class="cl-sub">${src[r.source] || r.source}${r.liftedAt ? ' · levée le ' + new Date(r.liftedAt).toLocaleDateString('fr-FR') : ''}${r.text ? ' · « ' + esc(r.text.slice(0, 120)) + ' »' : ''}</div></div>
        ${r.liftedAt ? '' : `<button class="btn sm" data-rl="${r.id}">Levée</button>`}<button class="btn sm danger" data-rd="${r.id}">${ic('trash')}</button></label>`).join('') || '<label style="cursor:default"><span class="muted">Aucune restriction enregistrée</span></label>'}</div>
      <div class="inline" style="margin-top:8px"><select class="input" id="sh-rmotif" style="width:200px"><option value="non_lu">Motif non lu</option><option value="automatisation">Pour automatisation</option><option value="autre">Autre motif</option></select>
        <input class="input" id="sh-rdate" type="datetime-local" style="width:210px" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}">
        <button class="btn sm" id="sh-radd">${ic('plus')}Signaler</button></div></div>
    <div class="field"><label>Prudence ${p.prudenceOn ? `— en cours jusqu’à ${new Date(p.prudence.until).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</label>
      <div class="inline"><button class="btn sm" data-ph="24">Prudence 24 h</button><button class="btn sm" data-ph="48">Prudence 48 h</button>${p.prudenceOn ? '<button class="btn sm danger" data-ph="0">Lever la prudence</button>' : ''}</div>
      <div class="hint">Pendant la prudence, GB arrête les automatisations DotB de ce compte et ne les relance pas.</div></div>
  `, `<button class="btn" data-close>Fermer</button><button class="btn primary" id="sh-save">Enregistrer la fiche</button>`, true);
  $('#sh-save', ov).addEventListener('click', async () => {
    await gb.invoke('health:sheet', p.id, { origin: $('#sh-origin', ov).value, createdOn: $('#sh-created', ov).value, notes: $('#sh-notes', ov).value, closedByVinted: $('#sh-closed', ov).checked });
    closeModal(); toast('Fiche enregistrée', 'ok');
  });
  $('#sh-radd', ov).addEventListener('click', async () => {
    const at = $('#sh-rdate', ov).value ? new Date($('#sh-rdate', ov).value).toISOString() : undefined;
    await gb.invoke('health:addRestriction', p.id, { motif: $('#sh-rmotif', ov).value, at });
    closeModal(); sheetModal(prof(p.id));
  });
  $$('[data-rd]', ov).forEach((b) => b.addEventListener('click', async () => { await gb.invoke('health:delRestriction', p.id, b.dataset.rd); closeModal(); sheetModal(prof(p.id)); }));
  $$('[data-rl]', ov).forEach((b) => b.addEventListener('click', async () => { await gb.invoke('health:liftRestriction', p.id, b.dataset.rl); closeModal(); sheetModal(prof(p.id)); }));
  $$('[data-ph]', ov).forEach((b) => b.addEventListener('click', async () => { await gb.invoke('health:prudence', [p.id], +b.dataset.ph); closeModal(); toast(+b.dataset.ph ? `Prudence ${b.dataset.ph} h posée` : 'Prudence levée', 'ok'); }));
}

function linkAccountModal(accId, label) {
  const ps = [...S.data.profiles].sort((a, b) => a.num - b.num);
  const ov = modal(`Lier ${esc(label)} à un profil`, `
    <div class="field"><label>Profil GB</label><select class="input" id="la-p">${ps.map((p) => `<option value="${p.id}">${pcode(p.num)} · ${esc(p.name)}${p.dotbAccountId ? ' (déjà lié)' : ''}</option>`).join('')}</select></div>
  `, `<button class="btn" data-close>Annuler</button><button class="btn primary" id="la-go">Lier</button>`);
  $('#la-go', ov).addEventListener('click', async () => {
    await gb.invoke('profile:update', $('#la-p', ov).value, { dotbAccountId: String(accId), dotbAccountLabel: label });
    closeModal();
    toast('Compte lié', 'ok');
  });
}

// ── Actions ──────────────────────────────────────────
async function openProfiles(ids, opts) {
  const r = await gb.invoke('profile:open', ids, opts);
  if (r && r.errors && r.errors.length) [...new Set(r.errors)].forEach((e) => toast(e, 'err'));
}
const prof = (id) => S.data.profiles.find((p) => p.id === id);
async function saveAccount(markCreated) {
  const v = (id) => $('#' + id).value.trim();
  if (!v('ac-email') && !v('ac-pseudo') && !v('ac-phone')) return toast('Renseigne au moins l’email, le pseudo ou le numéro', 'err');
  const data = { id: S.editAcc || undefined, email: v('ac-email'), phone: v('ac-phone'), pseudo: v('ac-pseudo'), proxy: v('ac-proxy'), notes: v('ac-notes'), password: $('#ac-pass').value || (S.editAcc ? '__keep__' : '') };
  const id = await gb.invoke('acc:save', data);
  if (markCreated) await gb.invoke('acc:created', id, true);
  S.editAcc = null;
  ['ac-email', 'ac-phone', 'ac-pseudo', 'ac-pass', 'ac-proxy', 'ac-notes'].forEach((k) => delete S.drafts[k]);
  ['ac-email', 'ac-phone', 'ac-pseudo', 'ac-pass', 'ac-proxy', 'ac-notes'].forEach((k) => { const el = $('#' + k); if (el) el.value = ''; });
  toast(markCreated ? 'Compte enregistré — prêt dans 24 h' : 'Compte enregistré', 'ok');
}
async function startWarm(ids) {
  const len = { court: '2-3', normal: '5-8', long: '10-15' }[S.data.settings.warmIntensity || 'court'];
  toast(`Warm lancé sur ${ids.length} profil(s) — environ ${len} min chacun. Ne touche pas à la fenêtre du warm.`);
  if (ids.length === 1) {
    const r = await gb.invoke('profile:warm', ids[0]);
    if (r && r.ok) toast(`${pcode(prof(ids[0]).num)} : warm terminé`, 'ok'); else if (r && r.error) toast(r.error, 'err');
  } else {
    await gb.invoke('profile:warmMany', ids);
    toast('Warms terminés', 'ok');
  }
}

const ACTIONS = {
  refresh: () => { refresh(); if (S.data && S.data.settings.hasDotbToken) loadDotb(S.page === 'dotb' ? (DOTB_TABS.find((t) => t.k === S.dotbTab) || DOTB_TABS[0]).ep : '/accounts', true); },
  theme: () => gb.invoke('settings:save', { theme: isLight(S.data) ? 'dark' : 'light' }),

  // Profils
  'new-profile': () => profileModal(null),
  'brave-import': () => braveImportModal(),
  'cookie-import': () => cookieImportModal(null),
  'open-ready': async () => {
    const n = S.data.profiles.filter((p) => p.status === 'ready' && !p.open).length;
    if (!n) return toast('Aucun profil « Ready » fermé à lancer');
    toast(`Lancement de ${n} profil(s) Ready…`);
    const r = await gb.invoke('profile:openReady');
    if (r && r.errors && r.errors.length) [...new Set(r.errors)].forEach((e) => toast(e, 'err'));
  },
  open: (el) => openProfiles([el.dataset.id]),
  close: (el) => gb.invoke('profile:close', [el.dataset.id]),
  'add-tag': (el) => tagPopover(el, prof(el.dataset.id)),
  'rm-tag': (el) => {
    const p = prof(el.dataset.id);
    const t = p.tags[+el.dataset.i];
    if (confirm(`Retirer le tag « ${t} » ?`)) gb.invoke('profile:update', p.id, { tags: p.tags.filter((_, i) => i !== +el.dataset.i) });
  },
  'row-status': (el) => statusMenu(el, [el.dataset.id]),
  'row-menu': (el) => {
    const p = prof(el.dataset.id);
    if (!p) return;
    // Menu court : l'essentiel. Le reste est rangé dans « Plus d'options… » (rien n'a été supprimé).
    const startDotb = { label: 'Démarrer les automatisations DotB', icon: 'bolt', run: async () => {
      if (!p.open) return toast('Ouvre le profil d’abord', 'err');
      toast(`${pcode(p.num)} : démarrage des automatisations DotB…`);
      const r = await gb.invoke('dotb:runAuto', p.id);
      if (r && r.ok) toast('Automatisations DotB : voir le détail dans le Journal', 'ok'); else toast((r && r.error) || 'Erreur', 'err');
    } };
    const more = [
      { header: 'Profil' },
      { label: 'Configurer le proxy', icon: 'globe', run: () => proxyModal(p) },
      { label: 'Vérifier la connexion Vinted', icon: 'check', run: async () => {
        toast(`${pcode(p.num)} : vérification…`);
        const r = await gb.invoke('profile:checkVinted', p.id);
        toast(r ? 'Vinted connecté' : r === false ? 'Vinted non connecté dans ce profil' : 'Vérification impossible', r ? 'ok' : 'err');
      } },
      { label: 'Ouvrir Groupe Barbaray ici', icon: 'home', run: () => gb.invoke('profile:openUrl', p.id, S.data.settings.gbUrl) },
      p.prudenceOn ? { label: 'Lever la prudence', icon: 'check', run: () => gb.invoke('health:prudence', [p.id], 0) } : { label: 'Mettre en prudence 48 h', icon: 'alert', run: () => gb.invoke('health:prudence', [p.id], 48) },
      '-',
      { header: 'Automatisation' },
      { label: `${p.keepAlive ? '✓ ' : ''}Relancer s’il plante`, icon: 'refresh', run: () => gb.invoke('profile:update', p.id, { keepAlive: !p.keepAlive }) },
      { label: `${p.dotbAuto ? '✓ ' : ''}Démarrer DotB à chaque ouverture`, icon: 'bolt', run: () => gb.invoke('profile:update', p.id, { dotbAuto: !p.dotbAuto }) },
      { label: `${p.autoWarm ? '✓ ' : ''}Warm automatique chaque jour`, icon: 'clock', run: () => gb.invoke('profile:update', p.id, { autoWarm: !p.autoWarm }) },
      planDay(p) && planDay(p) <= 7
        ? { label: 'Arrêter le plan de chauffe', icon: 'flame', run: () => gb.invoke('profile:warmPlan', p.id, false) }
        : { label: 'Lancer le plan de chauffe 7 jours', icon: 'flame', run: () => gb.invoke('profile:warmPlan', p.id, true) },
      { label: 'Diagnostic DotB (capture pour Claude)', icon: 'info', run: async () => {
        const r = await gb.invoke('dotb:diagnose', p.id);
        if (r && r.ok) toast('Diagnostic enregistré sur le Bureau, dossier GB-diagnostic-DotB', 'ok'); else toast((r && r.error) || 'Erreur', 'err');
      } },
      '-',
      { header: 'Avancé' },
      { label: 'Ouvrir (forcer)', icon: 'play', run: () => openProfiles([p.id], { force: true }) },
      { label: 'Nouvelle empreinte', icon: 'shield', run: () => { if (confirm('Générer une nouvelle empreinte pour ce profil ?\nÀ éviter sur un compte déjà actif : Vinted verrait « un autre appareil ».')) gb.invoke('profile:newFingerprint', p.id); } },
      ...(p.importSource ? [{ label: 'Recopier les cookies depuis la source', icon: 'download', run: async () => {
        toast(`${pcode(p.num)} : relecture des cookies (ferme Brave / Scalency avant)…`);
        const r = await gb.invoke('profile:recopyCookies', p.id);
        if (r && r.ok) toast(r.logged ? 'Cookies recopiés — Vinted connecté' : 'Cookies recopiés, mais Vinted toujours déconnecté', r.logged ? 'ok' : 'err');
        else toast((r && r.error) || 'Erreur', 'err');
      } }] : []),
      { label: 'Importer des connexions', icon: 'upload', run: () => cookieImportModal(p.id) },
      { label: 'Ouvrir le dossier', icon: 'folder', run: () => gb.invoke('profile:folder', p.id) },
    ];
    openMenu(el, [
      p.open ? { label: 'Fermer', icon: 'square', run: () => gb.invoke('profile:close', [p.id]) }
        : { label: 'Ouvrir', icon: 'play', run: () => openProfiles([p.id]) },
      p.busy && p.busy.startsWith('Warm')
        ? { label: 'Arrêter le warm', icon: 'square', run: () => gb.invoke('profile:warmStop', p.id) }
        : { label: 'Lancer un warm', icon: 'flame', run: () => startWarm([p.id]) },
      startDotb,
      { label: 'Fiche du compte', icon: 'shield', run: () => sheetModal(p) },
      { label: 'Modifier le profil', icon: 'edit', run: () => profileModal(p) },
      { label: 'Plus d’options…', icon: 'dots', run: () => setTimeout(() => openMenu(el, more), 0) },
      '-',
      { label: 'Supprimer', icon: 'trash', danger: true, run: () => {
        if (confirm(`Supprimer ${pcode(p.num)} « ${p.name} » ?\nSes cookies et données seront effacés définitivement.`)) gb.invoke('profile:delete', [p.id]);
      } },
    ]);
  },
  'bulk-open': () => openProfiles([...S.selected]),
  'bulk-close': () => gb.invoke('profile:close', [...S.selected]),
  'bulk-status': (el) => statusMenu(el, [...S.selected]),
  'bulk-delete': () => {
    if (confirm(`Supprimer ${S.selected.size} profil(s) ?\nLeurs cookies et données seront effacés définitivement.`)) {
      gb.invoke('profile:delete', [...S.selected]);
      S.selected.clear();
    }
  },
  'bulk-clear': () => { S.selected.clear(); render(); },
  'bulk-warm': () => startWarm([...S.selected]),
  'bulk-auto': (el) => {
    const ids = [...S.selected];
    const set = (data) => ids.forEach((id) => gb.invoke('profile:update', id, data));
    openMenu(el, [{ header: `${ids.length} profil(s)` },
      { label: 'Activer : relancer s’il plante', icon: 'refresh', run: () => set({ keepAlive: true }) },
      { label: 'Désactiver : relancer s’il plante', run: () => set({ keepAlive: false }) },
      '-',
      { label: 'Activer : DotB à chaque ouverture', icon: 'bolt', run: () => set({ dotbAuto: true }) },
      { label: 'Désactiver : DotB à chaque ouverture', run: () => set({ dotbAuto: false }) },
      '-',
      { label: 'Activer : warm automatique quotidien', icon: 'clock', run: () => set({ autoWarm: true }) },
      { label: 'Désactiver : warm automatique quotidien', run: () => set({ autoWarm: false }) },
      { label: 'Lancer le plan de chauffe 7 jours', icon: 'flame', run: () => ids.forEach((id) => gb.invoke('profile:warmPlan', id, true)) },
    ]);
  },
  'warm-stop': (el) => gb.invoke('profile:warmStop', el.dataset.id),
  'dotb-ext-reinstall': async () => {
    toast('Mise à jour de DotB : désinstallation puis réinstallation…');
    const r = await gb.invoke('dotb:ensureExt');
    if (r && r.ok) toast(`DotB v${r.version} installée — les profils ouverts la prennent à leur prochaine ouverture`, 'ok');
    else toast(`DotB : ${(r && r.error) || 'erreur'}`, 'err');
  },
  'dotb-activity': async (el) => {
    const r = await gb.invoke('dotb:activity', el.dataset.acc);
    if (r && !r.ok) toast(r.error, 'err');
  },
  'dotb-activity-all': async () => {
    const accs = dotbAccounts() || [];
    if (!accs.length) return toast('Aucun compte DotB', 'err');
    gb.invoke('dotb:overview');
    toast(`Analyse de ${accs.length} compte(s) — environ 30 s par compte`);
    for (const a of accs) {
      const r = await gb.invoke('dotb:activity', String(a.id));
      if (r && !r.ok) toast(`${accLabel(a)} : ${r.error}`, 'err');
    }
    toast('Analyse terminée', 'ok');
  },
  'dotb-overview': () => gb.invoke('dotb:overview'),
  'dotb-copy-session': async (el) => {
    const src = $('#dotb-src').value;
    const others = S.data.profiles.filter((p) => p.id !== src).map((p) => p.id);
    if (!others.length) return toast('Il faut au moins 2 profils', 'err');
    if (!confirm(`Copier la connexion DotB de ${pcode(prof(src).num)} vers ${others.length} profil(s) ?`)) return;
    el.disabled = true; el.innerHTML = '<span class="spin"></span>Copie…';
    const r = await gb.invoke('dotb:copySession', src, others);
    render();
    if (r && r.ok) toast(`Session DotB copiée dans ${r.copied} profil(s). Les profils ouverts la prennent après rechargement de DotB.`, 'ok');
    else toast((r && r.error) || 'Erreur', 'err');
  },

  // Proxies
  'proxy-edit': (el) => proxyModal(prof(el.dataset.id)),
  'proxy-test': (el) => gb.invoke('proxy:test', el.dataset.id),
  'proxy-test-all': async () => {
    const n = S.data.profiles.filter((p) => p.px).length;
    if (!n) return toast('Aucun proxy configuré');
    toast(`Test de ${n} proxy(s)…`);
    await gb.invoke('proxy:testAll');
    const off = S.data.profiles.filter((p) => p.px && p.proxyTest && !p.proxyTest.ok).length;
    toast(off ? `${off} proxy(s) hors ligne` : 'Tous les proxies répondent', off ? 'err' : 'ok');
  },
  'proxy-import': proxyImportModal,

  // DotB
  'dotb-save': async () => {
    const t = $('#dotb-token').value.trim();
    if (!t) return toast('Colle un token', 'err');
    await gb.invoke('settings:save', { dotbToken: t });
    delete S.drafts['dotb-token'];
    S.dotb = {};
    toast('Token enregistré', 'ok');
    loadDotb('/accounts', true);
    const tab = DOTB_TABS.find((x) => x.k === S.dotbTab);
    if (tab && tab.ep !== '/accounts') loadDotb(tab.ep, true);
  },
  'dotb-remove': async () => {
    if (!confirm('Retirer le token DotB de GB Browser ?')) return;
    await gb.invoke('settings:save', { dotbToken: '' });
    S.dotb = {};
    render();
  },
  'dotb-reload': () => loadDotb((DOTB_TABS.find((t) => t.k === S.dotbTab) || DOTB_TABS[0]).ep, true),
  'dotb-link': (el) => linkAccountModal(el.dataset.acc, el.dataset.label),

  // Extensions
  'ext-webstore': async (el) => {
    const url = ($('#ext-url').value || '').trim();
    if (!url) return toast('Colle le lien de l’extension', 'err');
    el.disabled = true;
    el.innerHTML = '<span class="spin"></span>Téléchargement…';
    const r = await gb.invoke('ext:addWebstore', url);
    delete S.drafts['ext-url'];
    if (r && r.ok) { toast(`${r.ext.name} ajoutée`, 'ok'); if ($('#ext-url')) $('#ext-url').value = ''; }
    else { toast((r && r.error) || 'Erreur', 'err'); render(); }
  },
  'ext-file': async () => { const r = await gb.invoke('ext:addFile'); if (r && r.ok === false) toast(r.error, 'err'); else if (r) toast('Extension importée', 'ok'); },
  'ext-folder': async () => { const r = await gb.invoke('ext:addFolder'); if (r && r.ok === false) toast(r.error, 'err'); else if (r) toast('Extension importée', 'ok'); },
  'ext-toggle': (el) => gb.invoke('ext:toggle', el.dataset.id),
  'ext-delete': (el) => { if (confirm('Retirer cette extension de tous les profils ?')) gb.invoke('ext:delete', el.dataset.id); },
  'ext-update': async () => { toast('Vérification des mises à jour…'); await gb.invoke('ext:updateAll'); toast('Extensions à jour', 'ok'); },

  // Journal
  'log-copy': async () => { await gb.invoke('log:copy'); toast('Journal copié', 'ok'); },
  'log-clear': () => { if (confirm('Effacer le journal ?')) gb.invoke('log:clear'); },

  // Paramètres
  'pick-browser': async () => { const f = await gb.invoke('settings:pickBrowser'); if (f) { S.drafts['set-browser'] = f; render(); } },
  'pick-profiles': async () => { const f = await gb.invoke('settings:pickFolder'); if (f) { S.drafts['set-profiles'] = f; render(); } },
  'save-browser': async () => {
    const bp = $('#set-browser').value.trim();
    const auto = S.data.browser && !S.data.settings.browserPath && bp === S.data.browser.path;
    await gb.invoke('settings:save', { browserPath: auto ? '' : bp, profilesDir: $('#set-profiles').value.trim() });
    delete S.drafts['set-browser']; delete S.drafts['set-profiles'];
    toast('Navigateur enregistré', 'ok');
  },
  'save-timeout': async () => {
    await gb.invoke('settings:save', { proxyTimeout: $('#set-timeout').value });
    delete S.drafts['set-timeout'];
    toast('Enregistré', 'ok');
  },
  'save-links': async () => {
    const urls = $('#set-starts').value.split(/\r?\n/).map((x) => x.trim()).filter((x) => /^https?:\/\//.test(x));
    const key = $('#set-gbkey').value.trim();
    if (key && !/^gbk_[0-9a-f]{32}_\d+_[\w-]{32}$/.test(key)) return toast('Clé GB Browser invalide : copie-la depuis le site (Comptes & GB Browser)', 'err');
    await gb.invoke('settings:save', { gbUrl: $('#set-gb').value.trim() || 'https://app.groupebarbaray.com', startUrls: urls.length ? urls : ['https://www.vinted.fr/about?d=j#d=j', 'https://www.vinted.fr/'], ...(key ? { gbKey: key } : {}) });
    delete S.drafts['set-gb']; delete S.drafts['set-starts']; delete S.drafts['set-gbkey'];
    toast('Enregistré', 'ok');
    if (key) { const r = await gb.invoke('gb:push'); toast(r.ok ? 'Comptes envoyés au site ✅' : `Envoi impossible : ${r.error}`, r.ok ? 'ok' : 'err'); }
  },
  'gb-push': async () => { const r = await gb.invoke('gb:push'); toast(r.ok ? 'Comptes envoyés au site ✅' : `Envoi impossible : ${r.error}`, r.ok ? 'ok' : 'err'); },
  'open-data': () => gb.invoke('app:openDataDir'),
  'ram-refresh': () => loadRam(),
  'ram-purge': async () => { toast('Libération de la RAM des profils ouverts…'); await gb.invoke('ram:purge'); setTimeout(loadRam, 3000); toast('RAM libérée (onglets Vinted et DotB gardés actifs)', 'ok'); },
  'morning-run': async () => { toast('Contrôle de tous les comptes lancé — quelques minutes'); await gb.invoke('morning:run'); },
  'update-install': () => gb.invoke('update:install'),
  'update-check': async () => { const r = await gb.invoke('update:check'); toast(r.status === 'dev' ? 'Mode développement : la mise à jour automatique marche avec la version installée (.exe)' : r.status === 'latest' ? 'GB Browser est à jour' : r.status === 'error' ? `Erreur : ${r.error}` : 'Vérification lancée'); },
  'save-morning': async () => {
    const hour = Math.max(0, Math.min(23, +$('#set-mhour').value || 8));
    await gb.invoke('settings:save', { morningCheck: { ...(S.data.settings.morningCheck || {}), hour } }); delete S.drafts['set-mhour']; toast('Enregistré', 'ok');
  },
  'tg-morning': () => { const mc = S.data.settings.morningCheck || {}; gb.invoke('settings:save', { morningCheck: { ...mc, enabled: mc.enabled === false } }); },
  'save-pub': async () => {
    const normal = Math.max(1, +$('#set-pubn').value || 40), fragile = Math.max(1, +$('#set-pubf').value || 15);
    await gb.invoke('settings:save', { pubAlert: { normal, fragile } }); delete S.drafts['set-pubn']; delete S.drafts['set-pubf']; toast('Seuils enregistrés', 'ok');
  },
  'h-sheet': (el) => sheetModal(prof(el.dataset.id)),
  'h-prudence': async (el) => { await gb.invoke('health:prudence', [el.dataset.id], +el.dataset.h); toast(`Prudence ${el.dataset.h} h posée : DotB arrêté sur ce compte`, 'ok'); },
  'tg-keep': (el) => gb.invoke('profile:update', el.dataset.id, { keepAlive: !prof(el.dataset.id).keepAlive }),
  'tg-dotbauto': (el) => gb.invoke('profile:update', el.dataset.id, { dotbAuto: !prof(el.dataset.id).dotbAuto }),
  'acc-save': () => saveAccount(false),
  'acc-save-created': () => saveAccount(true),
  'acc-cancel': () => { S.editAcc = null; ['ac-email', 'ac-phone', 'ac-pseudo', 'ac-pass', 'ac-proxy', 'ac-notes'].forEach((k) => delete S.drafts[k]); render(); },
  'acc-created': (el) => gb.invoke('acc:created', el.dataset.id, true),
  'acc-copy': async (el) => { if (!el.dataset.v) return; await gb.invoke('acc:copy', el.dataset.v); toast('Copié', 'ok'); },
  'acc-copy-pass': async (el) => { const pw = await gb.invoke('acc:password', el.dataset.id); await gb.invoke('acc:copy', pw); toast('Mot de passe copié', 'ok'); },
  'acc-add': async (el) => {
    const a = S.data.accounts.find((x) => x.id === el.dataset.id);
    if (a && Date.now() - Date.parse(a.createdAt) < 864e5 && !confirm('Ce compte a moins de 24 h. L’ajouter quand même ?')) return;
    const plan = confirm('Lancer aussi le plan de chauffe 7 jours sur ce profil ? (recommandé)');
    const r = await gb.invoke('acc:addToBrowser', el.dataset.id, { plan });
    if (r && r.ok) toast('Profil créé dans le navigateur', 'ok');
  },
  'acc-menu': (el) => {
    const a = S.data.accounts.find((x) => x.id === el.dataset.id);
    openMenu(el, [
      { label: 'Modifier', icon: 'edit', run: () => { S.editAcc = a.id; ['ac-email', 'ac-phone', 'ac-pseudo', 'ac-pass', 'ac-proxy', 'ac-notes'].forEach((k) => delete S.drafts[k]); render(); } },
      a.createdAt ? { label: 'Remettre « pas encore créé »', icon: 'clock', run: () => gb.invoke('acc:created', a.id, false) } : { label: 'Marquer créé maintenant', icon: 'clock', run: () => gb.invoke('acc:created', a.id, true) },
      '-',
      { label: 'Supprimer', icon: 'trash', danger: true, run: () => { if (confirm(`Supprimer ${a.pseudo || a.email} de la liste ?`)) gb.invoke('acc:delete', a.id); } },
    ]);
  },
  'tg-setting': (el) => gb.invoke('settings:save', { [el.dataset.k]: S.data.settings[el.dataset.k] === false }),
  'save-whours': async () => {
    const from = Math.max(0, Math.min(23, +$('#set-wfrom').value || 0)), to = Math.max(from + 1, Math.min(24, +$('#set-wto').value || 24));
    await gb.invoke('settings:save', { autoWarm: { from, to } }); delete S.drafts['set-wfrom']; delete S.drafts['set-wto']; toast('Plage enregistrée', 'ok');
  },
  'toggle-welcome': () => gb.invoke('settings:save', { closeWelcome: S.data.settings.closeWelcome === false }),
  'pick-scalency': async () => { const f = await gb.invoke('settings:pickFolder'); if (f) { S.drafts['set-scalency'] = f; render(); } },
  'save-scalency': async () => { await gb.invoke('settings:save', { scalencyDir: $('#set-scalency').value.trim() }); delete S.drafts['set-scalency']; toast('Enregistré', 'ok'); },
};

// ── Évènements ───────────────────────────────────────
function goPage(page) {
  S.page = page;
  closeMenu();
  render();
  if (page === 'dotb') loadDotb((DOTB_TABS.find((t) => t.k === S.dotbTab) || DOTB_TABS[0]).ep);
  if (page === 'health') { loadRam(); if (S.data.settings.hasDotbToken) loadDotb('/accounts'); }
}
setInterval(() => { if (S.page === 'health') loadRam(); if (S.page === 'accounts') render(); }, 30000);

document.addEventListener('click', (e) => {
  const inMenu = e.target.closest('.menu');
  const opener = e.target.closest('[data-act="row-menu"],[data-act="bulk-status"],[data-act="row-status"],[data-act="add-tag"],[data-act="bulk-auto"],[data-act="acc-menu"]');
  if (!inMenu && !opener) closeMenu();

  const nav = e.target.closest('.nav-item');
  if (nav) return goPage(nav.dataset.page);
  const go = e.target.closest('[data-go]');
  if (go) return goPage(go.dataset.go);
  const ext = e.target.closest('[data-ext]');
  if (ext) return gb.invoke('app:openExternal', ext.dataset.ext);
  const f = e.target.closest('[data-filter]');
  if (f) { S.filter = f.dataset.filter; return render(); }
  const pf = e.target.closest('[data-pfilter]');
  if (pf) { S.proxyFilter = pf.dataset.pfilter; return render(); }
  const lf = e.target.closest('[data-lfilter]');
  if (lf) { S.logFilter = lf.dataset.lfilter; return render(); }
  const dt = e.target.closest('[data-dtab]');
  if (dt) { S.dotbTab = dt.dataset.dtab; render(); return loadDotb(DOTB_TABS.find((t) => t.k === S.dotbTab).ep); }
  const hf = e.target.closest('[data-hfilter]');
  if (hf) { S.healthFilter = hf.dataset.hfilter; return render(); }
  const ht = e.target.closest('[data-htab]');
  if (ht) { S.healthTab = ht.dataset.htab; if (S.healthTab === 'tech') loadRam(); return render(); }
  const wm = e.target.closest('[data-warm]');
  if (wm) return gb.invoke('settings:save', { warmIntensity: wm.dataset.warm });
  const th = e.target.closest('[data-theme]');
  if (th) return gb.invoke('settings:save', { theme: th.dataset.theme });
  const act = e.target.closest('[data-act]');
  if (act && !act.disabled && ACTIONS[act.dataset.act]) ACTIONS[act.dataset.act](act);
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'sel-all') {
    const list = filteredProfiles();
    list.forEach((p) => (e.target.checked ? S.selected.add(p.id) : S.selected.delete(p.id)));
    render();
  } else if (e.target.dataset.sel) {
    if (e.target.checked) S.selected.add(e.target.dataset.sel);
    else S.selected.delete(e.target.dataset.sel);
    render();
  }
});

document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'search') { S.search = e.target.value; return render(); }
  if (id === 'proxy-search') { S.proxySearch = e.target.value; return render(); }
  if (id === 'log-search') { S.logSearch = e.target.value; return render(); }
  if (id === 'health-search') { S.healthSearch = e.target.value; return render(); }
  if (id && $('#main').contains(e.target)) S.drafts[id] = e.target.value;
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    const target = { profiles: 'search', proxies: 'proxy-search', journal: 'log-search' }[S.page];
    if (!target) goPage('profiles');
    const s = $('#' + (target || 'search'));
    if (s) s.focus();
  }
  if (e.key === 'Enter' && e.target.id === 'ext-url') ACTIONS['ext-webstore']($('#ext-add-btn'));
  if (e.key === 'Escape') { closeMenu(); closeModal(); }
});

document.addEventListener('dblclick', (e) => {
  const row = e.target.closest('[data-row]');
  if (row && !e.target.closest('button,input,.more,.addtag,.tag,.status-click')) profileModal(prof(row.dataset.row));
});

$('#open-gb').addEventListener('click', () => gb.invoke('app:openExternal', S.data ? S.data.settings.gbUrl : 'https://app.groupebarbaray.com'));
$$('[data-icon]').forEach((el) => { el.innerHTML = ic(el.dataset.icon); });

// ── Init ─────────────────────────────────────────────
refresh().then(() => { if (S.data.settings.hasDotbToken) loadDotb('/accounts'); });
setInterval(() => { if (S.data && S.data.settings.hasDotbToken) loadDotb('/accounts', true); }, 120000);
