import { positions, selectedApi, lastApiBySymbol, getCurrency, currencyCode, globalPeriod } from '../core/state.js';
import { positionMoney, priceCurrency, paidCurrency } from '../data/holdings.js';
import { convert } from '../data/rates.js';
import { fetchYahooSparkBatch, getYahooSymbol, isYahooSparkFriendly, fetchYahooPeriodChanges, fetchFromYahoo } from '../data/yahoo-finance.js';
import { TYPE_ORDER } from '../core/constants.js';
import { createTab, createCard, initChart, markTabAsSuspended, unmarkTabAsSuspended, isSymbolSuspendedInStorage, updateSidebarPerformance, updateUI, openCustomSymbol, placeTabs, refreshPositionViews } from './ui.js';
import { getEl, formatCurrency, formatPct, progressBar, activity, drawDonut, showCard, iconColor, getActiveSymbol, downloadText } from '../core/utils.js';
import { initAnalysisPane, renderAnalysisPane } from './portfolio-analysis.js';
import { renderAiLabPane } from '../ai/ai-lab.js';
import { buildLabel, createMainChart, renderLine, alignBenchmarkToTimestamps } from './chart.js';
import { L, Ln, LOCALE } from '../i18n/i18n.js';
import { colors, alpha } from '../core/palette.js';

const setText = (id, value) => {
    const el = getEl(id);
    if (el) el.textContent = value;
};

