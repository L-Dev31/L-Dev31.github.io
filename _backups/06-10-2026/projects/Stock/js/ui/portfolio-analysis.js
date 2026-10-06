import { positions, getCurrency, comfortLevel, COMFORT_WORD } from '../core/state.js';
import { getEl, progressBar, formatCurrency, termHtml, iconHtml } from '../core/utils.js';
import { fetchSeries, alignSeries } from '../quant/quant-shared.js';
import { runQuant, QuantEngine } from '../quant/quant-client.js';
import { L } from '../i18n/i18n.js';

const BENCHMARK = '^STOXX50E';
const BENCHMARK_LABEL = 'EURO STOXX 50';
const DEFAULT_RANGE = '1y';
const MIN_SAMPLES = 30;

let lastRange = DEFAULT_RANGE;
let rendering = false;
let loadingBar = null;

function setLoading(on, frac = null, label = '', detail = '') {
    const host = getEl('analysis-plain');
    if (!on) { loadingBar?.remove(); loadingBar = null; return; }
    if (!loadingBar) {
        loadingBar = progressBar({ label: label || L('Loading price histories') });
        host?.before(loadingBar.el);
    }
    if (frac == null) loadingBar.busy(label, detail);
    else loadingBar.set(frac, label, detail);
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
    rendering = true;

    const heroEl = getEl('analysis-hero');
    const metricsEl = getEl('analysis-metrics-list');
    const contribEl = getEl('risk-contrib');
    const matrixEl = getEl('correlation-matrix');
    const subtitleEl = getEl('analysis-subtitle');
    if (!heroEl || !metricsEl || !matrixEl || !contribEl) { rendering = false; return; }

    const active = Object.entries(positions).filter(([, p]) => (p.shares || 0) > 0);
    if (active.length === 0) {
        getEl('analysis-plain').innerHTML = L('<p class="empty">Add a trade on a stock page and Nemeris shows how risky your portfolio is here.</p>');
        heroEl.innerHTML = '';
        metricsEl.innerHTML = '';
        contribEl.innerHTML = '';
        matrixEl.innerHTML = '';
        rendering = false;
        return;
    }

    try {
        const range = lastRange;
        if (subtitleEl) subtitleEl.textContent = L('Today\'s mix applied to the last {0}', range.replace('mo', L(' months')).replace('y', range === '1y' ? L(' year') : L(' years')));
        const weights = {};
        let totalValue = 0;
        const seriesPromises = [];
        const symbols = [];
        let loaded = 0;
        setLoading(true, 0, L('Loading price histories'), `0 / ${active.length + 1}`);
        for (const [sym, pos] of active) {
            const price = pos.lastData?.price || (pos.costBasis / pos.shares) || 0;
            const value = price * pos.shares;
            if (value <= 0) continue;
            weights[sym] = value;
            totalValue += value;
            symbols.push(sym);
            seriesPromises.push(fetchSeries(pos.ticker || sym, range, '1d').finally(() => { loaded++; setLoading(true, loaded / (active.length + 1) * 0.8, L('Loading price histories'), `${loaded} / ${active.length + 1}`); }));
        }
        if (totalValue <= 0) { rendering = false; setLoading(false); return; }
        for (const s of symbols) weights[s] /= totalValue;

        const currencies = new Set();
        for (const [, pos] of active) {
            const c = pos.currency || pos.lastData?.currency;
            if (c) currencies.add(String(c).toUpperCase());
        }
        const currencyMixed = currencies.size > 1;

        seriesPromises.push(fetchSeries(BENCHMARK, range, '1d').finally(() => { loaded++; setLoading(true, loaded / (active.length + 1) * 0.8, L('Loading price histories'), `${loaded} / ${active.length + 1}`); }));
        const seriesArr = await Promise.all(seriesPromises);
        const benchSeries = seriesArr.pop();

        const seriesMap = {};
        for (let i = 0; i < symbols.length; i++) {
            if (seriesArr[i].closes.length >= MIN_SAMPLES) seriesMap[symbols[i]] = seriesArr[i];
        }
        const validSymbols = Object.keys(seriesMap);
        if (validSymbols.length === 0) {
            metricsEl.innerHTML = L('<p class="empty">Not enough price history yet.</p>');
            heroEl.innerHTML = ''; contribEl.innerHTML = ''; matrixEl.innerHTML = '';
            rendering = false; setLoading(false); return;
        }

        let validTotal = 0;
        for (const s of validSymbols) validTotal += weights[s];
        for (const s of validSymbols) weights[s] /= validTotal;

        const { ts, pricesMap } = alignSeries(seriesMap);
        if (ts.length < MIN_SAMPLES) {
            metricsEl.innerHTML = L('<p class="empty">Not enough shared history yet (30 trading days needed).</p>');
            heroEl.innerHTML = ''; contribEl.innerHTML = ''; matrixEl.innerHTML = '';
            rendering = false; setLoading(false); return;
        }

        const assetReturns = {};
        for (const s of validSymbols) assetReturns[s] = QuantEngine.calculateReturns(pricesMap[s]);

        const T = assetReturns[validSymbols[0]].length;
        const portReturns = new Array(T).fill(0);
        for (const s of validSymbols) {
            const w = weights[s];
            const r = assetReturns[s];
            for (let i = 0; i < T; i++) portReturns[i] += w * r[i];
        }

        const portPrices = new Array(T + 1);
        portPrices[0] = 100;
        for (let i = 0; i < T; i++) portPrices[i + 1] = portPrices[i] * (1 + portReturns[i]);

        const benchAligned = alignBenchmarkTo(ts, benchSeries);

        setLoading(true, 0.85, L('Computing risk metrics'), L('{0} positions, {1} days', validSymbols.length, ts.length));
        const [annVol, sharpe, sortino, maxDD, var95, cvar95, beta, corrMatrix] = await Promise.all([
            runQuant('annualizedVolatility', portPrices),
            runQuant('calculateSharpeRatio', portPrices),
            runQuant('calculateSortinoRatio', portPrices),
            runQuant('calculateMaxDrawdown', portPrices),
            runQuant('calculateVaR', portPrices, 0.95),
            runQuant('calculateCVaR', portPrices, 0.95),
            benchAligned.length >= MIN_SAMPLES ? runQuant('calculateBeta', portPrices, benchAligned) : Promise.resolve(null),
            runQuant('correlationMatrix', pricesMap)
        ]);

        const totalReturn = ((portPrices[portPrices.length - 1] - 100) / 100) * 100;

        const portDailyVol = annVol / Math.sqrt(252);
        let weightedAvgVol = 0;
        for (const s of validSymbols) {
            weightedAvgVol += weights[s] * QuantEngine.calculateVolatility(assetReturns[s]);
        }
        const diversification = portDailyVol > 0 ? weightedAvgVol / portDailyVol : 0;

        const portVar = variance(portReturns);
        const contribRows = validSymbols.map(s => {
            const cov = covariance(assetReturns[s], portReturns);
            const contrib = portVar > 0 ? (weights[s] * cov) / portVar : 0;
            const annAssetVol = QuantEngine.calculateVolatility(assetReturns[s]) * Math.sqrt(252);
            return {
                symbol: s,
                name: positions[s].name || s,
                weight: weights[s],
                vol: annAssetVol,
                beta: benchAligned.length >= MIN_SAMPLES
                    ? betaSync(pricesMap[s], benchAligned)
                    : null,
                contrib
            };
        }).sort((a, b) => b.contrib - a.contrib);

        const volsMap = {};
        for (const r of contribRows) volsMap[r.symbol] = r.vol;
        const targetWeights = QuantEngine.inverseVolWeights(volsMap);
        for (const r of contribRows) r.target = targetWeights[r.symbol] || 0;

        const allTrades = [];
        for (const pos of Object.values(positions)) {
            const events = QuantEngine.extractTradeEvents({
                symbol: pos.symbol,
                purchases: pos.purchases,
                sales: pos.sales
            });
            allTrades.push(...events);
        }
        const edge = QuantEngine.tradeStats(allTrades);

        renderPlain({ annVol, maxDD, var95, totalValue, contribRows, weights });
        renderHero({ totalReturn, annVol, sharpe, beta, currencyMixed });
        renderMetrics({ sortino, maxDD, var95, cvar95, diversification, samples: ts.length });
        renderTradingEdge(edge);
        renderContributors(contribRows);
        renderCorrelationMatrix(validSymbols, corrMatrix, contribRows.reduce((m, r) => (m[r.symbol] = r.name, m), {}));
    } catch (e) {
        console.error('[Analysis] error:', e);
        metricsEl.innerHTML = `<p class="empty">${L('Could not compute the risk: {0}', escapeHtml(e?.message || e))}</p>`;
    } finally {
        rendering = false;
        setLoading(false);
    }
}

