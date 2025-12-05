import { fetchFromYahoo } from './api/yahoo-finance.js'
import { fetchFromPolygon } from './api/polygon.js'
import { fetchFromTwelveData } from './api/twelve.js'
import { fetchFromMarketstack } from './api/marketstack.js'
import { fetchFromAlphaVantage } from './api/alphavantage.js'
import { fetchFromFinnhub } from './api/finnhub.js'
import rateLimiter from './rate-limiter.js'
import { fetchNews } from './api/news.js'
import { initChart, updateChart } from './chart.js'
import { updateSignal } from './signal-bot.js'
import { fetchCardNews, updateNewsUI, updateNewsFeedList, openNewsOverlay, closeNewsOverlay, setPositions, openNewsPage, closeNewsPage, updateNewsPageList, updateNewsTrending, setupNewsSearch, startCardNewsAutoRefresh, stopCardNewsAutoRefresh } from './news.js'

// Global helper to append to terminal output (can be used by any function)
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

// Fonction utilitaire pour filtrer les points null/undefined/NaN dès la source
export function filterNullDataPoints(timestamps, prices) {
  if (!timestamps || !prices || timestamps.length !== prices.length) {
    return { timestamps: [], prices: [] };
  }

  const validData = timestamps.map((ts, index) => ({
    timestamp: ts,
    price: prices[index]
  })).filter(item =>
    item.timestamp != null &&
    item.price != null &&
    !isNaN(item.price) &&
    !isNaN(item.timestamp)
  );

  return {
    timestamps: validData.map(item => item.timestamp),
    prices: validData.map(item => item.price)
  };
}

// Fonction utilitaire pour filtrer les points null/undefined/NaN pour OHLC
export function filterNullOHLCDataPoints(timestamps, opens, highs, lows, closes) {
  if (!timestamps || !opens || !highs || !lows || !closes || 
      timestamps.length !== opens.length || 
      timestamps.length !== highs.length || 
      timestamps.length !== lows.length || 
      timestamps.length !== closes.length) {
    return { timestamps: [], opens: [], highs: [], lows: [], closes: [] };
  }

  const validData = timestamps.map((ts, index) => ({
    timestamp: ts,
    open: opens[index],
    high: highs[index],
    low: lows[index],
    close: closes[index]
  })).filter(item =>
    item.timestamp != null && !isNaN(item.timestamp) &&
    item.open != null && !isNaN(item.open) &&
    item.high != null && !isNaN(item.high) &&
    item.low != null && !isNaN(item.low) &&
    item.close != null && !isNaN(item.close)
  );

  return {
    timestamps: validData.map(item => item.timestamp),
    opens: validData.map(item => item.open),
    highs: validData.map(item => item.high),
    lows: validData.map(item => item.low),
    closes: validData.map(item => item.close)
  };
}

async function selectApiFetch(apiName, position) {
  switch(apiName) {
    case 'yahoo':
      return { fetchFunc: fetchFromYahoo, apiName: 'yahoo' };
    case 'massive':
      return { fetchFunc: fetchFromPolygon, apiName: 'massive' };
    case 'twelvedata':
      return { fetchFunc: fetchFromTwelveData, apiName: 'twelvedata' };
    case 'marketstack':
      return { fetchFunc: fetchFromMarketstack, apiName: 'marketstack' };
    case 'alphavantage':
      return { fetchFunc: fetchFromAlphaVantage, apiName: 'alphavantage' };
    case 'finnhub':
      return { fetchFunc: fetchFromFinnhub, apiName: 'finnhub' };
    default:
      return { fetchFunc: fetchFromYahoo, apiName: 'yahoo' };
  }
}

let API_CONFIG = null;

export async function loadApiConfig() {
  if (API_CONFIG) return API_CONFIG;

  try {
    const response = await fetch('api.json');
    const config = await response.json();

    const enabledApis = Object.keys(config).filter(api => config[api].enabled);

    API_CONFIG = {
      apis: config,
      ui: {
        defaultApi: 'yahoo',
        validApis: enabledApis
      }
    };
    return API_CONFIG;
  } catch (error) {
    throw error;
  }
}

let usdToEurRate = null;

let positions = {};
let selectedApi = 'yahoo';
function setSelectedApi(api) {
    if (!api) return;
    selectedApi = api;
    try { setApiStatus(null, 'active', { api: selectedApi }); } catch (e) { /* ignore */ }
    try { window.selectedApi = selectedApi; } catch(e) { /* ignore */ }
    // No UI source label — news uses active API internally only
}
let lastApiBySymbol = {};
let mainFetchController = null;
let initialFetchController = null;
let fastPollTimer = null;
let rateLimitCountdownTimer = null;

async function fetchUsdToEurRate() {
    if (usdToEurRate !== null) return usdToEurRate;
    try {
        const config = await loadApiConfig();
        const api = config?.apis?.massive;
        if (!api || !api.enabled || !api.apiKey) return 1;
        const url = `https://api.polygon.io/v2/aggs/ticker/C:EURUSD/range/1/day/2025-11-01/2025-11-10?apiKey=${api.apiKey}`;
        const r = await fetch(url);
        if (r.ok) {
            const j = await r.json();
            if (j && j.results && j.results.length > 0) {
                usdToEurRate = j.results[j.results.length - 1].c;
                console.log(`💱 Taux USD/EUR récupéré: ${usdToEurRate}`);
                return usdToEurRate;
            }
        }
    } catch (err) {
        console.warn('fetchUsdToEurRate error', err);
    }
    return 1;
}

function updateDropdownSelection() {
    const el = document.getElementById('api-status-indicator')
    if (!el) return
    const opts = el.querySelectorAll('.api-option')
    opts.forEach(o => o.classList.remove('active'))
    const active = el.querySelector(`[data-api="${selectedApi}"]`)
    if (active) active.classList.add('active')
}

function startFastPolling() {
    if (fastPollTimer) return
    fastPollTimer = setInterval(() => fetchActiveSymbol(false), 60000)
}

function stopFastPolling() {
    if (!fastPollTimer) return
    clearInterval(fastPollTimer)
    fastPollTimer = null
}

function startRateLimitCountdown(seconds) {
    
    setApiStatus(null, 'fetching', { api: selectedApi, loadingFallback: true });
    
    setTimeout(() => {
        const el = document.getElementById('api-status-indicator');
        if (el) {
            const spinner = el.querySelector('[data-role="spinner"]');
                if (spinner) {
                    if (!spinner.querySelector('.api-spinner')) {
                        const s = document.createElement('span');
                        s.className = 'api-spinner';
                        spinner.appendChild(s);
                    }
            }
        }
        
        // update the countdown text every second
        updateApiCountdown(seconds);
        rateLimitCountdownTimer = setInterval(() => {
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
                        rateLimitCountdownTimer = null;
                    }
                }
            }
        }, 1000);
    }, 10);
}

function stopRateLimitCountdown() {
    if (rateLimitCountdownTimer) {
        clearInterval(rateLimitCountdownTimer);
        rateLimitCountdownTimer = null;
    }
}

function startGlobalRateLimitCountdown() {
    if (rateLimitCountdownTimer) {
        clearInterval(rateLimitCountdownTimer);
    }
    
    setApiStatus(null, 'fetching', { api: selectedApi, loadingFallback: true, rateLimited: true });
    
    rateLimitCountdownTimer = setInterval(() => {
        const el = document.getElementById('api-status-indicator');
        if (el) {
            const spinner = el.querySelector('[data-role="spinner"]');
            if (spinner) {
                // Importer le rate limiter pour obtenir le temps restant
                const remaining = rateLimiter.getRemainingSeconds(selectedApi);
                if (remaining > 0) {
                    updateApiCountdown(remaining);
                } else {
                    if (!spinner.querySelector('.api-spinner')) {
                        const s = document.createElement('span');
                        s.className = 'api-spinner';
                        spinner.appendChild(s);
                    }
                    clearInterval(rateLimitCountdownTimer);
                    rateLimitCountdownTimer = null;
                    setApiStatus(null, 'active', { api: selectedApi });
                }
            }
        }
    }, 1000);
}

function stopGlobalRateLimitCountdown() {
    if (rateLimitCountdownTimer) {
        clearInterval(rateLimitCountdownTimer);
        rateLimitCountdownTimer = null;
    }
}

