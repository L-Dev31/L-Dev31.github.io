// Add API reach status indicator
function setApiStatus(symbol, status) {
    let el = document.getElementById('api-status-indicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'api-status-indicator';
        document.body.appendChild(el);
    }
    // Minimal text; symbol available as hover title
    el.textContent = status === 'active' ? 'API ACTIF' : 'API INACTIF';
    el.title = symbol || '';
    el.className = 'api-status-indicator ' + status;
}
let positions = {}; // populated from stocks.json

function isMarketOpen() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const time = hour + minute / 60;
    return day !== 0 && day !== 6 && time >= 9 && time <= 17.5;
}

function initChart(symbol) {
    const canvas = document.getElementById(`chart-${symbol}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(168, 162, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(168, 162, 255, 0)');

    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library is not loaded');
        return;
    }

    // If a Chart instance already exists for this symbol, destroy it first
    if (positions[symbol] && positions[symbol].chart) {
        try {
            positions[symbol].chart.destroy();
        } catch (e) {
            // ignore
        }
    }

    positions[symbol].chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Prix',
                data: [],
                borderColor: '#a8a2ff',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#a8a2ff',
                pointHoverBorderColor: '#e8e9f3',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(26, 29, 46, 0.95)',
                    titleColor: '#a8a2ff',
                    bodyColor: '#e8e9f3',
                    borderColor: 'rgba(168, 162, 255, 0.2)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: (context) => context.parsed.y.toFixed(2) + ' €'
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        color: '#6b7280',
                        maxTicksLimit: 6,
                        font: { size: 10 }
                    }
                },
                y: {
                    display: true,
                    position: 'right',
                    grid: {
                        color: 'rgba(168, 162, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6b7280',
                        callback: (value) => value.toFixed(2) + '€',
                        font: { size: 10 }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

async function fetchStockData(ticker, period = '1D') {
    try {
        const API_KEY = 'bc2f0dc8b2c95f4982bbf92b579f933e';

        // 1D -> no intraday on free Marketstack; mock using latest close
        if (period === '1D') {
            const EOD_URL = `https://api.marketstack.com/v1/eod/latest?access_key=${API_KEY}&symbols=${ticker}`;
            const eodResponse = await fetch(EOD_URL);
            if (!eodResponse.ok) {
                if (eodResponse.status === 429) {
                    console.warn('Rate limit reached for', ticker);
                    return null;
                }
                throw new Error(`EOD error: ${eodResponse.status}`);
            }
            const eodData = await eodResponse.json();
            if (eodData.data && eodData.data.length > 0) {
                const result = eodData.data[0];
                const price = result.close;
                const mockPrices = [price * 0.985, price * 0.995, price * 1.01, price];
                const nowSec = Math.floor(Date.now() / 1000);
                const mockTimestamps = [nowSec - 60 * 60 * 3, nowSec - 60 * 60 * 2, nowSec - 60 * 60, nowSec];
                return {
                    price: price,
                    change: 0,
                    changePercent: 0,
                    open: result.open || price,
                    high: result.high || price,
                    low: result.low || price,
                    previousClose: result.close || price,
                    timestamps: mockTimestamps,
                    prices: mockPrices
                };
            }
            throw new Error('Invalid data from Marketstack');
        }

        // For multi-day ranges use EOD historic endpoint
        function formatDate(d) { return d.toISOString().slice(0,10); }
        const to = new Date();
        const from = new Date();
        switch (period) {
            case '5D': from.setDate(to.getDate() - 7); break;
            case '1M': from.setMonth(to.getMonth() - 1); break;
            case '6M': from.setMonth(to.getMonth() - 6); break;
            case '1Y': from.setFullYear(to.getFullYear() - 1); break;
            default: from.setMonth(to.getMonth() - 1);
        }
        const date_from = formatDate(from);
        const date_to = formatDate(to);

        const HIST_URL = `https://api.marketstack.com/v1/eod?access_key=${API_KEY}&symbols=${ticker}&date_from=${date_from}&date_to=${date_to}&limit=1000&sort=asc`;
        const resp = await fetch(HIST_URL);
        if (!resp.ok) {
            if (resp.status === 429) {
                console.warn('Rate limit reached for', ticker);
                return null;
            }
            throw new Error(`EOD range error: ${resp.status}`);
        }
        const data = await resp.json();
        if (!data.data || !data.data.length) throw new Error('No historical data');

        const timestamps = data.data.map(d => Math.floor(new Date(d.date).getTime() / 1000));
        const prices = data.data.map(d => d.close);
        const last = data.data[data.data.length - 1];
        return {
            price: last.close,
            open: last.open || last.close,
            high: Math.max(...data.data.map(x => x.high || x.close)),
            low: Math.min(...data.data.map(x => x.low || x.close)),
            previousClose: data.data.length > 1 ? data.data[data.data.length - 2].close : last.close,
            timestamps: timestamps,
            prices: prices
        };
    } catch (error) {
        console.error('Error fetching stock data:', error);
        return null;
    }
}

