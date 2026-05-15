import { periodToDays } from './constants.js';
import { fetchTickerNewsItems, fetchSymbolNewsItems } from './command/news.js';
import { getEl, formatPct } from './utils.js';

let positions = {};
let lastPageNews = [];
let currentNewsPeriod = '1D';
let currentNewsSymbol = null;
let lastActiveSymbol = null;
let newsRefreshInterval = null;
let cardRefreshIntervals = {};

const formatNewsDate = value => new Date(value || new Date()).toLocaleString('en-US');
const sortNewsItems = items => items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
const normalizeQuery = q => (q || '').trim().toLowerCase();

const getTickerLabel = symbol => positions[symbol]?.ticker || symbol;

const buildNewsAnchorItem = (item, { className, includeSummary = true }) => {
    const a = document.createElement('a');
    a.className = className;
    a.href = item.url || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const t = document.createElement('div');
    t.className = 'news-title';
    t.textContent = item.title || '—';
    a.appendChild(t);

    const m = document.createElement('div');
    m.className = 'news-meta';
    const src = document.createElement('span');
    src.className = 'news-source';
    src.textContent = item.source || 'Source';
    m.appendChild(src);
    m.appendChild(document.createTextNode(` • ${formatNewsDate(item.publishedAt)}`));
    a.appendChild(m);

    if (includeSummary && item.summary) {
        const s = document.createElement('div');
        s.className = 'news-summary';
        s.textContent = item.summary;
        a.appendChild(s);
    }

    // One sentiment badge per affected portfolio position
    const allSymbols = [...new Set([item.symbol, ...(item.symbols || []), ...(item.relatedTickers || [])].filter(Boolean))];
    const seen = new Set();
    const matches = [];
    for (const sym of allSymbols) {
        let label = null, data = null;
        if (positions[sym]?.lastData?.changePercent !== undefined) {
            label = getTickerLabel(sym);
            data = positions[sym].lastData;
        } else {
            const k = Object.keys(positions).find(k => positions[k].ticker === sym || k === sym);
            if (k && positions[k].lastData?.changePercent !== undefined) {
                label = getTickerLabel(k);
                data = positions[k].lastData;
            }
        }
        if (label && data && !seen.has(label)) {
            seen.add(label);
            matches.push({ label, data });
        }
    }

    if (matches.length > 0) {
        a.classList.add(matches[0].data.change >= 0 ? 'perf-positive' : 'perf-negative');
        const footer = document.createElement('div');
        footer.className = 'news-badges';
        for (const { label, data } of matches) {
            const badge = document.createElement('span');
            badge.className = `news-badge ${data.change >= 0 ? 'positive' : 'negative'}`;
            badge.textContent = `${label} ${formatPct(data.changePercent)}`;
            footer.appendChild(badge);
        }
        a.appendChild(footer);
    }

    return a;
};

const filterNewsItems = (items, query) => {
    const q = normalizeQuery(query);
    if (!q) return items;
    return items.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.summary || '').toLowerCase().includes(q) ||
        (i.source || '').toLowerCase().includes(q)
    );
};

export function setPositions(pos) { positions = pos; }

export async function fetchCardNews(symbol, force = false, limit = 50, days = 7, apiName = null) {
    if (!positions[symbol]) return;
    const now = Date.now();
    if (!force && positions[symbol].lastNewsFetch && (now - positions[symbol].lastNewsFetch) < 600000) {
        updateNewsUI(symbol, positions[symbol].news);
        return positions[symbol].news;
    }
    try {
        const api = apiName || window.getSelectedApi?.() || window.selectedApi || 'yahoo';
        const enriched = await fetchSymbolNewsItems({
            symbol,
            positions,
            limit,
            days,
            apiName: api
        });
        if (Array.isArray(enriched)) {
            const filtered = filterBySymbol(enriched, symbol);
            positions[symbol].news = filtered;
            positions[symbol].lastNewsFetch = now;
            updateNewsUI(symbol, filtered);
            const card = getEl('card-news');
            if (card?.classList.contains('active') && currentNewsSymbol === symbol) updateNewsPageList(filtered);
            return filtered;
        }
    } catch (e) {}
    return [];
}

