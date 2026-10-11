// Nemeris Quant Engine: portfolio and risk analytics on plain price arrays. quant-client.js runs it
// in a Worker (or in-thread when Workers are missing); signal-bot.js reuses the small stats helpers.
//
// Conventions: volatility is the SAMPLE stdev (n-1), because market returns are a sample. Sortino
// uses the full-sample downside deviation (Sortino & Price, 1994). VaR/CVaR use interpolated
// percentiles. Correlation inputs must already be calendar-aligned (alignSeries in quant-shared.js).

const TRADING_DAYS = 252;
const RISK_FREE_RATE = 0.02;

export const mean = a => a?.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

export function sampleStdDev(a, m = mean(a)) {
    if (!a || a.length < 2) return 0;
    return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

const simpleReturns = p => (p || []).slice(1).map((x, i) => p[i] ? (x - p[i]) / p[i] : 0);
const logReturns = p => (p || []).slice(1).map((x, i) => p[i] > 0 && x > 0 ? Math.log(x / p[i]) : 0);

// Linear-interpolation percentile of an ascending array, q in [0, 1].
function percentile(sorted, q) {
    const n = sorted.length;
    if (!n) return 0;
    const pos = q * (n - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Seeded uniform RNG (mulberry32): the same seed gives the same sequence, so simulations can be reproduced.
function seededRandom(seed) {
    let h = 0x811c9dc5;
    const text = String(seed);
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    let a = h || 1;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Box-Muller gaussians over any uniform source; each draw yields two values, the spare is kept.
function gaussianFrom(rand) {
    let spare = null;
    return () => {
        if (spare !== null) { const v = spare; spare = null; return v; }
        let u = 0, v = 0;
        while (u === 0) u = rand();
        while (v === 0) v = rand();
        const r = Math.sqrt(-2 * Math.log(u));
        spare = r * Math.sin(2 * Math.PI * v);
        return r * Math.cos(2 * Math.PI * v);
    };
}

// Pearson correlation of two equal-length arrays; 0 when either is flat.
function pearson(x, y) {
    if (x.length < 2) return 0;
    const sx = sampleStdDev(x), sy = sampleStdDev(y);
    return sx === 0 || sy === 0 ? 0 : covariance(x, y) / (sx * sy);
}
function covariance(x, y) {
    const mx = mean(x), my = mean(y);
    let s = 0;
    for (let i = 0; i < x.length; i++) s += (x[i] - mx) * (y[i] - my);
    return s / (x.length - 1);
}

// Daily returns of the last n prices of both series (n = the shorter length).
function tailReturns(a, b) {
    const n = Math.min(a.length, b.length);
    return [n, simpleReturns(a.slice(-n)), simpleReturns(b.slice(-n))];
}

// Sorted daily returns for VaR/CVaR; empty when the sample is too small to mean anything.
function sortedReturns(prices) {
    const r = simpleReturns(prices);
    return r.length < 5 ? [] : r.sort((a, b) => a - b);
}

export const QuantEngine = {
    calculateReturns: simpleReturns,
    calculateVolatility: returns => sampleStdDev(returns),
    annualizedVolatility: prices => sampleStdDev(simpleReturns(prices)) * Math.sqrt(TRADING_DAYS),

    calculateSharpeRatio(prices, riskFreeRate = RISK_FREE_RATE) {
        const returns = simpleReturns(prices);
        if (returns.length < 2) return 0;
        const m = mean(returns), vol = sampleStdDev(returns, m);
        return vol === 0 ? 0 : (m * TRADING_DAYS - riskFreeRate) / (vol * Math.sqrt(TRADING_DAYS));
    },

    // `mar` is the ANNUAL minimum acceptable return. Zeros count in the downside deviation, so a
    // single small down day cannot make the ratio jump.
    calculateSortinoRatio(prices, mar = 0) {
        const returns = simpleReturns(prices);
        if (returns.length < 2) return 0;
        const marDaily = mar / TRADING_DAYS;
        const downside = Math.sqrt(returns.reduce((s, r) => { const d = r - marDaily; return d < 0 ? s + d * d : s; }, 0) / returns.length);
        return downside === 0 ? 0 : ((mean(returns) - marDaily) * TRADING_DAYS) / (downside * Math.sqrt(TRADING_DAYS));
    },

    // Worst peak-to-trough fall as a NEGATIVE percentage (the UI convention).
    calculateMaxDrawdown(prices) {
        const p = prices || [];
        let peak = p[0], worst = 0;
        for (let i = 1; i < p.length; i++) {
            if (p[i] > peak) peak = p[i];
            else { const dd = (peak - p[i]) / peak; if (dd > worst) worst = dd; }
        }
        return -(worst * 100);
    },

    // Historical VaR and expected shortfall, as negative % daily losses.
    calculateVaR(prices, confidence = 0.95) {
        const r = sortedReturns(prices);
        return r.length ? percentile(r, 1 - confidence) * 100 : 0;
    },
    calculateCVaR(prices, confidence = 0.95) {
        const r = sortedReturns(prices);
        const cutoff = Math.max(1, Math.floor((1 - confidence) * r.length));
        return r.length ? (r.slice(0, cutoff).reduce((s, x) => s + x, 0) / cutoff) * 100 : 0;
    },

    calculateCorrelation(pricesA, pricesB) {
        if (!pricesA || !pricesB) return 0;
        const [n, a, b] = tailReturns(pricesA, pricesB);
        return n < 2 ? 0 : pearson(a, b);
    },

    calculateBeta(pricesAsset, pricesBenchmark) {
        if (!pricesAsset || !pricesBenchmark) return 0;
        const [n, a, b] = tailReturns(pricesAsset, pricesBenchmark);
        const varB = sampleStdDev(b) ** 2;
        return n < 3 || varB === 0 ? 0 : covariance(a, b) / varB;
    },

    // Two-tailed p-value that the latest daily return is an outlier against the trailing `window`
    // returns (z-score through the Abramowitz & Stegun 26.2.17 normal CDF, error < 7.5e-8).
    // p < 0.05 means an unusual move at 95% confidence.
    priceOutlierPValue(prices, window = 60) {
        const ret = simpleReturns(prices);
        if (ret.length < 10) return 1;
        const ref = ret.slice(-Math.min(window, ret.length));
        const m = mean(ref), s = sampleStdDev(ref, m);
        const z = Math.abs(s === 0 ? 0 : (ret[ret.length - 1] - m) / s);
        const t = 1 / (1 + 0.2316419 * z);
        const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
        return 2 * (1 - (1 - pdf * poly));
    },

    // { TICKER: [prices] } -> { TICKER: { TICKER: r } }
    correlationMatrix(pricesMap) {
        const names = Object.keys(pricesMap);
        const matrix = Object.fromEntries(names.map(a => [a, { [a]: 1 }]));
        names.forEach((a, i) => names.slice(i + 1).forEach(b => {
            matrix[a][b] = matrix[b][a] = QuantEngine.calculateCorrelation(pricesMap[a], pricesMap[b]);
        }));
        return matrix;
    },

    // Geometric Brownian motion on the log-return volatility. Drift is 0 by default (martingale cone),
    // or opts.drift = annual number | 'historical'. opts.seed makes the paths reproducible.
    monteCarlo(prices, days = 252, paths = 1000, opts = {}) {
        if (!prices || prices.length < 30) return null;
        const logRet = logReturns(prices);
        const sigma = sampleStdDev(logRet);
        let mu = 0, driftMode = 'zero';
        if (typeof opts.drift === 'number') { mu = opts.drift / TRADING_DAYS; driftMode = 'custom'; }
        else if (opts.drift === 'historical') { mu = mean(logRet); driftMode = 'historical'; }
        const S0 = prices[prices.length - 1];
        const gauss = gaussianFrom(opts.seed != null ? seededRandom(opts.seed) : Math.random);
        const driftPart = mu - 0.5 * sigma * sigma;

        const finals = new Float64Array(paths);
        const perDay = Array.from({ length: days }, () => new Float64Array(paths));
        for (let p = 0; p < paths; p++) {
            let s = S0;
            for (let d = 0; d < days; d++) perDay[d][p] = s *= Math.exp(driftPart + sigma * gauss());
            finals[p] = s;
        }

        // Trajectory percentiles (p5..p95 per day) and the same levels for the final values.
        for (const day of perDay) day.sort();   // typed-array sort is numeric
        const sortedFinals = finals.slice().sort();
        const out = { S0, days, paths };
        for (const [key, q] of [['p5', 0.05], ['p25', 0.25], ['p50', 0.5], ['p75', 0.75], ['p95', 0.95]]) {
            out[key] = perDay.map(day => percentile(day, q));
            out[`final${key.toUpperCase()}`] = percentile(sortedFinals, q);
        }
        const share = test => finals.filter(test).length / paths;
        return {
            ...out,
            probLoss: share(f => f < S0),
            probUp10: share(f => f >= S0 * 1.1),
            probDown10: share(f => f <= S0 * 0.9),
            dailyDrift: mu,
            expectedReturn: (mean(finals) - S0) / S0,
            driftMode,
            annualizedSigma: sigma * Math.sqrt(TRADING_DAYS)
        };
    },

    // FIFO matching of buys and sells into closed trades.
    extractTradeEvents(stock) {
        if (!stock?.sales?.length || !stock?.purchases?.length) return [];
        const byDate = (a, b) => new Date(a.date) - new Date(b.date);
        const lots = stock.purchases.slice().sort(byDate).map(p => ({
            date: p.date,
            shares: p.shares || 0,
            perShare: Math.abs(p.amount || 0) / Math.max(1, p.shares || 1)
        }));

        return stock.sales.slice().sort(byDate).map(sale => {
            let toRemove = sale.shares || 0, costBasis = 0, earliestBuy = null;
            while (toRemove > 0 && lots.length > 0) {
                const lot = lots[0];
                if (!earliestBuy) earliestBuy = lot.date;
                const taken = Math.min(toRemove, lot.shares);
                costBasis += taken * lot.perShare;
                lot.shares -= taken;
                toRemove -= taken;
                if (lot.shares <= 0) lots.shift();
            }
            const proceeds = sale.amount || 0, pnl = proceeds - costBasis;
            const days = earliestBuy ? Math.max(1, Math.round((new Date(sale.date) - new Date(earliestBuy)) / 86400000)) : 0;
            return {
                symbol: stock.symbol, date: sale.date, shares: sale.shares,
                costBasis, proceeds, pnl, returnPct: costBasis > 0 ? (pnl / costBasis) * 100 : 0, days
            };
        });
    },

    tradeStats(trades) {
        if (!trades?.length) {
            return Object.fromEntries(['count', 'wins', 'losses', 'winRate', 'avgWinPct', 'avgLossPct', 'expectancyPct',
                'profitFactor', 'avgR', 'kelly', 'avgHoldingDays', 'bestPct', 'worstPct'].map(k => [k, 0]));
        }
        const total = (list, key) => list.reduce((s, t) => s + t[key], 0);
        const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl < 0);
        const grossWin = total(wins, 'pnl'), grossLoss = Math.abs(total(losses, 'pnl'));
        const avgWinPct = wins.length ? total(wins, 'returnPct') / wins.length : 0;
        const avgLossPct = losses.length ? Math.abs(total(losses, 'returnPct') / losses.length) : 0;
        const winRate = wins.length / trades.length, lossRate = losses.length / trades.length;
        const avgR = avgLossPct > 0 ? avgWinPct / avgLossPct : 0;
        const held = trades.map(t => t.days || 0).filter(d => d > 0);
        const returns = trades.map(t => t.returnPct);
        return {
            count: trades.length, wins: wins.length, losses: losses.length,
            winRate, avgWinPct, avgLossPct,
            expectancyPct: winRate * avgWinPct - lossRate * avgLossPct,
            profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
            avgR,
            kelly: avgR > 0 && losses.length > 0 ? Math.max(0, winRate - lossRate / avgR) : 0,
            avgHoldingDays: held.length ? held.reduce((a, b) => a + b, 0) / held.length : 0,
            bestPct: Math.max(...returns), worstPct: Math.min(...returns)
        };
    },

    // Weights proportional to 1 / volatility; zero-volatility names get 0.
    inverseVolWeights(vols) {
        const inv = Object.fromEntries(Object.entries(vols || {}).map(([s, v]) => [s, Number(v) > 0 ? 1 / Number(v) : 0]));
        const total = Object.values(inv).reduce((a, b) => a + b, 0);
        return Object.fromEntries(Object.entries(inv).map(([s, x]) => [s, total > 0 ? x / total : 0]));
    }
};

// One entry point for both the Worker and the in-thread fallback.
export function runOp(op, args) {
    const fn = QuantEngine[op];
    if (typeof fn !== 'function') throw new Error(`Unknown op: ${op}`);
    return fn.apply(QuantEngine, args || []);
}
