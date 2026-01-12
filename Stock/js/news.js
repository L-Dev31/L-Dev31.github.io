import { fetchNews } from './api/news.js';
import { loadApiConfig } from './general.js';

let positions = {};
let lastPageNews = [];
let currentNewsPeriod = '1D';
let currentNewsSymbol = null;
let lastActiveSymbol = null;
let newsRefreshInterval = null;
let cardRefreshIntervals = {};

const PERIOD_DAYS = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095, '5Y': 1825, 'MAX': 36500 };

export function periodToDays(p) { return PERIOD_DAYS[(p || '').toUpperCase()] || 7; }

export function setPositions(pos) { positions = pos; }

export async function fetchCardNews(symbol, force = false, limit = 50, days = 7, apiName = null) {
    if (!positions[symbol]) return;
    const now = Date.now();
    if (!force && positions[symbol].lastNewsFetch && (now - positions[symbol].lastNewsFetch) < 600000) {
        updateNewsUI(symbol, positions[symbol].news);
        return positions[symbol].news;
    }
    try {
        const config = await loadApiConfig();
        const api = apiName || window.getSelectedApi?.() || window.selectedApi || config.ui?.defaultApi || 'finnhub';
        const mapped = positions[symbol]?.api_mapping?.[api] || positions[symbol]?.ticker || symbol;
        const r = await fetchNews(mapped, config, limit, days, api);
        if (r && !r.error && Array.isArray(r.items)) {
            const enriched = r.items.map(i => ({ ...i, symbol }));
            const filtered = filterBySymbol(enriched, symbol);
            positions[symbol].news = filtered;
            positions[symbol].lastNewsFetch = now;
            updateNewsUI(symbol, filtered);
            const card = document.getElementById('card-news');
            if (card?.classList.contains('active') && currentNewsSymbol === symbol) updateNewsPageList(filtered);
            return filtered;
        }
    } catch (e) {}
    return [];
}

export function startCardNewsAutoRefresh(symbol) {
    if (cardRefreshIntervals[symbol]) clearInterval(cardRefreshIntervals[symbol]);
    cardRefreshIntervals[symbol] = setInterval(() => {
        const card = document.getElementById(`card-${symbol}`);
        const pane = card?.querySelector('[data-pane="news"]');
        if (card?.classList.contains('active') && pane?.classList.contains('active')) fetchCardNews(symbol, true);
    }, 60000);
}

export function stopCardNewsAutoRefresh(symbol) {
    if (cardRefreshIntervals[symbol]) { clearInterval(cardRefreshIntervals[symbol]); delete cardRefreshIntervals[symbol]; }
}

export function updateNewsUI(symbol, items, filter = null) {
    const el = document.getElementById(`news-list-${symbol}`);
    if (!el) return;
    const upd = document.querySelector(`#card-${symbol} .news-last-update`);
    if (upd) upd.textContent = new Date().toLocaleTimeString('fr-FR');
    if (filter === null) { const inp = document.querySelector(`#card-${symbol} .news-search-input`); if (inp) filter = inp.value; }
    el.innerHTML = '';
    let list = items || [];
    if (filter) { const q = filter.toLowerCase(); list = list.filter(i => (i.title || '').toLowerCase().includes(q) || (i.summary || '').toLowerCase().includes(q) || (i.source || '').toLowerCase().includes(q)); }
    if (!list.length) { el.textContent = filter ? 'Aucun résultat.' : 'Aucune actualité récente.'; return; }
    
    list.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

    list.forEach(i => {
        const a = document.createElement('a');
        a.className = 'news-item news-item-link';
        a.href = i.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const t = document.createElement('div');
        t.className = 'news-title';
        t.textContent = i.title || '—';
        a.appendChild(t);

        const m = document.createElement('div');
        m.className = 'news-meta';
        
        const src = document.createElement('span');
        src.className = 'news-source';
        src.textContent = i.source || 'Source';
        m.appendChild(src);
        
        m.appendChild(document.createTextNode(` • ${new Date(i.publishedAt || new Date()).toLocaleString('fr-FR')}`));

        const uniqueTags = new Set();
        if (i.symbol) uniqueTags.add(positions[i.symbol]?.ticker || i.symbol);
        if (i.symbols) i.symbols.forEach(s => uniqueTags.add(positions[s]?.ticker || s));
        if (i.relatedTickers) i.relatedTickers.forEach(s => uniqueTags.add(positions[s]?.ticker || s));

        if (uniqueTags.size > 0) {
            Array.from(uniqueTags).slice(0, 4).forEach(label => {
                const tag = document.createElement('span');
                tag.className = 'news-ticker-tag';
                tag.textContent = label;
                m.appendChild(tag);
            });
        }

        a.appendChild(m);

        if (i.summary) { 
            const s = document.createElement('div'); 
            s.className = 'news-summary'; 
            s.textContent = i.summary; 
            a.appendChild(s); 
        }

        el.appendChild(a);
    });
}

