// Warm « humain » : Google, leboncoin, Wikipédia, sites FR — vraie frappe clavier,
// mouvements de souris, défilement à la molette, clics, acceptation des cookies.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

// ── Recherches « au hasard » réalistes ───────────────
const OBJETS = ['commode', 'table basse', 'buffet', 'armoire', 'chaise', 'bureau', 'lampe de chevet', 'miroir', 'canapé d’angle', 'fauteuil',
  'vélo électrique', 'poussette', 'machine à café', 'tondeuse', 'perceuse', 'aspirateur', 'barbecue', 'trottinette', 'console', 'appareil photo',
  'doudoune', 'manteau en laine', 'sac à main', 'baskets', 'bottes', 'montre', 'enceinte bluetooth', 'lit bébé', 'étagère', 'tapis'];
const QUALIFS = ['bois massif', 'en chêne', 'vintage', 'scandinave', 'en cuir', 'en rotin', 'industriel', 'blanc', 'noir', 'en métal', 'pliable', 'ancien', 'design', 'reconditionné', ''];
const SUFFIXES = ["d'occasion", 'occasion', 'pas cher', 'prix', 'avis', 'comment choisir', 'à vendre', 'bon état', 'livraison', ''];
const INFOS = ['recette gratin dauphinois', 'météo Lyon ce week-end', 'horaires marée Saint-Malo', 'comment détartrer une bouilloire', 'programme télé ce soir',
  'meilleur film 2025', 'recette pâte à crêpes', 'distance Paris Bordeaux', 'comment enlever une tache de gras', 'résultat ligue 1', 'ouverture piscine municipale',
  'recette cookies moelleux', 'comment planter des tomates', 'idée sortie dimanche', 'horaire déchetterie', 'prix essence aujourd’hui', 'histoire de la tour Eiffel',
  'comment faire un noeud de cravate', 'recette soupe potiron', 'jours fériés 2026', 'meilleure crème hydratante', 'que faire à Nantes', 'calories banane'];
const LBC = ['commode', 'vélo', 'canapé', 'table', 'poussette', 'lampe', 'buffet', 'chaise', 'bureau', 'armoire', 'tondeuse', 'miroir', 'jeux société', 'livres'];
const SITES = [
  // actu
  'https://www.lemonde.fr/', 'https://www.lefigaro.fr/', 'https://www.20minutes.fr/', 'https://www.ouest-france.fr/', 'https://www.leparisien.fr/',
  'https://www.francetvinfo.fr/', 'https://www.bfmtv.com/', 'https://www.liberation.fr/', 'https://www.lepoint.fr/', 'https://www.lequipe.fr/',
  // cuisine, maison, jardin
  'https://www.marmiton.org/', 'https://cuisine.journaldesfemmes.fr/', 'https://www.750g.com/', 'https://www.leroymerlin.fr/', 'https://www.castorama.fr/',
  'https://www.maisonsdumonde.com/FR/fr', 'https://www.ikea.com/fr/fr/', 'https://www.mr-bricolage.fr/', 'https://www.jardiland.com/',
  // shopping
  'https://www.decathlon.fr/', 'https://www.fnac.com/', 'https://www.boulanger.com/', 'https://www.darty.com/', 'https://www.cdiscount.com/',
  'https://www.carrefour.fr/', 'https://www.leclercdrive.fr/', 'https://www.sephora.fr/', 'https://www.zalando.fr/', 'https://www.kiabi.com/', 'https://www.laredoute.fr/',
  // pratique, culture, loisirs
  'https://meteofrance.com/', 'https://www.allocine.fr/', 'https://www.doctissimo.fr/', 'https://www.pagesjaunes.fr/', 'https://www.sncf-connect.com/',
  'https://www.booking.com/index.fr.html', 'https://www.tripadvisor.fr/', 'https://www.jeuxvideo.com/', 'https://www.01net.com/', 'https://www.journaldunet.com/',
  'https://www.service-public.fr/', 'https://www.larousse.fr/', 'https://www.linternaute.com/', 'https://www.ameli.fr/', 'https://www.seloger.com/',
];

function randomQuery() {
  if (Math.random() < 0.35) return pick(INFOS);
  return [pick(OBJETS), pick(QUALIFS), pick(SUFFIXES)].filter(Boolean).join(' ');
}

