import { positions, selectedApi, lastApiBySymbol, getCurrency, globalPeriod } from './state.js';
import { fetchActiveSymbol } from './general.js';
import { fetchYahooSparkBatch, getYahooSymbol, isYahooSparkFriendly, fetchYahooPeriodChanges, PERIODS } from './yahoo-finance.js';
import { TYPE_ORDER, hasTransactions, typeLabel, typeIcon } from './constants.js';
import { createTab, createCard, updateSectionDates, initChart, markTabAsSuspended, unmarkTabAsSuspended, isSymbolSuspendedInStorage, updateSidebarPerformance, getActiveSymbol } from './ui.js';



const setText = (id, value) => {
    const el = document.getElementById(id);
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

export function updatePortfolioSummary() {
    let totalShares = 0;
    let totalInvestment = 0;

    for (const pos of Object.values(positions)) {
        totalShares += pos.shares || 0;
        if (typeof pos.investment === 'number') totalInvestment += pos.investment;
    }

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setText('total-shares', totalShares);
    const currency = typeof getCurrency === 'function' ? getCurrency() : '€';
    setText('total-investment', totalInvestment.toFixed(2) + ' ' + currency);

    try { updatePortfolioComposition(); } catch (e) { /* ignore */ }
}

const EXPOSURE_COLORS = {
    equity: '#a8a2ff',
    crypto: '#fbbf24',
    commodity: '#65d981',
    other: '#6b7280'
};
const COUNTRY_COLORS = ['#a8a2ff', '#65d981', '#fbbf24', '#f87171', '#60a5fa', '#f472b6', '#34d399', '#c084fc', '#fb923c'];

export function updatePortfolioComposition() {
    const panel = document.getElementById('exposure-panel');
    if (!panel) return;

    const toggle = document.getElementById('exposure-toggle');
    const mode = toggle?.dataset.mode || 'type';

    const positionValues = [];
    for (const pos of Object.values(positions)) {
        if (!pos || !(pos.shares > 0)) continue;
        const lastPrice = pos.lastData?.price;
        const value = lastPrice ? lastPrice * pos.shares : (pos.costBasis || 0);
        if (value <= 0) continue;
        positionValues.push({
            symbol: pos.symbol,
            name: pos.name,
            type: pos.type || 'other',
            country: (pos.raw?.country || 'OTH').toUpperCase(),
            value
        });
    }

    if (positionValues.length === 0) { panel.classList.add('empty'); return; }
    panel.classList.remove('empty');

    const total = positionValues.reduce((s, p) => s + p.value, 0);
    const buckets = new Map();

    if (mode === 'type') {
        for (const p of positionValues) {
            const key = p.type;
            buckets.set(key, (buckets.get(key) || 0) + p.value);
        }
    } else if (mode === 'country') {
        for (const p of positionValues) {
            buckets.set(p.country, (buckets.get(p.country) || 0) + p.value);
        }
    } else {
        for (const p of positionValues) {
            buckets.set(p.symbol, (buckets.get(p.symbol) || 0) + p.value);
        }
    }

    const sorted = Array.from(buckets.entries())
        .map(([k, v]) => ({ key: k, value: v, pct: (v / total) * 100 }))
        .sort((a, b) => b.value - a.value);

    const bar = document.getElementById('exposure-bar');
    const legend = document.getElementById('exposure-legend');
    if (!bar || !legend) return;

    const colorFor = (key, idx) => {
        if (mode === 'type') return EXPOSURE_COLORS[key] || EXPOSURE_COLORS.other;
        return COUNTRY_COLORS[idx % COUNTRY_COLORS.length];
    };

    const labelFor = (key) => {
        if (mode === 'type') {
            return typeLabel(key);
        }
        if (mode === 'symbol') {
            const n = positions[key]?.name || key;
            return n.length > 22 ? n.slice(0, 21) + '…' : n;
        }
        return key;
    };

    bar.innerHTML = sorted.map((b, i) =>
        `<span style="width:${b.pct.toFixed(2)}%;background:${colorFor(b.key, i)};" title="${labelFor(b.key)} ${b.pct.toFixed(1)}%"></span>`
    ).join('');

    const top = sorted.slice(0, 6);
    legend.innerHTML = top.map((b, i) =>
        `<div class="exposure-legend-row"><span class="swatch" style="background:${colorFor(b.key, i)};"></span><span class="label">${labelFor(b.key)}</span><span class="pct">${b.pct.toFixed(1)}%</span></div>`
    ).join('');

}

function initExposureToggle() {
    const toggle = document.getElementById('exposure-toggle');
    if (!toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = '1';
    const modes = ['type', 'country', 'symbol'];
    const labels = { type: 'By Type', country: 'By Country', symbol: 'By Position' };
    toggle.addEventListener('click', () => {
        const cur = toggle.dataset.mode || 'type';
        const next = modes[(modes.indexOf(cur) + 1) % modes.length];
        toggle.dataset.mode = next;
        toggle.textContent = labels[next];
        updatePortfolioComposition();
    });
}
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initExposureToggle);
}

