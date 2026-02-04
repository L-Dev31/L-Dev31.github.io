import { fetchFromYahoo } from './api/yahoo-finance.js'
import { fetchFromPolygon } from './api/polygon.js'
import { fetchFromTwelveData } from './api/twelve.js'
import { fetchFromMarketstack } from './api/marketstack.js'
import { fetchFromAlphaVantage } from './api/alphavantage.js'
import { fetchFromFinnhub } from './api/finnhub.js'
import rateLimiter from './rate-limiter.js'
import { fetchNews } from './api/news.js'
import { setPositions as setNewsPositions, setupNewsSearch, startCardNewsAutoRefresh, stopCardNewsAutoRefresh, openNewsOverlay, closeNewsOverlay, openNewsPage, closeNewsPage, fetchCardNews } from './news.js'
import { initChart, updateChart } from './chart.js'
import { updateSignal } from './signal-bot.js'
import { initTerminal, processCommand } from './terminal.js'

import { filterNullDataPoints, filterNullOHLCDataPoints, isMarketOpen, periodToDays } from './utils.js'
import { API_CONFIG, loadApiConfig, positions, setPositions, selectedApi, setSelectedApi, lastApiBySymbol, mainFetchController, setMainFetchController, initialFetchController, setInitialFetchController, fastPollTimer, setFastPollTimer, rateLimitCountdownTimer, setRateLimitCountdownTimer, fetchUsdToEurRate } from './state.js'
import { calculateStockValues, updatePortfolioSummary, loadStocks, checkSuspendedTickers } from './portfolio.js'
import { createTab, createCard, updateUI, resetSymbolDisplay, updateTabTitle, updateCardTitle, updateSectionDates, clearPeriodDisplay, setApiStatus, updateApiCountdown, updateDropdownSelection, getActiveSymbol, openTerminalCard, closeTerminalCard, openCustomSymbol, markTabAsSuspended, unmarkTabAsSuspended } from './ui.js'

// Re-export for other modules
export { loadApiConfig, fetchActiveSymbol };

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

async function selectApiFetch(apiName, position) {
  switch(apiName) {
    case 'yahoo': return { fetchFunc: fetchFromYahoo, apiName: 'yahoo' };
    case 'massive': return { fetchFunc: fetchFromPolygon, apiName: 'massive' };
    case 'twelvedata': return { fetchFunc: fetchFromTwelveData, apiName: 'twelvedata' };
    case 'marketstack': return { fetchFunc: fetchFromMarketstack, apiName: 'marketstack' };
    case 'alphavantage': return { fetchFunc: fetchFromAlphaVantage, apiName: 'alphavantage' };
    case 'finnhub': return { fetchFunc: fetchFromFinnhub, apiName: 'finnhub' };
    default: return { fetchFunc: fetchFromYahoo, apiName: 'yahoo' };
  }
}

function startFastPolling() {
    if (fastPollTimer) return
    setFastPollTimer(setInterval(() => fetchActiveSymbol(false), 10000));
}

function stopFastPolling() {
    if (!fastPollTimer) return
    clearInterval(fastPollTimer)
    setFastPollTimer(null)
}

function startRateLimitCountdown(seconds) {
    setApiStatus(null, 'fetching', { api: selectedApi, loadingFallback: true });
    setTimeout(() => {
        updateApiCountdown(seconds);
        setRateLimitCountdownTimer(setInterval(() => {
            const el = document.getElementById('api-status-indicator');
            if (el) {
                const countdownText = el.querySelector('.countdown-text');
                if (countdownText) {
                    let t = countdownText.textContent.match(/\((\d+)s\)/);
                    let s = t ? parseInt(t[1],10) : seconds;
                    if (s > 1) {
                        updateApiCountdown(s-1);
                    } else {
                        updateApiCountdown(0);
                        clearInterval(rateLimitCountdownTimer);
                        setRateLimitCountdownTimer(null);
                    }
                }
            }
        }, 1000));
    }, 10);
}

function stopRateLimitCountdown() {
    if (rateLimitCountdownTimer) {
        clearInterval(rateLimitCountdownTimer);
        setRateLimitCountdownTimer(null);
    }
}

function startGlobalRateLimitCountdown() {
    if (rateLimitCountdownTimer) clearInterval(rateLimitCountdownTimer);
    setApiStatus(null, 'fetching', { api: selectedApi, loadingFallback: true, rateLimited: true });
    setRateLimitCountdownTimer(setInterval(() => {
        const remaining = rateLimiter.getRemainingSeconds(selectedApi);
        if (remaining > 0) {
            updateApiCountdown(remaining);
        } else {
            clearInterval(rateLimitCountdownTimer);
            setRateLimitCountdownTimer(null);
            setApiStatus(null, 'active', { api: selectedApi });
        }
    }, 1000));
}

