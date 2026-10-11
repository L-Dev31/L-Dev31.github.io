// Every terminal command. A command is `(parts, out)`: the words typed (parts[0] is the command itself) and the
// function that prints a line. Errors thrown here are reported by the terminal as "Error: ...".
import { fetchYahooFinancials, fetchYahooEarnings, fetchYahooAnalysis, fetchYahooDividends, fetchYahooChartSnapshot } from '../data/yahoo-finance.js';
import { resolveTickerDetails } from '../data/ticker-catalog.js';
import { runQuant, QuantEngine } from '../quant/quant-client.js';
import { fetchCloses, resolveTicker } from '../quant/quant-shared.js';
import { openSimulation, normalizeHorizon, summarize, HORIZONS } from '../quant/simulation.js';
import { positions } from '../core/state.js';
import { getActiveSymbol } from '../core/utils.js';
import { periodToDays } from '../core/constants.js';
import { colors, alpha } from '../core/palette.js';
import { fetchTickerNewsItems, fetchSymbolNewsItems } from './command/news.js';

export function fmtErr(e) {
    if (!e) return 'Error';
    if (typeof e === 'string') return e;
    const code = e.errorCode || e.status || e.statusCode;
    if (code === 401) return '401 Unauthorized';
    if (code === 429) return '429 Too Many Requests';
    return e.message || e.errorMessage || JSON.stringify(e);
}