export function setupNewsSearch(symbol) {
    const inp = document.querySelector(`#card-${symbol} .news-search-input`);
    if (!inp) return;
    const clone = inp.cloneNode(true);
    inp.parentNode.replaceChild(clone, inp);
    clone.addEventListener('input', e => updateNewsUI(symbol, positions[symbol]?.news || [], e.target.value));
}

export function updateNewsFeedList(items) {
    const el = document.getElementById('news-feed-list');
    if (!el) return;
    el.innerHTML = '';
    if (!items?.length) { el.textContent = 'Aucune actualité récente.'; return; }
    items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    items.forEach(i => {
        const d = document.createElement('div');
        d.className = 'news-item';
        const t = document.createElement('div');
        t.className = 'news-title';
        const a = document.createElement('a');
        a.href = i.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = i.title || '—';
        t.appendChild(a);
        d.appendChild(t);
        const m = document.createElement('div');
        m.className = 'news-meta';
        m.textContent = `${i.source || ''} • ${new Date(i.publishedAt || new Date()).toLocaleString('fr-FR')}`;
        d.appendChild(m);
        if (i.summary) { const s = document.createElement('div'); s.className = 'news-summary'; s.textContent = i.summary; d.appendChild(s); }
        el.appendChild(d);
    });
}

export async function openNewsOverlay(symbol) {
    const overlay = document.getElementById('news-overlay');
    if (!overlay) return;
    document.querySelectorAll('.card').forEach(x => x.classList.remove('active'));
    overlay.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('open-news-feed')?.classList.add('active');
    try {
        const config = await loadApiConfig();
        const api = window.getSelectedApi?.() || window.selectedApi || config.ui?.defaultApi || 'finnhub';
        const days = symbol && positions[symbol]?.currentPeriod ? periodToDays(positions[symbol].currentPeriod) : 1;
        if (symbol) {
            const mapped = positions[symbol]?.api_mapping?.[api] || positions[symbol]?.ticker || symbol;
            const r = await fetchNews(mapped, config, 50, days, api);
            if (r?.items) { updateNewsFeedList(r.items); updateNewsTrending(r.items); }
        } else {
            let all = [];
            for (const s of Object.keys(positions)) {
                const mapped = positions[s]?.api_mapping?.[api] || positions[s]?.ticker || s;
                try { const r = await fetchNews(mapped, config, 50, days, api); if (r?.items) all = all.concat(r.items.map(i => ({ ...i, symbol: s }))); } catch (e) {}
            }
            all.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
            updateNewsFeedList(all);
            updateNewsTrending(all);
        }
    } catch (e) {}
}

export function closeNewsOverlay() {
    const overlay = document.getElementById('news-overlay');
    if (overlay) overlay.setAttribute('aria-hidden', 'true');
    document.getElementById('open-news-feed')?.classList.remove('active');
}

