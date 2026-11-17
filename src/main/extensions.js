// Extensions : Chrome Web Store (.crx), fichier .crx/.zip, dossier décompressé
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const webstoreId = (s) => {
  const m = String(s || '').match(/\b([a-p]{32})\b/);
  return m ? m[1] : null;
};

const crxUrl = (id) =>
  `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0.0.0&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;

// ID d'extension = 16 premiers octets du sha256 de la clé publique, chiffres 0-f -> lettres a-p
function idFromKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)
    .split('').map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

// Lecture protobuf minimale (en-tête CRX3)
function readVarint(buf, pos) {
  let result = 0n, shift = 0n, b;
  do {
    b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
  } while (b & 0x80);
  return [Number(result), pos];
}
function parseProto(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    [tag, pos] = readVarint(buf, pos);
    const field = Math.floor(tag / 8), wt = tag & 7;
    if (wt === 0) { let v; [v, pos] = readVarint(buf, pos); fields.push({ field, value: v }); }
    else if (wt === 2) { let len; [len, pos] = readVarint(buf, pos); fields.push({ field, bytes: buf.slice(pos, pos + len) }); pos += len; }
    else if (wt === 1) pos += 8;
    else if (wt === 5) pos += 4;
    else break;
  }
  return fields;
}

// Retourne { zip, key } à partir d'un .crx (v2 ou v3) ou d'un .zip
function parseCrx(buf) {
  if (buf.slice(0, 2).toString() === 'PK') return { zip: buf, key: null };
  if (buf.slice(0, 4).toString() !== 'Cr24') throw new Error('Fichier non reconnu (ni .crx ni .zip)');
  const ver = buf.readUInt32LE(4);
  if (ver === 2) {
    const kl = buf.readUInt32LE(8), sl = buf.readUInt32LE(12);
    return { zip: buf.slice(16 + kl + sl), key: buf.slice(16, 16 + kl) };
  }
  const hl = buf.readUInt32LE(8);
  const header = buf.slice(12, 12 + hl);
  const zip = buf.slice(12 + hl);
  const top = parseProto(header);
  let crxId = null;
  const signed = top.find((f) => f.field === 10000 && f.bytes);
  if (signed) {
    const s = parseProto(signed.bytes).find((f) => f.field === 1 && f.bytes);
    if (s) crxId = s.bytes.toString('hex').split('').map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  }
  const keys = top.filter((f) => (f.field === 2 || f.field === 3) && f.bytes)
    .map((f) => (parseProto(f.bytes).find((x) => x.field === 1 && x.bytes) || {}).bytes)
    .filter(Boolean);
  const key = keys.find((k) => idFromKey(k) === crxId) || keys[0] || null;
  return { zip, key };
}

function unzip(zipPath, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dest, { recursive: true });
    const child = process.platform === 'win32'
      ? spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`], { windowsHide: true })
      : spawn('unzip', ['-o', '-q', zipPath, '-d', dest]);
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `décompression impossible (code ${code})`))));
  });
}

function readManifest(dir) {
  const mf = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mf)) return null;
  try { return JSON.parse(fs.readFileSync(mf, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

function resolveName(dir, manifest) {
  let name = manifest.name || path.basename(dir);
  const m = /^__MSG_(.+)__$/.exec(name);
  if (m) {
    const locales = [manifest.default_locale, 'fr', 'en'].filter(Boolean);
    for (const loc of locales) {
      try {
        const msgs = JSON.parse(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8').replace(/^﻿/, ''));
        const entry = msgs[m[1]] || msgs[m[1].toLowerCase()] ||
          Object.entries(msgs).find(([k]) => k.toLowerCase() === m[1].toLowerCase())?.[1];
        if (entry && entry.message) { name = entry.message; break; }
      } catch {}
    }
  }
  return name;
}

// Décompresse un crx/zip dans dest, ajoute la clé (garde l'ID officiel), retire _metadata
async function installFromBuffer(buf, dest) {
  const { zip, key } = parseCrx(buf);
  const tmp = path.join(os.tmpdir(), `gb-ext-${crypto.randomBytes(4).toString('hex')}.zip`);
  fs.writeFileSync(tmp, zip);
  const staging = dest + '.new';
  fs.rmSync(staging, { recursive: true, force: true });
  try {
    await unzip(tmp, staging);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  // Certaines archives contiennent un dossier racine
  let root = staging;
  if (!fs.existsSync(path.join(root, 'manifest.json'))) {
    const sub = fs.readdirSync(root).map((n) => path.join(root, n)).find((p) => fs.existsSync(path.join(p, 'manifest.json')));
    if (!sub) { fs.rmSync(staging, { recursive: true, force: true }); throw new Error('Pas de manifest.json dans l’archive'); }
    root = sub;
  }
  // Chrome refuse de charger une extension décompressée qui contient _metadata
  fs.rmSync(path.join(root, '_metadata'), { recursive: true, force: true });
  const manifest = readManifest(root);
  if (key && manifest && !manifest.key) {
    manifest.key = key.toString('base64');
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(root, dest);
  if (root !== staging) fs.rmSync(staging, { recursive: true, force: true });
  return { manifest, extId: key ? idFromKey(key) : null };
}

module.exports = { webstoreId, crxUrl, installFromBuffer, readManifest, resolveName, idFromKey, parseCrx };