function alignBenchmarkTo(targetTs, benchSeries) {
    const m = new Map();
    for (let i = 0; i < benchSeries.ts.length; i++) m.set(benchSeries.ts[i], benchSeries.closes[i]);
    const out = [];
    for (const d of targetTs) {
        const v = m.get(d);
        if (v != null) out.push(v);
    }
    return out;
}

function variance(arr) {
    if (!arr || arr.length < 2) return 0;
    let m = 0;
    for (let i = 0; i < arr.length; i++) m += arr[i];
    m /= arr.length;
    let s = 0;
    for (let i = 0; i < arr.length; i++) { const d = arr[i] - m; s += d * d; }
    return s / arr.length;
}

function covariance(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let s = 0;
    for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
    return s / n;
}

function betaSync(pricesA, pricesB) {
    const ra = QuantEngine.calculateReturns(pricesA);
    const rb = QuantEngine.calculateReturns(pricesB);
    const n = Math.min(ra.length, rb.length);
    if (n < 3) return 0;
    const cov = covariance(ra.slice(-n), rb.slice(-n));
    const vb = variance(rb.slice(-n));
    return vb === 0 ? 0 : cov / vb;
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

function renderHero({ totalReturn, annVol, sharpe, beta, currencyMixed }) {
    const el = getEl('analysis-hero');
    if (!el) return;
    const fxNote = currencyMixed ? L(' Holdings span several currencies: exchange-rate moves are not included.') : '';
    el.innerHTML = `
        ${heroCard(L('Total return*'), fmtPct(totalReturn), totalReturn, L('Constant-weight reconstruction: today’s weights applied to past returns, not the return actually realized over time.') + fxNote)}
        ${heroCard(L('Annualized volatility'), fmtPct(annVol * 100).replace(/^\+/, ''), 0, L('Measure of price fluctuations over a year (lower is less volatile)'))}
        ${heroCard(L('Sharpe ratio'), fmtNum(sharpe, 2), sharpe, L('Risk-adjusted performance (excess return over the euro risk-free rate ÷ volatility; higher is better)'))}
        ${heroCard(`Beta vs ${BENCHMARK_LABEL}`, beta == null ? L('n/a') : fmtNum(beta, 2), 0, L('Systematic risk relative to the benchmark: 1 moves with it, below 1 moves less.') + fxNote)}
    `;
}

function heroCard(label, value, signed, hint = '') {
    const cls = signed > 0 ? 'positive' : signed < 0 ? 'negative' : '';
    return `<div class="kpi"><span class="kpi-label"${hint ? ` title="${hint}"` : ''}>${label}</span><span class="kpi-value ${cls}">${value}</span></div>`;
}

function renderMetrics({ sortino, maxDD, var95, cvar95, diversification, samples }) {
    const el = getEl('analysis-metrics-list');
    if (!el) return;
    const items = [
        { label: L('Sortino ratio'), value: fmtNum(sortino, 2), hint: L('Risk-adjusted return (downside only)') },
        { label: 'Max drawdown', value: fmtPct(maxDD), hint: L('Worst peak-to-trough decline'), neg: maxDD },
        { label: 'VaR 95% (1d)', value: fmtPct(var95), hint: L('Worst expected daily loss (95% confidence)'), neg: var95 },
        { label: 'CVaR 95% (1d)', value: fmtPct(cvar95), hint: L('Average loss in worst 5% of days'), neg: cvar95 },
        { label: L('Diversification ratio'), value: fmtNum(diversification, 2), hint: L('Weighted volatility of the holdings divided by the portfolio volatility. Higher is more diversified.') },
        { label: L('Samples'), value: String(samples), hint: L('Common trading days analyzed') }
    ];
    el.innerHTML = items.map(m => `
        <div class="metric-item">
            <span class="metric-label" title="${m.hint}">${m.label}</span>
            <span class="metric-value ${m.neg != null && m.neg < 0 ? 'negative' : ''}">${m.value}</span>
        </div>
    `).join('');
}

function renderContributors(rows) {
    const el = getEl('risk-contrib');
    if (!el) return;
    if (rows.length === 0) { el.innerHTML = ''; return; }
    const body = rows.map(r => {
        const target = r.target || 0;
        const delta = r.weight - target;
        const deltaCls = Math.abs(delta) < 0.02 ? 'neutral' : delta > 0 ? 'over' : 'under';
        const deltaSign = delta > 0 ? '+' : '';
        return `
        <tr>
            <td class="risk-contrib-name">${r.name}</td>
            <td class="risk-contrib-sym">${r.symbol}</td>
            <td>${fmtPct(r.weight * 100)}</td>
            <td class="risk-contrib-target">
                <span>${fmtPct(target * 100)}</span>
                <span class="risk-contrib-delta ${deltaCls}">${deltaSign}${(delta * 100).toFixed(1)}</span>
            </td>
            <td>${fmtPct(r.vol * 100)}</td>
            <td>${r.beta == null ? L('n/a') : fmtNum(r.beta, 2)}</td>
            <td>
                <div class="risk-contrib-bar">
                    <div class="risk-contrib-bar-fill ${r.contrib < 0 ? 'negative' : ''}" style="width:${Math.min(100, Math.abs(r.contrib) * 100)}%"></div>
                    <span class="risk-contrib-bar-label">${fmtPct(r.contrib * 100)}</span>
                </div>
            </td>
        </tr>
    `;
    }).join('');
    el.innerHTML = `
        <thead><tr>
            <th>${L('Name')}</th><th>Ticker</th><th>${L('Weight')}</th>
            <th title="${L('Risk-parity target (inverse-volatility)')}">${L('Target')}</th>
            <th>${L('Ann. Vol')}</th><th>β</th><th>${L('Risk share')}</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

function renderTradingEdge(edge) {
    const el = getEl('trading-edge-list');
    if (!el) return;
    if (!edge || edge.count === 0) {
        el.innerHTML = L('<p class="empty">No closed trades yet. Numbers appear after your first sale.</p>');
        return;
    }

    const pf = edge.profitFactor === Infinity ? '∞' : fmtNum(edge.profitFactor, 2);
    const halfKelly = edge.kelly / 2;
    const sample = edge.count;
    const sampleNote = sample < 30 ? ` <span class="meta" title="${L('Statistically thin: 30 or more trades give stable numbers')}">${L('(few trades)')}</span>` : '';

    const items = [
        { label: `Win rate · ${edge.wins}W / ${edge.losses}L${sampleNote}`,
          value: fmtPct(edge.winRate * 100), pos: edge.winRate >= 0.5 },
        { label: 'Profit factor',
          value: pf, pos: edge.profitFactor >= 1, hint: L('Total gains divided by total losses. Above 1.5 is good.') },
        { label: L('Expectancy / trade'),
          value: fmtPct(edge.expectancyPct), pos: edge.expectancyPct > 0,
          hint: L('Average result per trade. Must stay positive over time.') },
        { label: 'Reward / Risk (avg R)',
          value: fmtNum(edge.avgR, 2), pos: edge.avgR >= 1,
          hint: L('Average win % divided by average loss %') },
        { label: L('Avg holding · Best / Worst'),
          value: L('{0}d · {1} / {2}', Math.round(edge.avgHoldingDays), fmtPct(edge.bestPct), fmtPct(edge.worstPct)) },
        { label: L('Suggested size · ½ Kelly'),
          value: edge.kelly > 0 ? fmtPct(halfKelly * 100) : L('n/a'),
          emphasis: true,
          hint: L('Half-Kelly cap on per-position sizing given current edge') }
    ];

    el.innerHTML = items.map(m => `
        <div class="metric-item">
            <span class="metric-label" ${m.hint ? `title="${m.hint}"` : ''}>${m.label}</span>
            <span class="metric-value ${m.pos === true ? 'positive' : m.pos === false ? 'negative' : ''}">${m.value}</span>
        </div>
    `).join('');
}

function renderCorrelationMatrix(symbols, matrix, names) {
    const el = getEl('correlation-matrix');
    if (!el) return;
    const size = symbols.length;
    el.style.gridTemplateColumns = `88px repeat(${size}, minmax(58px, 1fr))`;
    const headerCell = (s) => `
        <div class="matrix-cell matrix-header matrix-header-rich">
            <img class="row-logo" src="img/icon/${s}.png" alt="" loading="lazy">
            <span class="matrix-header-name">${escapeHtml(names[s] || s)}</span>
            <span class="matrix-header-ticker">${s}</span>
        </div>
    `;
    let html = '<div class="matrix-cell matrix-header matrix-header-corner"></div>';
    for (const s of symbols) html += headerCell(s);
    for (const a of symbols) {
        html += headerCell(a);
        for (const b of symbols) {
            const r = matrix?.[a]?.[b] ?? 0;
            const bg = corrBackground(r);
            html += `<div class="matrix-cell" style="background:${bg}" title="${a} / ${b}: ${r.toFixed(3)}">${r.toFixed(2)}</div>`;
        }
    }
    el.innerHTML = html;
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function corrBackground(r) {
    const a = (Math.min(1, Math.abs(r)) * 0.42).toFixed(3);
    return r >= 0 ? `rgba(169,156,255,${a})` : `rgba(79,224,163,${a})`;
}

function fmtPct(n) {
    if (n == null || !Number.isFinite(n)) return 'n/a';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
}
function fmtNum(n, d = 2) {
    if (n == null || !Number.isFinite(n)) return 'n/a';
    const out = n.toFixed(d);
    return /^-0\.?0*$/.test(out) ? out.slice(1) : out;
}
