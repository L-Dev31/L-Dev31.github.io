// Nemeris Signal Bot: Multi-factor regime-aware signal engine.
// Pipeline: indicators → factor scores → regime detection → regime-weighted composite
// → confluence multiplier → risk penalty → 0-100 signal + ATR/Kelly risk management.
import { getCurrency } from '../core/state.js';
import { termHtml } from '../core/utils.js';
import {
    clamp, safeArray, populationStdDev,
    sma as coreSMA, ema as coreEMA,
    linRegSlopePct, linRegSlopeAbsNorm,
    maxDrawdown as coreMaxDrawdown,
    trueRanges, wilderSmoothSeries, wilderSmoothLast, wilderSumSeries,
    vwap as coreVWAP, zScore as coreZScore
} from './quant-math.js';
import { L } from '../i18n/i18n.js';

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

// Signal & Indicator Cache to prevent redundant high-CPU tasks
const SIGNAL_CACHE = new Map();

// Cache key. length+first+last alone collides easily (e.g. same-length window that
// only differs in the middle). Sample several interior points + a checksum to make
// accidental collisions (stale cached signals) practically impossible.
const getPriceHash = (prices) => {
    if (!prices || !prices.length) return '';
    const n = prices.length;
    const step = Math.max(1, Math.floor(n / 16));
    let sum = 0;
    for (let i = 0; i < n; i += step) sum += prices[i];
    const mid = prices[Math.floor(n / 2)];
    return `${n}-${prices[0]}-${mid}-${prices[n - 1]}-${sum.toFixed(4)}`;
};

const HORIZON_MAP = {
    '1H': { label: L('Very short term'), desc: L('Scalping (1 hour)') },
    '4H': { label: L('Very short term'), desc: L('Scalping (4 hours)') },
    '1D': { label: L('Very short term'), desc: L('Intraday (24h)') },
    '1W': { label: L('Short term'), desc: L('Swing (1 week)') },
    '1M': { label: L('Medium term'), desc: L('Swing (1 month)') },
    '3M': { label: L('Medium term'), desc: L('Trend (3 months)') },
    '6M': { label: L('Medium/long term'), desc: L('Trend (6 months)') },
    '1Y': { label: L('Long term'), desc: L('Investing (1 year)') },
    '3Y': { label: L('Long term'), desc: L('Investing (3 years)') },
    '5Y': { label: L('Long term'), desc: L('Investing (5 years)') },
    'YTD': { label: L('Since January'), desc: L('Since January 1st') },
    'MAX': { label: L('Very long term'), desc: L('Full history') }
};

// Adaptive indicator config per candle granularity.
// volScale normalizes raw ATR%/price by candle horizon (intraday ATR is much smaller than yearly).
const PERIOD_INDICATOR_CONFIG = {
    '1H': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 },
    '4H': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 },
    '1D': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 },
    '1W': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 },
    '1M': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 },
    '3M': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.008, volScale: 1.2 },
    '6M': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.008, volScale: 1.5 },
    '1Y': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.01, volScale: 2 },
    'YTD': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.01, volScale: 2 },
    '3Y': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 104], momentumPeriod: 8, atrPeriod: 14, macdNormFactor: 0.02, volScale: 3 },
    '5Y': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 104], momentumPeriod: 8, atrPeriod: 14, macdNormFactor: 0.02, volScale: 4 },
    'MAX': { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [12, 36, 60], momentumPeriod: 6, atrPeriod: 14, macdNormFactor: 0.04, volScale: 6 }
};
const DEFAULT_INDICATOR_CONFIG = PERIOD_INDICATOR_CONFIG['1D'];

// When only closing prices are available (no real intraday high/low), the true range
// collapses to the absolute close-to-close move, which systematically UNDERSTATES the
// real daily range. For driftless geometric Brownian motion the expected daily range is
// twice the expected absolute close-to-close change: E[H−L]=σ√(8/π) vs E[|ΔC|]=σ√(2/π),
// ratio = √4 = 2.0 (Parkinson 1980, "The extreme value method for estimating the variance
// of the rate of return"). We scale the close-only ATR by this factor so stop distances and
// position sizing are not built on an under-estimated volatility. Slightly conservative (1.8)
// to account for discrete daily sampling vs the continuous-time bound.
const CLOSE_ONLY_RANGE_FACTOR = 1.8;

// True if the payload carries genuine intraday highs/lows (not just closes echoed into them).
function hasRealOHLC(data, prices) {
    const h = data?.highs, l = data?.lows;
    if (!Array.isArray(h) || !Array.isArray(l)) return false;
    if (h.length !== prices.length || l.length !== prices.length) return false;
    // At least one bar must have high>low (echoed closes give high===low===close everywhere).
    for (let i = 0; i < h.length; i++) {
        if (h[i] > l[i]) return true;
    }
    return false;
}