// Helper to update/create the countdown display under the status text
function updateApiCountdown(seconds) {
    const el = document.getElementById('api-status-indicator');
    if (!el) return;

    // ensure spinner exists
    let spinner = el.querySelector('[data-role="spinner"]');
    if (!spinner) {
        // try to create a spinner area at the end of the indicator
        spinner = document.createElement('div');
        spinner.setAttribute('data-role', 'spinner');
        spinner.classList.add('api-indicator-spinner-row', 'column');
        el.appendChild(spinner);
    }

    // create or find the countdown wrapper placed below the status text
    // prefer using the dedicated spinner row already present in the template
    const spinnerRow = el.querySelector('[data-role="spinner"]');
    if (spinnerRow) {
        spinnerRow.classList.add('column');

        // Clear existing spinner area to avoid duplicates, then create
        // a single horizontal wrapper where the countdown text sits
        // to the left and the spinner to the right.
        spinnerRow.innerHTML = '';
        let wrapper = document.createElement('div');
        wrapper.className = 'api-countdown-wrapper';

        const textElem = document.createElement('div');
        textElem.className = 'countdown-text';
        textElem.textContent = `Limite atteinte, veuillez patienter... (${seconds}s)`;

        const spinnerElem = document.createElement('div');
        spinnerElem.className = 'api-spinner-wrapper';
        if (!spinnerElem.querySelector('.api-spinner')) {
            const s = document.createElement('span');
            s.className = 'api-spinner';
            spinnerElem.appendChild(s);
        }

        // Append text first so spinner appears to the right
        wrapper.appendChild(textElem);
        wrapper.appendChild(spinnerElem);
        spinnerRow.appendChild(wrapper);
        return;
    }

    // fallback: append under the main element if spinner row missing
    let wrapper = el.querySelector('.api-countdown-wrapper');
    if (!wrapper) {
        // Fallback: create a horizontal wrapper under the main element
        wrapper = document.createElement('div');
        wrapper.className = 'api-countdown-wrapper';
        wrapper.classList.add('api-countdown-wrapper');

        const textElem = document.createElement('div');
        textElem.className = 'countdown-text';
        textElem.textContent = `Limite atteinte, veuillez patienter... (${seconds}s)`;

        const spinnerElem = document.createElement('div');
        spinnerElem.className = 'api-spinner-wrapper';
        if (!spinnerElem.querySelector('.api-spinner')) {
            const s = document.createElement('span');
            s.className = 'api-spinner';
            spinnerElem.appendChild(s);
        }

        wrapper.appendChild(textElem);
        wrapper.appendChild(spinnerElem);
        el.appendChild(wrapper);
    } else {
        const countdown = wrapper.querySelector('.countdown-text');
        if (countdown) countdown.textContent = `Limite atteinte, veuillez patienter... (${seconds}s)`;
    }
}

async function setApiStatus(symbol, status, opts = {}) {
    const config = await loadApiConfig();
    // If an error code is provided, always show the 'noinfo' / error state
    // so the UI displays "Err. {code}" instead of flipping to active.
    if (opts && typeof opts.errorCode !== 'undefined' && opts.errorCode !== null) {
        status = 'noinfo';
    }

    let el = document.getElementById('api-status-indicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'api-status-indicator';
        document.body.appendChild(el);
    }
    const template = document.getElementById('api-indicator-template');
    if (!template) return;
    const content = template.content.cloneNode(true);
    const dot = content.querySelector('.api-dot');
    if (dot) {
        dot.className = 'api-dot ' + (status === 'active' ? 'active' : (status === 'noinfo' ? 'noinfo' : (status === 'fetching' ? 'fetching' : 'inactive')));
    }
    const logo = content.querySelector('.api-indicator-logo');
    if (logo) {
        let api = opts.api || selectedApi;
        const apiConfig = config.apis[api];
        logo.src = apiConfig.logo;
        logo.alt = apiConfig.name;
    }
    const text = content.querySelector('[data-role="status-text"]');
    if (text) {
        if (status === 'noinfo') {
            text.textContent = `Err. ${opts.errorCode || 404}`;
        } else if (status === 'fetching') {
            text.textContent = 'loading...';
        } else {
            text.textContent = status === 'active' ? 'actif' : 'inactif';
        }
    }

    // If a rate limit is active for this API, force indicator to fetching state and ensure countdown shows
    try {
        const apiToCheck = opts.api || selectedApi;
        if (rateLimiter.isRateLimited(apiToCheck)) {
            if (status !== 'noinfo') {
                status = 'fetching';
            }
            opts = Object.assign({}, opts, { rateLimited: true });
            const remainingMs = rateLimiter.getRemainingSeconds(apiToCheck) * 1000;
            updateApiCountdown(Math.ceil(remainingMs / 1000));
        }
    } catch (e) { /* ignore */ }
    const expanded = content.querySelector('.api-expanded');
    if (expanded) {
        expanded.innerHTML = '';
        const optTpl = document.getElementById('api-option-template');
        config.ui.validApis.forEach(api => {
            const opt = optTpl ? optTpl.content.firstElementChild.cloneNode(true) : document.createElement('div');
            opt.classList.add('api-option');
            opt.dataset.api = api;
            opt.textContent = config.apis[api].name;
            expanded.appendChild(opt);
        });
    }
    const spinner = content.querySelector('[data-role="spinner"]');
    if (spinner && opts.loadingFallback) {
        spinner.classList.remove('hidden-by-bot');
        if (!spinner.querySelector('.api-spinner')) {
            const s = document.createElement('span');
            s.className = 'api-spinner';
            spinner.appendChild(s);
        }
    }
    el.innerHTML = '';
    el.appendChild(content);
    el.title = symbol || '';
    el.className = 'api-status-indicator ' + status;

    // If rate limit is active for the current API, always show the countdown below the status
    const apiToCheck = opts.api || selectedApi;
    if (rateLimiter.isRateLimited(apiToCheck)) {
        const remainingSec = rateLimiter.getRemainingSeconds(apiToCheck);
        updateApiCountdown(remainingSec);
    }
}

document.addEventListener('click', e => {
    const el = document.getElementById('api-status-indicator');
    if (!el || !el.contains(e.target)) return;
    if (e.target.classList.contains('api-option')) {
        setSelectedApi(e.target.dataset.api);
        el.classList.remove('dropdown-open');
    } else {
        el.classList.toggle('dropdown-open');
    }
});

function isMarketOpen() {
    const d = new Date()
    const day = d.getDay()
    const h = d.getHours() + d.getMinutes()/60
    return day > 0 && day < 6 && h >= 9 && h <= 17.5
}

async function fetchActiveSymbol(force) {
    const symbol = getActiveSymbol()
    if (!symbol || !positions[symbol]) return
    if (positions[symbol].isFetching) return

    if (mainFetchController) mainFetchController.abort()
    mainFetchController = new AbortController()
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
        
        // Démarrer le polling automatique si les données ont été récupérées avec succès
        if (d && !d.error && !d.throttled) {
            startFastPolling();
        }
        // Also fetch news for the card (POC) with same period/api
        try {
            const p = positions[symbol].currentPeriod || '1D';
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
            const days = periodToDays(p);
            const apiToUse = (window.getSelectedApi && typeof window.getSelectedApi === 'function') ? window.getSelectedApi() : window.selectedApi;
            fetchCardNews(symbol, false, 50, days, apiToUse).catch(e=>{});
        } catch(e) { /* ignore */ }
    } catch(e){
        setApiStatus(symbol, 'inactive', { api: selectedApi });
    }
    positions[symbol].isFetching=false
}

function getActiveSymbol() {
    const t = document.querySelector('.tab.active')
    return t? t.dataset.symbol:null
}

document.addEventListener('click', async e=>{
    const t = e.target.closest('.tab')
    if (t) {
        if (initialFetchController) initialFetchController.abort()
        if (mainFetchController) mainFetchController.abort()
        document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'))
        // Deactivate any active tool buttons when switching to a market tab
        try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
        // Close all cards including terminal when switching tabs
        document.querySelectorAll('.card').forEach(x => x.classList.remove('active'))
        t.classList.add('active')
        const sym=t.dataset.symbol
        const cd=document.getElementById(`card-${sym}`)
        if (cd) {
            cd.classList.add('active')
            // Ensure the terminal card is closed when switching to another card
            try { if (cd.id !== 'card-terminal' && typeof closeTerminalCard === 'function') closeTerminalCard(); } catch (e) {}
        }
        fetchActiveSymbol(true)
    }
})

