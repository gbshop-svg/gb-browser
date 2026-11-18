// GB Browser — gestionnaire de profils (chaque profil = un Brave isolé)
const { app, BrowserWindow, ipcMain, dialog, shell, net, clipboard, nativeTheme, Notification, screen, safeStorage } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const browsers = require('./browsers');
const proxy = require('./proxy');
const exts = require('./extensions');
const { CDP } = require('./cdp');
const warm = require('./warm');
const FP = require('./fingerprint');
const { Guardian } = require('./guardian');
const dotbauto = require('./dotbauto');
const winicon = require('./winicon');

app.disableHardwareAcceleration();

// Dossier de données fixe (le même en mode « start.bat » et une fois installé en .exe)
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'gb-browser'));

// Fichiers à passer à Brave : hors de l'archive app.asar une fois installé
const assetPath = (...p) => path.join(__dirname, '../../assets', ...p).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── Dossiers ──────────────────────────────────────────
const DATA_DIR = path.join(app.getPath('userData'), 'GBBrowser');
const DEFAULT_PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const EXT_DIR = path.join(DATA_DIR, 'extensions');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const LOG_FILE = path.join(app.getPath('userData'), 'gb-debug.log');
[DATA_DIR, DEFAULT_PROFILES_DIR, EXT_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const BASE_PORT = 10000;
const DOTB_API = 'https://dotb.io/api/public/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

// ── Journal ───────────────────────────────────────────
let logs = [];
function log(msg, level = 'info') {
  const entry = { t: new Date().toISOString(), level, msg };
  logs.push(entry);
  if (logs.length > 1000) logs.shift();
  try { fs.appendFileSync(LOG_FILE, `${entry.t} | ${level} | ${msg}\n`); } catch {}
  send('gb:log', entry);
}

// ── Stockage ──────────────────────────────────────────
const DEFAULT_SETTINGS = {
  browserPath: '',
  profilesDir: DEFAULT_PROFILES_DIR,
  startUrl: 'https://www.vinted.fr',
  startUrls: ['https://www.vinted.fr/about?d=j#d=j', 'https://www.vinted.fr/'],
  gbUrl: 'https://app.groupebarbaray.com',
  dotbToken: '',
  theme: 'dark',
  proxyTimeout: 8,
  warmIntensity: 'court',
  closeWelcome: true,
  scalencyDir: process.platform === 'win32' ? 'C:\\Profiles' : '',
  fpEnabled: true,
  notify: true,
  ecoRam: true,
  allow3pCookies: true,
  memorySaver: true,
  autoUpdate: true,
  morningCheck: { enabled: true, hour: 8 },
  autoStart: true,          // GB Browser se lance avec Windows et rouvre les profils
  nightlyRestart: true,
  nightShein: true,         // 00h–07h : comptes Vinted fermés, profil « Sourcing SHEIN » ouvert (si un profil est marqué Sourcing)
  autoRaise: true,
  dotbRange: '2h',          // messages / likes traités par DotB : new | 2h | 24h | 3d | 7d          // monte le prix des annonces Vinted en ligne quand SHEIN augmente (8h–21h)     // redémarrage des profils ouverts chaque nuit vers 4 h (RAM)
  pubAlert: { normal: 40, fragile: 15 },
  autoPrudence: true,
  autoWarm: { from: 9, to: 21 },
};

function newProfileObj(num, data = {}, dir) {
  const id = crypto.randomBytes(6).toString('hex');
  return {
    id,
    num,
    name: data.name || `Profil ${num}`,
    notes: data.notes || '',
    tags: data.tags || [],
    status: data.status || 'none',
    proxy: data.proxy || '',
    proxyTest: null,
    dotbAccountId: data.dotbAccountId || null,
    dotbAccountLabel: data.dotbAccountLabel || '',
    startUrl: data.startUrl || '',
    keepAlive: !!data.keepAlive,
    dotbAuto: !!data.dotbAuto,
    autoWarm: !!data.autoWarm,
    dir: dir || path.join(store ? store.settings.profilesDir : DEFAULT_PROFILES_DIR, `P${String(num).padStart(3, '0')}-${id}`),
    createdAt: new Date().toISOString(),
    lastOpened: null,
  };
}

let store = null;
function loadStore() {
  let s = null;
  try { s = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch {}
  if (!s) s = { counter: 0, profiles: [], extensions: [], settings: {} };
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  // 2.8.5 : le warm « court » devient le réglage par défaut (une seule fois, l'utilisateur peut rechanger)
  if (!s.settings.warmCourtV285) { s.settings.warmIntensity = 'court'; s.settings.warmCourtV285 = true; }
  s.extensions = s.extensions || [];
  // Migration v2.0 : réserve de proxies -> proxy par profil
  const pool = s.proxies || [];
  for (const p of s.profiles) {
    if (p.proxyId) {
      const px = pool.find((x) => x.id === p.proxyId);
      p.proxy = px ? px.raw : '';
      delete p.proxyId;
    }
    if (!p.dir) p.dir = path.join(DEFAULT_PROFILES_DIR, p.id);
    if (p.proxyTest === undefined) p.proxyTest = null;
  }
  delete s.proxies;
  return s;
}
store = loadStore();

function save() {
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_FILE);
}
save();

const portOf = (p) => BASE_PORT + p.num;
const findProfile = (id) => store.profiles.find((p) => p.id === id);
const pcode = (p) => 'P' + String(p.num).padStart(3, '0');

// ── État partagé avec l'interface ─────────────────────
let mainWindow = null;
const openSet = new Set();
const launching = new Set();
const busy = new Map();       // id -> texte (warm, import…)
const running = new Map();    // id -> { child, relay }

function send(ch, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data);
}

function publicState() {
  const b = browsers.detect(store.settings.browserPath);
  const { dotbToken, gbKey, ...settings } = store.settings;
  return {
    profiles: store.profiles.map((p) => {
      const px = proxy.parseProxy(p.proxy);
      return {
        ...p,
        port: portOf(p),
        open: openSet.has(p.id),
        launching: launching.has(p.id),
        busy: busy.get(p.id) || '',
        px: px ? { scheme: px.scheme, host: px.host, port: px.port, user: px.user, auth: px.auth, label: proxy.label(px) } : null,
        relay: !!(running.get(p.id) && running.get(p.id).relay),
        health: computeHealth(p),
        shared: (() => { const x = sharedWith(p); return { ip: x.ip, ipWith: x.ipShared.map((q) => pcode(q)), fpWith: x.fpShared.map((q) => pcode(q)) }; })(),
        pubToday: p.dotbAccountId ? pubToday(p) : null,
        prudenceOn: prudenceActive(p),
      };
    }),
    extensions: store.extensions,
    dotbExtId: DOTB_EXT_ID,
    accounts: (store.accounts || []).map(({ password, ...a }) => ({ ...a, hasPassword: !!password })),
    planDays: PLAN_DAYS,
    reports: (store.reports || []).slice(-7),
    realIp,
    update: updateState,
    morningRunning,
    dotbInstalling,
    dotbActivity: store.dotbActivity || {},
    dotbOverview: store.dotbOverview || null,
    settings: { ...settings, hasDotbToken: !!dotbToken, hasGbKey: !!gbKey, gbLink: gbLinkState, systemDark: nativeTheme.shouldUseDarkColors },
    browser: b,
    relays: [...running.values()].filter((r) => r.relay).length,
    logs,
    dataDir: DATA_DIR,
    version: app.getVersion(),
  };
}
let bcTimer = null;
const broadcast = () => {
  if (bcTimer) return;
  bcTimer = setTimeout(() => { bcTimer = null; send('gb:state', publicState()); }, 30);
};

// ── Détection des profils ouverts ─────────────────────
function portAlive(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 600 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitAlive(port, ms = 25000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await portAlive(port)) return true;
    await sleep(500);
  }
  return false;
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    let changed = false;
    await Promise.all(store.profiles.map(async (p) => {
      const alive = await portAlive(portOf(p));
      if (alive && !openSet.has(p.id)) {
        openSet.add(p.id); launching.delete(p.id); changed = true;
        // Profil ouvert (même avant cette version) : mémorisé pour être rouvert au démarrage de Windows
        if (!noDotbSessions.has(p.id) && !headlessIds.has(p.id) && !(store.keepOpen || []).includes(p.id)) { store.keepOpen = [...(store.keepOpen || []), p.id]; save(); }
      }
      if (!alive && openSet.has(p.id)) {
        openSet.delete(p.id);
        changed = true;
        const r = running.get(p.id);
        if (r && r.relay) r.relay.stop();
        running.delete(p.id);
        if (visible.has(p.id)) log(`${pcode(p)} fermé`);
        onProfileGone(p.id).catch(() => {});
      }
    }));
    if (changed) broadcast();
  } finally { polling = false; }
}

// ── Lancement d'un profil ─────────────────────────────
function buildArgs(p, extra = [], { disableFeatures = [], locale } = {}) {
  const loc = locale || FP.localeFor('FR');
  const feats = [...disableFeatures];
  const eco = store.settings.ecoRam !== false ? [
    '--process-per-site',                       // un seul processus par site (gros gain de RAM)
    '--disk-cache-size=104857600',              // cache disque limité à 100 Mo
    '--disable-background-timer-throttling=false',
  ].filter((a) => !a.endsWith('=false')) : [];
  if (store.settings.ecoRam !== false) feats.push('Translate', 'MediaRouter', 'OptimizationHints', 'OptimizationGuideModelDownloading', 'AutofillServerCommunication');
  return [
    `--user-data-dir=${p.dir}`,
    `--remote-debugging-port=${portOf(p)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    `--lang=${loc.lang}`,
    `--accept-lang=${loc.accept}`,
    ...eco,
    ...(feats.length ? [`--disable-features=${[...new Set(feats)].join(',')}`] : []),
    ...extra,
  ];
}

// ── Empreinte : générée une fois par profil, cohérente avec le vrai PC ──
let realHw = null;
async function realHardware() {
  if (realHw) return realHw;
  const d = screen.getPrimaryDisplay();
  let vendor = 'intel';
  try {
    const info = await app.getGPUInfo('basic');
    const dev = (info.gpuDevice || []).find((g) => g.active) || (info.gpuDevice || [])[0];
    if (dev) vendor = FP.vendorFromId(dev.vendorId);
  } catch {}
  realHw = {
    width: Math.round(d.size.width * d.scaleFactor) >= d.size.width ? d.size.width : d.size.width,
    height: d.size.height,
    gpuVendor: vendor,
    cores: os.cpus().length,
  };
  return realHw;
}
async function ensureFingerprint(p) {
  if (p.fp && p.fp.v === 1) return p.fp;
  p.fp = FP.generate(p.id + ':' + p.createdAt, await realHardware());
  save();
  log(`${pcode(p)} : empreinte créée — écran ${p.fp.screen.width}×${p.fp.screen.height}, ${p.fp.cores} cœurs, ${p.fp.memory} Go, ${p.fp.gpu.renderer.replace(/^ANGLE \(|, D3D11\)$/g, '').split(',')[1] || ''}`.trim());
  return p.fp;
}

// ── Notifications Windows ─────────────────────────────
function notify(title, body) {
  if (store.settings.notify === false) return;
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, icon: assetPath('icon.png') });
    n.on('click', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
    n.show();
  } catch {}
}

// N'ouvre que les pages demandées : pas de restauration de l'ancienne session (about:blank, warm…)
function prepareSession(p) {
  const prof = path.join(p.dir, 'Default');
  try {
    for (const f of ['Sessions', 'Current Session', 'Current Tabs', 'Last Session', 'Last Tabs']) {
      fs.rmSync(path.join(prof, f), { recursive: true, force: true });
    }
    const prefFile = path.join(prof, 'Preferences');
    fs.mkdirSync(prof, { recursive: true });
    let prefs = {};
    if (fs.existsSync(prefFile)) prefs = JSON.parse(fs.readFileSync(prefFile, 'utf8'));
    prefs.session = { ...(prefs.session || {}), restore_on_startup: 5 };
    prefs.profile = prefs.profile || {};
    prefs.profile.exit_type = 'Normal';
    prefs.profile.exited_cleanly = true;
    if (store.settings.allow3pCookies !== false) {
      // Autorise les cookies tiers (Brave/Chrome les bloquent par défaut) : le warm en récolte plus
      prefs.profile.cookie_controls_mode = 0;
      prefs.profile.block_third_party_cookies = false;
      prefs.profile.default_content_setting_values = { ...(prefs.profile.default_content_setting_values || {}), cookies: 1 };
    }
    // Boucliers Brave coupés sur Vinted (et DotB) : la page se comporte comme chez un utilisateur normal,
    // et Brave ne brouille pas l'empreinte que GB applique déjà. Ils restent actifs sur les autres sites (warm).
    if (store.settings.shieldsOffVinted !== false) {
      const cs = prefs.profile.content_settings = prefs.profile.content_settings || {};
      const ex = cs.exceptions = cs.exceptions || {};
      const sh = ex.braveShields = ex.braveShields || {};
      const now = String(Date.now() * 1000 + 11644473600000000);
      for (const host of ['www.vinted.fr', 'vinted.fr', 'dotb.io', 'www.dotb.io']) sh[`*://${host}/*,*`] = { last_modified: now, setting: 2 };
    }
    // Boucliers coupés partout (option) : Brave se comporte comme un navigateur classique, rien n'est bloqué
    // (cookies, pubs, mesures d'audience) — le warm récolte un maximum de cookies.
    {
      const cs = prefs.profile.content_settings = prefs.profile.content_settings || {};
      const ex = cs.exceptions = cs.exceptions || {};
      const sh = ex.braveShields = ex.braveShields || {};
      if (store.settings.shieldsOffAll !== false) sh['*,*'] = { last_modified: String(Date.now() * 1000 + 11644473600000000), setting: 2 };
      else delete sh['*,*'];
    }
    // Économiseur de mémoire de Brave : met en veille les onglets inactifs (sauf Vinted et DotB, protégés par l'extension GB)
    const ms = store.settings.memorySaver !== false ? 1 : 0;
    prefs.performance_tuning = {
      ...(prefs.performance_tuning || {}),
      high_efficiency_mode: { ...((prefs.performance_tuning || {}).high_efficiency_mode || {}), state: ms },
      memory_saver_mode: { ...((prefs.performance_tuning || {}).memory_saver_mode || {}), state: ms },
    };
    fs.writeFileSync(prefFile, JSON.stringify(prefs));
  } catch (e) { log(`${pcode(p)} : préparation de session — ${e.message}`, 'warn'); }
}

