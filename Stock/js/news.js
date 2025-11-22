import { fetchNews } from './api/news.js';
import { loadApiConfig } from './general.js';

// Global positions object (will be passed or accessed)
let positions = {};

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
export function setPositions(pos) {
    positions = pos;
}