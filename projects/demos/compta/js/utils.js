export const $ = id => document.getElementById(id);
export const pad = n => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const round2 = n => Math.round((+n || 0) * 100) / 100;
export const fmtPrice = n => (+n || 0).toFixed(2).replace('.', ',') + ' €';
export const uid = () => 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function parseIso(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

export function fmtDate(s) {
  const d = parseIso(s);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : s || '';
}

export const titleCase = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  .replace(/(^|[\s-])([^\s-])/g, (_, sep, c) => sep + c.toUpperCase());

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(fn, ms, ...a); };
}

export function avatar(el, name = '') {
  const p = name.trim().split(/\s+/).filter(Boolean);
  el.textContent = (!p.length ? '?' : p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
  el.style.cssText = p.length ? `background:hsl(${h % 360},${20 + h % 16}%,${72 + h % 16}%);color:var(--text)` : '';
}

export function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const scripts = new Map();
export function loadScript(src) {
  if (!scripts.has(src)) scripts.set(src, new Promise((ok, ko) => {
    const s = Object.assign(document.createElement('script'), { src, onload: ok });
    s.onerror = e => { scripts.delete(src); ko(e); };
    document.head.append(s);
  }));
  return scripts.get(src);
}

const images = new Map();
export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (!images.has(src)) images.set(src, fetch(src)
    .then(r => r.ok ? r.blob() : Promise.reject(r.status))
    .then(blob => new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onerror = ko;
      fr.onload = () => {
        const im = new Image();
        im.onload = () => ok({ data: fr.result, w: im.naturalWidth, h: im.naturalHeight, alias: src });
        im.onerror = ko;
        im.src = fr.result;
      };
      fr.readAsDataURL(blob);
    }))
    .catch(e => { console.error('loadImage failed:', src, e); return null; }));
  return images.get(src);
}