// Card Tabs Logic
document.addEventListener('click', e => {
    const btn = e.target.closest('.card-tab-btn');
    if (!btn) return;

    const card = btn.closest('.card');
    if (!card) return;

    // Remove active class from all buttons in this card
    card.querySelectorAll('.card-tab-btn').forEach(b => b.classList.remove('active'));
    // Add active class to clicked button
    btn.classList.add('active');

    const targetPaneId = btn.dataset.target;
    
    // Hide all panes
    card.querySelectorAll('.card-tab-pane').forEach(p => p.classList.remove('active'));
    
    // Show target pane
    const targetPane = card.querySelector(`.card-tab-pane[data-pane="${targetPaneId}"]`);
    if (targetPane) {
        targetPane.classList.add('active');
    }

    // Get the symbol from the card
    const symbol = card.id?.replace('card-', '');
    if (symbol) {
        // Manage auto-refresh for news tab
        if (targetPaneId === 'news') {
            startCardNewsAutoRefresh(symbol);
        } else {
            stopCardNewsAutoRefresh(symbol);
        }
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
    // Update performance label with current period
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
    // Update news for this symbol using the same period and active API, if news page open for this symbol
    try {
        const apiToUse = (window.getSelectedApi && typeof window.getSelectedApi === 'function') ? window.getSelectedApi() : window.selectedApi;
        const days = (function(period){ switch((period||'').toUpperCase()){ case '1D': return 1; case '1W': return 7; case '1M': return 30; case '6M': return 180; case '1Y': return 365; case '3Y': return 365*3; case '5Y': return 365*5; case 'MAX': return 36500; default: return 7; }})(positions[s].currentPeriod || '1D');
        try { fetchCardNews(s, true, 50, days, apiToUse).catch(()=>{}); } catch(e) {}
        const cardNews = document.getElementById('card-news');
        if (cardNews && cardNews.classList.contains('active')) {
            // If the card-news is open and it's for this symbol, refresh it
            const activeTab = document.querySelector('.tab.active');
            if (activeTab && activeTab.dataset.symbol === s) {
                try { openNewsPage(s); } catch(e) {}
            }
        }
    } catch(e) { /* ignore news update errors */ }
})

// Marquer un tab comme suspendu (ticker mort/délisté)
function markTabAsSuspended(symbol) {
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (!tab || tab.classList.contains('suspended')) return;
    
    tab.classList.add('suspended');
    
    // Stocker dans positions pour mémoire
    if (positions[symbol]) {
        positions[symbol].suspended = true;
    }
    
    console.log(`📛 Tab ${symbol} marqué comme suspendu`);
}

// Enlever le statut suspendu d'un tab (si données reçues avec succès)
function unmarkTabAsSuspended(symbol) {
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (!tab || !tab.classList.contains('suspended')) return;
    
    tab.classList.remove('suspended');
    
    if (positions[symbol]) {
        positions[symbol].suspended = false;
    }
}

async function updateUI(symbol, data) {
    if (!data || data.error) {
        if (data && data.throttled) {
            // Rate limit - don't update UI, just show status
                setApiStatus(symbol, 'fetching', { api: data?.source, loadingFallback: true });
            return;
        }
        if (data && data.errorCode === 429 && data.throttled) {
            setApiStatus(symbol, 'fetching', { api: data?.source, loadingFallback: true, errorCode: 429 });
            const el = document.getElementById('api-status-indicator');
            if (el) {
                const text = el.querySelector('[data-role="status-text"]');
                if (text) text.textContent = 'Limite atteinte, veuillez patienter…';
            }
            return;
        }
        
        // Détecter les tickers morts (404, NO_DATA, NO_VALID_DATA)
        const deadErrorCodes = [404, 'NO_DATA', 'NO_VALID_DATA'];
        if (data && deadErrorCodes.includes(data.errorCode)) {
            markTabAsSuspended(symbol);
        }
        
        // No data for the selected period -> clear period-specific UI to avoid showing stale data
        clearPeriodDisplay(symbol);
        setApiStatus(symbol, 'noinfo', { api: data?.source, errorCode: data?.errorCode });
        return;
    }
    
    // Données reçues avec succès - s'assurer que le tab n'est pas marqué suspendu
    unmarkTabAsSuspended(symbol);

    // Ensure details and signal sections are visible again when valid data arrives
    try {
        const cardRoot = document.getElementById(`card-${symbol}`);
        if (cardRoot) {
            const detailsTitle = cardRoot.querySelector('.details-title');
            if (detailsTitle) {
                detailsTitle.classList.remove('hidden-by-bot');
                const detDate = detailsTitle.nextElementSibling;
                if (detDate && detDate.classList.contains('section-date')) detDate.classList.remove('hidden-by-bot');
            }
            const infoGrid = cardRoot.querySelector('.info-grid');
            if (infoGrid) infoGrid.classList.remove('hidden-by-bot');

            const signalTitle = cardRoot.querySelector('.signal-title');
            if (signalTitle) {
                signalTitle.classList.remove('hidden-by-bot');
                const sigDate = signalTitle.nextElementSibling;
                if (sigDate && sigDate.classList.contains('section-date')) sigDate.classList.remove('hidden-by-bot');
            }
            const signalContainer = cardRoot.querySelector('.signal-container');
            if (signalContainer) signalContainer.classList.remove('hidden-by-bot');
            const labelsEl = cardRoot.querySelector('.signal-labels');
            if (labelsEl) labelsEl.classList.remove('hidden-by-bot');
            const barEl = cardRoot.querySelector('.signal-bar');
            if (barEl) barEl.classList.remove('hidden-by-bot');
        }
    } catch (e) { /* ignore UI restore errors */ }

    // Conversion USD→EUR supprimée, désormais gérée dans polygon.js

    if (data.timestamps && data.prices) {
        updateChart(symbol, data.timestamps, data.prices, positions, data.source, data);
    }

    const openEl = document.getElementById(`open-${symbol}`);
    const highEl = document.getElementById(`high-${symbol}`);
    const lowEl = document.getElementById(`low-${symbol}`);
    const closeEl = document.getElementById(`close-${symbol}`);

    if (openEl) openEl.textContent = data.open ? data.open.toFixed(2) + ' €' : '--';
    if (highEl) highEl.textContent = data.high ? data.high.toFixed(2) + ' €' : '--';
    if (lowEl) lowEl.textContent = data.low ? data.low.toFixed(2) + ' €' : '--';
    if (closeEl) closeEl.textContent = data.price ? data.price.toFixed(2) + ' €' : '--';

    const perfEl = document.getElementById(`perf-${symbol}`);
    if (perfEl && data.changePercent !== undefined) {
        const changePercent = data.changePercent;
        const change = data.change || 0;
        const isPositive = change >= 0;
        
        perfEl.textContent = `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%`;
        perfEl.className = `performance-value ${isPositive ? 'positive' : 'negative'}`;
    }

    const valueEl = document.getElementById(`value-${symbol}`);
    const valuePerEl = document.getElementById(`value-per-${symbol}`);
    const profitEl = document.getElementById(`profit-${symbol}`);
    const profitPerEl = document.getElementById(`profit-per-${symbol}`);

    if (data.price && positions[symbol]) {
        const currentPrice = data.price;
        const shares = positions[symbol].shares || 0;
        const investment = positions[symbol].investment || 0;
        const isShortPosition = investment < 0;

        // Vérifier si les données sont obsolètes
        const purchaseDate = positions[symbol].purchaseDate;
        let isOutdated = false;
        if (purchaseDate && data.timestamps && data.timestamps.length > 0) {
            const latestTimestamp = Math.max(...data.timestamps) * 1000; // convertir en millisecondes
            const purchaseTime = new Date(purchaseDate).getTime();
            isOutdated = latestTimestamp < purchaseTime;
        }

        if (isOutdated) {
            // Données obsolètes - afficher le message au lieu des calculs
            if (valueEl) {
                valueEl.textContent = 'Données obsolètes';
                valueEl.className = 'outdated';
            }
            if (valuePerEl) {
                valuePerEl.textContent = 'Données obsolètes';
                valuePerEl.className = 'outdated';
            }
            if (profitEl) {
                profitEl.textContent = 'Données obsolètes';
                profitEl.className = 'outdated';
            }
            if (profitPerEl) {
                profitPerEl.textContent = 'Données obsolètes';
                profitPerEl.className = 'outdated';
            }
        } else {
            const totalValue = currentPrice * shares;
            if (valueEl) {
                valueEl.textContent = totalValue.toFixed(2) + ' €';
                const costBasis = Math.abs(positions[symbol].costBasis || positions[symbol].investment || 0);
                valueEl.className = totalValue >= costBasis ? 'positive' : 'negative';
            }

            if (valuePerEl) {
                valuePerEl.textContent = currentPrice.toFixed(2) + ' €';
                const costBasis = Math.abs(positions[symbol].costBasis || positions[symbol].investment || 0);
                const perShareCost = shares ? costBasis / shares : 0;
                valuePerEl.className = currentPrice >= perShareCost ? 'positive' : 'negative';
            }

            const costBasis = Math.abs(positions[symbol].costBasis || positions[symbol].investment || 0);
            const totalProfit = totalValue - costBasis;
            if (profitEl) {
                profitEl.textContent = `${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} €`;
                profitEl.className = totalProfit >= 0 ? 'positive' : 'negative';
            }

            const profitPerShare = currentPrice - (shares ? (costBasis / shares) : 0);
            if (profitPerEl) {
                profitPerEl.textContent = `${profitPerShare >= 0 ? '+' : ''}${profitPerShare.toFixed(2)} €`;
                profitPerEl.className = profitPerShare >= 0 ? 'positive' : 'negative';
            }
        }
    }

    const updateEl = document.getElementById(`update-center-${symbol}`);
    if (updateEl) {
        // Utiliser la date/heure des données de l'API au lieu de l'heure actuelle
        let timeString = '--';
        if (data.timestamps && data.timestamps.length > 0) {
            const latestTimestamp = Math.max(...data.timestamps);
            const dataDate = new Date(latestTimestamp * 1000);
            const dateStr = dataDate.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const timeStr = dataDate.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            timeString = `${dateStr} à ${timeStr}`;
        }
        updateEl.textContent = `Dernière mise à jour : ${timeString}`;
    }

    // Update position name if available from API
    if (data && data.name && positions[symbol] && positions[symbol].name === symbol) {
        positions[symbol].name = data.name;
        updateTabTitle(symbol);
    }
    // Update investment cells so the table stays consistent when data arrives
    try {
        const investEl = document.getElementById(`invest-${symbol}`);
        const investPerEl = document.getElementById(`invest-per-${symbol}`);
        if (investEl) {
            const inv = positions[symbol].costBasis || Math.abs(positions[symbol].investment || 0);
            investEl.textContent = `${inv.toFixed(2)} €`;
            // Leave the invest total neutral (no positive/negative color)
            investEl.classList.remove('positive');
            investEl.classList.remove('negative');
        }
        if (investPerEl) {
            const costBasis = positions[symbol].costBasis || Math.abs(positions[symbol].investment || 0);
            const invPer = (positions[symbol].shares && positions[symbol].shares > 0) ? (costBasis / positions[symbol].shares) : 0;
            investPerEl.textContent = positions[symbol].shares ? `${invPer.toFixed(2)} €` : '--';
        }
    } catch(e) { /* ignore if cells missing */ }
    
    // Mettre à jour le titre du tab avec la nouvelle date
    updateTabTitle(symbol);
    
    // Mettre à jour le titre de la carte avec la nouvelle date
    updateCardTitle(symbol);
    // Mettre à jour les dates sous les sections (cours, investissement, details)
    try { updateSectionDates(symbol); } catch (e) { /* ignore */ }

    // Mettre à jour le signal d'achat/vente
    updateSignal(symbol, data);
}

function resetSymbolDisplay(symbol) {
    if (!positions[symbol]) return
    
    if (positions[symbol].chart) {
        positions[symbol].chart.data.labels = []
        positions[symbol].chart.data.datasets[0].data = []
        positions[symbol].chart.data.timestamps = []
        positions[symbol].chart.update('none')
    }
    
    const openEl = document.getElementById(`open-${symbol}`);
    const highEl = document.getElementById(`high-${symbol}`);
    const lowEl = document.getElementById(`low-${symbol}`);
    const closeEl = document.getElementById(`close-${symbol}`);
    
    if (openEl) openEl.textContent = '--'
    if (highEl) highEl.textContent = '--'
    if (lowEl) lowEl.textContent = '--'
    if (closeEl) closeEl.textContent = '--'
    
    const perfEl = document.getElementById(`perf-${symbol}`);
    if (perfEl) {
        perfEl.textContent = '--'
        perfEl.className = 'performance-value'
    }
    
    const valueEl = document.getElementById(`value-${symbol}`);
    const valuePerEl = document.getElementById(`value-per-${symbol}`);
    const profitEl = document.getElementById(`profit-${symbol}`);
    const profitPerEl = document.getElementById(`profit-per-${symbol}`);
    
    if (valueEl) valueEl.textContent = '--'
    if (valuePerEl) valuePerEl.textContent = '--'
    if (profitEl) profitEl.textContent = '--'
    if (profitPerEl) profitPerEl.textContent = '--'
    
    const updateEl = document.getElementById(`update-center-${symbol}`);
    if (updateEl) {
        updateEl.textContent = 'Dernière mise à jour : --'
    }

    // Réinitialiser le signal
    const signalCursor = document.getElementById(`signal-cursor-${symbol}`);
    const signalValue = document.getElementById(`signal-value-${symbol}`);
    const signalDescription = document.getElementById(`signal-description-${symbol}`);

    if (signalCursor) signalCursor.style.left = '50%';
    if (signalValue) {
        signalValue.textContent = 'Neutre';
        signalValue.style.color = '#a8a2ff';
    }
    if (signalDescription) signalDescription.textContent = 'Analyse technique en cours...';
}

function getLastDataDate(symbol) {
    const pos = positions[symbol];
    if (!pos || !pos.lastData || !pos.lastData.timestamps || pos.lastData.timestamps.length === 0) {
        return null;
    }
    
    // Prendre le timestamp le plus récent
    const latestTimestamp = Math.max(...pos.lastData.timestamps);
    const date = new Date(latestTimestamp * 1000);
    
    // Formater en JJ/MM
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
}

function updateTabTitle(symbol) {
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (!tab) return;
    
    const nameEl = tab.querySelector('.tab-name');
    if (!nameEl) return;
    
    const pos = positions[symbol];
    const baseName = pos?.name || symbol;
    nameEl.textContent = baseName;
}

function updateCardTitle(symbol) {
    const dateStr = getLastDataDate(symbol);
    if (!dateStr) return;
    
    const titleEl = document.getElementById(`course-title-${symbol}`);
    if (!titleEl) return;
    
    titleEl.textContent = `Cours de l'action (${dateStr})`;
}

// Return the best date to display under sections: only from API data, no fallback
function getBestDataDate(symbol) {
    const pos = positions[symbol];
    if (!pos) return '';
    // Only use lastData timestamps if valid
    if (pos.lastData && Array.isArray(pos.lastData.timestamps) && pos.lastData.timestamps.length > 0) {
        // Ensure there is at least one valid numeric timestamp
        const numericTimestamps = pos.lastData.timestamps.filter(t => typeof t === 'number' && !isNaN(t) && t > 0);
        if (numericTimestamps.length > 0) {
            const latest = Math.max(...numericTimestamps);
            const d = new Date(latest * 1000);
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    }

    return '';
}

// Update the three section .section-date placeholders for a card
function updateSectionDates(symbol) {
    const dateStr = getBestDataDate(symbol);
    // Course
    const courseTitle = document.getElementById(`course-title-${symbol}`);
    if (courseTitle) {
        const courseDate = courseTitle.nextElementSibling;
        if (courseDate && courseDate.classList.contains('section-date')) {
            courseDate.textContent = dateStr ? `Données : ${dateStr}` : '';
        }
    }
    // Investment
    const invTitle = document.getElementById(`investment-title-${symbol}`);
    if (invTitle) {
        const invDate = invTitle.nextElementSibling;
        if (invDate && invDate.classList.contains('section-date')) {
            invDate.textContent = dateStr ? `Données : ${dateStr}` : '';
        }
    }
    // Details
    const detTitle = document.getElementById(`details-title-${symbol}`);
    if (detTitle) {
        const detDate = detTitle.nextElementSibling;
        if (detDate && detDate.classList.contains('section-date')) {
            detDate.textContent = dateStr ? `Données : ${dateStr}` : '';
        }
    }
    // Signal
    const signalTitle = document.getElementById(`signal-title-${symbol}`);
    if (signalTitle) {
        const signalDate = signalTitle.nextElementSibling;
        if (signalDate && signalDate.classList.contains('section-date')) {
            signalDate.textContent = dateStr ? `Données : ${dateStr}` : '';
        }
    }
}

function updatePortfolioSummary() {
    let totalShares = 0;
    let totalInvestment = 223.52; // Valeur mise à jour de l'investissement total
    let cashAccount = -0.15; // Valeur mise à jour du compte titre

    Object.values(positions).forEach(pos => {
        totalShares += pos.shares || 0;
        // Prefer costBasis (sum of unchecked purchases left) as the invested capital for currently held shares
        // totalInvestment += Math.abs(pos.costBasis || pos.investment || 0); // Commenté car valeur fixe
    });

    const totalSharesEl = document.getElementById('total-shares');
    const totalInvestmentEl = document.getElementById('total-investment');
    const cashAccountEl = document.getElementById('cash-account');

    if (totalSharesEl) totalSharesEl.textContent = totalShares;
    if (totalInvestmentEl) totalInvestmentEl.textContent = totalInvestment.toFixed(2) + ' €';
    if (cashAccountEl) cashAccountEl.textContent = cashAccount.toFixed(2) + ' €';
}

async function loadStocks() {
    const config = await loadApiConfig();

    // Charger tous les types d'actifs depuis le dossier stock
    const types = ['equity', 'commodity', 'crypto'];
    const list = [];

    for (const type of types) {
        try {
            const response = await fetch(`stock/${type}.json`);
            if (response.ok) {
                const stocks = await response.json();
                list.push(...stocks);
            } else {
                console.warn(`Impossible de charger stock/${type}.json`);
            }
        } catch (error) {
            console.warn(`Erreur lors du chargement de stock/${type}.json:`, error);
        }
    }

    // Grouper par type
    const byType = {};
    list.forEach(s => {
        if (!byType[s.type]) byType[s.type] = [];
        byType[s.type].push(s);
    });

    // Nettoyer les tabs existants
    document.getElementById('portfolio-tabs').innerHTML = '';
    document.getElementById('general-tabs').innerHTML = '';

    // Pour chaque type, créer un sous-titre et un conteneur
    // Dictionnaire d'icônes Font Awesome par type
    const typeIcons = {
        equity: 'fa-solid fa-building-columns',
        commodity: 'fa-solid fa-coins',
        crypto: 'fa-brands fa-bitcoin',
    };
    Object.entries(byType).forEach(([type, stocks]) => {
        // Ne crée la section que si au moins un stock de ce type existe dans la catégorie
        const hasPortfolio = stocks.some(s => {
            const calculated = calculateStockValues(s);
            const hasTransactions = (s.purchases && s.purchases.length > 0) || (s.sales && s.sales.length > 0);
            return calculated.shares > 0 || hasTransactions;
        });
        const hasGeneral = stocks.some(s => {
            const calculated = calculateStockValues(s);
            const hasTransactions = (s.purchases && s.purchases.length > 0) || (s.sales && s.sales.length > 0);
            return calculated.shares === 0 && !hasTransactions;
        });
        const typeLabel = {
            equity: 'Actions',
            commodity: 'Matières Premières',
            crypto: 'Cryptos',
        }[type] || type.charAt(0).toUpperCase() + type.slice(1);
        const iconClass = typeIcons[type] || 'fa-solid fa-layer-group';

        if (hasPortfolio) {
            const portSection = document.createElement('div');
            portSection.className = 'tab-type-section';
            portSection.id = `portfolio-section-${type}`;
            const portTitle = document.createElement('div');
            portTitle.className = 'tab-type-title';
            portTitle.innerHTML = `<i class="${iconClass} type-icon"></i>${typeLabel}`;
            portSection.appendChild(portTitle);
            document.getElementById('portfolio-tabs').appendChild(portSection);
        }
        if (hasGeneral) {
            const genSection = document.createElement('div');
            genSection.className = 'tab-type-section';
            genSection.id = `general-section-${type}`;
            const genTitle = document.createElement('div');
            genTitle.className = 'tab-type-title';
            genTitle.innerHTML = `<i class="${iconClass} type-icon"></i>${typeLabel}`;
            genSection.appendChild(genTitle);
            document.getElementById('general-tabs').appendChild(genSection);
        }
    });

    // Création des positions et des tabs/cards
    list.forEach(s => {
        const calculated = calculateStockValues(s);
        positions[s.symbol] = {
            symbol: s.symbol,
            ticker: s.ticker, // always raw ticker from stocks.json
            name: s.name,
            type: s.type,
            currency: s.currency,
            api_mapping: s.api_mapping,
            shares: calculated.shares,
            investment: calculated.investment,
            costBasis: calculated.costBasis || 0,
            purchaseDate: calculated.purchaseDate,
            purchases: s.purchases || [],
            news: [],
            lastNewsFetch: 0,
            chart: null,
            lastFetch: 0,
            lastData: null,
            currentPeriod: '1D'
        };
        lastApiBySymbol[s.symbol] = selectedApi;
        createTab(s, s.type);
        createCard(s);
    });

    Object.keys(positions).forEach(sym => initChart(sym, positions));

    // Initialize section dates for all cards (use purchaseDate fallback when no API data yet)
    Object.keys(positions).forEach(sym => {
        try { updateSectionDates(sym); } catch (e) {}
    });

    const first = document.querySelector('.sidebar .tab');
    if (first) {
        first.classList.add('active');
        const sym = first.dataset.symbol;
        document.getElementById(`card-${sym}`).classList.add('active');
        fetchActiveSymbol(true);
    }

    const open = Object.values(positions).find(p => p.shares > 0);

    setApiStatus(null, 'active', { api: selectedApi });

    updatePortfolioSummary();
    
    // Vérifier les tickers morts en arrière-plan (après un délai pour ne pas bloquer)
    setTimeout(() => checkSuspendedTickers(), 2000);
    
    // Terminal should not open automatically; it opens only when user clicks Terminal or presses Ctrl/Cmd+K
}

// Vérifier tous les tickers pour détecter ceux qui sont morts/suspendus
async function checkSuspendedTickers() {
    const YAHOO_PROXY = 'https://corsproxy.io/?';
    const symbols = Object.keys(positions);
    
    console.log(`🔍 Vérification de ${symbols.length} tickers pour détecter les suspendus...`);
    
    // Traiter en batches de 5 pour éviter trop de requêtes simultanées
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (symbol) => {
            try {
                const pos = positions[symbol];
                if (!pos) return;
                
                // Utiliser le symbole Yahoo
                const yahooSymbol = pos.api_mapping?.yahoo || pos.ticker || symbol;
                const url = `${YAHOO_PROXY}https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m`;
                
                const r = await fetch(url);
                if (!r.ok) {
                    if (r.status === 404) {
                        markTabAsSuspended(symbol);
                    }
                    return;
                }
                
                const data = await r.json();
                const result = data.chart?.result?.[0];
                
                if (!result) {
                    markTabAsSuspended(symbol);
                    return;
                }
                
                const meta = result.meta || {};
                const closes = result.indicators?.quote?.[0]?.close || [];
                const volumes = result.indicators?.quote?.[0]?.volume || [];
                
                // Vérifier si le ticker est mort
                const validCloses = closes.filter(c => c !== null && c !== undefined);
                const hasNoData = validCloses.length === 0;
                
                const tradeable = meta.tradeable !== false;
                const regularMarketTime = meta.regularMarketTime || 0;
                const now = Math.floor(Date.now() / 1000);
                const daysSinceLastTrade = regularMarketTime > 0 ? (now - regularMarketTime) / (60 * 60 * 24) : 999;
                
                // Volume total
                let totalVolume = 0;
                for (const v of volumes) {
                    if (v) totalVolume += v;
                }
                const volume = meta.regularMarketVolume || totalVolume;
                
                // Prix actuel
                const price = meta.regularMarketPrice || 0;
                const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
                const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
                
                const hasNoVolume = volume === 0;
                const hasNoChange = Math.abs(changePercent) < 0.001;
                const noActivity = hasNoVolume && hasNoChange;
                
                const isSuspended = !tradeable || 
                                   hasNoData ||
                                   (noActivity && daysSinceLastTrade > 3) ||
                                   daysSinceLastTrade > 7;
                
                if (isSuspended) {
                    markTabAsSuspended(symbol);
                }
                
            } catch (e) {
                // Erreur réseau - ne pas marquer comme suspendu
                console.log(`⚠️ Erreur vérification ${symbol}:`, e.message);
            }
        }));
        
        // Petit délai entre les batches
        if (i + batchSize < symbols.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    
    console.log(`✅ Vérification des tickers terminée`);
}

const font=document.createElement('link')
font.id='poppins-font'
font.rel='stylesheet'
font.href='https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
document.head.appendChild(font)

window.addEventListener('load', async () => {
    await loadStocks();
    setPositions(positions);
    const active = getActiveSymbol();
    // Initialize section toggles for sidebar collapsible sections
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
                // Persist collapsed state in localStorage
                try { localStorage.setItem(`sidebar:${section.id}:collapsed`, expanded ? '1' : '0'); } catch (err) { /* ignore */ }
            });
            // Make title clickable as well
            const title = section.querySelector('.sidebar-section-title');
            if (title) {
                title.addEventListener('click', (ev) => {
                    // If click landed on the toggle button itself, ignore (already handled)
                    if (ev.target.closest('.section-toggle')) return;
                    btn.click();
                });
                // Keyboard accessibility for the title
                title.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        btn.click();
                    }
                });
            }
        });
    } catch (e) { /* ignore if sidebar not yet in DOM */ }

    // Restore collapsed state from localStorage
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
    } catch (err) { /* ignore storage errors */ }
});

