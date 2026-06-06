import { fetchFromYahoo } from './yahoo-finance.js'
import { getProxyBaseUrl, setProxyBaseUrl, pingProxy, DEFAULT_WORKER_URL } from './proxy-fetch.js'
import { setPositions as setNewsPositions, setupNewsSearch, startCardNewsAutoRefresh, stopCardNewsAutoRefresh, openNewsPage, closeNewsPage, fetchCardNews } from './news.js'
import './terminal.js'

import { DEAD_ERROR_CODES, periodToDays } from './constants.js'
import { positions, setPositions, selectedApi, setSelectedApi, lastApiBySymbol, globalPeriod, setGlobalPeriod, mainFetchController, setMainFetchController, fastPollTimer, globalRefreshTimer, setGlobalRefreshTimer, getUserSettings, saveUserSettings } from './state.js'
import { updatePortfolioSummary, loadStocks, batchPerformanceFetch, isBatchFetching } from './portfolio.js'
import { updateUI, getActiveSymbol, openTerminalCard, closeTerminalCard, openCustomSymbol, markTabAsSuspended, unmarkTabAsSuspended, updateSidebarPerformance, initMobileSidebar, setBottomNavActive } from './ui.js'
import { getEl } from './utils.js'

export { fetchActiveSymbol };

function terminalLogGlobal(msg) {
    try {
        const out = getEl('terminal-output');
        if (!out) return;
        const el = document.createElement('div');
        el.className = 'terminal-log';
        el.textContent = msg;
        out.appendChild(el);
        out.scrollTop = out.scrollHeight;
    } catch (e) { /* ignore */ }
}

function fillSettingsForm(settings = getUserSettings()) {
    const proxyInput = getEl('settings-proxy-url');
    if (proxyInput) proxyInput.value = settings.proxyUrl || DEFAULT_WORKER_URL;

    const perfViewer = document.getElementById('settings-performance-viewer');
    if (perfViewer) perfViewer.checked = !!settings.performanceViewerEnabled;

    const nameInput = getEl('settings-user-name');
    if (nameInput) nameInput.value = settings.name || '';

    const pfpPreview = getEl('settings-pfp-preview');
    if (pfpPreview) pfpPreview.src = settings.pfp || '';
}

function applyUserSettings(settings = getUserSettings()) {
    const nameEls = [getEl('profile-name'), getEl('mobile-profile-name')];
    nameEls.forEach(el => { if (el) el.textContent = settings.name || 'Nemeris User'; });

    const pfpEls = document.querySelectorAll('.profile-photo, .nav-profile-photo');
    pfpEls.forEach(el => { 
        if (settings.pfp) el.src = settings.pfp;
        else if (el.classList.contains('nav-profile-photo')) {
             // Fallback for small nav pfp if no image
             el.style.display = 'none'; 
        }
    });
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

            if (dateEl) dateEl.textContent = new Date(t.date).toLocaleDateString(undefined);
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

    const explorerCard = getEl('card-explorer');
    if (explorerCard?.classList.contains('active')) {
        try { window.explorerModule?.loadData?.(); } catch (e) { /* ignore */ }
    }
}

function openSettingsCard() {
    const card = getEl('card-settings');
    if (!card) return;

    document.querySelectorAll('.card').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));

    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    getEl('open-settings-btn')?.classList.add('active');

    fillSettingsForm();
    setSettingsStatus('');
}

function openHomeCard() {
    const card = getEl('card-home');
    if (!card) return;

    document.querySelectorAll('.card').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));

    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
}

function openPortfolioCard() {
    const card = getEl('card-portfolio');
    if (!card) return;

    document.querySelectorAll('.card').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));

    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    getEl('open-portfolio-btn')?.classList.add('active');

    if (typeof renderDiversificationPane === 'function') renderDiversificationPane();

    try {
        import('./portfolio.js').then(m => {
            m.initPortfolioAnalytics();
        });
    } catch {}
}

