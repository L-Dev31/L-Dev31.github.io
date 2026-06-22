import { positions, selectedApi, lastApiBySymbol, getCurrency, globalPeriod, getUserSettings } from './state.js';
import { fetchActiveSymbol } from './general.js';
import { fetchYahooSparkBatch, getYahooSymbol, isYahooSparkFriendly, fetchYahooPeriodChanges } from './yahoo-finance.js';
import { TYPE_ORDER, typeLabel, typeIcon } from './constants.js';
import { createTab, createCard, updateSectionDates, initChart, markTabAsSuspended, unmarkTabAsSuspended, isSymbolSuspendedInStorage, updateSidebarPerformance, getActiveSymbol, updateUI } from './ui.js';
import { getEl, formatCurrency, formatPct } from './utils.js';
import { initAnalysisPane, renderAnalysisPane } from './portfolio-analysis.js';



const setText = (id, value) => {
    const el = getEl(id);
    if (el) el.textContent = value;
};

export function calculateStockValues(stock) {
    let earliestPurchaseDate = stock.purchaseDate;
    let lots = [];
    let initialInvestment = stock.investment || 0;

    if (stock.purchases && stock.purchases.length > 0) {
        const dates = stock.purchases.map(p => p.date).filter(d => d).sort();
        earliestPurchaseDate = dates.length > 0 ? dates[0] : null;
        lots = stock.purchases.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map(p => ({
            shares: p.shares || 0,
            amount: Math.abs(p.amount || 0),
            perShare: ((Math.abs(p.amount || 0)) / (p.shares || 1))
        }));
    } else if (stock.shares > 0) {
        const initialCost = Math.abs(initialInvestment);
        lots.push({ shares: stock.shares || 0, amount: initialCost, perShare: initialCost / (stock.shares || 1) });
    }

    let costBasis = lots.reduce((sum, l) => sum + l.amount, 0);
    let realizedPL = 0;

    if (stock.sales && stock.sales.length > 0) {
        const salesSorted = stock.sales.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        salesSorted.forEach(s => {
            let remainingToRemove = s.shares || 0;
            let costOfSoldShares = 0;
            while (remainingToRemove > 0 && lots.length > 0) {
                const lot = lots[0];
                if (lot.shares <= remainingToRemove) {
                    remainingToRemove -= lot.shares;
                    costOfSoldShares += lot.amount;
                    lots.shift();
                } else {
                    const removedShares = remainingToRemove;
                    const removedAmount = lot.perShare * removedShares;
                    lot.shares -= removedShares;
                    lot.amount -= removedAmount;
                    costOfSoldShares += removedAmount;
                    remainingToRemove = 0;
                }
            }
            realizedPL += (s.amount || 0) - costOfSoldShares;
        });
    }

    const totalShares = lots.reduce((sum, l) => sum + l.shares, 0);
    costBasis = lots.reduce((sum, l) => sum + l.amount, 0);

    return {
        investment: stock.investment || 0, // original
        shares: totalShares,
        costBasis: Math.max(0, costBasis),
        purchaseDate: earliestPurchaseDate,
        realizedPL: realizedPL
    };
}

let lastCompositionHash = '';