export function calculateStockValues(stock) {
    let earliestPurchaseDate = stock.purchaseDate;
    let lots = [];
    let initialInvestment = stock.investment || 0;

    // Every trade counted in the currency the first one was paid in (euros for trades saved without one).
    const costCurrency = stock.purchases?.[0]?.currency || 'EUR';
    const paid = t => convert(Math.abs(t.amount || 0), t.currency || 'EUR', costCurrency);
    if (stock.purchases && stock.purchases.length > 0) {
        const dates = stock.purchases.map(p => p.date).filter(d => d).sort();
        earliestPurchaseDate = dates.length > 0 ? dates[0] : null;
        lots = stock.purchases.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map(p => ({
            shares: p.shares || 0,
            amount: paid(p),
            perShare: paid(p) / (p.shares || 1)
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
            realizedPL += paid(s) - costOfSoldShares;
        });
    }

    const totalShares = lots.reduce((sum, l) => sum + l.shares, 0);
    costBasis = lots.reduce((sum, l) => sum + l.amount, 0);

    return {
        investment: stock.investment || 0,
        shares: totalShares,
        costBasis: Math.max(0, costBasis),
        purchaseDate: earliestPurchaseDate,
        realizedPL: realizedPL,
        costCurrency,
    };
}

let lastCompositionHash = '';

export function updatePortfolioSummary() {
    const cur = getCurrency();
    let worth = 0, cost = 0, held = 0;
    for (const p of Object.values(positions)) {
        if (!(p.shares > 0)) continue;
        held++;
        const m = positionMoney(p);
        worth += m.value;
        cost += m.cost;
    }
    const gain = worth - cost;
    const pct = cost > 0 ? (gain / cost) * 100 : 0;
    const tone = gain >= 0 ? 'positive' : 'negative';
    for (const [w, g] of [['me-worth', 'me-gain'], ['home-worth', 'home-gain']]) {
        setText(w, held ? formatCurrency(worth, cur) : L('No stocks yet'));
        const gEl = getEl(g);
        if (!gEl) continue;
        gEl.textContent = held ? `${formatPct(pct)} ${w === 'me-worth' ? L('overall') : L('since you started')}` : L('Add your first trade on a stock page');
        gEl.className = gEl.id.startsWith('me') ? `me-gain ${held ? tone : ''}` : `home-gain ${held ? tone : ''}`;
        gEl.title = held ? L('{0}{1} on {2} put in', gain >= 0 ? '+' : '', formatCurrency(gain, cur), formatCurrency(cost, cur)) : '';
    }
    updatePortfolioComposition();
    window.dispatchEvent(new Event('nemeris:portfolio'));
}

// Donut slices without a logo color: the accent, fading.
const SHADES = [1, .8, .64, .5, .4, .32, .25, .2, .16, .12].map(a => alpha(colors().accent, a));

export function updatePortfolioComposition() {
    const panel = getEl('exposure-panel');
    const svg = getEl('exposure-chart-svg');
    const legend = getEl('exposure-legend');
    if (!panel || !svg || !legend) return;

    const mode = panel.dataset.mode || 'symbol';
    const buckets = new Map();
    let total = 0;
    for (const pos of Object.values(positions)) {
        if (!(pos?.shares > 0)) continue;
        const { value } = positionMoney(pos);
        if (value <= 0) continue;
        total += value;
        let key, label;
        if (mode === 'sector') key = label = pos.metadata?.assetProfile?.sector || L('Other');
        else if (mode === 'country') { key = (pos.raw?.country || L('Other')).toUpperCase(); label = key; }
        else if (mode === 'currency') key = label = priceCurrency(pos).toUpperCase();
        else { key = pos.symbol; label = pos.name || pos.symbol; }
        const b = buckets.get(key) || { label, value: 0, symbol: mode === 'symbol' ? pos.symbol : undefined };
        b.value += value;
        buckets.set(key, b);
    }
    const hash = `${mode}-${buckets.size}-${total.toFixed(0)}`;
    if (hash === lastCompositionHash) return;
    lastCompositionHash = hash;
    panel.classList.toggle('is-empty', !buckets.size);
    const items = [...buckets.values()].sort((a, b) => b.value - a.value).slice(0, 10)
        .map((b, i) => ({ ...b, color: SHADES[i % SHADES.length] }));
    const currency = getCurrency();
    drawDonut({ svg, legend, tooltip: getEl('exposure-tooltip'), items, format: v => formatCurrency(v, currency) });

    if (mode === 'symbol') {
        Promise.all(items.map(it => it.symbol ? iconColor(it.symbol) : null)).then(colors => {
            if (lastCompositionHash !== hash) return;
            let changed = false;
            colors.forEach((c, i) => { if (c) { items[i].color = c; changed = true; } });
            if (changed) drawDonut({ svg, legend, tooltip: getEl('exposure-tooltip'), items, format: v => formatCurrency(v, currency) });
        });
    }
}

const TRADES_KEY = 'nemeris_trades';
export function loadLocalTrades() {
    try { return JSON.parse(localStorage.getItem(TRADES_KEY) || '{}') || {}; } catch { return {}; }
}
function saveLocalTrades(all) {
    try { localStorage.setItem(TRADES_KEY, JSON.stringify(all)); } catch { /* storage full */ }
}
const stockInfo = p => ({ symbol: p.symbol, ticker: p.ticker, name: p.name, type: p.type || 'equity', currency: p.currency || p.raw?.currency || '', country: p.raw?.country || p.country || '', isin: p.raw?.isin || p.isin || '' });

const isoDate = date => String(date).split('-').map((part, i) => (i ? part.padStart(2, '0') : part)).join('-');
const tradeKey = t => `${isoDate(t.date)}|${t.shares}|${Number(t.amount).toFixed(2)}`;

/** Trades typed in this browser that json/portfolio.json now contains too (after an export was committed). */
function alreadyInFile(pos) {
    const inFile = new Set([...(pos.raw?.purchases || []), ...(pos.raw?.sales || [])].map(tradeKey));
    return t => inFile.has(tradeKey(t));
}

function mergeTrades(pos, local = loadLocalTrades()[pos.symbol]) {
    const known = alreadyInFile(pos);
    pos.purchases = [...(pos.raw?.purchases || []), ...(local?.purchases || []).filter(t => !known(t))];
    pos.sales = [...(pos.raw?.sales || []), ...(local?.sales || []).filter(t => !known(t))];
    const c = calculateStockValues(pos);
    Object.assign(pos, { shares: c.shares, investment: c.investment, costBasis: c.costBasis, realizedPL: c.realizedPL, purchaseDate: c.purchaseDate, costCurrency: c.costCurrency });
}

function afterTradesChanged(symbol) {
    mergeTrades(positions[symbol]);
    syncExportButtons();
    placeTabs(symbol);
    refreshPositionViews(symbol);
    updatePortfolioSummary();
    if (getEl('card-portfolio')?.classList.contains('active')) refreshAnalyticsTab(activePortfolioTab());
}

/** Saves a trade typed on a stock page. It lives in this browser, next to json/portfolio.json. */
export function recordTrade(symbol, { side, date, shares, amount, currency = currencyCode() }) {
    const pos = positions[symbol];
    if (!pos) return;
    const all = loadLocalTrades();
    const entry = all[symbol] ||= { stock: stockInfo(pos), purchases: [], sales: [] };
    const trade = { id: Date.now().toString(36), date, shares, amount: side === 'buy' ? -Math.abs(amount) : Math.abs(amount), currency, local: true };
    (side === 'buy' ? entry.purchases : entry.sales).push(trade);
    saveLocalTrades(all);
    afterTradesChanged(symbol);
}

export function deleteTrade(symbol, id) {
    const all = loadLocalTrades();
    const entry = all[symbol];
    if (!entry) return;
    entry.purchases = entry.purchases.filter(t => t.id !== id);
    entry.sales = entry.sales.filter(t => t.id !== id);
    if (!entry.purchases.length && !entry.sales.length) delete all[symbol];
    saveLocalTrades(all);
    afterTradesChanged(symbol);
}

const catalogLists = {};
const cleanTrades = list => list
    .map(({ date, amount, shares, currency }) => ({ date: isoDate(date), amount: Number(Number(amount).toFixed(2)), shares, ...(currency && currency !== 'EUR' && { currency }) }))
    .sort((a, b) => a.date.localeCompare(b.date));

/** Downloads json/portfolio.json as it should now be: the file's trades plus the ones typed in this browser. */
export function exportPortfolio() {
    const out = {};
    for (const pos of Object.values(positions)) {
        const purchases = cleanTrades(pos.purchases || []), sales = cleanTrades(pos.sales || []);
        if (purchases.length || sales.length) out[pos.symbol] = { purchases, sales };
    }
    downloadText('portfolio.json', `${JSON.stringify(out, null, 2)}\n`);
}

/** Instruments added in this browser that json/<type>.json does not list yet, by type. */
export function instrumentsToAdd() {
    const byType = {};
    for (const pos of Object.values(positions)) {
        if (!pos.raw?.addedHere) continue;
        const { symbol, ticker, name, isin = '', country = '', currency = '', type = 'equity' } = pos.raw;
        (byType[type] ||= []).push({ symbol, ticker, name, isin, country, currency, type });
    }
    return byType;
}

/** Downloads each json/<type>.json that needs the instruments added in this browser. */
export function exportInstrumentLists() {
    for (const [type, added] of Object.entries(instrumentsToAdd())) {
        const listed = (catalogLists[type] || []).map(({ purchases, sales, ...instrument }) => instrument);
        downloadText(`${type}.json`, `${JSON.stringify([...listed, ...added], null, 2)}\n`);
    }
}

function forgetTradesNowInFile(local) {
    let changed = false;
    for (const [symbol, entry] of Object.entries(local)) {
        const pos = positions[symbol];
        if (!pos) continue;
        const known = alreadyInFile(pos);
        const before = entry.purchases.length + entry.sales.length;
        entry.purchases = entry.purchases.filter(t => !known(t));
        entry.sales = entry.sales.filter(t => !known(t));
        if (entry.purchases.length + entry.sales.length !== before) changed = true;
        if (!entry.purchases.length && !entry.sales.length) delete local[symbol];
    }
    if (changed) saveLocalTrades(local);
}

function syncExportButtons() {
    const lists = Object.keys(instrumentsToAdd());
    const btn = getEl('export-instruments');
    if (!btn) return;
    btn.hidden = !lists.length;
    btn.querySelector('span').textContent = lists.map(type => `${type}.json`).join(', ');
}

getEl('export-portfolio')?.addEventListener('click', exportPortfolio);
getEl('export-instruments')?.addEventListener('click', exportInstrumentLists);

export async function loadStocks() {
    let orders = {};
    try {
        const r = await fetch('json/portfolio.json');
        if (r.ok) orders = await r.json();
    } catch (e) { console.error('Error loading portfolio.json', e); }

    const lists = await Promise.all(TYPE_ORDER.map(type => fetch(`json/${type}.json`).then(r => r.ok ? r.json() : []).catch(() => [])));
    TYPE_ORDER.forEach((type, i) => { catalogLists[type] = lists[i]; });
    const list = lists.flat();
    for (const s of list) {
        s.purchases = orders[s.symbol]?.purchases || [];
        s.sales = orders[s.symbol]?.sales || [];
    }
    const local = loadLocalTrades();
    for (const [sym, entry] of Object.entries(local)) {
        if (!list.some(s => s.symbol === sym) && entry.stock) list.push({ ...entry.stock, symbol: sym, purchases: [], sales: [], addedHere: true });
    }

    for (const id of ['portfolio-tabs', 'general-tabs', 'mobile-portfolio-tabs', 'mobile-general-tabs']) getEl(id)?.replaceChildren();

    for (const s of list) {
        const pos = {
            symbol: s.symbol, ticker: s.ticker, name: s.name, type: s.type, currency: s.currency,
            news: [], lastNewsFetch: 0, chart: null, lastFetch: 0, lastData: null, currentPeriod: globalPeriod,
            suspended: s.suspended || isSymbolSuspendedInStorage(s.symbol), raw: s,
        };
        mergeTrades(pos, local[s.symbol]);
        positions[s.symbol] = pos;
        lastApiBySymbol[s.symbol] = selectedApi;
    }
    forgetTradesNowInFile(local);
    syncExportButtons();

    for (const s of list) {
        createTab({ ...s, purchases: positions[s.symbol].purchases, sales: positions[s.symbol].sales });
        createCard(s);
    }
    for (const sym of Object.keys(positions)) {
        initChart(sym, positions);
        placeTabs(sym);
    }

    updatePortfolioSummary();
    initPortfolioAnalytics();
    setTimeout(backgroundSuspendedScan, 2500);
    setTimeout(() => batchPerformanceFetch(globalPeriod), 300);
}

export let isBatchFetching = false;

export async function batchPerformanceFetch(period) {
    if (isBatchFetching) return;
    const tickers = Object.values(positions).map(p => p.ticker).filter(Boolean);
    if (!tickers.length) return;

    isBatchFetching = true;
    activity.start('prices', L('Updating prices'), 0);
    try {
        const results = await fetchYahooPeriodChanges(tickers, period, undefined, (d, t) => activity.update('prices', t ? d / t : 1, L('Updating prices {0} / {1}', d, t)));

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
        updatePortfolioSummary();
        if (getEl('card-portfolio')?.classList.contains('active') && activePortfolioTab() === 'portfolio-performance') { renderPerformancePane(); renderDividendsPane(); }
    } catch (e) {
        console.error('[Batch Performance] Error:', e);
    } finally {
        isBatchFetching = false;
        activity.end('prices');
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
                else if (batchAnswered && isAlive === undefined) markTabAsSuspended(symbol);
            }
        }

        if (i + BATCH_SIZE < candidates.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }
}