function validateData(data, opts = {}) {
    const prices = safeArray(data?.prices);
    const minBars = 50;
    return prices.length >= Math.max(minBars, opts.minLength || 30) && prices.every(x => x > 0);
}

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

// Thin delegations to the shared core (names kept for existing importers, e.g. chart.js).
const calculateEMA = (prices, period) => coreEMA(prices, period);
const calculateSMA = (prices, period) => coreSMA(prices, period);
// Bollinger window is fully observed → population stdev is the correct estimator here.
const calculateStdDev = (prices, period) => populationStdDev(safeArray(prices).slice(-period));

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
    const tr = trueRanges(highs, lows, closes);
    if (tr.length === 0) return 0;
    return wilderSmoothLast(tr, period);
}

function calculateMomentum(prices, period = 10) {
    const p = safeArray(prices);
    if (p.length < period + 1) return 0;
    const current = p[p.length - 1];
    const prev = p[p.length - period - 1];
    return prev === 0 ? 0 : ((current - prev) / prev) * 100;
}

// Linear regression slope of last `period` values, normalized to % per bar.
const calculateSlope = (prices, period) => linRegSlopePct(prices, period);

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

// Stochastic %K and %D: momentum oscillator, contextualizes RSI.
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

// ADX with directional indicators: trend strength qualifier (gates trend signals).
function calculateADX(highs, lows, closes, period = 14) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const n = Math.min(h.length, l.length, c.length);
    if (n < period * 2) return { adx: 0, plusDI: 0, minusDI: 0 };

    const tr = trueRanges(h, l, c);
    const plusDM = [], minusDM = [];
    for (let i = 1; i < n; i++) {
        const upMove = h[i] - h[i - 1];
        const downMove = l[i - 1] - l[i];
        plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
        minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
    }

    const trS = wilderSumSeries(tr, period);
    const plusS = wilderSumSeries(plusDM, period);
    const minusS = wilderSumSeries(minusDM, period);

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

// On-Balance Volume: volume confirms or denies price moves.
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

    // OBV oscillates around 0 → normalize the regression slope by mean |OBV|, not mean OBV.
    return { obv: series[series.length - 1], slope: linRegSlopeAbsNorm(series, 20) };
}

// Money Flow Index: volume-weighted RSI. Classic divergence indicator.
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

// Ichimoku Tenkan/Kijun: Japanese trend filter (cross = early signal).
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