// Boutons d'acceptation des cookies (Didomi, OneTrust, Google, Sourcepoint…)
const CONSENT_JS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const ids = ['#didomi-notice-agree-button', '#onetrust-accept-btn-handler', '#L2AGLb', 'button[aria-label="Tout accepter"]',
    '#axeptio_btn_acceptAll', '.fc-cta-consent', '#tarteaucitronPersonalize2', 'button[data-testid="uc-accept-all-button"]'];
  for (const s of ids) { const el = document.querySelector(s); if (el && vis(el)) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } }
  const re = /^(tout accepter|accepter( et fermer| tout| les cookies)?|j'accepte|j’accepte|accept all|ok pour moi|continuer avec les cookies)$/i;
  for (const el of document.querySelectorAll('button, a[role=button], [role=button]')) {
    const t = (el.innerText || '').trim();
    if (t && t.length < 40 && re.test(t) && vis(el)) { const r = el.getBoundingClientRect(); if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  }
  return null;
})()`;

class Human {
  constructor(cdp, sessionId, shouldStop) {
    this.c = cdp;
    this.s = sessionId;
    this.mx = ri(200, 600);
    this.my = ri(150, 400);
    this.stop = shouldStop || (() => false);
  }

  check() { if (this.stop()) throw new Error('arrêté'); }
  send(m, p = {}) { return this.c.send(m, p, this.s); }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).catch(() => null);
    return r && r.result ? r.result.value : null;
  }

  async viewport() {
    return (await this.eval('({w: innerWidth, h: innerHeight})')) || { w: 1280, h: 800 };
  }

  async goto(url) {
    this.check();
    await this.send('Page.navigate', { url }).catch(() => {});
    await this.waitLoad();
  }

  async waitLoad(max = 15000) {
    const end = Date.now() + max;
    await sleep(800);
    while (Date.now() < end) {
      const st = await this.eval('document.readyState');
      if (st === 'complete' || st === 'interactive') break;
      await sleep(400);
    }
    await sleep(rand(1200, 2500));
  }

  async url() { return (await this.eval('location.href')) || ''; }

  async blocked() {
    const u = await this.url();
    if (/google\.[a-z.]+\/sorry|captcha/i.test(u)) return true;
    return !!(await this.eval(`!!document.querySelector('iframe[src*="captcha"], iframe[src*="datadome"], #challenge-form, .g-recaptcha')`));
  }

  // Trajectoire de souris courbe (Bézier) avec micro-pauses
  async moveTo(x, y) {
    this.check();
    const sx = this.mx, sy = this.my;
    const cx1 = sx + (x - sx) * rand(0.2, 0.4) + rand(-80, 80), cy1 = sy + (y - sy) * rand(0.2, 0.4) + rand(-80, 80);
    const cx2 = sx + (x - sx) * rand(0.6, 0.8) + rand(-60, 60), cy2 = sy + (y - sy) * rand(0.6, 0.8) + rand(-60, 60);
    const dist = Math.hypot(x - sx, y - sy);
    const steps = Math.max(8, Math.min(45, Math.round(dist / rand(12, 22))));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const px = (1 - e) ** 3 * sx + 3 * (1 - e) ** 2 * e * cx1 + 3 * (1 - e) * e ** 2 * cx2 + e ** 3 * x;
      const py = (1 - e) ** 3 * sy + 3 * (1 - e) ** 2 * e * cy1 + 3 * (1 - e) * e ** 2 * cy2 + e ** 3 * y;
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(px), y: Math.round(py) }).catch(() => {});
      await sleep(rand(6, 22));
    }
    this.mx = x; this.my = y;
  }

  async wander(n = ri(1, 3)) {
    const vp = await this.viewport();
    for (let i = 0; i < n; i++) {
      await this.moveTo(ri(80, vp.w - 80), ri(80, vp.h - 80));
      await sleep(rand(150, 700));
    }
  }

  async clickAt(x, y) {
    await this.moveTo(x + rand(-3, 3), y + rand(-2, 2));
    await sleep(rand(80, 260));
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: this.mx, y: this.my, button: 'left', clickCount: 1 });
    await sleep(rand(45, 130));
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: this.mx, y: this.my, button: 'left', clickCount: 1 });
  }

  // Clique sur l'élément renvoyé par une expression JS (après l'avoir amené à l'écran)
  async clickEl(finderJs) {
    const ok = await this.eval(`(() => { const el = (${finderJs})(); if (!el) return false; el.scrollIntoView({block: 'center', behavior: 'smooth'}); window.__gbEl = el; return true; })()`);
    if (!ok) return false;
    await sleep(rand(600, 1100));
    const r = await this.eval(`(() => { const r = window.__gbEl.getBoundingClientRect(); return { x: r.left + r.width * (0.3 + Math.random() * 0.4), y: r.top + r.height * (0.35 + Math.random() * 0.3), w: r.width }; })()`);
    if (!r || !r.w) return false;
    await this.clickAt(r.x, r.y);
    return true;
  }

  async scroll(times = ri(3, 7)) {
    const vp = await this.viewport();
    await this.moveTo(ri(vp.w * 0.3, vp.w * 0.7), ri(vp.h * 0.3, vp.h * 0.7));
    for (let i = 0; i < times; i++) {
      this.check();
      const down = Math.random() < 0.85;
      const ticks = ri(2, 5);
      for (let t = 0; t < ticks; t++) {
        await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: this.mx, y: this.my, deltaX: 0, deltaY: down ? ri(90, 130) : -ri(90, 130) }).catch(() => {});
        await sleep(rand(30, 90));
      }
      await sleep(rand(700, 2600));
      if (Math.random() < 0.3) await this.wander(1);
    }
  }

  async key(key, code, vk, text) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text });
    await sleep(rand(30, 90));
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  }

  // Frappe caractère par caractère, rythme irrégulier, quelques fautes corrigées
  async type(text) {
    for (const ch of text) {
      this.check();
      if (/[a-z]/i.test(ch) && Math.random() < 0.035) {
        const wrong = 'azertyuiopqsdfghjklmwxcvbn'[ri(0, 25)];
        await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: wrong, text: wrong });
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: wrong });
        await sleep(rand(180, 420));
        await this.key('Backspace', 'Backspace', 8);
        await sleep(rand(120, 300));
      }
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await sleep(rand(20, 70));
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      await sleep(ch === ' ' ? rand(120, 450) : rand(55, 210));
      if (Math.random() < 0.04) await sleep(rand(500, 1300));
    }
  }

  async enter() { await this.key('Enter', 'Enter', 13, '\r'); }

  // Bannières de cookies dans des iframes (Sourcepoint, TCF…) : clic direct dans le cadre
  async acceptConsentFrames() {
    const tree = await this.send('Page.getFrameTree').catch(() => null);
    if (!tree) return false;
    const frames = [];
    const walk = (n) => { (n.childFrames || []).forEach((c) => { frames.push(c.frame); walk(c); }); };
    walk(tree.frameTree);
    for (const f of frames) {
      if (!/consent|sp_message|cmp|privacy|didomi|cookie|sourcepoint|quantcast|onetrust/i.test(f.url + (f.name || ''))) continue;
      const w = await this.send('Page.createIsolatedWorld', { frameId: f.id, worldName: 'gb' }).catch(() => null);
      if (!w) continue;
      const r = await this.send('Runtime.evaluate', {
        contextId: w.executionContextId, returnByValue: true,
        expression: `(() => { const re = /^(tout accepter|accepter( et fermer| tout)?|j'accepte|j’accepte|accept all|accepter les cookies|ok)$/i;
          const b = [...document.querySelectorAll('button, [role=button], a')].find((el) => re.test((el.innerText || el.title || '').trim()));
          if (b) { b.click(); return true; } return false; })()`,
      }).catch(() => null);
      if (r && r.result && r.result.value) { await sleep(rand(1000, 1800)); return true; }
    }
    return false;
  }

  async acceptConsent() {
    await sleep(rand(800, 1600)); // les bannières arrivent souvent avec un peu de retard
    let clicked = false;
    for (let i = 0; i < 2; i++) {
      const pos = await this.eval(CONSENT_JS);
      if (!pos) return clicked;
      clicked = true;
      await sleep(rand(700, 1600));
      await this.clickAt(pos.x, pos.y);
      await sleep(rand(1200, 2000));
    }
    if (!clicked) clicked = await this.acceptConsentFrames();
    return clicked;
  }

  // Clique un lien ; si le clic n'a pas changé de page, on y va quand même (comme un clic raté puis réussi)
  async followLink(finderJs) {
    const before = await this.url();
    const href = await this.eval(`(() => { const el = (${finderJs})(); return el ? el.href : null; })()`);
    if (!href) return false;
    await this.clickEl(`() => [...document.querySelectorAll('a[href]')].find((a) => a.href === ${JSON.stringify(href)})`);
    await sleep(2500);
    const now = await this.url();
    if (now === before) {
      await this.send('Page.navigate', { url: href }).catch(() => {});
    }
    await this.waitLoad();
    return true;
  }
}

// ── Scénarios ────────────────────────────────────────
const GOOGLE_RESULT = `() => {
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    if (!a.querySelector('h3')) continue;
    let u; try { u = new URL(a.href); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || /(^|\\.)google\\.|youtube\\.com|gstatic|webcache/.test(u.hostname)) continue;
    if (a.getClientRects().length) out.push(a);
  }
  return out[Math.floor(Math.random() * Math.min(out.length, 7))];
}`;

async function google(h, log) {
  await h.goto('https://www.google.fr/');
  await h.acceptConsent();
  if (await h.blocked()) { log('Google demande une vérification — étape passée'); return; }
  const n = ri(2, 4);
  for (let i = 0; i < n; i++) {
    const q = randomQuery();
    log(`Google : « ${q} »`);
    if (!(await h.url()).includes('google.')) await h.goto('https://www.google.fr/');
    const ok = await h.clickEl(`() => document.querySelector('textarea[name=q], input[name=q]')`);
    if (!ok) return;
    await sleep(rand(300, 800));
    await h.eval(`(() => { const el = document.querySelector('textarea[name=q], input[name=q]'); if (el) { el.value = ''; } })()`);
    await h.type(q);
    await sleep(rand(400, 1200));
    await h.enter();
    await h.waitLoad();
    if (await h.blocked()) { log('Google demande une vérification — étape passée'); return; }
    await h.scroll(ri(2, 4));
    const visits = ri(1, 3);
    for (let v = 0; v < visits; v++) {
      if (!(await h.followLink(GOOGLE_RESULT))) break;
      let host = ''; try { host = new URL(await h.url()).hostname; } catch {}
      log(`→ ${host}`);
      await h.acceptConsent();
      await h.scroll(ri(3, 6));
      for (let k = 0; k < ri(1, 3); k++) {
        const sameSite = `() => { const l = [...document.querySelectorAll('a[href]')].filter((a) => { try { const u = new URL(a.href); return u.hostname === location.hostname && u.pathname.length > 6 && a.getClientRects().length; } catch { return false; } }); return l[Math.floor(Math.random() * Math.min(l.length, 30))]; }`;
        if (!(await h.followLink(sameSite))) break;
        await h.acceptConsent();
        await h.scroll(ri(2, 5));
      }
      await h.send('Page.navigate', { url: 'https://www.google.fr/search?q=' + encodeURIComponent(q) }).catch(() => {});
      await h.waitLoad();
    }
  }
}

async function leboncoin(h, log) {
  const q = pick(LBC) + (Math.random() < 0.5 ? ' ' + pick(QUALIFS) : '');
  log(`leboncoin : « ${q.trim()} »`);
  await h.goto('https://www.leboncoin.fr/');
  await h.acceptConsent();
  if (await h.blocked()) { log('leboncoin demande une vérification — étape passée'); return; }
  await h.scroll(ri(1, 3));
  await h.eval('scrollTo({top: 0, behavior: "smooth"})');
  await sleep(1000);
  const ok = await h.clickEl(`() => document.querySelector('input[type=search], input[name=search], input[placeholder*="echerch"]')`);
  if (ok) {
    await h.type(q.trim());
    await sleep(rand(500, 1200));
    await h.enter();
    await h.waitLoad();
    if (await h.blocked()) return;
    await h.scroll(ri(3, 6));
    if (await h.clickEl(`() => { const a = [...document.querySelectorAll('a[href*="/ad/"]')]; return a[Math.floor(Math.random() * Math.min(a.length, 12))]; }`)) {
      await h.waitLoad();
      await h.scroll(ri(2, 5));
    }
  }
}

async function wikipedia(h, log) {
  log('Wikipédia : article au hasard');
  await h.goto('https://fr.wikipedia.org/wiki/Sp%C3%A9cial:Page_au_hasard');
  await h.scroll(ri(3, 6));
  for (let i = 0; i < ri(1, 2); i++) {
    const ok = await h.clickEl(`() => { const l = [...document.querySelectorAll('#mw-content-text p a[href^="/wiki/"]')].filter(a => !a.href.includes(':')); return l[Math.floor(Math.random() * Math.min(l.length, 15))]; }`);
    if (!ok) break;
    await h.waitLoad();
    await h.scroll(ri(2, 5));
  }
}

async function randomSite(h, log, url) {
  log(`Visite : ${new URL(url).hostname.replace(/^www\./, '')}`);
  await h.goto(url);
  await h.acceptConsent();
  if (await h.blocked()) return;
  await h.scroll(ri(2, 5));
  const pages = ri(2, 4);
  for (let i = 0; i < pages; i++) {
    const inner = `() => { const l = [...document.querySelectorAll('main a[href], article a[href], a[href]')].filter((a) => { try { const u = new URL(a.href); return u.hostname.replace(/^www\\./, '') === location.hostname.replace(/^www\\./, '') && u.pathname.length > 8 && !/login|connexion|compte|panier|account|cart/i.test(u.pathname) && a.getClientRects().length; } catch { return false; } }); return l[Math.floor(Math.random() * Math.min(l.length, 40))]; }`;
    if (!(await h.followLink(inner))) break;
    await h.acceptConsent();
    await h.scroll(ri(3, 6));
    if (Math.random() < 0.5) await h.wander(ri(2, 4));
    if (Math.random() < 0.25) { await h.send('Page.navigate', { url: await h.eval('document.referrer') || url }).catch(() => {}); await h.waitLoad(); }
  }
}

// ── Vinted : se balader comme une vraie acheteuse (recherche, catalogue, annonces) — aucune action (ni favori, ni message) ──
const VINTED_Q = ['pull col roulé', 'robe longue', 'cardigan maille', 'jupe plissée', 'manteau laine', 'pull grosse maille', 'robe pull',
  'blouse dentelle', 'jupe longue', 'veste en jean', 'trench femme', 'pull rayé', 'robe noire', 'chemise à carreaux', 'gilet boutons dorés',
  'pantalon large', 'jupe satin', 'top dentelle', 'robe vintage', 'pull jacquard', 'doudoune femme', 'bottes cuir', 'sac bandoulière'];
const VINTED_ITEM = `() => { const l = [...document.querySelectorAll('a[href*="/items/"]')].filter((a) => a.getClientRects().length && !/\/(edit|new)/.test(a.href)); return l[Math.floor(Math.random() * Math.min(l.length, 24))]; }`;

async function vinted(h, log) {
  log('Vinted : balade sur le site');
  await h.goto('https://www.vinted.fr/');
  await h.acceptConsent();
  if (await h.blocked()) { log('Vinted demande une vérification — étape passée'); return; }
  await h.scroll(ri(2, 4));
  await h.wander(ri(1, 3));
  const searches = ri(1, 2);
  for (let s = 0; s < searches; s++) {
    const q = pick(VINTED_Q);
    log(`Vinted : recherche « ${q} »`);
    await h.eval('scrollTo({top: 0, behavior: "smooth"})');
    await sleep(rand(600, 1200));
    const ok = await h.clickEl(`() => document.querySelector('input#search_text, input[data-testid*="search-text"], input[name="search_text"], input[type="search"]')`);
    if (ok) {
      await h.eval(`(() => { const el = document.querySelector('input#search_text, input[data-testid*="search-text"], input[name="search_text"], input[type="search"]'); if (el) el.select && el.select(); })()`);
      await h.type(q);
      await sleep(rand(500, 1300));
      await h.enter();
      await h.waitLoad();
    } else {
      await h.goto('https://www.vinted.fr/catalog?search_text=' + encodeURIComponent(q));
    }
    if (await h.blocked()) return;
    await h.scroll(ri(2, 5));
    // 2 à 4 annonces regardées par recherche (6 au plus au total)
    const views = ri(2, 4);
    for (let v = 0; v < views; v++) {
      const before = await h.url();
      if (!(await h.clickEl(VINTED_ITEM))) break;
      await h.waitLoad();
      await h.scroll(ri(1, 3));
      if (Math.random() < 0.6) await h.wander(ri(1, 3));
      await sleep(rand(3500, 11000)); // temps de lecture de l'annonce
      await h.send('Page.navigate', { url: before }).catch(() => {});
      await h.waitLoad();
      await h.scroll(ri(1, 2));
    }
  }
  // Parfois : un tour par une catégorie du menu
  if (Math.random() < 0.5 && (await h.clickEl(`() => { const l = [...document.querySelectorAll('a[href*="/catalog/"]')].filter((a) => a.getClientRects().length); return l[Math.floor(Math.random() * Math.min(l.length, 20))]; }`))) {
    await h.waitLoad();
    await h.scroll(ri(2, 4));
  }
}

// ── Warm « Vinted » (la nuit, DotB en pause) : une vraie session d'acheteuse sur Vinted ──
// Fil d'accueil, recherches tapées au clavier avec filtres, annonces regardées (photos feuilletées),
// boutiques de vendeuses visitées, catégories, et parfois 1 favori. Jamais de message, d'offre ni d'achat.
const VINTED_ITEM_PAGE = /\/items\/\d+/;
const PRICE_TO = ['15', '20', '25', '30', '40'];
const ORDERS = ['newest_first', 'relevance', 'price_low_to_high'];

async function vintedLookItem(h, log, { canFav }) {
  await h.waitLoad();
  await sleep(rand(1200, 2500));
  // Feuilleter les photos : clic sur la photo principale, flèche droite, Échap
  if (Math.random() < 0.65 && (await h.clickEl(`() => [...document.querySelectorAll('[data-testid*="item-photo"] img, .item-photos img, figure img')].find((i) => i.getClientRects().length && i.naturalWidth > 150)`))) {
    await sleep(rand(900, 1800));
    for (let i = 0, n = ri(1, 4); i < n; i++) { await h.key('ArrowRight', 'ArrowRight', 39); await sleep(rand(900, 2600)); }
    await h.key('Escape', 'Escape', 27);
    await sleep(rand(600, 1200));
  }
  await h.scroll(ri(1, 3));
  if (Math.random() < 0.6) await h.wander(ri(1, 2));
  await sleep(rand(4000, 12000)); // lecture de la description
  let faved = false;
  if (canFav && Math.random() < 0.35) {
    faved = await h.clickEl(`() => [...document.querySelectorAll('button[data-testid*="favourite"], button[aria-label*="avori"], [data-testid*="favourite-button"] button')].find((b) => b.getClientRects().length && b.getAttribute('aria-pressed') !== 'true')`);
    if (faved) { log('Vinted : 1 annonce mise en favori'); await sleep(rand(800, 1800)); }
  }
  // Parfois : la boutique de la vendeuse
  if (Math.random() < 0.3) {
    const before = await h.url();
    if (await h.clickEl(`() => [...document.querySelectorAll('a[href*="/member/"]')].find((a) => a.getClientRects().length && /\/member\/\d+/.test(a.href))`)) {
      await h.waitLoad();
      if (await h.blocked()) return faved;
      log('Vinted : boutique d’une vendeuse');
      await h.scroll(ri(2, 4));
      await sleep(rand(2500, 6000));
      await h.send('Page.navigate', { url: before }).catch(() => {});
      await h.waitLoad();
    }
  }
  return faved;
}

async function vintedDeep(h, log, intensity = 'court') {
  const searches = intensity === 'long' ? ri(3, 4) : intensity === 'normal' ? ri(2, 3) : ri(2, 2);
  let favs = 0;
  log('Vinted : fil d’accueil');
  await h.goto('https://www.vinted.fr/');
  await h.acceptConsent();
  if (await h.blocked()) { log('Vinted demande une vérification — warm arrêté'); return; }
  await h.scroll(ri(3, 6));
  await h.wander(ri(1, 3));
  // 1 annonce du fil d'accueil
  if (await h.clickEl(VINTED_ITEM)) { if (await vintedLookItem(h, log, { canFav: favs < 1 })) favs++; }
  for (const q of shuffle(VINTED_Q).slice(0, searches)) {
    h.check();
    log(`Vinted : recherche « ${q} »`);
    await h.goto('https://www.vinted.fr/');
    await sleep(rand(800, 1600));
    const box = `() => document.querySelector('input#search_text, input[data-testid*="search-text"], input[name="search_text"], input[type="search"]')`;
    if (await h.clickEl(box)) {
      await h.eval(`(() => { const el = (${box})(); if (el && el.select) el.select(); })()`);
      await h.type(q);
      await sleep(rand(500, 1300));
      await h.enter();
      await h.waitLoad();
    } else {
      await h.goto('https://www.vinted.fr/catalog?search_text=' + encodeURIComponent(q));
    }
    if (await h.blocked()) return;
    await h.scroll(ri(2, 4));
    // Comme une vraie acheteuse : parfois un filtre prix ou un tri
    if (Math.random() < 0.5) {
      const u = new URL(await h.url());
      if (/\/catalog/.test(u.pathname)) {
        if (Math.random() < 0.5) u.searchParams.set('price_to', pick(PRICE_TO)); else u.searchParams.set('order', pick(ORDERS));
        log('Vinted : filtre appliqué');
        await h.goto(u.toString());
        if (await h.blocked()) return;
        await h.scroll(ri(1, 3));
      }
    }
    const listUrl = await h.url();
    for (let v = 0, n = ri(2, 4); v < n; v++) {
      if (!(await h.clickEl(VINTED_ITEM))) break;
      if (await vintedLookItem(h, log, { canFav: favs < 1 })) favs++;
      if (VINTED_ITEM_PAGE.test(await h.url()) || !(await h.url()).startsWith(listUrl.split('?')[0])) {
        await h.send('Page.navigate', { url: listUrl }).catch(() => {});
        await h.waitLoad();
      }
      await h.scroll(ri(1, 2));
    }
  }
  // Un tour par une catégorie, et parfois la page de ses favoris
  if (Math.random() < 0.6 && (await h.clickEl(`() => { const l = [...document.querySelectorAll('a[href*="/catalog/"]')].filter((a) => a.getClientRects().length); return l[Math.floor(Math.random() * Math.min(l.length, 20))]; }`))) {
    await h.waitLoad();
    log('Vinted : tour dans une catégorie');
    await h.scroll(ri(2, 5));
  }
  if (Math.random() < 0.3) {
    await h.goto('https://www.vinted.fr/member/items/favourite_list');
    await h.scroll(ri(1, 3));
  }
}

async function runWarm(cdp, { log = () => {}, shouldStop, intensity = 'normal', focus = '' } = {}) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId).catch(() => {});
  await cdp.send('Page.bringToFront', {}, sessionId).catch(() => {});
  const h = new Human(cdp, sessionId, shouldStop);
  if (focus === 'vinted') {
    // Warm Vinted : 1 ou 2 sites ordinaires (cookies variés), puis une vraie session Vinted
    const plan = [...shuffle(SITES).slice(0, ri(1, 2)).map((u) => () => randomSite(h, log, u)), () => vintedDeep(h, log, intensity)];
    let done = 0;
    for (const step of plan) {
      try { await step(); done++; } catch (e) { if (e.message === 'arrêté') throw e; log(`étape ignorée : ${e.message}`); }
      await sleep(rand(1500, 4000));
    }
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    return { steps: done, total: plan.length };
  }
  const others = shuffle(SITES).slice(0, intensity === 'long' ? 12 : intensity === 'court' ? 3 : 7);
  const steps = [
    () => leboncoin(h, log),
    () => wikipedia(h, log),
    ...others.map((u) => () => randomSite(h, log, u)),
  ];
  // Sites variés mélangés, puis Vinted en dernier (Google retiré : peu utile et souvent bloqué par un captcha).
  const plan = [...shuffle(steps), () => vinted(h, log)];
  let done = 0;
  for (const step of plan) {
    try { await step(); done++; } catch (e) {
      if (e.message === 'arrêté') throw e;
      log(`étape ignorée : ${e.message}`);
    }
    await sleep(rand(1500, 4000));
  }
  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  return { steps: done, total: plan.length };
}

module.exports = { runWarm, randomQuery, Human };
