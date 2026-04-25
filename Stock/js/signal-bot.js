// Nemeris Signal Bot — Multi-factor regime-aware signal engine.
// Pipeline: indicators → factor scores → regime detection → regime-weighted composite
// → confluence multiplier → risk penalty → 0-100 signal + ATR/Kelly risk management.
import { getCurrency } from './state.js';

const DEFAULT_OPTIONS = {
    accountCapital: 10000,
    accountRisk: 0.02,
    maxPosition: 0.2,
    slMult: 1.5,
    tpMult: 2.5,
    transactionCost: 0.0015,
    minLength: 30,
    weights: { rsi: 0.20, macd: 0.25, sma: 0.30, momentum: 0.15, volume: 0.10 }
};

const PERIOD_LABELS = {
    '1D': 'over 1 day',
    '1W': 'over 1 week',
    '1M': 'over 1 month',
    '3M': 'over 3 months',
    '6M': 'over 6 months',
    '1Y': 'over 1 year',
    '3Y': 'over 3 years',
    '5Y': 'over 5 years',
    'YTD': 'year to date',
    'MAX': 'all time'
};

const HORIZON_MAP = {
    '1D': { label: 'Very Short Term', desc: 'Intraday (24h)' },
    '1W': { label: 'Short Term', desc: 'Swing (1 Week)' },
    '1M': { label: 'Medium Term', desc: 'Swing (1 Month)' },
    '3M': { label: 'Medium Term', desc: 'Trend (3 Months)' },
    '6M': { label: 'Medium/Long Term', desc: 'Trend (6 Months)' },
    '1Y': { label: 'Long Term', desc: 'Investment (1 Year)' },
    '3Y': { label: 'Long Term', desc: 'Investment (3 Years)' },
    '5Y': { label: 'Long Term', desc: 'Investment (5 Years)' },
    'YTD': { label: 'Year to Date', desc: 'Since Jan 1st' },
    'MAX': { label: 'Very Long Term', desc: 'Full History' }
};

// Adaptive indicator config per candle granularity.
// volScale normalizes raw ATR%/price by candle horizon (intraday ATR is much smaller than yearly).
const PERIOD_INDICATOR_CONFIG = {
    '1D':  { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 },
    '1W':  { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 },
    '1M':  { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 },
    '3M':  { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.008, volScale: 1.2 },
    '6M':  { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.008, volScale: 1.5 },
    '1Y':  { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.01,  volScale: 2 },
    'YTD': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.01,  volScale: 2 },
    '3Y':  { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 104], momentumPeriod: 8,  atrPeriod: 14, macdNormFactor: 0.02,  volScale: 3 },
    '5Y':  { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 104], momentumPeriod: 8,  atrPeriod: 14, macdNormFactor: 0.02,  volScale: 4 },
    'MAX': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [12, 36, 60],  momentumPeriod: 6,  atrPeriod: 14, macdNormFactor: 0.04,  volScale: 6 }
};
const DEFAULT_INDICATOR_CONFIG = PERIOD_INDICATOR_CONFIG['1D'];

const getRiskColorClass = (score) => {
    if (score >= 9) return 'negative';
    if (score >= 7) return 'negative';
    if (score >= 4) return 'warning';
    return 'positive';
};

// === Utils ===

const safeArray = (arr) => Array.isArray(arr) ? arr : [];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function validateData(data, opts = {}) {
    const prices = safeArray(data?.prices);
    const minBars = 50;
    return prices.length >= Math.max(minBars, opts.minLength || 30) && prices.every(x => x > 0);
}

// === Core indicators ===

function calculateRSI(prices, period = 14) {
    const series = calculateRSISeries(prices, period);
    return series.length ? series[series.length - 1] : 50;
}

// Returns full RSI series (length = prices.length - period). Used by current value AND divergence detection.
function calculateRSISeries(prices, period = 14) {
    const p = safeArray(prices);
    if (p.length < period + 1) return [];

    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
        const diff = p[i] - p[i - 1];
        if (diff > 0) gain += diff;
        else loss -= diff;
    }
    gain /= period;
    loss /= period;

    const series = [loss === 0 ? 100 : 100 - (100 / (1 + gain / loss))];

    for (let i = period + 1; i < p.length; i++) {
        const diff = p[i] - p[i - 1];
        gain = (gain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        loss = (loss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
        const rs = loss === 0 ? 100 : gain / loss;
        series.push(100 - (100 / (1 + rs)));
    }
    return series;
}

function calculateEMA(prices, period) {
    const p = safeArray(prices);
    if (p.length === 0) return 0;
    if (p.length < period) return p.reduce((a, b) => a + b, 0) / p.length;

    const k = 2 / (period + 1);
    let ema = p.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < p.length; i++) {
        ema = p[i] * k + ema * (1 - k);
    }
    return ema;
}

function calculateSMA(prices, period) {
    const p = safeArray(prices);
    if (p.length === 0) return 0;
    if (p.length < period) return p.reduce((a, b) => a + b, 0) / p.length;
    return p.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateStdDev(prices, period) {
    const p = safeArray(prices).slice(-period);
    if (p.length === 0) return 0;
    const mean = p.reduce((a, b) => a + b, 0) / p.length;
    const variance = p.reduce((a, b) => a + (b - mean) ** 2, 0) / p.length;
    return Math.sqrt(variance);
}

function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
    const p = safeArray(prices);
    if (p.length < slow) return { line: 0, signal: 0, hist: 0, series: [] };

    const kFast = 2 / (fast + 1);
    const kSlow = 2 / (slow + 1);

    let emaFast = p.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
    let emaSlow = p.slice(0, slow).reduce((a, b) => a + b, 0) / slow;

    const macdLineSeries = [];

    for (let i = 1; i < p.length; i++) {
        if (i >= fast) emaFast = p[i] * kFast + emaFast * (1 - kFast);
        else emaFast = (emaFast * i + p[i]) / (i + 1);

        if (i >= slow) emaSlow = p[i] * kSlow + emaSlow * (1 - kSlow);
        else emaSlow = (emaSlow * i + p[i]) / (i + 1);

        if (i >= slow - 1) macdLineSeries.push(emaFast - emaSlow);
    }

    const currentLine = macdLineSeries[macdLineSeries.length - 1] || 0;
    const currentSignal = calculateEMA(macdLineSeries, signal);

    return {
        line: currentLine,
        signal: currentSignal,
        hist: currentLine - currentSignal,
        series: macdLineSeries
    };
}

