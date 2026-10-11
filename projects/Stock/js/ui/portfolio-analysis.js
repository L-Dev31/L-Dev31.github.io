import { positions, getCurrency, comfortLevel, COMFORT_WORD } from '../core/state.js';
import { positionMoney, paidCurrency } from '../data/holdings.js';
import { convert } from '../data/rates.js';
import { getEl, progressBar, formatCurrency, termHtml, iconHtml } from '../core/utils.js';
import { fetchSeries, alignSeries } from '../quant/quant-shared.js';
import { runQuant, QuantEngine } from '../quant/quant-client.js';
import { L } from '../i18n/i18n.js';
import { colors, alpha } from '../core/palette.js';

const BENCHMARK = '^STOXX50E';
const BENCHMARK_LABEL = 'EURO STOXX 50';
const MIN_SAMPLES = 30;

let lastRange = '1y';
let rendering = false;
let loadingBar = null;

function showProgress(frac, label, detail) {
    if (!loadingBar) {
        loadingBar = progressBar({ label });
        getEl('analysis-plain')?.before(loadingBar.el);
    }
    loadingBar.set(frac, label, detail);
}

export function initAnalysisPane() {
    const pills = document.querySelector('.analysis-pills');
    pills?.addEventListener('click', e => {
        const b = e.target.closest('.pill');
        if (!b || b.dataset.range === lastRange) return;
        lastRange = b.dataset.range;
        getEl('analysis-range').value = lastRange;
        for (const x of pills.querySelectorAll('.pill')) x.classList.toggle('active', x === b);
        renderAnalysisPane(true);
    });
}