export async function loadStocks() {
    const list = [];
    for (const type of TYPE_ORDER) {
        try {
            const response = await fetch(`json/${type}.json`);
            if (response.ok) list.push(...(await response.json()));
        } catch (error) { }
    }
    const byType = {};
    for (const s of list) {
        if (!byType[s.type]) byType[s.type] = [];
        byType[s.type].push(s);
    }
    document.getElementById('portfolio-tabs').innerHTML = '';
    document.getElementById('general-tabs').innerHTML = '';
    const suspendedTabs = document.getElementById('suspended-tabs');
    if (suspendedTabs) suspendedTabs.innerHTML = '';

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
            document.getElementById('portfolio-tabs').appendChild(portSection);
        }
        if (hasGeneral) {
            const genSection = document.createElement('div');
            genSection.className = 'tab-type-section';
            genSection.id = `general-section-${type}`;
            const genTitle = document.createElement('div');
            genTitle.className = 'tab-type-title';
            genTitle.innerHTML = `<i class="${icon} type-icon"></i>${label}`;
            genSection.appendChild(genTitle);
            document.getElementById('general-tabs').appendChild(genSection);
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
            purchaseDate: calculated.purchaseDate,
            purchases: s.purchases || [],
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
    const first = document.querySelector('.sidebar .tab');
    if (first) {
        first.classList.add('active');
        const sym = first.dataset.symbol;
        document.getElementById(`card-${sym}`)?.classList.add('active');
        fetchActiveSymbol(true);
    } else {

    }
    updatePortfolioSummary();
    initPortfolioAnalytics();
    // Scan léger en arrière-plan pour détecter les tickers morts (spark batch, quota minimal).
    setTimeout(() => backgroundSuspendedScan(), 2500);

    // Fetch initial pour la performance de tout le monde
    setTimeout(() => batchPerformanceFetch(globalPeriod), 500);
}

export let isBatchFetching = false;