const CONTINENT_MAP = {
    AF:'Africa', AO:'Africa', BJ:'Africa', BW:'Africa', BF:'Africa', BI:'Africa', CM:'Africa', CV:'Africa',
    CF:'Africa', TD:'Africa', KM:'Africa', CG:'Africa', CD:'Africa', DJ:'Africa', EG:'Africa', GQ:'Africa',
    ER:'Africa', ET:'Africa', GA:'Africa', GM:'Africa', GH:'Africa', GN:'Africa', GW:'Africa', CI:'Africa',
    KE:'Africa', LS:'Africa', LR:'Africa', LY:'Africa', MG:'Africa', MW:'Africa', ML:'Africa', MR:'Africa',
    MU:'Africa', MA:'Africa', MZ:'Africa', NA:'Africa', NE:'Africa', NG:'Africa', RW:'Africa', ST:'Africa',
    SN:'Africa', SL:'Africa', SO:'Africa', ZA:'Africa', SS:'Africa', SD:'Africa', SZ:'Africa', TZ:'Africa',
    TG:'Africa', TN:'Africa', UG:'Africa', ZM:'Africa', ZW:'Africa',
    AS:'Asia', AM:'Asia', AZ:'Asia', BH:'Asia', BD:'Asia', BT:'Asia', BN:'Asia', KH:'Asia', CN:'Asia',
    CY:'Asia', GE:'Asia', HK:'Asia', IN:'Asia', ID:'Asia', IR:'Asia', IQ:'Asia', IL:'Asia', JP:'Asia',
    JO:'Asia', KZ:'Asia', KW:'Asia', KG:'Asia', LA:'Asia', LB:'Asia', MO:'Asia', MY:'Asia', MV:'Asia',
    MN:'Asia', MM:'Asia', NP:'Asia', KP:'Asia', OM:'Asia', PK:'Asia', PS:'Asia', PH:'Asia', QA:'Asia',
    SA:'Asia', SG:'Asia', KR:'Asia', LK:'Asia', SY:'Asia', TW:'Asia', TJ:'Asia', TH:'Asia', TL:'Asia',
    TR:'Asia', TM:'Asia', AE:'Asia', UZ:'Asia', VN:'Asia', YE:'Asia',
    AL:'Europe', AD:'Europe', AT:'Europe', BY:'Europe', BE:'Europe', BA:'Europe', BG:'Europe', HR:'Europe',
    CZ:'Europe', DK:'Europe', EE:'Europe', FI:'Europe', FR:'Europe', DE:'Europe', GR:'Europe', HU:'Europe',
    IS:'Europe', IE:'Europe', IT:'Europe', XK:'Europe', LV:'Europe', LI:'Europe', LT:'Europe', LU:'Europe',
    MT:'Europe', MD:'Europe', MC:'Europe', ME:'Europe', NL:'Europe', MK:'Europe', NO:'Europe', PL:'Europe',
    PT:'Europe', RO:'Europe', RU:'Europe', SM:'Europe', RS:'Europe', SK:'Europe', SI:'Europe', ES:'Europe',
    SE:'Europe', CH:'Europe', UA:'Europe', GB:'Europe', VA:'Europe',
    CA:'North America', MX:'North America', US:'North America', GT:'North America', BZ:'North America',
    HN:'North America', SV:'North America', NI:'North America', CR:'North America', PA:'North America',
    CU:'North America', JM:'North America', HT:'North America', DO:'North America', PR:'North America',
    AR:'South America', BO:'South America', BR:'South America', CL:'South America', CO:'South America',
    EC:'South America', GY:'South America', PY:'South America', PE:'South America', SR:'South America',
    UY:'South America', VE:'South America',
    AU:'Oceania', FJ:'Oceania', KI:'Oceania', MH:'Oceania', FM:'Oceania', NR:'Oceania', NZ:'Oceania',
    PW:'Oceania', PG:'Oceania', WS:'Oceania', SB:'Oceania', TO:'Oceania', TV:'Oceania', VU:'Oceania'
};

const MARKET_CAP_BUCKET = (cap) => {
    if (!cap || cap <= 0) return 'Unknown';
    if (cap >= 200e9) return 'Mega cap (>$200B)';
    if (cap >= 10e9) return 'Large cap ($10B–$200B)';
    if (cap >= 2e9) return 'Mid cap ($2B–$10B)';
    if (cap >= 300e6) return 'Small cap ($300M–$2B)';
    return 'Micro cap (<$300M)';
};

export function updatePortfolioSummary() {
    const settings = getUserSettings();
    const currency = getCurrency();
    
    const nameEls = [getEl('profile-name'), ...document.querySelectorAll('.profile-info h1')];
    nameEls.forEach(el => { if (el) el.textContent = settings.name; });
    
    const pfpEls = [getEl('profile-pfp'), ...document.querySelectorAll('.profile-photo')];
    pfpEls.forEach(el => { if (el && settings.pfp) el.src = settings.pfp; });

    let totalShares = 0;
    let totalInvestment = 0;
    let totalPositions = 0;

    for (const pos of Object.values(positions)) {
        const shares = pos.shares || 0;
        if (shares > 0) {
            totalPositions++;
            totalShares += shares;
                totalInvestment += (pos.costBasis || pos.investment || 0);
        }
    }

    const tPos = getEl('total-positions'); if (tPos) tPos.textContent = totalPositions;
    const mtPos = getEl('mobile-total-positions'); if (mtPos) mtPos.textContent = totalPositions;
    const tSha = getEl('total-shares'); if (tSha) tSha.textContent = totalShares;
    const mtSha = getEl('mobile-total-shares'); if (mtSha) mtSha.textContent = totalShares;
    
    const invStr = totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
    const tInv = getEl('total-investment'); if (tInv) tInv.textContent = invStr;
    const mtInv = getEl('mobile-total-investment'); if (mtInv) mtInv.textContent = invStr;

    try { initExposureToggle(); } catch(e) {}
    try { updatePortfolioComposition(); } catch (e) {}
}

const EXPOSURE_COLORS = {
    equity: '#a8a2ff',
    crypto: '#fbbf24',
    commodity: '#65d981',
    other: '#6b7280'
};
const COUNTRY_COLORS = ['#a8a2ff', '#65d981', '#fbbf24', '#f87171', '#60a5fa', '#f472b6', '#34d399', '#c084fc', '#fb923c'];

