// Détection de Brave / Chrome et des dossiers de profils Brave
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

function candidates() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const la = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
    const brave = ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'];
    const chrome = ['Google', 'Chrome', 'Application', 'chrome.exe'];
    return [
      { name: 'Brave', path: path.join(pf, ...brave) },
      { name: 'Brave', path: path.join(pf86, ...brave) },
      { name: 'Brave', path: path.join(la, ...brave) },
      { name: 'Chrome', path: path.join(pf, ...chrome) },
      { name: 'Chrome', path: path.join(pf86, ...chrome) },
      { name: 'Chrome', path: path.join(la, ...chrome) },
    ];
  }
  if (process.platform === 'darwin') {
    return [
      { name: 'Brave', path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
      { name: 'Brave', path: path.join(home, 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser') },
      { name: 'Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    ];
  }
  return [
    { name: 'Brave', path: '/usr/bin/brave-browser' },
    { name: 'Brave', path: '/usr/bin/brave' },
    { name: 'Brave', path: '/snap/bin/brave' },
    { name: 'Chrome', path: '/usr/bin/google-chrome' },
    { name: 'Chromium', path: '/usr/bin/chromium' },
  ];
}

function guessName(p) {
  const l = p.toLowerCase();
  if (l.includes('brave')) return 'Brave';
  if (l.includes('chrome')) return 'Chrome';
  if (l.includes('chromium')) return 'Chromium';
  return 'Navigateur';
}

function detect(customPath) {
  if (customPath && fs.existsSync(customPath)) return { name: guessName(customPath), path: customPath, custom: true };
  for (const c of candidates()) {
    if (fs.existsSync(c.path)) return c;
  }
  return null;
}

function braveUserDataDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const la = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
    return path.join(la, 'BraveSoftware', 'Brave-Browser', 'User Data');
  }
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser');
  return path.join(home, '.config', 'BraveSoftware', 'Brave-Browser');
}

// Liste les profils Brave existants (lus dans "Local State")
function listBraveProfiles() {
  const dir = braveUserDataDir();
  const ls = path.join(dir, 'Local State');
  if (!fs.existsSync(ls)) return { dir, profiles: [] };
  let state = {};
  try { state = JSON.parse(fs.readFileSync(ls, 'utf8')); } catch { return { dir, profiles: [] }; }
  const cache = (state.profile && state.profile.info_cache) || {};
  const profiles = Object.entries(cache)
    .filter(([d]) => fs.existsSync(path.join(dir, d)))
    .map(([d, info]) => ({
      dir: d,
      name: info.name || d,
      user: info.user_name || info.gaia_name || '',
    }));
  return { dir, profiles };
}

// Ferme de force un navigateur lancé avec ce --user-data-dir (si on n'a pas son process)
function killByUserDataDir(userDataDir) {
  return new Promise((resolve) => {
    let child;
    if (process.platform === 'win32') {
      const d = userDataDir.replace(/'/g, "''");
      const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${d}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
    } else {
      child = spawn('pkill', ['-f', `--user-data-dir=${userDataDir}`]);
    }
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

// Supprime les verrous laissés par un navigateur planté (pour « Ouvrir (forcer) »)
function removeLocks(userDataDir) {
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
    try { fs.rmSync(path.join(userDataDir, f), { force: true }); } catch {}
  }
}

// Microsoft Edge « normal » (installé d'office sur Windows) : utilisé pour le profil Sourcing SHEIN,
// sans empreinte modifiée — Brave + empreinte simulée ressemblent trop à un navigateur déguisé pour l'anti-robot de SHEIN.
function detectEdge() {
  if (process.platform !== 'win32') return null;
  const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  for (const base of [pf86, pf]) {
    const p = path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (fs.existsSync(p)) return { name: 'Edge', path: p };
  }
  return null;
}

module.exports = { detect, detectEdge, braveUserDataDir, listBraveProfiles, killByUserDataDir, removeLocks };
