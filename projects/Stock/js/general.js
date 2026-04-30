import { fetchFromYahoo } from './yahoo-finance.js'
import { getProxyBaseUrl, setProxyBaseUrl, pingProxy, DEFAULT_WORKER_URL } from './proxy-fetch.js'
import { setPositions as setNewsPositions, setupNewsSearch, startCardNewsAutoRefresh, stopCardNewsAutoRefresh, openNewsPage, closeNewsPage, fetchCardNews } from './news.js'
import './terminal.js'

import { DEAD_ERROR_CODES, periodToDays } from './constants.js'
import { positions, setPositions, selectedApi, setSelectedApi, lastApiBySymbol, globalPeriod, setGlobalPeriod, mainFetchController, setMainFetchController, fastPollTimer, setFastPollTimer, globalRefreshTimer, setGlobalRefreshTimer, getUserSettings, saveUserSettings } from './state.js'
import { updatePortfolioSummary, loadStocks, batchPerformanceFetch, isBatchFetching } from './portfolio.js'
import { updateUI, clearPeriodDisplay, getActiveSymbol, openTerminalCard, closeTerminalCard, openCustomSymbol, markTabAsSuspended, unmarkTabAsSuspended, updateSidebarPerformance, initMobileSidebar, setBottomNavActive } from './ui.js'

// Re-export for other modules
export { fetchActiveSymbol };

// Global helper
function terminalLogGlobal(msg) {
    try {
        const out = document.getElementById('terminal-output');
        if (!out) return;
        const el = document.createElement('div');
        el.className = 'terminal-log';
        el.textContent = msg;
        out.appendChild(el);
        out.scrollTop = out.scrollHeight;
    } catch (e) { /* ignore */ }
}

const DEFAULT_PROFILE_NAME = 'Mr. Léo Tosku';
const DEFAULT_PROFILE_PFP = 'img/photo/leot.png';

function applySettingsToUi(settings = getUserSettings()) {
    const profileName = document.getElementById('profile-name');
    const profilePfp = document.getElementById('profile-pfp');
    const name = (settings.name || '').trim() || DEFAULT_PROFILE_NAME;
    const pfp = (settings.pfp || '').trim() || DEFAULT_PROFILE_PFP;

    if (profileName) profileName.textContent = name;
    if (profilePfp) {
        profilePfp.src = pfp;
        profilePfp.alt = name;
    }
}

function fillSettingsForm(settings = getUserSettings()) {
    const proxyInput = document.getElementById('settings-proxy-url');
    if (proxyInput) proxyInput.value = settings.proxyUrl || DEFAULT_WORKER_URL;

    const perfViewer = document.getElementById('settings-performance-viewer');
    if (perfViewer) perfViewer.checked = !!settings.performanceViewerEnabled;
}