// Command bar & terminal POC
function openTerminalCard(prefill = '') {
    const card = document.getElementById('card-terminal');
    const input = document.getElementById('terminal-input');
    if (!card || !input) return;
    // Deactivate any active card
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    // Deactivate active tab selection so terminal acts like a tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    // Deactivate active tool buttons
    try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
    card.classList.add('active');
    card.setAttribute('aria-hidden', 'false');
    // Highlight the terminal button like a tab
    try { document.getElementById('open-terminal-btn')?.classList.add('active'); } catch(e) {}
    // hide news overlay when opening terminal
    try { document.getElementById('news-overlay')?.setAttribute('aria-hidden', 'true'); } catch(e) {}
    input.value = prefill;
    // Ensure that visibility is controlled by CSS classes - clear inline style
    card.style.display = '';
    // do not clear terminal output on open; we want the initial header preserved
    // opened
    input.focus();
    // put caret at end
    input.setSelectionRange(input.value.length, input.value.length);
    try { const out = document.getElementById('terminal-output'); if (out) out.scrollTop = out.scrollHeight; } catch(e) {}
}

function closeTerminalCard() {
    const card = document.getElementById('card-terminal');
    if (!card) return;
    card.classList.remove('active');
    // Ensure inline display flag not blocking CSS
    card.style.display = '';
    card.setAttribute('aria-hidden', 'true');
    // closed
    try { document.getElementById('open-terminal-btn')?.classList.remove('active'); } catch(e) {}
}

