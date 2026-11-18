// Lancement automatique des automatisations DotB (page dotb.html de l'extension).
// La page doit rester ouverte : « Si vous fermez cette page, elles s'arrêteront. »
const { Human } = require('./warm');

const DOTB_EXT_ID = 'ancgmmmephcjikpmffmfinnlpamekedn';
const DOTB_PAGE = `chrome-extension://${DOTB_EXT_ID}/dotb.html?site=https%3A%2F%2Fwww.vinted.fr`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CARDS = [
  { key: 'likes', title: /automatisation des messages aux likes|messages aux likes/i, label: 'Messages aux likes' },
  { key: 'agent', title: /smart agent v2/i, label: 'Smart Agent v2' },
  { key: 'orders', title: /flux de commandes?/i, label: 'Flux de commandes' },
  { key: 'bridge', title: /^bridge$/i, label: 'Bridge' },
];
const RANGE_RE = /\b2\s*(h|heures?)\b|2 derni[eè]res heures|deux (derni[eè]res )?heures/i;

// Trouve la carte d'une automatisation à partir de son titre (renvoie une fonction JS pour Human.clickEl)
const cardJs = (re) => `(() => {
  const re = ${re};
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,div,span,p')].filter((el) => el.children.length <= 2 && re.test(norm(el.textContent)) && norm(el.textContent).length < 60);
  for (const h of heads) {
    let n = h;
    for (let i = 0; i < 8 && n; i++) { n = n.parentElement; if (n && n.querySelector('button')) return n; }
  }
  return null;
})`;

async function openDotbTab(cdp, pageUrl = DOTB_PAGE) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const base = pageUrl.split('?')[0];
  let t = targetInfos.find((x) => x.type === 'page' && x.url.startsWith(base));
  let targetId = t && t.targetId;
  if (!targetId) ({ targetId } = await cdp.send('Target.createTarget', { url: pageUrl }));
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId).catch(() => {});
  // Les clics souris ne passent pas sur un onglet en arrière-plan : on l'affiche
  await cdp.send('Page.bringToFront', {}, sessionId).catch(() => {});
  return { targetId, sessionId };
}

async function waitFor(h, js, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await h.eval(js)) return true;
    await sleep(500);
  }
  return false;
}

