import { fetchNews } from './api/news.js';
import { loadApiConfig } from './general.js';

// Global positions object (will be passed or accessed)
let positions = {};
let lastPageNews = [];
let currentNewsPeriod = '1D';
let currentNewsSymbol = null;
let lastActiveSymbolBeforeNews = null;
let newsRefreshInterval = null;
let cardNewsRefreshIntervals = {};

// Helper to map period code to days
export function periodToDays(period) {
    switch ((period || '').toUpperCase()) {
        case '1D': return 1;
        case '1W': return 7;
        case '1M': return 30;
        case '3M': return 90;
        case '6M': return 180;
        case '1Y': return 365;
        case '3Y': return 365 * 3;
        case '5Y': return 365 * 5;
        case 'MAX': return 36500;
        default: return 7;
    }
}

// Function to fetch news for a card
export async function fetchCardNews(symbol, force = false, limit = 50, days = 7, apiName = null) {
    if (!positions[symbol]) return;
    const now = Date.now();
    // cache for 10 minutes by default
    if (!force && positions[symbol].lastNewsFetch && (now - positions[symbol].lastNewsFetch) < 10 * 60 * 1000) {
        // Re-render UI to ensure any existing search filter is applied
        updateNewsUI(symbol, positions[symbol].news);
        return positions[symbol].news;
    }
    try {
        const config = await loadApiConfig();
        
        // Determine API and map symbol to provider ticker if available
        const apiToUse = apiName || ((window.getSelectedApi && typeof window.getSelectedApi === 'function') ? window.getSelectedApi() : window.selectedApi) || (config.ui && config.ui.defaultApi) || 'finnhub';
        const mappedSymbol = (positions[symbol] && positions[symbol].api_mapping && positions[symbol].api_mapping[apiToUse]) ? positions[symbol].api_mapping[apiToUse] : (positions[symbol] && positions[symbol].ticker) ? positions[symbol].ticker : symbol;
        const r = await fetchNews(mappedSymbol, config, limit, days, apiToUse);
        if (r && !r.error && Array.isArray(r.items)) {
            const enriched = r.items.map(item => ({
                ...item,
                symbol: symbol
            }));
            const filteredForSymbol = filterItemsBySymbol(enriched, symbol);
            positions[symbol].news = filteredForSymbol;
            positions[symbol].lastNewsFetch = now;
            updateNewsUI(symbol, filteredForSymbol);
            // If the dedicated news page is open (and showing this symbol), update it too
            try {
                const card = document.getElementById('card-news');
                if (card && card.classList.contains('active') && currentNewsSymbol === symbol) {
                    updateNewsPageList(filteredForSymbol);
                }
            } catch(e) {}
            return filteredForSymbol;
        }
    } catch (e) { console.warn('fetchCardNews error:', e.message || e); }
    return [];
}

// Start auto-refresh for a stock card news tab
export function startCardNewsAutoRefresh(symbol) {
    // Clear existing interval for this symbol
    if (cardNewsRefreshIntervals[symbol]) {
        clearInterval(cardNewsRefreshIntervals[symbol]);
    }
    
    // Set up new interval
    cardNewsRefreshIntervals[symbol] = setInterval(() => {
        const card = document.getElementById(`card-${symbol}`);
        const newsPane = card?.querySelector('[data-pane="news"]');
        if (card && card.classList.contains('active') && newsPane && newsPane.classList.contains('active')) {
            fetchCardNews(symbol, true);
        }
    }, 60000); // 60 seconds
}

// Stop auto-refresh for a stock card news tab
export function stopCardNewsAutoRefresh(symbol) {
    if (cardNewsRefreshIntervals[symbol]) {
        clearInterval(cardNewsRefreshIntervals[symbol]);
        delete cardNewsRefreshIntervals[symbol];
    }
}