// Command parsing moved to `js/terminal.js` to keep terminal module isolated

// Keyboard-driven terminal open/close and input managed by `js/terminal.js`

document.getElementById('open-terminal-btn')?.addEventListener('click', e => {
    openTerminalCard();
});
document.getElementById('open-news-feed')?.addEventListener('click', async e => {
    // Open dedicated news page (not overlay)
    const a = getActiveSymbol();
    try { openNewsPage(a); } catch (err) { /* fallback */ openNewsOverlay(a); }
    // Highlight the news widget button
    try { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); } catch(e) {}
    try { document.getElementById('open-news-feed')?.classList.add('active'); } catch(e) {}
});

// Close terminal card toolbar button
// close button removed from markup per UX decision (terminal always available)

// Close news overlay
document.getElementById('close-news-overlay')?.addEventListener('click', e => {
    closeNewsOverlay();
});

// Close dedicated news page
// close-news-page removed: news page is directly closable through card toggles

// Global Escape key: close news page when visible
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

// Terminal input now handled in `js/terminal.js` (new module)

// Do not auto-close the terminal card on blur or click outside (card behavior)

window.startRateLimitCountdown = startRateLimitCountdown;
window.stopRateLimitCountdown = stopRateLimitCountdown;
window.startGlobalRateLimitCountdown = startGlobalRateLimitCountdown;
window.stopGlobalRateLimitCountdown = stopGlobalRateLimitCountdown;