// SuperTrend: ATR-channel trend follower. Direction flip = explicit regime change.
function calculateSuperTrend(highs, lows, closes, period = 10, mult = 3) {
    const h = safeArray(highs);
    const l = safeArray(lows);
    const c = safeArray(closes);
    const n = Math.min(h.length, l.length, c.length);
    if (n < period + 1) return { value: 0, direction: 0 };

    const tr = trueRanges(h, l, c);
    const atrSeries = wilderSmoothSeries(tr, period);
    if (atrSeries.length === 0) return { value: 0, direction: 0 };

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

// Bullish/bearish RSI divergence: a classic reversal anticipator.
// Bullish: price LL but RSI HL → exhaustion of selling.
// Bearish: price HH but RSI LH → exhaustion of buying.
function detectDivergence(prices, rsiSeries, lookback = 30) {
    const len = Math.min(prices.length, rsiSeries.length, lookback);
    const p = prices.slice(-len);
    const r = rsiSeries.slice(-len);
    if (p.length < 10) return { bullish: false, bearish: false };

    const lows = [], highs = [];
    for (let i = 2; i < p.length - 2; i++) {
        if (p[i] < p[i - 1] && p[i] < p[i - 2] && p[i] < p[i + 1] && p[i] < p[i + 2]) lows.push(i);
        if (p[i] > p[i - 1] && p[i] > p[i - 2] && p[i] > p[i + 1] && p[i] > p[i + 2]) highs.push(i);
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

    const o1 = o[n - 1], h1 = h[n - 1], l1 = l[n - 1], c1 = c[n - 1];
    const o0 = o[n - 2], c0 = c[n - 2];
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

const calculateMaxDrawdown = (prices) => coreMaxDrawdown(prices) * 100;

function calculateVolumeRatio(volumes, period = 20) {
    const v = safeArray(volumes);
    if (v.length < period + 1) return 1;
    const recent = v[v.length - 1] || 0;
    const avgArr = v.slice(-period - 1, -1);
    const avg = avgArr.reduce((a, b) => a + b, 0) / avgArr.length;
    return avg === 0 ? 1 : recent / avg;
}

function calculateBotSignal(data, options = {}) {
    options = { ...DEFAULT_OPTIONS, ...options };
    const symbol = data.symbol || 'unknown';
    const period = options.period || '1D';
    const prices = safeArray(data.prices);
    
    const hash = getPriceHash(prices);
    const cacheKey = `${symbol}-${period}-${hash}`;
    if (SIGNAL_CACHE.has(cacheKey)) return SIGNAL_CACHE.get(cacheKey);

    // Data-quality gate. Previously highs/lows fell back to the close series, which silently
    // turned every range-based indicator (ATR, candlesticks, ADX, Stochastic, Ichimoku,
    // SuperTrend, MFI) into a degenerate close-only version WITHOUT telling the user.
    // We now detect this and flag it so confidence is communicated and ATR is corrected.
    const ohlcAvailable = hasRealOHLC(data, prices);
    const opens = ohlcAvailable ? safeArray(data.opens || prices) : prices;
    const highs = ohlcAvailable ? safeArray(data.highs) : prices;
    const lows = ohlcAvailable ? safeArray(data.lows) : prices;
    const volumes = safeArray(data.volumes);
    const volumeAvailable = volumes.length === prices.length && volumes.some(v => v > 0);

    if (!validateData(data, options)) {
        return {
            signalValue: 50,
            signalTitle: 'Insufficient Data',
            signalDesc: 'Analysis not possible',
            explanation: L('Not enough history. Pick a longer period.'),
            details: {},
            isInsufficient: true
        };
    }

    const currentPrice = prices[prices.length - 1];

    const ic = PERIOD_INDICATOR_CONFIG[options.period] || DEFAULT_INDICATOR_CONFIG;

    const rsiSeries = calculateRSISeries(prices, ic.rsiPeriod);
    const rsi = rsiSeries.length ? rsiSeries[rsiSeries.length - 1] : 50;
    const macd = calculateMACD(prices, ic.macdFast, ic.macdSlow, ic.macdSignal);
    const sma20 = calculateSMA(prices, ic.sma[0]);
    const sma50 = calculateSMA(prices, ic.sma[1]);
    const sma200 = calculateSMA(prices, ic.sma[2]);
    // calculateSMA falls back to the mean of all available data when length < period, so a
    // "200-day SMA" on 60 bars is NOT a real SMA200. Track validity and gate the longer
    // averages out of the trend score when the history is too short to support them.
    const hasSMA50 = prices.length >= ic.sma[1];
    const hasSMA200 = prices.length >= ic.sma[2];
    const priceSlope = calculateSlope(prices, Math.min(20, ic.sma[0]));
    const adx = calculateADX(highs, lows, prices, 14);
    const bb = calculateBollinger(prices, 20, 2);
    const stoch = calculateStochastic(highs, lows, prices, 14, 3);
    const obv = calculateOBV(prices, volumes);
    const mfi = calculateMFI(highs, lows, prices, volumes, 14);
    const ichimoku = calculateIchimoku(highs, lows, 9, 26);
    const supertrend = calculateSuperTrend(highs, lows, prices, 10, 3);
    // ATR. With real OHLC this is the Wilder true-range average. With closes only it
    // degenerates to the average |Δclose|, which under-estimates the true range: we apply
    // the Parkinson-derived correction (see CLOSE_ONLY_RANGE_FACTOR) so risk sizing is not
    // built on understated volatility.
    let atr = calculateATR(highs, lows, prices, ic.atrPeriod);
    if (!ohlcAvailable) atr *= CLOSE_ONLY_RANGE_FACTOR;
    const momentum = calculateMomentum(prices, ic.momentumPeriod);
    const momentum5 = calculateMomentum(prices, 5);
    const momentum20 = calculateMomentum(prices, 20);
    const drawdown = calculateMaxDrawdown(prices);
    const volRatio = calculateVolumeRatio(volumes, 20);
    const divergence = detectDivergence(prices.slice(-rsiSeries.length), rsiSeries, 30);
    const patterns = detectCandlestickPatterns(opens, highs, lows, prices);

    let regimeType;
    if (adx.adx >= 25) regimeType = adx.plusDI > adx.minusDI ? 'uptrend' : 'downtrend';
    else if (adx.adx < 20) regimeType = 'ranging';
    else regimeType = 'transitional';

    const rawVolatilityPct = (atr / currentPrice) * 100;
    const volatilityPct = rawVolatilityPct / ic.volScale;
    const volRegime = volatilityPct > 5 ? 'high' : volatilityPct > 2 ? 'normal' : 'low';
    const bbSqueeze = bb.bandwidth > 0 && bb.bandwidth < 4;

    let trendScore = 0;
    if (currentPrice > sma20) trendScore += 0.5; else trendScore -= 0.5;
    if (hasSMA50) { if (currentPrice > sma50) trendScore += 0.3; else trendScore -= 0.3; }
    if (hasSMA200) { if (currentPrice > sma200) trendScore += 0.2; else trendScore -= 0.2; }
    if (hasSMA50) { if (sma20 > sma50) trendScore += 0.2; else trendScore -= 0.2; }
    if (hasSMA50 && hasSMA200) { if (sma50 > sma200) trendScore += 0.15; else trendScore -= 0.15; }
    if (priceSlope > 0) trendScore += clamp(priceSlope / 2, 0, 0.3);
    else trendScore += clamp(priceSlope / 2, -0.3, 0);
    if (ichimoku.signal > 0) trendScore += 0.15;
    else if (ichimoku.signal < 0) trendScore -= 0.15;
    if (supertrend.direction > 0) trendScore += 0.2;
    else if (supertrend.direction < 0) trendScore -= 0.2;
    // ADX gate: weak ADX → low conviction in trend signals (multiply down).
    const adxGate = clamp(adx.adx / 25, 0.4, 1);
    trendScore = clamp((trendScore / 2) * adxGate, -1, 1);

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
    const roc5 = clamp(momentum5 / 5, -0.3, 0.3);
    const roc10 = clamp(momentum / 10, -0.3, 0.3);
    const roc20 = clamp(momentum20 / 20, -0.3, 0.3);
    const rocBreadth = roc5 + roc10 + roc20; // [-0.9, +0.9]
    momentumScore += rocBreadth * 0.35;

    momentumScore = clamp(momentumScore / 3.5, -1, 1);

    let meanRevScore = 0;
    if (bb.percentB < 0) meanRevScore += 0.9;
    else if (bb.percentB < 0.2) meanRevScore += 0.6;
    else if (bb.percentB > 1) meanRevScore -= 0.9;
    else if (bb.percentB > 0.8) meanRevScore -= 0.6;
    else meanRevScore -= (bb.percentB - 0.5) * 0.8;

    const bbZScore = bb.sd === 0 ? 0 : (currentPrice - sma20) / bb.sd;
    if (bbZScore < -2) meanRevScore += 0.6;
    else if (bbZScore > 2) meanRevScore -= 0.6;
    else meanRevScore -= bbZScore * 0.2;

    meanRevScore = clamp(meanRevScore / 1.5, -1, 1);

    // VWAP: price above VWAP = institutions net buyers; below = net sellers.
    // Typical price = (H+L+C)/3; falls back to closes when no real OHLC.
    let vwapValue = null;
    if (volumeAvailable) {
        const typicalPrices = ohlcAvailable
            ? highs.map((h, i) => (h + lows[i] + prices[i]) / 3)
            : prices;
        vwapValue = coreVWAP(typicalPrices, volumes);
    }

    // Volume z-score: how many standard deviations above/below the 20-bar average is
    // today's volume? A z > 2 with direction confirmation signals a high-conviction move.
    let volZScore = 0;
    if (volumeAvailable && volumes.length >= 21) {
        const volWindow = volumes.slice(-21, -1); // last 20 bars (exclude today)
        volZScore = coreZScore(volumes[volumes.length - 1], volWindow);
    }

    let volumeScore = 0;
    if (obv.slope > 0.05) volumeScore += 0.4;
    else if (obv.slope < -0.05) volumeScore -= 0.4;

    if (mfi < 20) volumeScore += 0.5;
    else if (mfi > 80) volumeScore -= 0.5;
    else volumeScore -= ((mfi - 50) / 50) * 0.4;

    // VWAP factor: replaces the raw volume-ratio directional nudge with a more robust signal.
    if (vwapValue !== null && vwapValue > 0) {
        const vwapDev = (currentPrice - vwapValue) / vwapValue;
        // Price above VWAP = bullish; clamp to avoid swamping other signals.
        volumeScore += clamp(vwapDev * 10, -0.4, 0.4);
    } else if (prices.length >= 2 && volRatio > 1.5) {
        // Fallback when no volume data: keep original ratio-based directional nudge.
        const lastDir = currentPrice > prices[prices.length - 2] ? 1 : -1;
        volumeScore += 0.3 * lastDir;
    }

    // Volume z-score: abnormally high volume (z > 2) in the direction of the move
    // confirms conviction; extreme volume (z > 3) on a reversal day is a warning.
    if (Math.abs(volZScore) > 2 && prices.length >= 2) {
        const lastDir = currentPrice > prices[prices.length - 2] ? 1 : -1;
        const zBoost = clamp((Math.abs(volZScore) - 2) * 0.1, 0, 0.25);
        volumeScore += zBoost * lastDir;
    }

    volumeScore = clamp(volumeScore, -1, 1);

    let patternScore = 0;
    if (divergence.bullish) patternScore += 0.5;
    if (divergence.bearish) patternScore -= 0.5;
    for (const pat of patterns) patternScore += pat.bullish * pat.strength * 0.4;
    patternScore = clamp(patternScore, -1, 1);

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

    const factors = [trendScore, momentumScore, meanRevScore, volumeScore, patternScore];
    const compSign = totalScore >= 0 ? 1 : -1;
    const agreeing = factors.filter(f => Math.sign(f) === compSign && Math.abs(f) > 0.1).length;
    const confluenceRatio = agreeing / factors.length;
    const confluenceMult = 0.6 + confluenceRatio * 0.8; // [0.6, 1.4]
    totalScore *= confluenceMult;

    // --- Risk score (1-10) ---
    // NOTE: these volatility/price cut-offs are EMPIRICAL heuristics for ranking, not a
    // calibrated probability of loss. volatilityPct is the per-period ATR%/price normalized by
    // volScale (≈ √horizon scaling, since volatility grows with the square root of time). Treat
    // the 1-10 output as an ordinal risk flag, not a statistical risk measure.
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
    else { title = 'Hold'; desc = 'Neutral signal, indicators disagree'; }

    // --- Risk management (regime-adjusted) ---
    const slMult = regimeType === 'ranging' ? options.slMult * 0.8 : options.slMult;
    const tpMult = (regimeType === 'uptrend' || regimeType === 'downtrend') ? options.tpMult * 1.2 : options.tpMult;
    const slDist = atr * slMult;
    const tpDist = atr * tpMult;
    const dir = totalScore >= 0 ? 1 : -1;
    const direction = dir > 0 ? 'long' : 'short';
    // A stop can never sit at or below zero. Floor it at 1% of price when the ATR distance
    // would push it negative (previously stopLoss could go negative for very volatile names).
    let stopLoss = currentPrice - dir * slDist;
    if (stopLoss <= 0) stopLoss = currentPrice * 0.01;
    const takeProfit = Math.max(currentPrice * 0.01, currentPrice + dir * tpDist);

    // --- Position sizing: fixed-fractional risk model (NOT a fabricated Kelly) ---
    // The previous code fed an INVENTED win rate (0.5 + confluence*0.15 - …) into the Kelly
    // formula. Kelly is extremely sensitive to the win-rate/edge estimate: MacLean, Thorp &
    // Ziemba (2011, "The Kelly Capital Growth Investment Criterion") show a ~10% error in the
    // expected return can cause ~50% over-betting, so sizing off an unvalidated probability is
    // exactly what the literature warns against. We instead risk a fixed fraction of capital
    // per trade (standard risk-based sizing): quantity such that hitting the stop loses
    // `accountRisk` of capital, capped at maxPosition of capital. Kelly is applied ONLY when a
    // genuinely backtested win rate is supplied (options.empiricalWinRate over ≥30 trades), and
    // then as HALF-Kelly (MacLean/Ziemba: ~75% of the growth at ~50% of the volatility).
    const riskPerUnit = Math.max(slDist, currentPrice * 0.005);
    let accountRiskFrac = clamp(options.accountRisk, 0.005, 0.02); // cap risk-per-trade at 2%
    let sizingMethod = 'fixed-fractional';
    let kelly = null;
    if (typeof options.empiricalWinRate === 'number' && (options.empiricalTrades || 0) >= 30) {
        const p = clamp(options.empiricalWinRate, 0, 1);
        const b = tpDist / slDist;                       // payoff from the ACTUAL sl/tp distances
        const fullKelly = Math.max(0, p - (1 - p) / b);
        const halfKelly = fullKelly * 0.5;
        accountRiskFrac = clamp(halfKelly, 0, 0.02);
        sizingMethod = 'half-kelly';
        kelly = { winRate: p, payoff: b, fullKelly, halfKelly, trades: options.empiricalTrades };
    }
    // Long-only context (e.g. PEA): bearish setups produce no position.
    const maxShares = (options.maxPosition * options.accountCapital) / currentPrice;
    const riskBasedShares = (options.accountCapital * accountRiskFrac) / riskPerUnit;
    const positionSize = direction === 'long' ? Math.min(maxShares, riskBasedShares) : 0;

    // --- Risk label ---
    let riskLevel, riskDesc;
    if (riskScore >= 9) { riskLevel = 'Extreme'; riskDesc = 'Highly Volatile'; }
    else if (riskScore >= 7) { riskLevel = 'High'; riskDesc = 'Volatile'; }
    else if (riskScore >= 5) { riskLevel = 'Moderate'; riskDesc = 'Average Market'; }
    else if (riskScore >= 3) { riskLevel = 'Low'; riskDesc = 'Stable'; }
    else if (riskScore === 2) { riskLevel = 'Very Low'; riskDesc = 'Very Stable'; }
    else { riskLevel = 'None'; riskDesc = 'Near-Immobile'; }

    // --- Regime label ---
    const regimeLabels = {
        uptrend: { label: 'Uptrend', desc: `ADX ${adx.adx.toFixed(0)}, buyers in control` },
        downtrend: { label: 'Downtrend', desc: `ADX ${adx.adx.toFixed(0)}, sellers in control` },
        ranging: { label: 'Ranging Market', desc: `ADX ${adx.adx.toFixed(0)}, no direction` },
        transitional: { label: 'Transition', desc: `ADX ${adx.adx.toFixed(0)}, unclear` }
    };
    const regimeInfo = regimeLabels[regimeType];

    const allPatterns = [
        ...patterns,
        ...(divergence.bullish ? [{ name: 'Bullish RSI Divergence', bullish: 1, strength: 0.7 }] : []),
        ...(divergence.bearish ? [{ name: 'Bearish RSI Divergence', bullish: -1, strength: 0.7 }] : [])
    ];

    const result = {
        symbol: data.symbol,
        period: options.period,
        signalValue,
        signalTitle: title,
        signalDesc: desc,
        risk: { level: riskLevel, desc: riskDesc, score: riskScore, volatility: volatilityPct, drawdown },
        regime: { type: regimeType, strength: adx.adx, label: regimeInfo.label, desc: regimeInfo.desc, volRegime, squeeze: bbSqueeze },
        confluence: { ratio: confluenceRatio, agreeing, total: factors.length, multiplier: confluenceMult },
        // Data-quality disclosure: when only closing prices are available, range-based
        // indicators (ATR/candlesticks/ADX/Stochastic/Ichimoku/SuperTrend/MFI) are approximated
        // from closes and confidence should be read down accordingly.
        dataQuality: {
            ohlc: ohlcAvailable ? 'full' : 'closes-only',
            volume: volumeAvailable,
            degraded: !ohlcAvailable,
            note: ohlcAvailable ? null : 'No intraday high/low: range indicators are approximated from closes; ATR is volatility-corrected.'
        },
        trade: { direction, sizingMethod, kelly },
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
            obvSlope: obv.slope, mfi, volRatio, vwap: vwapValue, volZScore,
            ichimoku, supertrend,
            bbZScore,
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

    SIGNAL_CACHE.set(cacheKey, result);
    // Limit cache size
    if (SIGNAL_CACHE.size > 100) {
        const firstKey = SIGNAL_CACHE.keys().next().value;
        SIGNAL_CACHE.delete(firstKey);
    }

    return result;
}

const VERDICT = [
    { min: 80, word: L('Strong buy'), tone: 'is-pos' },
    { min: 60, word: L('Buy'), tone: 'is-pos' },
    { min: 55, word: L('Lean buy'), tone: 'is-pos' },
    { min: 46, word: L('Hold'), tone: 'is-neu' },
    { min: 41, word: L('Lean sell'), tone: 'is-neg' },
    { min: 21, word: L('Sell'), tone: 'is-neg' },
    { min: 0, word: L('Strong sell'), tone: 'is-neg' },
];
const RISK_WORDS = [L('Very low'), L('Low'), L('Medium'), L('High'), L('Very high')];

/** Red at 0, yellow at 50, green at 100, blended in between. */
const SIG_STOPS = [[255, 107, 142], [242, 201, 76], [79, 224, 163]];
export function signalColor(value) {
    const x = Math.max(0, Math.min(100, Number(value) || 0)) / 50;
    const i = Math.min(1, Math.floor(x)), t = x - i;
    const [a, b] = [SIG_STOPS[i], SIG_STOPS[i + 1]];
    return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * t)).join(', ')})`;
}
const REGIME_FR = { uptrend: L('Rising'), downtrend: L('Falling'), ranging: L('Sideways'), transitional: L('Changing') };

function plainReasons(result) {
    const e = result.explanation;
    const out = [];
    const r = result.regime.type;
    out.push(r === 'uptrend' ? { tone: 'pos', key: L('Trend'), text: L('Rising. Buyers are in control.') }
        : r === 'downtrend' ? { tone: 'neg', key: L('Trend'), text: L('Falling. Sellers are in control.') }
        : r === 'ranging' ? { tone: 'neu', key: L('Trend'), text: L('Moving sideways, no clear direction.') }
        : { tone: 'neu', key: L('Trend'), text: L('Changing direction, not settled yet.') });
    const rsi = e.rsi;
    out.push(rsi < 30 ? { tone: 'pos', key: 'Momentum', text: L('Fell a lot recently. A rebound often follows.') }
        : rsi > 70 ? { tone: 'neg', key: 'Momentum', text: L('Rose a lot recently. A pullback often follows.') }
        : e.macdHistogram > 0 ? { tone: 'pos', key: 'Momentum', text: L('Picking up speed upward.') }
        : { tone: 'neg', key: 'Momentum', text: L('Losing speed.') });
    out.push(e.obvSlope > 0.05 ? { tone: 'pos', key: L('Money flow'), text: L('More money is coming in than going out.') }
        : e.obvSlope < -0.05 ? { tone: 'neg', key: L('Money flow'), text: L('More money is leaving than coming in.') }
        : { tone: 'neu', key: L('Money flow'), text: L('Buyers and sellers are balanced.') });
    return out;
}

function summarySentence(result, reasons) {
    const pos = reasons.filter(x => x.tone === 'pos').length, neg = reasons.filter(x => x.tone === 'neg').length;
    if (result.signalValue >= 55) return pos >= 2 ? L('Most signals point up.') : L('Signals lean up, but not all agree.');
    if (result.signalValue <= 45) return neg >= 2 ? L('Most signals point down.') : L('Signals lean down, but not all agree.');
    return L('Signals disagree.');
}

function updateSignalUI(symbol, result) {
    const explanationContent = document.getElementById(`card-${symbol}`)?.querySelector('.explanation-content');
    if (!explanationContent) return;
    const title = `<div class="panel-head"><h2 class="panel-title">${L('What the {0} say', termHtml('signal', L('signals')))}</h2>`;

    if (result.isInsufficient) {
        explanationContent.innerHTML = `${title}</div><p class="empty">${result.explanation}</p>`;
        return;
    }

    const e = result.explanation;
    const price = e.currentPrice;
    const v = VERDICT.find(x => result.signalValue >= x.min) || VERDICT[VERDICT.length - 1];
    const reasons = plainReasons(result);
    const riskIdx = Math.max(0, Math.min(4, Math.ceil(result.risk.score / 2) - 1));
    const horizon = HORIZON_MAP[result.period] || { label: L('Medium term'), desc: L('Swing (weeks)') };
    const cur = getCurrency();

    // one diverging bar per indicator: rose left of the middle, mint right of it
    const bar = (value) => {
        const x = Math.max(0, Math.min(100, value));
        const left = Math.min(x, 50), width = Math.abs(x - 50);
        return `<span class="vd-bar"><span class="vd-bar-fill ${x >= 50 ? 'is-pos' : 'is-neg'}" style="left:${left}%;width:${width}%"></span></span>`;
    };
    const rsiGauge = e.rsi < 30 ? 75 : e.rsi < 40 ? 62 : e.rsi > 70 ? 25 : e.rsi > 60 ? 38 : 50;
    const macdGauge = e.macdHistogram > 0 && e.macdLine > 0 ? 80 : e.macdHistogram > 0 ? 65 : e.macdHistogram < 0 && e.macdLine < 0 ? 20 : 35;
    const stochGauge = e.stochK < 20 && e.stochK > e.stochD ? 78 : e.stochK < 20 ? 68 : e.stochK > 80 && e.stochK < e.stochD ? 22 : e.stochK > 80 ? 32 : 50;
    const trendGauge = price > e.sma200 ? (price > e.sma50 ? 82 : 58) : (price < e.sma50 ? 18 : 42);
    const bbGauge = e.bbPercentB < 0 ? 80 : e.bbPercentB < 0.2 ? 68 : e.bbPercentB > 1 ? 15 : e.bbPercentB > 0.8 ? 30 : 50;
    const volGauge = e.obvSlope > 0.05 ? 72 : e.obvSlope < -0.05 ? 28 : 50;
    const momGauge = Math.max(0, Math.min(100, 50 + e.momentum * 2));
    const regimeGauge = result.regime.type === 'uptrend' ? 78 : result.regime.type === 'downtrend' ? 22 : 50;
    const ddGauge = Math.max(0, Math.min(100, 50 - e.drawdown));
    const riskGauge = Math.max(0, Math.min(100, 100 - result.risk.score * 10));
    const tone = x => x > 52 ? 'positive' : x < 48 ? 'negative' : '';

    const rows = [
        [L('Trend'), REGIME_FR[result.regime.type] || result.regime.label, regimeGauge, `ADX ${Math.round(result.regime.strength || 0)}`],
        [L('Signals agreeing'), L('{0} of 5', result.confluence.agreeing), Math.round(50 + (result.confluence.agreeing / 5 - 0.5) * 60 * (result.signalValue >= 50 ? 1 : -1)), L('How many indicator families point the same way')],
        ...(result.regime.squeeze ? [['Squeeze', L('Prices compressed'), 50, L('A bigger move is likely soon, direction unknown')]] : []),
        [`RSI (${e.indicatorConfig?.rsiPeriod || 14})`, e.rsi.toFixed(0), rsiGauge, L('Below 30 = fell a lot, above 70 = rose a lot')],
        ['MACD', e.macdHistogram >= 0 ? L('Rising') : L('Falling'), macdGauge, L('Speed of the trend')],
        ['Stochastic', `${e.stochK.toFixed(0)}`, stochGauge, L('Where the price sits in its recent range')],
        [L('Long-term average ({0})', e.smaConfig?.[2] || 200), price > e.sma200 ? L('Above') : L('Below'), trendGauge, `${e.sma200.toFixed(2)} ${cur}`],
        [L('Bollinger bands'), `${(e.bbPercentB * 100).toFixed(0)}%`, bbGauge, L('Near 0% = low end of its usual range, 100% = high end')],
        [L('Money flow'), `MFI ${e.mfi.toFixed(0)}`, volGauge, L('Volume behind the moves')],
        ['Momentum', `${e.momentum >= 0 ? '+' : ''}${e.momentum.toFixed(1)}%`, momGauge, L('Change over the last {0} points', e.indicatorConfig?.momentumPeriod || 10)],
        ...(result.patterns?.length ? [[L('Chart patterns'), result.patterns.map(p => p.name).join(', '), result.patterns[0].bullish > 0 ? 75 : result.patterns[0].bullish < 0 ? 25 : 50, L('Seen on the latest candles')]] : []),
        [L('Worst drop'), `-${e.drawdown.toFixed(1)}%`, ddGauge, L('Largest fall from a peak in this period')],
        [L('Risk'), `${result.risk.score}/10`, riskGauge, RISK_WORDS[riskIdx]],
    ];
    const levels = [
        ['Horizon', horizon.label, horizon.desc],
        [termHtml('stoploss', 'Stop loss'), `${e.stopLoss.toFixed(2)} ${cur}`, L('Price where a trader would cut the loss')],
        [termHtml('takeprofit', 'Take profit'), `${e.takeProfit.toFixed(2)} ${cur}`, L('Price where a trader would take the gain')],
        [L('Suggested size'), `${e.positionSize.toFixed(2)} ${cur}`, result.trade?.sizingMethod === 'half-kelly' ? L('Half-Kelly, from a tested edge') : L('Risks about 1% of a 10 000 € account')],
    ];
    const sc = signalColor(result.signalValue);

    explanationContent.innerHTML = `
        ${title}</div>
        <div class="vd-head">
            <h2 class="vd-signal" style="color:${sc}" title="${L('Signal {0} out of 100', result.signalValue)}">${v.word}</h2>
            <p class="vd-summary">${summarySentence(result, reasons)}</p>
        </div>
        <div class="vd-scale" role="img" aria-label="${L('Signal {0} out of 100', result.signalValue)}">
            <div class="vd-scale-track"><span class="vd-scale-marker" style="left:${result.signalValue}%;background:${sc}" title="${v.word}"></span></div>
            <div class="vd-scale-labels"><span>${L('Sell')}</span><span>${L('Hold')}</span><span>${L('Buy')}</span></div>
        </div>
        <table class="vd-table vd-summary-table">
            <tbody>
                <tr><th scope="row">${termHtml('volatility', L('Price swings'))}</th>
                    <td>${RISK_WORDS[riskIdx]} <span class="vd-risk-dots" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<i class="${i <= riskIdx ? 'on' : ''}"></i>`).join('')}</span></td></tr>
            </tbody>
        </table>
        <ul class="vd-reasons">
            ${reasons.map(r => `<li class="is-${r.tone}"><span class="vd-dot" aria-hidden="true"></span><span><b>${r.key}</b> ${r.text}</span></li>`).join('')}
        </ul>
        <details class="more">
            <summary>${L('All indicators')}</summary>
            <div class="table-scroll"><table class="vd-table">
                <tbody>
                    ${rows.map(([k, val, g, hint]) => `<tr><th scope="row">${k}</th><td class="${tone(g)}">${val}</td><td>${bar(g)}</td><td class="vd-hint">${hint}</td></tr>`).join('')}
                    ${levels.map(([k, val, hint]) => `<tr><th scope="row">${k}</th><td>${val}</td><td></td><td class="vd-hint">${hint}</td></tr>`).join('')}
                </tbody>
            </table></div>
        </details>
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
