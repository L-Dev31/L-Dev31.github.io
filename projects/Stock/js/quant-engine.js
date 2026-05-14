// Nemeris Quant Engine — pure math, no DOM, no fetch.
// All inputs are arrays of numbers (close prices) or arrays of returns.
// All functions are deterministic and safe to run inside a Web Worker.

const TRADING_DAYS = 252;

function _mean(arr) {
    if (!arr || arr.length === 0) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
}

function _stdev(arr, mean) {
    if (!arr || arr.length < 2) return 0;
    const m = mean ?? _mean(arr);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - m;
        s += d * d;
    }
    return Math.sqrt(s / arr.length);
}

function _gaussian() {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const BULL_WORDS = [
    'beat', 'beats', 'surge', 'surges', 'soar', 'soars', 'rally', 'rallies', 'gain', 'gains',
    'jump', 'jumps', 'rise', 'rises', 'climb', 'climbs', 'upgrade', 'outperform', 'bullish',
    'record', 'breakthrough', 'profit', 'profits', 'strong', 'growth', 'expand', 'expansion',
    'buy', 'overweight', 'positive', 'boost', 'boosts', 'top', 'tops', 'wins', 'win'
];

const BEAR_WORDS = [
    'miss', 'misses', 'plunge', 'plunges', 'drop', 'drops', 'fall', 'falls', 'slide', 'slides',
    'crash', 'crashes', 'tumble', 'tumbles', 'sink', 'sinks', 'downgrade', 'underperform',
    'bearish', 'loss', 'losses', 'weak', 'cut', 'cuts', 'sell', 'underweight', 'negative',
    'lawsuit', 'probe', 'investigation', 'fraud', 'recall', 'bankruptcy', 'layoff', 'layoffs'
];

export const QuantEngine = {
    // ============ CORE ============
    calculateReturns(prices) {
        if (!prices || prices.length < 2) return [];
        const out = new Array(prices.length - 1);
        for (let i = 1; i < prices.length; i++) {
            const prev = prices[i - 1];
            out[i - 1] = prev ? (prices[i] - prev) / prev : 0;
        }
        return out;
    },

    calculateLogReturns(prices) {
        if (!prices || prices.length < 2) return [];
        const out = new Array(prices.length - 1);
        for (let i = 1; i < prices.length; i++) {
            const prev = prices[i - 1];
            out[i - 1] = prev > 0 && prices[i] > 0 ? Math.log(prices[i] / prev) : 0;
        }
        return out;
    },

    calculateVolatility(returns) {
        if (!returns || returns.length === 0) return 0;
        return _stdev(returns);
    },

    annualizedVolatility(prices) {
        const r = this.calculateReturns(prices);
        return _stdev(r) * Math.sqrt(TRADING_DAYS);
    },

    // ============ RISK METRICS ============
    calculateSharpeRatio(prices, riskFreeRate = 0.04) {
        const returns = this.calculateReturns(prices);
        if (returns.length === 0) return 0;
        const mean = _mean(returns);
        const vol = _stdev(returns, mean);
        if (vol === 0) return 0;
        return ((mean * TRADING_DAYS) - riskFreeRate) / (vol * Math.sqrt(TRADING_DAYS));
    },

    calculateSortinoRatio(prices, mar = 0) {
        const returns = this.calculateReturns(prices);
        if (returns.length === 0) return 0;
        const mean = _mean(returns);
        const downside = returns.filter(r => r < mar);
        if (downside.length === 0) return 0;
        let s = 0;
        for (let i = 0; i < downside.length; i++) {
            const d = downside[i] - mar;
            s += d * d;
        }
        const dd = Math.sqrt(s / downside.length);
        if (dd === 0) return 0;
        return ((mean - mar / TRADING_DAYS) * Math.sqrt(TRADING_DAYS)) / dd;
    },

    calculateMaxDrawdown(prices) {
        if (!prices || prices.length === 0) return 0;
        let maxPrice = prices[0];
        let maxDD = 0;
        for (let i = 0; i < prices.length; i++) {
            if (prices[i] > maxPrice) maxPrice = prices[i];
            const dd = (maxPrice - prices[i]) / maxPrice;
            if (dd > maxDD) maxDD = dd;
        }
        return -(maxDD * 100);
    },

    // Historical Value-at-Risk (percentile of return distribution). Returns negative % loss.
    calculateVaR(prices, confidence = 0.95) {
        const returns = this.calculateReturns(prices);
        if (returns.length < 5) return 0;
        const sorted = [...returns].sort((a, b) => a - b);
        const idx = Math.floor((1 - confidence) * sorted.length);
        return sorted[Math.max(0, idx)] * 100;
    },

    // Expected Shortfall (mean of worst (1-c) tail). Returns negative % loss.
    calculateCVaR(prices, confidence = 0.95) {
        const returns = this.calculateReturns(prices);
        if (returns.length < 5) return 0;
        const sorted = [...returns].sort((a, b) => a - b);
        const cutoff = Math.max(1, Math.floor((1 - confidence) * sorted.length));
        let s = 0;
        for (let i = 0; i < cutoff; i++) s += sorted[i];
        return (s / cutoff) * 100;
    },

    // ============ RELATIVE METRICS ============
    calculateCorrelation(pricesA, pricesB) {
        if (!pricesA || !pricesB) return 0;
        const minLength = Math.min(pricesA.length, pricesB.length);
        if (minLength < 2) return 0;
        const retA = this.calculateReturns(pricesA.slice(-minLength));
        const retB = this.calculateReturns(pricesB.slice(-minLength));
        const meanA = _mean(retA);
        const meanB = _mean(retB);
        let num = 0, denA = 0, denB = 0;
        for (let i = 0; i < retA.length; i++) {
            const dA = retA[i] - meanA;
            const dB = retB[i] - meanB;
            num += dA * dB;
            denA += dA * dA;
            denB += dB * dB;
        }
        if (denA === 0 || denB === 0) return 0;
        return num / Math.sqrt(denA * denB);
    },

    calculateBeta(pricesAsset, pricesBenchmark) {
        if (!pricesAsset || !pricesBenchmark) return 0;
        const n = Math.min(pricesAsset.length, pricesBenchmark.length);
        if (n < 3) return 0;
        const retA = this.calculateReturns(pricesAsset.slice(-n));
        const retB = this.calculateReturns(pricesBenchmark.slice(-n));
        const meanA = _mean(retA);
        const meanB = _mean(retB);
        let cov = 0, varB = 0;
        for (let i = 0; i < retA.length; i++) {
            const dA = retA[i] - meanA;
            const dB = retB[i] - meanB;
            cov += dA * dB;
            varB += dB * dB;
        }
        if (varB === 0) return 0;
        return cov / varB;
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
    // Geometric Brownian Motion. Returns p5/p50/p95 trajectories + final distribution stats.
    monteCarlo(prices, days = 252, paths = 1000) {
        if (!prices || prices.length < 30) return null;
        const logRet = this.calculateLogReturns(prices);
        const mu = _mean(logRet);
        const sigma = _stdev(logRet, mu);
        const S0 = prices[prices.length - 1];

        const finals = new Float64Array(paths);
        // store every path's value per day for percentile extraction
        const perDay = Array.from({ length: days }, () => new Float64Array(paths));

        for (let p = 0; p < paths; p++) {
            let s = S0;
            for (let d = 0; d < days; d++) {
                s = s * Math.exp((mu - 0.5 * sigma * sigma) + sigma * _gaussian());
                perDay[d][p] = s;
            }
            finals[p] = s;
        }

        const pickPct = (arr, pct) => {
            const sorted = Array.from(arr).sort((a, b) => a - b);
            return sorted[Math.floor(pct * (sorted.length - 1))];
        };

        const p5 = new Array(days);
        const p50 = new Array(days);
        const p95 = new Array(days);
        for (let d = 0; d < days; d++) {
            p5[d] = pickPct(perDay[d], 0.05);
            p50[d] = pickPct(perDay[d], 0.50);
            p95[d] = pickPct(perDay[d], 0.95);
        }

        const sortedFinals = Array.from(finals).sort((a, b) => a - b);
        return {
            S0,
            days,
            paths,
            p5, p50, p95,
            finalP5: sortedFinals[Math.floor(0.05 * (paths - 1))],
            finalP50: sortedFinals[Math.floor(0.50 * (paths - 1))],
            finalP95: sortedFinals[Math.floor(0.95 * (paths - 1))],
            expectedReturn: (sortedFinals.reduce((a, b) => a + b, 0) / paths - S0) / S0
        };
    },

    runBacktest(prices, signalCallback) {
        if (!prices || prices.length < 15) return 0;
        let capital = 10000;
        let position = 0;
        for (let i = 14; i < prices.length; i++) {
            const historySlice = prices.slice(0, i);
            const currentPrice = prices[i];
            const signal = signalCallback(historySlice);
            if (signal === 1 && capital > currentPrice) {
                position = capital / currentPrice;
                capital = 0;
            } else if (signal === -1 && position > 0) {
                capital = position * currentPrice;
                position = 0;
            }
        }
        const finalValue = capital + (position * prices[prices.length - 1]);
        return ((finalValue - 10000) / 10000) * 100;
    },

    // ============ SENTIMENT ============
    sentimentScore(headlines) {
        if (!headlines || headlines.length === 0) return { score: 0, label: 'NEUTRAL', bull: 0, bear: 0 };
        let bull = 0, bear = 0;
        for (const h of headlines) {
            const text = String(h || '').toLowerCase();
            for (const w of BULL_WORDS) if (text.includes(w)) bull++;
            for (const w of BEAR_WORDS) if (text.includes(w)) bear++;
        }
        const total = bull + bear;
        const score = total === 0 ? 0 : (bull - bear) / total;
        let label = 'NEUTRAL';
        if (score > 0.25) label = 'BULLISH';
        else if (score < -0.25) label = 'BEARISH';
        return { score, label, bull, bear };
    }
};