function updateChart(symbol, timestamps, prices) {
    const chart = positions[symbol].chart;
    if (!chart || !timestamps || !timestamps.length) return;

    let labels;
    if (timestamps.length >= 2 && (timestamps[timestamps.length-1] - timestamps[0]) > 24*60*60) {
        // multi-day range -> show dates
        labels = timestamps.map(ts => new Date(ts * 1000).toLocaleDateString('fr-FR'));
    } else {
        labels = timestamps.map(ts => {
            const date = new Date(ts * 1000);
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        });
    }

    chart.data.labels = labels;
    chart.data.datasets[0].data = prices;
    chart.update('none');
}

function updateUI(symbol, stockData) {
    if (!stockData) return;
    const pos = positions[symbol];

    const sharesEl = document.getElementById(`shares-${symbol}`);
    if (sharesEl) sharesEl.textContent = pos.shares;
    const tickerEl = document.getElementById(`ticker-${symbol}`);
    if (tickerEl) tickerEl.textContent = pos.ticker;

    const flagEl = document.getElementById(`flag-${symbol}`);
    if (flagEl) {
        const country = flagEl.dataset.country;
        if (country) flagEl.src = `flag/${country.toLowerCase()}.png`;
    }

    const logoEl = document.getElementById(`logo-${symbol}`);
    if (logoEl) {
        const sym = logoEl.dataset.symbol || symbol;
        logoEl.src = `logo/${sym}.png`;
        logoEl.onerror = function() { this.parentElement.innerHTML = sym.slice(0,2); };
    }

    const currentValue = stockData.price * pos.shares;
    const valueEl = document.getElementById(`value-${symbol}`);
    if (valueEl) valueEl.textContent = currentValue.toFixed(2) + ' €';

    const investEl = document.getElementById(`invest-${symbol}`);
    if (investEl) investEl.textContent = pos.investment.toFixed(2) + ' €';

    const profitEl = document.getElementById(`profit-${symbol}`);
    if (profitEl) {
        const profit = currentValue - pos.investment;
        const sign = profit >= 0 ? '+' : '';
        profitEl.textContent = `${sign}${profit.toFixed(2)} €`;
        profitEl.classList.remove('profit-positive', 'profit-negative', 'profit-neutral');
        if (profit > 0) profitEl.classList.add('profit-positive');
        else if (profit < 0) profitEl.classList.add('profit-negative');
        else profitEl.classList.add('profit-neutral');
    }

    const totalGain = currentValue - pos.investment;
    const totalGainPercent = pos.investment ? (totalGain / pos.investment) * 100 : 0;
    const perfEl = document.getElementById(`perf-${symbol}`);
    if (perfEl) {
        let cls = 'neutral';
        let sign2 = '';
        if (totalGain > 0) { cls = 'positive'; sign2 = '+'; }
        else if (totalGain < 0) cls = 'negative';
        perfEl.textContent = `${sign2}${totalGainPercent.toFixed(2)}%`;
        perfEl.className = 'performance-value ' + cls;
    }

    const openEl = document.getElementById(`open-${symbol}`);
    const highEl = document.getElementById(`high-${symbol}`);
    const lowEl = document.getElementById(`low-${symbol}`);
    const prevEl = document.getElementById(`prev-${symbol}`);
    if (openEl) openEl.textContent = (stockData.open || 0).toFixed(2) + ' €';
    if (highEl) highEl.textContent = (stockData.high || 0).toFixed(2) + ' €';
    if (lowEl) lowEl.textContent = (stockData.low || 0).toFixed(2) + ' €';
    if (prevEl) prevEl.textContent = (stockData.previousClose || 0).toFixed(2) + ' €';

    updateChart(symbol, stockData.timestamps, stockData.prices);

    const updateEl = document.getElementById(`update-${symbol}`);
    if (updateEl) updateEl.textContent = `Dernière mise à jour : ${new Date().toLocaleTimeString('fr-FR')}`;
}

function refresh() { return; }

function createTab(stock) {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.symbol = stock.symbol;
    tab.dataset.ticker = stock.ticker;

    const logo = document.createElement('div');
    logo.className = 'tab-logo';
    const img = document.createElement('img');
    img.src = `icon/${stock.symbol}.png`;
    img.alt = stock.symbol;
    img.onerror = function() { this.parentElement.innerHTML = stock.symbol.slice(0,2); };
    logo.appendChild(img);

    const info = document.createElement('div');
    info.className = 'tab-info';
    const name = document.createElement('div');
    name.className = 'tab-name';
    name.textContent = stock.symbol;
    const shares = document.createElement('div');
    shares.className = 'tab-shares';
    shares.textContent = `${stock.shares} actions`;
    info.appendChild(name);
    info.appendChild(shares);

    tab.appendChild(logo);
    tab.appendChild(info);
    
    const tabsContainer = document.getElementById('tabs');
    if (tabsContainer) {
        tabsContainer.appendChild(tab);
    }
}