export function updateNewsTrending(items) {
    const el = document.getElementById('news-page-trending');
    if (!el) return;
    el.innerHTML = '';
    const counts = {};
    if (items?.length) items.forEach(i => { const s = i.symbol || i.ticker; if (s) counts[s] = (counts[s] || 0) + 1; });
    else Object.keys(positions || {}).forEach(k => counts[k] = 0);
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([sym, cnt]) => {
        const pos = positions[sym] || {};
        const t = document.createElement('div');
        t.className = 'trending-item';
        const w = document.createElement('div');
        w.className = 'trending-symbol-wrapper';
        const s = document.createElement('span');
        s.className = 'ticker';
        s.textContent = `(${pos.ticker || sym}) ${pos.name || ''}`;
        w.appendChild(s);
        const c = document.createElement('span');
        c.className = 'ticker-count';
        c.textContent = `${cnt} article${cnt > 1 ? 's' : ''}`;
        w.appendChild(c);
        t.appendChild(w);
        t.addEventListener('click', () => openNewsPage(sym));
        el.appendChild(t);
    });
}

export function updateNewsPageList(items, opts = {}) {
    const { replaceCache = true, skipSort = false } = opts;
    const el = document.getElementById('news-page-feed-list');
    if (!el) return;
    el.innerHTML = '';
    if (!items?.length) { el.innerHTML = '<div class="news-empty">Aucune actualité trouvée</div>'; if (replaceCache) lastPageNews = []; return; }
    let list = items.slice();
    if (!skipSort) list.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    if (replaceCache) lastPageNews = list;
    list.forEach(i => {
        const a = document.createElement('a');
        a.className = 'news-item';
        a.href = i.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const t = document.createElement('div');
        t.className = 'news-title';
        t.textContent = i.title || '—';
        const m = document.createElement('div');
        m.className = 'news-meta';
        const src = document.createElement('span');
        src.className = 'news-source';
        src.textContent = i.source || 'Source';
        m.appendChild(src);
        m.appendChild(document.createTextNode(` • ${new Date(i.publishedAt || new Date()).toLocaleString('fr-FR')}`));
        
        const symbolsToShow = i.symbols || (i.symbol ? [i.symbol] : []);
        if (symbolsToShow.length > 0) {
            // Filter to show only relevant tickers (either in positions or related)
            // We limit to 3 tags to avoid clutter
            const uniqueTags = new Set();
            symbolsToShow.forEach(s => {
                const label = positions[s]?.ticker || s;
                uniqueTags.add(label);
            });
            
            Array.from(uniqueTags).slice(0, 4).forEach(label => {
                const tag = document.createElement('span');
                tag.className = 'news-ticker-tag';
                tag.textContent = label;
                m.appendChild(tag);
            });
        }
        
        a.appendChild(t);
        a.appendChild(m);
        if (i.summary) { const s = document.createElement('div'); s.className = 'news-summary'; s.textContent = i.summary; a.appendChild(s); }
        el.appendChild(a);
    });
    const upd = document.getElementById('news-last-update');
    if (upd) upd.textContent = new Date().toLocaleTimeString('fr-FR');
}

export async function openNewsPage(symbol) {
    const card = document.getElementById('card-news');
    if (!card) return;
    const activeTab = document.querySelector('.tab.active');
    lastActiveSymbol = activeTab?.dataset.symbol || null;
    document.querySelectorAll('.card').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('news-overlay')?.setAttribute('aria-hidden', 'true');
    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('open-news-feed')?.classList.add('active');
    populateSuggestions();
    const inp = document.getElementById('news-ticker-search');
    if (inp) inp.value = '';
    setupNewsFilters();
    await loadNews();
    if (newsRefreshInterval) clearInterval(newsRefreshInterval);
    newsRefreshInterval = setInterval(() => { if (document.getElementById('card-news')?.classList.contains('active')) loadNews(); }, 60000);
}

function populateSuggestions() {
    const el = document.getElementById('ticker-suggestions');
    if (!el) return;
    el.innerHTML = '';
    Object.keys(positions).forEach(sym => {
        const pos = positions[sym];
        const d = document.createElement('div');
        d.className = 'ticker-suggestion-item';
        d.dataset.symbol = sym;
        d.innerHTML = `<span class="ticker-symbol">${pos.ticker || sym}</span>${pos.name || ''}`;
        d.addEventListener('click', () => { const inp = document.getElementById('news-ticker-search'); if (inp) { inp.value = pos.ticker || sym; el.classList.remove('active'); loadNews(); } });
        el.appendChild(d);
    });
}