const activePortfolioTab = () => getEl('card-portfolio')?.querySelector('.card-tab-btn.active')?.dataset.target || 'portfolio-performance';

export function openPortfolio() {
    showCard('card-portfolio');
    refreshAnalyticsTab(activePortfolioTab());
}

export function initPortfolioAnalytics() {
    const card = getEl('card-portfolio');
    if (!card || card.dataset.bound) return;
    card.dataset.bound = '1';
    card.addEventListener('click', e => {
        const tabBtn = e.target.closest('.card-tab-btn');
        if (tabBtn) { refreshAnalyticsTab(tabBtn.dataset.target); return; }
        const row = e.target.closest('.row[data-symbol], .legend-row[data-symbol]');
        if (row && positions[row.dataset.symbol]) openCustomSymbol(row.dataset.symbol);
    });
    card.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const row = e.target.closest('.row[data-symbol], .legend-row[data-symbol]');
        if (row && positions[row.dataset.symbol]) { e.preventDefault(); openCustomSymbol(row.dataset.symbol); }
    });
    initAnalysisPane();
}

async function refreshAnalyticsTab(tab) {
    if (tab === 'portfolio-performance') {
        renderPerformancePane();
        renderDiversificationPane();
        renderDividendsPane();
    } else if (tab === 'portfolio-analysis') renderAnalysisPane();
    else if (tab === 'portfolio-ai') renderAiLabPane();
}

