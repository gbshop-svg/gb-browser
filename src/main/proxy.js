// Proxies : lecture, relais local (pour les proxies avec identifiant/mot de passe) et test d'IP
const net = require('net');
const http = require('http');

// Accepte : host:port | host:port:user:pass | user:pass@host:port | http://user:pass@host:port | socks5://host:port
function parseProxy(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  let scheme = 'http';
  const m = s.match(/^([a-z0-9]+):\/\//i);
  if (m) { scheme = m[1].toLowerCase(); s = s.slice(m[0].length); }
  if (scheme === 'https') scheme = 'http';
  if (scheme === 'socks') scheme = 'socks5';
  let host, port, user = '', pass = '';
  const at = s.lastIndexOf('@');
  if (at !== -1) {
    const cred = s.slice(0, at);
    const hp = s.slice(at + 1).replace(/\/+$/, '');
    const c = cred.indexOf(':');
    user = c === -1 ? cred : cred.slice(0, c);
    pass = c === -1 ? '' : cred.slice(c + 1);
    [host, port] = hp.split(':');
  } else {
    const parts = s.replace(/\/+$/, '').split(':');
    host = parts[0];
    port = parts[1];
    if (parts.length >= 4) { user = parts[2]; pass = parts.slice(3).join(':'); }
  }
  port = parseInt(port, 10);
  if (!host || !port) return null;
  return { scheme, host, port, user: decodeURIComponent(user), pass: decodeURIComponent(pass), auth: !!user };
}

function label(p) {
  if (!p) return 'Sans proxy';
  return `${p.scheme === 'http' ? '' : p.scheme + '://'}${p.host}:${p.port}`;
}

// Ouvre un tunnel TCP vers host:port à travers un proxy SOCKS5 (avec ou sans identifiant)
function socksConnect(up, host, port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(up.port, up.host);
    let stage = 0;
    let buf = Buffer.alloc(0);
    const fail = (msg) => { sock.destroy(); reject(new Error(msg)); };
    sock.setTimeout(timeout, () => fail('SOCKS : délai dépassé'));
    sock.on('error', (e) => reject(e));
    sock.on('connect', () => {
      sock.write(up.auth ? Buffer.from([5, 2, 0, 2]) : Buffer.from([5, 1, 0]));
    });
    const sendConnect = () => {
      const h = Buffer.from(host);
      const req = Buffer.concat([Buffer.from([5, 1, 0, 3, h.length]), h, Buffer.from([port >> 8, port & 255])]);
      sock.write(req);
      stage = 2;
    };
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 0) {
        if (buf.length < 2) return;
        const method = buf[1];
        buf = buf.slice(2);
        if (method === 2) {
          const u = Buffer.from(up.user || ''), pw = Buffer.from(up.pass || '');
          sock.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([pw.length]), pw]));
          stage = 1;
        } else if (method === 0) sendConnect();
        else return fail('SOCKS : méthode d’authentification refusée');
      }
      if (stage === 1) {
        if (buf.length < 2) return;
        if (buf[1] !== 0) return fail('SOCKS : identifiant ou mot de passe refusé');
        buf = buf.slice(2);
        sendConnect();
      }
      if (stage === 2) {
        if (buf.length < 5) return;
        if (buf[1] !== 0) return fail(`SOCKS : connexion refusée (code ${buf[1]})`);
        const atyp = buf[3];
        const len = atyp === 1 ? 10 : atyp === 4 ? 22 : 7 + buf[4];
        if (buf.length < len) return;
        const rest = buf.slice(len);
        sock.removeListener('data', onData);
        sock.setTimeout(0);
        if (rest.length) sock.unshift(rest);
        resolve(sock);
      }
    };
    sock.on('data', onData);
  });
}