export function updatePortfolioComposition() {
    const panel = getEl('exposure-panel');
    const svg = getEl('exposure-chart-svg');
    const tooltip = getEl('exposure-tooltip');
    const legend = getEl('exposure-legend');
    if (!panel || !svg || !legend) return;

    const mode = panel.dataset.mode || 'symbol';
    const positionValues = [];
    let totalValForHash = 0;
    for (const pos of Object.values(positions)) {
        if (!pos || !(pos.shares > 0)) continue;
        const lastPrice = pos.lastData?.price;
        const value = lastPrice ? lastPrice * pos.shares : (pos.costBasis || 0);
        if (value <= 0) continue;
        totalValForHash += value;
        const countryCode = (pos.raw?.country || 'OTH').toUpperCase();
        const profile = pos.metadata?.assetProfile;
        const summary = pos.metadata?.summaryDetail;
        const stats = pos.metadata?.defaultKeyStatistics;
        const rawMarketCap = (typeof summary?.marketCap === 'object' ? summary.marketCap?.raw : summary?.marketCap)
            || (typeof stats?.marketCap === 'object' ? stats.marketCap?.raw : stats?.marketCap)
            || pos.lastData?.marketCap || 0;
        positionValues.push({
            symbol: pos.symbol,
            ticker: pos.ticker || pos.symbol,
            name: pos.name,
            type: pos.type || 'equity',
            country: countryCode,
            continent: CONTINENT_MAP[countryCode] || 'Other',
            currency: (pos.raw?.currency || pos.lastData?.currency || 'USD').toUpperCase(),
            exchange: (pos.lastData?.exchange || pos.lastData?.fullExchangeName || 'Unknown').toUpperCase(),
            sector: profile?.sector || 'Unknown',
            industry: profile?.industry || 'Unknown',
            marketCapBucket: MARKET_CAP_BUCKET(rawMarketCap),
            value
        });
    }

    const currentHash = `${mode}-${positionValues.length}-${totalValForHash.toFixed(0)}`;
    if (currentHash === lastCompositionHash) return;
    lastCompositionHash = currentHash;

    if (positionValues.length === 0) { panel.classList.add('empty'); return; }
    panel.classList.remove('empty');

    const total = positionValues.reduce((s, p) => s + p.value, 0);
    const buckets = new Map();
    const bucketMeta = new Map();

    const addBucket = (key, value, label, ticker = '') => {
        buckets.set(key, (buckets.get(key) || 0) + value);
        if (!bucketMeta.has(key)) bucketMeta.set(key, { label, ticker });
    };

    if (mode === 'type') {
        positionValues.forEach(p => addBucket(p.type, p.value, typeLabel(p.type)));
    } else if (mode === 'country') {
        positionValues.forEach(p => addBucket(p.country, p.value, p.country));
    } else if (mode === 'continent') {
        positionValues.forEach(p => addBucket(p.continent, p.value, p.continent));
    } else if (mode === 'currency') {
        positionValues.forEach(p => addBucket(p.currency, p.value, p.currency));
    } else if (mode === 'exchange') {
        positionValues.forEach(p => addBucket(p.exchange, p.value, p.exchange));
    } else if (mode === 'sector') {
        positionValues.forEach(p => addBucket(p.sector, p.value, p.sector));
    } else if (mode === 'industry') {
        positionValues.forEach(p => addBucket(p.industry, p.value, p.industry));
    } else if (mode === 'marketcap') {
        positionValues.forEach(p => addBucket(p.marketCapBucket, p.value, p.marketCapBucket));
    } else {
        positionValues.forEach(p => addBucket(p.symbol, p.value, p.name, p.ticker));
    }

    const sorted = Array.from(buckets.entries())
        .map(([k, v]) => ({ key: k, value: v, pct: (v / total) * 100, ...bucketMeta.get(k) }))
        .sort((a, b) => b.value - a.value);

    const colorFor = (key, idx) => {
        if (mode === 'type') return EXPOSURE_COLORS[key] || EXPOSURE_COLORS.other;
        return COUNTRY_COLORS[idx % COUNTRY_COLORS.length];
    };


    svg.innerHTML = '';
    let currentAngle = -90; // Start at top
    const centerX = 100, centerY = 100, radius = 85;

    sorted.forEach((b, i) => {
        let angle = (b.pct / 100) * 360;
        if (angle >= 360) angle = 359.99; // Fix 100% slice case

        const largeArc = angle > 180 ? 1 : 0;
        const startRad = (currentAngle * Math.PI) / 180;
        const endRad = ((currentAngle + angle) * Math.PI) / 180;

        const x1 = centerX + radius * Math.cos(startRad);
        const y1 = centerY + radius * Math.sin(startRad);
        const x2 = centerX + radius * Math.cos(endRad);
        const y2 = centerY + radius * Math.sin(endRad);

        const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
            'Z'
        ].join(' ');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', colorFor(b.key, i));
        path.setAttribute('stroke', 'var(--bg-card)');
        path.setAttribute('stroke-width', '2');
        path.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s';
        path.style.cursor = 'pointer';
        path.style.transformOrigin = 'center';

        path.addEventListener('mouseenter', () => {
            path.style.transform = 'scale(1.06)';
            path.style.filter = 'brightness(1.1) saturate(1.2)';
            if (tooltip) {
                const currency = getCurrency();
                tooltip.innerHTML = `
                    <div class="tt-ticker">${b.label} (${b.ticker || b.key})</div>
                    <div class="tt-data">
                        <div class="tt-val">${b.pct.toFixed(1)}%</div>
                        <div class="tt-val">${b.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}</div>
                    </div>
                `;
                tooltip.hidden = false;
            }
        });

        path.addEventListener('mousemove', (e) => {
            if (tooltip) {
                const rect = svg.getBoundingClientRect();
                tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
                tooltip.style.top = (e.clientY - rect.top - 40) + 'px';
            }
        });

        path.addEventListener('mouseleave', () => {
            path.style.transform = 'scale(1)';
            path.style.filter = 'none';
            if (tooltip) tooltip.hidden = true;
        });

        svg.appendChild(path);
        currentAngle += angle;
    });

    const top = sorted.slice(0, 10);
    legend.innerHTML = top.map((b, i) =>
        `<div class="exposure-legend-row">
            <span class="swatch" style="background:${colorFor(b.key, i)};"></span>
            <span class="label">${b.label}</span>
            <span class="pct">${b.pct.toFixed(1)}%</span>
        </div>`
    ).join('');
}