let metadataPromise = null;
async function fetchAllPortfolioMetadata(onProgress) {
    const symbols = Object.keys(positions).filter(s => positions[s].shares > 0 && !positions[s].analyticsFetched);
    if (symbols.length === 0) { onProgress?.(1, 1); return metadataPromise; }
    if (metadataPromise) return metadataPromise;

    const { fetchYahooQuoteSummary } = await import('../data/yahoo-finance.js');
    const modules = ['calendarEvents', 'summaryDetail', 'defaultKeyStatistics', 'assetProfile'];
    let done = 0;
    activity.start('metadata', L('Loading company details'), 0);
    onProgress?.(0, symbols.length);
    metadataPromise = Promise.all(symbols.map(async s => {
        positions[s].analyticsFetched = true;
        try {
            // The Yahoo ticker (DCAM.PA), not the portfolio key (DCAM): Yahoo answers 404 to the key.
            const metadata = await fetchYahooQuoteSummary(positions[s].ticker || s, modules);
            if (metadata) positions[s].metadata = metadata;
        } finally {
            done++;
            onProgress?.(done, symbols.length);
            activity.update('metadata', done / symbols.length);
        }
    })).finally(() => { activity.end('metadata'); metadataPromise = null; });
    return metadataPromise;
}

function renderDiversificationPane() {
    initExposureToggle();
    updatePortfolioComposition();
    if (Object.values(positions).some(p => p.shares > 0 && !p.metadata)) {
        fetchAllPortfolioMetadata().then(() => { lastCompositionHash = ''; updatePortfolioComposition(); });
    }
    initPortfolioValueChart();
    renderPortfolioValueChart();
}