function stopGlobalRateLimitCountdown() {
    if (rateLimitCountdownTimer) {
        clearInterval(rateLimitCountdownTimer);
        setRateLimitCountdownTimer(null);
    }
}

async function fetchActiveSymbol(force) {
    const symbol = getActiveSymbol()
    if (!symbol || !positions[symbol]) return
    if (positions[symbol].isFetching) return

    if (mainFetchController) mainFetchController.abort()
    setMainFetchController(new AbortController());
    const signal = mainFetchController.signal

    positions[symbol].isFetching=true
    setApiStatus(symbol, 'fetching', { api: selectedApi, loadingFallback: true })

    try {
        const p = positions[symbol].currentPeriod||'1D'
        const name = positions[symbol].name||null
        
        let { fetchFunc, apiName } = await selectApiFetch(selectedApi, positions[symbol])
        
        const config = await loadApiConfig();
        const apiConfig = config.apis[apiName];
        
        if (!apiConfig || !apiConfig.enabled) {
            positions[symbol].isFetching=false
            return { source: apiName, error: true, errorCode: 503, errorMessage: "API désactivée" };
        }
        
        let d = await fetchFunc(positions[symbol].ticker, p, symbol, positions[symbol], name, signal, apiConfig.apiKey)
        
        positions[symbol].lastFetch=Date.now()
        positions[symbol].lastData=d
        updateUI(symbol,d)
        lastApiBySymbol[symbol]=d.source
        
        if (d && d.error && d.source) {
            setApiStatus(symbol, 'noinfo', { api: d.source, errorCode: d.errorCode });
        } else {
            setApiStatus(symbol, d ? 'active' : 'inactive', { api: apiName });
        }
        
        updatePortfolioSummary()
        
        if (d && !d.error && !d.throttled) {
            startFastPolling();
        }
        try {
            const p = positions[symbol].currentPeriod || '1D';
            const days = periodToDays(p);
            const apiToUse = (window.getSelectedApi && typeof window.getSelectedApi === 'function') ? window.getSelectedApi() : window.selectedApi;
            fetchCardNews(symbol, false, 50, days, apiToUse).catch(e=>{});
        } catch(e) { /* ignore */ }
    } catch(e){
        setApiStatus(symbol, 'inactive', { api: selectedApi });
    }
    positions[symbol].isFetching=false
}

// Event Listeners
document.addEventListener('click', async e=>{
    const t = e.target.closest('.tab')
    if (t) {
        if (initialFetchController) initialFetchController.abort()
        if (mainFetchController) mainFetchController.abort()
        document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'))
        try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
        document.querySelectorAll('.card').forEach(x => x.classList.remove('active'))
        t.classList.add('active')
        const sym=t.dataset.symbol
        const cd=document.getElementById(`card-${sym}`)
        if (cd) {
            cd.classList.add('active')
            try { if (cd.id !== 'card-terminal' && typeof closeTerminalCard === 'function') closeTerminalCard(); } catch (e) {}
        }
        fetchActiveSymbol(true)
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
        if (targetPaneId === 'news') startCardNewsAutoRefresh(symbol);
        else stopCardNewsAutoRefresh(symbol);
    }
});

document.getElementById('cards-container')?.addEventListener('click', async e=>{
    const b=e.target.closest('.period-btn')
    if (!b) return
    const s=b.dataset.symbol
    const p=b.dataset.period
    positions[s].currentPeriod=p
    const g=document.getElementById(`periods-${s}`)
    if (g) g.querySelectorAll('.period-btn').forEach(x=>x.classList.remove('active'))
    b.classList.add('active')
    const card = document.getElementById(`card-${s}`)
    const periodLabel = card?.querySelector('.performance-period')
    if (periodLabel) periodLabel.textContent = p
    const name=positions[s].name||null
    
    let { fetchFunc, apiName } = await selectApiFetch(selectedApi, positions[s])
    
    const config = await loadApiConfig();
    const apiConfig = config.apis[apiName];
    
    if (!apiConfig || !apiConfig.enabled) {
        return { source: apiName, error: true, errorCode: 503, errorMessage: "API désactivée" };
    }
    
    let d = await fetchFunc(positions[s].ticker, p, s, positions[s], name, null, apiConfig.apiKey)
    
    positions[s].lastFetch=Date.now()
    positions[s].lastData=d
    updateUI(s,d)
    setApiStatus(s, d ? 'active' : 'inactive', { api: apiName });
    
    updatePortfolioSummary()
    try {
        const apiToUse = (window.getSelectedApi && typeof window.getSelectedApi === 'function') ? window.getSelectedApi() : window.selectedApi;
        const days = periodToDays(positions[s].currentPeriod || '1D');
        try { fetchCardNews(s, true, 50, days, apiToUse).catch(()=>{}); } catch(e) {}
        const cardNews = document.getElementById('card-news');
        if (cardNews && cardNews.classList.contains('active')) {
            const activeTab = document.querySelector('.tab.active');
            if (activeTab && activeTab.dataset.symbol === s) {
                try { openNewsPage(s); } catch(e) {}
            }
        }
    } catch(e) { /* ignore */ }
})