export async function loadStocks() {
    const list = [];
    let orders = {};
    
    try {
        const orderRes = await fetch('json/portfolio.json');
        if (orderRes.ok) orders = await orderRes.json();
    } catch (e) { console.error('Error loading portfolio.json', e); }

    for (const type of TYPE_ORDER) {
        try {
            const response = await fetch(`json/${type}.json`);
            if (response.ok) {
                const stocks = await response.json();
                stocks.forEach(s => {
                    if (orders[s.symbol]) {
                        s.purchases = orders[s.symbol].purchases || [];
                        s.sales = orders[s.symbol].sales || [];
                    }
                });
                list.push(...stocks);
            }
        } catch (error) { }
    }

    try {
        const imported = localStorage.getItem('nemeris_imported_positions');
        if (imported) {
            const importedPos = JSON.parse(imported);
            Object.values(importedPos).forEach(p => {
                if (!list.find(s => s.symbol === p.symbol)) {
                    list.push(p.raw || p);
                }
            });
        }
    } catch (e) { console.error('Error loading imported positions', e); }
    const byType = {};
    for (const s of list) {
        if (!byType[s.type]) byType[s.type] = [];
        byType[s.type].push(s);
    }
    for (const id of ['portfolio-tabs', 'general-tabs', 'suspended-tabs', 'mobile-portfolio-tabs', 'mobile-general-tabs', 'mobile-suspended-tabs']) {
        const el = getEl(id);
        if (el) el.innerHTML = '';
    }

    for (const [type, stocks] of Object.entries(byType)) {
        const hasPortfolio = stocks.some(s => {
            const calculated = calculateStockValues(s);
            return calculated.shares > 0;
        });
        const hasGeneral = stocks.some(s => {
            const calculated = calculateStockValues(s);
            return calculated.shares === 0;
        });
        const label = typeLabel(type);
        const icon = typeIcon(type);
        if (hasPortfolio) {
            const portSection = document.createElement('div');
            portSection.className = 'tab-type-section';
            portSection.id = `portfolio-section-${type}`;
            const portTitle = document.createElement('div');
            portTitle.className = 'tab-type-title';
            portTitle.innerHTML = `<i class="${icon} type-icon"></i>${label}`;
            portSection.appendChild(portTitle);
            getEl('portfolio-tabs').appendChild(portSection);
        }
        if (hasGeneral) {
            const genSection = document.createElement('div');
            genSection.className = 'tab-type-section';
            genSection.id = `general-section-${type}`;
            const genTitle = document.createElement('div');
            genTitle.className = 'tab-type-title';
            genTitle.innerHTML = `<i class="${icon} type-icon"></i>${label}`;
            genSection.appendChild(genTitle);
            getEl('general-tabs').appendChild(genSection);
        }
    }
    for (const s of list) {
        const calculated = calculateStockValues(s);
        positions[s.symbol] = {
            symbol: s.symbol,
            ticker: s.ticker,
            name: s.name,
            type: s.type,
            currency: s.currency,

            shares: calculated.shares,
            investment: calculated.investment,
            costBasis: calculated.costBasis || 0,
            realizedPL: calculated.realizedPL || 0,
            purchaseDate: calculated.purchaseDate,
            purchases: s.purchases || [],
            sales: s.sales || [],
            news: [],
            lastNewsFetch: 0,
            chart: null,
            lastFetch: 0,
            lastData: null,
            currentPeriod: '1D',
            chartType: 'line',
            suspended: s.suspended || isSymbolSuspendedInStorage(s.symbol),
            raw: s
        };
        lastApiBySymbol[s.symbol] = selectedApi;
        createTab(s, s.type);
        createCard(s);
    }
    for (const sym of Object.keys(positions)) initChart(sym, positions);
    for (const sym of Object.keys(positions)) {
        try { updateSectionDates(sym); } catch (e) { }
    }
    const firstPortfolio = document.querySelector('#sidebar-portfolio .tab');
    const firstGeneral = document.querySelector('#sidebar-market .tab');
    const first = firstPortfolio || firstGeneral;

    if (first) {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.card').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

        first.classList.add('active');
        const sym = first.dataset.symbol;
        getEl(`card-${sym}`)?.classList.add('active');
        fetchActiveSymbol(true);
    }
    updatePortfolioSummary();
    initPortfolioAnalytics();
    setTimeout(() => backgroundSuspendedScan(), 2500);
    setTimeout(() => batchPerformanceFetch(globalPeriod), 500);
}

