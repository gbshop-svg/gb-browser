// Gardien d'un profil ouvert : reste connecté au navigateur et applique l'empreinte
// (script + fuseau horaire) à chaque onglet, cadre et worker AVANT que le site ne s'exécute.
const { CDP } = require('./cdp');

class Guardian {
  constructor(port, { script, timezone, log }) {
    this.port = port;
    this.script = script;
    this.timezone = timezone || null;
    this.log = log || (() => {});
    this.cdp = null;
    this.closed = false;
  }

  async start() {
    this.cdp = await CDP.forPort(this.port);
    this.cdp.on((m) => {
      if (m.method === 'Target.attachedToTarget') this.onAttached(m.params, m.sessionId).catch(() => {});
    });
    this.cdp.socket.on('close', () => { this.closed = true; });
    await this.cdp.send('Target.setAutoAttach', {
      autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    });
    return this;
  }

  async onAttached({ sessionId, targetInfo, waitingForDebugger }, parentSession) {
    const c = this.cdp;
    const t = targetInfo.type;
    const isExt = /^chrome-extension:|^devtools:|^chrome:|^brave:/.test(targetInfo.url || '');
    try {
      if (!isExt) {
        if (t === 'page' || t === 'iframe') {
          await c.send('Page.enable', {}, sessionId).catch(() => {});
          await c.send('Page.addScriptToEvaluateOnNewDocument', { source: this.script, runImmediately: true }, sessionId).catch(() => {});
          if (this.timezone) await c.send('Emulation.setTimezoneOverride', { timezoneId: this.timezone }, sessionId).catch(() => {});
          // cadres et workers enfants de cette page
          await c.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId).catch(() => {});
        } else if (t === 'worker' || t === 'shared_worker' || t === 'service_worker') {
          await c.send('Runtime.evaluate', { expression: this.script }, sessionId).catch(() => {});
          if (this.timezone) await c.send('Emulation.setTimezoneOverride', { timezoneId: this.timezone }, sessionId).catch(() => {});
        }
      }
    } finally {
      if (waitingForDebugger) await c.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
    }
  }

  stop() {
    this.closed = true;
    if (this.cdp) this.cdp.close();
  }
}

module.exports = { Guardian };