export async function batchPerformanceFetch(period) {
    if (isBatchFetching) return;
    const tickers = Object.values(positions).map(p => p.ticker).filter(Boolean);
    if (!tickers.length) return;

    isBatchFetching = true;
    try {
        console.log(`[Batch Performance] Fetching ${period} for all ${tickers.length} tickers...`);
        const results = await fetchYahooPeriodChanges(tickers, period);

        const activeSymbol = typeof getActiveSymbol === 'function' ? getActiveSymbol() : null;
        const gotAnything = results && Object.keys(results).length > 0;

        for (const pos of Object.values(positions)) {
            // Active symbol is handled by fetchActiveSymbol (detailed data + chart + signal).
            // Skip it here so we never overwrite its lastData with stripped batch data.
            if (pos.symbol === activeSymbol && pos.lastData?.timestamps?.length) continue;

            const data = results[pos.ticker];
            if (!data) {
                // Si le batch a globalement marché mais ce ticker précis n'a rien renvoyé
                // après tous les fallbacks de fetchYahooPeriodChanges → ticker mort.
                if (gotAnything && pos.ticker && !pos.suspended) markTabAsSuspended(pos.symbol);
                continue;
            }

            if (pos.suspended) unmarkTabAsSuspended(pos.symbol);
            pos.lastData = { ...(pos.lastData || {}), ...data };
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
            results = await fetchYahooSparkBatch(yahooSymbols, '1d', '1d');
        } catch { results = null; }

        if (results) {
            // Map yahoo-symbol → a un résultat non vide ?
            const alive = new Map();
            for (const r of results) {
                const hasData = r?.response?.[0]?.indicators?.quote?.[0]?.close?.some(v => v != null);
                if (r?.symbol) alive.set(r.symbol.toUpperCase(), !!hasData);
            }
            // Si Yahoo a renvoyé au moins un résultat dans ce batch, l'absence d'un ticker
            // est un signal fiable qu'il est mort/délisté → on suspend.
            const batchAnswered = results.length > 0;
            for (const { symbol, yahoo } of batch) {
                const isAlive = alive.get(yahoo.toUpperCase());
                if (isAlive === true) unmarkTabAsSuspended(symbol);
                else if (isAlive === false) markTabAsSuspended(symbol);
                else if (batchAnswered) markTabAsSuspended(symbol); // absent → mort
            }
        }

        if (i + BATCH_SIZE < candidates.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }
}

// --- Advanced Portfolio Analytics ---

export function initPortfolioAnalytics() {
    const card = document.getElementById('card-portfolio');
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

    // Initial load
    refreshAnalyticsTab('portfolio-performance');
}

async function refreshAnalyticsTab(tab) {
    switch(tab) {
        case 'portfolio-performance':
            updatePerformanceChart();
            break;
        case 'portfolio-diversification':
            updateDiversificationCharts();
            break;
        case 'portfolio-dividends':
            updateDividendTable();
            break;
    }
}

async function fetchAllPortfolioMetadata() {
    const symbols = Object.keys(positions).filter(s => positions[s].shares > 0);
    if (symbols.length === 0) return;

    const promises = symbols.map(async s => {
        if (positions[s].analyticsFetched) return;
        const yahoo = await import('./yahoo-finance.js');
        const metadata = await yahoo.fetchYahooQuoteSummary(s);
        if (metadata) {
            positions[s].metadata = metadata;
            positions[s].analyticsFetched = true;
        }
    });

    await Promise.all(promises);
}

async function updateDiversificationCharts() {
    await fetchAllPortfolioMetadata();
    
    const sectors = {};
    const geo = {};
    const assets = { Equity: 0, ETF: 0, Cash: 0, Bond: 0 };
    
    let totalValue = 0;
    
    for (const s in positions) {
        const pos = positions[s];
        if (pos.shares <= 0) continue;
        
        const price = pos.lastData?.price || pos.costBasis / pos.shares || 0;
        const value = price * pos.shares;
        totalValue += value;
        
        const type = pos.type === 'equity' ? 'Equity' : (pos.type === 'etf' ? 'ETF' : 'Other');
        assets[type] = (assets[type] || 0) + value;
        
        const profile = pos.metadata?.assetProfile || pos.metadata?.summaryProfile;
        if (profile) {
            const sector = profile.sector || 'Unknown';
            sectors[sector] = (sectors[sector] || 0) + value;
            
            const country = profile.country || pos.country || 'Other';
            geo[country] = (geo[country] || 0) + value;
        } else {
            sectors['Unknown'] = (sectors['Unknown'] || 0) + value;
            geo[pos.country || 'Other'] = (geo[pos.country || 'Other'] || 0) + value;
        }
    }

    renderPieChart('asset-class-chart', assets);
    renderPieChart('geography-chart', geo);
    renderPieChart('sector-chart', sectors);
}

function renderPieChart(canvasId, dataMap) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const labels = Object.keys(dataMap);
    const values = Object.values(dataMap);
    
    if (canvas.chart) {
        canvas.chart.data.labels = labels;
        canvas.chart.data.datasets[0].data = values;
        canvas.chart.update();
        return;
    }

    const colors = ['#a8a2ff', '#65d981', '#fbbf24', '#f87171', '#60a5fa', '#f472b6', '#34d399', '#c084fc', '#fb923c'];

    canvas.chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#cdd0e4',
                        font: { size: 10, family: "'Plus Jakarta Sans', sans-serif" },
                        boxWidth: 8,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(12, 12, 16, 0.95)',
                    titleColor: '#a8a2ff',
                    bodyColor: '#cdd0e4',
                    borderColor: 'rgba(168, 162, 255, 0.2)',
                    borderWidth: 1,
                    callbacks: {
                        label: (ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const val = ctx.raw;
                            const pct = ((val / total) * 100).toFixed(1);
                            return ` ${ctx.label}: ${pct}%`;
                        }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

async function updatePerformanceChart() {
    const canvas = document.getElementById('portfolio-performance-chart');
    if (!canvas) return;

    const currency = typeof getCurrency === 'function' ? getCurrency() : '€';
    const yahoo = await import('./yahoo-finance.js');
    
    // 1. Calculate Summary Stats
    let totalValue = 0;
    let totalUnrealizedProfit = 0;
    let totalRealizedProfit = 0;
    let totalCostBasis = 0;
    let bestPerf = { symbol: '', pct: -Infinity };
    let worstPerf = { symbol: '', pct: Infinity };
    
    const allSymbols = Object.keys(positions);
    const activePositions = allSymbols.filter(s => positions[s].shares > 0);
    const historicalEntries = [];
    
    allSymbols.forEach(s => {
        const pos = positions[s];
        const realized = pos.realizedPL || 0;
        totalRealizedProfit += realized;
        
        if (pos.shares > 0) {
            const price = pos.lastData?.price || (pos.costBasis / pos.shares) || 0;
            const value = price * pos.shares;
            const unrealized = value - pos.costBasis;
            
            totalValue += value;
            totalCostBasis += pos.costBasis;
            totalUnrealizedProfit += unrealized;
            
            const totalProfitForThis = realized + unrealized;
            const totalCostForThis = pos.costBasis + (pos.investment - pos.costBasis); // total capital put in
            const pct = totalCostForThis > 0 ? (totalProfitForThis / totalCostForThis) * 100 : 0;
            
            if (pct > bestPerf.pct) bestPerf = { symbol: s, pct: pct };
            if (pct < worstPerf.pct) worstPerf = { symbol: s, pct: pct };

            historicalEntries.push({ symbol: s, realized, unrealized, total: totalProfitForThis, pct, active: true });
        } else if (realized !== 0) {
            // Closed position
            const totalCost = Math.abs(pos.investment);
            const pct = totalCost > 0 ? (realized / totalCost) * 100 : 0;
            historicalEntries.push({ symbol: s, realized, unrealized: 0, total: realized, pct, active: false });
        }
    });
    
    const totalProfit = totalUnrealizedProfit + totalRealizedProfit;
    const totalInvestmentEver = totalCostBasis + (totalRealizedProfit < 0 ? Math.abs(totalRealizedProfit) : 0); // Approximation
    
    setText('portfolio-total-value', totalValue.toLocaleString() + ' ' + currency);
    const profitEl = document.getElementById('portfolio-total-profit');
    if (profitEl) {
        profitEl.innerHTML = `
            <div class="profit-breakdown">
                <span class="${totalProfit >= 0 ? 'positive' : 'negative'}">${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} ${currency}</span>
                <div class="profit-sub">
                    <span title="Realized Profits">Rel: ${totalRealizedProfit.toFixed(2)}</span> | 
                    <span title="Unrealized Profits">Unr: ${totalUnrealizedProfit.toFixed(2)}</span>
                </div>
            </div>
        `;
    }
    
    setText('portfolio-best-performer', bestPerf.symbol ? `${bestPerf.symbol} (+${bestPerf.pct.toFixed(1)}%)` : '--');
    setText('portfolio-worst-performer', worstPerf.symbol ? `${worstPerf.symbol} (${worstPerf.pct.toFixed(1)}%)` : '--');

    // Populate Historical List
    const histList = document.getElementById('portfolio-historical-list');
    if (histList) {
        historicalEntries.sort((a, b) => b.total - a.total);
        histList.innerHTML = historicalEntries.map(e => `
            <div class="hist-entry ${e.active ? 'active' : 'closed'}">
                <div class="hist-main">
                    <span class="hist-symbol">${e.symbol}</span>
                    <span class="hist-status">${e.active ? 'ACTIVE' : 'CLOSED'}</span>
                </div>
                <div class="hist-stats">
                    <span class="hist-total ${e.total >= 0 ? 'positive' : 'negative'}">${e.total >= 0 ? '+' : ''}${e.total.toFixed(2)} ${currency}</span>
                    <span class="hist-pct ${e.pct >= 0 ? 'positive' : 'negative'}">(${e.pct >= 0 ? '+' : ''}${e.pct.toFixed(1)}%)</span>
                </div>
            </div>
        `).join('');
    }

    // 2. Chart Logic: Simple Bar Chart of Performance by Position
    const labels = activePositions.map(s => s);
    const performanceData = activePositions.map(s => {
        const pos = positions[s];
        const price = pos.lastData?.price || (pos.shares > 0 ? (pos.costBasis / pos.shares) : 0);
        const cost = pos.costBasis;
        const value = price * pos.shares;
        return cost > 0 ? ((value - cost) / cost) * 100 : 0;
    });

    // Sort by performance
    const combined = labels.map((l, i) => ({ label: l, value: performanceData[i] }))
        .sort((a, b) => b.value - a.value);
    
    const sortedLabels = combined.map(c => c.label);
    const sortedValues = combined.map(c => c.value);

    if (canvas.chart) {
        canvas.chart.data.labels = sortedLabels;
        canvas.chart.data.datasets[0].data = sortedValues;
        canvas.chart.data.datasets[0].backgroundColor = sortedValues.map(v => v >= 0 ? 'rgba(101, 217, 129, 0.4)' : 'rgba(248, 113, 113, 0.4)');
        canvas.chart.data.datasets[0].borderColor = sortedValues.map(v => v >= 0 ? '#65d981' : '#f87171');
        canvas.chart.update();
    } else {
        canvas.chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: sortedLabels,
                datasets: [
                    {
                        label: 'Gain/Loss %',
                        data: sortedValues,
                        backgroundColor: sortedValues.map(v => v >= 0 ? 'rgba(101, 217, 129, 0.4)' : 'rgba(248, 113, 113, 0.4)'),
                        borderColor: sortedValues.map(v => v >= 0 ? '#65d981' : '#f87171'),
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(12, 12, 16, 0.95)',
                        callbacks: {
                            label: (ctx) => ` Performance: ${ctx.raw >= 0 ? '+' : ''}${ctx.raw.toFixed(2)}%`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#6b7280', callback: (v) => v + '%' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#cdd0e4', font: { size: 11 } }
                    }
                }
            }
        });
    }
}