export let isBatchFetching = false;

export async function batchPerformanceFetch(period) {
    if (isBatchFetching) return;
    const tickers = Object.values(positions).map(p => p.ticker).filter(Boolean);
    if (!tickers.length) return;

    isBatchFetching = true;
    try {
const results = await fetchYahooPeriodChanges(tickers, period);

        const activeSymbol = typeof getActiveSymbol === 'function' ? getActiveSymbol() : null;
        const gotAnything = results && Object.keys(results).length > 0;

        for (const pos of Object.values(positions)) {
            const data = results[pos.ticker];
            if (!data) {
                if (gotAnything && pos.ticker && !pos.suspended) markTabAsSuspended(pos.symbol);
                continue;
            }

            if (pos.suspended) unmarkTabAsSuspended(pos.symbol);

            if (pos.symbol === activeSymbol && pos.lastData?.timestamps?.length) {
                pos.lastData.price = data.price;
                pos.lastData.change = data.change;
                pos.lastData.changePercent = data.changePercent;
                updateUI(pos.symbol, pos.lastData);
            } else {
                pos.lastData = { ...(pos.lastData || {}), ...data };
                // Fresh history arrived: drop the cached signal score so the
                // sidebar's 'signal'/'trending' sorts recompute it on demand.
                if (data.history) delete pos.lastData.score;
            }
            updateSidebarPerformance(pos.symbol);
        }
    } catch (e) {
        console.error('[Batch Performance] Error:', e);
    } finally {
        isBatchFetching = false;
    }
}

async function backgroundSuspendedScan() {
    const BATCH_SIZE = 30;
    const BATCH_DELAY_MS = 1500;
    const candidates = Object.values(positions)
        .map(p => ({ symbol: p.symbol, yahoo: getYahooSymbol(p) || p.ticker }))
        .filter(x => x.yahoo && isYahooSparkFriendly(x.yahoo));

    if (!candidates.length) return;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        const yahooSymbols = batch.map(b => b.yahoo);
        let results;
        try {
            // 5d/1d range so weekends and holidays still surface valid candles.
            // 1d/1d returned a single null candle on closed markets → false-positive suspensions.
            results = await fetchYahooSparkBatch(yahooSymbols, '5d', '1d');
        } catch { results = null; }

        if (results) {
            const alive = new Map();
            for (const r of results) {
                const hasData = r?.response?.[0]?.indicators?.quote?.[0]?.close?.some(v => v != null);
                if (r?.symbol) alive.set(r.symbol.toUpperCase(), !!hasData);
            }
            const batchAnswered = results.length > 0;
            for (const { symbol, yahoo } of batch) {
                const isAlive = alive.get(yahoo.toUpperCase());
                if (isAlive === true) unmarkTabAsSuspended(symbol);
                // isAlive === false (Yahoo entry but every close is null over 5 days) → still ambiguous
                // (could be a long holiday week or transient API issue). Don't suspend on that signal.
                else if (batchAnswered && isAlive === undefined) markTabAsSuspended(symbol); // absent from response → delisted
            }
        }

        if (i + BATCH_SIZE < candidates.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }
}

export function initPortfolioAnalytics() {
    const card = getEl('card-portfolio');
    if (!card) return;

    const btns = card.querySelectorAll('.card-tab-btn');
    const panes = card.querySelectorAll('.card-tab-pane');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            btns.forEach(b => b.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            card.querySelector(`[data-pane="${target}"]`)?.classList.add('active');
            
            refreshAnalyticsTab(target);
        });
    });

    initAnalysisPane();

    refreshAnalyticsTab('portfolio-performance');
}

async function refreshAnalyticsTab(tab) {
    switch(tab) {
        case 'portfolio-performance':
            renderPerformancePane();
            break;
        case 'portfolio-diversification':
            renderDiversificationPane();
            break;
        case 'portfolio-dividends':
            renderDividendsPane();
            break;
        case 'portfolio-analysis':
            renderAnalysisPane();
            break;
    }
}

