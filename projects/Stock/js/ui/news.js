import { periodToDays } from '../core/constants.js';
import { positions } from '../core/state.js';
import { fetchTickerNewsItems, fetchSymbolNewsItems } from '../terminal/command/news.js';
import { getEl, el, formatPct, progressBar, showCard } from '../core/utils.js';
import { L, LOCALE } from '../i18n/i18n.js';

let pageItems = [], pageScope = 'mine', pageTimer = 0;
const cardTimers = {};

const when = value => {
    const d = new Date(value || Date.now());
    if (Number.isNaN(d.getTime())) return '';
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 90) return L('just now');
    if (s < 3600) return L('{0} min ago', Math.round(s / 60));
    if (s < 86400) return L('{0} h ago', Math.floor(s / 3600));
    if (s < 7 * 86400) return L('{0} d ago', Math.floor(s / 86400));
    return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
};
const byDate = items => items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
const matches = (items, q) => {
    const n = (q || '').trim().toLowerCase();
    return n ? items.filter(i => `${i.title} ${i.summary || ''} ${i.source || ''}`.toLowerCase().includes(n)) : items;
};

function safeUrl(url) {
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; }
}

function newsItem(item) {
    const href = safeUrl(item.url);
    const a = el(href ? 'a' : 'div', 'news-item', null, href && { href, target: '_blank', rel: 'noopener noreferrer' });
    a.append(el('h3', 'news-title', item.title || L('Untitled')));
    if (item.summary) a.append(el('p', 'news-summary', item.summary));
    const meta = el('p', 'news-meta');
    const d = new Date(item.publishedAt);
    meta.append(el('span', 'news-source', item.source || 'Source'), el('time', null, when(item.publishedAt), !Number.isNaN(d.getTime()) && { dateTime: d.toISOString(), title: d.toLocaleString(LOCALE) }));
    const seen = new Set();
    for (const sym of new Set([item.symbol, ...(item.symbols || []), ...(item.relatedTickers || [])].filter(Boolean))) {
        const key = positions[sym] ? sym : Object.keys(positions).find(k => positions[k].ticker === sym);
        const data = key && positions[key].lastData;
        if (!data || !Number.isFinite(data.changePercent) || seen.has(key)) continue;
        seen.add(key);
        meta.append(el('span', `news-badge ${data.changePercent >= 0 ? 'positive' : 'negative'}`, `${positions[key].ticker || key} ${formatPct(data.changePercent)}`));
    }
    a.append(meta);
    return a;
}

function renderList(host, items, emptyText) {
    host.replaceChildren(...(items.length ? items.map(newsItem) : [el('p', 'empty', emptyText)]));
}

/** Headlines newest first, narrowed to what is typed in the search box. */
function showNews(host, items, q) {
    renderList(host, byDate(matches(items, q)), q ? L('No headline matches.') : L('No recent news.'));
}

function tickersFor(symbol) {
    const out = new Set();
    for (const v of [symbol, positions[symbol]?.ticker]) {
        if (typeof v !== 'string' || !v.trim()) continue;
        const n = v.trim().toUpperCase();
        out.add(n);
        const dot = n.lastIndexOf('.');
        if (dot > 0) out.add(n.slice(0, dot));
    }
    return [...out];
}
function onlyAbout(items, symbol) {
    const tickers = tickersFor(symbol);
    return (items || []).filter(i => i.relatedTickers?.length ? i.relatedTickers.some(t => tickers.includes(t.toUpperCase())) : i.symbol === symbol);
}

/* ── the News tab of a stock ── */
export async function fetchCardNews(symbol, force = false, limit = 50, days = 7) {
    const pos = positions[symbol];
    if (!pos) return [];
    if (!force && pos.lastNewsFetch && Date.now() - pos.lastNewsFetch < 600000) { updateNewsUI(symbol, pos.news); return pos.news; }
    const host = getEl(`news-list-${symbol}`);
    let bar = null;
    if (host && !pos.news?.length) {
        bar = progressBar({ compact: true }).busy(L('Loading news'), pos.ticker || symbol);
        host.replaceChildren(bar.el);
    }
    try {
        const items = await fetchSymbolNewsItems({ symbol, positions, limit, days });
        if (Array.isArray(items)) {
            pos.news = onlyAbout(items, symbol);
            pos.lastNewsFetch = Date.now();
            updateNewsUI(symbol, pos.news);
            return pos.news;
        }
    } catch { /* keep what we had */ }
    if (bar?.el.isConnected) updateNewsUI(symbol, pos.news || []);
    return [];
}

