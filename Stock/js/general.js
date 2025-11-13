import { fetchFromYahoo } from './api/yahoo-finance.js'
import { fetchFromPolygon } from './api/polygon.js'
import { fetchFromTwelveData } from './api/twelve.js'
import { fetchFromMarketstack } from './api/marketstack.js'
import { fetchFromAlphaVantage } from './api/alphavantage.js'
import { fetchFromFinnhub } from './api/finnhub.js'
import rateLimiter from './rate-limiter.js'
import { initChart, updateChart } from './chart.js'

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

async function loadApiConfig() {
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
let lastApiBySymbol = {};
let mainFetchController = null;
let initialFetchController = null;
let fastPollTimer = null;
let rateLimitCountdownTimer = null;

async function fetchUsdToEurRate() {
  if (usdToEurRate !== null) return usdToEurRate;
  
  try {
    const apiConfig = await loadApiConfig();
    const api = apiConfig.apis['massive'];
    if (!api || !api.enabled) return 1;
    
    const url = `https://api.polygon.io/v2/aggs/ticker/C:EURUSD/range/1/day/2025-11-01/2025-11-10?apiKey=${api.apiKey}`;
    const r = await fetch(url);
    if (r.ok) {
      const j = await r.json();
      if (j.results && j.results.length > 0) {
        usdToEurRate = j.results[j.results.length - 1].c;
        console.log(`💱 Taux USD/EUR récupéré: ${usdToEurRate}`);
        return usdToEurRate;
      }
    }
  } catch (e) {
    console.warn('Erreur récupération taux USD/EUR:', e.message);
  }
  
  usdToEurRate = 0.9; // fallback approximatif
  return usdToEurRate;
}

async function setSelectedApi(api) {
    const config = await loadApiConfig();

    if (!config.ui.validApis.includes(api)) return

    if (mainFetchController) {
        mainFetchController.abort()
        mainFetchController = null
    }
    if (initialFetchController) {
        initialFetchController.abort()
        initialFetchController = null
    }

    stopFastPolling()

    selectedApi = api

    const activeSymbol = getActiveSymbol()
    if (activeSymbol) {
        resetSymbolDisplay(activeSymbol)
    }

    const indicator = document.getElementById('api-status-indicator');
    if (indicator) {
        const text = indicator.querySelector('[data-role="status-text"]');
        if (text) text.textContent = 'loading...';
        const dot = indicator.querySelector('.api-dot');
        if (dot) {
            dot.className = 'api-dot fetching';
        }
        const logo = indicator.querySelector('.api-indicator-logo');
        if (logo) {
            const apiConfig = config.apis[api];
            logo.src = apiConfig.logo;
        }
    }
    updateDropdownSelection()

    if (activeSymbol) {
        setApiStatus(activeSymbol, 'fetching', { api: selectedApi })
    }

    fetchActiveSymbol(true)
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
                // Only render the spinner here; the countdown text is managed
                // by updateApiCountdown which creates a single wrapper inside
                // the spinner row. Avoid injecting a second .countdown-text.
                spinner.innerHTML = `<span class="api-spinner"></span>`;
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
                    spinner.innerHTML = `<span class="api-spinner"></span>`;
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
        spinner.style.display = 'flex';
        el.appendChild(spinner);
    }

    // create or find the countdown wrapper placed below the status text
    // prefer using the dedicated spinner row already present in the template
    const spinnerRow = el.querySelector('[data-role="spinner"]');
    if (spinnerRow) {
        spinnerRow.style.display = 'flex';
        spinnerRow.style.flexDirection = 'column';
        spinnerRow.style.alignItems = 'center';
        spinnerRow.style.gap = '6px';

        // Clear existing spinner area to avoid duplicates, then create
        // a single horizontal wrapper where the countdown text sits
        // to the left and the spinner to the right.
        spinnerRow.innerHTML = '';
        let wrapper = document.createElement('div');
        wrapper.className = 'api-countdown-wrapper';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'row';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '8px';

        const textElem = document.createElement('div');
        textElem.className = 'countdown-text';
        textElem.style.margin = '0';
        textElem.textContent = `Limite atteinte, veuillez patienter... (${seconds}s)`;

        const spinnerElem = document.createElement('div');
        spinnerElem.className = 'api-spinner-wrapper';
        spinnerElem.innerHTML = `<span class="api-spinner"></span>`;

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
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'row';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '8px';
        wrapper.style.marginTop = '6px';

        const textElem = document.createElement('div');
        textElem.className = 'countdown-text';
        textElem.style.margin = '0';
        textElem.textContent = `Limite atteinte, veuillez patienter... (${seconds}s)`;

        const spinnerElem = document.createElement('div');
        spinnerElem.className = 'api-spinner-wrapper';
        spinnerElem.innerHTML = `<span class="api-spinner"></span>`;

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
        expanded.innerHTML = config.ui.validApis.map(api =>
            `<div class="api-option" data-api="${api}">${config.apis[api].name}</div>`
        ).join('');
    }
    const spinner = content.querySelector('[data-role="spinner"]');
    if (spinner && opts.loadingFallback) {
        spinner.style.display = 'flex';
        if (!spinner.querySelector('.api-spinner')) {
            spinner.innerHTML = `<span class="api-spinner"></span>`;
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

    setApiStatus(symbol, 'fetching', { api: selectedApi })

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
        document.querySelectorAll('.card').forEach(x=>x.classList.remove('active'))
        t.classList.add('active')
        const sym=t.dataset.symbol
        const cd=document.getElementById(`card-${sym}`)
        if (cd) cd.classList.add('active')
        fetchActiveSymbol(true)
    }
})