// Tunnel vers host:port par le proxy amont (HTTP CONNECT ou SOCKS5)
function tunnel(up, host, port) {
  if (up.scheme === 'socks5') return socksConnect(up, host, port);
  return new Promise((resolve, reject) => {
    const authHeader = up.auth ? `Proxy-Authorization: Basic ${Buffer.from(`${up.user}:${up.pass}`).toString('base64')}\r\n` : '';
    const sock = net.connect(up.port, up.host, () => {
      sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${authHeader}\r\n`);
    });
    let buf = Buffer.alloc(0);
    sock.setTimeout(15000, () => { sock.destroy(); reject(new Error('Proxy : délai dépassé')); });
    sock.on('error', reject);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      sock.removeListener('data', onData);
      sock.setTimeout(0);
      const status = buf.slice(0, idx).toString().split(' ')[1];
      if (status !== '200') { sock.destroy(); return reject(new Error(status === '407' ? 'Proxy : identifiant refusé (407)' : `Proxy : erreur ${status}`)); }
      const rest = buf.slice(idx + 4);
      if (rest.length) sock.unshift(rest);
      resolve(sock);
    };
    sock.on('data', onData);
  });
}

// Relais local sans auth -> proxy distant avec auth (Chromium ne gère pas user:pass en ligne de commande)
function startRelay(up) {
  if (up.scheme === 'socks5') return startSocksRelay(up);
  return startHttpRelay(up);
}

function startSocksRelay(up) {
  return new Promise((resolve, reject) => {
    const sockets = new Set();
    const track = (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); };
    const server = http.createServer((req, res) => {
      let u;
      try { u = new URL(req.url); } catch { res.writeHead(400); return res.end(); }
      const r = http.request({
        host: u.hostname, port: u.port || 80, method: req.method, path: u.pathname + u.search, headers: req.headers,
        createConnection: (opts, cb) => { tunnel(up, u.hostname, +(u.port || 80)).then((s) => { track(s); cb(null, s); }, (e) => cb(e)); },
      }, (pr) => { res.writeHead(pr.statusCode || 502, pr.headers); pr.pipe(res); });
      r.on('error', () => { try { res.writeHead(502); res.end(); } catch {} });
      req.pipe(r);
    });
    server.on('connect', (req, client, head) => {
      track(client);
      const [host, port] = req.url.split(':');
      tunnel(up, host, +port || 443).then((upstream) => {
        track(upstream);
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) upstream.write(head);
        upstream.pipe(client); client.pipe(upstream);
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
      }, () => { try { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch {} });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, stop: () => { for (const s of sockets) s.destroy(); server.close(); } }));
  });
}

function startHttpRelay(up) {
  return new Promise((resolve, reject) => {
    const authHeader = 'Basic ' + Buffer.from(`${up.user}:${up.pass}`).toString('base64');
    const sockets = new Set();

    const server = http.createServer((req, res) => {
      const r = http.request({
        host: up.host, port: up.port, method: req.method, path: req.url,
        headers: { ...req.headers, 'proxy-authorization': authHeader },
      }, (pr) => { res.writeHead(pr.statusCode || 502, pr.headers); pr.pipe(res); });
      r.on('error', () => { try { res.writeHead(502); res.end(); } catch {} });
      req.pipe(r);
    });

    server.on('connect', (req, client, head) => {
      sockets.add(client);
      client.on('close', () => sockets.delete(client));
      const upstream = net.connect(up.port, up.host, () => {
        upstream.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${authHeader}\r\n\r\n`);
      });
      sockets.add(upstream);
      upstream.on('close', () => sockets.delete(upstream));
      let buf = Buffer.alloc(0);
      const onData = (d) => {
        buf = Buffer.concat([buf, d]);
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        upstream.removeListener('data', onData);
        const status = (buf.slice(0, idx).toString().split(' ')[1]) || '502';
        if (status !== '200') {
          client.end(`HTTP/1.1 ${status} Proxy Error\r\n\r\n`);
          upstream.destroy();
          return;
        }
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const rest = buf.slice(idx + 4);
        if (rest.length) client.write(rest);
        if (head && head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      };
      upstream.on('data', onData);
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        stop: () => { for (const s of sockets) s.destroy(); server.close(); },
      });
    });
  });
}

// Test : IP + pays vus à travers le proxy (HTTP ou SOCKS5)
function testProxy(p, timeoutSec = 10) {
  return new Promise((resolve) => {
    const path = '/json/?fields=status,country,countryCode,city,timezone,query';
    const started = Date.now();
    let opts;
    if (!p) opts = { host: 'ip-api.com', port: 80, path };
    else if (p.scheme === 'socks5') {
      opts = { host: 'ip-api.com', port: 80, path,
        createConnection: (o, cb) => { socksConnect(p, 'ip-api.com', 80, timeoutSec * 1000).then((s) => cb(null, s), (e) => cb(e)); } };
    } else {
      opts = { host: p.host, port: p.port, path: 'http://ip-api.com' + path, headers: { Host: 'ip-api.com' } };
      if (p.auth) opts.headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(`${p.user}:${p.pass}`).toString('base64');
    }
    const req = http.get(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 407) return resolve({ ok: false, error: 'Identifiant refusé (407)' });
        try {
          const j = JSON.parse(data);
          if (j.status !== 'success') return resolve({ ok: false, error: `Réponse invalide (${res.statusCode})` });
          resolve({ ok: true, ip: j.query, country: j.country, countryCode: j.countryCode, city: j.city, timezone: j.timezone, ms: Date.now() - started });
        } catch {
          resolve({ ok: false, error: `Erreur ${res.statusCode}` });
        }
      });
    });
    req.setTimeout(Math.max(2, timeoutSec) * 1000, () => { req.destroy(); resolve({ ok: false, error: 'Délai dépassé' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.code || e.message }));
  });
}

module.exports = { parseProxy, label, startRelay, testProxy, tunnel };
