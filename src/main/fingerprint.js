// Empreinte par profil : écran, carte graphique (WebGL), cœurs, mémoire, langue et fuseau.
// Générée une fois par profil (stable d'une ouverture à l'autre), cohérente avec le vrai PC.
const crypto = require('crypto');

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
function seeded(seed) {
  let h = crypto.createHash('sha256').update(String(seed)).digest();
  let i = 0;
  return () => {
    if (i + 4 > h.length) { h = crypto.createHash('sha256').update(h).digest(); i = 0; }
    const v = h.readUInt32LE(i) / 0x100000000;
    i += 4;
    return v;
  };
}

// Cartes graphiques réalistes (chaînes ANGLE Windows), par fabricant
const GPUS = {
  intel: [
    'Intel(R) UHD Graphics 620 (0x00005917)', 'Intel(R) UHD Graphics 630 (0x00003E92)', 'Intel(R) UHD Graphics (0x00009A78)',
    'Intel(R) Iris(R) Xe Graphics (0x00009A49)', 'Intel(R) UHD Graphics 770 (0x00004680)', 'Intel(R) HD Graphics 620 (0x00005916)',
    'Intel(R) Iris(R) Xe Graphics (0x0000A7A0)', 'Intel(R) UHD Graphics 730 (0x00004692)',
  ],
  nvidia: [
    'NVIDIA GeForce GTX 1650 (0x00001F82)', 'NVIDIA GeForce GTX 1660 SUPER (0x000021C4)', 'NVIDIA GeForce RTX 2060 (0x00001F08)',
    'NVIDIA GeForce RTX 3060 (0x00002504)', 'NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560)', 'NVIDIA GeForce RTX 3070 (0x00002484)',
    'NVIDIA GeForce RTX 4060 (0x00002882)', 'NVIDIA GeForce GTX 1050 Ti (0x00001C82)',
  ],
  amd: [
    'AMD Radeon RX 580 2048SP (0x00006FDF)', 'AMD Radeon(TM) Graphics (0x00001638)', 'AMD Radeon RX 6600 (0x000073FF)',
    'AMD Radeon RX 5700 XT (0x0000731F)', 'AMD Radeon(TM) Vega 8 Graphics (0x000015D8)', 'AMD Radeon RX 6700 XT (0x000073DF)',
  ],
};
const VENDOR_NAME = { intel: 'Intel', nvidia: 'NVIDIA', amd: 'AMD' };

const SCREENS = [[1366, 768], [1440, 900], [1536, 864], [1600, 900], [1680, 1050], [1920, 1080], [1920, 1200], [2560, 1080], [2560, 1440]];

function vendorFromId(id) {
  if (id === 0x10de) return 'nvidia';
  if (id === 0x1002 || id === 0x1022) return 'amd';
  return 'intel';
}

// real = { width, height, gpuVendor ('intel'|'nvidia'|'amd'), cores }
function generate(seed, real) {
  const rnd = seeded(seed);
  // Écran au moins aussi grand que l'écran réel (sinon une fenêtre maximisée dépasserait l'écran annoncé)
  const fits = SCREENS.filter(([w, h]) => w >= real.width && h >= real.height);
  const [w, h] = fits.length ? pick(fits, rnd) : [real.width, real.height];
  const vendor = real.gpuVendor || 'intel';
  const renderer = pick(GPUS[vendor], rnd);
  const maxCores = Math.max(4, real.cores || 8);
  const cores = pick([4, 6, 8, 8, 12, 16].filter((c) => c <= maxCores), rnd) || 4;
  const memory = pick([4, 8, 8, 8, 16], rnd);
  return {
    v: 1,
    screen: { width: w, height: h, availHeight: h - 40 },
    gpu: { vendor: `Google Inc. (${VENDOR_NAME[vendor]})`, renderer: `ANGLE (${VENDOR_NAME[vendor]}, ${renderer} Direct3D11 vs_5_0 ps_5_0, D3D11)` },
    cores,
    memory,
  };
}

const LOCALES = {
  FR: ['fr-FR', 'fr'], BE: ['fr-BE', 'fr', 'nl'], LU: ['fr-LU', 'fr', 'de'], CH: ['fr-CH', 'fr', 'de'], ES: ['es-ES', 'es'], IT: ['it-IT', 'it'],
  DE: ['de-DE', 'de'], AT: ['de-AT', 'de'], NL: ['nl-NL', 'nl'], PT: ['pt-PT', 'pt'], PL: ['pl-PL', 'pl'], CZ: ['cs-CZ', 'cs'], SK: ['sk-SK', 'sk'],
  LT: ['lt-LT', 'lt'], LV: ['lv-LV', 'lv'], EE: ['et-EE', 'et'], HU: ['hu-HU', 'hu'], RO: ['ro-RO', 'ro'], HR: ['hr-HR', 'hr'], SE: ['sv-SE', 'sv'],
  DK: ['da-DK', 'da'], FI: ['fi-FI', 'fi'], GR: ['el-GR', 'el'], IE: ['en-IE', 'en'], GB: ['en-GB', 'en'], US: ['en-US', 'en'],
};
function localeFor(countryCode) {
  const l = LOCALES[String(countryCode || '').toUpperCase()] || LOCALES.FR;
  return { lang: l[0], accept: [...new Set([...l, 'en-US', 'en'])].join(',') };
}

// Script injecté dans chaque page / cadre / worker avant le code du site
function injectionScript(fp) {
  return `(() => {
  if (self.__gbfp) return; Object.defineProperty(self, '__gbfp', { value: 1, enumerable: false });
  const fp = ${JSON.stringify(fp)};
  const ns = new WeakMap();
  const nativeToString = Function.prototype.toString;
  const toString = function toString() { return ns.has(this) ? ns.get(this) : nativeToString.call(this); };
  ns.set(toString, 'function toString() { [native code] }');
  Object.defineProperty(Function.prototype, 'toString', { value: toString, writable: true, configurable: true, enumerable: false });
  const native = (fn, name) => { ns.set(fn, 'function ' + name + '() { [native code] }'); return fn; };
  const getter = (proto, prop, val) => {
    if (!proto) return;
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.get) return;
    Object.defineProperty(proto, prop, { ...d, get: native(function () { return val; }, 'get ' + prop) });
  };
  const navProto = (self.Navigator || self.WorkerNavigator || {}).prototype;
  getter(navProto, 'hardwareConcurrency', fp.cores);
  getter(navProto, 'deviceMemory', fp.memory);
  if (self.Screen) {
    const sp = Screen.prototype;
    getter(sp, 'width', fp.screen.width); getter(sp, 'height', fp.screen.height);
    getter(sp, 'availWidth', fp.screen.width); getter(sp, 'availHeight', fp.screen.availHeight);
    getter(sp, 'availLeft', 0); getter(sp, 'availTop', 0);
  }
  const patchGL = (C) => {
    if (!C) return;
    const orig = C.prototype.getParameter;
    const p = native(function getParameter(x) {
      if (x === 37445) return fp.gpu.vendor;
      if (x === 37446) return fp.gpu.renderer;
      return orig.apply(this, arguments);
    }, 'getParameter');
    Object.defineProperty(C.prototype, 'getParameter', { value: p, writable: true, configurable: true, enumerable: true });
  };
  patchGL(self.WebGLRenderingContext);
  patchGL(self.WebGL2RenderingContext);
})();`;
}

module.exports = { generate, injectionScript, localeFor, vendorFromId };