document.getElementById('cards-container')?.addEventListener('click', async e=>{
    const b=e.target.closest('.period-btn')
    if (!b) return
    const s=b.dataset.symbol
    const p=b.dataset.period
    positions[s].currentPeriod=p
    const g=document.getElementById(`periods-${s}`)
    if (g) g.querySelectorAll('.period-btn').forEach(x=>x.classList.remove('active'))
    b.classList.add('active')
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
})

async function updateUI(symbol, data) {
    if (!data || data.error) {
        if (data && data.throttled) {
            // Rate limit - don't update UI, just show status
            setApiStatus(symbol, 'fetching', { api: data?.source, loadingFallback: true, errorCode: 429 });
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
        setApiStatus(symbol, 'noinfo', { api: data?.source, errorCode: data?.errorCode });
        return;
    }

    // Conversion USD→EUR supprimée, désormais gérée dans polygon.js

    if (data.timestamps && data.prices) {
        updateChart(symbol, data.timestamps, data.prices, positions, data.source);
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
                valueEl.className = totalValue >= Math.abs(investment) ? 'positive' : 'negative';
            }

            if (valuePerEl) {
                valuePerEl.textContent = currentPrice.toFixed(2) + ' €';
                valuePerEl.className = currentPrice >= (Math.abs(investment) / shares) ? 'positive' : 'negative';
            }

            const totalProfit = totalValue - Math.abs(investment);
            if (profitEl) {
                profitEl.textContent = `${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} €`;
                profitEl.className = totalProfit >= 0 ? 'positive' : 'negative';
            }

            const profitPerShare = currentPrice - (Math.abs(investment) / shares);
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

    setApiStatus(symbol, 'active', { api: data.source });

    updatePortfolioSummary();
    
    // Mettre à jour le titre du tab avec la nouvelle date
    updateTabTitle(symbol);
    
    // Mettre à jour le titre de la carte avec la nouvelle date
    updateCardTitle(symbol);
    // Mettre à jour les dates sous les sections (cours, investissement, details)
    try { updateSectionDates(symbol); } catch (e) { /* ignore */ }
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
}

function updatePortfolioSummary() {
    let totalShares = 0;
    let totalInvestment = 0;
    let cashAccount = 116.31; // Valeur statique du compte titre

    Object.values(positions).forEach(pos => {
        totalShares += pos.shares || 0;
        totalInvestment += Math.abs(pos.investment || 0);
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
            portTitle.innerHTML = `<i class="${iconClass}" style="margin-right:7px;"></i>${typeLabel}`;
            portSection.appendChild(portTitle);
            document.getElementById('portfolio-tabs').appendChild(portSection);
        }
        if (hasGeneral) {
            const genSection = document.createElement('div');
            genSection.className = 'tab-type-section';
            genSection.id = `general-section-${type}`;
            const genTitle = document.createElement('div');
            genTitle.className = 'tab-type-title';
            genTitle.innerHTML = `<i class="${iconClass}" style="margin-right:7px;"></i>${typeLabel}`;
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
            purchaseDate: calculated.purchaseDate,
            purchases: s.purchases || [],
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
}

const font=document.createElement('link')
font.id='poppins-font'
font.rel='stylesheet'
font.href='https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
document.head.appendChild(font)

window.addEventListener('load', async () => {
    await loadStocks();
    const active = getActiveSymbol();
});

window.startRateLimitCountdown = startRateLimitCountdown;
window.stopRateLimitCountdown = stopRateLimitCountdown;
window.startGlobalRateLimitCountdown = startGlobalRateLimitCountdown;
window.stopGlobalRateLimitCountdown = stopGlobalRateLimitCountdown;

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
    
    if (stock.purchases && stock.purchases.length > 0) {
        totalInvestment = stock.purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
        totalShares = stock.purchases.reduce((sum, p) => sum + (p.shares || 0), 0);
        const dates = stock.purchases.map(p => p.date).filter(d => d).sort();
        earliestPurchaseDate = dates.length > 0 ? dates[0] : null;
    }

    if (stock.sales && stock.sales.length > 0) {
        totalInvestment += stock.sales.reduce((sum, s) => sum + (s.amount || 0), 0);
        totalShares -= stock.sales.reduce((sum, s) => sum + (s.shares || 0), 0);
    }
    
    return {
        investment: totalInvestment,
        shares: totalShares,
        purchaseDate: earliestPurchaseDate
    };
}

function createTab(stock, type) {
    const t = document.getElementById('tab-template');
    if (!t) return;
    const tab = t.content.firstElementChild.cloneNode(true);
    tab.dataset.symbol = stock.symbol;
    tab.dataset.ticker = stock.ticker;
    const img = tab.querySelector('img');
    img.src = `icon/${stock.symbol}.png`;
    img.alt = stock.symbol;
    img.onerror = function () { this.parentElement.innerHTML = stock.symbol.slice(0, 2); };
    
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
    logo.onerror = function(){ this.parentElement.innerHTML = stock.symbol.slice(0,2) }

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

    // Remplir les valeurs si on possède des actions
    if (calculated.shares > 0) {
        const displayInvestment = calculated.investment < 0 ? Math.abs(calculated.investment) : calculated.investment;
        tds[1].textContent = displayInvestment.toFixed(2)+' €'
        tds[2].textContent='--'
        tds[3].textContent='--'
        const displayInvestPerShare = calculated.shares ? (calculated.investment < 0 ? Math.abs(calculated.investment / calculated.shares) : (calculated.investment / calculated.shares)) : 0;
        tds[5].textContent = calculated.shares ? displayInvestPerShare.toFixed(2)+' €' : '--'
        tds[6].textContent='--'
        tds[7].textContent='--'
    }

    // Masquer le tableau d'investissement si on ne possède plus d'actions
    const cardTableContainer = card.querySelector('.card-table-container')
    if (cardTableContainer) {
        cardTableContainer.style.display = calculated.shares === 0 ? 'none' : '';
    }

    // Masquer le titre et la date de la section investissement si on ne possède plus d'actions
    const investmentTitle = card.querySelector('.investment-title')
    if (investmentTitle) {
        investmentTitle.style.display = calculated.shares === 0 ? 'none' : '';
        const investmentDate = investmentTitle.nextElementSibling;
        if (investmentDate && investmentDate.classList.contains('section-date')) {
            investmentDate.style.display = calculated.shares === 0 ? 'none' : '';
        }
    }

    // Masquer toute la section investissement seulement s'il n'y a jamais eu de transactions
    const investmentSection = card.querySelector('.investment-section')
    if (investmentSection) {
        const hasTransactions = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);
        investmentSection.style.display = hasTransactions ? '' : 'none';
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
        const hasTransactions = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);
        transactionTitle.style.display = hasTransactions ? '' : 'none';
    }

    // Masquer le conteneur complet du tableau des transactions seulement s'il n'y a jamais eu de transactions
    const transactionContainer = card.querySelector('.transaction-history-container')
    if (transactionContainer) {
        const hasTransactions = (stock.purchases && stock.purchases.length > 0) || (stock.sales && stock.sales.length > 0);
        transactionContainer.style.display = hasTransactions ? '' : 'none';
        const tbody = card.querySelector('.transaction-history-body');
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
            tbody.innerHTML = transactions.map(t => `
                <tr class="${t.type === 'Achat' ? 'transaction-buy' : 'transaction-sell'}">
                    <td>${new Date(t.date).toLocaleDateString('fr-FR')}</td>
                    <td>${t.type}</td>
                    <td>${Math.abs(t.amount).toFixed(2)} €</td>
                    <td>${t.shares}</td>
                    <td>${(Math.abs(t.amount) / t.shares).toFixed(2)} €</td>
                </tr>
            `).join('');
        }
    }

    document.getElementById('cards-container')?.appendChild(card)
}