// Démarre les automatisations demandées. Renvoie un résumé par carte.
async function startAutomations(cdp, { keys = ['likes', 'agent', 'orders', 'bridge'], log = () => {}, pageUrl } = {}) {
  const { sessionId } = await openDotbTab(cdp, pageUrl);
  const h = new Human(cdp, sessionId);
  const ready = await waitFor(h, `!!document.body && /automatisations/i.test(document.body.innerText) && document.querySelectorAll('button').length > 3`, 25000);
  if (!ready) throw new Error('la page DotB ne s’affiche pas (es-tu connecté à DotB dans ce profil ?)');
  // DotB peut s'ouvrir sur une autre section (Dressing…) : on va sur « Automatisations » et on vérifie
  // que les cartes (Smart Agent v2, Bridge…) sont bien affichées avant de continuer.
  const onAuto = `(${cardJs(/smart agent v2/i)})() || (${cardJs(/^bridge$/i)})()`;
  for (let attempt = 0; attempt < 4 && !(await h.eval(`!!(${onAuto})`)); attempt++) {
    if (attempt < 2) {
      // Lien du menu : le plus petit élément dont le texte est exactement « Automatisations », puis son ancêtre cliquable
      await h.clickEl(`() => {
        const els = [...document.querySelectorAll('a,button,[role=tab],[role=menuitem],[role=link],li,div,span,p')]
          .filter((el) => /^automatisations?$/i.test((el.innerText || '').trim()))
          .sort((a, b) => a.innerText.length - b.innerText.length || a.querySelectorAll('*').length - b.querySelectorAll('*').length);
        const el = els[0];
        return el ? (el.closest('a,button,[role=tab],[role=menuitem],[role=link],li') || el) : null;
      }`);
    } else {
      // Dernier recours : adresse directe de la section
      const base = (pageUrl || DOTB_PAGE);
      await cdp.send('Page.navigate', { url: base + (attempt === 2 ? '#/automations' : '#/automatisations') }, sessionId).catch(() => {});
    }
    await waitFor(h, `!!(${onAuto})`, 8000);
  }
  if (!(await h.eval(`!!(${onAuto})`))) {
    const menu = await h.eval(`[...document.querySelectorAll('a,button,[role=tab],[role=menuitem],nav li')].map((e) => (e.innerText || '').trim()).filter((t) => t && t.length < 30).slice(0, 25).join(' | ')`).catch(() => '');
    log(`section Automatisations introuvable (menu vu : ${menu || 'rien'})`);
  }
  const results = {};
  for (const card of CARDS.filter((c) => keys.includes(c.key))) {
    const find = cardJs(card.title);
    if (!(await h.eval(`!!${find}()`))) { results[card.key] = 'introuvable'; continue; }
    // 1) Plage horaire : « traiter uniquement … 2 h »
    const hasCombo = await h.eval(`(() => { const c = ${find}(); return !!(c && c.querySelector('[role=combobox], select, button[aria-haspopup]')); })()`);
    if (hasCombo) {
      const isNative = await h.eval(`(() => { const c = ${find}(); return !!(c && c.querySelector('select')); })()`);
      if (isNative) {
        await h.eval(`(() => { const s = ${find}().querySelector('select'); const o = [...s.options].find((o) => ${RANGE_RE}.test(o.text)); if (!o) return false;
          const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      } else {
        const current = await h.eval(`(() => { const c = ${find}(); const b = c.querySelector('[role=combobox], button[aria-haspopup]'); return b ? b.innerText.trim() : ''; })()`);
        if (!RANGE_RE.test(current)) {
          await h.clickEl(`() => ${find}().querySelector('[role=combobox], button[aria-haspopup]')`);
          await sleep(700);
          const options = await h.eval(`[...document.querySelectorAll('[role=option], [role=menuitem], [role=menuitemradio]')].map((o) => o.innerText.trim())`) || [];
          const ok = await h.clickEl(`() => [...document.querySelectorAll('[role=option], [role=menuitem], [role=menuitemradio]')].find((o) => ${RANGE_RE}.test(o.innerText))`);
          if (!ok) {
            await h.key('Escape', 'Escape', 27);
            log(`${card.label} : option « 2 h » introuvable (choix : ${options.join(' | ') || 'aucun'})`);
          }
          await sleep(600);
        }
      }
    }
    // 2) Bouton Démarrer (ou interrupteur)
    const state = await h.eval(`(() => {
      const c = ${find}(); if (!c) return 'introuvable';
      const btns = [...c.querySelectorAll('button')].map((b) => b.innerText.trim());
      if (btns.some((t) => /arr[êe]ter|stop|pause|d[ée]connecter|en cours/i.test(t))) return 'actif';
      const sw = c.querySelector('[role=switch], input[type=checkbox]');
      if (sw && !btns.some((t) => /^(d[ée]marrer|start|connecter|activer|lancer)/i.test(t))) {
        const on = sw.matches('input') ? sw.checked : sw.getAttribute('aria-checked') === 'true' || sw.dataset.state === 'checked';
        return on ? 'actif' : 'switch';
      }
      return btns.some((t) => /^(d[ée]marrer|start|connecter|activer|lancer)/i.test(t)) ? 'bouton' : 'inconnu';
    })()`);
    if (state === 'actif') { results[card.key] = 'déjà actif'; continue; }
    let clicked = false;
    if (state === 'bouton') clicked = await h.clickEl(`() => [...${find}().querySelectorAll('button')].find((b) => /^(d[ée]marrer|start|connecter|activer|lancer)/i.test(b.innerText.trim()))`);
    else if (state === 'switch') clicked = await h.clickEl(`() => ${find}().querySelector('[role=switch], input[type=checkbox]')`);
    await sleep(1500);
    // Une fenêtre de confirmation peut apparaître
    await h.clickEl(`() => [...document.querySelectorAll('[role=dialog] button, [role=alertdialog] button')].find((b) => /^(d[ée]marrer|confirmer|continuer|ok|oui|activer)/i.test(b.innerText.trim()))`).catch(() => {});
    results[card.key] = clicked ? 'démarré' : state;
    await sleep(800);
  }
  return results;
}

// Arrête les automatisations en cours (prudence) : clique « Arrêter » sur chaque carte active
async function stopAutomations(cdp, { pageUrl } = {}) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const base = (pageUrl || DOTB_PAGE).split('?')[0];
  if (!targetInfos.some((x) => x.type === 'page' && x.url.startsWith(base))) return 0; // page fermée = rien ne tourne
  const { sessionId } = await openDotbTab(cdp, pageUrl);
  const h = new Human(cdp, sessionId);
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const ok = await h.clickEl(`() => [...document.querySelectorAll('button')].find((b) => /^(arr[êe]ter|stop|d[ée]connecter)/i.test(b.innerText.trim()))`);
    if (!ok) break;
    n++;
    await sleep(1200);
    await h.clickEl(`() => [...document.querySelectorAll('[role=dialog] button, [role=alertdialog] button')].find((b) => /^(arr[êe]ter|confirmer|oui|ok)/i.test(b.innerText.trim()))`).catch(() => {});
    await sleep(600);
  }
  return n;
}

// Diagnostic : capture + description des cartes et contrôles de la page
async function diagnose(cdp) {
  const { sessionId } = await openDotbTab(cdp);
  const h = new Human(cdp, sessionId);
  await waitFor(h, `document.querySelectorAll('button').length > 3`, 20000);
  await sleep(1500);
  const info = await h.eval(`(() => ({
    url: location.href,
    buttons: [...document.querySelectorAll('button')].map((b) => ({ text: b.innerText.trim().slice(0, 80), role: b.getAttribute('role'), aria: b.getAttribute('aria-checked') || b.getAttribute('aria-expanded'), haspopup: b.getAttribute('aria-haspopup') })),
    selects: [...document.querySelectorAll('select')].map((s) => [...s.options].map((o) => o.text)),
    switches: [...document.querySelectorAll('[role=switch], input[type=checkbox]')].map((s) => ({ checked: s.checked ?? s.getAttribute('aria-checked'), near: (s.closest('div') || {}).innerText?.slice(0, 120) })),
    headings: [...document.querySelectorAll('h1,h2,h3,h4')].map((x) => x.innerText.trim()),
    text: document.body.innerText.slice(0, 6000),
  }))()`);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId).catch(() => null);
  return { info, png: shot ? Buffer.from(shot.data, 'base64') : null };
}

module.exports = { startAutomations, stopAutomations, diagnose, DOTB_PAGE, DOTB_EXT_ID };