export async function renderAnalysisPane(force = false) {
    if (rendering && !force) return;
    const heroEl = getEl('analysis-hero'), metricsEl = getEl('analysis-metrics-list'), contribEl = getEl('risk-contrib'), matrixEl = getEl('correlation-matrix');
    if (!heroEl || !metricsEl || !matrixEl || !contribEl) return;
    // Empties the result blocks, leaving a message in the metrics one.
    const empty = message => {
        heroEl.innerHTML = contribEl.innerHTML = matrixEl.innerHTML = '';
        metricsEl.innerHTML = message;
    };

    const active = Object.entries(positions).filter(([, p]) => (p.shares || 0) > 0);
    if (!active.length) {
        getEl('analysis-plain').innerHTML = L('<p class="empty">Add a trade on a stock page and Nemeris shows how risky your portfolio is here.</p>');
        empty('');
        return;
    }

    rendering = true;
    try {
        const range = lastRange;
        const subtitleEl = getEl('analysis-subtitle');
        if (subtitleEl) subtitleEl.textContent = L('Today\'s mix applied to the last {0}', range.replace('mo', L(' months')).replace('y', range === '1y' ? L(' year') : L(' years')));
        const weights = {}, symbols = [], pending = [];
        let totalValue = 0, loaded = 0;
        const steps = active.length + 1;
        const fetched = () => { loaded++; showProgress(loaded / steps * 0.8, L('Loading price histories'), `${loaded} / ${steps}`); };
        showProgress(0, L('Loading price histories'), `0 / ${steps}`);
        for (const [sym, pos] of active) {
            const { value } = positionMoney(pos);
            if (value <= 0) continue;
            weights[sym] = value;
            totalValue += value;
            symbols.push(sym);
            pending.push(fetchSeries(pos.ticker || sym, range, '1d').finally(fetched));
        }
        if (totalValue <= 0) return;
        for (const s of symbols) weights[s] /= totalValue;

        const currencyMixed = new Set(active.map(([, p]) => p.currency || p.lastData?.currency).filter(Boolean).map(c => String(c).toUpperCase())).size > 1;

        pending.push(fetchSeries(BENCHMARK, range, '1d').finally(fetched));
        const seriesArr = await Promise.all(pending);
        const benchSeries = seriesArr.pop();

        const seriesMap = {};
        symbols.forEach((s, i) => { if (seriesArr[i].closes.length >= MIN_SAMPLES) seriesMap[s] = seriesArr[i]; });
        const validSymbols = Object.keys(seriesMap);
        if (!validSymbols.length) return empty(L('<p class="empty">Not enough price history yet.</p>'));

        const validTotal = validSymbols.reduce((sum, s) => sum + weights[s], 0);
        for (const s of validSymbols) weights[s] /= validTotal;

        const { ts, pricesMap } = alignSeries(seriesMap);
        if (ts.length < MIN_SAMPLES) return empty(L('<p class="empty">Not enough shared history yet (30 trading days needed).</p>'));

        const assetReturns = {}, dailyVol = {};
        for (const s of validSymbols) {
            assetReturns[s] = QuantEngine.calculateReturns(pricesMap[s]);
            dailyVol[s] = QuantEngine.calculateVolatility(assetReturns[s]);
        }
        // The portfolio as one price series: today's weights applied to each day's returns, starting at 100.
        const portPrices = [100];
        for (let i = 0; i < assetReturns[validSymbols[0]].length; i++) {
            portPrices.push(portPrices[i] * (1 + validSymbols.reduce((sum, s) => sum + weights[s] * assetReturns[s][i], 0)));
        }

        const benchAt = new Map(benchSeries.ts.map((t, i) => [t, benchSeries.closes[i]]));
        const benchAligned = ts.map(t => benchAt.get(t)).filter(v => v != null);
        const hasBench = benchAligned.length >= MIN_SAMPLES;

        showProgress(0.85, L('Computing risk metrics'), L('{0} positions, {1} days', validSymbols.length, ts.length));
        const [annVol, sharpe, sortino, maxDD, var95, cvar95, beta, corrMatrix] = await Promise.all([
            runQuant('annualizedVolatility', portPrices),
            runQuant('calculateSharpeRatio', portPrices),
            runQuant('calculateSortinoRatio', portPrices),
            runQuant('calculateMaxDrawdown', portPrices),
            runQuant('calculateVaR', portPrices, 0.95),
            runQuant('calculateCVaR', portPrices, 0.95),
            hasBench ? runQuant('calculateBeta', portPrices, benchAligned) : null,
            runQuant('correlationMatrix', pricesMap),
        ]);

        const totalReturn = ((portPrices[portPrices.length - 1] - 100) / 100) * 100;
        const portDailyVol = annVol / Math.sqrt(252);
        const weightedAvgVol = validSymbols.reduce((sum, s) => sum + weights[s] * dailyVol[s], 0);
        const diversification = portDailyVol > 0 ? weightedAvgVol / portDailyVol : 0;

        // A stock's share of the swings is its weight times its beta to the portfolio.
        const contribRows = validSymbols.map(s => ({
            symbol: s,
            name: positions[s].name || s,
            weight: weights[s],
            vol: dailyVol[s] * Math.sqrt(252),
            beta: hasBench ? QuantEngine.calculateBeta(pricesMap[s], benchAligned) : null,
            contrib: weights[s] * QuantEngine.calculateBeta(pricesMap[s], portPrices),
        })).sort((a, b) => b.contrib - a.contrib);

        const targetWeights = QuantEngine.inverseVolWeights(Object.fromEntries(contribRows.map(r => [r.symbol, r.vol])));
        for (const r of contribRows) r.target = targetWeights[r.symbol] || 0;

        const allTrades = [];
        for (const pos of Object.values(positions)) {
            // The engine knows no currencies: every trade is counted in the one the position's cost is in.
            const inCostCurrency = t => ({ ...t, amount: t.amount < 0 ? -convert(-t.amount, t.currency || 'EUR', paidCurrency(pos)) : convert(t.amount || 0, t.currency || 'EUR', paidCurrency(pos)) });
            allTrades.push(...QuantEngine.extractTradeEvents({ symbol: pos.symbol, purchases: pos.purchases?.map(inCostCurrency), sales: pos.sales?.map(inCostCurrency) }));
        }

        renderPlain({ annVol, maxDD, var95, totalValue, contribRows, weights });
        renderHero({ totalReturn, annVol, sharpe, beta, currencyMixed });
        renderMetrics({ sortino, maxDD, var95, cvar95, diversification, samples: ts.length });
        renderTradingEdge(QuantEngine.tradeStats(allTrades));
        renderContributors(contribRows);
        renderCorrelationMatrix(validSymbols, corrMatrix, Object.fromEntries(contribRows.map(r => [r.symbol, r.name])));
    } catch (e) {
        console.error('[Analysis] error:', e);
        metricsEl.innerHTML = `<p class="empty">${L('Could not compute the risk: {0}', escapeHtml(e?.message || e))}</p>`;
    } finally {
        rendering = false;
        loadingBar?.remove();
        loadingBar = null;
    }
}