const headlessIds = new Set(); // lancements invisibles (import, vérification) : jamais rouverts au démarrage
const noDotbSessions = new Set(); // profils ouverts par le warm : sans DotB (sinon DotB et le warm se gênent)
async function openProfile(id, { force = false, url = null, headless = false, noDotb = false } = {}) {
  const p = findProfile(id);
  if (!p) return { ok: false, error: 'Profil introuvable' };
  if (!force && (openSet.has(id) || launching.has(id))) return { ok: true };

  const b = browsers.detect(store.settings.browserPath);
  if (!b) {
    log('Brave introuvable — indique le chemin de brave.exe dans Paramètres', 'error');
    return { ok: false, error: 'Brave introuvable. Installe Brave ou indique le chemin de brave.exe dans Paramètres.' };
  }

  if (force) {
    log(`${pcode(p)} : ouverture forcée (fermeture des processus restants, suppression des verrous)`, 'warn');
    await closeProfile(id, { quiet: true });
    await browsers.killByUserDataDir(p.dir);
    await sleep(800);
    browsers.removeLocks(p.dir);
  }

  fs.mkdirSync(p.dir, { recursive: true });
  const extra = [];

  // Proxy
  let relay = null;
  const parsed = proxy.parseProxy(p.proxy);
  if (p.proxy && !parsed) return { ok: false, error: `${pcode(p)} : proxy illisible (${p.proxy})` };
  if (parsed) {
    if (parsed.auth) {
      try { relay = await proxy.startRelay(parsed); } catch (e) { return { ok: false, error: `Relais proxy impossible : ${e.message}` }; }
      extra.push(`--proxy-server=http://127.0.0.1:${relay.port}`);
    } else {
      extra.push(`--proxy-server=${parsed.scheme}://${parsed.host}:${parsed.port}`);
    }
    extra.push('--proxy-bypass-list=<-loopback>');
    extra.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
  }

  // Extensions
  const disableFeatures = [];
  if (p.sourcing) noDotb = true; // profil Sourcing SHEIN : pas de DotB
  if (noDotb) noDotbSessions.add(id); else noDotbSessions.delete(id);
  if (headless) headlessIds.add(id); else headlessIds.delete(id);
  const extPaths = store.extensions.filter((e) => e.enabled && fs.existsSync(e.path) && !(noDotb && e.webstoreId === DOTB_EXT_ID) && (!e.gbSourcing || p.sourcing)).map((e) => e.path);
  if (store.settings.memorySaver !== false && !headless) extPaths.push(assetPath('gb-helper'));
  if (extPaths.length) {
    extra.push(`--load-extension=${extPaths.join(',')}`);
    disableFeatures.push('DisableLoadExtensionCommandLineSwitch');
  }

  // Langue alignée sur le pays du proxy (testé si besoin)
  if (parsed && !headless) {
    const t = p.proxyTest;
    if (!t || !t.ok || !t.timezone || Date.now() - Date.parse(t.at || 0) > 12 * 3600e3) {
      const res = await proxy.testProxy(parsed, store.settings.proxyTimeout);
      p.proxyTest = { ...res, at: new Date().toISOString() };
      recordIp(p, res);
      save();
      if (!res.ok) {
        log(`${pcode(p)} : proxy hors ligne (${res.error}) — le profil s’ouvre quand même mais n’aura pas Internet`, 'warn');
        notify('Proxy hors ligne', `${pcode(p)} ${p.name} : ${res.error}`);
      }
    }
  }
  const geo = parsed && p.proxyTest && p.proxyTest.ok ? p.proxyTest : null;
  const locale = FP.localeFor(geo ? geo.countryCode : 'FR');

  // Pages à ouvrir : ouvertes par GB après la mise en place de l'empreinte
  // Profil Sourcing SHEIN : il s'ouvre sur SHEIN, jamais sur Vinted
  const pages = url ? [url] : p.startUrl ? [p.startUrl] : p.sourcing ? ['https://fr.shein.com/']
    : ((store.settings.startUrls && store.settings.startUrls.length) ? store.settings.startUrls : [store.settings.startUrl || 'https://www.vinted.fr/']);
  if (headless) { extra.push('--headless=new'); extra.push(url || 'about:blank'); }
  else { extra.push('about:blank'); prepareSession(p); }

  launching.add(id);
  broadcast();
  if (!headless) log(`${pcode(p)} ${p.name} : ouverture (${b.name}, port ${portOf(p)}${parsed ? ', proxy ' + proxy.label(parsed) : ', IP réelle'})`);

  let child;
  try {
    child = spawn(b.path, buildArgs(p, extra, { disableFeatures, locale }), { detached: false, stdio: 'ignore' });
  } catch (e) {
    launching.delete(id);
    if (relay) relay.stop();
    broadcast();
    log(`${pcode(p)} : échec du lancement — ${e.message}`, 'error');
    return { ok: false, error: e.message };
  }
  child.on('error', (e) => {
    launching.delete(id);
    log(`${pcode(p)} : échec du lancement — ${e.message}`, 'error');
    broadcast();
  });
  running.set(id, { child, relay });
  if (!headless && !noDotb && !(store.keepOpen || []).includes(id)) { store.keepOpen = [...(store.keepOpen || []), id]; save(); }
  if (!headless) {
    child.on('exit', (code, signal) => { lastExit.set(id, { code, signal, at: Date.now() }); });
    p.lastOpened = new Date().toISOString();
    save();
    visible.add(id);
    userClosed.delete(id);
    afterLaunch(id, pages, geo).catch((e) => log(`${pcode(p)} : démarrage — ${e.message}`, 'warn'));
    [3000, 8000, 20000].forEach((ms) => setTimeout(() => applyTaskbarIcon(id).catch(() => {}), ms));
  }

  setTimeout(() => { if (launching.delete(id)) broadcast(); }, 20000);
  if (!headless) {
    guardWelcomeTabs(id).catch(() => {});
    setTimeout(() => refreshVinted(id), 12000);
    setTimeout(() => refreshVinted(id), 40000);
  }
  setTimeout(poll, 1500);
  setTimeout(poll, 4000);
  return { ok: true };
}

const guardians = new Map();   // id -> Guardian
const visible = new Set();     // profils ouverts avec fenêtre (pas les lancements en arrière-plan)
const userClosed = new Set();  // fermetures demandées (pas des plantages)
const crashLog = new Map();    // id -> [horodatages des relances]
const lastExit = new Map();
const managedTargets = new Set(); // onglets ouverts par GB : jamais fermés par le nettoyage des pages de bienvenue    // id -> { code, signal } du processus Brave lancé par GB

// ── Icône Vinted dans la barre des tâches (Windows) : un groupe par profil, logo Vinted + nom du profil ──
let vintedIco = null;
async function iconFile() {
  if (vintedIco && fs.existsSync(vintedIco)) return vintedIco;
  const dest = path.join(app.getPath('userData'), 'icons', 'vinted.ico');
  vintedIco = await winicon.fetchIcon('https://www.vinted.fr/favicon.ico', dest)
    || await winicon.fetchIcon('https://www.vinted.fr/apple-touch-icon.png', dest)
    || (fs.existsSync(assetPath('icon.ico')) ? assetPath('icon.ico') : null);
  return vintedIco;
}
async function applyTaskbarIcon(id) {
  if (process.platform !== 'win32') return;
  const p = findProfile(id), r = running.get(id);
  if (!p || !r || !r.child || !r.child.pid) return;
  // Profil Sourcing SHEIN : son propre logo (loupe + étiquette), même si le logo Vinted est désactivé
  const srcIco = p.sourcing && fs.existsSync(assetPath('sourcing.ico')) ? assetPath('sourcing.ico') : null;
  if (!srcIco && store.settings.vintedIcon === false) return;
  const ico = srcIco || await iconFile();
  if (!ico) return;
  const b = browsers.detect(store.settings.browserPath);
  winicon.apply(r.child.pid, { ico, appId: `GB.Profil.${p.num}`, name: `${pcode(p)} ${p.name}`, cmd: b && b.path ? `"${b.path}" --user-data-dir="${p.dir}"` : '' });
}

async function afterLaunch(id, pages, geo) {
  const p = findProfile(id);
  if (!(await waitAlive(portOf(p), 30000))) throw new Error('le navigateur ne répond pas');
  // 1) Empreinte + fuseau horaire, appliqués avant toute page
  if (store.settings.fpEnabled !== false) {
    const fp = await ensureFingerprint(p);
    try {
      const g = await new Guardian(portOf(p), { script: FP.injectionScript(fp), timezone: geo && geo.timezone }).start();
      guardians.set(id, g);
    } catch (e) { log(`${pcode(p)} : empreinte non appliquée — ${e.message}`, 'warn'); }
  }
  // 2) Ouverture des pages de démarrage dans des onglets créés par GB,
  //    puis fermeture des onglets vides restants (about:blank, nouvel onglet…)
  const c = await CDP.forPort(portOf(p));
  try {
    const mine = new Set();
    for (const u of pages) {
      const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
      mine.add(targetId);
      managedTargets.add(targetId);
      const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
      await c.send('Page.navigate', { url: u }, sessionId).catch(() => {});
      await c.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    }
    const cleanup = async () => {
      const { targetInfos } = await c.send('Target.getTargets');
      const pagesNow = targetInfos.filter((t) => t.type === 'page');
      if (!pagesNow.some((t) => mine.has(t.targetId))) return;
      for (const t of pagesNow) {
        if (mine.has(t.targetId)) continue;
        if (/^(about:blank|chrome:\/\/newtab|brave:\/\/newtab|chrome:\/\/new-tab-page|chrome-search:)/.test(t.url || '') || !t.url) {
          await c.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
        }
      }
    };
    await sleep(2500); await cleanup();
    await sleep(6000); await cleanup();
  } finally { c.close(); }
  // 3) Automatisations DotB
  if (p.dotbAuto && !noDotbSessions.has(id)) setTimeout(() => runDotbAuto(id).catch(() => {}), 15000);
}

async function runDotbAuto(id, { force = false } = {}) {
  const p = findProfile(id);
  if (!p || !(await portAlive(portOf(p)))) return { ok: false, error: 'Profil fermé' };
  if (prudenceActive(p) && !force) {
    log(`${pcode(p)} : en prudence jusqu’à ${new Date(p.prudence.until).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} — automatisations DotB non relancées`, 'warn');
    return { ok: false, error: 'Compte en prudence : automatisations DotB en pause' };
  }
  if (!store.extensions.find((e) => e.webstoreId === DOTB_EXT_ID && e.enabled)) return { ok: false, error: 'Extension DotB non installée ou désactivée' };
  if (noDotbSessions.has(id)) return { ok: false, error: 'Profil ouvert pour le warm (sans DotB) : rouvre-le pour lancer DotB' };
  if (String(busy.get(id) || '').startsWith('Warm')) {
    // Un warm tourne dans ce profil : DotB démarre juste après (sinon les deux se battent pour l'onglet actif).
    log(`${pcode(p)} : DotB démarrera à la fin du warm`, 'info');
    const t = setInterval(() => { if (!String(busy.get(id) || '').startsWith('Warm')) { clearInterval(t); runDotbAuto(id, { force }).catch(() => {}); } }, 30000);
    return { ok: true, deferred: true };
  }
  busy.set(id, 'Démarrage DotB…');
  broadcast();
  const c = await CDP.forPort(portOf(p));
  try {
    const res = await dotbauto.startAutomations(c, { log: (m) => log(`${pcode(p)} DotB · ${m}`, 'warn'), range: store.settings.dotbRange || '2h' });
    const txt = Object.entries(res).map(([k, v]) => `${{ likes: 'Likes', agent: 'Smart Agent', orders: 'Commandes', bridge: 'Bridge' }[k]} : ${v}`).join(' · ');
    const bad = Object.values(res).some((v) => !/démarré|déjà actif/.test(v));
    log(`${pcode(p)} automatisations DotB — ${txt}`, bad ? 'warn' : 'success');
    if (bad) notify('DotB : démarrage incomplet', `${pcode(p)} ${p.name} — ${txt}`);
    p.dotbStartedAt = new Date().toISOString();
    save();
    return { ok: true, res };
  } catch (e) {
    log(`${pcode(p)} : démarrage DotB impossible — ${e.message}`, 'error');
    notify('DotB ne démarre pas', `${pcode(p)} ${p.name} : ${e.message}`);
    return { ok: false, error: e.message };
  } finally {
    c.close();
    busy.delete(id);
    broadcast();
  }
}

// Brave écrit exit_type = "Crashed" pendant qu'il tourne et "Normal" à une fermeture propre
function exitedCleanly(p) {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(p.dir, 'Default', 'Preferences'), 'utf8'));
    return prefs.profile && prefs.profile.exit_type === 'Normal';
  } catch { return true; }
}

async function onProfileGone(id) {
  const p = findProfile(id);
  const g = guardians.get(id);
  if (g) { g.stop(); guardians.delete(id); }
  if (!p || !visible.has(id)) return;
  visible.delete(id);
  if (userClosed.has(id)) return;
  await sleep(2500);
  // Plantage = code de sortie anormal du processus Brave (ou exit_type « Crashed » si GB ne l'a pas lancé)
  const ex = lastExit.get(id);
  const crashed = ex ? (ex.signal != null || (ex.code != null && ex.code !== 0)) : !exitedCleanly(p);
  lastExit.delete(id);
  if (!crashed) return; // fermé à la main dans Brave
  log(`${pcode(p)} ${p.name} : Brave a planté`, 'error');
  if (!p.keepAlive) { notify('Profil planté', `${pcode(p)} ${p.name} s’est fermé de façon inattendue.`); return; }
  const recent = (crashLog.get(id) || []).filter((t) => Date.now() - t < 15 * 60e3);
  if (recent.length >= 3) {
    log(`${pcode(p)} : 3 plantages en 15 min — relance automatique suspendue`, 'error');
    notify('Relance suspendue', `${pcode(p)} ${p.name} a planté 3 fois en 15 minutes.`);
    return;
  }
  crashLog.set(id, [...recent, Date.now()]);
  notify('Profil relancé', `${pcode(p)} ${p.name} a planté : réouverture${p.dotbAuto ? ' et relance de DotB' : ''}.`);
  await sleep(5000);
  browsers.removeLocks(p.dir);
  const r = await openProfile(id);
  log(r.ok ? `${pcode(p)} : relancé après plantage` : `${pcode(p)} : relance impossible — ${r.error}`, r.ok ? 'success' : 'error');
}

// Fermeture propre via DevTools (les cookies sont bien enregistrés), sinon fermeture forcée
async function closeProfile(id, { quiet = false, keepInList = false } = {}) {
  const p = findProfile(id);
  if (!p) return;
  userClosed.add(id);
  if (!keepInList && (store.keepOpen || []).includes(id)) { store.keepOpen = store.keepOpen.filter((x) => x !== id); save(); }
  let closed = false;
  if (await portAlive(portOf(p))) {
    try {
      const c = await CDP.forPort(portOf(p));
      await c.send('Browser.close', {}, null, 5000).catch(() => {});
      c.close();
      for (let i = 0; i < 16 && !closed; i++) { await sleep(300); closed = !(await portAlive(portOf(p))); }
    } catch {}
  }
  if (!closed) {
    const r = running.get(id);
    if (r && r.child && r.child.exitCode === null) { try { r.child.kill(); } catch {} }
    await browsers.killByUserDataDir(p.dir);
  }
  const r = running.get(id);
  if (r && r.relay) r.relay.stop();
  running.delete(id);
  if (!quiet) log(`${pcode(p)} ${p.name} : fermé`);
  setTimeout(poll, 500);
}

// ── Warm : navigation humaine (Google, leboncoin, Wikipédia, sites FR) ──
const warmStops = new Set();

async function warmProfile(id, { intensity: forced, closeAfter = false } = {}) {
  const p = findProfile(id);
  if (!p) return { ok: false, error: 'Profil introuvable' };
  // DotB en train de démarrer dans ce profil : on attend qu'il ait fini (1 min 30 max) au lieu de refuser le warm.
  for (let i = 0; i < 45 && String(busy.get(id) || '').startsWith('Démarrage DotB'); i++) await sleep(2000);
  if (busy.has(id)) return { ok: false, error: 'Une action est déjà en cours sur ce profil' };
  busy.set(id, 'Warm…');
  warmStops.delete(id);
  broadcast();
  const intensity = forced || store.settings.warmIntensity || 'court';
  const wasOpen = await portAlive(portOf(p));
  log(`${pcode(p)} : warm lancé (${intensity})`);
  let c, pausedDotb = false;
  try {
    if (!(await portAlive(portOf(p)))) {
      const r = await openProfile(id, { noDotb: true });
      if (!r.ok) throw new Error(r.error);
      if (!(await waitAlive(portOf(p)))) throw new Error('le profil ne répond pas');
      await sleep(4000);
    }
    // Profil déjà ouvert avec DotB : on coupe ses automatisations (likes, Smart Agent, commandes, Bridge)
    // pendant le warm, pour qu'aucune demande DotB ne passe ; elles sont relancées à la fin.
    if (wasOpen && !noDotbSessions.has(id) && store.extensions.find((e) => e.webstoreId === DOTB_EXT_ID && e.enabled)) {
      busy.set(id, 'Warm · pause DotB'); broadcast();
      await stopDotbAuto(id).catch(() => {});
      pausedDotb = true;
    }
    c = await CDP.forPort(portOf(p));
    const res = await warm.runWarm(c, {
      intensity,
      shouldStop: () => warmStops.has(id),
      log: (m) => { busy.set(id, `Warm · ${m.length > 42 ? m.slice(0, 40) + '…' : m}`); broadcast(); log(`${pcode(p)} warm · ${m}`); },
    });
    if (p.status === 'none') p.status = 'warmed';
    p.lastWarm = new Date().toISOString();
    p.warmCount = (p.warmCount || 0) + 1;
    try {
      const { cookies } = await c.send('Storage.getCookies');
      const domains = new Set(cookies.map((k) => k.domain.replace(/^\./, '').split('.').slice(-2).join('.')));
      const before = p.cookies ? p.cookies.total : 0;
      p.cookies = { total: cookies.length, sites: domains.size, at: new Date().toISOString() };
      log(`${pcode(p)} : ${cookies.length} cookies sur ${domains.size} sites dans le profil (${cookies.length - before >= 0 ? '+' : ''}${cookies.length - before} avec ce warm)`, cookies.length > before ? 'success' : 'warn');
    } catch {}
    save();
    log(`${pcode(p)} : warm terminé (${res.steps}/${res.total} étapes)`, 'success');
    return { ok: true };
  } catch (e) {
    const stopped = e.message === 'arrêté';
    log(stopped ? `${pcode(p)} : warm arrêté` : `${pcode(p)} : warm interrompu — ${e.message}`, stopped ? 'warn' : 'error');
    return { ok: stopped, error: stopped ? null : e.message };
  } finally {
    if (c) c.close();
    busy.delete(id);
    warmStops.delete(id);
    broadcast();
    // Profil ouvert par le warm (donc sans DotB) : on le ferme. S'il doit rester ouvert (« relancer s'il plante »
    // ou DotB automatique), on le rouvre normalement, avec DotB et ses automatisations.
    if (pausedDotb) {
      if (p.dotbAuto) { log(`${pcode(p)} : warm fini, relance de DotB`); setTimeout(() => runDotbAuto(id).catch(() => {}), 3000); }
      else log(`${pcode(p)} : warm fini — DotB a été mis en pause pendant le warm, relance-le si besoin`, 'warn');
    }
    if (!wasOpen && (closeAfter || p.keepAlive || p.dotbAuto)) {
      await closeProfile(id, { quiet: true });
      noDotbSessions.delete(id);
      if (p.keepAlive || p.dotbAuto) { await sleep(3000); openProfile(id).catch(() => {}); }
    }
  }
}