export function startCardNewsAutoRefresh(symbol) {
    if (cardRefreshIntervals[symbol]) clearInterval(cardRefreshIntervals[symbol]);
    cardRefreshIntervals[symbol] = setInterval(() => {
        const card = getEl(`card-${symbol}`);
        const pane = card?.querySelector('[data-pane="news"]');
        if (card?.classList.contains('active') && pane?.classList.contains('active')) fetchCardNews(symbol, true);
    }, 60000);
}

export function stopCardNewsAutoRefresh(symbol) {
    if (cardRefreshIntervals[symbol]) { clearInterval(cardRefreshIntervals[symbol]); delete cardRefreshIntervals[symbol]; }
}

export function updateNewsUI(symbol, items, filter = null) {
    const el = getEl(`news-list-${symbol}`);
    if (!el) return;
    // Removed news last update noise
    if (filter === null) {
        const inp = document.querySelector(`#card-${symbol} .news-search-input`);
        if (inp) filter = inp.value;
    }
    el.innerHTML = '';
    let list = items || [];
    list = filterNewsItems(list, filter);
    if (!list.length) { el.textContent = filter ? 'No results.' : 'No recent news.'; return; }

    sortNewsItems(list).forEach(item => {
        el.appendChild(buildNewsAnchorItem(item, { className: 'news-item' }));
    });
}

export function setupNewsSearch(symbol) {
    const inp = document.querySelector(`#card-${symbol} .news-search-input`);
    if (!inp) return;
    const clone = inp.cloneNode(true);
    inp.parentNode.replaceChild(clone, inp);
    clone.addEventListener('input', e => updateNewsUI(symbol, positions[symbol]?.news || [], e.target.value));
}

export function updateNewsPageList(items, opts = {}) {
    const { replaceCache = true, skipSort = false } = opts;
    const el = getEl('news-page-feed-list');
    if (!el) return;
    el.innerHTML = '';
    if (!items?.length) { el.innerHTML = '<div class="news-empty">No news found</div>'; if (replaceCache) lastPageNews = []; return; }
    let list = items.slice();
    if (!skipSort) sortNewsItems(list);
    if (replaceCache) lastPageNews = list;
    list.forEach(item => {
        el.appendChild(buildNewsAnchorItem(item, { className: 'news-item' }));
    });
    // Removed news last update noise
}

export async function openNewsPage(symbol, options = {}) {
    const card = getEl('card-news');
    if (!card) return;
    const activeTab = document.querySelector('.tab.active');
    lastActiveSymbol = activeTab?.dataset.symbol || null;
    document.querySelectorAll('.card').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    getEl('open-news-feed')?.classList.add('active');
    populateSuggestions();
    const inp = getEl('news-ticker-search');
    if (inp) inp.value = (options.search || '').trim().toUpperCase();
    setupNewsFilters();
    await loadNews();
    if (newsRefreshInterval) clearInterval(newsRefreshInterval);
    newsRefreshInterval = setInterval(() => { if (getEl('card-news')?.classList.contains('active')) loadNews(); }, 60000);
}

function populateSuggestions() {
    const el = getEl('ticker-suggestions');
    if (!el) return;
    el.innerHTML = '';
    Object.keys(positions).forEach(sym => {
        const pos = positions[sym];
        const d = document.createElement('div');
        d.className = 'ticker-suggestion-item';
        d.dataset.symbol = sym;
        d.innerHTML = `<span class="ticker-symbol">${pos.ticker || sym}</span>${pos.name || ''}`;
        d.addEventListener('click', () => { const inp = getEl('news-ticker-search'); if (inp) { inp.value = pos.ticker || sym; el.classList.remove('active'); loadNews(); } });
        el.appendChild(d);
    });
}

function setupNewsFilters() {
    const inp = getEl('news-ticker-search');
    const sug = getEl('ticker-suggestions');
    const art = getEl('news-article-search');
    if (inp && sug) {
        inp.addEventListener('focus', () => sug.classList.add('active'));
        inp.addEventListener('blur', () => setTimeout(() => sug.classList.remove('active'), 150));
        inp.addEventListener('input', e => {
            const v = (e.target.value || '').trim().toUpperCase();
            sug.querySelectorAll('.ticker-suggestion-item').forEach(i => { i.style.display = !v || i.dataset.symbol.toUpperCase().includes(v) || i.textContent.toUpperCase().includes(v) ? '' : 'none'; });
            sug.classList.add('active');
            if (!v) loadNews();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.value = (inp.value || '').trim().toUpperCase(); sug.classList.remove('active'); loadNews(); } });
    }
    if (art) {
        art.oninput = () => {
            const q = normalizeQuery(art.value);
            if (!q) updateNewsPageList(lastPageNews, { replaceCache: false, skipSort: true });
            else updateNewsPageList(filterNewsItems(lastPageNews, q), { replaceCache: false, skipSort: true });
        };
    }
}