// Function to update news UI in the card
export function updateNewsUI(symbol, items, filterText = null) {
    const el = document.getElementById(`news-list-${symbol}`);
    if (!el) return;
    
    // Update last update timestamp
    const updateEl = document.querySelector(`#card-${symbol} .news-last-update`);
    if (updateEl) {
        updateEl.textContent = new Date().toLocaleTimeString('fr-FR');
    }
    
    // If filterText is not provided, try to get it from the input
    if (filterText === null) {
        const input = document.querySelector(`#card-${symbol} .news-search-input`);
        if (input) filterText = input.value;
    }

    el.innerHTML = '';
    
    let displayItems = items || [];
    
    if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        displayItems = displayItems.filter(i => 
            (i.title && i.title.toLowerCase().includes(lowerFilter)) ||
            (i.summary && i.summary.toLowerCase().includes(lowerFilter)) ||
            (i.source && i.source.toLowerCase().includes(lowerFilter))
        );
    }

    if (!displayItems || displayItems.length === 0) {
        el.textContent = filterText ? 'Aucun résultat.' : 'Aucune actualité récente.';
        return;
    }
    displayItems.forEach(i => {
        const itemEl = document.createElement('a');
        itemEl.className = 'news-item news-item-link';
        itemEl.href = i.url || '#';
        itemEl.target = '_blank';
        itemEl.rel = 'noopener noreferrer';
        const title = document.createElement('div');
        title.className = 'news-title';
        const titleText = document.createElement('span');
        titleText.className = 'news-title-text';
        titleText.textContent = i.title || '—';
        title.appendChild(titleText);
        itemEl.appendChild(title);
        const meta = document.createElement('div');
        meta.className = 'news-meta';
        const date = new Date(i.publishedAt || new Date());
        meta.textContent = `${i.source || ''} • ${date.toLocaleString('fr-FR')}`;
        itemEl.appendChild(meta);
        el.appendChild(itemEl);
    });
}

