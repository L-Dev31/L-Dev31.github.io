import { fetchNews } from './api/news.js';
import { loadApiConfig } from './general.js';

// Global positions object (will be passed or accessed)
let positions = {};
let lastPageNews = [];

// Function to fetch news for a card
export async function fetchCardNews(symbol, force = false, limit = 5) {
    if (!positions[symbol]) return;
    const now = Date.now();
    // cache for 10 minutes by default
    if (!force && positions[symbol].lastNewsFetch && (now - positions[symbol].lastNewsFetch) < 10 * 60 * 1000) {
        return positions[symbol].news;
    }
    try {
        const config = await loadApiConfig();
        const r = await fetchNews(symbol, config);
        if (r && !r.error && Array.isArray(r.items)) {
            positions[symbol].news = r.items;
            positions[symbol].lastNewsFetch = now;
            updateNewsUI(symbol, r.items);
            // If the dedicated news page is open (and showing this symbol), update it too
            try { const card = document.getElementById('card-news'); if (card && card.classList.contains('active')) updateNewsPageList(r.items); } catch(e) {}
            return r.items;
        }
    } catch (e) { console.warn('fetchCardNews error:', e.message || e); }
    return [];
}

// Function to update news UI in the card
export function updateNewsUI(symbol, items) {
    const el = document.getElementById(`news-list-${symbol}`);
    if (!el) return;
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.textContent = 'Aucune actualité récente.';
        return;
    }
    items.forEach(i => {
        const itemEl = document.createElement('div');
        itemEl.className = 'news-item';
        const title = document.createElement('div');
        title.className = 'news-title';
        if (i.symbol) {
            const s = document.createElement('span');
            s.className = 'news-symbol-tag';
            s.textContent = i.symbol;
            s.style.marginRight = '8px';
            s.style.fontWeight = '700';
            s.style.color = 'var(--primary-purple)';
            title.appendChild(s);
        }
        const a = document.createElement('a');
        a.href = i.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = i.title || '—';
        title.appendChild(a);
        const meta = document.createElement('div');
        meta.className = 'news-meta';
        const date = new Date(i.publishedAt || new Date());
        meta.textContent = `${i.source || ''} • ${date.toLocaleString('fr-FR')}`;
        itemEl.appendChild(title);
        itemEl.appendChild(meta);
        el.appendChild(itemEl);
    });
}

// Function to update news feed list in the overlay
export function updateNewsFeedList(items) {
    const el = document.getElementById('news-feed-list');
    if (!el) return;
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.textContent = 'Aucune actualité récente.';
        return;
    }
    items.forEach(i => {
        const itemEl = document.createElement('div');
        itemEl.className = 'news-item';
        const title = document.createElement('div');
        title.className = 'news-title';
        if (i.symbol) {
            const s = document.createElement('span');
            s.className = 'news-symbol-tag';
            s.textContent = i.symbol;
            s.style.marginRight = '8px';
            s.style.fontWeight = '700';
            s.style.color = 'var(--primary-purple)';
            title.appendChild(s);
        }
        const a = document.createElement('a');
        a.href = i.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = i.title || '—';
        title.appendChild(a);
        const meta = document.createElement('div');
        meta.className = 'news-meta';
        const date = new Date(i.publishedAt || new Date());
        meta.textContent = `${i.source || ''} • ${date.toLocaleString('fr-FR')}`;
        itemEl.appendChild(title);
        itemEl.appendChild(meta);
        if (i.summary) {
            const summary = document.createElement('div');
            summary.className = 'news-summary';
            summary.textContent = i.summary;
            itemEl.appendChild(summary);
        }
        el.appendChild(itemEl);
    });
}

// Function to open news overlay
export async function openNewsOverlay(symbol) {
    const overlay = document.getElementById('news-overlay');
    const el = document.getElementById('news-feed-list');
    if (!overlay || !el) return;
    // Close any active card including the terminal (terminal must act like a card)
    try { document.querySelectorAll('.card').forEach(x => x.classList.remove('active')); } catch(e) {}
    overlay.setAttribute('aria-hidden', 'false');
    // Highlight the news button like a tab, and clear other tool buttons
    try { document.querySelectorAll('.profile-action-btn.tool-tab').forEach(b => b.classList.remove('active')); } catch(e) {}
    try { document.getElementById('open-news-feed')?.classList.add('active'); } catch(e) {}
    // If a symbol is specified, fetch its news. Else fetch a couple of top symbols' news
    try {
        const config = await loadApiConfig();
        if (symbol) {
            const r = await fetchNews(symbol, config);
            if (r && Array.isArray(r.items)) updateNewsFeedList(r.items);
        } else {
            // Aggregated feed: fetch for first 6 positions
            const syms = Object.keys(positions).slice(0, 6);
            let allItems = [];
            for (const s of syms) {
                try {
                    const r = await fetchNews(s, config);
                    if (r && r.items) {
                        allItems = allItems.concat(r.items.map(it => ({...it, symbol: s}))); 
                    }
                } catch(e) {}
            }
            // Sort by date desc
            allItems.sort((a,b)=> new Date(b.publishedAt) - new Date(a.publishedAt));
            updateNewsFeedList(allItems.slice(0, 20));
        }
    } catch (err) { console.warn('openNewsOverlay err', err); }
}

