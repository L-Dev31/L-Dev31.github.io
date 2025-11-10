import { fetchFromPolygon } from './api/polygon.js'

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
        defaultApi: 'massive',
        validApis: enabledApis
      }
    };
    return API_CONFIG;
  } catch (error) {
    throw error;
  }
}

let selectedApi = 'massive'
const cacheKey = 'stockCache'
let stockCache = JSON.parse(localStorage.getItem(cacheKey) || '{}')
const lastApiBySymbol = {}
const positions = {}
let fastPollTimer = null
let initialFetchController = null
let mainFetchController = null
let rateLimitCountdownTimer = null

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
    fastPollTimer = setInterval(() => fetchActiveSymbol(false), 5000)
}

function stopFastPolling() {
    if (!fastPollTimer) return
    clearInterval(fastPollTimer)
    fastPollTimer = null
}

function startRateLimitCountdown(seconds) {
    // Arrêter le countdown précédent s'il existe
    if (rateLimitCountdownTimer) {
        clearInterval(rateLimitCountdownTimer);
        rateLimitCountdownTimer = null;
    }
    
    // Mettre l'indicateur en mode fetching avec spinner
    setApiStatus(null, 'fetching', { api: selectedApi, loadingFallback: true });
    
    // Attendre que setApiStatus ait terminé et ajouter le texte de countdown
    setTimeout(() => {
        const el = document.getElementById('api-status-indicator');
        if (el) {
            const spinner = el.querySelector('[data-role="spinner"]');
            if (spinner) {
                spinner.innerHTML = `<span class="api-spinner"></span><div class="countdown-text">Limite atteinte, veuillez patienter... (${seconds}s)</div>`;
            }
        }
        
        // Démarrer le countdown
        rateLimitCountdownTimer = setInterval(() => {
            const el = document.getElementById('api-status-indicator');
            if (el) {
                const countdownText = el.querySelector('.countdown-text');
                if (countdownText) {
                    let t = countdownText.textContent.match(/\((\d+)s\)/);
                    let s = t ? parseInt(t[1],10) : seconds;
                    if (s > 1) {
                        countdownText.textContent = `Limite atteinte, veuillez patienter... (${s-1}s)`;
                    } else {
                        countdownText.textContent = 'Limite atteinte, veuillez patienter... (0s)';
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

async function setApiStatus(symbol, status, opts = {}) {
    const config = await loadApiConfig();

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
    const expanded = content.querySelector('.api-expanded');
    if (expanded) {
        expanded.innerHTML = config.ui.validApis.map(api =>
            `<div class="api-option" data-api="${api}">${config.apis[api].name}</div>`
        ).join('');
    }
    const spinner = content.querySelector('[data-role="spinner"]');
    if (spinner && opts.loadingFallback) {
        // Ne pas remplacer le contenu si c'est déjà un countdown
        if (!spinner.querySelector('.countdown-text')) {
            spinner.style.display = 'flex';
            spinner.innerHTML = `<span class="api-spinner"></span>`;
        }
    }
    el.innerHTML = '';
    el.appendChild(content);
    el.title = symbol || '';
    el.className = 'api-status-indicator ' + status;
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

function initChart(symbol) {
    const canvas = document.getElementById(`chart-${symbol}`)
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const g = ctx.createLinearGradient(0,0,0,200)
    g.addColorStop(0,'rgba(168,162,255,0.3)')
    g.addColorStop(1,'rgba(168,162,255,0)')
    if (!window.Chart) return
    if (positions[symbol].chart) positions[symbol].chart.destroy()
    positions[symbol].chart = new Chart(ctx,{
        type:'line',
        data:{
            labels:[],
            datasets:[{
                label:'Prix',
                data:[],
                borderColor:'#a8a2ff',
                backgroundColor:g,
                borderWidth:2,
                fill:true,
                tension:0.4,
                pointRadius:0,
                pointHoverRadius:4
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            layout:{ padding:{ top:10, bottom:75, left:10, right:10 }},
            plugins:{
                legend:{ display:false },
                tooltip:{
                    enabled:true,
                    backgroundColor:'rgba(26,29,46,0.95)',
                    titleColor:'#a8a2ff',
                    bodyColor:'#e8e9f3',
                    borderColor:'rgba(168,162,255,0.2)',
                    borderWidth:1,
                    cornerRadius:4,
                    displayColors:false,
                    padding:12,
                    titleFont:{family:'Poppins', size:12, weight:'bold'},
                    bodyFont:{family:'Poppins', size:12},
                    callbacks:{
                        title:function(ctx){
                            return ctx[0].parsed.y.toFixed(2) + ' €'
                        },
                        label:function(ctx){
                            const i = ctx.dataIndex
                            const ts = ctx.chart.data.timestamps[i]
                            const d = new Date(ts*1000)
                            return [
                                d.toLocaleDateString('fr-FR'),
                                d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
                            ]
                        }
                    }
                }
            },
            scales:{
                x:{
                    grid:{ display:false },
                    ticks:{ color:'#6b7280', font:{size:8}}
                },
                y:{
                    position:'right',
                    grid:{ color:'rgba(168,162,255,0.05)', drawBorder:false},
                    ticks:{ color:'#6b7280', font:{size:8}, callback:v=>v.toFixed(1)+'€'}
                }
            },
            interaction:{ intersect:false, mode:'index' }
        }
    })
}

function updateChart(symbol, timestamps, prices) {
    const c = positions[symbol].chart
    if (!c || !timestamps) return
    const isLong = timestamps[timestamps.length-1]-timestamps[0] > 86400
    c.data.labels = timestamps.map(ts=>{
        const d = new Date(ts*1000)
        return isLong ? d.toLocaleDateString('fr-FR') : d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
    })
    c.data.datasets[0].data = prices
    c.data.timestamps = timestamps
    c.update('none')
}

async function fetchActiveSymbol(force) {
    const symbol = getActiveSymbol()
    if (!symbol || !positions[symbol]) return
    if (positions[symbol].isFetching) return
    if (!force && !shouldFetch(symbol)) {
        if (positions[symbol].lastData) updateUI(symbol,positions[symbol].lastData)
        return
    }

    if (mainFetchController) mainFetchController.abort()
    mainFetchController = new AbortController()
    const signal = mainFetchController.signal

    positions[symbol].isFetching=true

    setApiStatus(symbol, 'fetching', { api: selectedApi })

    try {
        const p = positions[symbol].currentPeriod||'1D'
        const name = positions[symbol].name||null
        let fetchFunc = async () => {
            const config = await loadApiConfig();
            const apiConfig = config.apis[selectedApi];
            if (!apiConfig || !apiConfig.enabled) {
                return { source: selectedApi, error: true, errorCode: 503, errorMessage: "API désactivée" };
            }
            return fetchFromPolygon(positions[symbol].ticker, p, symbol, null, name, signal, apiConfig.apiKey);
        };
        let d = await fetchFunc(positions[symbol].ticker, p, symbol, null, name, signal)
        
        positions[symbol].lastFetch=Date.now()
        positions[symbol].lastData=d
        updateUI(symbol,d)
        lastApiBySymbol[symbol]=d.source
        if (d && d.error && d.source) {
            setApiStatus(symbol, 'noinfo', { api: d.source, errorCode: d.errorCode });
        } else {
            setApiStatus(symbol, d ? 'active' : 'inactive', { api: selectedApi });
        }
        
        updatePortfolioSummary()
    } catch(e){
        setApiStatus(symbol, 'inactive', { api: selectedApi });
    }
    positions[symbol].isFetching=false
}

function getActiveSymbol() {
    const t = document.querySelector('.tab.active')
    return t? t.dataset.symbol:null
}

function shouldFetch(symbol) {
    const last = positions[symbol].lastFetch||0
    return Date.now()-last > 30000
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
    let fetchFunc = async () => {
        const config = await loadApiConfig();
        const apiConfig = config.apis[selectedApi];
        if (!apiConfig || !apiConfig.enabled) {
            return { source: selectedApi, error: true, errorCode: 503, errorMessage: "API désactivée" };
        }
        return fetchFromPolygon(positions[s].ticker,p,s,null,name, null, apiConfig.apiKey);
    };
    let d=await fetchFunc(positions[s].ticker,p,s,null,name)
    
    positions[s].lastFetch=Date.now()
    positions[s].lastData=d
    updateUI(s,d)
    setApiStatus(s, d ? 'active' : 'inactive', { api: selectedApi });
    
    updatePortfolioSummary()
})

function updateUI(symbol, data) {
    if (!data || data.error) {
        // Si throttling, afficher loading + message explicite
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

    if (data.timestamps && data.prices) {
        updateChart(symbol, data.timestamps, data.prices);
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

    const updateEl = document.getElementById(`update-center-${symbol}`);
    if (updateEl) {
        const now = new Date();
        const timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        updateEl.textContent = `Dernière mise à jour : ${timeString}`;
    }

    setApiStatus(symbol, 'active', { api: data.source });

    updatePortfolioSummary()
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

function updatePortfolioSummary() {
    let totalShares = 0;
    let totalInvestment = 0;

    Object.values(positions).forEach(pos => {
        totalShares += pos.shares || 0;
        totalInvestment += Math.abs(pos.investment || 0);
    });

    const totalSharesEl = document.getElementById('total-shares');
    const totalInvestmentEl = document.getElementById('total-investment');

    if (totalSharesEl) totalSharesEl.textContent = totalShares;
    if (totalInvestmentEl) totalInvestmentEl.textContent = totalInvestment.toFixed(2) + ' €';
}

async function loadStocks() {
    const config = await loadApiConfig();

    const r=await fetch('stocks.json')
    const list=await r.json()

    list.forEach(s=>{
        positions[s.symbol]={
            symbol:s.symbol,
            ticker:s.ticker,
            name:s.name,
            shares:s.shares||0,
            investment:s.investment||0,
            chart:null,
            lastFetch:0,
            lastData:null,
            currentPeriod:'1D'
        }
        if (stockCache[s.symbol]) positions[s.symbol].cachedData=stockCache[s.symbol]
        lastApiBySymbol[s.symbol]=selectedApi
        createTab(s)
        createCard(s)
    })

    Object.keys(positions).forEach(sym=>initChart(sym))

    const first=document.querySelector('.sidebar .tab')
    if (first) {
        first.classList.add('active')
        const sym=first.dataset.symbol
        document.getElementById(`card-${sym}`).classList.add('active')
        fetchActiveSymbol(true)
    }

    const open = Object.values(positions).find(p=>p.shares>0)

    setApiStatus(null, 'active', {api: selectedApi})

    updatePortfolioSummary()
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

// Exposer les fonctions pour polygon.js
window.startRateLimitCountdown = startRateLimitCountdown;
window.stopRateLimitCountdown = stopRateLimitCountdown;

function createTab(stock) {
    const t = document.getElementById('tab-template')
    if (!t) return
    const tab = t.content.firstElementChild.cloneNode(true)
    tab.dataset.symbol = stock.symbol
    tab.dataset.ticker = stock.ticker
    const img = tab.querySelector('img')
    img.src = `icon/${stock.symbol}.png`
    img.alt = stock.symbol
    img.onerror = function(){ this.parentElement.innerHTML = stock.symbol.slice(0,2) }
    tab.querySelector('.tab-name').textContent = stock.name || stock.symbol
    tab.querySelector('.tab-shares').textContent = `(${stock.shares})`
    const id = stock.shares>0 ? 'portfolio-tabs' : 'general-tabs'
    document.getElementById(id)?.appendChild(tab)
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

    const sh = card.querySelector('.important-shares span')
    sh.id = `shares-${stock.symbol}`
    sh.textContent = stock.shares

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
        tk.textContent = `${stock.ticker} · ${stock.symbol}`
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

    const tds = card.querySelectorAll('.card-table-td')
    if (tds.length===8) {
        tds[1].id=`invest-${stock.symbol}`
        const displayInvestment = stock.investment < 0 ? Math.abs(stock.investment) : stock.investment;
        tds[1].textContent = displayInvestment.toFixed(2)+' €'
        tds[2].id=`value-${stock.symbol}`
        tds[2].textContent='--'
        tds[3].id=`profit-${stock.symbol}`
        tds[3].textContent='--'
        tds[5].id=`invest-per-${stock.symbol}`
        const displayInvestPerShare = stock.shares ? (stock.investment < 0 ? Math.abs(stock.investment / stock.shares) : (stock.investment / stock.shares)) : 0;
        tds[5].textContent = stock.shares ? displayInvestPerShare.toFixed(2)+' €' : '--'
        tds[6].id=`value-per-${stock.symbol}`
        tds[6].textContent='--'
        tds[7].id=`profit-per-${stock.symbol}`
        tds[7].textContent='--'
    }

    const table = card.querySelector('.card-table-container')
    if (table && stock.shares===0) table.style.display='none'

    const invTitle = card.querySelector('.investment-title')
    if (invTitle) invTitle.style.display = stock.shares===0 ? 'none' : ''

    const info = card.querySelectorAll('.info-value')
    if (info.length===4) {
        info[0].id=`open-${stock.symbol}`
        info[1].id=`high-${stock.symbol}`
        info[2].id=`low-${stock.symbol}`
        info[3].id=`close-${stock.symbol}`
        info.forEach(el=>el.textContent='--')
    }

    document.getElementById('cards-container')?.appendChild(card)
}