function setSettingsStatus(msg, type = '') {
    const el = document.getElementById('settings-proxy-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'settings-proxy-status ' + type;
}

function rebuildTransactionHistoryRows() {
    const rowTemplate = document.getElementById('transaction-row-template');
    const currency = getUserSettings().currency || '€';

    Object.values(positions).forEach((pos) => {
        const card = document.getElementById(`card-${pos.symbol}`);
        const tbody = card?.querySelector('.history-body');
        if (!tbody) return;

        const transactions = [];
        (pos.purchases || []).forEach((p) => transactions.push({ date: p.date, amount: p.amount, shares: p.shares, type: 'Buy' }));
        ((pos.raw && pos.raw.sales) || []).forEach((s) => transactions.push({ date: s.date, amount: s.amount, shares: s.shares, type: 'Sell' }));
        if (!transactions.length) return;

        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        tbody.innerHTML = '';

        transactions.forEach((t) => {
            const row = rowTemplate ? rowTemplate.content.firstElementChild.cloneNode(true) : document.createElement('tr');
            row.classList.add(t.type === 'Buy' ? 'transaction-buy' : 'transaction-sell');
            const dateEl = row.querySelector('.trans-date');
            const typeEl = row.querySelector('.trans-type');
            const amountEl = row.querySelector('.trans-amount');
            const sharesEl = row.querySelector('.trans-shares');
            const priceEl = row.querySelector('.trans-price');

            if (dateEl) dateEl.textContent = new Date(t.date).toLocaleDateString('en-US');
            if (typeEl) typeEl.textContent = t.type;
            if (amountEl) amountEl.textContent = `${Math.abs(t.amount || 0).toFixed(2)} ${currency}`;
            if (sharesEl) sharesEl.textContent = t.shares || 0;
            if (priceEl) {
                const shares = Number(t.shares || 0);
                const unit = shares > 0 ? Math.abs(t.amount || 0) / shares : 0;
                priceEl.textContent = `${unit.toFixed(2)} ${currency}`;
            }

            tbody.appendChild(row);
        });
    });
}

function refreshUiAfterSettingsSave() {
    updatePortfolioSummary();
    syncDashboardData();

    Object.keys(positions).forEach(symbol => {
        updateSidebarPerformance(symbol);
        if (positions[symbol].lastData) {
            updateUI(symbol, positions[symbol].lastData);
        }
    });

    rebuildTransactionHistoryRows();

    const explorerCard = document.getElementById('card-explorer');
    if (explorerCard?.classList.contains('active')) {
        try { window.explorerModule?.loadData?.(); } catch (e) { /* ignore */ }
    }
}

function openSettingsCard() {
    const card = document.getElementById('card-settings');
    if (!card) return;

    document.querySelectorAll('.card').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    try { document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active')); } catch (e) { }

    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    document.getElementById('open-settings-btn')?.classList.add('active');

    fillSettingsForm();
    setSettingsStatus('');
}


async function saveSettingsFromForm() {
    const current = getUserSettings();
    const proxyInput = document.getElementById('settings-proxy-url');
    const perfViewer = document.getElementById('settings-performance-viewer');

    const name = current.name || DEFAULT_PROFILE_NAME;
    const pfp = current.pfp || DEFAULT_PROFILE_PFP;
    const currency = current.currency || '€';
    const nextProxy = (proxyInput?.value || '').trim() || DEFAULT_WORKER_URL;
    const performanceViewerEnabled = !!perfViewer?.checked;

    let proxyUrl = current.proxyUrl || DEFAULT_WORKER_URL;
    if (nextProxy !== proxyUrl) {
        setSettingsStatus('Validating proxy...', 'loading');
        const ok = await pingProxy(nextProxy);
        if (ok) {
            proxyUrl = nextProxy;
            setProxyBaseUrl(proxyUrl);
        } else {
            setSettingsStatus('Invalid proxy, previous URL kept.', 'error');
        }
    }

    const settings = { name, pfp, currency, proxyUrl, performanceViewerEnabled };
    saveUserSettings(settings);
    applySettingsToUi(settings);
    fillSettingsForm(settings);
    refreshUiAfterSettingsSave();

    setSettingsStatus('Settings saved.', 'success');

    startGlobalRefreshLoop();
    startPriceUpdateLoop();
}

function startFastPolling() {
    startGlobalRefreshLoop();
}

function stopFastPolling() {
    if (globalRefreshTimer) {
        clearInterval(globalRefreshTimer);
        setGlobalRefreshTimer(null);
    }
}

function startGlobalRefreshLoop() {
    if (globalRefreshTimer) return;

    // Initial sync
    syncDashboardData();

    // Unified sync loop (5min)
    setGlobalRefreshTimer(setInterval(() => {
        if (document.hidden) return;
        syncDashboardData();
    }, 300000));
}

async function syncDashboardData() {
    const p = globalPeriod || '1D';
    await batchPriceFetch();
    await batchPerformanceFetch(p);
}

// Deprecated: logic moved to syncDashboardData
function startPriceUpdateLoop() { }

async function batchPriceFetch() {
    if (isBatchFetching) return;
    const tickers = Object.values(positions).map(p => p.ticker).filter(Boolean);
    if (!tickers.length) return;

    try {
        const { fetchYahooQuotesBatch } = await import('./yahoo-finance.js');
        const quotes = await fetchYahooQuotesBatch(tickers);
        if (!quotes) return;

        const activeSymbol = getActiveSymbol();
        const returnedTickers = new Set(quotes.map(q => (q.symbol || '').toUpperCase()).filter(Boolean));

        for (const q of quotes) {
            const ticker = q.symbol;
            for (const pos of Object.values(positions)) {
                if (pos.ticker !== ticker) continue;

                if (pos.suspended) unmarkTabAsSuspended(pos.symbol);

                const prevPrice = pos.lastData?.price || 0;
                const newPrice = q.regularMarketPrice || prevPrice;
                const hasDetailed = pos.lastData?.timestamps?.length > 0;

                if (hasDetailed) {
                    // Refresh only the latest price; keep period-scoped change/changePercent.
                    pos.lastData.price = newPrice;
                } else {
                    pos.lastData = {
                        ...(pos.lastData || {}),
                        price: newPrice,
                        change: q.regularMarketChange || 0,
                        changePercent: q.regularMarketChangePercent || 0,
                        source: 'yahoo-bulk'
                    };
                }

                updateSidebarPerformance(pos.symbol);

                if (pos.symbol === activeSymbol) {
                    updateUI(pos.symbol, pos.lastData);
                }
            }
        }

        // Yahoo a répondu mais a omis certains tickers → ils sont morts/délistés.
        if (quotes.length > 0) {
            for (const pos of Object.values(positions)) {
                if (!pos.ticker) continue;
                if (returnedTickers.has(pos.ticker.toUpperCase())) continue;
                if (!pos.suspended) markTabAsSuspended(pos.symbol);
            }
        }
    } catch (e) {
        console.error('[Price Batch] Error:', e);
    }
}

// True si un fetch est actuellement en vol. mainFetchController est remis à null
// dans le `finally` de fetchActiveSymbol quand le fetch courant termine normalement.
function isFetchInFlight() {
    return mainFetchController !== null && !mainFetchController.signal.aborted;
}



function setPeriodButtonsFetching(symbol, fetching) {
    const group = document.getElementById(`periods-${symbol}`);
    if (!group) return;
    group.classList.toggle('fetching', !!fetching);
}

async function fetchActiveSymbol(force) {
    const symbol = getActiveSymbol();
    if (!symbol || !positions[symbol]) return;

    // Fast-poll non-forcé : on n'interrompt pas un fetch utilisateur en vol.
    if (!force && isFetchInFlight()) return;

    if (mainFetchController) mainFetchController.abort();
    const controller = new AbortController();
    setMainFetchController(controller);
    const signal = controller.signal;

    setPeriodButtonsFetching(symbol, true);

    // News en tâche de fond — ne pas bloquer
    const newsPromise = (async () => {
        try {
            const period = positions[symbol].currentPeriod || '1D';
            const days = periodToDays(period);
            const apiToUse = window.getSelectedApi?.() || window.selectedApi;
            await fetchCardNews(symbol, false, 50, days, apiToUse);
        } catch { /* ignore */ }
    })();

    let d;
    try {
        const period = positions[symbol].currentPeriod || '1D';
        const name = positions[symbol].name || null;
        d = await fetchFromYahoo(positions[symbol].ticker, period, symbol, positions[symbol], name, signal, "");

        // Si un fetch plus récent a pris le relais pendant qu'on attendait, on jette.
        if (signal.aborted) return;

        positions[symbol].lastFetch = Date.now();
        positions[symbol].lastData = d;
        if (d?.interval) positions[symbol].currentInterval = d.interval;

        updatePortfolioSummary();

        if (d && d.error && DEAD_ERROR_CODES.includes(d.errorCode)) {
            markTabAsSuspended(symbol);
        } else if (d && !d.error) {
            unmarkTabAsSuspended(symbol);
        }

        updateUI(symbol, d);
        if (d?.source) lastApiBySymbol[symbol] = d.source;




        if (d && !d.error && !d.throttled) {
            startFastPolling();
            startGlobalRefreshLoop();
        }

    } catch (e) {
        if (e.name === 'AbortError') return;

    } finally {
        // Ne cache le spinner QUE si on est toujours le fetch courant.
        // Et dans ce cas, on libère mainFetchController pour que isFetchInFlight() soit false.
        if (!signal.aborted) {
            setPeriodButtonsFetching(symbol, false);
            setMainFetchController(null);
        }
    }
}

// Event Listeners
document.addEventListener('click', async e => {
    const t = e.target.closest('.tab')
    if (t) {
        if (mainFetchController) mainFetchController.abort()
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'))
        try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch (e) { }
        document.querySelectorAll('.card').forEach(x => x.classList.remove('active'))
        t.classList.add('active')
        const sym = t.dataset.symbol
        const cd = document.getElementById(`card-${sym}`)
        if (cd) {
            cd.classList.add('active')
            try { if (cd.id !== 'card-terminal' && typeof closeTerminalCard === 'function') closeTerminalCard(); } catch (e) { }
        }

        fetchActiveSymbol(true)
        batchPerformanceFetch(globalPeriod)
    }
})

document.addEventListener('click', e => {
    const btn = e.target.closest('.card-tab-btn');
    if (!btn) return;
    const card = btn.closest('.card');
    if (!card) return;
    card.querySelectorAll('.card-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const targetPaneId = btn.dataset.target;
    card.querySelectorAll('.card-tab-pane').forEach(p => p.classList.remove('active'));
    const targetPane = card.querySelector(`.card-tab-pane[data-pane="${targetPaneId}"]`);
    if (targetPane) targetPane.classList.add('active');
    const symbol = card.id?.replace('card-', '');
    if (symbol) {
        if (targetPaneId === 'news') {
            startCardNewsAutoRefresh(symbol);
            // Trigger immediate fetch if news is empty or old
            const now = Date.now();
            const pos = positions[symbol];
            if (!pos.news?.length || !pos.lastNewsFetch || (now - pos.lastNewsFetch) > 60000) {
                const days = periodToDays(pos.currentPeriod || globalPeriod);
                const api = window.getSelectedApi?.() || window.selectedApi;
                fetchCardNews(symbol, true, 50, days, api).catch(() => {});
            }
        }
        else stopCardNewsAutoRefresh(symbol);
    }
});

document.getElementById('cards-container')?.addEventListener('click', async e => {
    const b = e.target.closest('.period-btn');
    if (!b) return;
    const p = b.dataset.period;

    // Update global state
    setGlobalPeriod(p);

    // Update every position's period
    Object.keys(positions).forEach(sym => {
        positions[sym].currentPeriod = p;
    });

    // Update all period buttons in the UI for consistency
    document.querySelectorAll('.period-btn').forEach(btn => {
        if (btn.dataset.period === p) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Update active card's labels
    document.querySelectorAll('.performance-period').forEach(label => {
        label.textContent = p;
    });

    fetchActiveSymbol(true);
    batchPerformanceFetch(p);

    // Rafraîchir la vue news si la page news est active.
    const cardNews = document.getElementById('card-news');
    if (cardNews && cardNews.classList.contains('active')) {
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
            try { openNewsPage(activeTab.dataset.symbol); } catch (err) { /* ignore */ }
        }
    }
});


const font = document.createElement('link')
font.id = 'poppins-font'
font.rel = 'stylesheet'
font.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
document.head.appendChild(font)

window.addEventListener('load', async () => {
    const settings = getUserSettings();
    applySettingsToUi(settings);
    fillSettingsForm(settings);

    await loadStocks();
    setNewsPositions(positions);
    const active = getActiveSymbol();
    try {
        document.querySelectorAll('.section-toggle').forEach(btn => {
            const section = btn.closest('.sidebar-section');
            if (!section) return;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const expanded = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                section.classList.toggle('collapsed', expanded);
                const tabsEl = section.querySelector('.tabs');
                if (tabsEl) tabsEl.setAttribute('aria-hidden', expanded ? 'true' : 'false');
                try { localStorage.setItem(`sidebar:${section.id}:collapsed`, expanded ? '1' : '0'); } catch (err) { /* ignore */ }
            });
            const title = section.querySelector('.sidebar-section-title');
            if (title) {
                title.addEventListener('click', (ev) => {
                    if (ev.target.closest('.section-toggle')) return;
                    btn.click();
                });
                title.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        btn.click();
                    }
                });
            }
        });
    } catch (e) { /* ignore */ }

    try {
        // Sections collapsed par défaut si l'utilisateur n'a rien choisi.
        const DEFAULT_COLLAPSED = new Set();
        document.querySelectorAll('.sidebar-section').forEach(section => {
            const key = `sidebar:${section.id}:collapsed`;
            const val = localStorage.getItem(key);
            const shouldCollapse = val === '1' || (val === null && DEFAULT_COLLAPSED.has(section.id));
            if (shouldCollapse) {
                section.classList.add('collapsed');
                const btn = section.querySelector('.section-toggle');
                if (btn) btn.setAttribute('aria-expanded', 'false');
                const tabsEl = section.querySelector('.tabs');
                if (tabsEl) tabsEl.setAttribute('aria-hidden', 'true');
            }
        });
    } catch (err) { /* ignore */ }

    initMobileSidebar();
});

