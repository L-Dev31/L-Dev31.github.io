import { proxyFetch } from './proxy-fetch.js';
import { L } from '../i18n/i18n.js';

const squash = s => String(s || '').replace(/\s+/g, ' ').trim();
const textOf = html => squash(new DOMParser().parseFromString(`<body>${html}`, 'text/html').body.textContent);
const lang = () => (navigator.language || 'en').slice(0, 2).toLowerCase();

async function bing(q, signal) {
    const r = await proxyFetch(`https://www.bing.com/search?format=rss&count=10&q=${encodeURIComponent(q)}`, { signal, expect: 'text', quiet: true });
    if (r.error) return [];
    const doc = new DOMParser().parseFromString(r.data, 'application/xml');
    return [...doc.querySelectorAll('item')].map(i => ({
        title: squash(i.querySelector('title')?.textContent),
        url: squash(i.querySelector('link')?.textContent),
        snippet: textOf(i.querySelector('description')?.textContent || '').slice(0, 320),
    })).filter(x => x.url && x.title);
}

async function duckduckgo(q, signal) {
    const r = await proxyFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { signal, expect: 'text', quiet: true });
    if (r.error) return [];
    const doc = new DOMParser().parseFromString(r.data, 'text/html');
    return [...doc.querySelectorAll('.result')].map(n => {
        const a = n.querySelector('a.result__a');
        let url = a?.getAttribute('href') || '';
        const m = url.match(/uddg=([^&]+)/);
        if (m) url = decodeURIComponent(m[1]);
        return { title: squash(a?.textContent), url, snippet: squash(n.querySelector('.result__snippet')?.textContent).slice(0, 320) };
    }).filter(x => /^https?:/.test(x.url) && x.title);
}

async function googleNews(q, signal) {
    const l = lang();
    const region = l === 'fr' ? 'FR' : 'US';
    const r = await proxyFetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${l}&gl=${region}&ceid=${region}:${l}`, { signal, expect: 'text', quiet: true });
    if (r.error) return [];
    const doc = new DOMParser().parseFromString(r.data, 'application/xml');
    return [...doc.querySelectorAll('item')].slice(0, 6).map(i => ({
        title: squash(i.querySelector('title')?.textContent),
        url: squash(i.querySelector('link')?.textContent),
        date: (d => Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10))(new Date(i.querySelector('pubDate')?.textContent || '')),
        source: squash(i.querySelector('source')?.textContent),
    })).filter(x => x.url && x.title);
}

async function wikipedia(q, signal) {
    try {
        const r = await fetch(`https://${lang()}.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&origin=*&srsearch=${encodeURIComponent(q)}`, { signal });
        const j = await r.json();
        return (j.query?.search || []).map(x => ({ title: x.title, url: `https://${lang()}.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g, '_'))}`, snippet: textOf(x.snippet) }));
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        return [];
    }
}

/** Web and news results for one query, most useful first. */
export async function webSearch(query, { signal } = {}) {
    const q = squash(query);
    if (!q) return { ok: false, error: L('Empty query.') };
    const [web, news, wiki] = await Promise.all([
        bing(q, signal).then(r => r.length ? r : duckduckgo(q, signal)),
        googleNews(q, signal),
        wikipedia(q, signal),
    ]);
    const seen = new Set();
    const results = [...web.slice(0, 7), ...news.slice(0, 4), ...wiki.slice(0, 2)].filter(x => !seen.has(x.url) && seen.add(x.url));
    if (!results.length) return { ok: false, error: L('No results. The configured API may block these sites, or the search is too narrow.') };
    return { ok: true, query: q, results };
}

/** The readable text of one web page. */
export async function readPage(url, { signal } = {}) {
    let u;
    try { u = new URL(url); } catch { return { ok: false, error: L('Not a valid address.') }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: L('Only web pages can be read.') };
    const r = await proxyFetch(u.href, { signal, expect: 'text', quiet: true });
    if (r.error) return { ok: false, error: `The page could not be opened (${r.errorCode}).` };
    const doc = new DOMParser().parseFromString(r.data, 'text/html');
    doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,svg,iframe,button').forEach(n => n.remove());
    const main = doc.querySelector('article') || doc.querySelector('main') || doc.body;
    const parts = [];
    let size = 0;
    for (const n of main?.querySelectorAll('h1,h2,h3,p,li,td') || []) {
        const t = squash(n.textContent);
        if (t.length < 25) continue;
        parts.push(t);
        size += t.length;
        if (size > 7000) break;
    }
    return { ok: true, url: u.href, title: squash(doc.querySelector('title')?.textContent), text: parts.join('\n').slice(0, 7000) };
}