let portfolioValueChart = null;
let portfolioValuePeriod = '1W';
let portfolioValueController = null;
let portfolioValueLastKey = '';

function syncValuePills() {
    document.querySelectorAll('.pf-period-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.period === portfolioValuePeriod));
}

function initPortfolioValueChart() {
    const pills = document.querySelector('.pf-period-pills');
    syncValuePills();
    if (!pills || pills.dataset.bound) return;
    pills.dataset.bound = '1';
    pills.addEventListener('click', e => {
        const b = e.target.closest('.pill');
        if (!b || b.dataset.period === portfolioValuePeriod) return;
        portfolioValuePeriod = b.dataset.period;
        syncValuePills();
        renderPortfolioValueChart(portfolioValuePeriod, true);
    });
}

async function renderPortfolioValueChart(period = portfolioValuePeriod, force = false) {
    const canvas = getEl('portfolio-value-canvas');
    const container = getEl('portfolio-value-container');
    if (!canvas || !window.Chart) return;

    const held = Object.values(positions).filter(p => (p.shares || 0) > 0 && p.ticker);
    const key = `${period}-${held.map(p => p.symbol).sort().join(',')}`;
    if (!force && key === portfolioValueLastKey && portfolioValueChart) return;
    portfolioValueLastKey = key;

    if (!held.length) {
        container?.classList.add('empty');
        return;
    }

    if (portfolioValueController) portfolioValueController.abort();
    const controller = new AbortController();
    portfolioValueController = controller;

    const bar = progressBar({ label: L('Loading holdings history'), compact: true });
    bar.el.classList.add('chart-progress');
    container?.querySelector('.chart-progress')?.remove();
    container?.prepend(bar.el);
    let loaded = 0;
    const results = await Promise.all(held.map(async pos => {
        try {
            const d = await fetchFromYahoo(pos.ticker, period, pos.symbol, pos, pos.name, controller.signal);
            if (!d || d.error || !d.timestamps?.length) return null;
            return { shares: pos.shares, currency: priceCurrency(pos), timestamps: d.timestamps, prices: d.prices, interval: d.interval };
        } catch (_) { return null; }
        finally { loaded++; bar.set(loaded / held.length, L('Loading holdings history'), `${loaded} / ${held.length}`); }
    }));
    bar.remove();

    if (controller.signal.aborted) return;

    const valid = results.filter(Boolean);
    if (!valid.length) {
        container?.classList.add('empty');
        return;
    }

    const tsSet = new Set();
    valid.forEach(v => v.timestamps.forEach(t => tsSet.add(t)));
    const ts = Array.from(tsSet).sort((a, b) => a - b);
    const interval = valid[0].interval;

    const values = new Array(ts.length).fill(0);

    // Ensure timeline starts on the first ever recorded order date
    let earliestPurchase = null;
    held.forEach(p => {
        if (p.purchaseDate) {
            const d = new Date(p.purchaseDate);
            if (!earliestPurchase || d < earliestPurchase) earliestPurchase = d;
        }
    });
    if (earliestPurchase && ts[0] > earliestPurchase.getTime()) {
        // prepend a zero‑value point so the chart begins on the first order date
        const earliestTs = earliestPurchase.getTime();
        ts.unshift(earliestTs);
        values.unshift(0);
    }

    // Each line in the user's currency, at today's rate: the curve shows the holdings, not past exchange rates.
    const user = currencyCode();
    valid.forEach(v => {
        const aligned = alignBenchmarkToTimestamps(ts, v.timestamps, v.prices);
        for (let i = 0; i < ts.length; i++) {
            if (aligned[i] != null) values[i] += convert(aligned[i] * v.shares, v.currency, user);
        }
    });

    container?.classList.remove('empty');

    const fakePositions = { __PORTFOLIO_VALUE__: { shares: 0, costBasis: 0 } };
    if (!portfolioValueChart) portfolioValueChart = createMainChart(canvas, '__PORTFOLIO_VALUE__', fakePositions);

    const labels = ts.map(t => buildLabel(t, period, interval));
    renderLine(portfolioValueChart, {
        labels, prices: values, ts, opens: null, highs: null, lows: null, closes: null,
        symbol: '__PORTFOLIO_VALUE__', positions: fakePositions
    });
    portfolioValueChart.update();
}

function renderPerformancePane() {
    const currency = getCurrency();
    const money = n => formatCurrency(n, currency);
    const signed = n => `${n >= 0 ? '+' : ''}${money(n)}`;
    const row = ({ symbol, name, pl, pct, sub }) => {
        const tone = pl >= 0 ? 'positive' : 'negative';
        return `<div class="row" data-symbol="${symbol}" tabindex="0">
                <img class="row-logo" src="img/icon/${symbol}.png" alt="" loading="lazy">
                <div class="row-main"><span class="row-title">${name}</span><span class="row-sub">${sub}</span></div>
                <div class="row-end"><span class="row-value ${tone}">${signed(pl)}</span><span class="row-sub ${tone}">${formatPct(pct)}</span></div>
            </div>`;
    };

    let totalValue = 0, totalCost = 0, unrealized = 0, realized = 0;
    let realizedGains = 0, realizedLosses = 0, unrealizedGains = 0, unrealizedLosses = 0;
    const active = [], closed = [];
    const user = currencyCode();
    const inUser = t => convert(Math.abs(t.amount || 0), t.currency || 'EUR', user);
    for (const [s, pos] of Object.entries(positions)) {
        const r = convert(pos.realizedPL || 0, paidCurrency(pos), user);
        realized += r;
        if (r > 0) realizedGains += r; else realizedLosses -= r;
        if ((pos.shares || 0) > 0) {
            const { value, cost } = positionMoney(pos);
            const pl = value - cost;
            if (pl > 0) unrealizedGains += pl; else unrealizedLosses -= pl;
            totalValue += value;
            totalCost += cost;
            unrealized += pl;
            active.push({ symbol: s, name: pos.name || s, pl, pct: cost > 0 ? (pl / cost) * 100 : 0, sub: Ln(pos.shares, '{0} share · worth {1}', '{0} shares · worth {1}', money(value)) });
        } else if (pos.sales?.length) {
            const invested = (pos.purchases || []).reduce((sum, x) => sum + inUser(x), 0);
            const received = pos.sales.reduce((sum, x) => sum + inUser(x), 0);
            const pl = r || (received - invested);
            closed.push({ symbol: s, name: pos.name || s, pl, pct: invested > 0 ? (pl / invested) * 100 : 0, sub: L('Sold for {0}', money(received)) });
        }
    }

    setText('perf-total-value', money(totalValue));
    setText('perf-total-delta', totalCost ? L('You put in {0}', money(totalCost)) : '');
    const allTime = unrealized + realized;
    const gainTile = getEl('pf-gain');
    if (gainTile) {
        const v = getEl('pf-gain-value');
        v.textContent = signed(allTime);
        v.className = `kpi-value ${allTime >= 0 ? 'positive' : 'negative'}`;
        const pct = totalCost > 0 ? (unrealized / totalCost) * 100 : 0;
        setText('pf-gain-sub', Math.abs(realized) > 0.01
            ? L('{0} unsold · {1} cashed in', signed(unrealized), signed(realized))
            : L('{0}{1}% on what you put in', pct >= 0 ? '+' : '', pct.toFixed(1)));
    }

    const list = getEl('perf-positions');
    if (list) list.innerHTML = active.length ? active.sort((a, b) => b.pl - a.pl).map(row).join('') : L('<p class="empty">No positions yet.</p>');
    const closedSection = getEl('perf-closed-section');
    if (closedSection) {
        closedSection.hidden = !closed.length;
        if (closed.length) getEl('perf-closed').innerHTML = closed.sort((a, b) => b.pl - a.pl).map(row).join('');
    }
    updatePerformanceChart(realizedGains, unrealizedGains, realizedLosses + unrealizedLosses);
}

async function renderDividendsPane() {
    const currency = getCurrency();
    const list = getEl('dividend-list');
    if (!list) return;
    if (Object.values(positions).some(p => p.shares > 0 && !p.metadata)) {
        const bar = progressBar({ label: L('Loading dividends'), compact: true });
        list.replaceChildren(bar.el);
        await fetchAllPortfolioMetadata((d, t) => bar.set(t ? d / t : 1, L('Loading dividends'), `${d} / ${t}`));
    }
    const raw = x => (typeof x === 'object' && x !== null ? x.raw : x);
    const payers = [];
    let income = 0, worth = 0;
    for (const [s, pos] of Object.entries(positions)) {
        if (!(pos.shares > 0)) continue;
        const sd = pos.metadata?.summaryDetail, ks = pos.metadata?.defaultKeyStatistics, cal = pos.metadata?.calendarEvents;
        const rate = raw(sd?.dividendRate) || raw(ks?.trailingAnnualDividendRate) || 0;
        const yieldPct = (raw(sd?.dividendYield) ?? raw(sd?.trailingAnnualDividendYield) ?? 0) * 100;
        worth += positionMoney(pos).value;
        if (rate > 0) {
            const perYear = convert(rate * pos.shares, priceCurrency(pos), currencyCode());
            income += perYear;
            const exd = raw(cal?.exDividendDate), pay = raw(cal?.dividendDate);
            payers.push({ symbol: s, name: pos.name || s, yieldPct, perYear, ex: exd ? new Date(exd * 1000) : null, pay: pay ? new Date(pay * 1000) : null });
        }
    }
    const day = d => d?.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    setText('dividend-total', formatCurrency(income, currency));
    setText('dividend-meta', payers.length ? Ln(payers.length, '{1}% yield · {0} payer', '{1}% yield · {0} payers', (worth > 0 ? income / worth * 100 : 0).toFixed(2)) : L('None of your stocks pays one'));
    list.innerHTML = payers.length
        ? payers.sort((a, b) => b.perYear - a.perYear).map(p => `
            <div class="row" data-symbol="${p.symbol}" tabindex="0">
                <img class="row-logo" src="img/icon/${p.symbol}.png" alt="" loading="lazy">
                <div class="row-main"><span class="row-title">${p.name}</span><span class="row-sub">${L('{0}% a year{1}{2}', p.yieldPct.toFixed(2), p.ex ? L(' · own it before {0}', day(p.ex)) : '', p.pay ? L(' · paid {0}', day(p.pay)) : '')}</span></div>
                <div class="row-end"><span class="row-value positive">+${formatCurrency(p.perYear, currency)}</span><span class="row-sub">${L('per year')}</span></div>
            </div>`).join('')
        : L('<p class="empty">No dividends from your current stocks.</p>');
}

export function initExposureToggle() {
    const panel = getEl('exposure-panel');
    if (!panel || panel.dataset.bound) return;
    panel.dataset.bound = '1';
    panel.querySelector('.exposure-modes')?.addEventListener('click', e => {
        const b = e.target.closest('.exposure-mode');
        if (!b) return;
        panel.querySelectorAll('.exposure-mode').forEach(x => x.classList.toggle('active', x === b));
        panel.dataset.mode = b.dataset.mode;
        lastCompositionHash = '';
        updatePortfolioComposition();
    });
}

function updatePerformanceChart(earned, open, lost) {
    const section = getEl('perf-chart-section');
    const svg = getEl('perf-chart-svg');
    const legend = getEl('perf-chart-legend');
    if (!section || !svg || !legend) return;
    const items = [
        { label: L('Realized'), value: earned, color: colors().pos },
        { label: L('Unrealized'), value: open, color: colors().accent },
        { label: L('Losses'), value: lost, color: colors().neg },
    ].filter(x => x.value > 0);
    section.hidden = !items.length;
    const currency = getCurrency();
    drawDonut({ svg, legend, tooltip: getEl('perf-chart-tooltip'), items, format: v => formatCurrency(v, currency) });
}