// Expose a minimal public API for the terminal module
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
window.setSelectedApi = setSelectedApi;
window.selectedApi = selectedApi;
window.setupNewsSearch = setupNewsSearch;

// Register dynamic position from explorer
window.registerDynamicPosition = function(posData) {
    if (!posData || !posData.symbol) return;
    positions[posData.symbol] = posData;
};

// Activate stock and fetch data (called from explorer)
window.activateStock = function(symbol) {
    if (!symbol || !positions[symbol]) return;
    
    // Initialize chart if not exists
    const chartCanvas = document.getElementById(`chart-${symbol}`);
    if (chartCanvas && !positions[symbol].chart) {
        initChart(symbol, positions);
    }
    
    // Fetch data for this symbol
    setTimeout(() => {
        // Make sure this card is the active one
        const card = document.getElementById(`card-${symbol}`);
        if (card && card.classList.contains('active')) {
            fetchActiveSymbol(true);
        }
    }, 100);
};

// Listen for rate limit events (fallback if rate-limiter dispatches events instead of calling functions)
window.addEventListener('rateLimitStart', (e) => {
    // ensure UI shows the rate limit state and start the countdown loop
    try {
        startGlobalRateLimitCountdown();
    } catch (err) {
        // best-effort: directly set status if helper missing
        setApiStatus(null, 'fetching', { api: selectedApi, loadingFallback: true, rateLimited: true });
    }
});

window.addEventListener('rateLimitEnd', (e) => {
    try {
        stopGlobalRateLimitCountdown();
    } catch (err) {
        // nothing to do
    }
});

function updateCardDates(symbol) {
    const pos = positions[symbol];
    if (!pos || !pos.purchaseDate) return;

    const dateStr = new Date(pos.purchaseDate).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    // Mettre à jour la date sous chaque titre de section
    const titles = [
        `course-title-${symbol}`,
        `investment-title-${symbol}`,
        `details-title-${symbol}`
    ];

    titles.forEach(titleId => {
        const titleEl = document.getElementById(titleId);
        if (titleEl) {
            // Supprimer l'ancienne date si elle existe
            const existingDate = titleEl.nextElementSibling;
            if (existingDate && existingDate.classList.contains('section-date')) {
                existingDate.remove();
            }

            // Ajouter la nouvelle date
            const dateEl = document.createElement('div');
            dateEl.className = 'section-date';
            dateEl.textContent = `Du ${dateStr}`;
            titleEl.insertAdjacentElement('afterend', dateEl);
        }
    });
}

function calculateStockValues(stock) {
    let totalInvestment = stock.investment || 0;
    let totalShares = stock.shares || 0;
    let earliestPurchaseDate = stock.purchaseDate;
    let costBasis = 0; // cost basis for currently held shares (positive number)
    
    if (stock.purchases && stock.purchases.length > 0) {
        totalInvestment = stock.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
        totalShares = stock.purchases.reduce((sum, p) => sum + (p.shares || 0), 0);
        const dates = stock.purchases.map(p => p.date).filter(d => d).sort();
        earliestPurchaseDate = dates.length > 0 ? dates[0] : null;
        // Build FIFO lots from purchases (ascending date)
        const purchaseLots = stock.purchases.slice().sort((a,b)=> new Date(a.date) - new Date(b.date)).map(p => ({
            shares: p.shares || 0,
            amount: Math.abs(p.amount || 0),
            perShare: ((Math.abs(p.amount || 0)) / (p.shares || 1))
        }));
        // compute initial cost basis = sum of all purchase amounts
        costBasis = purchaseLots.reduce((sum, l) => sum + l.amount, 0);

        // We'll reduce cost basis as we process sales below (FIFO)
        // Store intermediate lots to be reduced
        var lots = purchaseLots;
    }

    if (stock.sales && stock.sales.length > 0) {
        totalInvestment += stock.sales.reduce((sum, s) => sum + (s.amount || 0), 0);
        totalShares -= stock.sales.reduce((sum, s) => sum + (s.shares || 0), 0);
        // Process sales FIFO to reduce lots and cost basis
        const salesSorted = stock.sales.slice().sort((a,b)=> new Date(a.date) - new Date(b.date));
        let remainingToRemove = 0;
        salesSorted.forEach(s => {
            remainingToRemove = s.shares || 0;
            while (remainingToRemove > 0 && lots && lots.length > 0) {
                const lot = lots[0];
                if (lot.shares <= remainingToRemove) {
                    // Remove entire lot
                    remainingToRemove -= lot.shares;
                    costBasis -= lot.amount;
                    lots.shift();
                } else {
                    // Remove part of lot
                    const removedShares = remainingToRemove;
                    const removedAmount = lot.perShare * removedShares;
                    lot.shares -= removedShares;
                    lot.amount -= removedAmount;
                    costBasis -= removedAmount;
                    remainingToRemove = 0;
                }
            }
        });
    }
    
    // If no shares remaining, investment should be 0 (realized P/L is separate)
    const displayInvestment = totalShares > 0 ? totalInvestment : 0;
    
    return {
        investment: displayInvestment,
        shares: totalShares,
        costBasis: Math.max(0, costBasis),
        purchaseDate: earliestPurchaseDate,
        realizedPL: totalShares === 0 ? totalInvestment : 0 // Track realized profit/loss when position closed
    };
}

function createTab(stock, type) {
    const t = document.getElementById('tab-template');
    if (!t) return;
    const tab = t.content.firstElementChild.cloneNode(true);
    tab.dataset.symbol = stock.symbol;
    tab.dataset.ticker = stock.ticker;
    
    // Marquer comme suspendu si le stock l'est
    if (stock.suspended) {
        tab.classList.add('suspended');
    }
    
    const img = tab.querySelector('img');
    img.src = `icon/${stock.symbol}.png`;
    img.alt = stock.symbol;
    img.onerror = function () {
        const parent = this.parentElement;
        const ticker = (stock.ticker || stock.symbol || '').toUpperCase();
        parent.innerHTML = '';
        const fallback = document.createElement('div');
        fallback.className = 'tab-logo-fallback';
        fallback.textContent = ticker;
        fallback.title = ticker;
        // Auto-adjust font size to fit the ticker within boundaries
        let fontSize = 12;
        if (ticker.length > 4) {
            fontSize = Math.max(6, 12 - (ticker.length - 4) * 2);
        }
        fallback.style.fontSize = fontSize + 'px';
        parent.appendChild(fallback);
    };
    
    // Initialiser le titre avec le nom de base
    const pos = positions[stock.symbol];
    const baseName = pos?.name || stock.symbol;
    tab.querySelector('.tab-name').textContent = baseName;
    
    const calculated = calculateStockValues(stock);
    tab.querySelector('.tab-shares').textContent = calculated.shares > 0 ? `(Actions possédées : ${calculated.shares})` : '';
    // Un stock va dans le portefeuille s'il possède des actions OU s'il a eu des transactions dans le passé
    const hasTransactions = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);
    const isPortfolio = calculated.shares > 0 || hasTransactions;
    const sectionId = isPortfolio ? `portfolio-section-${type}` : `general-section-${type}`;
    document.getElementById(sectionId)?.appendChild(tab);
}