document.addEventListener('click', e => {
    const el = document.getElementById('api-status-indicator');
    if (!el || !el.contains(e.target)) return;
    if (e.target.classList.contains('api-option')) {
        setSelectedApi(e.target.dataset.api);
        updateDropdownSelection();
        el.classList.remove('dropdown-open');
    } else {
        el.classList.toggle('dropdown-open');
    }
});

const font=document.createElement('link')
font.id='poppins-font'
font.rel='stylesheet'
font.href='https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
document.head.appendChild(font)

window.addEventListener('load', async () => {
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
        document.querySelectorAll('.sidebar-section').forEach(section => {
            const key = `sidebar:${section.id}:collapsed`;
            const val = localStorage.getItem(key);
            if (val === '1') {
                section.classList.add('collapsed');
                const btn = section.querySelector('.section-toggle');
                if (btn) btn.setAttribute('aria-expanded', 'false');
                const tabsEl = section.querySelector('.tabs');
                if (tabsEl) tabsEl.setAttribute('aria-hidden', 'true');
            }
        });
    } catch (err) { /* ignore */ }
});

document.getElementById('open-terminal-btn')?.addEventListener('click', e => {
    openTerminalCard();
});
document.getElementById('open-news-feed')?.addEventListener('click', async e => {
    const a = getActiveSymbol();
    try { openNewsPage(a); } catch (err) { openNewsOverlay(a); }
    try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
    try { document.getElementById('open-news-feed')?.classList.add('active'); } catch(e) {}
});

document.getElementById('close-news-overlay')?.addEventListener('click', e => {
    closeNewsOverlay();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        try {
            const card = document.getElementById('card-news');
            if (card && card.classList.contains('active')) {
                closeNewsPage();
            }
        } catch (err) {}
    }
});

window.startRateLimitCountdown = startRateLimitCountdown;
window.stopRateLimitCountdown = stopRateLimitCountdown;
window.startGlobalRateLimitCountdown = startGlobalRateLimitCountdown;
window.stopGlobalRateLimitCountdown = stopGlobalRateLimitCountdown;

window.fetchCardNews = fetchCardNews;
window.fetchActiveSymbol = fetchActiveSymbol;
window.getActiveSymbol = getActiveSymbol;
window.openTerminalCard = openTerminalCard;
window.openNewsOverlay = openNewsOverlay;
window.openNewsPage = openNewsPage;
window.closeNewsPage = closeNewsPage;
window.closeNewsOverlay = closeNewsOverlay;
window.terminalLogGlobal = terminalLogGlobal;
window.positions = positions;
window.closeTerminalCard = closeTerminalCard;
window.openCustomSymbol = openCustomSymbol;
window.getSelectedApi = () => selectedApi;
window.setSelectedApi = (api) => { setSelectedApi(api); updateDropdownSelection(); };
window.selectedApi = selectedApi;
window.setupNewsSearch = setupNewsSearch;

window.registerDynamicPosition = function(posData) {
    if (!posData || !posData.symbol) return;
    positions[posData.symbol] = posData;
    setPositions(positions);
    setNewsPositions(positions);
};

window.activateStock = function(symbol) {
    if (!symbol || !positions[symbol]) return;
    const chartCanvas = document.getElementById(`chart-${symbol}`);
    if (chartCanvas && !positions[symbol].chart) {
        initChart(symbol, positions);
    }
    setTimeout(() => {
        const card = document.getElementById(`card-${symbol}`);
        if (card && card.classList.contains('active')) {
            fetchActiveSymbol(true);
        }
    }, 100);
};

window.addEventListener('rateLimitStart', (e) => {
    try {
        startGlobalRateLimitCountdown();
    } catch (err) {
        setApiStatus(null, 'fetching', { api: selectedApi, loadingFallback: true, rateLimited: true });
    }
});

window.addEventListener('rateLimitEnd', (e) => {
    try {
        stopGlobalRateLimitCountdown();
    } catch (err) {
    }
});