document.getElementById('bottom-nav-terminal')?.addEventListener('click', () => {
    openTerminalCard();
    setBottomNavActive('bottom-nav-terminal');
});
document.getElementById('bottom-nav-news')?.addEventListener('click', () => {
    try { openNewsPage(getActiveSymbol()); } catch (e) { }
    setBottomNavActive('bottom-nav-news');
});
document.getElementById('bottom-nav-explorer')?.addEventListener('click', () => {
    window.explorerModule?.openExplorer();
    setBottomNavActive('bottom-nav-explorer');
});
document.getElementById('bottom-nav-settings')?.addEventListener('click', () => {
    openSettingsCard();
    setBottomNavActive('bottom-nav-settings');
});

document.getElementById('open-terminal-btn')?.addEventListener('click', e => {
    openTerminalCard();
});
document.getElementById('open-news-feed')?.addEventListener('click', async e => {
    const a = getActiveSymbol();
    try { openNewsPage(a); } catch (err) { /* noop */ }
    try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch (e) { }
    try { document.getElementById('open-news-feed')?.classList.add('active'); } catch (e) { }
});
document.getElementById('open-settings-btn')?.addEventListener('click', () => {
    openSettingsCard();
});

document.getElementById('settings-save')?.addEventListener('click', async () => {
    await saveSettingsFromForm();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        try {
            const card = document.getElementById('card-news');
            if (card && card.classList.contains('active')) {
                closeNewsPage();
            }
        } catch (err) { }
    }
});