// ── Warm planifié + plan de chauffe 7 jours ───────────
const PLAN_DAYS = 7;
const PLAN_INTENSITY = ['court', 'court', 'normal', 'normal', 'normal', 'long', 'long'];
const today = () => new Date().toISOString().slice(0, 10);
function planDay(p) {
  if (!p.warmPlan) return null;
  const d = Math.floor((Date.now() - Date.parse(p.warmPlan.start)) / 864e5) + 1;
  return d;
}
function pickWarmTime(dayStr) {
  const { from = 9, to = 21 } = store.settings.autoWarm || {};
  const start = new Date(`${dayStr}T00:00:00`);
  const min = from * 60 + Math.floor(Math.random() * Math.max(30, (to - from) * 60 - 30));
  return new Date(start.getTime() + min * 60e3).toISOString();
}
let schedulerBusy = false;
// ── Redémarrage de nuit : chaque profil ouvert est fermé puis rouvert (RAM remise à zéro, DotB relancé) ──
let nightlyRunning = false;
async function nightlyRestart() {
  if (nightlyRunning || nightOn()) return; // mode nuit SHEIN : les comptes sont déjà fermés de 00h à 07h
  nightlyRunning = true;
  try {
    const ids = [...openSet].filter((id) => visible.has(id) && !busy.has(id) && !noDotbSessions.has(id) && !(findProfile(id) || {}).sourcing);
    if (!ids.length) return;
    log(`Redémarrage de nuit de ${ids.length} profil(s), un par un`, 'info');
    for (const id of ids) {
      const p = findProfile(id);
      if (!p || busy.has(id)) continue;
      await closeProfile(id, { quiet: true, keepInList: true });
      await sleep(5000);
      await openProfile(id).catch(() => {});
      await sleep(45000);
    }
    log('Redémarrage de nuit terminé', 'success');
  } finally { nightlyRunning = false; }
}

// ── Démarrage avec Windows : GB Browser se lance seul et rouvre les profils qui étaient ouverts ──
function applyAutoStart() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: store.settings.autoStart !== false, args: ['--autostart'] }); } catch {}
}
async function reopenAfterBoot() {
  if (nightOn() && inNight()) {
    // en pleine nuit : seulement le profil Sourcing ; les comptes Vinted rouvriront à 07h
    store.nightClosed = [...new Set([...(store.nightClosed || []), ...(store.keepOpen || []).filter((id) => !(findProfile(id) || {}).sourcing)])];
    store.nightStartedDay = today(); save();
    const sp = sourcingProfile();
    if (sp && !openSet.has(sp.id)) await openProfile(sp.id, { url: 'https://fr.shein.com/' }).catch(() => {});
    return;
  }
  const ids = (store.keepOpen || []).filter((id) => findProfile(id) && !findProfile(id).sourcing);
  if (!ids.length) return;
  log(`Démarrage avec Windows : réouverture de ${ids.length} profil(s)`, 'info');
  for (const id of ids) {
    if (openSet.has(id) || launching.has(id)) continue;
    await openProfile(id).catch(() => {});
    await sleep(25000); // un par un : la machine vient de démarrer
  }
}

// ══════════════════════════════════════════════════════
// MODE NUIT SHEIN (00h–07h) — DotB est en pause nocturne
// 00h : les comptes Vinted ouverts sont fermés (et retenus), le profil « Sourcing SHEIN » s'ouvre :
//       l'extension Groupe Barbaray y vérifie les prix et source les manques.
// 07h : le profil Sourcing se ferme, les comptes Vinted rouvrent un par un (DotB relancé).
// ══════════════════════════════════════════════════════
const NIGHT_FROM = 0, NIGHT_TO = 7;
const sourcingProfile = () => store.profiles.find((p) => p.sourcing && !p.closedByVinted);
const nightOn = () => store.settings.nightShein !== false && !!sourcingProfile();
const inNight = () => { const h = new Date().getHours(); return h >= NIGHT_FROM && h < NIGHT_TO; };
let nightRunning = false;

async function nightStart() {
  if (nightRunning) return;
  nightRunning = true;
  try {
    const sp = sourcingProfile();
    const ids = [...openSet].filter((id) => visible.has(id) && !headlessIds.has(id) && !(findProfile(id) || {}).sourcing);
    store.nightClosed = [...new Set([...(store.nightClosed || []), ...ids])];
    save();
    log(`🌙 Mode nuit : fermeture de ${ids.length} compte(s) Vinted, ouverture du profil Sourcing SHEIN`, 'info');
    for (const id of ids) { await closeProfile(id, { quiet: true, keepInList: true }).catch(() => {}); await sleep(2500); }
    if (sp && !openSet.has(sp.id)) {
      await sleep(5000);
      const r = await openProfile(sp.id, { url: 'https://fr.shein.com/' });
      if (!r.ok) { log(`🌙 Profil Sourcing : ouverture impossible — ${r.error}`, 'error'); notify('Mode nuit', `Le profil Sourcing ne s’ouvre pas : ${r.error}`); }
    }
  } finally { nightRunning = false; }
}

async function nightEnd() {
  if (nightRunning) return;
  nightRunning = true;
  try {
    const sp = sourcingProfile();
    if (sp && openSet.has(sp.id)) { await closeProfile(sp.id, { quiet: true }).catch(() => {}); await sleep(5000); }
    const ids = (store.nightClosed && store.nightClosed.length ? store.nightClosed : (store.keepOpen || []))
      .filter((id) => findProfile(id) && !findProfile(id).sourcing);
    log(`☀️ Fin de nuit : réouverture de ${ids.length} compte(s) Vinted`, 'info');
    for (const id of ids) {
      if (openSet.has(id) || launching.has(id)) continue;
      await openProfile(id).catch(() => {});
      await sleep(25000); // un par un : DotB démarre dans chacun
    }
    store.nightClosed = [];
    save();
  } finally { nightRunning = false; }
}

// ── Page DotB au premier plan : c'est elle qui empêche Brave de mettre les onglets en veille ──
const dotbHidden = new Map();
async function bringDotbFront(c) {
  const { targetInfos } = await c.send('Target.getTargets');
  const t = targetInfos.find((x) => x.type === 'page' && x.url.startsWith(dotbauto.DOTB_PAGE.split('?')[0]));
  if (!t) return false;
  const { sessionId } = await c.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await c.send('Page.bringToFront', {}, sessionId).catch(() => {});
  await c.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  return true;
}
async function keepDotbFront() {
  if (nightOn() && inNight()) return;
  for (const id of [...openSet]) {
    const p = findProfile(id);
    if (!p || !p.dotbAuto || p.sourcing || !p.dotbStartedAt || busy.has(id) || noDotbSessions.has(id) || !visible.has(id)) continue;
    let c;
    try {
      c = await CDP.forPort(portOf(p));
      const { targetInfos } = await c.send('Target.getTargets');
      const t = targetInfos.find((x) => x.type === 'page' && x.url.startsWith(dotbauto.DOTB_PAGE.split('?')[0]));
      if (!t) { dotbHidden.delete(id); continue; }
      const { sessionId } = await c.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
      const r = await c.send('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, sessionId).catch(() => null);
      const hidden = !!(r && r.result && r.result.value === 'hidden');
      if (hidden) {
        const n = (dotbHidden.get(id) || 0) + 1;
        dotbHidden.set(id, n);
        if (n >= 2) { // cachée depuis ~10 min : on la remet devant
          await c.send('Page.bringToFront', {}, sessionId).catch(() => {});
          dotbHidden.delete(id);
          log(`${pcode(p)} : page DotB remise au premier plan`, 'info');
        }
      } else dotbHidden.delete(id);
      await c.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    } catch { /* profil occupé ou fermé */ } finally { if (c) c.close(); }
  }
}

// ══════════════════════════════════════════════════════
// HAUSSE DES PRIX VINTED (annonces déjà en ligne) — quand SHEIN augmente
// Le site prépare la liste ; GB l'applique de 8h à 21h, dans le bon profil, au calme :
// 3 par passage max, 6 par compte et par jour, jamais de baisse, jamais plus de +35 %.
// ══════════════════════════════════════════════════════
let raising = false;
function raisesToday() {
  const d = today();
  if (store.raiseDay !== d) { store.raiseDay = d; store.raiseCount = {}; }
  return store.raiseCount;
}
async function raiseTick() {
  if (raising || store.settings.autoRaise === false) return;
  const key = store.settings.gbKey, base = (store.settings.gbUrl || '').replace(/\/+$/, '');
  if (!key || !base) return;
  const h = new Date().getHours();
  if (h < 8 || h >= 21 || (nightOn() && inNight())) return;
  raising = true;
  try {
    const res = await fetch(`${base}/api/gb/price-raises`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return;
    const { raises = [] } = await res.json();
    let done = 0;
    for (const r of raises) {
      if (done >= 3) break;
      const p = store.profiles.find((x) => r.dotbAccountId && String(x.dotbAccountId) === String(r.dotbAccountId));
      if (!p || p.sourcing || !openSet.has(p.id) || busy.has(p.id) || prudenceActive(p)) continue;
      if (!p.dotbStartedAt || Date.now() - Date.parse(p.dotbStartedAt) < 10 * 60e3) continue; // DotB d'abord
      const cnt = raisesToday();
      if ((cnt[p.id] || 0) >= 6) continue;
      const out = await vintedRaisePrice(p, r).catch((e) => ({ ok: false, note: e.message }));
      cnt[p.id] = (cnt[p.id] || 0) + 1;
      save();
      log(`${pcode(p)} : prix Vinted « ${String(r.title).slice(0, 40)} » — ${out.ok ? `${out.before ?? '?'} € → ${r.to} €` : out.skipped ? `inchangé (${out.note})` : `échec (${out.note})`}`, out.ok ? 'success' : out.skipped ? 'info' : 'warn');
      await fetch(`${base}/api/gb/price-raises`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ id: r.id, ...out }),
      }).catch(() => {});
      done++;
      await sleep(rand(60e3, 150e3));
    }
  } catch { /* site injoignable : on réessaiera */ } finally { raising = false; }
}