function createCard(stock) {
    const container = document.createElement('div');
    container.className = 'card';
    container.id = `card-${stock.symbol}`;

    // Ensure investment is defined
    const investment = stock.investment || 0;

    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:16px;">
            <div class="logo">
                <img id="logo-${stock.symbol}" data-symbol="${stock.symbol}" src="logo/${stock.symbol}.png" alt="${stock.symbol}" />
            </div>
        </div>

        <div style="margin-bottom:20px;">
            <div class="general-row important-shares">Actions détenues : <span id="shares-${stock.symbol}">${stock.shares}</span></div>
            <div class="general-row"><strong>ISIN</strong> : <span id="isin-${stock.symbol}">${stock.isin || ''}</span></div>
            <div class="general-row"><strong>Ticker</strong> : <span id="ticker-${stock.symbol}">${stock.ticker}</span></div>
                <div class="general-row" style="display: flex; align-items: center;"><strong>Pays</strong> : <span style="margin-left:4px; margin-right:4px;">${stock.country || ''}</span><img id="flag-${stock.symbol}" data-country="${stock.country || ''}" src="flag/${(stock.country||'').toLowerCase()}.png" alt="${stock.country || ''}" style="width:16px; height:auto; vertical-align:middle; border-radius:2px; outline:1px solid #a8a2ff;"/>
            </div>
        </div>

        <div class="chart-container" style="margin-bottom:20px;">
            <div class="chart-header">Graphique</div>
            <div id="periods-${stock.symbol}" class="periods-group">
                <button class="period-btn active" data-symbol="${stock.symbol}" data-period="1D">1D</button>
                <button class="period-btn" data-symbol="${stock.symbol}" data-period="5D">5D</button>
                <button class="period-btn" data-symbol="${stock.symbol}" data-period="1M">1M</button>
                <button class="period-btn" data-symbol="${stock.symbol}" data-period="6M">6M</button>
                <button class="period-btn" data-symbol="${stock.symbol}" data-period="1Y">1Y</button>
            </div>
            <canvas class="chart-canvas" id="chart-${stock.symbol}" style="height:220px; max-height:260px; width:100%;"></canvas>
        </div>

        <div class="performance" style="margin-bottom:20px;">
            <div class="performance-label">Performance</div>
            <div class="performance-value" id="perf-${stock.symbol}">--</div>
        </div>

        <div class="update-time" id="update-${stock.symbol}">Dernière mise à jour : --</div>

        <div style="margin-bottom:20px;">
            <table style="width:100%; border-collapse:collapse; background:rgba(168,162,255,0.05); border-radius:12px; overflow:hidden;">
                <thead>
                    <tr style="background:rgba(168,162,255,0.08);">
                        <th style="padding:10px; color:#a8a2ff; font-size:13px; text-align:left;">Investi</th>
                        <th style="padding:10px; color:#a8a2ff; font-size:13px; text-align:left;">Valeur actuelle</th>
                        <th style="padding:10px; color:#a8a2ff; font-size:13px; text-align:left;">Bénéfice/Déficit</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding:10px; color:#e8e9f3; font-size:16px;" id="invest-${stock.symbol}">${investment.toFixed(2)} €</td>
                        <td style="padding:10px; color:#e8e9f3; font-size:16px;" id="value-${stock.symbol}">--</td>
                        <td style="padding:10px; color:#e8e9f3; font-size:16px;" id="profit-${stock.symbol}">--</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Ouverture</div>
                <div class="info-value" id="open-${stock.symbol}">--</div>
            </div>
            <div class="info-item">
                <div class="info-label">Plus Haut</div>
                <div class="info-value" id="high-${stock.symbol}">--</div>
            </div>
            <div class="info-item">
                <div class="info-label">Plus Bas</div>
                <div class="info-value" id="low-${stock.symbol}">--</div>
            </div>
            <div class="info-item">
                <div class="info-label">Clôture Préc.</div>
                <div class="info-value" id="prev-${stock.symbol}">--</div>
            </div>
        </div>
    `;

    const cardsContainer = document.getElementById('cards-container');
    if (cardsContainer) {
        cardsContainer.appendChild(container);
    }
}

function getActiveSymbol() {
    const activeTab = document.querySelector('.tab.active');
    return activeTab ? activeTab.dataset.symbol : null;
}

function shouldFetch(symbol) {
    if (!symbol || !positions[symbol]) return false;
    const last = positions[symbol].lastFetch || 0;
    const interval = (positions[symbol].fetchIntervalMinutes || 15) * 60 * 1000;
    return (Date.now() - last) > interval;
}

async function fetchActiveSymbol(force = false) {
    const symbol = getActiveSymbol();
    if (!symbol) return;

    if (!force && !shouldFetch(symbol)) {
        if (positions[symbol].lastData) updateUI(symbol, positions[symbol].lastData);
        return;
    }

    try {
        const period = positions[symbol].currentPeriod || '1D';
        const data = await fetchStockData(positions[symbol].ticker, period);
        positions[symbol].lastFetch = Date.now();
        positions[symbol].lastData = data;
        updateUI(symbol, data);
        setApiStatus(symbol, data ? 'active' : 'inactive');
    } catch (err) {
        console.error('fetchActiveSymbol error for', symbol, err);
        setApiStatus(symbol, 'inactive');
    }
}

// Add event listener with null check
const tabsElement = document.getElementById('tabs');
if (tabsElement) {
    tabsElement.addEventListener('click', async (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        const symbol = tab.dataset.symbol;
        // toggle active classes
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const card = document.getElementById(`card-${symbol}`);
        if (card) card.classList.add('active');

        // Ensure the period buttons reflect the stored currentPeriod for this symbol
        try {
            const period = positions[symbol] && positions[symbol].currentPeriod ? positions[symbol].currentPeriod : '1D';
            const group = document.getElementById(`periods-${symbol}`);
            if (group) {
                group.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                const btn = group.querySelector(`.period-btn[data-period="${period}"]`);
                if (btn) btn.classList.add('active');
            }
        } catch (err) {
            // ignore errors
        }

        // Force a fresh fetch when switching tabs so the visible card is up-to-date
        await fetchActiveSymbol(true);
    });
}

// Period button handling (delegated)
const cardsElement = document.getElementById('cards-container');
if (cardsElement) {
    cardsElement.addEventListener('click', async (e) => {
        const btn = e.target.closest && e.target.closest('.period-btn');
        if (!btn) return;
        const symbol = btn.dataset.symbol;
        const period = btn.dataset.period;

        // update button styles in the period group
        const group = document.getElementById(`periods-${symbol}`);
        if (group) {
            group.querySelectorAll('.period-btn').forEach(b => {
                b.classList.remove('active');
            });
            btn.classList.add('active');
        }

        if (!positions[symbol]) return;
        positions[symbol].currentPeriod = period;
        // fetch data for this symbol & period and update UI
        try {
            const data = await fetchStockData(positions[symbol].ticker, period);
            positions[symbol].lastFetch = Date.now();
            positions[symbol].lastData = data;
            updateUI(symbol, data);
            setApiStatus(symbol, data ? 'active' : 'inactive');
        } catch (err) {
            console.error('Error fetching period data for', symbol, err);
            setApiStatus(symbol, 'inactive');
        }
    });
}

async function loadStocksAndBuildUI() {
    try {
        const resp = await fetch('stocks.json');
        if (!resp.ok) {
            throw new Error(`Failed to load stocks.json: ${resp.status}`);
        }
        const list = await resp.json();
        
        for (const s of list) {
            // Ensure all required properties are defined
            if (!s.symbol) {
                console.warn('Stock entry missing symbol:', s);
                continue;
            }
            
            positions[s.symbol] = {
                ticker: s.ticker || s.symbol,
                shares: s.shares || 0,
                investment: s.investment || 0,
                chart: null,
                lastFetch: 0,
                lastData: null,
                fetchIntervalMinutes: s.fetchIntervalMinutes || 15,
                currentPeriod: '1D'
            };
            createTab(s);
            createCard(s);
        }

        // Initialize charts after a short delay to ensure DOM is ready
        setTimeout(() => {
            for (const symbol in positions) {
                initChart(symbol);
            }
        }, 100);

        const firstTab = document.querySelector('#tabs .tab');
        if (firstTab) {
            firstTab.classList.add('active');
            const sym = firstTab.dataset.symbol;
            const firstCard = document.getElementById(`card-${sym}`);
            if (firstCard) firstCard.classList.add('active');
            await fetchActiveSymbol(true);
        }

        setInterval(() => fetchActiveSymbol(false), 60 * 1000);
    } catch (err) {
        console.error('Failed to load stocks.json', err);
        // Display error message to user
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-message';
        errorContainer.textContent = 'Failed to load stock data. Please refresh the page.';
        errorContainer.style.padding = '20px';
        errorContainer.style.color = '#ff6b6b';
        errorContainer.style.textAlign = 'center';
        
        const container = document.getElementById('cards-container');
        if (container) {
            container.appendChild(errorContainer);
        }
    }
}

window.addEventListener('load', () => {
    loadStocksAndBuildUI();
});