window.fetchCardNews = fetchCardNews;
window.fetchActiveSymbol = fetchActiveSymbol;
window.getActiveSymbol = getActiveSymbol;
window.openTerminalCard = openTerminalCard;
window.openNewsPage = openNewsPage;
window.closeNewsPage = closeNewsPage;
window.terminalLogGlobal = terminalLogGlobal;
window.positions = positions;
window.closeTerminalCard = closeTerminalCard;
window.openCustomSymbol = openCustomSymbol;
window.markTabAsSuspended = markTabAsSuspended;
window.unmarkTabAsSuspended = unmarkTabAsSuspended;
window.getSelectedApi = () => selectedApi;
window.setSelectedApi = (api) => { setSelectedApi(api); };
window.selectedApi = selectedApi;
window.setupNewsSearch = setupNewsSearch;

window.registerDynamicPosition = function (posData) {
    if (!posData || !posData.symbol) return;
    positions[posData.symbol] = posData;
    setPositions(positions);
    setNewsPositions(positions);
};

// Namespace officiel — les nouveaux modules devraient utiliser window.nemeris.* .
// Les window.* plats au-dessus sont conservés pour rétrocompat (explorer/terminal/news).
window.nemeris = {
    positions,
    fetchCardNews,
    fetchActiveSymbol,
    getActiveSymbol,
    openTerminalCard,
    closeTerminalCard,
    openNewsPage,
    closeNewsPage,
    openCustomSymbol,
    markTabAsSuspended,
    unmarkTabAsSuspended,
    setupNewsSearch,
    getSelectedApi: () => selectedApi,
    setSelectedApi,
    registerDynamicPosition: window.registerDynamicPosition,
    terminalLog: terminalLogGlobal,
    settings: {
        get: getUserSettings,
        save: saveUserSettings,
        open: openSettingsCard
    },
    // Proxy config
    proxy: { getUrl: getProxyBaseUrl, setUrl: setProxyBaseUrl, ping: pingProxy, defaultUrl: DEFAULT_WORKER_URL }
};

// Refresh immédiat au retour dans l'onglet (si polling actif).
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        if (fastPollTimer) fetchActiveSymbol(false);
        if (globalRefreshTimer) batchPerformanceFetch(globalPeriod);
    }
});


