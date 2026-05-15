// Portfolio Analysis — weighted portfolio risk profile.
// Pipeline: fetch series -> align by day -> compute weights from market value
// -> build portfolio return series -> run QuantEngine ops in worker
// -> render hero + metrics + risk contributors + correlation matrix.
import { positions } from './state.js';
import { getEl } from './utils.js';
import { fetchSeries, alignSeries } from './command/quant-shared.js';
import { runQuant, QuantEngine } from './quant-client.js';

const BENCHMARK = '^GSPC';
const DEFAULT_RANGE = '1y';
const MIN_SAMPLES = 30;

let lastRange = DEFAULT_RANGE;
let rendering = false;

export function initAnalysisPane() {
    const select = getEl('analysis-range');
    if (select) select.addEventListener('change', () => {
        lastRange = select.value || DEFAULT_RANGE;
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
        heroEl.innerHTML = '';
        metricsEl.innerHTML = '<div class="perf-empty">No active positions to analyze</div>';
        contribEl.innerHTML = '';
        matrixEl.innerHTML = '';
        rendering = false;
        return;
    }


    try {
        const range = lastRange;
        if (subtitleEl) subtitleEl.textContent = `Weighted portfolio risk profile · ${range.toUpperCase()} window`;

        // 1. Build weights from current market value
        const weights = {};
        let totalValue = 0;
        const seriesPromises = [];
        const symbols = [];
        for (const [sym, pos] of active) {
            const price = pos.lastData?.price || (pos.costBasis / pos.shares) || 0;
            const value = price * pos.shares;
            if (value <= 0) continue;
            weights[sym] = value;
            totalValue += value;
            symbols.push(sym);
            seriesPromises.push(fetchSeries(pos.ticker || sym, range, '1d'));
        }
        if (totalValue <= 0) { rendering = false; setLoading(false); return; }
        for (const s of symbols) weights[s] /= totalValue;

        seriesPromises.push(fetchSeries(BENCHMARK, range, '1d'));
        const seriesArr = await Promise.all(seriesPromises);
        const benchSeries = seriesArr.pop();

        // 2. Drop tickers with no data, align rest on common days
        const seriesMap = {};
        for (let i = 0; i < symbols.length; i++) {
            if (seriesArr[i].closes.length >= MIN_SAMPLES) seriesMap[symbols[i]] = seriesArr[i];
        }
        const validSymbols = Object.keys(seriesMap);
        if (validSymbols.length === 0) {
            metricsEl.innerHTML = '<div class="perf-empty">Not enough history for any position</div>';
            heroEl.innerHTML = ''; contribEl.innerHTML = ''; matrixEl.innerHTML = '';
            rendering = false; setLoading(false); return;
        }

        // Renormalize weights to valid set
        let validTotal = 0;
        for (const s of validSymbols) validTotal += weights[s];
        for (const s of validSymbols) weights[s] /= validTotal;

        const { ts, pricesMap } = alignSeries(seriesMap);
        if (ts.length < MIN_SAMPLES) {
            metricsEl.innerHTML = '<div class="perf-empty">Not enough overlapping history (need 30+ common days)</div>';
            heroEl.innerHTML = ''; contribEl.innerHTML = ''; matrixEl.innerHTML = '';
            rendering = false; setLoading(false); return;
        }

        // 3. Per-asset returns (sync, cheap on aligned arrays)
        const assetReturns = {};
        for (const s of validSymbols) assetReturns[s] = QuantEngine.calculateReturns(pricesMap[s]);

        // 4. Portfolio return series
        const T = assetReturns[validSymbols[0]].length;
        const portReturns = new Array(T).fill(0);
        for (const s of validSymbols) {
            const w = weights[s];
            const r = assetReturns[s];
            for (let i = 0; i < T; i++) portReturns[i] += w * r[i];
        }

        // 5. Synthetic portfolio price series (base 100)
        const portPrices = new Array(T + 1);
        portPrices[0] = 100;
        for (let i = 0; i < T; i++) portPrices[i + 1] = portPrices[i] * (1 + portReturns[i]);

        // 6. Benchmark prices aligned to portfolio days
        const benchAligned = alignBenchmarkTo(ts, benchSeries);

        // 7. Run heavy ops in worker
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

        // Diversification ratio = Σ w_i * σ_i / σ_p (>1 means diversified)
        const portDailyVol = annVol / Math.sqrt(252);
        let weightedAvgVol = 0;
        for (const s of validSymbols) {
            weightedAvgVol += weights[s] * QuantEngine.calculateVolatility(assetReturns[s]);
        }
        const diversification = portDailyVol > 0 ? weightedAvgVol / portDailyVol : 0;

        // 8. Risk contributions: w_i * Cov(r_i, r_p) / Var(r_p)
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

        // 9. Inverse-vol target weights (risk-parity proxy) for sizing alignment
        const volsMap = {};
        for (const r of contribRows) volsMap[r.symbol] = r.vol;
        const targetWeights = QuantEngine.inverseVolWeights(volsMap);
        for (const r of contribRows) r.target = targetWeights[r.symbol] || 0;

        // 10. Trade-level edge stats from the entire ledger (closed events via FIFO)
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

        // 11. Render
        renderHero({ totalReturn, annVol, sharpe, beta });
        renderMetrics({ sortino, maxDD, var95, cvar95, diversification, samples: ts.length });
        renderTradingEdge(edge);
        renderContributors(contribRows);
        renderCorrelationMatrix(validSymbols, corrMatrix, contribRows.reduce((m, r) => (m[r.symbol] = r.name, m), {}));
    } catch (e) {
        console.error('[Analysis] error:', e);
        metricsEl.innerHTML = `<div class="perf-empty">Error: ${e?.message || e}</div>`;
    } finally {
        rendering = false;
    }
}

// ============ HELPERS ============
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

// ============ RENDER ============
function renderHero({ totalReturn, annVol, sharpe, beta }) {
    const el = getEl('analysis-hero');
    if (!el) return;
    el.innerHTML = `
        ${heroCard('Total return', fmtPct(totalReturn), totalReturn)}
        ${heroCard('Annualized volatility', fmtPct(annVol * 100), -annVol * 100)}
        ${heroCard('Sharpe ratio', fmtNum(sharpe, 2), sharpe)}
        ${heroCard('Beta vs S&P 500', beta == null ? '—' : fmtNum(beta, 2), beta == null ? 0 : (beta - 1))}
    `;
}

function heroCard(label, value, signed) {
    const cls = signed > 0 ? 'positive' : signed < 0 ? 'negative' : '';
    return `
        <div class="analysis-hero-card">
            <span class="analysis-hero-label">${label}</span>
            <span class="analysis-hero-value ${cls}">${value}</span>
        </div>
    `;
}

function renderMetrics({ sortino, maxDD, var95, cvar95, diversification, samples }) {
    const el = getEl('analysis-metrics-list');
    if (!el) return;
    const items = [
        { label: 'Sortino ratio', value: fmtNum(sortino, 2), hint: 'Risk-adjusted return (downside only)' },
        { label: 'Max drawdown', value: fmtPct(maxDD), hint: 'Worst peak-to-trough decline', neg: maxDD },
        { label: 'VaR 95% (1d)', value: fmtPct(var95), hint: 'Worst expected daily loss (95% confidence)', neg: var95 },
        { label: 'CVaR 95% (1d)', value: fmtPct(cvar95), hint: 'Average loss in worst 5% of days', neg: cvar95 },
        { label: 'Diversification ratio', value: fmtNum(diversification, 2), hint: 'Σ wᵢσᵢ / σₚ — higher = better diversified' },
        { label: 'Samples', value: String(samples), hint: 'Common trading days analyzed' }
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
            <td>${r.beta == null ? '—' : fmtNum(r.beta, 2)}</td>
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
            <th>Name</th><th>Ticker</th><th>Weight</th>
            <th title="Risk-parity target (inverse-volatility)">Target</th>
            <th>Ann. Vol</th><th>β</th><th>Risk share</th>
        </tr></thead>
        <tbody>${body}</tbody>
    `;
}

function renderTradingEdge(edge) {
    const el = getEl('trading-edge-list');
    if (!el) return;
    if (!edge || edge.count === 0) {
        el.innerHTML = '<div class="perf-empty">No closed trades yet — place at least one round-trip</div>';
        return;
    }

    const pf = edge.profitFactor === Infinity ? '∞' : fmtNum(edge.profitFactor, 2);
    const halfKelly = edge.kelly / 2;
    const sample = edge.count;
    const sampleNote = sample < 30 ? ` <span class="edge-warn" title="Statistically thin: need 30+ trades for stable estimates">⚠</span>` : '';

    const items = [
        { label: `Win rate · ${edge.wins}W / ${edge.losses}L${sampleNote}`,
          value: fmtPct(edge.winRate * 100), pos: edge.winRate >= 0.5 },
        { label: 'Profit factor',
          value: pf, pos: edge.profitFactor >= 1, hint: 'Σ wins / |Σ losses| — above 1.5 is good' },
        { label: 'Expectancy / trade',
          value: fmtPct(edge.expectancyPct), pos: edge.expectancyPct > 0,
          hint: 'p·avgWin − q·avgLoss — must be positive long-term' },
        { label: 'Reward / Risk (avg R)',
          value: fmtNum(edge.avgR, 2), pos: edge.avgR >= 1,
          hint: 'Average win % divided by average loss %' },
        { label: 'Avg holding · Best / Worst',
          value: `${Math.round(edge.avgHoldingDays)}d · ${fmtPct(edge.bestPct)} / ${fmtPct(edge.worstPct)}` },
        { label: 'Suggested size · ½ Kelly',
          value: edge.kelly > 0 ? fmtPct(halfKelly * 100) : '—',
          emphasis: true,
          hint: 'Half-Kelly cap on per-position sizing given current edge' }
    ];

    el.innerHTML = items.map(m => `
        <div class="metric-item ${m.emphasis ? 'metric-item-emphasis' : ''}">
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
            <img class="matrix-header-logo" src="img/icon/${s}.png" alt="" onerror="this.style.visibility='hidden'" />
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
    const a = Math.min(1, Math.abs(r));
    if (r >= 0) return `rgba(46, 160, 67, ${a * 0.45})`;
    return `rgba(248, 81, 73, ${a * 0.45})`;
}

function fmtPct(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
}
function fmtNum(n, d = 2) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(d);
}
