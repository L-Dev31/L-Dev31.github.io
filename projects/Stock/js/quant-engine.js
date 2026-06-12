// Nemeris Quant Engine — portfolio/risk analytics built on the shared quant-math core.
//
// Financial-correctness notes (changes vs previous revision):
// - Volatility now uses the SAMPLE standard deviation (n-1). Market returns are always a
//   sample, never the population; the n denominator biased volatility (and therefore Sharpe,
//   Sortino, VaR-scaling) low, especially on short windows.
// - Sortino now uses the FULL-SAMPLE downside deviation: sqrt( Σ min(r - MAR, 0)² / N ).
//   The previous version divided by the number of down days only, which (a) is not the
//   Sortino (1994) definition, and (b) made the ratio jump discontinuously when a single
//   small down day entered the window.
// - Historical VaR/CVaR use linear-interpolation percentiles instead of a floor index,
//   removing the systematic optimistic bias on small samples.
// - runBacktest is O(n) (was O(n²): it re-sliced the whole price history every bar).

import {
    TRADING_DAYS, mean, sampleStdDev, simpleReturns, logReturns,
    maxDrawdown as coreMaxDrawdown, percentileSorted,
    vwap as coreVWAP, covariance, pearsonCorrelation,
    zScore as coreZScore, outlierPValue
} from './quant-math.js';

// Annualized risk-free rate (2% default for Eurozone PEA, mid-2026)
const DEFAULT_RISK_FREE_RATE = 0.02;

let _nextGaussian = null;
function _gaussian() {
    if (_nextGaussian !== null) {
        const val = _nextGaussian;
        _nextGaussian = null;
        return val;
    }
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u));
    const theta = 2 * Math.PI * v;
    _nextGaussian = r * Math.sin(theta);
    return r * Math.cos(theta);
}

// Sentiment dictionaries matching whole-words (Sets for O(1) lookup)
const BULL_WORDS = new Set([
    'beat', 'beats', 'surge', 'surges', 'soar', 'soars', 'rally', 'rallies', 'gain', 'gains',
    'jump', 'jumps', 'rise', 'rises', 'climb', 'climbs', 'upgrade', 'outperform', 'bullish',
    'record', 'breakthrough', 'profit', 'profits', 'strong', 'growth', 'expand', 'expansion',
    'buy', 'overweight', 'positive', 'boost', 'boosts', 'top', 'tops', 'wins', 'win'
]);

const BEAR_WORDS = new Set([
    'miss', 'misses', 'plunge', 'plunges', 'drop', 'drops', 'fall', 'falls', 'slide', 'slides',
    'crash', 'crashes', 'tumble', 'tumbles', 'sink', 'sinks', 'downgrade', 'underperform',
    'bearish', 'loss', 'losses', 'weak', 'cut', 'cuts', 'sell', 'underweight', 'negative',
    'lawsuit', 'probe', 'investigation', 'fraud', 'recall', 'bankruptcy', 'layoff', 'layoffs'
]);

// Negators flip the polarity of the next sentiment word ("not strong", "fails to beat").
const NEGATORS = new Set(['not', 'no', 'never', 'without', 'fails', 'fail', 'failed', 'cannot', 'cant', 'didnt', 'doesnt', 'wont', 'isnt', 'arent', 'less', 'lower']);

