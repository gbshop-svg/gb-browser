// Lit tous les cookies du profil (déchiffrés par le navigateur) et les envoie à GB Browser
importScripts('config.js');
(async () => {
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    let all = [];
    for (const s of stores) all = all.concat(await chrome.cookies.getAll({ storeId: s.id }));
    await fetch(`http://127.0.0.1:${GB_PORT}/cookies?t=${GB_TOKEN}`, { method: 'POST', body: JSON.stringify(all) });
  } catch (e) {
    try { await fetch(`http://127.0.0.1:${GB_PORT}/error?t=${GB_TOKEN}`, { method: 'POST', body: String(e) }); } catch {}
  }
})();