async function updateDividendTable() {
    await fetchAllPortfolioMetadata();
    
    const tbody = document.getElementById('dividend-table-body');
    if (!tbody) return;

    const dividends = [];
    for (const s in positions) {
        const pos = positions[s];
        if (pos.shares <= 0) continue;

        const calendar = pos.metadata?.calendarEvents;
        if (calendar && calendar.exDividendDate) {
            const exDate = new Date(calendar.exDividendDate * 1000);
            const payDate = calendar.dividendDate ? new Date(calendar.dividendDate * 1000) : null;
            const amount = pos.metadata?.defaultKeyStatistics?.trailingAnnualDividendRate || 0;
            
            dividends.push({
                symbol: s,
                exDate: exDate,
                payDate: payDate,
                amount: amount,
                total: amount * pos.shares
            });
        }
    }

    dividends.sort((a, b) => a.exDate - b.exDate);

    if (dividends.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-dim);">No upcoming dividends found</td></tr>';
        return;
    }

    tbody.innerHTML = dividends.map(d => `
        <tr>
            <td><strong>${d.symbol}</strong></td>
            <td>${d.exDate.toLocaleDateString()}</td>
            <td>${d.payDate ? d.payDate.toLocaleDateString() : '--'}</td>
            <td>${d.amount.toFixed(2)} ${getCurrency()}</td>
            <td class="positive">+${d.total.toFixed(2)} ${getCurrency()}</td>
        </tr>
    `).join('');
}

