// Languages. English is the source: UI text is written in English in the code
// and in index.html, wrapped in L(). Other languages live in i18n-<lang>.js,
// keyed by the English text. Anything missing falls back to English.
//
// To add a language (e.g. Spanish):
//   1. copy js/i18n/i18n-fr.js to js/i18n/i18n-es.js and translate the values,
//   2. add `es: 'Español'` to LANGS, `es: 'es-ES'` to LOCALES and
//      `es: () => import('./i18n-es.js')` — or a static import — to CATALOGS,
//   3. add a radio in Settings › General › Language (index.html, .lang-pick).
import FR from './i18n-fr.js';

const KEY = 'nemeris_lang';
export const LANGS = { en: 'English', fr: 'Français' };
const LOCALES = { en: 'en-US', fr: 'fr-FR' };
const CATALOGS = { en: null, fr: FR };

function detect() {
    try { const s = localStorage.getItem(KEY); if (s && Object.hasOwn(LANGS, s)) return s; } catch { /* storage blocked */ }
    return 'en';
}

export const LANG = detect();
export const LOCALE = LOCALES[LANG] || 'en-US';
const CATALOG = CATALOGS[LANG] ?? null;

const fill = (s, args) => args.length ? s.replace(/\{(\d+)\}/g, (m, i) => String(args[i] ?? '')) : s;

/** Looks up an English source string. {0}, {1}... are replaced by the extra arguments. */
export function L(text, ...args) {
    const v = CATALOG?.[text];
    return fill(typeof v === 'string' ? v : Array.isArray(v) ? v[1] : text, args);
}

/** Count-aware L: {0} is n. The catalog entry is keyed by the English plural
 *  form and holds [singular, plural]. English treats only 1 as singular. */
export function Ln(n, one, many, ...args) {
    const all = [n, ...args];
    if (!CATALOG) return fill(Math.abs(n) !== 1 ? many : one, all);
    const v = CATALOG[many], plural = Math.abs(n) !== 1;
    return fill(Array.isArray(v) ? v[plural ? 1 : 0] : (typeof v === 'string' ? v : plural ? many : one), all);
}

export function setLang(lang) {
    if (!Object.hasOwn(LANGS, lang) || lang === LANG) return;
    try { localStorage.setItem(KEY, lang); } catch { /* storage blocked */ }
    location.reload();
}

/* index.html is written in English: translate it once for other languages, before the app renders anything. */
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const INLINE = new Set(['STRONG', 'B', 'EM', 'I', 'A', 'SPAN', 'BR', 'CODE', 'ABBR', 'SMALL']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const norm = s => s.replace(/\s+/g, ' ').trim();
function translateNode(node) {
    if (node.nodeType === 3) {
        const v = CATALOG[norm(node.nodeValue)];
        if (typeof v === 'string') { const m = node.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/); node.nodeValue = m[1] + v + m[2]; }
        return;
    }
    if (node.nodeType === 1) {
        if (SKIP.has(node.tagName)) return;
        for (const a of ATTRS) {
            const x = node.getAttribute(a);
            const v = x && CATALOG[norm(x)];
            if (typeof v === 'string') node.setAttribute(a, v);
        }
        if (node.tagName === 'TEMPLATE') { translateNode(node.content); return; }
        if (node.childElementCount && node.childElementCount <= 3 && [...node.children].every(c => INLINE.has(c.tagName))) {
            const v = CATALOG[norm(node.innerHTML)];
            if (typeof v === 'string') { node.innerHTML = v; return; }
        }
    } else if (node.nodeType !== 11) return;
    for (const c of [...node.childNodes]) translateNode(c);
}

document.documentElement.lang = LANG;
if (CATALOG) {
    document.title = L(document.title);
    translateNode(document.body);
}
// index.html hides the page only while a non-English translation is applied,
// so the English source never flashes before the French.
document.documentElement.classList.remove('i18n-wait');
