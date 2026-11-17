// Empêche la mise en veille (économiseur de mémoire) des onglets Vinted et de la page DotB
const KEEP = /^https:\/\/([a-z0-9-]+\.)?vinted\.[a-z.]+\/|^chrome-extension:\/\/ancgmmmephcjikpmffmfinnlpamekedn\//i;
function protect(tab) {
  if (tab && tab.id != null && tab.url && KEEP.test(tab.url) && tab.autoDiscardable !== false) {
    chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
  }
}
chrome.tabs.onUpdated.addListener((id, info, tab) => { if (info.url || info.status === 'complete') protect(tab); });
chrome.tabs.onCreated.addListener(protect);
chrome.runtime.onStartup.addListener(() => chrome.tabs.query({}).then((t) => t.forEach(protect)));
chrome.tabs.query({}).then((t) => t.forEach(protect));