const riskClass = vol => [0.005, 0.05, 0.12, 0.20, 0.30, 0.80].findIndex(x => vol < x) + 1 || 7;

function renderPlain({ annVol, maxDD, var95, totalValue, contribRows, weights }) {
    const host = getEl('analysis-plain');
    if (!host) return;
    const cur = getCurrency();
    const level = riskClass(annVol);
    const comfort = comfortLevel();
    const money = pctValue => formatCurrency(Math.abs(totalValue * pctValue / 100), cur);
    const scale = Array.from({ length: 7 }, (_, i) => `<span class="${i + 1 <= level ? 'on' : ''}${comfort === i + 1 ? ' comfort' : ''}"></span>`).join('');
    let fit;
    if (!comfort) fit = L('Set your comfort in Settings › Profile to compare.');
    else if (level > comfort) fit = L('<span class="negative">{0} above your comfort ({1}/7).</span> More stocks or an ETF would calm it.', level - comfort, comfort);
    else if (level < comfort - 1) fit = L('Calmer than your comfort ({0}/7).', comfort);
    else fit = L('<span class="positive">Fits your comfort ({0}/7).</span>', comfort);
    const top = contribRows[0];
    const heaviest = Object.entries(weights).sort((a, b) => b[1] - a[1])[0];
    const tips = [];
    if (heaviest && heaviest[1] > 0.4) tips.push(L('{0}% of your money is in <strong>{1}</strong>.', Math.round(heaviest[1] * 100), escapeHtml(positions[heaviest[0]]?.name || heaviest[0])));
    else if (top && top.contrib > 0.35) tips.push(L('<strong>{0}</strong> makes {1}% of the swings.', escapeHtml(top.name), Math.round(top.contrib * 100)));
    host.innerHTML = `
        <section class="panel risk-plain" aria-labelledby="risk-plain-title">
            <div class="panel-head">
                <h2 class="panel-title" id="risk-plain-title">${L('Your {0}', termHtml('risk', L('risk')))}</h2>
                <p class="risk-level"><strong>${level}/7</strong> ${COMFORT_WORD[level]}</p>
            </div>
            <div>
                <div class="risk-scale" role="img" aria-label="${L('Risk level {0} out of 7{1}', level, comfort ? L(', your comfort {0}', comfort) : '')}">${scale}</div>
                <div class="risk-scale-labels"><span>${L('Calm')}</span>${comfort ? L('<span class="comfort-key">Outlined: your comfort</span>') : ''}<span>${L('Wild')}</span></div>
            </div>
            <p class="risk-verdict">${fit}</p>
            <div class="facts risk-facts">
                <div class="fact">${iconHtml('swap')}<strong>${L('±{0}% a year', (annVol * 100).toFixed(0))}</strong><span class="meta">${L('Typical swing')}</span></div>
                <div class="fact">${iconHtml('trend-down')}<strong class="negative">${fmtPct(maxDD)} · ${money(maxDD)}</strong><span class="meta">${termHtml('drawdown', L('Worst drop'))}</span></div>
                <div class="fact">${iconHtml('event')}<strong class="negative">${fmtPct(var95)} · ${money(var95)}</strong><span class="meta">${L('Bad day (1 in 20)')}</span></div>
            </div>
            ${tips.length ? `<p class="risk-tip">${iconHtml('lightbulb')}<span>${tips.join(' ')}</span></p>` : ''}
        </section>`;
}