// Function to close news overlay
export function closeNewsOverlay() {
    const overlay = document.getElementById('news-overlay');
    if (overlay) overlay.setAttribute('aria-hidden', 'true');
    try { document.getElementById('open-news-feed')?.classList.remove('active'); } catch(e) {}
}

// Function to set positions (called from general.js)
            const r = await fetchNews(symbol, config, 50, days, apiToUse);
    positions = pos;
}

// Populate the trending tickers sidebar with a quick view
export function updateNewsTrending(items) {
    const el = document.getElementById('news-page-trending');
    if (!el) return;
    el.innerHTML = '';
    const list = items || Object.keys(positions || {}).slice(0, 8);
    list.slice(0, 8).forEach(i => {
        const t = document.createElement('div');
        t.className = 'trending-item';
        const symbolSpan = document.createElement('span');
        symbolSpan.className = 'ticker';
        symbolSpan.textContent = typeof i === 'string' ? i : (i.symbol || i.ticker || i);
        const count = document.createElement('span');
        count.className = 'ticker-count';
        count.textContent = '—';
        t.appendChild(symbolSpan);
        t.appendChild(count);
        el.appendChild(t);
    });
}

// Update the dedicated news page list
export function updateNewsPageList(items) {
    const el = document.getElementById('news-page-feed-list');
    if (!el) return;
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.textContent = 'Aucune actualité récente.';
        return;
    }
    items.forEach(i => {
        const itemEl = document.createElement('div');
        itemEl.className = 'news-item';
        const title = document.createElement('div');
        title.className = 'news-title';
        const a = document.createElement('a');
        a.href = i.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = i.title || '—';
        title.appendChild(a);
        const meta = document.createElement('div');
        meta.className = 'news-meta';
        const date = new Date(i.publishedAt || new Date());
        meta.textContent = `${i.source || ''} • ${date.toLocaleString('fr-FR')}`;
        itemEl.appendChild(title);
        itemEl.appendChild(meta);
        if (i.summary) {
            const summary = document.createElement('div');
            summary.className = 'news-summary';
            summary.textContent = i.summary;
            itemEl.appendChild(summary);
        }
        el.appendChild(itemEl);
    });
    // keep a copy for client-side filtering and search
    lastPageNews = Array.isArray(items) ? items.slice(0) : [];
    try { const c = document.getElementById('news-page-count'); if (c) c.textContent = `${lastPageNews.length}`; } catch(e) {}
}

function filterNewsItems(items, query, sourceFilter, timeFilter, quickFilterKeyword) {
    if (!items || items.length === 0) return [];
    let q = (query || '').trim().toLowerCase();
    let now = Date.now();
    let threshold = 1000 * 60 * 60 * 24 * 7; // default 7d
    if (timeFilter === '24h') threshold = 1000 * 60 * 60 * 24;
    else if (timeFilter === '72h') threshold = 1000 * 60 * 60 * 24 * 3;
    else if (timeFilter === '30d') threshold = 1000 * 60 * 60 * 24 * 30;
    return items.filter(i => {
        if (!i) return false;
        if (sourceFilter && sourceFilter !== 'all' && (i.source || '').toLowerCase() !== sourceFilter.toLowerCase()) return false;
        if (q) {
            const t = (i.title || '').toLowerCase();
            const s = (i.summary || '').toLowerCase();
            const sy = (i.symbol || '').toLowerCase();
            if (!(t.includes(q) || s.includes(q) || sy.includes(q))) return false;
        }
        if (quickFilterKeyword) {
            const t = (i.title || '').toLowerCase();
            const s = (i.summary || '').toLowerCase();
            if (!(t.includes(quickFilterKeyword.toLowerCase()) || s.includes(quickFilterKeyword.toLowerCase()))) return false;
        }
        if (i.publishedAt) {
            const p = new Date(i.publishedAt).getTime();
            if (isNaN(p)) return false;
            if ((now - p) > threshold) return false;
        }
        return true;
    });
}