function calculateATR(highs, lows, closes, period = 14) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const n = Math.min(h.length, l.length, c.length);

    if (n < 2) return 0;

    const trueRanges = [];
    for (let i = 1; i < n; i++) {
        const hl = h[i] - l[i];
        const hc = Math.abs(h[i] - c[i - 1]);
        const lc = Math.abs(l[i] - c[i - 1]);
        trueRanges.push(Math.max(hl, hc, lc));
    }

    if (trueRanges.length < period) return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;

    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
        atr = (atr * (period - 1) + trueRanges[i]) / period;
    }
    return atr;
}

function calculateMomentum(prices, period = 10) {
    const p = safeArray(prices);
    if (p.length < period + 1) return 0;
    const current = p[p.length - 1];
    const prev = p[p.length - period - 1];
    return prev === 0 ? 0 : ((current - prev) / prev) * 100;
}

// === Extended indicator suite ===

// Linear regression slope of last `period` values, normalized to % per bar.
function calculateSlope(prices, period) {
    const p = safeArray(prices).slice(-period);
    const n = p.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += p[i];
        sumXY += i * p[i];
        sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return 0;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const mean = sumY / n;
    return mean === 0 ? 0 : (slope / mean) * 100;
}

function calculateBollinger(prices, period = 20, mult = 2) {
    const p = safeArray(prices);
    if (p.length < period) return { upper: 0, middle: 0, lower: 0, percentB: 0.5, bandwidth: 0, sd: 0 };
    const sma = calculateSMA(p, period);
    const sd = calculateStdDev(p, period);
    const upper = sma + mult * sd;
    const lower = sma - mult * sd;
    const last = p[p.length - 1];
    const range = upper - lower;
    const percentB = range === 0 ? 0.5 : (last - lower) / range;
    const bandwidth = sma === 0 ? 0 : (range / sma) * 100;
    return { upper, middle: sma, lower, percentB, bandwidth, sd };
}

// Stochastic %K and %D — momentum oscillator, contextualizes RSI.
function calculateStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const n = Math.min(h.length, l.length, c.length);
    if (n < kPeriod) return { k: 50, d: 50 };

    const ks = [];
    for (let i = kPeriod - 1; i < n; i++) {
        let hh = -Infinity, ll = Infinity;
        for (let j = i - kPeriod + 1; j <= i; j++) {
            if (h[j] > hh) hh = h[j];
            if (l[j] < ll) ll = l[j];
        }
        const range = hh - ll;
        ks.push(range === 0 ? 50 : ((c[i] - ll) / range) * 100);
    }

    const k = ks[ks.length - 1];
    const dSlice = ks.slice(-dPeriod);
    const d = dSlice.reduce((a, b) => a + b, 0) / dSlice.length;
    return { k, d };
}

// ADX with directional indicators — trend strength qualifier (gates trend signals).
function calculateADX(highs, lows, closes, period = 14) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const n = Math.min(h.length, l.length, c.length);
    if (n < period * 2) return { adx: 0, plusDI: 0, minusDI: 0 };

    const tr = [], plusDM = [], minusDM = [];
    for (let i = 1; i < n; i++) {
        const upMove = h[i] - h[i - 1];
        const downMove = l[i - 1] - l[i];
        plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
        minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
        const hl = h[i] - l[i];
        const hc = Math.abs(h[i] - c[i - 1]);
        const lc = Math.abs(l[i] - c[i - 1]);
        tr.push(Math.max(hl, hc, lc));
    }

    const wilderSum = (arr, p) => {
        if (arr.length < p) return [];
        const out = [];
        let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
        out.push(s);
        for (let i = p; i < arr.length; i++) {
            s = s - (s / p) + arr[i];
            out.push(s);
        }
        return out;
    };

    const trS = wilderSum(tr, period);
    const plusS = wilderSum(plusDM, period);
    const minusS = wilderSum(minusDM, period);

    if (trS.length === 0) return { adx: 0, plusDI: 0, minusDI: 0 };

    const plusDIarr = trS.map((t, i) => t === 0 ? 0 : (plusS[i] / t) * 100);
    const minusDIarr = trS.map((t, i) => t === 0 ? 0 : (minusS[i] / t) * 100);
    const dxArr = plusDIarr.map((p, i) => {
        const sum = p + minusDIarr[i];
        return sum === 0 ? 0 : (Math.abs(p - minusDIarr[i]) / sum) * 100;
    });

    if (dxArr.length < period) {
        const avg = dxArr.length ? dxArr.reduce((a, b) => a + b, 0) / dxArr.length : 0;
        return {
            adx: avg,
            plusDI: plusDIarr[plusDIarr.length - 1] || 0,
            minusDI: minusDIarr[minusDIarr.length - 1] || 0
        };
    }

    let adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxArr.length; i++) {
        adx = (adx * (period - 1) + dxArr[i]) / period;
    }

    return {
        adx,
        plusDI: plusDIarr[plusDIarr.length - 1],
        minusDI: minusDIarr[minusDIarr.length - 1]
    };
}

// On-Balance Volume — volume confirms or denies price moves.
function calculateOBV(closes, volumes) {
    const c = safeArray(closes);
    const v = safeArray(volumes);
    const n = Math.min(c.length, v.length);
    if (n < 2) return { obv: 0, slope: 0 };

    const series = [0];
    for (let i = 1; i < n; i++) {
        const last = series[series.length - 1];
        if (c[i] > c[i - 1]) series.push(last + (v[i] || 0));
        else if (c[i] < c[i - 1]) series.push(last - (v[i] || 0));
        else series.push(last);
    }

    const recent = series.slice(-20);
    const m = recent.length;
    if (m < 2) return { obv: series[series.length - 1], slope: 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < m; i++) {
        sumX += i; sumY += recent[i]; sumXY += i * recent[i]; sumX2 += i * i;
    }
    const denom = m * sumX2 - sumX * sumX;
    const rawSlope = denom === 0 ? 0 : (m * sumXY - sumX * sumY) / denom;
    const meanAbs = recent.reduce((a, b) => a + Math.abs(b), 0) / m;
    const slope = meanAbs === 0 ? 0 : rawSlope / meanAbs;
    return { obv: series[series.length - 1], slope };
}