function createCard(stock) {
    const t = document.getElementById('card-template')
    if (!t) return
    const card = t.content.firstElementChild.cloneNode(true)
    card.id = `card-${stock.symbol}`

    const logo = card.querySelector('.logo img')
    logo.id = `logo-${stock.symbol}`
    logo.dataset.symbol = stock.symbol
    logo.src = `logo/${stock.symbol}.png`
    logo.onerror = function(){
        try {
            const parent = this.parentElement;
            parent.innerHTML = '';
            const name = stock.name || stock.symbol;
            const wrapper = document.createElement('div');
            wrapper.className = 'logo-fallback';
            const nEl = document.createElement('div');
            nEl.className = 'logo-name';
            nEl.textContent = name;
            nEl.title = name;
            wrapper.appendChild(nEl);
            parent.appendChild(wrapper);
        } catch(e) { this.parentElement.innerHTML = stock.symbol.slice(0,2); }
    }

    // (Card title will be appended when logo fails to load in the onerror handler)

    // Set id for general title
    const generalTitle = card.querySelector('h3.section-title');
    if (generalTitle) {
        generalTitle.id = `general-title-${stock.symbol}`;
        const genDate = generalTitle.nextElementSibling;
        if (genDate && genDate.classList.contains('section-date')) {
            genDate.id = `general-date-${stock.symbol}`;
            genDate.textContent = '';
        }
    }

    const sh = card.querySelector('.important-shares span')
    sh.id = `shares-${stock.symbol}`
    const calculated = calculateStockValues(stock);
    sh.textContent = calculated.shares

    // Hide investment section if no shares owned
    const investmentSection = card.querySelector('.investment-section');
    if (investmentSection) {
        investmentSection.style.display = calculated.shares > 0 ? '' : 'none';
    }

    const isin = card.querySelector('.general-row strong + span')
    if (isin) {
        isin.id = `isin-${stock.symbol}`
        isin.textContent = stock.isin || ''
        if (!stock.isin) isin.parentElement.style.display='none'
    }

    const arr = card.querySelectorAll('.general-row strong + span')
    const tk = arr[1]
    if (tk) {
        tk.id = `ticker-${stock.symbol}`
        tk.textContent = stock.ticker || stock.symbol
    }

    const symInfo = card.querySelector('#symbol-info')
    if (symInfo) symInfo.textContent = stock.symbol

    const cn = card.querySelector('.country-name')
    if (cn) cn.textContent = stock.country || ''

    const flag = card.querySelector('.flag-icon')
    if (flag) {
        flag.id = `flag-${stock.symbol}`
        flag.dataset.country = stock.country || ''
        flag.src = `flag/${(stock.country||'').toLowerCase()}.png`
    }

    const group = card.querySelector('.periods-group')
    group.id = `periods-${stock.symbol}`
    group.querySelectorAll('.period-btn').forEach(btn=>{
        btn.dataset.symbol = stock.symbol
        if (btn.dataset.period==='1D') btn.classList.add('active')
    })

    const c = card.querySelector('.chart-canvas')
    c.id = `chart-${stock.symbol}`

    const pf = card.querySelector('.performance-value')
    pf.id = `perf-${stock.symbol}`
    pf.textContent = '--'

    const upd = card.querySelector('.update-center')
    if (upd) {
        upd.id = `update-center-${stock.symbol}`
        upd.textContent = 'Dernière mise à jour : --'
    }

    // Simple: set the course title id and populate the adjacent .section-date div if present
    const courseTitle = card.querySelector('.course-title');
    if (courseTitle) {
        courseTitle.id = `course-title-${stock.symbol}`;
        const courseDate = courseTitle.nextElementSibling;
        if (courseDate && courseDate.classList.contains('section-date')) {
            courseDate.id = `course-date-${stock.symbol}`;
            courseDate.textContent = '';
        }
    }

    // Assigner les IDs pour la section investissement
    const invTitle = card.querySelector('.investment-title')
    if (invTitle) {
        invTitle.id = `investment-title-${stock.symbol}`;
        const invDate = invTitle.nextElementSibling;
        if (invDate && invDate.classList.contains('section-date')) {
            invDate.id = `investment-date-${stock.symbol}`;
        }
    }

    // Assigner les IDs aux éléments de la table d'investissement
    const tds = card.querySelectorAll('.card-table-td')
    if (tds.length===8) {
        tds[1].id=`invest-${stock.symbol}`
        tds[2].id=`value-${stock.symbol}`
        tds[3].id=`profit-${stock.symbol}`
        tds[5].id=`invest-per-${stock.symbol}`
        tds[6].id=`value-per-${stock.symbol}`
        tds[7].id=`profit-per-${stock.symbol}`
    }

    // Vérifier si l'utilisateur a déjà investi sur cette action
    const hasEverInvested = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);

    // Masquer l'onglet Investissement si jamais investi
    const investmentTabBtn = card.querySelector('.card-tab-btn[data-target="investment"]');
    if (investmentTabBtn) {
        investmentTabBtn.style.display = hasEverInvested ? '' : 'none';
    }

    // Remplir les valeurs si on possède des actions
    if (calculated.shares > 0) {
        // Show the invested amount (cost basis) that corresponds to currently held shares
        const displayInvestment = typeof calculated.costBasis === 'number' ? calculated.costBasis : Math.abs(calculated.investment || 0);
        tds[1].textContent = `${displayInvestment.toFixed(2)} €`;
        // Keep 'Investi' total neutral (no color class): do not apply positive/negative classes here
        tds[2].textContent = '--';
        tds[3].textContent = '--';
        // Per-share investment should be displayed as a positive number (money spent per share)
        const displayInvestPerShare = calculated.shares ? (displayInvestment / calculated.shares) : 0;
        tds[5].textContent = calculated.shares ? `${displayInvestPerShare.toFixed(2)} €` : '--';
        tds[6].textContent = '--';
        tds[7].textContent = '--';
    } else {
        // Si pas d'actions, afficher 0 ou --
        tds[1].textContent = '0.00 €';
        tds[2].textContent = '--';
        tds[3].textContent = '--';
        tds[5].textContent = '--';
        tds[6].textContent = '--';
        tds[7].textContent = '--';
    }

    // Ne plus masquer le tableau d'investissement même si on ne possède plus d'actions
    const cardTableContainer = card.querySelector('.card-table-container')
    if (cardTableContainer) {
        cardTableContainer.style.display = '';
    }

    // Ne plus masquer le titre et la date de la section investissement
    const investmentTitle = card.querySelector('.investment-title')
    if (investmentTitle) {
        investmentTitle.style.display = '';
        const investmentDate = investmentTitle.nextElementSibling;
        if (investmentDate && investmentDate.classList.contains('section-date')) {
            investmentDate.style.display = '';
        }
    }

    const detailsTitle = card.querySelector('.details-title')
    if (detailsTitle) {
        detailsTitle.id = `details-title-${stock.symbol}`;
        const detDate = detailsTitle.nextElementSibling;
        if (detDate && detDate.classList.contains('section-date')) {
            detDate.id = `details-date-${stock.symbol}`;
            detDate.textContent = '';
        }
    }

    // Assigner les IDs pour la section signal
    const signalTitle = card.querySelector('.signal-title')
    if (signalTitle) {
        signalTitle.id = `signal-title-${stock.symbol}`;
        const signalDate = signalTitle.nextElementSibling;
        if (signalDate && signalDate.classList.contains('section-date')) {
            signalDate.id = `signal-date-${stock.symbol}`;
            signalDate.textContent = '';
        }
    }

    // Assigner les IDs pour les éléments du signal
    const signalCursor = card.querySelector('.signal-cursor');
    const signalValue = card.querySelector('.signal-value');
    const signalDescription = card.querySelector('.signal-description');

    if (signalCursor) signalCursor.id = `signal-cursor-${stock.symbol}`;
    if (signalValue) signalValue.id = `signal-value-${stock.symbol}`;
    if (signalDescription) signalDescription.id = `signal-description-${stock.symbol}`;

    const info = card.querySelectorAll('.info-value')
    if (info.length===4) {
        info[0].id=`open-${stock.symbol}`
        info[1].id=`high-${stock.symbol}`
        info[2].id=`low-${stock.symbol}`
        info[3].id=`close-${stock.symbol}`
        info.forEach(el=>el.textContent='--')
    }

    const transactionTitle = card.querySelector('.transaction-history-title')
    if (transactionTitle) {
        transactionTitle.id = `transaction-history-title-${stock.symbol}`;
        // Toujours afficher le titre de l'historique
        transactionTitle.style.display = '';
    }

    // Toujours afficher le conteneur de l'historique
    const transactionContainer = card.querySelector('.transaction-history-container')
    if (transactionContainer) {
        transactionContainer.style.display = '';
        const tbody = card.querySelector('.transaction-history-body');
        const hasTransactions = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);
        if (tbody && hasTransactions) {
            let transactions = [];
            if (stock.purchases) {
                stock.purchases.forEach(p => transactions.push({date: p.date, amount: p.amount, shares: p.shares, type: 'Achat'}));
            }
            if (stock.sales) {
                stock.sales.forEach(s => transactions.push({date: s.date, amount: s.amount, shares: s.shares, type: 'Vente'}));
            }
            // Sort transactions by date desc
            transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            // Build table rows using the template instead of string concatenation
            const rowTpl = document.getElementById('transaction-row-template');
            tbody.innerHTML = '';
            transactions.forEach(t => {
                const row = rowTpl ? rowTpl.content.firstElementChild.cloneNode(true) : document.createElement('tr');
                row.classList.add(t.type === 'Achat' ? 'transaction-buy' : 'transaction-sell');
                const dateEl = row.querySelector('.trans-date');
                const typeEl = row.querySelector('.trans-type');
                const amountEl = row.querySelector('.trans-amount');
                const sharesEl = row.querySelector('.trans-shares');
                const priceEl = row.querySelector('.trans-price');
                if (dateEl) dateEl.textContent = new Date(t.date).toLocaleDateString('fr-FR');
                if (typeEl) typeEl.textContent = t.type;
                if (amountEl) amountEl.textContent = Math.abs(t.amount).toFixed(2) + ' €';
                if (sharesEl) sharesEl.textContent = t.shares;
                if (priceEl) priceEl.textContent = (Math.abs(t.amount) / t.shares).toFixed(2) + ' €';
                tbody.appendChild(row);
            });
        }
    }

    // Assign news list id for this card (will be used by updateNewsUI)
    const nl = card.querySelector('.news-list');
    if (nl) nl.id = `news-list-${stock.symbol}`;

    document.getElementById('cards-container')?.appendChild(card)
    
    // Setup news search listener
    setupNewsSearch(stock.symbol);
}