// Open the dedicated news page (instead of overlay)
export async function openNewsPage(symbol) {
    const card = document.getElementById('card-news');
    const feedEl = document.getElementById('news-page-feed-list');
    if (!card || !feedEl) return;
    // Close other cards
    try { document.querySelectorAll('.card').forEach(x => x.classList.remove('active')); } catch(e) {}
    // Hide overlay if shown
    try { document.getElementById('news-overlay')?.setAttribute('aria-hidden', 'true'); } catch(e) {}
    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    // Highlight the news button like a tab
    try { document.querySelectorAll('.profile-action-btn.tool-tab').forEach(b => b.classList.remove('active')); } catch(e) {}
    try { document.getElementById('open-news-feed')?.classList.add('active'); } catch(e) {}
    try {
        const config = await loadApiConfig();
        if (symbol) {
            const r = await fetchNews(symbol, config);
            if (r && Array.isArray(r.items)) {
                r.items.forEach(it => { if (!it.symbol) it.symbol = symbol; });
                updateNewsPageList(r.items);
            }
        } else {
            const syms = Object.keys(positions).slice(0, 8);
            let allItems = [];
            for (const s of syms) {
                try {
                    const r = await fetchNews(s, config);
                    if (r && r.items) {
                        allItems = allItems.concat(r.items.map(it => ({ ...it, symbol: s }))); 
                    }
                } catch(e) {}
            }
            allItems.sort((a,b)=> new Date(b.publishedAt) - new Date(a.publishedAt));
            updateNewsPageList(allItems.slice(0, 50));
        }
    } catch(err) { console.warn('openNewsPage err', err); }
    // update trending with top positions as a simple summary
    try { updateNewsTrending(); } catch (e) {}

    // Wire search / filters once
    try {
        const searchInput = document.getElementById('news-page-search-input');
        const searchBtn = document.getElementById('news-page-search-btn');
        const sourceSel = document.getElementById('news-source-filter');
        const timeSel = document.getElementById('news-time-filter');
        const quickButtons = document.querySelectorAll('.quick-filter');
        const applyFilters = () => {
            const q = searchInput?.value || '';
            const src = sourceSel?.value || 'all';
            const time = timeSel?.value || '7d';
            const activeQuick = Array.from(quickButtons || []).find(b => b.classList.contains('active'))?.textContent || null;
            const filtered = filterNewsItems(lastPageNews, q, src, time, activeQuick);
            updateNewsPageList(filtered);
        };
        if (searchBtn) searchBtn.onclick = applyFilters;
        if (searchInput) searchInput.onkeydown = (e)=>{ if (e.key === 'Enter') applyFilters(); };
        if (sourceSel) sourceSel.onchange = applyFilters;
        if (timeSel) timeSel.onchange = applyFilters;
        quickButtons.forEach(b=>{
            b.onclick = (e)=>{
                quickButtons.forEach(x=>x.classList.remove('active'));
                b.classList.add('active');
                applyFilters();
            };
        });
    } catch(e) {}
        // Period button handler: simple re-fetch using selected API and set active class
        const periodsGroup = document.getElementById('news-periods');
        if (periodsGroup) {
            periodsGroup.querySelectorAll('.period-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    const p = btn.dataset.period;
                    // Toggle active class
                    periodsGroup.querySelectorAll('.period-btn').forEach(x=>x.classList.remove('active'));
                    btn.classList.add('active');
                    const daysNum = periodToDays(p);
                    // Re-fetch items (symbol or aggregated)
                    try {
                        const apiToUse = (window.getSelectedApi && typeof window.getSelectedApi === 'function') ? window.getSelectedApi() : window.selectedApi;
                        if (symbol) {
                            const r = await fetchNews(symbol, await loadApiConfig(), 50, daysNum, apiToUse);
                            if (r && Array.isArray(r.items)) updateNewsPageList(r.items);
                        } else {
                            const syms = Object.keys(positions).slice(0, 8);
                            let allItems = [];
                            const config = await loadApiConfig();
                            for (const s of syms) {
                                try { const r = await fetchNews(s, config, 50, daysNum, apiToUse); if (r && r.items) allItems = allItems.concat(r.items.map(it => ({...it, symbol: s}))); } catch(e) {}
                            }
                            allItems.sort((a,b)=> new Date(b.publishedAt) - new Date(a.publishedAt));
                            updateNewsPageList(allItems.slice(0, 50));
                        }
                    } catch(e) { console.warn('news period fetch error', e); }
                };
            });
        }
}

export function closeNewsPage() {
    const card = document.getElementById('card-news');
    if (!card) return;
    card.classList.remove('active');
    card.setAttribute('aria-hidden', 'true');
    try { document.getElementById('open-news-feed')?.classList.remove('active'); } catch(e) {}
}