async function loadNews() {
    const el = getEl('news-page-feed-list');
    const inp = getEl('news-ticker-search');
    const manual = (inp?.value || '').trim().toUpperCase();
    if (!el) return;
    el.innerHTML = '<div class="news-loading"><i class="fa-solid fa-spinner fa-spin"></i><span id="news-loading-text">Loading news...</span></div>';
    try {
        const api = window.getSelectedApi?.() || window.selectedApi || 'yahoo';
        const days = periodToDays(currentNewsPeriod);
        let tickers = [];
        if (manual) { tickers = [{ symbol: manual, ticker: manual }]; currentNewsSymbol = manual; }
        else { tickers = Object.keys(positions).map(s => ({ symbol: s, ticker: positions[s]?.ticker || s })); currentNewsSymbol = null; }
        if (!tickers.length) { el.innerHTML = '<div class="news-empty">Add assets or search for a ticker.</div>'; lastPageNews = []; return; }
        let all = [];
        let completed = 0;
        const updateProgress = () => { const t = getEl('news-loading-text'); if (t) t.textContent = `Loading... ${completed}/${tickers.length}`; };
        if (tickers.length > 1) updateProgress();

        const uniqueItems = new Map();

        for (const t of tickers) {
            try {
                const items = await fetchTickerNewsItems({ ticker: t.ticker, limit: 30, days, apiName: api });
                if (items?.length) {
                    const filtered = filterBySymbol(items.map(i => ({ ...i, symbol: t.symbol })), t.symbol);
                    filtered.forEach(item => {
                        const key = item.url || item.title;
                        if (!uniqueItems.has(key)) {
                            uniqueItems.set(key, { ...item, symbols: new Set() });
                        }
                        const stored = uniqueItems.get(key);
                        stored.symbols.add(t.symbol);
                        if (item.relatedTickers) item.relatedTickers.forEach(rt => stored.symbols.add(rt));
                    });
                }
            } catch (e) {}
            completed++;
            if (tickers.length > 1) updateProgress();
        }
        
        all = Array.from(uniqueItems.values()).map(i => ({ ...i, symbols: Array.from(i.symbols) }));
        if (manual && !all.length) {
            el.innerHTML = `<div class="news-empty">Ticker not found or no news found for ${manual}</div>`;
            lastPageNews = [];
            return;
        }
        all.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        updateNewsPageList(all);
    } catch (e) {
        el.innerHTML = `<div class="news-empty">Unable to load news${manual ? ` for ${manual}` : ''}.</div>`;
    }
}

export function closeNewsPage() {
    const card = getEl('card-news');
    if (!card) return;
    card.classList.remove('active');
    card.setAttribute('aria-hidden', 'true');
    currentNewsSymbol = null;
    if (newsRefreshInterval) { clearInterval(newsRefreshInterval); newsRefreshInterval = null; }
    getEl('open-news-feed')?.classList.remove('active');
    if (lastActiveSymbol) {
        document.querySelector(`.tab[data-symbol="${lastActiveSymbol}"]`)?.classList.add('active');
        getEl(`card-${lastActiveSymbol}`)?.classList.add('active');
        lastActiveSymbol = null;
    }
}

function buildTickers(symbol) {
    if (!symbol) return [];
    const pos = positions[symbol];
    const set = new Set();
    const add = v => { if (typeof v === 'string' && v.trim()) { const n = v.trim().toUpperCase(); set.add(n); const d = n.lastIndexOf('.'); if (d > 0) set.add(n.substring(0, d)); } };
    add(symbol);
    if (pos) { add(pos.ticker); }
    return [...set];
}

function filterBySymbol(items, symbol) {
    if (!symbol || !items?.length) return items || [];
    const tickers = buildTickers(symbol);
    if (!tickers.length) return items;
    return items.filter(i => { if (i.relatedTickers?.length) { const rel = i.relatedTickers.map(t => t.toUpperCase()); return tickers.some(t => rel.includes(t)); } return i.symbol === symbol; });
}