export function setupNewsSearch(symbol) {
    const input = document.querySelector(`#card-${symbol} .news-search-input`);
    if (!input) return;
    
    // Remove existing listeners to avoid duplicates if called multiple times (though cloning usually strips them, better safe)
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.addEventListener('input', (e) => {
        const filterText = e.target.value;
        const news = positions[symbol]?.news || [];
        updateNewsUI(symbol, news, filterText);
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
    // Sort aggregated feeds most recent first
    try { items = (Array.isArray(items) ? items.slice() : []).sort((a,b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)); } catch(e) {}
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
        itemEl.appendChild(title);
        const meta = document.createElement('div');
        meta.className = 'news-meta';
        const date = new Date(i.publishedAt || new Date());
        meta.textContent = `${i.source || ''} • ${date.toLocaleString('fr-FR')}`;
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
    try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
    try { document.getElementById('open-news-feed')?.classList.add('active'); } catch(e) {}
    // If a symbol is specified, fetch its news. Else fetch a couple of top symbols' news
    try {
        const config = await loadApiConfig();
        const apiToUse = (window.getSelectedApi && typeof window.getSelectedApi === 'function') ? window.getSelectedApi() : (window.selectedApi || (config.ui && config.ui.defaultApi) || 'finnhub');
        function periodToDays(period) {
            switch ((period||'').toUpperCase()) {
                case '1D': return 1;
                case '1W': return 7;
                case '1M': return 30;
                case '6M': return 180;
                case '1Y': return 365;
                case '3Y': return 365 * 3;
                case '5Y': return 365 * 5;
                case 'MAX': return 36500;
                default: return 7;
            }
        }
            const days = (symbol && positions[symbol] && positions[symbol].currentPeriod) ? periodToDays(positions[symbol].currentPeriod) : periodToDays('1D');
            if (symbol) {
            const mappedSymbol = (positions[symbol] && positions[symbol].api_mapping && positions[symbol].api_mapping[apiToUse]) ? positions[symbol].api_mapping[apiToUse] : (positions[symbol] && positions[symbol].ticker) ? positions[symbol].ticker : symbol;
            const r = await fetchNews(mappedSymbol, config, 50, days, apiToUse);
            if (r && Array.isArray(r.items)) { updateNewsFeedList(r.items); updateNewsTrending(r.items); }
        } else {
            // Aggregated feed: fetch for all positions (from stock JSONs)
            const syms = Object.keys(positions);
            let allItems = [];
            for (const s of syms) {
                const mapped = (positions[s] && positions[s].api_mapping && positions[s].api_mapping[apiToUse]) ? positions[s].api_mapping[apiToUse] : (positions[s] && positions[s].ticker) ? positions[s].ticker : s;
                try {
                    const r = await fetchNews(mapped, config, 50, days, apiToUse);
                    if (r && r.items) {
                        allItems = allItems.concat(r.items.map(it => ({...it, symbol: s}))); 
                    }
                } catch(e) {}
            }
            // Sort by date desc
            allItems.sort((a,b)=> new Date(b.publishedAt) - new Date(a.publishedAt));
            updateNewsFeedList(allItems);
            updateNewsTrending(allItems);
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

// Populate the trending tickers sidebar with a quick view
export function updateNewsTrending(items) {
    const el = document.getElementById('news-page-trending');
    if (!el) return;
    el.innerHTML = '';
    // If items provided (aggregated list), compute counts per ticker in provided period
    let counts = {};
    if (Array.isArray(items) && items.length > 0) {
        items.forEach(it => {
            const s = (it && it.symbol) ? it.symbol : (it && it.ticker) ? it.ticker : null;
            if (!s) return;
            counts[s] = (counts[s] || 0) + 1;
        });
    } else {
        // if no items given, use positions with zero counts
        Object.keys(positions || {}).forEach(k => counts[k] = 0);
    }
    // Convert counts to list and sort descending
    const sorted = Object.keys(counts).map(k=>({symbol:k, count: counts[k]})).sort((a,b)=>b.count - a.count);
    // Keep top 5
    const top = sorted.slice(0,5);
    top.forEach(entry => {
        if (!entry || !entry.symbol) return;
        const symbol = entry.symbol;
        const pos = positions[symbol] || {};
        const ticker = pos.ticker || symbol;
        const name = pos.name || '';
        const t = document.createElement('div');
        t.className = 'trending-item';
        const wrapper = document.createElement('div');
        wrapper.className = 'trending-symbol-wrapper';
        const symbolLine = document.createElement('span');
        symbolLine.className = 'ticker';
        symbolLine.textContent = `(${ticker}) ${name}`;
        wrapper.appendChild(symbolLine);
        const c = document.createElement('span');
        c.className = 'ticker-count';
        c.textContent = `${entry.count} article${entry.count>1?'s':''}`;
        wrapper.appendChild(c);
        t.appendChild(wrapper);
        // clicking trending item should open news for this symbol
        t.addEventListener('click', ()=>{ try { openNewsPage(symbol); } catch(e){} });
        el.appendChild(t);
    })
}

// Update the dedicated news page list
export function updateNewsPageList(items, options = {}) {
    const { replaceCache = true, skipSort = false } = options;
    const el = document.getElementById('news-page-feed-list');
    if (!el) return;
    el.innerHTML = '';
    
    if (!items || items.length === 0) {
        el.innerHTML = '<div class="news-empty">Aucune actualité trouvée</div>';
        if (replaceCache) lastPageNews = [];
        return;
    }
    
    let workingItems = Array.isArray(items) ? items.slice() : [];
    if (!skipSort) {
        try {
            workingItems.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
        } catch (e) {}
    }
    if (replaceCache) lastPageNews = workingItems;
    
    workingItems.forEach(i => {
        const itemEl = document.createElement('a');
        itemEl.className = 'news-item';
        itemEl.href = i.url || '#';
        itemEl.target = '_blank';
        itemEl.rel = 'noopener noreferrer';
        
        const title = document.createElement('div');
        title.className = 'news-title';
        title.textContent = i.title || '—';
        
        const meta = document.createElement('div');
        meta.className = 'news-meta';
        const date = new Date(i.publishedAt || new Date());
        
        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'news-source';
        sourceSpan.textContent = i.source || 'Source';
        meta.appendChild(sourceSpan);
        
        meta.appendChild(document.createTextNode(` • ${date.toLocaleString('fr-FR')}`));
        
        // Ajouter le ticker si disponible
        if (i.symbol) {
            const tickerTag = document.createElement('span');
            tickerTag.className = 'news-ticker-tag';
            const pos = positions[i.symbol];
            tickerTag.textContent = pos?.ticker || i.symbol;
            meta.appendChild(tickerTag);
        }
        
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
    
    // Update timestamp
    const updateEl = document.getElementById('news-last-update');
    if (updateEl) {
        updateEl.textContent = new Date().toLocaleTimeString('fr-FR');
    }
}

function filterNewsItems(items, query, sourceFilter, timeFilter, quickFilterKeyword) {
    if (!items || items.length === 0) return [];
    let q = (query || '').trim().toLowerCase();
    let now = Date.now();
    let threshold = null;
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
        if (threshold && i.publishedAt) {
            const p = new Date(i.publishedAt).getTime();
            if (isNaN(p)) return false;
            if ((now - p) > threshold) return false;
        }
        return true;
    });
}

// Open the dedicated news page
export async function openNewsPage(symbol) {
    const card = document.getElementById('card-news');
    const feedEl = document.getElementById('news-page-feed-list');
    if (!card || !feedEl) return;
    const activeTab = document.querySelector('.tab.active');
    lastActiveSymbolBeforeNews = activeTab?.dataset.symbol || null;

    // Remember current active tab before we deactivate it
    try {
        const activeTab = document.querySelector('.tab.active');
        lastActiveSymbolBeforeNews = activeTab ? activeTab.dataset.symbol : null;
    } catch (e) {
        lastActiveSymbolBeforeNews = null;
    }
    
    // Close other cards / tabs
    try { document.querySelectorAll('.card').forEach(x => x.classList.remove('active')); } catch(e) {}
    try { document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); } catch(e) {}
    try { document.getElementById('news-overlay')?.setAttribute('aria-hidden', 'true'); } catch(e) {}
    
    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    
    // Highlight the news button
    try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
    try { document.getElementById('open-news-feed')?.classList.add('active'); } catch(e) {}
    
    // Populate ticker suggestions from positions
    populateTickerSuggestions();
    
    const tickerSearch = document.getElementById('news-ticker-search');
    
    if (tickerSearch) tickerSearch.value = '';
    
    // Don't set ticker value by default to show all news
    
    // Setup event listeners
    setupNewsFilters();
    
    // Initial load
    await loadNews();
    
    // Setup auto-refresh every 1 minute
    if (newsRefreshInterval) {
        clearInterval(newsRefreshInterval);
    }
    newsRefreshInterval = setInterval(() => {
        const newsCard = document.getElementById('card-news');
        if (newsCard && newsCard.classList.contains('active')) {
            loadNews();
        }
    }, 60000); // 60 seconds
}

// Populate the ticker suggestions dropdown from positions
function populateTickerSuggestions() {
    const suggestionsEl = document.getElementById('ticker-suggestions');
    if (!suggestionsEl) return;
    
    suggestionsEl.innerHTML = '';
    
    Object.keys(positions).forEach(sym => {
        const pos = positions[sym];
        const item = document.createElement('div');
        item.className = 'ticker-suggestion-item';
        item.dataset.symbol = sym;
        item.innerHTML = `<span class="ticker-symbol">${pos.ticker || sym}</span>${pos.name || ''}`;
        item.addEventListener('click', () => {
            const tickerSearch = document.getElementById('news-ticker-search');
            if (tickerSearch) {
                tickerSearch.value = sym;
                suggestionsEl.classList.remove('active');
                loadNews();
            }
        });
        suggestionsEl.appendChild(item);
    });
}

// Setup filter event listeners
function setupNewsFilters() {
    const tickerSearch = document.getElementById('news-ticker-search');
    const articleSearch = document.getElementById('news-article-search');
    const suggestionsEl = document.getElementById('ticker-suggestions');
    
    if (tickerSearch && suggestionsEl) {
        tickerSearch.addEventListener('focus', () => {
            suggestionsEl.classList.add('active');
        });
        
        tickerSearch.addEventListener('blur', (e) => {
            // Delay to allow click on suggestion
            setTimeout(() => {
                suggestionsEl.classList.remove('active');
            }, 150);
        });
        
        tickerSearch.addEventListener('input', (e) => {
            const val = (e.target.value || '').trim().toUpperCase();
            // Filter suggestions
            const items = suggestionsEl.querySelectorAll('.ticker-suggestion-item');
            items.forEach(item => {
                const sym = item.dataset.symbol.toUpperCase();
                const text = item.textContent.toUpperCase();
                if (!val || sym.includes(val) || text.includes(val)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
            suggestionsEl.classList.add('active');
            
            if (!val) {
                loadNews();
            }
        });
        
        tickerSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                tickerSearch.value = (tickerSearch.value || '').trim().toUpperCase();
                suggestionsEl.classList.remove('active');
                loadNews();
            }
        });
    }
    
    if (articleSearch) {
        articleSearch.oninput = () => {
            const q = (articleSearch.value || '').trim().toLowerCase();
            if (!q) {
                updateNewsPageList(lastPageNews, { replaceCache: false, skipSort: true });
                return;
            }
            const filtered = lastPageNews.filter(i => 
                (i.title && i.title.toLowerCase().includes(q)) ||
                (i.summary && i.summary.toLowerCase().includes(q)) ||
                (i.source && i.source.toLowerCase().includes(q))
            );
            updateNewsPageList(filtered, { replaceCache: false, skipSort: true });
        };
    }
}

// Load news based on current filters
async function loadNews() {
    const feedEl = document.getElementById('news-page-feed-list');
    const tickerSearch = document.getElementById('news-ticker-search');
    
    if (!feedEl) return;
    
    // Show loading
    feedEl.innerHTML = '<div class="news-loading">Chargement des actualités</div>';
    
    try {
        const config = await loadApiConfig();
        const apiToUse = (window.getSelectedApi && typeof window.getSelectedApi === 'function') ? window.getSelectedApi() : (window.selectedApi || (config.ui && config.ui.defaultApi) || 'finnhub');
        const days = periodToDays(currentNewsPeriod);
        
        // Determine which ticker(s) to fetch
        let tickersToFetch = [];
        const manualTicker = (tickerSearch?.value || '').trim().toUpperCase();
        
        if (manualTicker) {
            tickersToFetch = [{ symbol: manualTicker, ticker: manualTicker }];
            currentNewsSymbol = manualTicker;
        } else {
            tickersToFetch = Object.keys(positions).map(sym => {
                const pos = positions[sym];
                const mapped = pos?.api_mapping?.[apiToUse] || pos?.ticker || sym;
                return { symbol: sym, ticker: mapped };
            }).filter(Boolean);
            currentNewsSymbol = null;
        }

        if (!tickersToFetch.length) {
            feedEl.innerHTML = '<div class="news-empty">Ajoutez des actifs au portefeuille ou recherchez un ticker pour afficher les actualités.</div>';
            lastPageNews = [];
            return;
        }
        
        // Fetch news
        let allItems = [];
        for (const t of tickersToFetch) {
            try {
                const r = await fetchNews(t.ticker, config, 30, days, apiToUse);
                if (r && Array.isArray(r.items)) {
                    const enriched = r.items.map(it => ({ ...it, symbol: t.symbol }));
                    const filtered = filterItemsBySymbol(enriched, t.symbol);
                    allItems = allItems.concat(filtered);
                }
            } catch (e) {
                console.warn('News fetch error for', t.ticker, e);
            }
        }
        
        // Sort and display
        allItems.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        updateNewsPageList(allItems);
        
    } catch (err) {
        console.warn('loadNews error', err);
        feedEl.innerHTML = '<div class="news-empty">Erreur de chargement</div>';
    }
}

export function closeNewsPage() {
    const card = document.getElementById('card-news');
    if (!card) return;
    card.classList.remove('active');
    card.setAttribute('aria-hidden', 'true');
    currentNewsSymbol = null;
    
    // Clear auto-refresh interval
    if (newsRefreshInterval) {
        clearInterval(newsRefreshInterval);
        newsRefreshInterval = null;
    }
    
    try { document.getElementById('open-news-feed')?.classList.remove('active'); } catch(e) {}
    if (lastActiveSymbolBeforeNews) {
        try {
            const tabToRestore = document.querySelector(`.tab[data-symbol="${lastActiveSymbolBeforeNews}"]`);
            const cardToRestore = document.getElementById(`card-${lastActiveSymbolBeforeNews}`);
            if (tabToRestore) tabToRestore.classList.add('active');
            if (cardToRestore) cardToRestore.classList.add('active');
        } catch (e) {}
        lastActiveSymbolBeforeNews = null;
    }
}

function buildSymbolTickers(symbol) {
    if (!symbol) return [];
    const pos = positions && positions[symbol] ? positions[symbol] : null;
    const tickers = new Set();
    const push = (value) => {
        if (typeof value === 'string' && value.trim()) {
            // Normalize: uppercase, remove exchange suffix like .PA
            let normalized = value.trim().toUpperCase();
            tickers.add(normalized);
            // Also add without exchange suffix
            const dotIndex = normalized.lastIndexOf('.');
            if (dotIndex > 0) {
                tickers.add(normalized.substring(0, dotIndex));
            }
        }
    };
    push(symbol);
    if (pos) {
        push(pos.ticker);
        if (pos.api_mapping) {
            Object.values(pos.api_mapping).forEach(push);
        }
    }
    return Array.from(tickers);
}

function filterItemsBySymbol(items, symbol) {
    if (!symbol) return Array.isArray(items) ? items : [];
    const tickers = buildSymbolTickers(symbol);
    if (!Array.isArray(items) || !items.length || !tickers.length) return Array.isArray(items) ? items : [];
    
    const filtered = items.filter(item => {
        // Use relatedTickers from Yahoo API if available
        if (Array.isArray(item.relatedTickers) && item.relatedTickers.length > 0) {
            const relatedUppercase = item.relatedTickers.map(t => t.toUpperCase());
            return tickers.some(ticker => relatedUppercase.includes(ticker));
        }
        // Fallback: no relatedTickers, keep the item if it was fetched for this symbol
        return item.symbol === symbol;
    });
    return filtered;
}

// Supprimé - plus nécessaire avec la nouvelle interface