// Money Flow Index — volume-weighted RSI. Classic divergence indicator.
function calculateMFI(highs, lows, closes, volumes, period = 14) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const v = safeArray(volumes);
    const n = Math.min(h.length, l.length, c.length, v.length);
    if (n < period + 1) return 50;

    let posFlow = 0, negFlow = 0;
    let prevTP = (h[n - period - 1] + l[n - period - 1] + c[n - period - 1]) / 3;
    for (let i = n - period; i < n; i++) {
        const tp = (h[i] + l[i] + c[i]) / 3;
        const mf = tp * (v[i] || 0);
        if (tp > prevTP) posFlow += mf;
        else if (tp < prevTP) negFlow += mf;
        prevTP = tp;
    }
    if (negFlow === 0) return 100;
    if (posFlow === 0) return 0;
    return 100 - (100 / (1 + posFlow / negFlow));
}

// Ichimoku Tenkan/Kijun — Japanese trend filter (cross = early signal).
function calculateIchimoku(highs, lows, tenkanP = 9, kijunP = 26) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const n = Math.min(h.length, l.length);
    if (n < kijunP) return { tenkan: 0, kijun: 0, signal: 0 };

    const periodHL = (period) => {
        let hh = -Infinity, ll = Infinity;
        for (let i = n - period; i < n; i++) {
            if (h[i] > hh) hh = h[i];
            if (l[i] < ll) ll = l[i];
        }
        return (hh + ll) / 2;
    };

    const tenkan = periodHL(tenkanP);
    const kijun = periodHL(kijunP);
    return { tenkan, kijun, signal: tenkan > kijun ? 1 : tenkan < kijun ? -1 : 0 };
}

// SuperTrend — ATR-channel trend follower. Direction flip = explicit regime change.
function calculateSuperTrend(highs, lows, closes, period = 10, mult = 3) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const n = Math.min(h.length, l.length, c.length);
    if (n < period + 1) return { value: 0, direction: 0 };

    const tr = [];
    for (let i = 1; i < n; i++) {
        const hl = h[i] - l[i];
        const hc = Math.abs(h[i] - c[i - 1]);
        const lc = Math.abs(l[i] - c[i - 1]);
        tr.push(Math.max(hl, hc, lc));
    }

    const atrSeries = [];
    let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    atrSeries.push(atr);
    for (let i = period; i < tr.length; i++) {
        atr = (atr * (period - 1) + tr[i]) / period;
        atrSeries.push(atr);
    }

    let direction = 1;
    let prevUpper = 0, prevLower = 0;
    let supertrend = 0;

    const startIdx = period;
    for (let i = 0; i < atrSeries.length; i++) {
        const cIdx = startIdx + i;
        if (cIdx >= n) break;
        const hl2 = (h[cIdx] + l[cIdx]) / 2;
        const upper = hl2 + mult * atrSeries[i];
        const lower = hl2 - mult * atrSeries[i];
        const prevC = cIdx > 0 ? c[cIdx - 1] : c[cIdx];

        const finalUpper = (upper < prevUpper || prevC > prevUpper) ? upper : prevUpper;
        const finalLower = (lower > prevLower || prevC < prevLower) ? lower : prevLower;

        if (i === 0) {
            supertrend = finalUpper;
            direction = c[cIdx] > finalUpper ? 1 : -1;
        } else if (supertrend === prevUpper) {
            if (c[cIdx] > finalUpper) { supertrend = finalLower; direction = 1; }
            else { supertrend = finalUpper; direction = -1; }
        } else {
            if (c[cIdx] < finalLower) { supertrend = finalUpper; direction = -1; }
            else { supertrend = finalLower; direction = 1; }
        }
        prevUpper = finalUpper;
        prevLower = finalLower;
    }

    return { value: supertrend, direction };
}

// Bullish/bearish RSI divergence — a classic reversal anticipator.
// Bullish: price LL but RSI HL → exhaustion of selling.
// Bearish: price HH but RSI LH → exhaustion of buying.
function detectDivergence(prices, rsiSeries, lookback = 30) {
    const len = Math.min(prices.length, rsiSeries.length, lookback);
    const p = prices.slice(-len);
    const r = rsiSeries.slice(-len);
    if (p.length < 10) return { bullish: false, bearish: false };

    const lows = [], highs = [];
    for (let i = 2; i < p.length - 2; i++) {
        if (p[i] < p[i-1] && p[i] < p[i-2] && p[i] < p[i+1] && p[i] < p[i+2]) lows.push(i);
        if (p[i] > p[i-1] && p[i] > p[i-2] && p[i] > p[i+1] && p[i] > p[i+2]) highs.push(i);
    }

    let bullish = false, bearish = false;
    if (lows.length >= 2) {
        const i1 = lows[lows.length - 2], i2 = lows[lows.length - 1];
        if (p[i2] < p[i1] && r[i2] > r[i1]) bullish = true;
    }
    if (highs.length >= 2) {
        const i1 = highs[highs.length - 2], i2 = highs[highs.length - 1];
        if (p[i2] > p[i1] && r[i2] < r[i1]) bearish = true;
    }
    return { bullish, bearish };
}

// Candlestick patterns on the latest 1-2 bars.
function detectCandlestickPatterns(opens, highs, lows, closes) {
    const o = safeArray(opens);
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const n = Math.min(o.length, h.length, l.length, c.length);
    if (n < 2) return [];

    const o1 = o[n-1], h1 = h[n-1], l1 = l[n-1], c1 = c[n-1];
    const o0 = o[n-2], c0 = c[n-2];
    const body1 = Math.abs(c1 - o1);
    const range1 = h1 - l1;
    if (range1 === 0) return [];
    const upperShadow = h1 - Math.max(o1, c1);
    const lowerShadow = Math.min(o1, c1) - l1;
    const patterns = [];

    if (body1 / range1 < 0.1) patterns.push({ name: 'Doji', bullish: 0, strength: 0.5 });
    if (lowerShadow > 2 * body1 && upperShadow < body1 && body1 / range1 < 0.4) {
        patterns.push({ name: 'Hammer', bullish: 1, strength: 0.8 });
    }
    if (upperShadow > 2 * body1 && lowerShadow < body1 && body1 / range1 < 0.4) {
        patterns.push({ name: 'Shooting Star', bullish: -1, strength: 0.8 });
    }
    if (c0 < o0 && c1 > o1 && c1 > o0 && o1 < c0) {
        patterns.push({ name: 'Bullish Engulfing', bullish: 1, strength: 0.9 });
    }
    if (c0 > o0 && c1 < o1 && c1 < o0 && o1 > c0) {
        patterns.push({ name: 'Bearish Engulfing', bullish: -1, strength: 0.9 });
    }

    return patterns;
}