async function vintedRaisePrice(p, r) {
  busy.set(p.id, 'Prix Vinted…');
  broadcast();
  const c = await CDP.forPort(portOf(p));
  let targetId = null;
  try {
    ({ targetId } = await c.send('Target.createTarget', { url: 'about:blank' }));
    managedTargets.add(targetId);
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    await c.send('Page.enable', {}, sessionId).catch(() => {});
    await c.send('Page.bringToFront', {}, sessionId).catch(() => {}); // les clics ne passent pas sur un onglet caché
    const h = new warm.Human(c, sessionId);
    await h.goto(process.env.GB_TEST_EDIT_URL || `https://www.vinted.fr/items/${Number(r.vintedId)}/edit`);
    await h.waitLoad(20000);
    const FIND = `() => document.querySelector('input[name="price"], input#price, input[data-testid*="price" i], [data-testid*="price" i] input')`;
    let found = false;
    for (let i = 0; i < 20 && !found; i++) { found = !!(await h.eval(`!!(${FIND})()`)); if (!found) await sleep(700); }
    if (!found) {
      const url = String(await h.url() || '');
      return { ok: false, note: /\/edit/.test(url) ? 'champ prix introuvable sur la page de modification' : `page de modification refusée (${url.slice(0, 70)})` };
    }
    const cur = String(await h.eval(`(${FIND})().value`) || '');
    const curN = parseFloat(cur.replace(/[^\d,.]/g, '').replace(',', '.'));
    if (Number.isFinite(curN) && curN >= r.to - 0.001) return { ok: false, skipped: true, note: `déjà à ${curN} €`, before: curN };
    if (Number.isFinite(curN) && r.to > curN * 1.35) return { ok: false, skipped: true, note: `hausse trop forte (${curN} → ${r.to} €)`, before: curN };
    const txt = (cur.includes(',') ? r.to.toFixed(2).replace('.', ',') : r.to.toFixed(2)).replace(/[.,]00$/, '');
    await h.clickEl(FIND);
    await sleep(rand(300, 650));
    await h.eval(`(() => { const el = (${FIND})(); el.focus(); el.select(); })()`);
    await h.key('Backspace', 'Backspace', 8);
    await sleep(rand(250, 500));
    await h.type(txt);
    await sleep(rand(700, 1300));
    const typed = parseFloat(String(await h.eval(`(${FIND})().value`) || '').replace(',', '.'));
    if (Math.abs(typed - r.to) > 0.001) {
      // la frappe n'a pas pris : on remplit le champ comme le ferait le navigateur
      await h.eval(`(() => { const el = (${FIND})(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, ${JSON.stringify(txt)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await sleep(500);
    }
    await h.eval(`(${FIND})().blur()`);
    await sleep(rand(600, 1200));
    const SUBMIT = `() => [...document.querySelectorAll('button, [role=button]')].filter((b) => b.offsetParent && !b.disabled)
      .find((b) => /upload-form-save|save-button|submit/i.test(b.getAttribute('data-testid') || '') || b.type === 'submit' && !/brouillon|draft|supprimer|annuler/i.test(b.innerText)
        || /^(enregistrer|sauvegarder|mettre à jour|valider|save)/i.test((b.innerText || '').trim()) && !/brouillon|draft/i.test(b.innerText))`;
    if (!(await h.clickEl(SUBMIT))) return { ok: false, note: 'bouton « Enregistrer » introuvable', before: curN };
    for (let i = 0; i < 25; i++) {
      await sleep(800);
      const u = String(await h.url() || '');
      if (!/\/edit/.test(u)) return { ok: true, before: Number.isFinite(curN) ? curN : undefined, after: r.to };
    }
    const err = await h.eval(`[...document.querySelectorAll('[class*="error" i], [role=alert]')].map((e) => e.innerText.trim()).filter(Boolean).join(' | ').slice(0, 150)`).catch(() => '');
    return { ok: false, note: `enregistrement non confirmé${err ? ` : ${err}` : ''}`, before: curN };
  } finally {
    if (targetId) await c.send('Target.closeTarget', { targetId }).catch(() => {});
    await sleep(800);
    await bringDotbFront(c).catch(() => {});
    c.close();
    busy.delete(p.id);
    broadcast();
  }
}

// ── Extension Groupe Barbaray : installée et mise à jour toute seule pour le profil Sourcing ──
async function syncGbExtension() {
  const key = store.settings.gbKey, base = (store.settings.gbUrl || '').replace(/\/+$/, '');
  if (!key || !base || !sourcingProfile()) return;
  const auth = { headers: { Authorization: `Bearer ${key}` } };
  const v = await fetch(`${base}/api/gb/extension?v=1`, auth).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!v || !v.version) return;
  let rec = store.extensions.find((e) => e.gbSourcing);
  if (rec && rec.version === v.version && fs.existsSync(rec.path)) return;
  const res = await fetch(`${base}/api/gb/extension`, auth);
  if (!res.ok) return;
  rec = await installExtension(Buffer.from(await res.arrayBuffer()), { source: 'groupe-barbaray', existing: rec });
  rec.gbSourcing = true;
  // « Mode nuit » coché d'office dans ce profil (l'extension lit ce fichier)
  try { fs.writeFileSync(path.join(rec.path, 'gb-night.json'), JSON.stringify({ nightMode: true })); } catch {}
  save(); broadcast();
  log(`Extension Groupe Barbaray ${rec.version} prête pour le profil Sourcing (prise en compte à sa prochaine ouverture)`, 'success');
}

async function scheduler() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const now = Date.now();
    const d = today();
    if (nightOn() && !nightRunning) {
      if (inNight() && store.nightStartedDay !== d) { store.nightStartedDay = d; save(); nightStart().catch((e) => log(`Mode nuit : ${e.message}`, 'error')); }
      else if (new Date().getHours() >= NIGHT_TO && store.nightStartedDay === d && store.nightEndedDay !== d) { store.nightEndedDay = d; save(); nightEnd().catch((e) => log(`Fin de nuit : ${e.message}`, 'error')); }
    }
    if (store.settings.nightlyRestart !== false && store.lastNightly !== d && new Date().getHours() === 4) {
      store.lastNightly = d; save();
      nightlyRestart().catch(() => {});
    }
    const mc = store.settings.morningCheck || {};
    if (mc.enabled !== false && store.lastMorning !== d && new Date().getHours() >= (mc.hour ?? 8)) {
      store.lastMorning = d; save();
      morningCheck(false).catch(() => {});
    }
    // Comptes en création : prêts après 24 h
    for (const a of store.accounts || []) {
      if (a.createdAt && !a.readyNotified && now - Date.parse(a.createdAt) >= 24 * 3600e3) {
        a.readyNotified = true; save(); broadcast();
        notify('Compte prêt à ajouter', `${a.pseudo || a.email} a plus de 24 h : tu peux l’ajouter au navigateur.`);
        log(`Compte ${a.pseudo || a.email} : 24 h passées, prêt à ajouter`, 'success');
      }
    }
    for (const p of store.profiles) {
      if (p.prudence && Date.parse(p.prudence.until) <= now) {
        log(`${pcode(p)} : fin de la prudence`, 'success');
        notify('Fin de la prudence', `${pcode(p)} ${p.name} : les automatisations DotB peuvent reprendre.`);
        p.prudence = null; save(); broadcast();
        if (p.dotbAuto && openSet.has(p.id)) runDotbAuto(p.id).catch(() => {});
      }
      const day = planDay(p);
      if (day && day > PLAN_DAYS && !p.warmPlan.done) {
        p.warmPlan.done = true; save(); broadcast();
        notify('Plan de chauffe terminé', `${pcode(p)} ${p.name} est chauffé (7 jours) : tu peux lancer DotB.`);
        log(`${pcode(p)} : plan de chauffe 7 jours terminé`, 'success');
      }
      const inPlan = day && day <= PLAN_DAYS;
      if (p.sourcing || (!p.autoWarm && !inPlan)) continue;
      if (p.lastWarm && p.lastWarm.slice(0, 10) === d) continue;
      if (!p.nextWarmAt || p.nextWarmAt.slice(0, 10) !== d) { p.nextWarmAt = pickWarmTime(d); save(); }
      if (now < Date.parse(p.nextWarmAt) || busy.has(p.id)) continue;
      const intensity = inPlan ? PLAN_INTENSITY[day - 1] : undefined;
      log(`${pcode(p)} : warm automatique${inPlan ? ` (chauffe jour ${day}/7)` : ''}`);
      p.nextWarmAt = null;
      await warmProfile(p.id, { intensity, closeAfter: true });
      break; // un warm automatique à la fois
    }
  } finally { schedulerBusy = false; }
}

// ── Score de santé des comptes ────────────────────────
const MOTIF_LABEL = { automatisation: 'automatisation', non_lu: 'motif non lu', autre: 'autre motif' };
const MOTIF_PTS = { automatisation: 28, non_lu: 15, autre: 12 };
const DAY = 864e5;

function prudenceActive(p) { return !!(p.prudence && Date.parse(p.prudence.until) > Date.now()); }

function computeHealth(p) {
  if (p.closedByVinted) return { score: 0, level: 'ferme', factors: [], main: 'Fermé par Vinted', advice: 'Compte fermé par Vinted : à archiver.', prudenceAdvised: false };
  const f = [];
  const now = Date.now();
  // Restrictions (pondérées par ancienneté)
  let rTotal = 0;
  const byMotif = {};
  for (const r of p.restrictions || []) {
    const age = now - Date.parse(r.at);
    if (age > 30 * DAY) continue;
    const k = age < 7 * DAY ? 1 : age < 14 * DAY ? 0.5 : 0.25;
    const pts = Math.round((MOTIF_PTS[r.motif] || 12) * k);
    rTotal += pts;
    byMotif[r.motif] = (byMotif[r.motif] || 0) + pts;
  }
  if (rTotal) {
    const top = Object.entries(byMotif).sort((a, b) => b[1] - a[1])[0][0];
    f.push({ label: `Restriction ${top === 'automatisation' ? 'pour automatisation' : top === 'non_lu' ? 'au motif non lu' : 'Vinted'}`, pts: Math.min(60, rTotal), key: 'restr-' + top });
  }
  if (p.vinted && p.vinted.logged === false) f.push({ label: 'Vinted déconnecté', pts: 20, key: 'logout' });
  const px = proxy.parseProxy(p.proxy);
  if (!px) f.push({ label: 'Pas de proxy (IP partagée)', pts: 6, key: 'noproxy' });
  else if (p.proxyTest && !p.proxyTest.ok) f.push({ label: 'Proxy hors ligne', pts: 12, key: 'proxyoff' });
  const shr = sharedWith(p);
  if (shr.ipShared.length && px) f.push({ label: `IP partagée avec ${shr.ipShared.map((x) => pcode(x)).join(', ')}`, pts: 15, key: 'sharedip' });
  if (shr.fpShared.length) f.push({ label: `Empreinte identique à ${shr.fpShared.map((x) => pcode(x)).join(', ')}`, pts: 8, key: 'sharedfp' });
  const sh = p.sheet || {};
  if (!sh.origin || !sh.createdOn) f.push({ label: 'Origine / date de création inconnues', pts: 5, key: 'sheet' });
  if (sh.createdOn) {
    const age = now - Date.parse(sh.createdOn);
    if (age < 7 * DAY) f.push({ label: 'Compte de moins de 7 jours', pts: 15, key: 'young' });
    else if (age < 30 * DAY) f.push({ label: 'Compte de moins de 30 jours', pts: 8, key: 'young' });
  }
  if (p.vstats && p.vstats.items >= 5) {
    const avg = p.vstats.views / p.vstats.items;
    if (avg < 3) f.push({ label: 'Vues et ventes', pts: 6, key: 'views' });
    else if (avg < 8) f.push({ label: 'Vues et ventes', pts: 3, key: 'views' });
  }
  if (!p.lastWarm && !p.importSource) f.push({ label: 'Jamais warmé', pts: 3, key: 'warm' });
  const score = Math.max(0, Math.min(100, 100 - f.reduce((a, x) => a + x.pts, 0)));
  const level = score >= 75 ? 'solide' : score >= 55 ? 'surveiller' : score >= 35 ? 'fragile' : 'critique';
  f.sort((a, b) => b.pts - a.pts);
  const main = f[0];
  const lastR = [...(p.restrictions || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const lastAge = lastR ? now - Date.parse(lastR.at) : Infinity;
  const prudenceAdvised = !prudenceActive(p) && ((lastAge < 48 * 3600e3 && !lastR.liftedAt) || lastAge < 24 * 3600e3 || score < 40);
  let advice = 'Rien à faire : les automatisations peuvent tourner normalement.';
  if (main) {
    if (main.key === 'restr-automatisation' && lastAge < 7 * DAY) advice = 'Publie peu et étale (1 à 2 annonces par jour, pas de republication en série) : restriction pour automatisation il y a moins d’une semaine.';
    else if (main.key === 'restr-non_lu' && lastAge < 48 * 3600e3) advice = 'Prudence conseillée 24 h : restriction récente dont le motif n’a pas été lu (ouvre le message de Vinted pour le connaître).';
    else if (main.key.startsWith('restr')) advice = 'Garde un œil sur ce compte quelques jours et évite les republications en série.';
    else if (main.key === 'logout') advice = 'Reconnecte le compte Vinted dans le profil (ou recopie les cookies depuis la source).';
    else if (main.key === 'proxyoff') advice = 'Le proxy ne répond plus : change-le avant de rouvrir le profil.';
    else if (main.key === 'sharedip') advice = 'Deux comptes sortent avec la même IP : donne à chacun son propre proxy, sinon Vinted peut les relier.';
    else if (main.key === 'sharedfp') advice = 'Deux comptes ont exactement la même empreinte : génère une nouvelle empreinte pour le compte le plus récent.';
    else if (main.key === 'noproxy') advice = 'Ajoute un proxy dédié (idéalement résidentiel FR) pour ne pas partager l’IP avec tes autres comptes.';
    else if (main.key === 'sheet') advice = 'Renseigne l’origine et la date de création du compte (fiche du compte) : l’analyse sera plus juste.';
    else if (main.key === 'young') advice = 'Compte jeune : laisse tourner le plan de chauffe et publie très progressivement.';
    else if (main.key === 'views') advice = 'Peu de vues : renouvelle photos et titres, et fais un warm régulier.';
    else if (main.key === 'warm') advice = 'Lance un warm ou le plan de chauffe 7 jours.';
  }
  return { score, level, factors: f, main: main ? `${main.label} (− ${main.pts})` : 'aucun', advice, prudenceAdvised };
}

function addRestriction(p, { motif = 'non_lu', at, source = 'manuel', text = '' }) {
  p.restrictions = p.restrictions || [];
  const t = at || new Date().toISOString();
  // Doublon : même source dans les 12 h
  if (p.restrictions.some((r) => r.source === source && Math.abs(Date.parse(r.at) - Date.parse(t)) < 12 * 3600e3)) return false;
  p.restrictions.push({ id: crypto.randomBytes(4).toString('hex'), at: t, motif, source, text: String(text).slice(0, 300) });
  log(`${pcode(p)} ${p.name} : restriction Vinted ${MOTIF_LABEL[motif] || ''} (${source})`, 'error');
  notify('Restriction Vinted', `${pcode(p)} ${p.name} : ${MOTIF_LABEL[motif] || 'restriction'}${source !== 'manuel' ? ' (détectée par GB)' : ''}`);
  const left = 48 - (Date.now() - Date.parse(t)) / 3600e3; // 48 h à partir de la restriction
  if (store.settings.autoPrudence !== false && left > 0.5) setPrudence(p, left, true, `restriction ${MOTIF_LABEL[motif] || ''}`);
  save(); broadcast();
  return true;
}

function setPrudence(p, hours, auto = false, reason = '') {
  if (!hours) {
    p.prudence = null;
    log(`${pcode(p)} : prudence levée`);
    save(); broadcast();
    if (p.dotbAuto) runDotbAuto(p.id).catch(() => {});
    return;
  }
  p.prudence = { since: new Date().toISOString(), until: new Date(Date.now() + hours * 3600e3).toISOString(), auto, reason };
  log(`${pcode(p)} : prudence ${Math.round(hours)} h${reason ? ' — ' + reason : ''} (automatisations DotB arrêtées)`, 'warn');
  save(); broadcast();
  stopDotbAuto(p.id).catch(() => {});
}

async function stopDotbAuto(id) {
  const p = findProfile(id);
  if (!p || !(await portAlive(portOf(p)))) return;
  const c = await CDP.forPort(portOf(p));
  try {
    const res = await dotbauto.stopAutomations(c);
    log(`${pcode(p)} : automatisations DotB arrêtées (${res} carte(s))`, 'warn');
  } catch (e) { log(`${pcode(p)} : arrêt DotB impossible — ${e.message}`, 'warn'); } finally { c.close(); }
}

// Bandeau de restriction affiché par Vinted + statistiques (vues) du dressing
const BANNER_RE = /(ton|votre) compte.{0,60}(restreint|limit[ée]|suspendu|bloqu[ée])|(restreint|limit[ée]|suspendu).{0,40}(ton|votre) compte|account.{0,40}(restricted|suspended|limited)/i;
async function vintedPageCheck(p, c, sessionId, user) {
  const r = await c.send('Runtime.evaluate', { expression: `(() => { const t = (document.body && document.body.innerText || '').slice(0, 8000); const m = t.match(${BANNER_RE}); return m ? t.slice(Math.max(0, m.index - 80), m.index + 220) : ''; })()`, returnByValue: true }, sessionId, 10000).catch(() => null);
  const banner = r && r.result && r.result.value;
  if (banner && !p.vbanner) {
    p.vbanner = true;
    addRestriction(p, { motif: /automatis|logiciel|robot|\bbot\b|script/i.test(banner) ? 'automatisation' : 'non_lu', source: 'vinted', text: banner });
  } else if (!banner && p.vbanner) {
    p.vbanner = false;
    const last = [...(p.restrictions || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    if (last && !last.liftedAt) { last.liftedAt = new Date().toISOString(); log(`${pcode(p)} : restriction Vinted levée`, 'success'); }
    save(); broadcast();
  }
  // Vues du dressing (au plus toutes les 6 h)
  if (user && user.id && (!p.vstats || Date.now() - Date.parse(p.vstats.at) > 6 * 3600e3)) {
    const w = await c.send('Runtime.evaluate', {
      expression: `fetch('/api/v2/wardrobe/${user.id}/items?page=1&per_page=96&order=relevance', { credentials: 'include', headers: { accept: 'application/json' } })
        .then((r) => r.ok ? r.json() : null).then((j) => j && j.items ? { items: j.items.length, total: (j.pagination && j.pagination.total_entries) || j.items.length, views: j.items.reduce((a, i) => a + (i.view_count || 0), 0), favs: j.items.reduce((a, i) => a + (i.favourite_count || 0), 0) } : null).catch(() => null)`,
      awaitPromise: true, returnByValue: true,
    }, sessionId, 20000).catch(() => null);
    const v = w && w.result && w.result.value;
    if (v && v.items) {
      p.vstats = { items: v.total, views: Math.round(v.views * (v.total / v.items)), favs: v.favs, at: new Date().toISOString() };
      if (!p.sheet) p.sheet = {};
      if (!p.sheet.createdOn && user.created_at) p.sheet.createdOn = String(user.created_at).slice(0, 10);
      save(); broadcast();
    }
  }
}

// ── IP et empreinte partagées entre comptes ───────────
let realIp = null; // IP réelle du PC (profils sans proxy)
async function refreshRealIp() {
  const r = await proxy.testProxy(null, 8);
  if (r.ok) realIp = { ip: r.ip, country: r.countryCode, at: new Date().toISOString() };
}
function currentIp(p) {
  if (!proxy.parseProxy(p.proxy)) return realIp ? realIp.ip : 'IP réelle';
  return p.proxyTest && p.proxyTest.ok ? p.proxyTest.ip : null;
}
function fpKey(fp) { return fp ? `${fp.screen.width}x${fp.screen.height}|${fp.gpu.renderer}|${fp.cores}|${fp.memory}` : null; }
function sharedWith(p) {
  const ip = currentIp(p), k = fpKey(p.fp);
  const ipShared = ip ? store.profiles.filter((x) => x.id !== p.id && !x.closedByVinted && currentIp(x) === ip) : [];
  const fpShared = k ? store.profiles.filter((x) => x.id !== p.id && fpKey(x.fp) === k) : [];
  return { ip, ipShared, fpShared };
}
function recordIp(p, test) {
  if (!test || !test.ok) return;
  p.ipHistory = p.ipHistory || [];
  const last = p.ipHistory[p.ipHistory.length - 1];
  if (last && last.ip === test.ip) { last.seen = new Date().toISOString(); return; }
  p.ipHistory.push({ ip: test.ip, country: test.countryCode, at: new Date().toISOString(), seen: new Date().toISOString() });
  if (p.ipHistory.length > 30) p.ipHistory.shift();
  if (last) {
    const msg = last.country !== test.countryCode
      ? `${pcode(p)} ${p.name} : l’IP a changé de pays (${last.country} → ${test.countryCode})`
      : `${pcode(p)} ${p.name} : nouvelle IP ${test.ip} (avant ${last.ip})`;
    log(msg, last.country !== test.countryCode ? 'error' : 'warn');
    if (last.country !== test.countryCode) notify('IP changée de pays', msg);
  }
}
let lastConflicts = new Set();
function checkConflicts() {
  const now = new Set();
  for (const p of store.profiles) {
    const { ip, ipShared, fpShared } = sharedWith(p);
    if (ipShared.length && proxy.parseProxy(p.proxy)) now.add(`ip:${ip}`);
    if (fpShared.length) now.add(`fp:${fpKey(p.fp)}`);
  }
  for (const c of now) if (!lastConflicts.has(c)) {
    const [type, val] = [c.slice(0, 2), c.slice(3)];
    const who = store.profiles.filter((p) => (type === 'ip' ? currentIp(p) === val : fpKey(p.fp) === val)).map((p) => pcode(p)).join(', ');
    const msg = type === 'ip' ? `Même IP (${val}) sur ${who}` : `Même empreinte sur ${who}`;
    log(msg + ' — Vinted peut relier ces comptes', 'error');
    notify(type === 'ip' ? 'IP partagée entre comptes' : 'Empreinte partagée', msg);
  }
  lastConflicts = now;
}

// ── Contrôle du matin ─────────────────────────────────
let morningRunning = false;
async function morningCheck(manual = false) {
  if (morningRunning) return { ok: false, error: 'Contrôle déjà en cours' };
  morningRunning = true;
  send('gb:morning', { running: true });
  log(`Contrôle ${manual ? 'manuel' : 'du matin'} de ${store.profiles.length} compte(s)…`);
  const issues = [];
  try {
    await refreshRealIp().catch(() => {});
    for (const p of store.profiles.filter((x) => !x.closedByVinted)) {
      send('gb:morning', { running: true, current: `${pcode(p)} ${p.name}` });
      const px = proxy.parseProxy(p.proxy);
      if (px) {
        const t = await proxy.testProxy(px, store.settings.proxyTimeout);
        p.proxyTest = { ...t, at: new Date().toISOString() };
        recordIp(p, t);
        if (!t.ok) issues.push(`${pcode(p)} ${p.name} : proxy hors ligne`);
      }
      const logged = openSet.has(p.id) ? await refreshVinted(p.id) : (!busy.has(p.id) ? await checkVintedHeadless(p.id) : null);
      if (logged === false) issues.push(`${pcode(p)} ${p.name} : Vinted déconnecté`);
      const h = computeHealth(p);
      if (h.level === 'critique' || h.level === 'fragile') issues.push(`${pcode(p)} ${p.name} : ${h.level === 'critique' ? 'critique' : 'fragile'} (${h.score})`);
      if (prudenceActive(p)) issues.push(`${pcode(p)} ${p.name} : en prudence`);
      const sh = sharedWith(p);
      if (sh.ipShared.length && px) issues.push(`${pcode(p)} ${p.name} : IP partagée avec ${sh.ipShared.map((x) => pcode(x)).join(', ')}`);
    }
    if (store.settings.dotbToken) {
      const acc = await dotbFetch('GET', '/accounts');
      if (!acc.error) {
        for (const a of (acc.data && acc.data.data) || []) {
          const prof = store.profiles.find((x) => String(x.dotbAccountId) === String(a.id));
          if (prof && openSet.has(prof.id) && !(a.bridge && a.bridge.connected)) issues.push(`${pcode(prof)} ${prof.name} : DotB hors ligne`);
        }
      }
    }
    checkConflicts();
    const okCount = store.profiles.filter((p) => !issues.some((i) => i.startsWith(pcode(p) + ' '))).length;
    const report = { at: new Date().toISOString(), total: store.profiles.length, ok: okCount, issues: [...new Set(issues)] };
    store.reports = [...(store.reports || []), report].slice(-30);
    store.lastMorning = new Date().toISOString().slice(0, 10);
    save(); broadcast();
    const summary = `${okCount} compte(s) OK${report.issues.length ? ` · ${report.issues.length} point(s) à voir` : ' · rien à signaler'}`;
    log(`Contrôle terminé : ${summary}${report.issues.length ? ' — ' + report.issues.join(' ; ') : ''}`, report.issues.length ? 'warn' : 'success');
    notify(manual ? 'Contrôle terminé' : 'Contrôle du matin', report.issues.length ? `${summary}\n${report.issues.slice(0, 3).join('\n')}` : summary);
    return { ok: true, report };
  } finally {
    morningRunning = false;
    send('gb:morning', { running: false });
  }
}

// ── Rythme de publication (DotB) ──────────────────────
let lastPubCheck = new Date().toISOString();
async function pubWatch() {
  if (!store.settings.dotbToken) return;
  const since = lastPubCheck;
  lastPubCheck = new Date().toISOString();
  const ev = await dotbFetch('GET', `/events?type=publish.succeeded&since=${encodeURIComponent(since)}&limit=100`);
  if (ev.error) return;
  const day = new Date().toISOString().slice(0, 10);
  store.pubCounts = store.pubCounts || {};
  for (const e of (ev.data && ev.data.data) || []) {
    const d = e.data || {};
    const acc = d.vinted_account_id || d.account_id || (d.account && d.account.id) || (d.item && (d.item.vinted_account_id || d.item.account_id));
    if (!acc) continue;
    const key = `${acc}|${day}`;
    store.pubCounts[key] = (store.pubCounts[key] || 0) + 1;
  }
  // nettoyage des vieux jours
  for (const k of Object.keys(store.pubCounts)) if (!k.endsWith(day) && Date.now() - Date.parse(k.split('|')[1]) > 3 * DAY) delete store.pubCounts[k];
  const th = store.settings.pubAlert || { normal: 40, fragile: 15 };
  store.pubAlerted = store.pubAlerted || {};
  for (const p of store.profiles.filter((x) => x.dotbAccountId)) {
    const n = store.pubCounts[`${p.dotbAccountId}|${day}`] || 0;
    const h = computeHealth(p);
    const fragile = h.level === 'fragile' || h.level === 'critique';
    const limit = prudenceActive(p) ? 1 : fragile ? th.fragile : th.normal;
    const ak = `${p.id}|${day}`;
    if (n >= limit && !store.pubAlerted[ak]) {
      store.pubAlerted[ak] = true;
      const why = prudenceActive(p) ? 'alors qu’il est en prudence' : fragile ? `alors qu’il est ${h.level} (${h.score})` : 'aujourd’hui';
      log(`${pcode(p)} ${p.name} : ${n} publications DotB ${why}`, 'warn');
      notify('Beaucoup de publications', `${pcode(p)} ${p.name} : ${n} annonces publiées par DotB ${why}.`);
    }
  }
  save();
}
const pubToday = (p) => (store.pubCounts || {})[`${p.dotbAccountId}|${new Date().toISOString().slice(0, 10)}`] || 0;

// ── Libération de la RAM (sans mettre en veille Vinted ni DotB) ──
async function purgeRam(id) {
  const p = findProfile(id);
  if (!p || !(await portAlive(portOf(p)))) return;
  const c = await CDP.forPort(portOf(p));
  try {
    await c.send('Memory.simulatePressureNotification', { level: 'moderate' }).catch(() => {});
    const { targetInfos } = await c.send('Target.getTargets');
    for (const t of targetInfos.filter((x) => x.type === 'page')) {
      const { sessionId } = await c.send('Target.attachToTarget', { targetId: t.targetId, flatten: true }).catch(() => ({}));
      if (!sessionId) continue;
      await c.send('HeapProfiler.collectGarbage', {}, sessionId, 8000).catch(() => {});
      await c.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    }
  } finally { c.close(); }
}
async function purgeAll() { for (const id of openSet) if (!busy.has(id)) await purgeRam(id).catch(() => {}); }

// ── Mise à jour automatique (GitHub Releases) ─────────
let updater = null;
let updateState = { status: 'idle' };
function setupUpdater() {
  if (!app.isPackaged) { updateState = { status: 'dev' }; return; }
  try { updater = require('electron-updater').autoUpdater; } catch { updateState = { status: 'unavailable' }; return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = { info: () => {}, warn: (m) => log(`Mise à jour : ${m}`, 'warn'), error: () => {}, debug: () => {} };
  updater.on('checking-for-update', () => { updateState = { status: 'checking' }; broadcast(); });
  updater.on('update-not-available', () => { updateState = { status: 'latest', at: new Date().toISOString() }; broadcast(); });
  updater.on('update-available', (i) => { updateState = { status: 'downloading', version: i.version, percent: 0 }; log(`Nouvelle version ${i.version} : téléchargement…`); broadcast(); });
  updater.on('download-progress', (pr) => { updateState = { ...updateState, percent: Math.round(pr.percent) }; broadcast(); });
  updater.on('update-downloaded', (i) => {
    updateState = { status: 'ready', version: i.version };
    log(`GB Browser ${i.version} prêt : redémarre pour l’installer`, 'success');
    notify('Mise à jour prête', `GB Browser ${i.version} sera installé au redémarrage.`);
    broadcast();
  });
  updater.on('error', (e) => { updateState = { status: 'error', error: String(e && e.message || e).slice(0, 200) }; broadcast(); });
  const check = () => { if (store.settings.autoUpdate !== false) updater.checkForUpdates().catch(() => {}); };
  setTimeout(check, 20000);
  setInterval(check, 6 * 3600e3);
}

// ── Liaison avec le site Groupe Barbaray : envoie l'état des comptes (page « Comptes & GB Browser ») ──
let gbLinkState = { ok: null, at: null, error: null };
function gbAccountsPayload() {
  return store.profiles.filter((p) => !p.archived).map((p) => {
    const h = computeHealth(p);
    const ip = currentIp(p);
    const px = proxy.parseProxy(p.proxy);
    const lastR = [...(p.restrictions || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    const bridge = p.dotbAccountId ? bridgeState.get(p.dotbAccountId) ?? bridgeState.get(String(p.dotbAccountId)) : undefined;
    return {
      id: p.id, name: `${pcode(p)} ${p.name}`.trim(), num: p.num,
      running: openSet.has(p.id),
      vinted: p.vinted ? (p.vinted.logged === true ? 'oui' : p.vinted.logged === false ? 'non' : '?') : '?',
      vintedLogin: (p.vinted && p.vinted.login) || null,
      dotb: bridge === undefined ? null : !!bridge, dotbAuto: !!p.dotbAuto,
      health: h.score, level: h.level, prudenceUntil: p.prudence ? p.prudence.until : null,
      proxy: px ? proxy.label(px) : null, ip: typeof ip === 'string' && /\d/.test(ip) ? ip : null,
      country: (p.ipHistory && p.ipHistory.length && p.ipHistory[p.ipHistory.length - 1].country) || null,
      views: p.vstats ? p.vstats.views : null, items: p.vstats ? p.vstats.items : null, favourites: p.vstats ? p.vstats.favs : null,
      publishedToday: p.dotbAccountId ? pubToday(p) : null,
      restrictions: (p.restrictions || []).length, lastRestriction: lastR ? lastR.at : null,
      notes: h.main || null,
    };
  });
}
async function gbPush(manual = false) {
  const key = store.settings.gbKey, base = (store.settings.gbUrl || '').replace(/\/+$/, '');
  if (!key || !base) return { ok: false, error: 'Clé ou adresse manquante' };
  try {
    const mem = os.totalmem(), free = os.freemem();
    const res = await fetch(`${base}/api/gb/accounts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ version: app.getVersion(), machine: os.hostname().slice(0, 40), ram: { used: Math.round((mem - free) / 1048576), total: Math.round(mem / 1048576) }, accounts: gbAccountsPayload() }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 401 ? 'Clé refusée par le site' : j.error || `Erreur ${res.status}`);
    gbLinkState = { ok: true, at: new Date().toISOString(), error: null };
    if (manual) log(`Groupe Barbaray : ${j.received} compte(s) envoyé(s) au site`, 'success');
  } catch (e) {
    const changed = gbLinkState.ok !== false;
    gbLinkState = { ok: false, at: new Date().toISOString(), error: e.message };
    if (manual || changed) log(`Groupe Barbaray : envoi impossible (${e.message})`, 'warn');
  }
  broadcast();
  return gbLinkState;
}