// ── Output helpers ──
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
const DASH = '<span class="terminal-muted">-</span>';
const isNumber = value => value != null && Number.isFinite(Number(value));
const num = (value, digits = 2) => isNumber(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : DASH;
const pct = (value, digits = 2) => {
    if (!isNumber(value)) return DASH;
    const n = Number(value);
    return `<span class="${n > 0 ? 'terminal-pos' : n < 0 ? 'terminal-neg' : 'terminal-muted'}">${n > 0 ? '+' : ''}${n.toFixed(digits)}%</span>`;
};
const times100 = value => value == null ? null : Number(value) * 100;
const panel = (out, html) => out(`<div class="terminal-panel">${html}</div>`, 'terminal-log', true);
// Two columns: a label (escaped) and its value (HTML).
const table = (out, rows, left = 'VALUE', right = 'RESULT') => panel(out,
    `<table class="terminal-mini-table terminal-help-table"><thead><tr><th>${esc(left)}</th><th>${esc(right)}</th></tr></thead><tbody>`
    + rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`).join('') + '</tbody></table>');

// ── Which ticker a command is about ──
// The word after the command, else the ticker page that is open. symbol is the portfolio key (null when the
// ticker is not open yet), ticker the Yahoo ticker; null when there is nothing to go on.
function getTarget(parts) {
    const held = symbol => symbol && positions[symbol] ? { symbol, ticker: positions[symbol].ticker || symbol } : null;
    const raw = (parts[1] || '').toUpperCase();
    if (!raw) return held(getActiveSymbol());
    const bySymbol = Object.entries(positions).find(([, p]) => p && (p.ticker || '').toUpperCase() === raw)?.[0];
    return held(raw) || held(bySymbol) || { symbol: null, ticker: raw };
}

// A command about one ticker: prints the usage when there is none, else runs `run(target, out, parts)`.
const onTicker = (usage, run) => async (parts, out) => {
    const target = getTarget(parts);
    if (!target?.ticker) out(usage);
    else await run(target, out, parts);
};

// A command that fetches one Yahoo answer and shows it: `none` is printed when there is no answer.
const dataCommand = (usage, loading, none, load, show) => onTicker(usage, async (target, out) => {
    out(`${loading} ${target.ticker}...`);
    const res = await load(target.ticker);
    if (!res || res.error) out(none);
    else show(res, target, out);
});

// ── Opening a ticker ──
/** Opens a ticker page (also used by the assistant and the Explorer through window.goToTicker). */
export async function goToTicker(options = {}) {
    const symbol = (options.symbol || '').trim().toUpperCase();
    if (!symbol) return { ok: false, reason: 'invalid-symbol' };
    if (typeof window.openCustomSymbol !== 'function') return { ok: false, reason: 'no-create-strategy' };

    const period = (options.period || '1W').toUpperCase();
    const existing = positions[symbol];
    if (existing) {
        existing.currentPeriod = period;
        await window.openCustomSymbol(symbol, existing.type || 'equity', options.itemData);
    } else {
        const resolved = await resolveTickerDetails(symbol, options.itemData || {}, { lookup: !options.itemData });
        // Unknown to the catalog and to Yahoo: never create a blank ticker page for it.
        if (!options.itemData && !resolved.record && !resolved.quote) return { ok: false, reason: 'not-found' };
        resolved.period = period;
        await window.openCustomSymbol(symbol, resolved.type, resolved);
    }

    const select = document.getElementById(`periods-${symbol}`)?.querySelector('.period-select');
    if (select) select.value = period;
    return { ok: true, symbol };
}

// Beta against a euro index by default (EURO STOXX 50): the app is euro-focused, and a euro stock against a USD
// index would mix market risk with EUR/USD risk. Any benchmark can be given: BETA AAPL ^GSPC.
const DEFAULT_BENCHMARK = '^STOXX50E';

const betaLabel = b => b > 1.2 ? '<span class="terminal-neg">Aggressive</span>'
    : b < 0 ? '<span class="terminal-pos">Inverse</span>'
    : b < 0.8 && b > 0 ? '<span class="terminal-pos">Defensive</span>'
    : '<span class="terminal-muted">Market-like</span>';

// Green (positive) or red (negative) behind a correlation, stronger as it nears 1.
const shade = r => `background:${alpha(r >= 0 ? colors().pos : colors().neg, Math.min(1, Math.abs(r)) * 0.3)}`;

const words = parts => parts.slice(1).map(s => s.toUpperCase()).filter(Boolean);

export const COMMANDS = {
    GO: async (parts, out) => {
        const symbol = (parts[1] || '').toUpperCase();
        const period = (parts[2] || '1W').toUpperCase();
        if (!symbol) return out('Usage: GO <SYMBOL> [PERIOD]');
        const result = await goToTicker({ symbol, period });
        out(result?.ok ? `Opened: ${result.symbol} ${period}` : `Not found: ${symbol}`);
    },

    SIM: onTicker('Usage: SIM <SYMBOL> [AMOUNT] [HORIZON], e.g. SIM AAPL 1000 5Y', async (target, out, parts) => {
        const amount = Number(String(parts[2] || '').replace(',', '.')) || undefined;
        const word = (parts[3] || '').toUpperCase();
        const horizon = word ? (HORIZONS[word] ? word : normalizeHorizon(word)) : undefined;
        let symbol = target.symbol;
        if (symbol) await goToTicker({ symbol });
        else {
            const opened = await goToTicker({ symbol: target.ticker });
            if (!opened?.ok) return out(`Not found: ${target.ticker}`);
            symbol = opened.symbol;
        }
        out(`Simulation ${target.ticker}...`);
        const res = await openSimulation(symbol, { amount, horizon });
        if (!res) return out('Simulation failed.');
        const s = summarize(res);
        out(`${s.instrument}: ${s.invested} over ${s.horizon}. Median ${s.median_value}. 90% range ${s.range_90pct}. Chance of loss ${s.chance_of_loss}.`);
    }),

    NEWS: async (parts, out) => {
        const query = parts.slice(1).join(' ').trim().toUpperCase();
        const openNews = (symbol, search) => window.openNewsPage?.(symbol, { search });
        if (!query) {
            openNews(null, '');
            return out('Global News');
        }

        const target = getTarget(parts);
        out(`News for ${target.ticker}...`);
        try {
            const held = target.symbol && positions[target.symbol];
            if (held) {
                const days = periodToDays(held.currentPeriod || '1W');
                const results = await fetchSymbolNewsItems({ symbol: target.symbol, positions, limit: 20, days });
                out(`${results.length} articles`);
                Object.assign(held, { news: results, lastNewsFetch: Date.now() });
                openNews(target.symbol, target.ticker);
            } else {
                const results = await fetchTickerNewsItems({ ticker: target.ticker });
                out(results.length ? `${results.length} articles` : `No news found for ${target.ticker}`);
                openNews(null, query);
            }
        } catch (error) {
            out(`Error: ${fmtErr(error)}`);
            openNews(null, query);
        }
    },

    FA: dataCommand('Usage: FA <SYMBOL>', 'Financials', 'No FA data available', fetchYahooFinancials, (res, target, out) => {
        const f = res.financials?.financialData || {};
        const low = f.fiftyTwoWeekLow?.raw, high = f.fiftyTwoWeekHigh?.raw;
        table(out, [
            ['Ticker', esc(target.ticker)],
            ['Price', num(f.currentPrice?.raw)],
            ['Day variation', pct(f.dayChangePercent)],
            ['52 weeks', low != null && high != null ? `${num(low)} -> ${num(high)}` : DASH],
            ['Volume', num(f.regularMarketVolume, 0)],
            ['Revenue growth', pct(times100(f.revenueGrowth))],
            ['Margins', pct(times100(f.grossMargins))]
        ]);
    }),

    ANR: dataCommand('Usage: ANR <SYMBOL>', 'Analysts', 'No analyst data available', fetchYahooAnalysis, (res, target, out) => {
        const trend = res.analysis?.recommendationTrend?.trend || res.analysis?.recommendationTrend;
        if (trend?.length) {
            const t = trend[0] || {};
            const reco = String(t.recommendationKey || 'hold').toLowerCase();
            const cls = reco === 'buy' ? 'terminal-pos' : reco === 'sell' ? 'terminal-neg' : 'terminal-muted';
            const counts = [['Strong Buy', 'strongBuy'], ['Buy', 'buy'], ['Hold', 'hold'], ['Sell', 'sell'], ['Strong Sell', 'strongSell']];
            table(out, [['Recommendation', `<span class="${cls}">${esc(reco.toUpperCase())}</span>`], ...counts.map(([label, key]) => [label, num(t[key], 0)])]);
            return;
        }
        const fd = res.analysis?.financialData || {};
        table(out, [
            ['Mean target', num(fd.targetMeanPrice?.raw ?? fd.targetMeanPrice)],
            ['Recommendation mean', num(fd.recommendationMean?.raw ?? fd.recommendationMean)]
        ]);
    }),

    ERN: dataCommand('Usage: ERN <SYMBOL>', 'Results', 'No earnings data available', fetchYahooEarnings, (res, target, out) => {
        const e = res.earnings || {};
        let date = DASH;
        if (e.earningsTimestamp) {
            const stamp = Number(e.earningsTimestamp);
            const d = new Date(stamp < 1e12 ? stamp * 1000 : stamp);
            if (!Number.isNaN(d.getTime())) date = esc(d.toISOString().slice(0, 10));
        }
        table(out, [
            ['Ticker', esc(target.ticker)],
            ['EPS TTM', num(e.epsTrailingTwelveMonths)],
            ['EPS Forward', num(e.epsForward)],
            ['EPS Current Year', num(e.epsCurrentYear)],
            ['Price', num(e.regularMarketPrice)],
            ['1-Year Variation', pct(e.yearlyPriceDeltaPercent)],
            ['Earnings Date', date]
        ]);
    }),

    DVD: dataCommand('Usage: DVD <SYMBOL>', 'Dividends', 'No DVD data available', fetchYahooDividends, (res, target, out) => {
        const recent = (res.dividends || []).slice(-5).reverse();
        if (recent.length) table(out, recent.map(d => [d.date, num(d.dividend, 4)]), 'DATE', 'DIVIDEND');
        else out('No dividends');
    }),

    RV: async (parts, out) => {
        const targets = words(parts);
        if (targets.length < 2) return out('Usage: RV T1 T2... (min 2)');
        out(`Comparison: ${targets.join(', ')}`);

        const rows = [];
        for (const target of targets) {
            const ticker = resolveTicker(target);
            const res = await fetchYahooFinancials(ticker);
            const f = !res.error && res.financials?.financialData;
            let price, change, pe, revenue;
            if (f) {
                price = f.currentPrice?.raw;
                change = f.dayChangePercent;
                pe = f.trailingPE || f.forwardPE;
                revenue = f.totalRevenue?.raw || f.totalRevenue;
            } else {
                // No fundamentals (crumb wall): at least the price and the day move from the chart.
                const meta = (await fetchYahooChartSnapshot(ticker, '1mo', '1d'))?.meta || {};
                price = meta.regularMarketPrice;
                const prev = meta.chartPreviousClose;
                change = price != null && prev ? (price - prev) / prev * 100 : null;
            }
            rows.push([target, [`Price ${num(price)}`, `Day Var ${pct(change)}`, `PE ${num(pe)}`, `Rev ${num(revenue, 0)}`].join(' | ')]);
        }
        table(out, rows, 'TICKER', 'INDICATORS');
    },

    RISK: onTicker('Usage: RISK <SYMBOL> [RANGE]', async (target, out, parts) => {
        const range = (parts[2] || '1y').toLowerCase();
        out(`Risk profile ${target.ticker} (${range})...`);
        const closes = await fetchCloses(target.ticker, range, '1d');
        if (closes.length < 30) return out('Not enough data (need 30+ daily closes).');

        const ask = (op, ...args) => runQuant(op, closes, ...args);
        const [annVol, sharpe, sortino, maxDD, var95, cvar95, outlierP] = await Promise.all([
            ask('annualizedVolatility'), ask('calculateSharpeRatio'), ask('calculateSortinoRatio'), ask('calculateMaxDrawdown'),
            ask('calculateVaR', 0.95), ask('calculateCVaR', 0.95), ask('priceOutlierPValue', 60)
        ]);
        // Colour-code the outlier p-value: green = normal, orange = notable, red = extreme.
        const [cls, word] = outlierP < 0.01 ? ['terminal-neg', 'extreme'] : outlierP < 0.05 ? ['terminal-warning', 'notable'] : ['terminal-muted', 'normal'];
        table(out, [
            ['Ticker', esc(target.ticker)],
            ['Samples', String(closes.length)],
            ['Daily volatility', pct(annVol / Math.sqrt(252) * 100)],
            ['Annualized volatility', pct(annVol * 100)],
            ['Sharpe (rf=4%)', num(sharpe, 3)],
            ['Sortino', num(sortino, 3)],
            ['Max drawdown', pct(maxDD)],
            ['VaR 95% (1d)', pct(var95)],
            ['CVaR 95% (1d)', pct(cvar95)],
            ['Last move p-value', `<span class="${cls}">${num(outlierP, 4)} ${word}</span>`]
        ], 'METRIC', 'VALUE');
    }),

    BETA: onTicker('Usage: BETA <SYMBOL> [BENCHMARK]', async (target, out, parts) => {
        const benchmark = (parts[2] || DEFAULT_BENCHMARK).toUpperCase();
        out(`Beta ${target.ticker} vs ${benchmark}...`);
        const [asset, bench] = await Promise.all([fetchCloses(target.ticker, '1y', '1d'), fetchCloses(benchmark, '1y', '1d')]);
        if (asset.length < 30 || bench.length < 30) return out('Not enough overlap (need 30+ daily closes for both).');

        const [beta, corr] = await Promise.all([runQuant('calculateBeta', asset, bench), runQuant('calculateCorrelation', asset, bench)]);
        table(out, [
            ['Asset', esc(target.ticker)],
            ['Benchmark', esc(benchmark)],
            ['Beta', num(beta, 3)],
            ['Correlation', num(corr, 3)],
            ['Reading', betaLabel(beta)]
        ], 'METRIC', 'VALUE');
    }),

    COMPARE: async (parts, out) => {
        const tokens = words(parts);
        if (tokens.length < 2) return out('Usage: COMPARE T1 T2 [T3...]');
        if (tokens.length > 10) return out('Max 10 tickers.');
        out(`Correlation matrix: ${tokens.join(', ')}...`);

        const series = await Promise.all(tokens.map(t => fetchCloses(resolveTicker(t), '1y', '1d')));
        const pricesMap = {};
        const valid = [];
        tokens.forEach((t, i) => {
            if (series[i].length < 30) return;
            pricesMap[t] = series[i];
            valid.push(t);
        });
        if (valid.length < 2) return out('Not enough valid series.');

        const matrix = await runQuant('correlationMatrix', pricesMap);
        const cells = a => valid.map(b => { const r = matrix[a]?.[b] ?? 0; return `<td style="${shade(r)}">${num(r, 2)}</td>`; }).join('');
        // Return and volatility per ticker. QuantEngine is shared so every screen computes the volatility the same way.
        const perf = valid.map(t => {
            const p = pricesMap[t];
            return `<tr><th>${esc(t)}</th><td>${pct((p[p.length - 1] - p[0]) / p[0] * 100)}</td><td>${pct(QuantEngine.annualizedVolatility(p) * 100)}</td></tr>`;
        });
        panel(out,
            `<table class="terminal-mini-table terminal-help-table"><thead><tr><th></th>${valid.map(t => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>`
            + valid.map(a => `<tr><th>${esc(a)}</th>${cells(a)}</tr>`).join('') + '</tbody></table>'
            + '<table class="terminal-mini-table terminal-help-table" style="margin-top:8px"><thead><tr><th>TICKER</th><th>1Y RETURN</th><th>ANN. VOL</th></tr></thead><tbody>'
            + perf.join('') + '</tbody></table>');
    },

    MC: onTicker('Usage: MC <SYMBOL> [DAYS=252] [PATHS=1000]', async (target, out, parts) => {
        const days = Math.max(5, Math.min(2520, parseInt(parts[2], 10) || 252));
        const paths = Math.max(100, Math.min(10000, parseInt(parts[3], 10) || 1000));
        out(`Monte Carlo ${target.ticker}: ${days} days, ${paths} paths...`);
        const closes = await fetchCloses(target.ticker, '2y', '1d');
        if (closes.length < 60) return out('Not enough history (need 60+ daily closes).');

        const res = await runQuant('monteCarlo', closes, days, paths);
        if (!res) return out('Simulation failed.');
        const final = (label, value) => [label, `${num(value)} (${pct((value - res.S0) / res.S0 * 100)})`];
        table(out, [
            ['Ticker', esc(target.ticker)],
            ['Spot', num(res.S0)],
            ['Horizon', `${days} trading days`],
            ['Paths', String(paths)],
            final('P05 final', res.finalP5),
            final('P50 final', res.finalP50),
            final('P95 final', res.finalP95),
            ['Expected return', pct(res.expectedReturn * 100)]
        ], 'METRIC', 'VALUE');
    }),
};