function calculateMaxDrawdown(prices) {
    const p = safeArray(prices);
    if (p.length < 2) return 0;
    let peak = p[0];
    let maxDD = 0;
    for (let i = 1; i < p.length; i++) {
        if (p[i] > peak) peak = p[i];
        const dd = (peak - p[i]) / peak;
        if (dd > maxDD) maxDD = dd;
    }
    return maxDD * 100;
}

function calculateVolumeRatio(volumes, period = 20) {
    const v = safeArray(volumes);
    if (v.length < period + 1) return 1;
    const recent = v[v.length - 1] || 0;
    const avgArr = v.slice(-period - 1, -1);
    const avg = avgArr.reduce((a, b) => a + b, 0) / avgArr.length;
    return avg === 0 ? 1 : recent / avg;
}

// === Engine ===

function calculateBotSignal(data, options = {}) {
    options = { ...DEFAULT_OPTIONS, ...options };

    const prices = safeArray(data.prices);
    const opens = safeArray(data.opens || prices);
    const highs = safeArray(data.highs || prices);
    const lows = safeArray(data.lows || prices);
    const volumes = safeArray(data.volumes);

    if (!validateData(data, options)) {
        return {
            signalValue: 50,
            signalTitle: 'Insufficient Data',
            signalDesc: 'Analysis not possible',
            explanation: 'Waiting for more market history or choose a longer period.',
            details: {},
            isInsufficient: true
        };
    }

    const currentPrice = prices[prices.length - 1];

    const ic = PERIOD_INDICATOR_CONFIG[options.period] || DEFAULT_INDICATOR_CONFIG;

    // --- Indicators ---
    const rsiSeries = calculateRSISeries(prices, ic.rsiPeriod);
    const rsi = rsiSeries.length ? rsiSeries[rsiSeries.length - 1] : 50;
    const macd = calculateMACD(prices, ic.macdFast, ic.macdSlow, ic.macdSignal);
    const sma20 = calculateSMA(prices, ic.sma[0]);
    const sma50 = calculateSMA(prices, ic.sma[1]);
    const sma200 = calculateSMA(prices, ic.sma[2]);
    const priceSlope = calculateSlope(prices, Math.min(20, ic.sma[0]));
    const adx = calculateADX(highs, lows, prices, 14);
    const bb = calculateBollinger(prices, 20, 2);
    const stoch = calculateStochastic(highs, lows, prices, 14, 3);
    const obv = calculateOBV(prices, volumes);
    const mfi = calculateMFI(highs, lows, prices, volumes, 14);
    const ichimoku = calculateIchimoku(highs, lows, 9, 26);
    const supertrend = calculateSuperTrend(highs, lows, prices, 10, 3);
    const atr = calculateATR(highs, lows, prices, ic.atrPeriod);
    const momentum = calculateMomentum(prices, ic.momentumPeriod);
    const momentum5 = calculateMomentum(prices, 5);
    const momentum20 = calculateMomentum(prices, 20);
    const drawdown = calculateMaxDrawdown(prices);
    const volRatio = calculateVolumeRatio(volumes, 20);
    const divergence = detectDivergence(prices.slice(-rsiSeries.length), rsiSeries, 30);
    const patterns = detectCandlestickPatterns(opens, highs, lows, prices);

    // --- Regime classification ---
    let regimeType;
    if (adx.adx >= 25) regimeType = adx.plusDI > adx.minusDI ? 'uptrend' : 'downtrend';
    else if (adx.adx < 20) regimeType = 'ranging';
    else regimeType = 'transitional';

    const rawVolatilityPct = (atr / currentPrice) * 100;
    const volatilityPct = rawVolatilityPct / ic.volScale;
    const volRegime = volatilityPct > 5 ? 'high' : volatilityPct > 2 ? 'normal' : 'low';
    const bbSqueeze = bb.bandwidth > 0 && bb.bandwidth < 4;

    // --- Factor: TREND ---
    let trendScore = 0;
    if (currentPrice > sma20) trendScore += 0.5; else trendScore -= 0.5;
    if (currentPrice > sma50) trendScore += 0.3; else trendScore -= 0.3;
    if (currentPrice > sma200) trendScore += 0.2; else trendScore -= 0.2;
    if (sma20 > sma50) trendScore += 0.2; else trendScore -= 0.2;
    if (sma50 > sma200) trendScore += 0.15; else trendScore -= 0.15;
    if (priceSlope > 0) trendScore += clamp(priceSlope / 2, 0, 0.3);
    else trendScore += clamp(priceSlope / 2, -0.3, 0);
    if (ichimoku.signal > 0) trendScore += 0.15;
    else if (ichimoku.signal < 0) trendScore -= 0.15;
    if (supertrend.direction > 0) trendScore += 0.2;
    else if (supertrend.direction < 0) trendScore -= 0.2;
    // ADX gate: weak ADX → low conviction in trend signals (multiply down).
    const adxGate = clamp(adx.adx / 25, 0.4, 1);
    trendScore = clamp((trendScore / 2) * adxGate, -1, 1);

    // --- Factor: MOMENTUM ---
    // RSI: oversold/overbought extremes carry the most weight.
    let momentumScore = 0;
    if (rsi < 30) momentumScore += 0.8;
    else if (rsi < 40) momentumScore += 0.4;
    else if (rsi > 70) momentumScore -= 0.8;
    else if (rsi > 60) momentumScore -= 0.4;
    else momentumScore -= ((rsi - 50) / 25);

    // MACD: histogram magnitude + zero-line + signal-line cross.
    const macdNorm = clamp(macd.hist / (currentPrice * ic.macdNormFactor), -1, 1);
    momentumScore += macdNorm * 0.7;
    momentumScore += macd.line > 0 ? 0.15 : -0.15;
    momentumScore += macd.line > macd.signal ? 0.15 : -0.15;

    // Stochastic: cross confirmation only in extreme zones.
    if (stoch.k < 20 && stoch.k > stoch.d) momentumScore += 0.5;
    else if (stoch.k > 80 && stoch.k < stoch.d) momentumScore -= 0.5;
    else momentumScore -= ((stoch.k - 50) / 100);

    // Multi-period Rate-of-Change breadth: 5/10/20 bars.
    // All three pointing same direction = strong momentum confirmation.
    const roc5  = clamp(momentum5  / 5,  -0.3, 0.3);
    const roc10 = clamp(momentum   / 10, -0.3, 0.3);
    const roc20 = clamp(momentum20 / 20, -0.3, 0.3);
    const rocBreadth = roc5 + roc10 + roc20; // [-0.9, +0.9]
    momentumScore += rocBreadth * 0.35;

    momentumScore = clamp(momentumScore / 3.5, -1, 1);

    // --- Factor: MEAN REVERSION ---
    let meanRevScore = 0;
    if (bb.percentB < 0) meanRevScore += 0.9;
    else if (bb.percentB < 0.2) meanRevScore += 0.6;
    else if (bb.percentB > 1) meanRevScore -= 0.9;
    else if (bb.percentB > 0.8) meanRevScore -= 0.6;
    else meanRevScore -= (bb.percentB - 0.5) * 0.8;

    const zScore = bb.sd === 0 ? 0 : (currentPrice - sma20) / bb.sd;
    if (zScore < -2) meanRevScore += 0.6;
    else if (zScore > 2) meanRevScore -= 0.6;
    else meanRevScore -= zScore * 0.2;

    meanRevScore = clamp(meanRevScore / 1.5, -1, 1);

    // --- Factor: VOLUME ---
    let volumeScore = 0;
    if (obv.slope > 0.05) volumeScore += 0.4;
    else if (obv.slope < -0.05) volumeScore -= 0.4;

    if (mfi < 20) volumeScore += 0.5;
    else if (mfi > 80) volumeScore -= 0.5;
    else volumeScore -= ((mfi - 50) / 50) * 0.4;

    if (prices.length >= 2 && volRatio > 1.5) {
        const lastDir = currentPrice > prices[prices.length - 2] ? 1 : -1;
        volumeScore += 0.3 * lastDir;
    }
    volumeScore = clamp(volumeScore, -1, 1);

    // --- Factor: PATTERN ---
    let patternScore = 0;
    if (divergence.bullish) patternScore += 0.5;
    if (divergence.bearish) patternScore -= 0.5;
    for (const pat of patterns) patternScore += pat.bullish * pat.strength * 0.4;
    patternScore = clamp(patternScore, -1, 1);

    // --- Composite (regime-weighted) ---
    let weights;
    if (regimeType === 'uptrend' || regimeType === 'downtrend') {
        if (adx.adx >= 40) {
            weights = { trend: 0.60, momentum: 0.22, meanRev: 0.03, volume: 0.10, pattern: 0.05 };
        } else {
            weights = { trend: 0.42, momentum: 0.25, meanRev: 0.10, volume: 0.13, pattern: 0.10 };
        }
    } else if (regimeType === 'ranging') {
        weights = { trend: 0.08, momentum: 0.18, meanRev: 0.42, volume: 0.17, pattern: 0.15 };
    } else {
        weights = { trend: 0.22, momentum: 0.25, meanRev: 0.25, volume: 0.18, pattern: 0.10 };
    }

    let totalScore = (
        trendScore * weights.trend +
        momentumScore * weights.momentum +
        meanRevScore * weights.meanRev +
        volumeScore * weights.volume +
        patternScore * weights.pattern
    );

    // --- Confluence multiplier ---
    const factors = [trendScore, momentumScore, meanRevScore, volumeScore, patternScore];
    const compSign = totalScore >= 0 ? 1 : -1;
    const agreeing = factors.filter(f => Math.sign(f) === compSign && Math.abs(f) > 0.1).length;
    const confluenceRatio = agreeing / factors.length;
    const confluenceMult = 0.6 + confluenceRatio * 0.8; // [0.6, 1.4]
    totalScore *= confluenceMult;

    // --- Risk score (1-10) ---
    let riskScore = 1;
    if (volatilityPct > 20 || currentPrice < 0.001) riskScore = 10;
    else if (volatilityPct > 15 || currentPrice < 0.01) riskScore = 9;
    else if (volatilityPct > 10 || currentPrice < 0.1) riskScore = 8;
    else if (volatilityPct > 7) riskScore = 7;
    else if (volatilityPct > 5) riskScore = 6;
    else if (volatilityPct > 3.5) riskScore = 5;
    else if (volatilityPct > 2) riskScore = 4;
    else if (volatilityPct > 1) riskScore = 3;
    else if (volatilityPct > 0.5) riskScore = 2;

    if (drawdown > 50) riskScore = Math.min(10, riskScore + 2);
    else if (drawdown > 30) riskScore = Math.min(10, riskScore + 1);

    const lastVol = volumes[volumes.length - 1] || 0;
    if (lastVol > 0 && lastVol < 10000) riskScore = Math.min(10, riskScore + 1);

    if (riskScore > 4) {
        const penalty = (riskScore - 4) * 0.08;
        totalScore -= penalty * compSign;
    }
    if (riskScore >= 9) totalScore = Math.min(totalScore, -0.35);

    totalScore = clamp(totalScore, -1, 1);

    const signalValue = Math.round(50 + totalScore * 50);

    // --- Title / desc ---
    let title, desc;
    if (signalValue >= 80) { title = 'Strong Buy'; desc = `Buy signal (${agreeing}/5 factors align)`; }
    else if (signalValue >= 60) { title = 'Buy'; desc = `Moderate buy signal (confluence ${Math.round(confluenceRatio * 100)}%)`; }
    else if (signalValue >= 55) { title = 'Buy'; desc = 'Slight bullish bias'; }
    else if (signalValue <= 20) { title = 'Strong Sell'; desc = `Sell signal (${agreeing}/5 factors align)`; }
    else if (signalValue <= 35) { title = 'Sell'; desc = `Moderate sell signal (confluence ${Math.round(confluenceRatio * 100)}%)`; }
    else if (signalValue <= 45) { title = 'Sell'; desc = 'Slight bearish bias'; }
    else { title = 'Hold'; desc = 'Neutral signal — insufficient confluence'; }

    // --- Risk management (regime-adjusted) ---
    const slMult = regimeType === 'ranging' ? options.slMult * 0.8 : options.slMult;
    const tpMult = (regimeType === 'uptrend' || regimeType === 'downtrend') ? options.tpMult * 1.2 : options.tpMult;
    const slDist = atr * slMult;
    const tpDist = atr * tpMult;
    const dir = totalScore >= 0 ? 1 : -1;
    const stopLoss = currentPrice - dir * slDist;
    const takeProfit = currentPrice + dir * tpDist;

    // Quarter-Kelly position sizing
    const winRateProxy = clamp(0.5 + confluenceRatio * 0.15 - (riskScore - 5) * 0.02, 0.35, 0.65);
    const payoff = tpMult / slMult;
    const kellyFrac = Math.max(0, winRateProxy - (1 - winRateProxy) / payoff);
    const accountRiskFrac = clamp(kellyFrac * 0.25, 0.005, 0.04);
    const positionSize = Math.min(
        options.maxPosition,
        (options.accountCapital * accountRiskFrac) / Math.max(slDist, currentPrice * 0.005)
    );

    // --- Risk label ---
    let riskLevel, riskDesc;
    if (riskScore >= 9)       { riskLevel = 'Extreme ☠️'; riskDesc = 'Highly Volatile'; }
    else if (riskScore >= 7)  { riskLevel = 'High ⚠️'; riskDesc = 'Volatile'; }
    else if (riskScore >= 5)  { riskLevel = 'Moderate'; riskDesc = 'Average Market'; }
    else if (riskScore >= 3)  { riskLevel = 'Low'; riskDesc = 'Stable'; }
    else if (riskScore === 2) { riskLevel = 'Very Low'; riskDesc = 'Very Stable'; }
    else                      { riskLevel = 'None'; riskDesc = 'Near-Immobile'; }

    // --- Regime label ---
    const regimeLabels = {
        uptrend:      { label: 'Uptrend', desc: `ADX ${adx.adx.toFixed(0)} — buyer momentum` },
        downtrend:    { label: 'Downtrend', desc: `ADX ${adx.adx.toFixed(0)} — seller pressure` },
        ranging:      { label: 'Ranging Market', desc: `ADX ${adx.adx.toFixed(0)} — directionless` },
        transitional: { label: 'Transition', desc: `ADX ${adx.adx.toFixed(0)} — ambiguous regime` }
    };
    const regimeInfo = regimeLabels[regimeType];

    const allPatterns = [
        ...patterns,
        ...(divergence.bullish ? [{ name: 'Bullish RSI Divergence', bullish: 1, strength: 0.7 }] : []),
        ...(divergence.bearish ? [{ name: 'Bearish RSI Divergence', bullish: -1, strength: 0.7 }] : [])
    ];

    return {
        symbol: data.symbol,
        period: options.period,
        signalValue,
        signalTitle: title,
        signalDesc: desc,
        risk: { level: riskLevel, desc: riskDesc, score: riskScore, volatility: volatilityPct, drawdown },
        regime: { type: regimeType, strength: adx.adx, label: regimeInfo.label, desc: regimeInfo.desc, volRegime, squeeze: bbSqueeze },
        confluence: { ratio: confluenceRatio, agreeing, total: factors.length, multiplier: confluenceMult },
        patterns: allPatterns,
        explanation: {
            currentPrice,
            rsi, macdHistogram: macd.hist, macdLine: macd.line, macdSignal: macd.signal,
            sma20, sma50, sma200, smaConfig: ic.sma, indicatorConfig: ic,
            momentum, momentum5, momentum20,
            atr, rawVolatility: rawVolatilityPct, drawdown,
            adx: adx.adx, plusDI: adx.plusDI, minusDI: adx.minusDI,
            bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower, bbPercentB: bb.percentB, bbBandwidth: bb.bandwidth,
            stochK: stoch.k, stochD: stoch.d,
            obvSlope: obv.slope, mfi, volRatio,
            ichimoku, supertrend,
            zScore,
            scores: { trend: trendScore, momentum: momentumScore, meanRev: meanRevScore, volume: volumeScore, pattern: patternScore },
            weights, weightedScore: totalScore,
            stopLoss, takeProfit, positionSize
        },
        stopLoss, takeProfit, positionSize,
        details: {
            rsi: rsi.toFixed(2),
            macd: macd.hist.toFixed(4),
            sma20: sma20.toFixed(2),
            momentum: momentum.toFixed(2) + '%',
            score: totalScore.toFixed(2),
            adx: adx.adx.toFixed(1),
            regime: regimeInfo.label,
            confluence: `${agreeing}/5`
        }
    };
}

