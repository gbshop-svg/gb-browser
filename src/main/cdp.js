// Mini client Chrome DevTools Protocol (WebSocket) sans dépendance
// Sert à fermer proprement un profil, faire un warm et importer des cookies.
const net = require('net');
const http = require('http');
const crypto = require('crypto');

function browserWsUrl(port, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d).webSocketDebuggerUrl); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._onClose());
    socket.on('error', () => this._onClose());
  }

  static connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const u = new URL(wsUrl);
      const key = crypto.randomBytes(16).toString('base64');
      const socket = net.connect(+u.port, u.hostname, () => {
        socket.write(
          `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
        );
      });
      let head = Buffer.alloc(0);
      const onHead = (d) => {
        head = Buffer.concat([head, d]);
        const i = head.indexOf('\r\n\r\n');
        if (i === -1) return;
        socket.removeListener('data', onHead);
        socket.removeListener('error', reject);
        if (!/^HTTP\/1\.1 101/.test(head.slice(0, i).toString())) {
          socket.destroy();
          return reject(new Error('Handshake DevTools refusé'));
        }
        const c = new CDP(socket);
        const rest = head.slice(i + 4);
        if (rest.length) c._onData(rest);
        resolve(c);
      };
      socket.on('data', onHead);
      socket.on('error', reject);
      socket.setTimeout(8000, () => { socket.destroy(); reject(new Error('timeout')); });
    }).then((c) => { c.socket.setTimeout(0); return c; });
  }

  static async forPort(port) {
    return CDP.connect(await browserWsUrl(port));
  }

  _frame(opcode, payload) {
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.alloc(2); header[1] = 0x80 | len; }
    else if (len < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
    header[0] = 0x80 | opcode;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
    return Buffer.concat([header, mask, masked]);
  }

  _onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (this.buf.length < off + 4) return; mask = this.buf.slice(off, off + 4); off += 4; }
      if (this.buf.length < off + len) return;
      let payload = this.buf.slice(off, off + len);
      if (mask) { payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]; }
      this.buf = this.buf.slice(off + len);

      if (op === 8) { this._onClose(); return; }
      if (op === 9) { try { this.socket.write(this._frame(10, payload)); } catch {} continue; }
      if (op === 10) continue;
      this.frag.push(payload);
      if (!fin) continue;
      const msg = Buffer.concat(this.frag).toString('utf8');
      this.frag = [];
      this._onMessage(msg);
    }
  }

  _onMessage(text) {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (m.id && this.pending.has(m.id)) {
      const { resolve, reject, timer } = this.pending.get(m.id);
      clearTimeout(timer);
      this.pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message || 'Erreur CDP'));
      else resolve(m.result || {});
    } else if (m.method) {
      for (const l of this.listeners) l(m);
    }
  }

  _onClose() {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Connexion DevTools fermée')); }
    this.pending.clear();
  }

  send(method, params = {}, sessionId, timeout = 30000) {
    if (this.closed) return Promise.reject(new Error('Connexion DevTools fermée'));
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} : délai dépassé`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(this._frame(1, Buffer.from(JSON.stringify(msg))));
    });
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  close() {
    if (this.closed) return;
    try { this.socket.write(this._frame(8, Buffer.alloc(0))); } catch {}
    this.socket.destroy();
    this._onClose();
  }
}

module.exports = { CDP, browserWsUrl };