function updateNewsUI(symbol, items) {
    const host = getEl(`news-list-${symbol}`);
    if (host) showNews(host, items || [], getEl(`card-${symbol}`)?.querySelector('.news-search-input')?.value || '');
}

export function setupNewsSearch(symbol) {
    getEl(`card-${symbol}`)?.querySelector('.news-search-input')?.addEventListener('input', () => updateNewsUI(symbol, positions[symbol]?.news || []));
}

export function startCardNewsAutoRefresh(symbol) {
    clearInterval(cardTimers[symbol]);
    cardTimers[symbol] = setInterval(() => {
        const card = getEl(`card-${symbol}`);
        if (card?.classList.contains('active') && card.querySelector('[data-pane="news"]')?.classList.contains('active')) fetchCardNews(symbol, true);
    }, 60000);
}
export function stopCardNewsAutoRefresh(symbol) { clearInterval(cardTimers[symbol]); }

/* ── the News page: your stocks first ── */
function scopeSymbols(scope) {
    const all = Object.keys(positions);
    if (scope === 'mine') return all.filter(s => positions[s].shares > 0);
    if (scope === 'watch') return all.filter(s => !(positions[s].shares > 0) && !positions[s].suspended);
    return [scope];
}

function renderChips() {
    const host = getEl('news-chips');
    if (!host) return;
    const held = scopeSymbols('mine');
    const chips = [['mine', L('My stocks')], ['watch', 'Watchlist'], ...held.map(s => [s, positions[s].name || s])];
    host.replaceChildren(...chips.map(([k, label]) =>
        el('button', `chip${k === pageScope ? ' active' : ''}`, label, { type: 'button', 'data-scope': k, 'aria-pressed': k === pageScope })));
}

async function loadPage() {
    const host = getEl('news-page-feed-list');
    if (!host) return;
    const symbols = scopeSymbols(pageScope);
    if (!symbols.length) { renderList(host, [], pageScope === 'mine' ? L('Add a trade on a stock page to see news about your stocks here.') : L('Nothing to show.')); return; }
    const bar = progressBar().busy(L('Loading news'));
    host.replaceChildren(bar.el);
    const unique = new Map();
    let done = 0;
    const queue = [...symbols];
    const worker = async () => { for (let sym; (sym = queue.shift());) await loadOne(sym); };
    const loadOne = async sym => {
        try {
            const items = await fetchTickerNewsItems({ ticker: positions[sym].ticker || sym, limit: 20, days: periodToDays('1M') });
            for (const item of onlyAbout((items || []).map(i => ({ ...i, symbol: sym })), sym)) {
                const key = item.url || item.title;
                const hit = unique.get(key) || { ...item, symbols: new Set() };
                hit.symbols.add(sym);
                unique.set(key, hit);
            }
        } catch { /* one source down is fine */ }
        bar.set(++done / symbols.length, L('Loading news'), `${done} / ${symbols.length}`);
    };
    await Promise.all(Array.from({ length: Math.min(4, symbols.length) }, worker));
    pageItems = [...unique.values()].map(i => ({ ...i, symbols: [...i.symbols] }));
    renderPage();
}

const renderPage = () => showNews(getEl('news-page-feed-list'), pageItems, getEl('news-article-search')?.value || '');

getEl('news-chips')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.dataset.scope === pageScope) return;
    pageScope = chip.dataset.scope;
    renderChips();
    loadPage();
});
getEl('news-article-search')?.addEventListener('input', renderPage);

export function openNewsPage() {
    showCard('card-news');
    renderChips();
    loadPage();
    clearInterval(pageTimer);
    pageTimer = setInterval(() => { if (getEl('card-news')?.classList.contains('active')) loadPage(); }, 120000);
}

export const closeNewsPage = () => clearInterval(pageTimer);