const heroCard = (label, value, signed, hint = '') =>
    `<div class="kpi"><span class="kpi-label"${hint ? ` title="${hint}"` : ''}>${label}</span><span class="kpi-value ${signed > 0 ? 'positive' : signed < 0 ? 'negative' : ''}">${value}</span></div>`;

function renderHero({ totalReturn, annVol, sharpe, beta, currencyMixed }) {
    const fxNote = currencyMixed ? L(' Holdings span several currencies: exchange-rate moves are not included.') : '';
    getEl('analysis-hero').innerHTML = `
        ${heroCard(L('Total return*'), fmtPct(totalReturn), totalReturn, L('Constant-weight reconstruction: today’s weights applied to past returns, not the return actually realized over time.') + fxNote)}
        ${heroCard(L('Annualized volatility'), fmtPct(annVol * 100).replace(/^\+/, ''), 0, L('Measure of price fluctuations over a year (lower is less volatile)'))}
        ${heroCard(L('Sharpe ratio'), fmtNum(sharpe), sharpe, L('Risk-adjusted performance (excess return over the euro risk-free rate ÷ volatility; higher is better)'))}
        ${heroCard(`Beta vs ${BENCHMARK_LABEL}`, beta == null ? L('n/a') : fmtNum(beta), 0, L('Systematic risk relative to the benchmark: 1 moves with it, below 1 moves less.') + fxNote)}
    `;
}

const good = ok => (ok ? 'positive' : 'negative');

/** Label / value rows; cls colours the value. */
function metricRows(hostId, items) {
    const host = getEl(hostId);
    if (host) host.innerHTML = items.map(m => `
        <div class="metric-item">
            <span class="metric-label"${m.hint ? ` title="${m.hint}"` : ''}>${m.label}</span>
            <span class="metric-value ${m.cls || ''}">${m.value}</span>
        </div>
    `).join('');
}

function renderMetrics({ sortino, maxDD, var95, cvar95, diversification, samples }) {
    metricRows('analysis-metrics-list', [
        { label: L('Sortino ratio'), value: fmtNum(sortino), hint: L('Risk-adjusted return (downside only)') },
        { label: 'Max drawdown', value: fmtPct(maxDD), hint: L('Worst peak-to-trough decline'), cls: maxDD < 0 ? 'negative' : '' },
        { label: 'VaR 95% (1d)', value: fmtPct(var95), hint: L('Worst expected daily loss (95% confidence)'), cls: var95 < 0 ? 'negative' : '' },
        { label: 'CVaR 95% (1d)', value: fmtPct(cvar95), hint: L('Average loss in worst 5% of days'), cls: cvar95 < 0 ? 'negative' : '' },
        { label: L('Diversification ratio'), value: fmtNum(diversification), hint: L('Weighted volatility of the holdings divided by the portfolio volatility. Higher is more diversified.') },
        { label: L('Samples'), value: String(samples), hint: L('Common trading days analyzed') },
    ]);
}