export const QuantEngine = {
    // ============ CORE ============
    calculateReturns(prices) {
        return simpleReturns(prices);
    },

    calculateLogReturns(prices) {
        return logReturns(prices);
    },

    calculateVolatility(returns) {
        if (!returns || returns.length === 0) return 0;
        return sampleStdDev(returns);
    },

    annualizedVolatility(prices) {
        return sampleStdDev(simpleReturns(prices)) * Math.sqrt(TRADING_DAYS);
    },

    // ============ RISK METRICS ============
    calculateSharpeRatio(prices, riskFreeRate = DEFAULT_RISK_FREE_RATE) {
        const returns = simpleReturns(prices);
        if (returns.length < 2) return 0;
        const m = mean(returns);
        const vol = sampleStdDev(returns, m);
        if (vol === 0) return 0;
        // Annualize: (mean * 252 - Rf) / (vol * sqrt(252))
        return ((m * TRADING_DAYS) - riskFreeRate) / (vol * Math.sqrt(TRADING_DAYS));
    },

    // Sortino (annualized). `mar` is the ANNUAL minimum acceptable return.
    // Downside deviation per Sortino & Price (1994): full-sample root-mean-square of
    // below-MAR deviations — zeros count. Dividing by down-day count only (previous
    // behaviour) overstates DD with few losers and understates it with many.
    calculateSortinoRatio(prices, mar = 0) {
        const returns = simpleReturns(prices);
        if (returns.length < 2) return 0;
        const marDaily = mar / TRADING_DAYS;
        let s = 0;
        for (let i = 0; i < returns.length; i++) {
            const d = returns[i] - marDaily;
            if (d < 0) s += d * d;
        }
        const downsideDev = Math.sqrt(s / returns.length);
        if (downsideDev === 0) return 0;
        return ((mean(returns) - marDaily) * TRADING_DAYS) / (downsideDev * Math.sqrt(TRADING_DAYS));
    },

    // Max drawdown as a NEGATIVE percentage (UI convention preserved).
    calculateMaxDrawdown(prices) {
        return -(coreMaxDrawdown(prices) * 100);
    },

    // Historical VaR (interpolated percentile of daily returns, negative % loss)
    calculateVaR(prices, confidence = 0.95) {
        const returns = simpleReturns(prices);
        if (returns.length < 5) return 0;
        const sorted = [...returns].sort((a, b) => a - b);
        return percentileSorted(sorted, 1 - confidence) * 100;
    },

    // Expected Shortfall (mean of returns at or below the VaR threshold, negative % loss)
    calculateCVaR(prices, confidence = 0.95) {
        const returns = simpleReturns(prices);
        if (returns.length < 5) return 0;
        const sorted = [...returns].sort((a, b) => a - b);
        const cutoff = Math.max(1, Math.floor((1 - confidence) * sorted.length));
        let s = 0;
        for (let i = 0; i < cutoff; i++) s += sorted[i];
        return (s / cutoff) * 100;
    },

    // ============ RELATIVE METRICS ============
    // NOTE: both series must be CALENDAR-ALIGNED (same dates). Use alignSeries() from
    // command/quant-shared.js before calling — truncating to equal length does NOT align
    // series with different holidays/trading calendars.
    calculateCorrelation(pricesA, pricesB) {
        if (!pricesA || !pricesB) return 0;
        const n = Math.min(pricesA.length, pricesB.length);
        if (n < 2) return 0;
        const retA = simpleReturns(pricesA.slice(-n));
        const retB = simpleReturns(pricesB.slice(-n));
        return pearsonCorrelation(retA, retB);
    },

    calculateBeta(pricesAsset, pricesBenchmark) {
        if (!pricesAsset || !pricesBenchmark) return 0;
        const n = Math.min(pricesAsset.length, pricesBenchmark.length);
        if (n < 3) return 0;
        const retA = simpleReturns(pricesAsset.slice(-n));
        const retB = simpleReturns(pricesBenchmark.slice(-n));
        const varB = sampleStdDev(retB) ** 2;
        if (varB === 0) return 0;
        return covariance(retA, retB) / varB;
    },

    // VWAP over the full price/volume series (typical price = (H+L+C)/3 when available,
    // else the closing price array). Returns 0 when volume is empty or sums to zero.
    calculateVWAP(prices, volumes) {
        return coreVWAP(prices, volumes);
    },

    // Two-tailed p-value for the most recent daily return being a statistical outlier
    // relative to the trailing `window` returns. p < 0.05 = unusual move at 95% confidence.
    priceOutlierPValue(prices, window = 60) {
        const ret = simpleReturns(prices);
        if (ret.length < 10) return 1;
        const latest = ret[ret.length - 1];
        const ref = ret.slice(-Math.min(window, ret.length));
        return outlierPValue(latest, ref);
    },

    // pricesMap: { TICKER: [prices] } -> { TICKER: { TICKER: r } }
    correlationMatrix(pricesMap) {
        const tickers = Object.keys(pricesMap);
        const matrix = {};
        for (let i = 0; i < tickers.length; i++) {
            const a = tickers[i];
            matrix[a] = matrix[a] || {};
            matrix[a][a] = 1;
            for (let j = i + 1; j < tickers.length; j++) {
                const b = tickers[j];
                const r = this.calculateCorrelation(pricesMap[a], pricesMap[b]);
                matrix[a][b] = r;
                matrix[b] = matrix[b] || {};
                matrix[b][a] = r;
                matrix[b][b] = 1;
            }
        }
        return matrix;
    },

    // ============ SIMULATION ============
    // GBM simulation: returns trajectory percentiles (p5/p50/p95).
    // Default drift is 0 (martingale cone). historical/custom drift supported via opts.
    monteCarlo(prices, days = 252, paths = 1000, opts = {}) {
        if (!prices || prices.length < 30) return null;
        const logRet = logReturns(prices);
        const sigma = sampleStdDev(logRet);
        let mu;
        let driftMode;
        if (typeof opts.drift === 'number') { mu = opts.drift / TRADING_DAYS; driftMode = 'custom'; }
        else if (opts.drift === 'historical') { mu = mean(logRet); driftMode = 'historical'; }
        else { mu = 0; driftMode = 'zero'; }
        const S0 = prices[prices.length - 1];

        const finals = new Float64Array(paths);
        // store every path's value per day for percentile extraction
        const perDay = Array.from({ length: days }, () => new Float64Array(paths));

        // Hoist the constant drift component of the Geometric Brownian Motion calculation
        const driftPart = mu - 0.5 * sigma * sigma;

        for (let p = 0; p < paths; p++) {
            let s = S0;
            for (let d = 0; d < days; d++) {
                s = s * Math.exp(driftPart + sigma * _gaussian());
                perDay[d][p] = s;
            }
            finals[p] = s;
        }

        const p5 = new Array(days);
        const p50 = new Array(days);
        const p95 = new Array(days);

        for (let d = 0; d < days; d++) {
            const arr = perDay[d];
            arr.sort(); // TypedArray sort is numeric by default (unlike Array)
            p5[d] = percentileSorted(arr, 0.05);
            p50[d] = percentileSorted(arr, 0.50);
            p95[d] = percentileSorted(arr, 0.95);
        }

        const sortedFinals = finals.slice().sort();
        let finalsSum = 0;
        for (let i = 0; i < paths; i++) finalsSum += finals[i];
        return {
            S0,
            days,
            paths,
            p5, p50, p95,
            finalP5: percentileSorted(sortedFinals, 0.05),
            finalP50: percentileSorted(sortedFinals, 0.50),
            finalP95: percentileSorted(sortedFinals, 0.95),
            expectedReturn: (finalsSum / paths - S0) / S0,
            driftMode,                          // 'zero' | 'historical' | 'custom'
            annualizedSigma: sigma * Math.sqrt(TRADING_DAYS)
        };
    },

    // Simple long/flat backtest charging transaction cost + slippage (default 15 bps).
    // signalCallback(prices, i) must derive its signal ONLY from indices < i (the bar at i
    // is the execution price). O(n) — the previous version re-sliced the whole history per
    // bar, which was O(n²) time AND allocation.
    runBacktest(prices, signalCallback, opts = {}) {
        if (!prices || prices.length < 15) return 0;
        const cost = typeof opts.cost === 'number' ? opts.cost : 0.0015;
        let capital = 10000;
        let position = 0;
        for (let i = 14; i < prices.length; i++) {
            const currentPrice = prices[i];
            const signal = signalCallback(prices, i);
            if (signal === 1 && capital > currentPrice) {
                position = (capital * (1 - cost)) / currentPrice;   // pay cost on entry
                capital = 0;
            } else if (signal === -1 && position > 0) {
                capital = position * currentPrice * (1 - cost);     // pay cost on exit
                position = 0;
            }
        }
        const finalValue = capital + (position * prices[prices.length - 1] * (position > 0 ? (1 - cost) : 1));
        return ((finalValue - 10000) / 10000) * 100;
    },

    // ============ TRADE-LEVEL EDGE ============
    // FIFO matching of buy and sell transactions
    extractTradeEvents(stock) {
        if (!stock?.sales?.length || !stock?.purchases?.length) return [];

        const lots = stock.purchases
            .slice()
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(p => ({
                date: p.date,
                shares: p.shares || 0,
                perShare: Math.abs(p.amount || 0) / Math.max(1, p.shares || 1)
            }));

        const sales = stock.sales.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        const trades = [];

        for (const sale of sales) {
            let toRemove = sale.shares || 0;
            let costBasis = 0;
            let earliestBuy = null;

            while (toRemove > 0 && lots.length > 0) {
                const lot = lots[0];
                if (!earliestBuy) earliestBuy = lot.date;
                const taken = Math.min(toRemove, lot.shares);
                costBasis += taken * lot.perShare;
                lot.shares -= taken;
                toRemove -= taken;
                if (lot.shares <= 0) lots.shift();
            }

            const proceeds = sale.amount || 0;
            const pnl = proceeds - costBasis;
            const returnPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
            const days = earliestBuy
                ? Math.max(1, Math.round((new Date(sale.date) - new Date(earliestBuy)) / 86400000))
                : 0;

            trades.push({
                symbol: stock.symbol,
                date: sale.date,
                shares: sale.shares,
                costBasis, proceeds, pnl, returnPct, days
            });
        }
        return trades;
    },

    // Trade statistics and expectancy calculation
    tradeStats(trades) {
        const empty = {
            count: 0, wins: 0, losses: 0, winRate: 0,
            avgWinPct: 0, avgLossPct: 0, expectancyPct: 0,
            profitFactor: 0, avgR: 0, kelly: 0,
            avgHoldingDays: 0, bestPct: 0, worstPct: 0
        };
        if (!trades || !trades.length) return empty;

        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl < 0);
        const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

        const avgWinPct = wins.length ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
        const avgLossPct = losses.length ? Math.abs(losses.reduce((s, t) => s + t.returnPct, 0) / losses.length) : 0;
        const winRate = wins.length / trades.length;
        const lossRate = losses.length / trades.length;
        const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
        const expectancyPct = winRate * avgWinPct - lossRate * avgLossPct;
        const avgR = avgLossPct > 0 ? avgWinPct / avgLossPct : 0;
        const kelly = (avgR > 0 && losses.length > 0)
            ? Math.max(0, winRate - lossRate / avgR)
            : 0;

        const dayList = trades.map(t => t.days || 0).filter(d => d > 0);
        const avgHoldingDays = dayList.length ? dayList.reduce((a, b) => a + b, 0) / dayList.length : 0;
        const returns = trades.map(t => t.returnPct);

        return {
            count: trades.length,
            wins: wins.length,
            losses: losses.length,
            winRate, avgWinPct, avgLossPct,
            expectancyPct, profitFactor, avgR, kelly,
            avgHoldingDays,
            bestPct: returns.length ? Math.max(...returns) : 0,
            worstPct: returns.length ? Math.min(...returns) : 0
        };
    },

    // Inverse-volatility portfolio weighting
    inverseVolWeights(vols) {
        const out = {};
        const symbols = Object.keys(vols || {});
        if (!symbols.length) return out;
        let total = 0;
        const inv = {};
        for (const s of symbols) {
            const v = Number(vols[s]) || 0;
            const x = v > 0 ? 1 / v : 0;
            inv[s] = x;
            total += x;
        }
        for (const s of symbols) out[s] = total > 0 ? inv[s] / total : 0;
        return out;
    },

    // ============ SENTIMENT ============
    sentimentScore(headlines) {
        if (!headlines || headlines.length === 0) return { score: 0, label: 'NEUTRAL', bull: 0, bear: 0 };
        let bull = 0, bear = 0;
        for (const h of headlines) {
            // Tokenize to words, checking previous 2 tokens for negation
            const tokens = String(h || '').toLowerCase().match(/[a-z]+/g) || [];
            for (let i = 0; i < tokens.length; i++) {
                const t = tokens[i];
                const isBull = BULL_WORDS.has(t);
                const isBear = BEAR_WORDS.has(t);
                if (!isBull && !isBear) continue;
                const negated = (i >= 1 && NEGATORS.has(tokens[i - 1])) || (i >= 2 && NEGATORS.has(tokens[i - 2]));
                const bullish = negated ? !isBull : isBull; // flip polarity if negated
                if (bullish) bull++; else bear++;
            }
        }
        const total = bull + bear;
        const score = total === 0 ? 0 : (bull - bear) / total;
        let label = 'NEUTRAL';
        if (score > 0.25) label = 'BULLISH';
        else if (score < -0.25) label = 'BEARISH';
        return { score, label, bull, bear };
    }
};