function openProfileCard() {
    const card = document.getElementById('card-profile');
    if (!card) return;

    document.querySelectorAll('.card').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    try { document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active')); } catch (e) { }

    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    
    const totalShares = document.getElementById('total-shares')?.textContent;
    const totalInv = document.getElementById('total-investment')?.textContent;
    const mShares = document.getElementById('mobile-total-shares');
    const mInv = document.getElementById('mobile-total-investment');
    if (mShares && totalShares) mShares.textContent = totalShares;
    if (mInv && totalInv) mInv.textContent = totalInv;
}


function startFastPolling() {
    startGlobalRefreshLoop();
}

function startGlobalRefreshLoop() {
    if (globalRefreshTimer) return;

    syncDashboardData();
    setGlobalRefreshTimer(setInterval(() => {
        if (document.hidden) return;
        syncDashboardData();
    }, 300000));
}

async function syncDashboardData() {
    const p = globalPeriod || '1D';
    if (isBatchFetching) return;
    await batchPerformanceFetch(p);
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
    (async () => {
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

document.addEventListener('click', async e => {
    const t = e.target.closest('.tab')
    if (t) {
        if (mainFetchController) mainFetchController.abort()
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'))
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.card').forEach(x => x.classList.remove('active'))
        t.classList.add('active')
        const sym = t.dataset.symbol
        const cd = getEl(`card-${sym}`)
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
    card.querySelectorAll('.card-tab-btn').forEach(b => {
        b.classList.remove('active');
        if (b.hasAttribute('role')) b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('active');
    if (btn.hasAttribute('role')) btn.setAttribute('aria-selected', 'true');
    const targetPaneId = btn.dataset.target;
    card.querySelectorAll('.card-tab-pane').forEach(p => p.classList.remove('active'));
    const targetPane = card.querySelector(`.card-tab-pane[data-pane="${targetPaneId}"]`);
    if (targetPane) targetPane.classList.add('active');
    const symbol = card.id?.replace('card-', '');
    if (symbol) {
        if (targetPaneId === 'news') {
            startCardNewsAutoRefresh(symbol);
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

document.getElementById('cards-container')?.addEventListener('change', async e => {
    const sel = e.target.closest('.period-select');
    if (!sel) return;
    const p = sel.value;

    setGlobalPeriod(p);
    Object.keys(positions).forEach(sym => {
        positions[sym].currentPeriod = p;
    });
    document.querySelectorAll('.period-select').forEach(dropdown => {
        dropdown.value = p;
    });
    document.querySelectorAll('.performance-period').forEach(label => {
        label.textContent = p;
    });

    fetchActiveSymbol(true);
    batchPerformanceFetch(p);

    const cardNews = document.getElementById('card-news');
    if (cardNews && cardNews.classList.contains('active')) {
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
            try { openNewsPage(activeTab.dataset.symbol); } catch (err) { /* ignore */ }
        }
    }
});


window.addEventListener('load', async () => {
    const settings = getUserSettings();
    fillSettingsForm(settings);
    applyUserSettings(settings);

    await loadStocks();
    setNewsPositions(positions);
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
    initCardA11ySync();
});

function initCardA11ySync() {
    const syncCard = (card) => {
        const active = card.classList.contains('active');
        card.setAttribute('aria-hidden', active ? 'false' : 'true');
        if (active) card.removeAttribute('inert');
        else card.setAttribute('inert', '');
    };

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === 'class') syncCard(m.target);
        }
    });

    const watchCard = (card) => {
        if (card.__a11ySynced) return;
        card.__a11ySynced = true;
        observer.observe(card, { attributes: true, attributeFilter: ['class'] });
        syncCard(card);
    };

    document.querySelectorAll('.card').forEach(watchCard);

    const cardsContainer = getEl('cards-container') || document.body;
    new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType === 1 && node.classList?.contains('card')) watchCard(node);
            }
        }
    }).observe(cardsContainer, { childList: true, subtree: true });
}

getEl('bottom-nav-home')?.addEventListener('click', () => {
    openHomeCard();
    setBottomNavActive('bottom-nav-home');
});

getEl('bottom-nav-terminal')?.addEventListener('click', () => {
    openTerminalCard();
    setBottomNavActive('bottom-nav-terminal');
});
getEl('bottom-nav-news')?.addEventListener('click', () => {
    try { openNewsPage(getActiveSymbol()); } catch (e) { }
    setBottomNavActive('bottom-nav-news');
});
getEl('bottom-nav-explorer')?.addEventListener('click', () => {
    window.explorerModule?.openExplorer();
    setBottomNavActive('bottom-nav-explorer');
});
getEl('bottom-nav-profile')?.addEventListener('click', () => {
    openProfileCard();
    setBottomNavActive('bottom-nav-profile');
});

getEl('open-terminal-btn')?.addEventListener('click', () => {
    openTerminalCard();
});
getEl('open-news-feed')?.addEventListener('click', async () => {
    const a = getActiveSymbol();
    try { openNewsPage(a); } catch (err) { /* noop */ }
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    getEl('open-news-feed')?.classList.add('active');
});
getEl('open-portfolio-btn')?.addEventListener('click', () => {
    openPortfolioCard();
});
getEl('open-portfolio-btn-mobile')?.addEventListener('click', () => {
    openPortfolioCard();
});
getEl('open-settings-btn')?.addEventListener('click', () => {
    openSettingsCard();
});
getEl('open-settings-btn-mobile')?.addEventListener('click', () => {
    openSettingsCard();
});

getEl('settings-save')?.addEventListener('click', async () => {
    const proxyUrl = getEl('settings-proxy-url')?.value;
    const perfEnabled = getEl('settings-performance-viewer')?.checked;
    const name = getEl('settings-user-name')?.value;
    
        const pfpFile = getEl('settings-user-pfp-file')?.files[0];
    let pfpBase64 = getUserSettings().pfp;

    if (pfpFile) {
        try {
            pfpBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(pfpFile);
            });
        } catch (e) { console.error('Error reading pfp file', e); }
    }

    const newSettings = {
        proxyUrl,
        performanceViewerEnabled: perfEnabled,
        name,
        pfp: pfpBase64
    };

    saveUserSettings(newSettings);
    setProxyBaseUrl(proxyUrl);
    applyUserSettings(newSettings);
    
    setSettingsStatus('Settings saved!', 'success');
    setTimeout(() => setSettingsStatus(''), 3000);

    const actionBar = getEl('settings-actions-bar');
    if (actionBar) actionBar.style.display = 'none';

    refreshUiAfterSettingsSave();
});

getEl('settings-user-pfp-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const preview = getEl('settings-pfp-preview');
            if (preview) preview.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
});

['input', 'change'].forEach(evt => {
    getEl('card-settings')?.addEventListener(evt, (e) => {
        const actionBar = getEl('settings-actions-bar');
        if (actionBar && actionBar.style.display === 'none') {
            actionBar.style.display = 'flex';
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        try {
            const card = getEl('card-news');
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
    portfolio: {
        open: openPortfolioCard
    },
    profile: {
        open: openProfileCard
    },
    home: {
        open: openHomeCard
    },
    proxy: { getUrl: getProxyBaseUrl, setUrl: setProxyBaseUrl, ping: pingProxy, defaultUrl: DEFAULT_WORKER_URL }
};

// Refresh immédiat au retour dans l'onglet (si polling actif).
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        if (fastPollTimer) fetchActiveSymbol(false);
        if (globalRefreshTimer) batchPerformanceFetch(globalPeriod);
    }
});