function setupNewsFilters() {
    const inp = document.getElementById('news-ticker-search');
    const sug = document.getElementById('ticker-suggestions');
    const art = document.getElementById('news-article-search');
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
    if (art) art.oninput = () => { const q = (art.value || '').trim().toLowerCase(); if (!q) updateNewsPageList(lastPageNews, { replaceCache: false, skipSort: true }); else updateNewsPageList(lastPageNews.filter(i => (i.title || '').toLowerCase().includes(q) || (i.summary || '').toLowerCase().includes(q) || (i.source || '').toLowerCase().includes(q)), { replaceCache: false, skipSort: true }); };
}

async function loadNews() {
    const el = document.getElementById('news-page-feed-list');
    const inp = document.getElementById('news-ticker-search');
    if (!el) return;
    el.innerHTML = '<div class="news-loading"><i class="fa-solid fa-spinner fa-spin"></i><span id="news-loading-text">Chargement des actualités...</span></div>';
    try {
        const config = await loadApiConfig();
        const api = window.getSelectedApi?.() || window.selectedApi || config.ui?.defaultApi || 'finnhub';
        const days = periodToDays(currentNewsPeriod);
        let tickers = [];
        const manual = (inp?.value || '').trim().toUpperCase();
        if (manual) { tickers = [{ symbol: manual, ticker: manual }]; currentNewsSymbol = manual; }
        else { tickers = Object.keys(positions).map(s => ({ symbol: s, ticker: positions[s]?.api_mapping?.[api] || positions[s]?.ticker || s })); currentNewsSymbol = null; }
        if (!tickers.length) { el.innerHTML = '<div class="news-empty">Ajoutez des actifs ou recherchez un ticker.</div>'; lastPageNews = []; return; }
        let all = [];
        let completed = 0;
        const updateProgress = () => { const t = document.getElementById('news-loading-text'); if (t) t.textContent = `Chargement... ${completed}/${tickers.length}`; };
        if (tickers.length > 1) updateProgress();

        const uniqueItems = new Map();

        for (const t of tickers) {
            try {
                const r = await fetchNews(t.ticker, config, 30, days, api);
                if (r?.items) {
                    const filtered = filterBySymbol(r.items.map(i => ({ ...i, symbol: t.symbol })), t.symbol);
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
        all.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        updateNewsPageList(all);
    } catch (e) { el.innerHTML = '<div class="news-empty">Erreur de chargement</div>'; }
}

export function closeNewsPage() {
    const card = document.getElementById('card-news');
    if (!card) return;
    card.classList.remove('active');
    card.setAttribute('aria-hidden', 'true');
    currentNewsSymbol = null;
    if (newsRefreshInterval) { clearInterval(newsRefreshInterval); newsRefreshInterval = null; }
    document.getElementById('open-news-feed')?.classList.remove('active');
    if (lastActiveSymbol) {
        document.querySelector(`.tab[data-symbol="${lastActiveSymbol}"]`)?.classList.add('active');
        document.getElementById(`card-${lastActiveSymbol}`)?.classList.add('active');
        lastActiveSymbol = null;
    }
}

function buildTickers(symbol) {
    if (!symbol) return [];
    const pos = positions[symbol];
    const set = new Set();
    const add = v => { if (typeof v === 'string' && v.trim()) { const n = v.trim().toUpperCase(); set.add(n); const d = n.lastIndexOf('.'); if (d > 0) set.add(n.substring(0, d)); } };
    add(symbol);
    if (pos) { add(pos.ticker); if (pos.api_mapping) Object.values(pos.api_mapping).forEach(add); }
    return [...set];
}

function filterBySymbol(items, symbol) {
    if (!symbol || !items?.length) return items || [];
    const tickers = buildTickers(symbol);
    if (!tickers.length) return items;
    return items.filter(i => { if (i.relatedTickers?.length) { const rel = i.relatedTickers.map(t => t.toUpperCase()); return tickers.some(t => rel.includes(t)); } return i.symbol === symbol; });
}