// ── Liaison automatique profil ↔ compte DotB : même pseudo Vinted (ou nom du profil = pseudo) ──
let dotbAccountsCache = [];
function autoLinkDotb() {
  const norm = (x) => String(x || '').trim().toLowerCase();
  let n = 0;
  for (const a of dotbAccountsCache) {
    if (!a || !a.login || store.profiles.some((p) => String(p.dotbAccountId) === String(a.id))) continue;
    const p = store.profiles.find((x) => !x.dotbAccountId && (norm(x.vinted && x.vinted.login) === norm(a.login) || norm(x.name) === norm(a.login)));
    if (!p) continue;
    p.dotbAccountId = String(a.id);
    p.dotbAccountLabel = a.login;
    n++;
    log(`${pcode(p)} ${p.name} : relié automatiquement au compte DotB « ${a.login} »`, 'success');
  }
  if (n) { save(); broadcast(); }
}

// ── Surveillance DotB (pont hors ligne, nouvelles commandes) ──
const bridgeState = new Map();
let lastOrderCheck = new Date().toISOString();
async function dotbWatch() {
  if (!store.settings.dotbToken) return;
  const acc = await dotbFetch('GET', '/accounts');
  if (!acc.error) {
    const list = (acc.data && (acc.data.data || acc.data)) || [];
    dotbAccountsCache = Array.isArray(list) ? list : [];
    autoLinkDotb();
    for (const a of Array.isArray(list) ? list : []) {
      const on = !!(a.bridge && a.bridge.connected);
      const prev = bridgeState.get(a.id);
      bridgeState.set(a.id, on);
      const prof = store.profiles.find((p) => String(p.dotbAccountId) === String(a.id));
      if (prev === true && !on && prof && !(nightOn() && inNight())) {
        log(`${pcode(prof)} : DotB hors ligne (${a.login || a.id})`, 'warn');
        notify('DotB hors ligne', `${pcode(prof)} ${prof.name} (${a.login || ''}) : l’extension ne répond plus.`);
      }
    }
  }
  const since = lastOrderCheck;
  lastOrderCheck = new Date().toISOString();
  const ev = await dotbFetch('GET', `/events?type=order.created&since=${encodeURIComponent(since)}&limit=50`);
  if (!ev.error) {
    const n = ((ev.data && ev.data.data) || []).length;
    if (n) { notify('Nouvelle commande Vinted', `${n} nouvelle(s) commande(s) sur DotB`); log(`${n} nouvelle(s) commande(s) DotB`, 'success'); }
  }
}

// ── RAM utilisée par chaque profil (Windows) ──────────
let ramCache = { at: 0, data: {} };
function measureRam() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({});
    const ps = "Get-CimInstance Win32_Process -Filter \"Name='brave.exe' OR Name='chrome.exe'\" | ForEach-Object { $_.CommandLine + '|' + $_.WorkingSetSize }";
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('exit', () => {
      const data = {};
      for (const line of out.split(/\r?\n/)) {
        const i = line.lastIndexOf('|');
        if (i < 0) continue;
        const cmd = line.slice(0, i), ws = Number(line.slice(i + 1)) || 0;
        const p = store.profiles.find((x) => cmd.includes(x.dir));
        if (p) data[p.id] = (data[p.id] || 0) + ws;
      }
      resolve(data);
    });
    child.on('error', () => resolve({}));
  });
}

// ── Connexion Vinted (cookies d'authentification) ─────
async function readVintedLogin(port) {
  const c = await CDP.forPort(port);
  try {
    const { cookies } = await c.send('Storage.getCookies');
    return cookies.some((k) => /(^|\.)vinted\./.test(k.domain) && /^(access_token_web|refresh_token_web)$/.test(k.name) && k.value);
  } finally { c.close(); }
}