async function fetchAllPortfolioMetadata() {
    const symbols = Object.keys(positions).filter(s => positions[s].shares > 0);
    if (symbols.length === 0) return;

    const { fetchYahooQuoteSummary } = await import('./yahoo-finance.js');
    const modules = ['calendarEvents', 'summaryDetail', 'defaultKeyStatistics', 'assetProfile'];
    const promises = symbols.map(async s => {
        if (positions[s].analyticsFetched) return;
        positions[s].analyticsFetched = true;
        const metadata = await fetchYahooQuoteSummary(s, modules);
        if (metadata) positions[s].metadata = metadata;
    });

    await Promise.all(promises);
}

function renderDiversificationPane() {
    initExposureToggle();
    updatePortfolioComposition();
    fetchAllPortfolioMetadata().then(() => updatePortfolioComposition());
}

function renderPerformancePane() {
    const currency = typeof getCurrency === 'function' ? getCurrency() : '€';
    const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtSigned = (n) => (n >= 0 ? '+' : '') + fmt(n);

    const renderRow = ({ symbol, name, pl, pct, tag }) => {
        const sign = pl >= 0 ? 'positive' : 'negative';
        const tagHtml = tag ? `<span class="perf-row-tag">${tag}</span>` : '';
        return `
            <div class="perf-row ${sign}" data-symbol="${symbol}">
                <img class="perf-row-logo" src="img/icon/${symbol}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
                <div class="perf-row-id">
                    <span class="perf-row-name">${name} (${symbol})${tagHtml}</span>
                </div>
                <div class="perf-row-pl">
                    <span class="perf-row-pl-amt ${sign}">${fmtSigned(pl)} ${currency}</span>
                    <span class="perf-row-pl-pct ${sign}">${formatPct(pct)}</span>
                </div>
            </div>
        `;
    };

    let totalValue = 0;
    let totalCostBasis = 0;
    let totalUnrealized = 0;
    let totalRealized = 0;
    let winningCapital = 0;
    let losingCapital = 0;
    let flatCapital = 0;
    let winners = 0, losers = 0, flat = 0;

    let realizedGains = 0;
    let realizedLosses = 0;
    let unrealizedGains = 0;
    let unrealizedLosses = 0;

    const activeRows = [];
    const closedRows = [];

    for (const s in positions) {
        const pos = positions[s];
        const realized = pos.realizedPL || 0;
        totalRealized += realized;
        if (realized > 0) realizedGains += realized;
        else if (realized < 0) realizedLosses += Math.abs(realized);

        if ((pos.shares || 0) > 0) {
            const price = pos.lastData?.price || (pos.costBasis / pos.shares) || 0;
            const value = price * pos.shares;
            const unrealized = value - pos.costBasis;
            const pct = pos.costBasis > 0 ? (unrealized / pos.costBasis) * 100 : 0;

            if (unrealized > 0) unrealizedGains += unrealized;
            else if (unrealized < 0) unrealizedLosses += Math.abs(unrealized);

            totalValue += value;
            totalCostBasis += pos.costBasis;
            totalUnrealized += unrealized;

            if (unrealized > 0.01) { winningCapital += value; winners++; }
            else if (unrealized < -0.01) { losingCapital += value; losers++; }
            else { flatCapital += value; flat++; }

            activeRows.push({ symbol: s, name: pos.name || s, invested: pos.costBasis, exit: value, pl: unrealized, pct });
        } else if ((pos.sales?.length || 0) > 0) {
            const invested = (pos.purchases || []).reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
            const received = (pos.sales || []).reduce((sum, p) => sum + (p.amount || 0), 0);
            const pl = realized || (received - invested);
            const pct = invested > 0 ? (pl / invested) * 100 : 0;
            closedRows.push({ symbol: s, name: pos.name || s, invested, exit: received, pl, pct });
        }
    }

    const totalPct = totalCostBasis > 0 ? (totalUnrealized / totalCostBasis) * 100 : 0;
    const allTimePL = totalUnrealized + totalRealized;

    setText('perf-total-value', formatCurrency(totalValue, currency));

    const deltaEl = getEl('perf-total-delta');
    if (deltaEl) {
        const isPos = totalUnrealized >= 0;
        deltaEl.className = 'perf-hero-delta ' + (isPos ? 'positive' : 'negative');
        deltaEl.textContent = `${fmtSigned(totalUnrealized)} ${currency}   ${formatPct(totalPct)}`;
    }

    const bar = getEl('perf-pulse-bar');
    if (bar) {
        const total = winningCapital + losingCapital + flatCapital;
        if (total > 0) {
            const wPct = (winningCapital / total) * 100;
            const lPct = (losingCapital / total) * 100;
            const fPct = Math.max(0, 100 - wPct - lPct);
            bar.innerHTML = `
                <span class="pulse-win" style="width:${wPct.toFixed(2)}%"></span>
                <span class="pulse-flat" style="width:${fPct.toFixed(2)}%"></span>
                <span class="pulse-loss" style="width:${lPct.toFixed(2)}%"></span>
            `;
        } else {
            bar.innerHTML = '';
        }
    }

    const captionParts = [];
    if (winners) captionParts.push(`${winners} winner${winners > 1 ? 's' : ''}`);
    if (flat) captionParts.push(`${flat} flat`);
    if (losers) captionParts.push(`${losers} loser${losers > 1 ? 's' : ''}`);
    setText('perf-pulse-caption', captionParts.join('  ·  '));

    const activeList = getEl('perf-positions');
    if (activeList) {
        activeRows.sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl));
        activeList.innerHTML = activeRows.length
            ? activeRows.map(renderRow).join('')
            : '<div class="perf-empty">No active positions</div>';
    }
    setText('perf-active-count', activeRows.length);

    const closedSection = getEl('perf-closed-section');
    const closedList = getEl('perf-closed');
    if (closedSection && closedList) {
        if (closedRows.length) {
            closedRows.sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl));
            closedList.innerHTML = closedRows.map(renderRow).join('');
            setText('perf-closed-count', closedRows.length);
            closedSection.hidden = false;
        } else {
            closedSection.hidden = true;
        }
    }

    const allTimeEl = getEl('perf-alltime');
    if (allTimeEl) {
        if (activeRows.length || closedRows.length) {
            const sign = allTimePL >= 0 ? 'positive' : 'negative';
            const segs = [];
            if (Math.abs(totalUnrealized) > 0.01) segs.push(`unrealized <strong class="${totalUnrealized >= 0 ? 'positive' : 'negative'}">${fmtSigned(totalUnrealized)} ${currency}</strong>`);
            if (Math.abs(totalRealized) > 0.01) segs.push(`realized <strong class="${totalRealized >= 0 ? 'positive' : 'negative'}">${fmtSigned(totalRealized)} ${currency}</strong>`);
            allTimeEl.hidden = false;
            allTimeEl.innerHTML = `
                <div class="perf-alltime-label">All-Time Profit</div>
                <div class="perf-alltime-value ${sign}">${fmtSigned(allTimePL)} ${currency}</div>
                ${segs.length ? `<div class="perf-alltime-breakdown">${segs.join('  ·  ')}</div>` : ''}
            `;
        } else {
            allTimeEl.hidden = true;
        }
    }

    updatePerformanceChart(realizedGains, unrealizedGains, realizedLosses + unrealizedLosses);
}

