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

export function updatePortfolioSummary() {
    const settings = getUserSettings();
    const currency = getCurrency();
    
    // Update Profile Name & Photo
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
            // Use costBasis if available (current value of held lots), fallback to investment
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
        positionValues.push({
            symbol: pos.symbol,
            ticker: pos.ticker || pos.symbol,
            name: pos.name,
            type: pos.type || 'equity',
            country: (pos.raw?.country || 'OTH').toUpperCase(),
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

    if (mode === 'type') {
        positionValues.forEach(p => {
            buckets.set(p.type, (buckets.get(p.type) || 0) + p.value);
            bucketMeta.set(p.type, { label: typeLabel(p.type), ticker: '' });
        });
    } else if (mode === 'country') {
        positionValues.forEach(p => {
            buckets.set(p.country, (buckets.get(p.country) || 0) + p.value);
            bucketMeta.set(p.country, { label: p.country, ticker: '' });
        });
    } else {
        positionValues.forEach(p => {
            buckets.set(p.symbol, (buckets.get(p.symbol) || 0) + p.value);
            bucketMeta.set(p.symbol, { label: p.name, ticker: p.ticker });
        });
    }

    const sorted = Array.from(buckets.entries())
        .map(([k, v]) => ({ key: k, value: v, pct: (v / total) * 100, ...bucketMeta.get(k) }))
        .sort((a, b) => b.value - a.value);

    // Filter colors
    const colorFor = (key, idx) => {
        if (mode === 'type') return EXPOSURE_COLORS[key] || EXPOSURE_COLORS.other;
        return COUNTRY_COLORS[idx % COUNTRY_COLORS.length];
    };

    // Render SVG
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

    // Render Legend
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
    
    // Fetch portfolio orders first
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

    // Load imported positions from local storage
    try {
        const imported = localStorage.getItem('nemeris_imported_positions');
        if (imported) {
            const importedPos = JSON.parse(imported);
            Object.values(importedPos).forEach(p => {
                // If it's a new ticker or we want to overwrite, we can handle it here
                // For now, let's just add it to the list if it's not already there
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
    // Open the first ticker in the Portfolio list by default. Fallback to General if Portfolio is empty.
    const firstPortfolio = document.querySelector('#sidebar-portfolio .tab');
    const firstGeneral = document.querySelector('#sidebar-market .tab');
    const first = firstPortfolio || firstGeneral;

    if (first) {
        // Ensure no other tabs or cards are active (fixes dual home-card + ticker-card view)
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

// --- Advanced Portfolio Analytics ---

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

    // Initial load
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
    const modules = ['calendarEvents', 'summaryDetail', 'defaultKeyStatistics'];
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
                <img class="perf-row-logo" src="img/icon/${symbol}.png" alt="" onerror="this.style.visibility='hidden'" />
                <div class="perf-row-id">
                    <span class="perf-row-name">${name} (${symbol})${tagHtml}</span>
                </div>
                <div class="perf-row-pl">
                    <span class="perf-row-pl-amt ${sign}">${fmtSigned(pl)} ${currency}</span>
                    <span class="perf-row-pl-pct ${sign}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
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

    const activeRows = [];
    const closedRows = [];

    for (const s in positions) {
        const pos = positions[s];
        const realized = pos.realizedPL || 0;
        totalRealized += realized;

        if ((pos.shares || 0) > 0) {
            const price = pos.lastData?.price || (pos.costBasis / pos.shares) || 0;
            const value = price * pos.shares;
            const unrealized = value - pos.costBasis;
            const pct = pos.costBasis > 0 ? (unrealized / pos.costBasis) * 100 : 0;

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
                <img class="dividend-row-logo" src="img/icon/${p.symbol}.png" alt="" onerror="this.style.visibility='hidden'" />
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
            updatePortfolioComposition();
        });
    });
}