// Vérification réelle : appel de l'API Vinted depuis un onglet vinted.fr du profil
async function vintedApiCheck(port) {
  const c = await CDP.forPort(port);
  try {
    const { targetInfos } = await c.send('Target.getTargets');
    const tab = targetInfos.find((t) => t.type === 'page' && /^https:\/\/www\.vinted\.[a-z.]+\//.test(t.url));
    if (!tab) return null;
    const { sessionId } = await c.send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
    const r = await c.send('Runtime.evaluate', {
      expression: `fetch('/api/v2/users/current', { credentials: 'include', headers: { accept: 'application/json' } })
        .then(async (r) => ({ s: r.status, j: r.ok ? await r.json().catch(() => null) : null })).catch(() => ({ s: 0 }))`,
      awaitPromise: true, returnByValue: true,
    }, sessionId, 15000);
    const v = r && r.result && r.result.value;
    const pp = store.profiles.find((x) => portOf(x) === port);
    if (pp) await vintedPageCheck(pp, c, sessionId, v && v.j && v.j.user).catch(() => {});
    await c.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    if (!v) return null;
    if (v.s === 200 && v.j && v.j.user) return { logged: true, login: v.j.user.login || '', how: 'api' };
    if (v.s === 401) return { logged: false, how: 'api' };
    return null; // 403 (protection anti-robot), réseau… : on ne conclut pas
  } finally { c.close(); }
}

async function refreshVinted(id) {
  const p = findProfile(id);
  if (!p || p.sourcing) return null; // profil Sourcing : pas de compte Vinted, on ne va pas sur Vinted
  try {
    let res = await vintedApiCheck(portOf(p)).catch(() => null);
    if (!res) {
      const hasCookie = await readVintedLogin(portOf(p));
      res = { logged: hasCookie ? null : false, how: 'cookie' }; // cookie présent = session à confirmer
    }
    const prev = p.vinted || {};
    p.vinted = { logged: res.logged, login: res.login || (res.logged === null ? prev.login : '') || '', how: res.how, at: new Date().toISOString() };
    if (p.vinted.login && !p.dotbAccountId) setTimeout(() => autoLinkDotb(), 0);
    if (prev.logged !== p.vinted.logged || prev.login !== p.vinted.login) {
      if (prev.logged === true && p.vinted.logged === false) notify('Compte Vinted déconnecté', `${pcode(p)} ${p.name}${prev.login ? ' (' + prev.login + ')' : ''} n’est plus connecté à Vinted.`);
      save(); broadcast();
    }
    return p.vinted.logged;
  } catch { return null; }
}

// Vérifie un profil fermé en le lançant en arrière-plan (headless)
async function checkVintedHeadless(id) {
  const p = findProfile(id);
  if (!p || p.sourcing) return null;
  if (await portAlive(portOf(p))) return refreshVinted(id);
  busy.set(id, 'Vérification Vinted…');
  broadcast();
  try {
    const r = await openProfile(id, { headless: true, url: 'about:blank' });
    if (!r.ok) throw new Error(r.error);
    if (!(await waitAlive(portOf(p)))) throw new Error('le profil ne répond pas');
    await sleep(1500);
    const logged = await refreshVinted(id);
    const c = await CDP.forPort(portOf(p));
    await c.send('Browser.close').catch(() => {});
    c.close();
    await waitHeadlessExit(id);
    return logged;
  } catch (e) {
    log(`${pcode(p)} : vérification Vinted impossible — ${e.message}`, 'warn');
    await closeProfile(id, { quiet: true });
    return null;
  } finally {
    busy.delete(id);
    broadcast();
  }
}

// ── Pages de bienvenue des extensions (DotB…) : fermées à l'ouverture ──
const WELCOME_RE = /^https?:\/\/([a-z0-9-]+\.)?dotb\.io\/|^chrome-extension:\/\/[a-p]{32}\/.*(welcome|onboard|install|getting|intro|setup)/i;

async function guardWelcomeTabs(id, ms = 40000) {
  const p = findProfile(id);
  if (!p || store.settings.closeWelcome === false) return;
  if (!(await waitAlive(portOf(p), 20000))) return;
  let c;
  try {
    c = await CDP.forPort(portOf(p));
    const pages = new Map();
    const startedAt = Date.now();
    const check = async (info) => {
      if (info.type !== 'page') return;
      pages.set(info.targetId, info.url);
      const stray = Date.now() - startedAt < 15000 && /^(chrome:\/\/newtab|brave:\/\/newtab|chrome:\/\/new-tab-page|brave:\/\/welcome|chrome:\/\/welcome)/.test(info.url || '');
      if (!WELCOME_RE.test(info.url || '') && !stray) return;
      if (p.startUrl && info.url.startsWith(p.startUrl)) return;
      if ([...pages.keys()].length <= 1) return; // ne jamais fermer le dernier onglet (sinon Brave se ferme)
      if (managedTargets.has(info.targetId)) return;
      pages.delete(info.targetId);
      await c.send('Target.closeTarget', { targetId: info.targetId }).catch(() => {});
      if (!/^about:blank/.test(info.url)) log(`${pcode(p)} : page fermée à l’ouverture (${info.url.split('?')[0].slice(0, 60)})`);
    };
    c.on((m) => {
      if (m.method === 'Target.targetCreated' || m.method === 'Target.targetInfoChanged') check(m.params.targetInfo);
      if (m.method === 'Target.targetDestroyed') pages.delete(m.params.targetId);
    });
    await c.send('Target.setDiscoverTargets', { discover: true });
    await sleep(ms);
  } catch {} finally { if (c) c.close(); }
}

// ── Import de connexions (cookies JSON) ───────────────
function normalizeCookies(input) {
  let data = input;
  if (typeof data === 'string') data = JSON.parse(data.replace(/^﻿/, ''));
  if (!Array.isArray(data)) data = data.cookies || data.data || [];
  const sameSite = { no_restriction: 'None', none: 'None', lax: 'Lax', strict: 'Strict' };
  return data.filter((c) => c && c.name && c.domain).filter((c) => !/^chrome-extension:/.test(c.domain)).map((c) => {
    const out = {
      name: String(c.name),
      value: String(c.value ?? ''),
      domain: c.domain,
      path: c.path || '/',
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
    };
    if (c.hostOnly) {
      out.url = `${c.secure ? 'https' : 'http'}://${String(c.domain).replace(/^\./, '')}${out.path}`;
      delete out.domain;
    }
    if (c.partitionKey && c.partitionKey.topLevelSite) out.partitionKey = c.partitionKey;
    const ss = sameSite[String(c.sameSite || '').toLowerCase()];
    if (ss) out.sameSite = ss;
    if (ss === 'None') out.secure = true;
    const exp = c.expirationDate ?? c.expires ?? c.expiry;
    if (exp && exp > 0 && !c.session) out.expires = Number(exp) > 1e12 ? Number(exp) / 1000 : Number(exp);
    return out;
  });
}

// Attend la fin réelle du navigateur headless (sinon la prochaine ouverture se greffe dessus et se ferme)
async function waitHeadlessExit(id) {
  const p = findProfile(id);
  const r = running.get(id);
  if (r && r.child && r.child.exitCode === null && r.child.signalCode === null) {
    await Promise.race([new Promise((res) => r.child.once('exit', res)), sleep(10000)]);
    if (r.child.exitCode === null && r.child.signalCode === null) { try { r.child.kill(); } catch {} }
  }
  for (let i = 0; i < 20 && (await portAlive(portOf(p))); i++) await sleep(300);
  if (r && r.relay) r.relay.stop();
  running.delete(id);
  launching.delete(id);
  openSet.delete(id);
  await sleep(500);
  browsers.removeLocks(p.dir);
  broadcast();
}

async function importCookies(id, text) {
  const p = findProfile(id);
  if (!p) return { ok: false, error: 'Profil introuvable' };
  let cookies;
  try { cookies = normalizeCookies(text); } catch { return { ok: false, error: 'JSON illisible' }; }
  cookies.forEach((k) => { if (k.partitionKey) delete k.partitionKey; });
  if (!cookies.length) return { ok: false, error: 'Aucun cookie trouvé dans ce fichier' };
  busy.set(id, 'Import des connexions…');
  broadcast();
  const wasOpen = await portAlive(portOf(p));
  let c;
  try {
    if (!wasOpen) {
      const r = await openProfile(id, { headless: true, url: 'about:blank' });
      if (!r.ok) throw new Error(r.error);
      if (!(await waitAlive(portOf(p)))) throw new Error('le profil ne répond pas');
    }
    c = await CDP.forPort(portOf(p));
    await c.send('Storage.setCookies', { cookies });
    if (!wasOpen) {
      await c.send('Browser.close').catch(() => {});
      c.close(); c = null;
      await waitHeadlessExit(id);
    }
    log(`${pcode(p)} : ${cookies.length} cookies importés`, 'success');
    return { ok: true, count: cookies.length };
  } catch (e) {
    log(`${pcode(p)} : import des connexions échoué — ${e.message}`, 'error');
    if (!wasOpen) await closeProfile(id, { quiet: true });
    return { ok: false, error: e.message };
  } finally {
    if (c) c.close();
    busy.delete(id);
    broadcast();
  }
}

// ── Relecture des cookies d'un profil source par le navigateur lui-même ──
// (comme Scalency : les cookies sont déchiffrés par Brave, puis réinjectés dans le profil GB)
async function readSourceCookies(userDataDir, profileDirectory) {
  const b = browsers.detect(store.settings.browserPath);
  if (!b) throw new Error('Brave introuvable');
  const token = crypto.randomBytes(12).toString('hex');
  const extDir = path.join(app.getPath('temp'), `gb-cookie-reader-${token}`);
  fs.cpSync(assetPath('cookie-reader'), extDir, { recursive: true });
  let result = null, error = null, child = null;
  const server = http.createServer((req, res) => {
    if (!req.url.includes(`t=${token}`)) { res.writeHead(403); return res.end(); }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.end('ok');
      if (req.url.startsWith('/cookies')) { try { result = JSON.parse(body); } catch (e) { error = e.message; } }
      else error = body || 'erreur inconnue';
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  fs.writeFileSync(path.join(extDir, 'config.js'), `const GB_PORT = ${server.address().port}; const GB_TOKEN = '${token}';`);
  try {
    child = spawn(b.path, [
      `--user-data-dir=${userDataDir}`,
      `--profile-directory=${profileDirectory}`,
      '--headless=new',
      '--no-first-run', '--no-default-browser-check',
      `--load-extension=${extDir}`,
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      'about:blank',
    ], { stdio: 'ignore' });
    let exited = false;
    const started = Date.now();
    child.on('exit', () => { exited = true; });
    while (Date.now() - started < 30000 && !result && !error) {
      await sleep(300);
      if (exited && !result && !error) {
        await sleep(500);
        if (result || error) break;
        throw new Error(Date.now() - started < 6000
          ? 'Brave s’est fermé tout de suite — il est sûrement déjà ouvert : ferme-le complètement (y compris dans la barre des tâches)'
          : 'Brave s’est fermé sans répondre');
      }
    }
    if (error) throw new Error(error);
    if (!result) throw new Error('aucune réponse du profil source (30 s)');
    return result;
  } finally {
    try { if (child && child.exitCode === null) child.kill(); } catch {}
    server.close();
    setTimeout(() => { try { fs.rmSync(extDir, { recursive: true, force: true }); } catch {} }, 3000);
  }
}

// Relit les cookies de la source et les injecte dans le profil GB importé
async function transferCookies(p, userDataDir, profileDirectory) {
  try {
    busy.set(p.id, 'Relecture des cookies…');
    broadcast();
    const cookies = await readSourceCookies(userDataDir, profileDirectory);
    const vinted = cookies.filter((c) => /(^|\.)vinted\./.test(c.domain)).length;
    log(`${pcode(p)} : ${cookies.length} cookies relus par Brave (${vinted} Vinted)`);
    busy.delete(p.id);
    await sleep(1500);
    if (cookies.length) {
      const r = await importCookies(p.id, cookies);
      if (!r.ok) log(`${pcode(p)} : réinjection des cookies échouée — ${r.error}`, 'warn');
    }
  } catch (e) {
    log(`${pcode(p)} : relecture des cookies impossible — ${e.message}`, 'warn');
  } finally {
    busy.delete(p.id);
    broadcast();
  }
}

// ── Import des profils Brave existants ────────────────
const SKIP_DIRS = new Set(['Cache', 'Code Cache', 'GPUCache', 'Service Worker', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GrShaderCache', 'ShaderCache', 'Media Cache', 'Application Cache', 'blob_storage']);

async function importBraveProfiles(dirs) {
  const { dir: braveDir, profiles } = browsers.listBraveProfiles();
  let localState = {};
  try { localState = JSON.parse(fs.readFileSync(path.join(braveDir, 'Local State'), 'utf8')); } catch {}
  const results = [];
  for (let i = 0; i < dirs.length; i++) {
    const src = profiles.find((x) => x.dir === dirs[i]);
    if (!src) continue;
    send('gb:import-progress', { index: i, total: dirs.length, name: src.name });
    store.counter += 1;
    const p = newProfileObj(store.counter, { name: src.name, notes: `Importé de Brave (${src.dir})` });
    try {
      fs.mkdirSync(p.dir, { recursive: true });
      await fs.promises.cp(path.join(braveDir, src.dir), path.join(p.dir, 'Default'), {
        recursive: true, force: true, filter: (s) => !SKIP_DIRS.has(path.basename(s)),
      });
      const ls = JSON.parse(JSON.stringify(localState));
      ls.profile = ls.profile || {};
      const info = (ls.profile.info_cache || {})[src.dir] || { name: src.name };
      ls.profile.info_cache = { Default: info };
      ls.profile.last_used = 'Default';
      ls.profile.last_active_profiles = ['Default'];
      ls.profile.profiles_order = ['Default'];
      fs.writeFileSync(path.join(p.dir, 'Local State'), JSON.stringify(ls));
      p.importSource = { dir: braveDir, profile: src.dir };
      store.profiles.push(p);
      save();
      results.push({ id: p.id, name: src.name, ok: true, src: { dir: braveDir, profile: src.dir } });
      log(`${pcode(p)} importé depuis Brave : ${src.name}`, 'success');
    } catch (e) {
      try { fs.rmSync(p.dir, { recursive: true, force: true }); } catch {}
      const msg = /EBUSY|EPERM|locked/i.test(e.message) ? 'fichiers verrouillés — ferme Brave puis réessaie' : e.message;
      results.push({ name: src.name, ok: false, error: msg });
      log(`Import Brave échoué (${src.name}) : ${msg}`, 'error');
    }
    broadcast();
  }
  send('gb:import-progress', { done: true });
  verifyImported(results);
  return results;
}

// ── Proxies ───────────────────────────────────────────
async function testProfileProxy(id) {
  const p = findProfile(id);
  if (!p) return null;
  const parsed = proxy.parseProxy(p.proxy);
  if (!parsed) { p.proxyTest = null; save(); broadcast(); return null; }
  busy.set(id, 'Test du proxy…');
  broadcast();
  const res = await proxy.testProxy(parsed, store.settings.proxyTimeout);
  busy.delete(id);
  p.proxyTest = { ...res, at: new Date().toISOString() };
  recordIp(p, res);
  checkConflicts();
  save(); broadcast();
  log(res.ok ? `${pcode(p)} proxy OK : ${res.ip} (${res.country}, ${res.ms} ms)` : `${pcode(p)} proxy hors ligne : ${res.error}`, res.ok ? 'success' : 'warn');
  return p.proxyTest;
}

// ── Extensions ────────────────────────────────────────
function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' });
    const chunks = [];
    req.on('response', (res) => {
      if (res.statusCode >= 400) { reject(new Error(`téléchargement refusé (${res.statusCode})`)); return; }
      res.on('data', (c) => chunks.push(Buffer.from(c)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function installExtension(buf, { source, webstoreId: wsId, existing } = {}) {
  const id = existing ? existing.id : crypto.randomBytes(5).toString('hex');
  const dest = path.join(EXT_DIR, id);
  const { manifest, extId } = await exts.installFromBuffer(buf, dest);
  if (!manifest) throw new Error('manifest.json illisible');
  const rec = existing || { id, enabled: true, source, webstoreId: wsId || null };
  rec.name = exts.resolveName(dest, manifest);
  rec.version = manifest.version || '?';
  rec.path = dest;
  rec.extId = extId || rec.extId || null;
  rec.updatedAt = new Date().toISOString();
  if (!existing) store.extensions.push(rec);
  save(); broadcast();
  return rec;
}

async function addWebstore(input) {
  const wsId = exts.webstoreId(input);
  if (!wsId) return { ok: false, error: 'Lien Chrome Web Store invalide (il doit contenir l’identifiant de 32 lettres).' };
  if (store.extensions.find((e) => e.webstoreId === wsId)) return { ok: false, error: 'Cette extension est déjà ajoutée.' };
  try {
    const buf = await downloadBuffer(exts.crxUrl(wsId));
    const rec = await installExtension(buf, { source: 'webstore', webstoreId: wsId });
    log(`Extension ajoutée depuis le Web Store : ${rec.name} ${rec.version}`, 'success');
    return { ok: true, ext: rec };
  } catch (e) {
    log(`Extension ${wsId} : ${e.message}`, 'error');
    return { ok: false, error: e.message };
  }
}

async function updateWebstoreExtensions(force = false) {
  for (const e of store.extensions.filter((x) => x.webstoreId)) {
    const age = Date.now() - new Date(e.updatedAt || 0).getTime();
    if (!force && age < 12 * 3600 * 1000) continue;
    try {
      const before = e.version;
      const buf = await downloadBuffer(exts.crxUrl(e.webstoreId));
      await installExtension(buf, { existing: e });
      if (e.version !== before) log(`Extension mise à jour : ${e.name} ${before} → ${e.version}`, 'success');
    } catch (err) {
      log(`Mise à jour de ${e.name} impossible : ${err.message}`, 'warn');
    }
  }
}

// ── Extension DotB : installée d'office dans tous les profils ──
const DOTB_EXT_ID = 'ancgmmmephcjikpmffmfinnlpamekedn';
let dotbInstalling = false;

async function ensureDotb(force = false) {
  if (dotbInstalling) return { ok: false, error: 'Installation déjà en cours' };
  const existing = store.extensions.find((e) => e.webstoreId === DOTB_EXT_ID);
  if (existing && !force && fs.existsSync(existing.path)) return { ok: true };
  if (!existing && store.settings.dotbRemoved && !force) return { ok: true };
  dotbInstalling = true;
  broadcast();
  try {
    const buf = await downloadBuffer(exts.crxUrl(DOTB_EXT_ID));
    if (existing) fs.rmSync(existing.path, { recursive: true, force: true });
    const rec = await installExtension(buf, existing ? { existing } : { source: 'webstore', webstoreId: DOTB_EXT_ID });
    rec.core = 'dotb';
    rec.enabled = existing ? existing.enabled : true;
    store.settings.dotbRemoved = false;
    save();
    log(`DotB ${existing ? 'réinstallée' : 'installée'} (v${rec.version}) — chargée dans chaque profil`, 'success');
    return { ok: true, version: rec.version };
  } catch (e) {
    log(`DotB : téléchargement impossible — ${e.message}`, 'error');
    return { ok: false, error: e.message };
  } finally {
    dotbInstalling = false;
    broadcast();
  }
}

// ── Import depuis Scalency (dossiers de profils Brave, ex. C:\\Profiles\\P002) ──
function listScalencyProfiles(dir) {
  dir = dir || store.settings.scalencyDir;
  if (!dir || !fs.existsSync(dir)) return { dir, profiles: [] };
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try { if (!fs.statSync(full).isDirectory()) continue; } catch { continue; }
    if (!fs.existsSync(path.join(full, 'Local State')) && !fs.existsSync(path.join(full, 'Default'))) continue;
    let pname = '';
    try {
      const prefs = JSON.parse(fs.readFileSync(path.join(full, 'Default', 'Preferences'), 'utf8'));
      pname = (prefs.profile && prefs.profile.name) || '';
      if (/^(personne|person|utilisateur|user)\s*\d*$|^(your|votre)\s|^(brave|chrome|chromium)\b/i.test(pname)) pname = '';
    } catch {}
    out.push({ dir: name, path: full, name: pname || name });
  }
  out.sort((a, b) => a.dir.localeCompare(b.dir, 'fr', { numeric: true }));
  return { dir, profiles: out };
}

async function importScalencyProfiles(items) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    send('gb:import-progress', { index: i, total: items.length, name: it.name });
    store.counter += 1;
    const p = newProfileObj(store.counter, { name: it.name, notes: `Importé de Scalency (${it.dir})` });
    try {
      await fs.promises.cp(it.path, p.dir, { recursive: true, force: true, filter: (s) => !SKIP_DIRS.has(path.basename(s)) && !/^Singleton|^lockfile$/.test(path.basename(s)) });
      p.importSource = { dir: it.path, profile: 'Default' };
      store.profiles.push(p);
      save();
      log(`${pcode(p)} importé depuis Scalency : ${it.name}`, 'success');
      results.push({ id: p.id, name: it.name, ok: true, src: { dir: it.path, profile: 'Default' } });
    } catch (e) {
      try { fs.rmSync(p.dir, { recursive: true, force: true }); } catch {}
      const msg = /EBUSY|EPERM|locked/i.test(e.message) ? 'fichiers verrouillés — ferme Scalency et ses profils puis réessaie' : e.message;
      results.push({ name: it.name, ok: false, error: msg });
      log(`Import Scalency échoué (${it.name}) : ${msg}`, 'error');
    }
    broadcast();
  }
  send('gb:import-progress', { done: true });
  verifyImported(results);
  return results;
}

// Après un import : vérifie que Vinted est bien connecté dans chaque profil importé
async function verifyImported(results) {
  for (const r of results.filter((x) => x.ok && x.id)) {
    const p = findProfile(r.id);
    if (!p) continue;
    if (r.src) await transferCookies(p, r.src.dir, r.src.profile);
    const logged = await checkVintedHeadless(r.id);
    if (logged === true) log(`${pcode(p)} ${p.name} : Vinted connecté ✓`, 'success');
    else if (logged === null && p.vinted && p.vinted.how === 'cookie') log(`${pcode(p)} ${p.name} : session Vinted copiée — elle sera confirmée à la première ouverture du profil`, 'info');
    else if (logged === false) log(`${pcode(p)} ${p.name} : Vinted NON connecté après import — cookies illisibles ou absents. Connecte-toi une fois dans le profil, ou utilise « Importer des connexions ».`, 'warn');
  }
}

// ── Activité DotB (calculée depuis les conversations) ──
const dotbActivityRunning = new Set();

async function dotbActivity(accountId) {
  if (dotbActivityRunning.has(accountId)) return { ok: false, error: 'Analyse déjà en cours' };
  dotbActivityRunning.add(accountId);
  const prog = (t) => send('gb:dotb-progress', { accountId, text: t });
  try {
    prog('Liste des conversations…');
    const list = await dotbFetch('GET', `/accounts/${encodeURIComponent(accountId)}/live-conversations`);
    if (list.error) {
      const reason = list.status === 503 ? 'Extension DotB hors ligne pour ce compte (ouvre le profil)'
        : list.status === 429 ? 'Limite DotB atteinte, réessaie dans 1 minute'
        : (list.data && list.data.error && (list.data.error.message || list.data.error)) || list.message || `Erreur ${list.status}`;
      return { ok: false, error: String(reason) };
    }
    const threads = (list.data && (list.data.data || list.data)) || [];
    const now = Date.now(), D1 = 864e5, D7 = 7 * 864e5;
    const recent = threads.filter((t) => t.updated_at && now - Date.parse(t.updated_at) < D7).slice(0, 15);
    const stats = {
      at: new Date().toISOString(), listed: threads.length, scanned: 0,
      unread: threads.filter((t) => t.unread).length,
      byType: {}, sent24: {}, sent7: {}, offers24: 0, offers7: 0, offersAccepted7: 0, received24: 0, lastAuto: null,
    };
    threads.forEach((t) => { const k = t.type || 'autre'; stats.byType[k] = (stats.byType[k] || 0) + 1; });
    for (let i = 0; i < recent.length; i++) {
      prog(`Analyse des conversations ${i + 1}/${recent.length}…`);
      await sleep(2200); // 30 requêtes / minute / compte
      const r = await dotbFetch('GET', `/accounts/${encodeURIComponent(accountId)}/live-conversations/${encodeURIComponent(recent[i].id)}`);
      if (r.error) { if (r.status === 429) await sleep(30000); continue; }
      const th = (r.data && (r.data.data || r.data)) || {};
      stats.scanned++;
      for (const m of th.messages || []) {
        const t = Date.parse(m.created_at || '');
        if (!t) continue;
        const age = now - t;
        const body = String(m.body || m.text || m.message || '');
        const fromVinted = m.system || /vinted/i.test(String((th.opposite_user && th.opposite_user.login) || th.title || ''));
        if (fromVinted && age < 7 * D1 && /(restreint|restriction|limit[ée]|suspendu|bloqu[ée])/i.test(body)) {
          const prof = store.profiles.find((p) => String(p.dotbAccountId) === String(accountId));
          if (prof) addRestriction(prof, { motif: /automatis|logiciel|robot|\bbot\b|script/i.test(body) ? 'automatisation' : 'autre', at: m.created_at, source: 'dotb', text: body });
        }
        if (m.mine && !m.system && !m.deleted) {
          const src = m.automated_source || (m.offer ? 'offre' : 'manuel');
          if (age < D7) stats.sent7[src] = (stats.sent7[src] || 0) + 1;
          if (age < D1) stats.sent24[src] = (stats.sent24[src] || 0) + 1;
          if (m.automated_source && (!stats.lastAuto || t > Date.parse(stats.lastAuto))) stats.lastAuto = m.created_at;
        } else if (!m.mine && !m.system && age < D1) stats.received24++;
        if (m.offer && m.offer.kind === 'offer_message' && m.mine) {
          if (age < D7) stats.offers7++;
          if (age < D1) stats.offers24++;
          if (age < D7 && m.offer.status === 20) stats.offersAccepted7++;
        }
      }
    }
    store.dotbActivity = store.dotbActivity || {};
    store.dotbActivity[accountId] = stats;
    save();
    broadcast();
    return { ok: true, stats };
  } finally {
    dotbActivityRunning.delete(accountId);
    send('gb:dotb-progress', { accountId, text: '' });
  }
}

async function dotbOverview() {
  const out = { at: new Date().toISOString() };
  const counts = await dotbFetch('GET', '/notifications/counts');
  if (!counts.error) out.counts = counts.data;
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const types = 'publish.succeeded,publish.failed,order.created,order.claim_opened';
  const evs = await dotbFetch('GET', `/events?type=${encodeURIComponent(types)}&since=${encodeURIComponent(since)}&limit=100`);
  if (!evs.error) {
    const list = (evs.data && evs.data.data) || [];
    out.events = {};
    for (const e of list) {
      const acc = (e.data && (e.data.vinted_account_id || e.data.account_id || (e.data.account && e.data.account.id))) || '_';
      out.events[acc] = out.events[acc] || {};
      out.events[acc][e.type] = (out.events[acc][e.type] || 0) + 1;
      out.events._all = out.events._all || {};
      if (acc !== '_') out.events._all[e.type] = (out.events._all[e.type] || 0) + 1;
    }
    out.eventsMore = !!(evs.data && evs.data.has_more);
  } else out.eventsError = evs.status === 403 ? 'scope' : String(evs.status || evs.message);
  store.dotbOverview = out;
  save();
  broadcast();
  return out;
}

// ── API DotB ──────────────────────────────────────────
function dotbFetch(method, endpoint, body = null) {
  return new Promise((resolve) => {
    const token = store.settings.dotbToken;
    if (!token) return resolve({ error: true, message: 'NO_TOKEN' });
    const req = net.request({ url: DOTB_API + endpoint, method });
    req.setHeader('Authorization', `Bearer ${token}`);
    req.setHeader('Accept', 'application/json');
    if (body) req.setHeader('Content-Type', 'application/json');
    let data = '';
    req.on('response', (res) => {
      res.on('data', (c) => { data += c.toString(); });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ error: res.statusCode >= 400, status: res.statusCode, data: parsed });
      });
    });
    req.on('error', (e) => resolve({ error: true, message: e.message }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Fenêtre ───────────────────────────────────────────
let forceQuit = false;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 840,
    minWidth: 1150,
    minHeight: 660,
    title: 'GB Browser',
    icon: assetPath('icon.png'),
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.webContents.on('render-process-gone', (_, d) => log(`Interface plantée : ${d.reason}`, 'error'));
  mainWindow.webContents.on('preload-error', (_, p, e) => log(`Erreur preload : ${e.message}`, 'error'));
  mainWindow.webContents.on('console-message', (_, level, message, line, source) => {
    if (level >= 3) log(`Interface : ${message} (${path.basename(source || '')}:${line})`, 'error');
  });
  if (process.env.GB_SCREENSHOT) {
    mainWindow.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await mainWindow.webContents.capturePage();
      fs.writeFileSync(process.env.GB_SCREENSHOT, img.toPNG());
      forceQuit = true;
      app.quit();
    }, 2500));
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  mainWindow.on('close', (e) => {
    if (forceQuit) return;
    const relayed = [...running].filter(([id, r]) => r.relay && openSet.has(id));
    if (!relayed.length) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Annuler', 'Fermer GB et ces profils'],
      defaultId: 0, cancelId: 0, title: 'GB Browser',
      message: `${relayed.length} profil(s) ouvert(s) utilisent un proxy avec identifiant.`,
      detail: 'Ce proxy passe par GB Browser : si tu fermes GB, ces profils perdent leur connexion. Ils seront fermés proprement.',
    });
    if (choice === 1) {
      forceQuit = true;
      Promise.all(relayed.map(([id]) => closeProfile(id))).finally(() => mainWindow.close());
    }
  });
}

// ── IPC ───────────────────────────────────────────────
function handle(ch, fn) {
  ipcMain.handle(ch, async (_, ...args) => {
    try { return await fn(...args); } catch (e) {
      log(`Erreur ${ch} : ${e.message}`, 'error');
      return { ok: false, error: e.message };
    }
  });
}

const PROFILE_FIELDS = ['name', 'notes', 'tags', 'status', 'proxy', 'dotbAccountId', 'dotbAccountLabel', 'startUrl', 'keepAlive', 'dotbAuto', 'autoWarm', 'sourcing'];

function setupIPC() {
  handle('gb:state', () => publicState());

  // Profils
  handle('profile:create', (data = {}) => {
    const count = Math.max(1, Math.min(100, parseInt(data.count, 10) || 1));
    const created = [];
    for (let i = 0; i < count; i++) {
      store.counter += 1;
      const d = { ...data };
      if (count > 1) d.name = `${data.name || 'Profil'} ${i + 1}`;
      const p = newProfileObj(store.counter, d);
      store.profiles.push(p);
      created.push(p);
      log(`${pcode(p)} créé : ${p.name}`, 'success');
    }
    save(); broadcast();
    return created[0];
  });
  handle('profile:update', (id, data = {}) => {
    const p = findProfile(id);
    if (!p) return null;
    const proxyChanged = 'proxy' in data && data.proxy !== p.proxy;
    for (const k of PROFILE_FIELDS) if (k in data) p[k] = data[k];
    if (data.sourcing) {
      // un seul profil Sourcing ; DotB jamais lancé dedans ; l'extension Groupe Barbaray s'installe toute seule
      for (const o of store.profiles) if (o.id !== p.id && o.sourcing) o.sourcing = false;
      p.dotbAuto = false;
      log(`${pcode(p)} : profil Sourcing SHEIN (mode nuit 00h–07h)`, 'success');
      setTimeout(() => syncGbExtension().catch((e) => log(`Extension Groupe Barbaray : ${e.message}`, 'warn')), 1500);
    }
    if ('sourcing' in data && running.has(p.id)) applyTaskbarIcon(p.id).catch(() => {});
    if (proxyChanged) {
      p.proxyTest = null;
      if (openSet.has(id)) log(`${pcode(p)} : nouveau proxy appliqué à la prochaine ouverture`, 'warn');
    }
    save(); broadcast();
    return p;
  });
  handle('profile:setStatus', (ids, status) => {
    for (const id of ids) { const p = findProfile(id); if (p) p.status = status; }
    save(); broadcast();
    return true;
  });
  handle('profile:delete', async (ids) => {
    for (const id of ids) {
      const p = findProfile(id);
      if (!p) continue;
      if (await portAlive(portOf(p))) await closeProfile(id, { quiet: true });
      store.profiles = store.profiles.filter((x) => x.id !== id);
      try { fs.rmSync(p.dir, { recursive: true, force: true }); } catch {}
      openSet.delete(id);
      log(`${pcode(p)} supprimé : ${p.name}`, 'warn');
    }
    save(); broadcast();
    return true;
  });
  handle('profile:open', async (ids, opts = {}) => {
    const errors = [];
    for (const id of ids) {
      const r = await openProfile(id, opts);
      if (!r.ok) errors.push(r.error);
      if (ids.length > 1) await sleep(800);
    }
    return { ok: errors.length === 0, errors };
  });
  handle('profile:openReady', async () => {
    const ids = store.profiles.filter((p) => p.status === 'ready' && !openSet.has(p.id)).map((p) => p.id);
    const errors = [];
    for (const id of ids) {
      const r = await openProfile(id);
      if (!r.ok) errors.push(r.error);
      await sleep(1200);
    }
    if (ids.length) log(`Lancer READY : ${ids.length} profil(s)`, 'info');
    return { ok: errors.length === 0, count: ids.length, errors };
  });
  handle('profile:close', async (ids) => { await Promise.all(ids.map((id) => closeProfile(id))); return true; });
  handle('profile:warm', (id) => warmProfile(id));
  handle('profile:folder', (id) => {
    const p = findProfile(id);
    if (p) { fs.mkdirSync(p.dir, { recursive: true }); shell.openPath(p.dir); }
    return true;
  });
  handle('profile:importCookies', async ({ id, newName, text }) => {
    let pid = id;
    if (!pid) {
      store.counter += 1;
      const p = newProfileObj(store.counter, { name: newName || undefined });
      store.profiles.push(p);
      save(); broadcast();
      log(`${pcode(p)} créé : ${p.name}`, 'success');
      pid = p.id;
    }
    return importCookies(pid, text);
  });
  handle('file:readText', async (filters) => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: filters || [] });
    if (r.canceled || !r.filePaths[0]) return null;
    return { name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
  });

  // Automatisations DotB
  handle('dotb:runAuto', (id) => runDotbAuto(id, { force: true }));
  handle('dotb:diagnose', async (id) => {
    const p = findProfile(id);
    if (!p || !(await portAlive(portOf(p)))) return { ok: false, error: 'Ouvre le profil d’abord' };
    const c = await CDP.forPort(portOf(p));
    try {
      const { info, png } = await dotbauto.diagnose(c);
      const dir = path.join(app.getPath('desktop'), 'GB-diagnostic-DotB');
      fs.mkdirSync(dir, { recursive: true });
      const base = path.join(dir, `${pcode(p)}-${Date.now()}`);
      fs.writeFileSync(base + '.json', JSON.stringify(info, null, 2));
      if (png) fs.writeFileSync(base + '.png', png);
      shell.openPath(dir);
      log(`${pcode(p)} : diagnostic DotB enregistré sur le Bureau (GB-diagnostic-DotB)`, 'success');
      return { ok: true, dir };
    } finally { c.close(); }
  });
  handle('health:sheet', (id, sheet) => {
    const p = findProfile(id);
    if (!p) return false;
    p.sheet = { ...(p.sheet || {}), ...sheet };
    if ('closedByVinted' in sheet) { p.closedByVinted = !!sheet.closedByVinted; delete p.sheet.closedByVinted; }
    save(); broadcast();
    return true;
  });
  handle('health:addRestriction', (id, r) => { const p = findProfile(id); return p ? addRestriction(p, { ...r, source: 'manuel' }) : false; });
  handle('health:delRestriction', (id, rid) => {
    const p = findProfile(id);
    if (!p) return false;
    p.restrictions = (p.restrictions || []).filter((r) => r.id !== rid);
    save(); broadcast();
    return true;
  });
  handle('health:liftRestriction', (id, rid) => {
    const p = findProfile(id);
    const r = p && (p.restrictions || []).find((x) => x.id === rid);
    if (r) { r.liftedAt = new Date().toISOString(); save(); broadcast(); }
    return true;
  });
  handle('health:prudence', (ids, hours) => { for (const id of ids) { const p = findProfile(id); if (p) setPrudence(p, hours, false, 'posée à la main'); } return true; });
  handle('dotb:stopAuto', (id) => stopDotbAuto(id));
  handle('morning:run', () => morningCheck(true));
  handle('ram:purge', async () => { await purgeAll(); ramCache.at = 0; return true; });
  handle('update:check', async () => { if (!updater) return updateState; await updater.checkForUpdates().catch((e) => { updateState = { status: 'error', error: e.message }; }); return updateState; });
  handle('update:install', () => { if (updater && updateState.status === 'ready') { forceQuit = true; updater.quitAndInstall(false, true); } return true; });
  handle('profile:warmPlan', (id, on) => {
    const p = findProfile(id);
    if (!p) return false;
    p.warmPlan = on ? { start: new Date().toISOString() } : null;
    p.nextWarmAt = null;
    save(); broadcast();
    log(`${pcode(p)} : plan de chauffe 7 jours ${on ? 'lancé' : 'arrêté'}`);
    return true;
  });
  handle('profile:newFingerprint', async (id) => {
    const p = findProfile(id);
    if (!p) return null;
    p.fp = FP.generate(p.id + ':' + Date.now(), await realHardware());
    save(); broadcast();
    log(`${pcode(p)} : nouvelle empreinte (appliquée à la prochaine ouverture)`, 'warn');
    return p.fp;
  });
  handle('sys:ram', async () => {
    if (Date.now() - ramCache.at > 10000) ramCache = { at: Date.now(), data: await measureRam() };
    return { profiles: ramCache.data, total: os.totalmem(), free: os.freemem() };
  });

  // Comptes en création
  const enc = (t) => (t && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t).toString('base64') : t ? 'plain:' + t : '');
  const dec = (t) => { if (!t) return ''; if (t.startsWith('plain:')) return t.slice(6); try { return safeStorage.decryptString(Buffer.from(t, 'base64')); } catch { return ''; } };
  handle('acc:save', (a) => {
    store.accounts = store.accounts || [];
    let rec = a.id && store.accounts.find((x) => x.id === a.id);
    if (!rec) { rec = { id: crypto.randomBytes(5).toString('hex'), createdAt: null, addedProfileId: null, at: new Date().toISOString() }; store.accounts.push(rec); }
    for (const k of ['email', 'phone', 'pseudo', 'proxy', 'notes']) if (k in a) rec[k] = String(a[k] || '').trim();
    if ('password' in a && a.password !== '__keep__') rec.password = enc(a.password || '');
    save(); broadcast();
    return rec.id;
  });
  handle('acc:delete', (id) => { store.accounts = (store.accounts || []).filter((x) => x.id !== id); save(); broadcast(); return true; });
  handle('acc:created', (id, on = true) => {
    const a = (store.accounts || []).find((x) => x.id === id);
    if (!a) return false;
    a.createdAt = on ? new Date().toISOString() : null;
    a.readyNotified = false;
    save(); broadcast();
    if (on) log(`Compte ${a.pseudo || a.email} créé — prêt dans 24 h`, 'success');
    return true;
  });
  handle('acc:password', (id) => { const a = (store.accounts || []).find((x) => x.id === id); return a ? dec(a.password) : ''; });
  handle('acc:copy', (text) => { clipboard.writeText(String(text || '')); return true; });
  handle('acc:addToBrowser', (id, { plan = true } = {}) => {
    const a = (store.accounts || []).find((x) => x.id === id);
    if (!a) return { ok: false, error: 'Compte introuvable' };
    store.counter += 1;
    const p = newProfileObj(store.counter, {
      name: a.pseudo || a.email.split('@')[0] || `Compte ${store.counter}`,
      proxy: a.proxy || '',
      notes: [a.email && `Email : ${a.email}`, a.phone && `Tél : ${a.phone}`, a.notes].filter(Boolean).join('\n'),
    });
    p.accountId = a.id;
    if (plan) p.warmPlan = { start: new Date().toISOString() };
    store.profiles.push(p);
    a.addedProfileId = p.id;
    save(); broadcast();
    log(`${pcode(p)} créé depuis le compte ${a.pseudo || a.email}${plan ? ' — plan de chauffe 7 jours lancé' : ''}`, 'success');
    return { ok: true, id: p.id };
  });

  // Scalency
  handle('scalency:list', (dir) => listScalencyProfiles(dir));
  handle('scalency:import', (items) => importScalencyProfiles(items));
  handle('profile:checkVinted', async (id) => {
    const p = findProfile(id);
    const logged = p && (await portAlive(portOf(p))) ? await refreshVinted(id) : await checkVintedHeadless(id);
    if (p) log(`${pcode(p)} : Vinted ${logged ? 'connecté' : logged === false ? 'non connecté' : 'état inconnu'}`, logged ? 'success' : 'warn');
    return logged;
  });
  handle('profile:warmStop', (id) => { warmStops.add(id); return true; });
  handle('profile:recopyCookies', async (id) => {
    const p = findProfile(id);
    if (!p || !p.importSource) return { ok: false, error: 'Ce profil n’a pas été importé depuis Brave ou Scalency' };
    if (await portAlive(portOf(p))) await closeProfile(id, { quiet: true });
    await transferCookies(p, p.importSource.dir, p.importSource.profile);
    const logged = await checkVintedHeadless(id);
    return { ok: true, logged };
  });
  handle('profile:warmMany', async (ids) => {
    const queue = [...ids];
    const worker = async () => { while (queue.length) await warmProfile(queue.shift()); };
    await Promise.all([worker(), worker()]); // 2 warms en parallèle maximum
    return true;
  });
  handle('profile:openUrl', async (id, url) => {
    const p = findProfile(id);
    if (!p) return { ok: false, error: 'Profil introuvable' };
    if (await portAlive(portOf(p))) {
      const c = await CDP.forPort(portOf(p));
      try { await c.send('Target.createTarget', { url }); } finally { c.close(); }
      return { ok: true };
    }
    return openProfile(id, { url });
  });
  handle('dotb:ensureExt', () => ensureDotb(true));
  handle('dotb:copySession', async (sourceId, targetIds) => {
    const src = findProfile(sourceId);
    if (!src) return { ok: false, error: 'Profil source introuvable' };
    let wasOpen = await portAlive(portOf(src)), cookies;
    try {
      if (!wasOpen) {
        const r = await openProfile(sourceId, { headless: true, url: 'about:blank' });
        if (!r.ok) throw new Error(r.error);
        if (!(await waitAlive(portOf(src)))) throw new Error('le profil source ne répond pas');
      }
      const c = await CDP.forPort(portOf(src));
      try { cookies = (await c.send('Storage.getCookies')).cookies.filter((k) => /(^|\.)dotb\.io$/.test(k.domain)); }
      finally {
        if (!wasOpen) await c.send('Browser.close').catch(() => {});
        c.close();
      }
      if (!wasOpen) await waitHeadlessExit(sourceId);
    } catch (e) { return { ok: false, error: e.message }; }
    if (!cookies.length) return { ok: false, error: `Aucune session DotB dans ${pcode(src)} : connecte-toi d’abord à DotB dans ce profil.` };
    const conv = cookies.map((k) => ({ ...k, expirationDate: k.expires > 0 ? k.expires : undefined, hostOnly: !k.domain.startsWith('.'), sameSite: k.sameSite }));
    let ok = 0;
    for (const id of targetIds) {
      if (id === sourceId) continue;
      const r = await importCookies(id, conv);
      if (r.ok) ok++;
    }
    log(`Session DotB de ${pcode(src)} copiée dans ${ok} profil(s) (${cookies.length} cookies dotb.io)`, ok ? 'success' : 'warn');
    return { ok: true, copied: ok, cookies: cookies.length };
  });
  handle('dotb:activity', (accountId) => dotbActivity(accountId));
  handle('dotb:overview', () => dotbOverview());

  // Brave
  handle('brave:list', () => browsers.listBraveProfiles());
  handle('brave:import', (dirs) => importBraveProfiles(dirs));

  // Proxies
  handle('proxy:set', (id, raw) => {
    const p = findProfile(id);
    if (!p) return { ok: false, error: 'Profil introuvable' };
    raw = String(raw || '').trim();
    if (raw && !proxy.parseProxy(raw)) return { ok: false, error: 'Format de proxy illisible' };
    p.proxy = raw;
    p.proxyTest = null;
    save(); broadcast();
    log(raw ? `${pcode(p)} : proxy configuré (${proxy.label(proxy.parseProxy(raw))})` : `${pcode(p)} : proxy retiré (IP réelle)`, 'info');
    if (openSet.has(id)) log(`${pcode(p)} : ferme et rouvre le profil pour appliquer le proxy`, 'warn');
    return { ok: true };
  });
  handle('proxy:test', (id) => testProfileProxy(id));
  handle('proxy:testAll', async () => {
    const ids = store.profiles.filter((p) => p.proxy).map((p) => p.id);
    for (let i = 0; i < ids.length; i += 5) await Promise.all(ids.slice(i, i + 5).map(testProfileProxy));
    return ids.length;
  });
  handle('proxy:testRaw', async (raw) => {
    const parsed = proxy.parseProxy(raw);
    if (!parsed) return { ok: false, error: 'Format illisible' };
    return proxy.testProxy(parsed, store.settings.proxyTimeout);
  });
  handle('proxy:import', ({ text, createMissing }) => {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const bad = lines.filter((l) => !proxy.parseProxy(l));
    const good = lines.filter((l) => proxy.parseProxy(l));
    const free = store.profiles.filter((p) => !p.proxy).sort((a, b) => a.num - b.num);
    let assigned = 0, created = 0;
    for (const line of good) {
      let p = free.shift();
      if (!p) {
        if (!createMissing) break;
        store.counter += 1;
        p = newProfileObj(store.counter, {});
        store.profiles.push(p);
        created++;
      }
      p.proxy = line;
      p.proxyTest = null;
      assigned++;
    }
    save(); broadcast();
    log(`Import de proxies : ${assigned} attribué(s)${created ? `, ${created} profil(s) créé(s)` : ''}${bad.length ? `, ${bad.length} ligne(s) illisible(s)` : ''}`, assigned ? 'success' : 'warn');
    return { assigned, created, bad, left: good.length - assigned };
  });

  // Extensions
  handle('ext:addWebstore', (url) => (exts.webstoreId(url) === DOTB_EXT_ID ? ensureDotb(true) : addWebstore(url)));
  handle('ext:addFile', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisis l’extension (.crx ou .zip)', properties: ['openFile'],
      filters: [{ name: 'Extension', extensions: ['crx', 'zip'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const rec = await installExtension(fs.readFileSync(r.filePaths[0]), { source: 'fichier' });
    log(`Extension importée : ${rec.name} ${rec.version}`, 'success');
    return { ok: true };
  });
  handle('ext:addFolder', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisis le dossier de l’extension (celui qui contient manifest.json)', properties: ['openDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    const manifest = exts.readManifest(src);
    if (!manifest) return { ok: false, error: 'Pas de manifest.json lisible dans ce dossier.' };
    const id = crypto.randomBytes(5).toString('hex');
    const dest = path.join(EXT_DIR, id);
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(path.join(dest, '_metadata'), { recursive: true, force: true });
    const rec = { id, name: exts.resolveName(dest, manifest), version: manifest.version || '?', path: dest, enabled: true, source: 'dossier', updatedAt: new Date().toISOString() };
    store.extensions.push(rec);
    save(); broadcast();
    log(`Extension importée : ${rec.name} ${rec.version}`, 'success');
    return { ok: true };
  });
  handle('ext:toggle', (id) => {
    const e = store.extensions.find((x) => x.id === id);
    if (e) { e.enabled = !e.enabled; log(`Extension ${e.name} ${e.enabled ? 'activée' : 'désactivée'}`); }
    save(); broadcast();
    return true;
  });
  handle('ext:delete', (id) => {
    const e = store.extensions.find((x) => x.id === id);
    if (e) { try { fs.rmSync(e.path, { recursive: true, force: true }); } catch {} log(`Extension retirée : ${e.name}`, 'warn'); }
    if (e && e.webstoreId === DOTB_EXT_ID) store.settings.dotbRemoved = true;
    store.extensions = store.extensions.filter((x) => x.id !== id);
    save(); broadcast();
    return true;
  });
  handle('ext:updateAll', async () => { await updateWebstoreExtensions(true); return true; });

  // Journal
  handle('log:copy', () => {
    clipboard.writeText(logs.map((l) => `${l.t} [${l.level}] ${l.msg}`).join('\n'));
    return true;
  });
  handle('log:clear', () => { logs = []; broadcast(); return true; });

  // Paramètres
  handle('settings:save', (data = {}) => {
    const allowed = ['browserPath', 'profilesDir', 'startUrl', 'gbUrl', 'theme', 'dotbToken', 'proxyTimeout', 'warmIntensity', 'closeWelcome', 'scalencyDir', 'startUrls', 'fpEnabled', 'notify', 'ecoRam', 'autoWarm', 'allow3pCookies', 'autoPrudence', 'memorySaver', 'autoUpdate', 'morningCheck', 'pubAlert', 'gbKey', 'vintedIcon', 'shieldsOffVinted', 'autoStart', 'nightlyRestart', 'shieldsOffAll', 'nightShein', 'autoRaise', 'dotbRange'];
    for (const k of allowed) if (k in data) store.settings[k] = data[k];
    if ('profilesDir' in data) {
      store.settings.profilesDir = data.profilesDir || DEFAULT_PROFILES_DIR;
      fs.mkdirSync(store.settings.profilesDir, { recursive: true });
    }
    if ('proxyTimeout' in data) store.settings.proxyTimeout = Math.max(2, Math.min(60, Number(data.proxyTimeout) || 8));
    save(); broadcast();
    if ('dotbToken' in data && data.dotbToken) setTimeout(() => dotbWatch().catch(() => {}), 500);
    if ('autoStart' in data) applyAutoStart();
    return true;
  });
  handle('gb:push', () => gbPush(true));
  handle('settings:pickBrowser', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Choisis brave.exe', properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Programme', extensions: ['exe'] }] : [],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('settings:pickFolder', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { title: 'Dossier des profils', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('app:openDataDir', () => shell.openPath(DATA_DIR));
  handle('app:openExternal', (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return true; });

  // DotB
  handle('dotb:get', (endpoint) => {
    if (!/^\/[a-z0-9\-_/?=&.%]*$/i.test(endpoint)) return { error: true, message: 'Endpoint invalide' };
    return dotbFetch('GET', endpoint);
  });
}

nativeTheme.on('updated', broadcast);

// ── Démarrage ─────────────────────────────────────────
app.whenReady().then(() => {
  log(`GB Browser ${app.getVersion()} démarré (Electron ${process.versions.electron})`);
  setupIPC();
  createWindow();
  const b = browsers.detect(store.settings.browserPath);
  if (b) log(`Navigateur : ${b.name} (${b.path})`);
  else log('Brave introuvable — installe Brave ou indique brave.exe dans Paramètres', 'error');
  poll();
  setInterval(poll, 3000);
  setInterval(() => { for (const id of openSet) if (!busy.has(id)) refreshVinted(id); }, 60000);
  setTimeout(ensureDotb, 3000);
  setInterval(() => scheduler().catch(() => {}), 60000);
  setTimeout(() => scheduler().catch(() => {}), 20000);
  setInterval(() => dotbWatch().catch(() => {}), 180000);
  setInterval(() => pubWatch().catch(() => {}), 300000);
  setInterval(() => gbPush().catch(() => {}), 300000);
  setInterval(() => keepDotbFront().catch(() => {}), 300000);
  setInterval(() => raiseTick().catch(() => {}), 10 * 60e3);
  setTimeout(() => syncGbExtension().catch(() => {}), 90e3);
  setInterval(() => syncGbExtension().catch(() => {}), 6 * 3600e3);
  // Nouvelles fenêtres ouvertes dans un profil : on leur remet l'icône Vinted
  setInterval(() => { for (const id of openSet) applyTaskbarIcon(id).catch(() => {}); }, 15000);
  setTimeout(() => gbPush().catch(() => {}), 45000);
  setInterval(() => { if (store.settings.ecoRam !== false) purgeAll().catch(() => {}); }, 20 * 60e3);
  setTimeout(() => refreshRealIp().then(checkConflicts).catch(() => {}), 8000);
  setupUpdater();
  applyAutoStart();
  if (process.argv.includes('--autostart')) setTimeout(() => reopenAfterBoot().catch(() => {}), 20000);
  setTimeout(() => dotbWatch().catch(() => {}), 30000);
  setTimeout(() => updateWebstoreExtensions(false), 15000);
});

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.on('window-all-closed', () => {
  for (const [, r] of running) if (r.relay) r.relay.stop();
  winicon.stop();
  app.quit();
});

process.on('uncaughtException', (err) => log(`ERREUR : ${err.stack || err.message}`, 'error'));
process.on('unhandledRejection', (r) => log(`Promesse rejetée : ${r}`, 'error'));