function clearPeriodDisplay(symbol) {
    if (!positions[symbol]) return;
    // Clear chart data but keep chart instance
    if (positions[symbol].chart) {
        positions[symbol].chart.data.labels = [];
        if (positions[symbol].chart.data.datasets && positions[symbol].chart.data.datasets[0]) {
            positions[symbol].chart.data.datasets[0].data = [];
        }
        positions[symbol].chart.data.timestamps = [];
        try { positions[symbol].chart.update('none'); } catch (e) { /* ignore */ }
    }

    // Clear basic price info
    const openEl = document.getElementById(`open-${symbol}`);
    const highEl = document.getElementById(`high-${symbol}`);
    const lowEl = document.getElementById(`low-${symbol}`);
    const closeEl = document.getElementById(`close-${symbol}`);
    if (openEl) openEl.textContent = '--';
    if (highEl) highEl.textContent = '--';
    if (lowEl) lowEl.textContent = '--';
    if (closeEl) closeEl.textContent = '--';

    // Clear perf and update time
    const perfEl = document.getElementById(`perf-${symbol}`);
    if (perfEl) { perfEl.textContent = '--'; perfEl.className = 'performance-value'; }
    const updateEl = document.getElementById(`update-center-${symbol}`);
    if (updateEl) updateEl.textContent = 'Dernière mise à jour : --';

    // Clear signal UI and hide explanation
    const signalCursor = document.getElementById(`signal-cursor-${symbol}`);
    const signalValue = document.getElementById(`signal-value-${symbol}`);
    const signalDescription = document.getElementById(`signal-description-${symbol}`);
    if (signalCursor) signalCursor.style.left = '50%';
    if (signalValue) { signalValue.textContent = 'Neutre'; signalValue.style.color = '#a8a2ff'; }
    if (signalDescription) signalDescription.textContent = 'Pas de données pour cette période';

    const cardRoot = document.querySelector(`#card-${symbol}`);
    if (cardRoot) {
        const labelsEl = cardRoot.querySelector('.signal-labels');
        const barEl = cardRoot.querySelector('.signal-bar');
        const signalExplanation = cardRoot.querySelector('.signal-explanation');
        const explanationContent = cardRoot.querySelector('.explanation-content');
        if (labelsEl) labelsEl.classList.add('hidden-by-bot');
        if (barEl) barEl.classList.add('hidden-by-bot');
        if (signalExplanation) signalExplanation.classList.add('hidden-by-bot');
        if (explanationContent) explanationContent.innerHTML = '';
        // Hide the entire details and signal sections so they don't appear when no data
        const detailsTitle = cardRoot.querySelector('.details-title');
        if (detailsTitle) {
            detailsTitle.classList.add('hidden-by-bot');
            const detDate = detailsTitle.nextElementSibling;
            if (detDate && detDate.classList.contains('section-date')) detDate.classList.add('hidden-by-bot');
        }
        const infoGrid = cardRoot.querySelector('.info-grid');
        if (infoGrid) infoGrid.classList.add('hidden-by-bot');

        const signalTitle = cardRoot.querySelector('.signal-title');
        if (signalTitle) {
            signalTitle.classList.add('hidden-by-bot');
            const sigDate = signalTitle.nextElementSibling;
            if (sigDate && sigDate.classList.contains('section-date')) sigDate.classList.add('hidden-by-bot');
        }
        const signalContainer = cardRoot.querySelector('.signal-container');
        if (signalContainer) signalContainer.classList.add('hidden-by-bot');
    }
}

// Function to open a custom symbol not in JSON
export async function openCustomSymbol(symbol, type = 'equity') {
    if (positions[symbol]) {
        // Already exists, just switch to it
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
        const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
        if (tab) {
            tab.classList.add('active');
            const card = document.getElementById(`card-${symbol}`);
            if (card) card.classList.add('active');
        }
        fetchActiveSymbol(true);
        return;
    }

    // Create minimal stock object
    const stock = {
        symbol: symbol,
        ticker: symbol,
        name: symbol, // Will be updated if API provides name
        type: type,
        currency: 'USD',
        api_mapping: {},
        purchases: [],
        sales: []
    };

    // Create position
    positions[symbol] = {
        symbol: symbol,
        ticker: symbol,
        name: symbol,
        type: type,
        currency: 'USD',
        api_mapping: {},
        shares: 0,
        investment: 0,
        costBasis: 0,
        purchaseDate: null,
        purchases: [],
        news: [],
        lastNewsFetch: 0,
        chart: null,
        lastFetch: 0,
        lastData: null,
        currentPeriod: '1D'
    };

    lastApiBySymbol[symbol] = selectedApi;

    // Create tab in general section
    const hasGeneral = true; // Assume general for custom
    if (hasGeneral) {
        let genSection = document.getElementById(`general-section-${type}`);
        if (!genSection) {
            // Create section if not exists
            genSection = document.createElement('div');
            genSection.className = 'tab-type-section';
            genSection.id = `general-section-${type}`;
            const genTitle = document.createElement('div');
            genTitle.className = 'tab-type-title';
            const typeIcons = {
                equity: 'fa-solid fa-building-columns',
                commodity: 'fa-solid fa-coins',
                crypto: 'fa-brands fa-bitcoin',
            };
            const iconClass = typeIcons[type] || 'fa-solid fa-layer-group';
            const typeLabel = {
                equity: 'Actions',
                commodity: 'Matières Premières',
                crypto: 'Cryptos',
            }[type] || type.charAt(0).toUpperCase() + type.slice(1);
            genTitle.innerHTML = `<i class="${iconClass} type-icon"></i>${typeLabel}`;
            genSection.appendChild(genTitle);
            document.getElementById('general-tabs').appendChild(genSection);
        }
        createTab(stock, type);
    }

    // Create card
    createCard(stock);

    // Init chart
    initChart(symbol, positions);

    // Switch to it
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    const tab = document.querySelector(`.tab[data-symbol="${symbol}"]`);
    if (tab) {
        tab.classList.add('active');
        const card = document.getElementById(`card-${symbol}`);
        if (card) card.classList.add('active');
    }

    // Fetch data
    fetchActiveSymbol(true);
}