// === UI ===

function updateSignalUI(symbol, result) {
    const card = document.getElementById(`card-${symbol}`);
    if (!card) return;

    const explanationContainer = card.querySelector('.signal-explanation');
    const explanationContent = card.querySelector('.explanation-content');



    if (!explanationContainer || !explanationContent) return;

    explanationContainer.classList.remove('hidden-by-bot');

    if (result.isInsufficient) {
        explanationContent.innerHTML = `
            <div class="signal-state-description" style="margin-top: 10px; text-align: center;">
                ${result.explanation}
            </div>
        `;
        return;
    }

    const e = result.explanation;
    const price = e.currentPrice;

    // RSI
    let rsiText = 'Neutral', rsiClass = 'neutral';
    if (e.rsi < 30) { rsiText = 'Oversold — opportunity'; rsiClass = 'positive'; }
    else if (e.rsi < 40) { rsiText = 'Weakening — bullish bias'; rsiClass = 'positive'; }
    else if (e.rsi > 70) { rsiText = 'Overbought — correction risk'; rsiClass = 'negative'; }
    else if (e.rsi > 60) { rsiText = 'Supported — bearish bias'; rsiClass = 'negative'; }

    // MACD
    let macdText, macdClass;
    if (e.macdHistogram > 0 && e.macdLine > 0) { macdText = 'Confirmed Bullish'; macdClass = 'positive'; }
    else if (e.macdHistogram > 0) { macdText = 'Bullish Recovery'; macdClass = 'positive'; }
    else if (e.macdHistogram < 0 && e.macdLine < 0) { macdText = 'Confirmed Bearish'; macdClass = 'negative'; }
    else { macdText = 'Bullish Exhaustion'; macdClass = 'negative'; }

    // Stochastic
    let stochText, stochClass = 'neutral';
    if (e.stochK < 20 && e.stochK > e.stochD) { stochText = 'Bullish crossover in oversold'; stochClass = 'positive'; }
    else if (e.stochK < 20) { stochText = 'Oversold'; stochClass = 'positive'; }
    else if (e.stochK > 80 && e.stochK < e.stochD) { stochText = 'Bearish crossover in overbought'; stochClass = 'negative'; }
    else if (e.stochK > 80) { stochText = 'Overbought'; stochClass = 'negative'; }
    else stochText = 'Neutral';

    // Trend (SMA stack)
    let trendText, trendClass = 'neutral';
    if (price > e.sma200) {
        trendText = price > e.sma50 ? 'Strong Uptrend' : 'Pullback in Uptrend';
        trendClass = price > e.sma50 ? 'positive' : 'warning';
    } else {
        trendText = price < e.sma50 ? 'Strong Downtrend' : 'Bounce in Downtrend';
        trendClass = price < e.sma50 ? 'negative' : 'warning';
    }

    // Bollinger %B
    let bbText, bbClass = 'neutral';
    if (e.bbPercentB < 0) { bbText = 'Below lower band — extreme oversold'; bbClass = 'positive'; }
    else if (e.bbPercentB < 0.2) { bbText = 'Near lower band'; bbClass = 'positive'; }
    else if (e.bbPercentB > 1) { bbText = 'Above upper band — extreme overbought'; bbClass = 'negative'; }
    else if (e.bbPercentB > 0.8) { bbText = 'Near upper band'; bbClass = 'negative'; }
    else bbText = 'Within channel';

    // Volume
    let volText, volClass = 'neutral';
    if (e.obvSlope > 0.05 && e.mfi < 50) { volText = 'Accumulation — positive flow'; volClass = 'positive'; }
    else if (e.obvSlope > 0.05) { volText = 'Bullish flow'; volClass = 'positive'; }
    else if (e.obvSlope < -0.05) { volText = 'Distribution — negative flow'; volClass = 'negative'; }
    else volText = 'Neutral flow';


    // Confluence color: high agreement looks like the signal direction; low looks neutral.
    const confluencePct = Math.round(result.confluence.ratio * 100);
    let confluenceClass = 'neutral';
    if (result.confluence.agreeing >= 4) confluenceClass = result.signalValue >= 50 ? 'positive' : 'negative';
    else if (result.confluence.agreeing <= 2) confluenceClass = 'warning';

    // Regime class
    let regimeClass = 'neutral';
    if (result.regime.type === 'uptrend') regimeClass = 'positive';
    else if (result.regime.type === 'downtrend') regimeClass = 'negative';
    else if (result.regime.type === 'ranging') regimeClass = 'warning';

    let headerColor = '#fbbf24';
    if (result.signalValue >= 60) headerColor = '#4ade80';
    else if (result.signalValue <= 40) headerColor = '#f87171';

    const horizon = HORIZON_MAP[result.period] || { label: 'Medium Term', desc: 'Swing Trading (Weeks)' };

    const ddClass = e.drawdown > 30 ? 'negative' : e.drawdown > 15 ? 'warning' : 'neutral';

    // Helper: build a mini inline gauge bar for a value in a 0-100 range.
    // `value` is 0-100 (sell-to-buy), `cssClass` is the indicator's semantic class.
    const miniGauge = (value) => {
        const pct = Math.max(0, Math.min(100, value));
        return `<div style="position:relative;width:100%;height:8px;border-radius:4px;overflow:hidden;
            background:linear-gradient(90deg,#6b0000 0%,#dc2626 15%,#ef4444 25%,#f59e0b 40%,#fbbf24 50%,#84cc16 60%,#22c55e 75%,#16a34a 85%,#166534 100%);">
            <div style="position:absolute;top:0;left:${pct}%;transform:translateX(-50%);width:3px;height:100%;
                background:#fff;box-shadow:0 0 6px rgba(255,255,255,0.7);border-radius:1px;"></div>
        </div>`;
    };

    // Map each indicator to a 0-100 gauge score.
    const rsiGauge = e.rsi < 30 ? 75 : e.rsi < 40 ? 62 : e.rsi > 70 ? 25 : e.rsi > 60 ? 38 : 50;
    const macdGauge = e.macdHistogram > 0 && e.macdLine > 0 ? 80 : e.macdHistogram > 0 ? 65 : e.macdHistogram < 0 && e.macdLine < 0 ? 20 : 35;
    const stochGauge = e.stochK < 20 && e.stochK > e.stochD ? 78 : e.stochK < 20 ? 68 : e.stochK > 80 && e.stochK < e.stochD ? 22 : e.stochK > 80 ? 32 : 50;
    const trendGauge = price > e.sma200 ? (price > e.sma50 ? 82 : 58) : (price < e.sma50 ? 18 : 42);
    const bbGauge = e.bbPercentB < 0 ? 80 : e.bbPercentB < 0.2 ? 68 : e.bbPercentB > 1 ? 15 : e.bbPercentB > 0.8 ? 30 : 50;
    const volGauge = e.obvSlope > 0.05 ? 72 : e.obvSlope < -0.05 ? 28 : 50;
    const momGauge = Math.max(0, Math.min(100, 50 + e.momentum * 2));
    const regimeGauge = result.regime.type === 'uptrend' ? 78 : result.regime.type === 'downtrend' ? 22 : result.regime.type === 'ranging' ? 50 : 50;
    const confGauge = Math.round(50 + (result.confluence.agreeing / 5 - 0.5) * 60 * (result.signalValue >= 50 ? 1 : -1));
    const ddGauge = Math.max(0, Math.min(100, 50 - e.drawdown));
    const riskGauge = Math.max(0, Math.min(100, 100 - result.risk.score * 10));

    // Pattern gauge
    const patternGaugeVal = result.patterns?.length ? (result.patterns[0].bullish > 0 ? 75 : result.patterns[0].bullish < 0 ? 25 : 50) : 50;

    const patternRow = result.patterns && result.patterns.length ? `
        <tr>
            <td>Patterns</td>
            <td class="${result.patterns[0].bullish > 0 ? 'positive' : result.patterns[0].bullish < 0 ? 'negative' : 'neutral'}">
                ${result.patterns.map(p => p.name).join(', ')}
            </td>
            <td>${miniGauge(patternGaugeVal)}</td>
            <td>Detected on latest candles</td>
        </tr>` : '';

    const squeezeRow = result.regime.squeeze ? `
        <tr>
            <td>Compression</td>
            <td class="warning">Bollinger Squeeze</td>
            <td>${miniGauge(50)}</td>
            <td>Breakout imminent — direction to be confirmed</td>
        </tr>` : '';

    // Signal color for conclusion
    let conclusionColor = '#fbbf24';
    if (result.signalValue >= 60) conclusionColor = '#4ade80';
    else if (result.signalValue <= 40) conclusionColor = '#f87171';

    explanationContent.innerHTML = `
        <div style="margin-bottom: 32px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: ${conclusionColor}; text-transform: uppercase; margin-bottom: 16px; letter-spacing: 1px; text-shadow: 0 0 20px ${conclusionColor}44;">
                ${result.signalDesc}
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--color-negative);">Sell</span>
                <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: #fbbf24;">Hold</span>
                <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--color-positive);">Buy</span>
            </div>
            <div style="position: relative; width: 100%; height: 28px; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <div style="position: absolute; inset: 0; background: linear-gradient(90deg, #6b0000 0%, #dc2626 15%, #ef4444 25%, #f59e0b 40%, #fbbf24 50%, #84cc16 60%, #22c55e 75%, #16a34a 85%, #166534 100%); border-radius: 14px;"></div>
                <div style="position: absolute; top: 0; left: ${result.signalValue}%; transform: translateX(-50%); width: 3px; height: 100%; background: #fff; z-index: 2; box-shadow: 0 0 10px rgba(255,255,255,0.5);">
                    <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid #fff;"></div>
                </div>
            </div>
        </div>
        <div class="transaction-history-container" style="margin: 0;">
            <table class="transaction-history-table">
                <thead>
                    <tr>
                        <th style="color: ${headerColor} !important;">Indicator</th>
                        <th style="color: ${headerColor} !important;">Value</th>
                        <th style="color: ${headerColor} !important; min-width: 80px;">Gauge</th>
                        <th style="color: ${headerColor} !important;">Interpretation</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Regime</td>
                        <td class="${regimeClass}">${result.regime.label}</td>
                        <td>${miniGauge(regimeGauge)}</td>
                        <td>${result.regime.desc}</td>
                    </tr>
                    <tr>
                        <td>Confluence</td>
                        <td class="${confluenceClass}">${result.confluence.agreeing}/5 (${confluencePct}%)</td>
                        <td>${miniGauge(confGauge)}</td>
                        <td>Aligned factors × ${result.confluence.multiplier.toFixed(2)}</td>
                    </tr>
                    ${squeezeRow}
                    <tr>
                        <td>RSI (${e.indicatorConfig?.rsiPeriod || 14})</td>
                        <td class="${rsiClass}">${e.rsi.toFixed(1)}</td>
                        <td>${miniGauge(rsiGauge)}</td>
                        <td>${rsiText}</td>
                    </tr>
                    <tr>
                        <td>MACD</td>
                        <td class="${macdClass}">${e.macdHistogram.toFixed(4)}</td>
                        <td>${miniGauge(macdGauge)}</td>
                        <td>${macdText}</td>
                    </tr>
                    <tr>
                        <td>Stochastic</td>
                        <td class="${stochClass}">K ${e.stochK.toFixed(0)} / D ${e.stochD.toFixed(0)}</td>
                        <td>${miniGauge(stochGauge)}</td>
                        <td>${stochText}</td>
                    </tr>
                    <tr>
                        <td>Trend</td>
                        <td class="${trendClass}">${trendText}</td>
                        <td>${miniGauge(trendGauge)}</td>
                        <td>vs SMA${e.smaConfig?.[2] || 200} (${e.sma200.toFixed(2)})</td>
                    </tr>
                    <tr>
                        <td>Bollinger %B</td>
                        <td class="${bbClass}">${(e.bbPercentB * 100).toFixed(0)}%</td>
                        <td>${miniGauge(bbGauge)}</td>
                        <td>${bbText}</td>
                    </tr>
                    <tr>
                        <td>Volume Flow</td>
                        <td class="${volClass}">MFI ${e.mfi.toFixed(0)}</td>
                        <td>${miniGauge(volGauge)}</td>
                        <td>${volText}</td>
                    </tr>
                    <tr>
                        <td>Momentum</td>
                        <td class="${e.momentum > 0 ? 'positive' : 'negative'}">${e.momentum.toFixed(2)}%</td>
                        <td>${miniGauge(momGauge)}</td>
                        <td>Variation over ${e.indicatorConfig?.momentumPeriod || 10} candles</td>
                    </tr>
                    ${patternRow}
                    <tr>
                        <td>Drawdown Max</td>
                        <td class="${ddClass}">-${e.drawdown.toFixed(1)}%</td>
                        <td>${miniGauge(ddGauge)}</td>
                        <td>Worst historical drawdown</td>
                    </tr>
                    <tr>
                        <td>Horizon</td>
                        <td class="neutral">${horizon.label}</td>
                        <td></td>
                        <td>${horizon.desc}</td>
                    </tr>
                    <tr>
                        <td>Risk</td>
                        <td class="${getRiskColorClass(result.risk.score)}">${result.risk.level} (${result.risk.score}/10)</td>
                        <td>${miniGauge(riskGauge)}</td>
                        <td>${result.risk.desc}</td>
                    </tr>
                    <tr>
                        <td>Stop Loss</td>
                        <td class="negative">${e.stopLoss.toFixed(2)} ${getCurrency()}</td>
                        <td></td>
                        <td>ATR Threshold × ${(e.atr > 0 ? Math.abs(price - e.stopLoss) / e.atr : 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td>Take Profit</td>
                        <td class="positive">${e.takeProfit.toFixed(2)} ${getCurrency()}</td>
                        <td></td>
                        <td>R:R Ratio ${(Math.abs(price - e.stopLoss) > 0 ? Math.abs(e.takeProfit - price) / Math.abs(price - e.stopLoss) : 0).toFixed(2)}:1</td>
                    </tr>
                    <tr>
                        <td>Advised Size</td>
                        <td class="neutral">${e.positionSize.toFixed(2)} ${getCurrency()}</td>
                        <td></td>
                        <td>Risk-adjusted Quarter-Kelly</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="risk-note" style="margin-top: 8px; font-size: 10px; color: #6b7280; text-align: right; font-style: italic;">
            ATR Volatility ${e.atr.toFixed(2)} • +DI ${e.plusDI.toFixed(0)} / -DI ${e.minusDI.toFixed(0)} • SuperTrend ${e.supertrend.direction > 0 ? '↑' : '↓'}
        </div>
    `;
}

function updateSignal(symbol, data, options = {}) {
    const result = calculateBotSignal({ ...data, symbol }, options);
    updateSignalUI(symbol, result);
    return result;
}

export {
    calculateBotSignal,
    updateSignal,
    updateSignalUI,
    calculateRSI,
    calculateRSISeries,
    calculateSMA,
    calculateEMA,
    calculateMACD,
    calculateATR,
    calculateADX,
    calculateBollinger,
    calculateStochastic,
    calculateOBV,
    calculateMFI,
    calculateIchimoku,
    calculateSuperTrend
};

window.SignalBot = {
    calculateBotSignal,
    updateSignal,
    updateSignalUI
};
