// Language of the site: English by default, French when it is chosen in the menu.
//
// English is the text written in the pages. French lives in assets/i18n/fr.json, keyed by the
// English text, so nothing in the pages has to be marked: any block of text, or attribute, whose
// English is in the dictionary is replaced when the page loads. Text built by scripts goes
// through t().

const STORAGE_KEY = 'lang';
const LANGUAGES = ['en', 'fr'];

function preference() {
    const asked = new URLSearchParams(location.search).get('lang');
    try {
        if (LANGUAGES.includes(asked)) localStorage.setItem(STORAGE_KEY, asked);
        const saved = localStorage.getItem(STORAGE_KEY);
        return LANGUAGES.includes(asked) ? asked : LANGUAGES.includes(saved) ? saved : 'en';
    } catch {
        return LANGUAGES.includes(asked) ? asked : 'en';
    }
}

export const lang = preference();
document.documentElement.lang = lang;

// "Role: x" in English, "Rôle : x" in French.
export const colon = lang === 'fr' ? '\u00a0: ' : ': ';

const dictionary = {};
// The French values, to tell French text that is already in the page from English to look up.
let translated = null;
// English the dictionary does not know yet. Read by the checks that crawl the site.
export const misses = new Set();

async function fetchDictionary(path) {
    try {
        const response = await fetch(new URL(path, import.meta.url));
        return response.ok ? await response.json() : {};
    } catch {
        return {};
    }
}

export async function addTranslations(path) {
    if (lang !== 'fr') return;
    Object.assign(dictionary, await fetchDictionary(path));
    translated = null;
}

await addTranslations('../i18n/fr.json');

const normalize = text => text.replace(/\s+/g, ' ').trim();
const hasWords = text => /[A-Za-z]{3}/.test(text);

const isTranslated = key => (translated ??= new Set(Object.values(dictionary))).has(key);

const record = key => { if (hasWords(key) && !isTranslated(key)) misses.add(key); };

function lookup(key, context) {
    const found = (context && dictionary[`${context}|${key}`]) ?? dictionary[key];
    if (found === undefined) record(key);
    return found;
}

// Translates one string. A context tells apart English words that have two French ones.
export function t(text, context) {
    if (lang !== 'fr' || text == null || text === '') return text;
    return lookup(normalize(String(text)), context) ?? text;
}

const INLINE = new Set(['A', 'B', 'STRONG', 'EM', 'I', 'U', 'SPAN', 'BR', 'WBR', 'SMALL', 'SUP', 'SUB', 'TIME', 'ABBR', 'MARK', 'CODE']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'CANVAS', 'SVG']);
const ATTRIBUTES = ['alt', 'aria-label', 'title', 'placeholder', 'data-cursor'];

const keyOf = html => normalize(html.replace(/&amp;/g, '&').replace(/\s*<br\s*\/?>\s*/g, '<br>'));
const hasOwnText = element => [...element.childNodes].some(node => node.nodeType === 3 && node.nodeValue.trim());
const isInlineOnly = element => [...element.children].every(child => INLINE.has(child.tagName) && isInlineOnly(child));

// A block of text with inline markup is looked up as a whole first. When that fails, or when
// the block is plain text, each text node is looked up on its own.
export function translate(root = document.body) {
    if (lang !== 'fr') return;
    for (const element of [root, ...root.querySelectorAll('*')]) {
        if (!element.isConnected || SKIP.has(element.tagName.toUpperCase())) continue;
        for (const name of ATTRIBUTES) {
            const value = element.getAttribute?.(name);
            if (value && hasWords(value)) {
                const found = lookup(normalize(value));
                if (found !== undefined) element.setAttribute(name, found);
            }
        }
        if (!hasOwnText(element)) continue;
        const withMarkup = element.children.length > 0 && isInlineOnly(element);
        if (withMarkup) {
            const key = keyOf(element.innerHTML);
            if (dictionary[key] !== undefined) { element.innerHTML = dictionary[key]; continue; }
        }
        let complete = true;
        for (const node of element.childNodes) {
            if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
            const found = lookup(normalize(node.nodeValue));
            if (found !== undefined) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), () => found);
            else if (!isTranslated(normalize(node.nodeValue))) complete = false;
        }
        if (withMarkup && !complete) record(keyOf(element.innerHTML));
    }
}

export function translateHead() {
    if (lang !== 'fr') return;
    document.title = t(document.title);
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = t(description.content);
}

// Reloads the page in the chosen language, without a ?lang= left in the address.
export function setLanguage(next) {
    if (!LANGUAGES.includes(next) || next === lang) return;
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        url.searchParams.set('lang', next);
    }
    if (url.href === location.href) location.reload();
    else location.replace(url.href);
}