function renderContributors(rows) {
    const host = getEl('risk-contrib');
    if (!host) return;
    if (!rows.length) { host.innerHTML = ''; return; }
    const body = rows.map(r => {
        const delta = r.weight - r.target;
        return `
        <tr>
            <td class="risk-contrib-name">${r.name}</td>
            <td class="risk-contrib-sym">${r.symbol}</td>
            <td>${fmtPct(r.weight * 100)}</td>
            <td class="risk-contrib-target">
                <span>${fmtPct(r.target * 100)}</span>
                <span class="risk-contrib-delta ${Math.abs(delta) < 0.02 ? 'neutral' : delta > 0 ? 'over' : 'under'}">${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}</span>
            </td>
            <td>${fmtPct(r.vol * 100)}</td>
            <td>${r.beta == null ? L('n/a') : fmtNum(r.beta)}</td>
            <td>
                <div class="risk-contrib-bar">
                    <div class="risk-contrib-bar-fill ${r.contrib < 0 ? 'negative' : ''}" style="width:${Math.min(100, Math.abs(r.contrib) * 100)}%"></div>
                    <span class="risk-contrib-bar-label">${fmtPct(r.contrib * 100)}</span>
                </div>
            </td>
        </tr>
    `;
    }).join('');
    host.innerHTML = `
        <thead><tr>
            <th>${L('Name')}</th><th>Ticker</th><th>${L('Weight')}</th>
            <th title="${L('Risk-parity target (inverse-volatility)')}">${L('Target')}</th>
            <th>${L('Ann. Vol')}</th><th>β</th><th>${L('Risk share')}</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

function renderTradingEdge(edge) {
    const host = getEl('trading-edge-list');
    if (!host) return;
    if (!edge || edge.count === 0) {
        host.innerHTML = L('<p class="empty">No closed trades yet. Numbers appear after your first sale.</p>');
        return;
    }
    const sampleNote = edge.count < 30 ? ` <span class="meta" title="${L('Statistically thin: 30 or more trades give stable numbers')}">${L('(few trades)')}</span>` : '';
    metricRows('trading-edge-list', [
        { label: `Win rate · ${edge.wins}W / ${edge.losses}L${sampleNote}`, value: fmtPct(edge.winRate * 100), cls: good(edge.winRate >= 0.5) },
        { label: 'Profit factor', value: edge.profitFactor === Infinity ? '∞' : fmtNum(edge.profitFactor), cls: good(edge.profitFactor >= 1), hint: L('Total gains divided by total losses. Above 1.5 is good.') },
        { label: L('Expectancy / trade'), value: fmtPct(edge.expectancyPct), cls: good(edge.expectancyPct > 0), hint: L('Average result per trade. Must stay positive over time.') },
        { label: 'Reward / Risk (avg R)', value: fmtNum(edge.avgR), cls: good(edge.avgR >= 1), hint: L('Average win % divided by average loss %') },
        { label: L('Avg holding · Best / Worst'), value: L('{0}d · {1} / {2}', Math.round(edge.avgHoldingDays), fmtPct(edge.bestPct), fmtPct(edge.worstPct)) },
        { label: L('Suggested size · ½ Kelly'), value: edge.kelly > 0 ? fmtPct(edge.kelly / 2 * 100) : L('n/a'), hint: L('Half-Kelly cap on per-position sizing given current edge') },
    ]);
}

function renderCorrelationMatrix(symbols, matrix, names) {
    const host = getEl('correlation-matrix');
    if (!host) return;
    host.style.gridTemplateColumns = `88px repeat(${symbols.length}, minmax(58px, 1fr))`;
    const headerCell = s => `
        <div class="matrix-cell matrix-header matrix-header-rich">
            <img class="row-logo" src="img/icon/${s}.png" alt="" loading="lazy">
            <span class="matrix-header-name">${escapeHtml(names[s] || s)}</span>
            <span class="matrix-header-ticker">${s}</span>
        </div>
    `;
    let html = '<div class="matrix-cell matrix-header matrix-header-corner"></div>' + symbols.map(headerCell).join('');
    for (const a of symbols) {
        html += headerCell(a);
        for (const b of symbols) {
            const r = matrix?.[a]?.[b] ?? 0;
            html += `<div class="matrix-cell" style="background:${alpha(r >= 0 ? colors().accent : colors().pos, (Math.min(1, Math.abs(r)) * 0.42).toFixed(3))}" title="${a} / ${b}: ${r.toFixed(3)}">${r.toFixed(2)}</div>`;
        }
    }
    host.innerHTML = html;
}

const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtPct = n => (n == null || !Number.isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);
function fmtNum(n, d = 2) {
    if (n == null || !Number.isFinite(n)) return 'n/a';
    const out = n.toFixed(d);
    return /^-0\.?0*$/.test(out) ? out.slice(1) : out;
}