async function renderDividendsPane() {
    const currency = getCurrency();
    const list = getEl('dividend-list');

    await fetchAllPortfolioMetadata();

    const totalEl = getEl('dividend-total');
    const metaEl = getEl('dividend-meta');
    if (!list) return;

    const payers = [];
    let totalIncome = 0;
    let totalValue = 0;

    for (const s in positions) {
        const pos = positions[s];
        if ((pos.shares || 0) <= 0) continue;

        const summary = pos.metadata?.summaryDetail;
        const stats = pos.metadata?.defaultKeyStatistics;
        const calendar = pos.metadata?.calendarEvents;

        const dividendRate = (typeof summary?.dividendRate === 'object' ? summary.dividendRate.raw : summary?.dividendRate)
            || (typeof stats?.trailingAnnualDividendRate === 'object' ? stats.trailingAnnualDividendRate.raw : stats?.trailingAnnualDividendRate)
            || 0;
        const yieldRaw = (typeof summary?.dividendYield === 'object' ? summary.dividendYield.raw : summary?.dividendYield)
            ?? (typeof summary?.trailingAnnualDividendYield === 'object' ? summary.trailingAnnualDividendYield.raw : summary?.trailingAnnualDividendYield)
            ?? 0;
        const yieldPct = yieldRaw * 100;

        const price = pos.lastData?.price || (pos.costBasis / pos.shares) || 0;
        const value = price * pos.shares;
        totalValue += value;

        if (dividendRate > 0) {
            const exRaw = typeof calendar?.exDividendDate === 'object' ? calendar.exDividendDate.raw : calendar?.exDividendDate;
            const payRaw = typeof calendar?.dividendDate === 'object' ? calendar.dividendDate.raw : calendar?.dividendDate;
            const exDate = exRaw ? new Date(exRaw * 1000) : null;
            const payDate = payRaw ? new Date(payRaw * 1000) : null;
            const annualIncome = dividendRate * pos.shares;
            totalIncome += annualIncome;
            payers.push({
                symbol: s,
                name: pos.name || s,
                yieldPct,
                rate: dividendRate,
                exDate,
                payDate,
                annualIncome
            });
        }
    }

    const avgYield = totalValue > 0 ? (totalIncome / totalValue) * 100 : 0;

    if (totalEl) totalEl.textContent = formatCurrency(totalIncome, currency);
    if (metaEl) {
        if (payers.length) {
            metaEl.innerHTML = `<span>avg yield ${avgYield.toFixed(2)}%</span><span class="dividend-dot">·</span><span>${payers.length} payer${payers.length > 1 ? 's' : ''}</span>`;
        } else {
            metaEl.textContent = 'No dividend-paying positions';
        }
    }

    if (payers.length === 0) {
        list.innerHTML = '<div class="dividend-empty">No dividend-paying positions in your portfolio</div>';
        return;
    }

    payers.sort((a, b) => b.annualIncome - a.annualIncome);
    const dateFmt = (d) => d ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : null;

    list.innerHTML = payers.map(p => {
        const exTag = p.exDate ? `<span class="dividend-row-tag">ex ${dateFmt(p.exDate)}</span>` : '';
        const payTag = p.payDate ? `<span class="dividend-row-tag">pay ${dateFmt(p.payDate)}</span>` : '';
        return `
            <div class="dividend-row" data-symbol="${p.symbol}">
                <img class="dividend-row-logo" src="img/icon/${p.symbol}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
                <div class="dividend-row-id">
                    <span class="dividend-row-name">${p.name} (${p.symbol})</span>
                </div>
                <div class="dividend-row-meta">
                    <span class="dividend-row-yield">${p.yieldPct.toFixed(2)}%</span>
                    ${exTag}${payTag}
                </div>
                <div class="dividend-row-amt positive">+${fmt(p.annualIncome)} ${currency}<span class="dividend-row-period">/yr</span></div>
            </div>
        `;
    }).join('');
}

export function initExposureToggle() {
    const panel = getEl('exposure-panel');
    const buttons = document.querySelectorAll('.exposure-mode');
    if (!panel || !buttons.length || panel.dataset.bound) return;
    panel.dataset.bound = '1';

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            panel.dataset.mode = btn.dataset.mode;
            lastCompositionHash = '';
            updatePortfolioComposition();
        });
    });
}

function updatePerformanceChart(earned, yetToGain, lost) {
    const section = getEl('perf-chart-section');
    const svg = getEl('perf-chart-svg');
    const tooltip = getEl('perf-chart-tooltip');
    const legend = getEl('perf-chart-legend');
    if (!section || !svg || !legend) return;

    const total = earned + yetToGain + lost;
    if (total <= 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const items = [];
    if (earned > 0) {
        items.push({
            key: 'earned',
            label: 'Realized Gains',
            value: earned,
            color: 'var(--color-positive)', // Green
            pct: (earned / total) * 100
        });
    }
    if (yetToGain > 0) {
        items.push({
            key: 'yetToGain',
            label: 'Unrealized Gains',
            value: yetToGain,
            color: 'var(--primary)', // Purple
            pct: (yetToGain / total) * 100
        });
    }
    if (lost > 0) {
        items.push({
            key: 'lost',
            label: 'Total Losses',
            value: lost,
            color: 'var(--color-negative)', // Red
            pct: (lost / total) * 100
        });
    }

    svg.innerHTML = '';
    let currentAngle = -90; // Start at top
    const centerX = 100, centerY = 100, radius = 85;

    items.forEach((item) => {
        let angle = (item.pct / 100) * 360;
        if (angle >= 360) angle = 359.99;

        const largeArc = angle > 180 ? 1 : 0;
        const startRad = (currentAngle * Math.PI) / 180;
        const endRad = ((currentAngle + angle) * Math.PI) / 180;

        const x1 = centerX + radius * Math.cos(startRad);
        const y1 = centerY + radius * Math.sin(startRad);
        const x2 = centerX + radius * Math.cos(endRad);
        const y2 = centerY + radius * Math.sin(endRad);

        const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
            'Z'
        ].join(' ');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', item.color);
        path.setAttribute('stroke', 'var(--bg-card)');
        path.setAttribute('stroke-width', '2');
        path.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s';
        path.style.cursor = 'pointer';
        path.style.transformOrigin = 'center';

        path.addEventListener('mouseenter', () => {
            path.style.transform = 'scale(1.06)';
            path.style.filter = 'brightness(1.1) saturate(1.2)';
            if (tooltip) {
                const currency = getCurrency();
                tooltip.innerHTML = `
                    <div class="tt-ticker">${item.label}</div>
                    <div class="tt-data">
                        <div class="tt-val">${item.pct.toFixed(1)}%</div>
                        <div class="tt-val">${item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</div>
                    </div>
                `;
                tooltip.hidden = false;
            }
        });

        path.addEventListener('mousemove', (e) => {
            if (tooltip) {
                const rect = svg.getBoundingClientRect();
                tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
                tooltip.style.top = (e.clientY - rect.top - 40) + 'px';
            }
        });

        path.addEventListener('mouseleave', () => {
            path.style.transform = 'scale(1)';
            path.style.filter = 'none';
            if (tooltip) tooltip.hidden = true;
        });

        svg.appendChild(path);
        currentAngle += angle;
    });

    legend.innerHTML = items.map((item) =>
        `<div class="exposure-legend-row">
            <span class="swatch" style="background:${item.color};"></span>
            <span class="label">${item.label}</span>
            <span class="pct">${item.pct.toFixed(1)}%</span>
        </div>`
    ).join('');
}


