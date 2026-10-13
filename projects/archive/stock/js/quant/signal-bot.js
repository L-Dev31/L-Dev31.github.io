// Nemeris Signal Bot: multi-factor, regime-aware signal engine.
// Pipeline: indicators → factor scores (trend, momentum, mean reversion, volume, patterns) → regime-weighted
// composite → confluence multiplier → risk penalty → 0-100 signal, plus ATR stops and position size.
import { positions, currencySymbol } from '../core/state.js';
import { priceCurrency } from '../data/holdings.js';
import { convert } from '../data/rates.js';
import { termHtml } from '../core/utils.js';
import { L, LOCALE } from '../i18n/i18n.js';
import { QuantEngine, mean, sampleStdDev } from './quant-engine.js';

const DEFAULT_OPTIONS = { accountCapital: 10000, accountRisk: 0.02, maxPosition: 0.2, slMult: 1.5, tpMult: 2.5 };

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const arr = a => Array.isArray(a) ? a : [];
const sum = a => a.reduce((s, x) => s + x, 0);

const SIGNAL_CACHE = new Map();

// Cache key. Length + first + last collides too easily (same-length windows differing only in the
// middle), so it also samples the middle and a checksum of ~16 interior points.
function priceHash(p) {
    const n = p.length, step = Math.max(1, Math.floor(n / 16));
    let total = 0;
    for (let i = 0; i < n; i += step) total += p[i];
    return `${n}-${p[0]}-${p[Math.floor(n / 2)]}-${p[n - 1]}-${total.toFixed(4)}`;
}

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

// Indicator settings per period. volScale normalizes ATR%/price by candle horizon (intraday ATR is
// much smaller than yearly), macdNormFactor does the same for the MACD histogram.
const BASE_CONFIG = { rsiPeriod: 14, macdFast: 12, macdSlow: 26, macdSignal: 9, sma: [20, 50, 200], momentumPeriod: 10, atrPeriod: 14, macdNormFactor: 0.005, volScale: 1 };
const config = (macdNormFactor, volScale, extra) => ({ ...BASE_CONFIG, macdNormFactor, volScale, ...extra });
const LONG_RANGE = { sma: [20, 50, 104], momentumPeriod: 8 };
const PERIOD_INDICATOR_CONFIG = {
    '1H': BASE_CONFIG, '4H': BASE_CONFIG, '1D': BASE_CONFIG, '1W': BASE_CONFIG, '1M': BASE_CONFIG,
    '3M': config(0.008, 1.2), '6M': config(0.008, 1.5), '1Y': config(0.01, 2), 'YTD': config(0.01, 2),
    '3Y': config(0.02, 3, LONG_RANGE), '5Y': config(0.02, 4, LONG_RANGE),
    'MAX': config(0.04, 6, { sma: [12, 36, 60], momentumPeriod: 6 })
};

// With closes only, the true range collapses to |close-to-close|, which understates the real
// daily range. For driftless Brownian motion the expected range is twice that (Parkinson, 1980);
// 1.8 is slightly conservative for discrete daily sampling. Applied to ATR so stops and sizing
// are not built on understated volatility.
const CLOSE_ONLY_RANGE_FACTOR = 1.8;

// Genuine intraday highs/lows, not closes echoed into them (echoed bars have high === low everywhere).
// All the OHLC arrays below then share the closes' length.
const hasRealOHLC = (data, prices) =>
    ['highs', 'lows'].every(k => Array.isArray(data[k]) && data[k].length === prices.length) && data.highs.some((h, i) => h > data.lows[i]);

// ============ INDICATORS ============

// Full RSI series (length = prices.length - period): the current value and divergence detection both use it.
export function calculateRSISeries(prices, period = 14) {
    const p = arr(prices);
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
        series.push(100 - (100 / (1 + (loss === 0 ? 100 : gain / loss))));
    }
    return series;
}

// EMA seeded with the SMA of the first `period` values; a plain mean when the series is shorter.
function ema(p, period) {
    if (p.length < period) return mean(p);
    const k = 2 / (period + 1);
    let e = mean(p.slice(0, period));
    for (let i = period; i < p.length; i++) e = p[i] * k + e * (1 - k);
    return e;
}

export function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
    const p = arr(prices);
    if (p.length < slow) return { line: 0, signal: 0, hist: 0, series: [] };
    const kFast = 2 / (fast + 1), kSlow = 2 / (slow + 1);
    let emaFast = mean(p.slice(0, fast)), emaSlow = mean(p.slice(0, slow));
    const series = [];
    for (let i = 1; i < p.length; i++) {
        emaFast = i >= fast ? p[i] * kFast + emaFast * (1 - kFast) : (emaFast * i + p[i]) / (i + 1);
        emaSlow = i >= slow ? p[i] * kSlow + emaSlow * (1 - kSlow) : (emaSlow * i + p[i]) / (i + 1);
        if (i >= slow - 1) series.push(emaFast - emaSlow);
    }
    const line = series[series.length - 1] || 0;
    const signalLine = ema(series, signal);
    return { line, signal: signalLine, hist: line - signalLine, series };
}

// Wilder primitives: seed from the first `period` values, then roll forward.
function rolling(a, period, seed, next) {
    if (a.length < period) return [];
    let v = seed(a.slice(0, period));
    const out = [v];
    for (let i = period; i < a.length; i++) out.push(v = next(v, a[i]));
    return out;
}
const wilderSmooth = (a, period) => rolling(a, period, s => sum(s) / period, (v, x) => (v * (period - 1) + x) / period);
const wilderSum = (a, period) => rolling(a, period, sum, (v, x) => v - (v / period) + x);

const trueRanges = (h, l, c) => c.slice(1).map((x, i) => Math.max(h[i + 1] - l[i + 1], Math.abs(h[i + 1] - c[i]), Math.abs(l[i + 1] - c[i])));

function averageTrueRange(h, l, c, period) {
    const tr = trueRanges(h, l, c);
    return tr.length < period ? mean(tr) : wilderSmooth(tr, period).pop();
}

const momentumPct = (p, period) => {
    const prev = p[p.length - period - 1];
    return p.length < period + 1 || prev === 0 ? 0 : ((p[p.length - 1] - prev) / prev) * 100;
};

// OLS slope of the values against bar index, divided by their mean (as % per bar) or, for series that
// oscillate around 0 such as OBV, by their mean ABSOLUTE level.
function regressionSlope(v, byAbs = false) {
    const n = v.length;
    if (n < 2) return 0;
    let sx = 0, sy = 0, sxy = 0, sx2 = 0, sAbs = 0;
    for (let i = 0; i < n; i++) {
        sx += i;
        sy += v[i];
        sxy += i * v[i];
        sx2 += i * i;
        sAbs += Math.abs(v[i]);
    }
    const denom = n * sx2 - sx * sx;
    if (denom === 0) return 0;
    const slope = (n * sxy - sx * sy) / denom;
    const scale = (byAbs ? sAbs : sy) / n;
    if (scale === 0) return 0;
    return byAbs ? slope / scale : (slope / scale) * 100;
}

function bollinger(p, period = 20, mult = 2) {
    if (p.length < period) return { upper: 0, middle: 0, lower: 0, percentB: 0.5, bandwidth: 0, sd: 0 };
    const w = p.slice(-period), middle = mean(w);
    // The window is fully observed, so the population stdev is the right estimator here.
    const sd = Math.sqrt(sum(w.map(x => (x - middle) * (x - middle))) / w.length);
    const upper = middle + mult * sd, lower = middle - mult * sd, range = upper - lower;
    return { upper, middle, lower, percentB: range === 0 ? 0.5 : (p[p.length - 1] - lower) / range, bandwidth: middle === 0 ? 0 : (range / middle) * 100, sd };
}

// Highest high and lowest low over bars [from, to).
function extremes(h, l, from, to) {
    let hi = -Infinity, lo = Infinity;
    for (let i = from; i < to; i++) {
        if (h[i] > hi) hi = h[i];
        if (l[i] < lo) lo = l[i];
    }
    return [hi, lo];
}

function stochastic(h, l, c, kPeriod = 14, dPeriod = 3) {
    if (c.length < kPeriod) return { k: 50, d: 50 };
    const ks = [];
    for (let i = kPeriod - 1; i < c.length; i++) {
        const [hh, ll] = extremes(h, l, i - kPeriod + 1, i + 1);
        ks.push(hh - ll === 0 ? 50 : ((c[i] - ll) / (hh - ll)) * 100);
    }
    return { k: ks[ks.length - 1], d: mean(ks.slice(-dPeriod)) };
}

// ADX with directional indicators: the trend-strength gate.
function adxIndicator(h, l, c, period = 14) {
    const n = c.length;
    if (n < period * 2) return { adx: 0, plusDI: 0, minusDI: 0 };
    const plusDM = [], minusDM = [];
    for (let i = 1; i < n; i++) {
        const up = h[i] - h[i - 1], down = l[i - 1] - l[i];
        plusDM.push(up > down && up > 0 ? up : 0);
        minusDM.push(down > up && down > 0 ? down : 0);
    }
    const trS = wilderSum(trueRanges(h, l, c), period), plusS = wilderSum(plusDM, period), minusS = wilderSum(minusDM, period);
    const plusDI = trS.map((t, i) => t === 0 ? 0 : (plusS[i] / t) * 100);
    const minusDI = trS.map((t, i) => t === 0 ? 0 : (minusS[i] / t) * 100);
    const dx = plusDI.map((p, i) => p + minusDI[i] === 0 ? 0 : (Math.abs(p - minusDI[i]) / (p + minusDI[i])) * 100);
    return { adx: wilderSmooth(dx, period).pop(), plusDI: plusDI[plusDI.length - 1], minusDI: minusDI[minusDI.length - 1] };
}

// On-Balance Volume slope: volume confirming or denying the price moves.
function obvSlope(c, v) {
    const n = Math.min(c.length, v.length);
    if (n < 2) return 0;
    const series = [0];
    for (let i = 1; i < n; i++) {
        const last = series[i - 1];
        series.push(c[i] > c[i - 1] ? last + (v[i] || 0) : c[i] < c[i - 1] ? last - (v[i] || 0) : last);
    }
    return regressionSlope(series.slice(-20), true);
}

// Money Flow Index: a volume-weighted RSI.
function mfiIndicator(h, l, c, v, period = 14) {
    const n = Math.min(c.length, v.length);
    if (n < period + 1) return 50;
    const typical = i => (h[i] + l[i] + c[i]) / 3;
    let pos = 0, neg = 0, prev = typical(n - period - 1);
    for (let i = n - period; i < n; i++) {
        const tp = typical(i), flow = tp * (v[i] || 0);
        if (tp > prev) pos += flow;
        else if (tp < prev) neg += flow;
        prev = tp;
    }
    if (neg === 0) return 100;
    return pos === 0 ? 0 : 100 - (100 / (1 + pos / neg));
}

// Ichimoku Tenkan/Kijun cross as a trend filter.
function ichimoku(h, l, tenkanP = 9, kijunP = 26) {
    const n = h.length;
    if (n < kijunP) return { tenkan: 0, kijun: 0, signal: 0 };
    const middle = p => { const [hi, lo] = extremes(h, l, n - p, n); return (hi + lo) / 2; };
    const tenkan = middle(tenkanP), kijun = middle(kijunP);
    return { tenkan, kijun, signal: tenkan > kijun ? 1 : tenkan < kijun ? -1 : 0 };
}

// SuperTrend: an ATR channel trend follower, a direction flip marks a regime change.
function superTrend(h, l, c, period = 10, mult = 3) {
    if (c.length < period + 1) return { value: 0, direction: 0 };
    let direction = 1, prevUpper = 0, prevLower = 0, value = 0;
    wilderSmooth(trueRanges(h, l, c), period).forEach((a, i) => {
        const k = period + i, mid = (h[k] + l[k]) / 2;
        const upper = mid + mult * a, lower = mid - mult * a;
        const finalUpper = (upper < prevUpper || c[k - 1] > prevUpper) ? upper : prevUpper;
        const finalLower = (lower > prevLower || c[k - 1] < prevLower) ? lower : prevLower;
        if (i === 0) {
            value = finalUpper;
            direction = c[k] > finalUpper ? 1 : -1;
        } else {
            direction = value === prevUpper ? (c[k] > finalUpper ? 1 : -1) : (c[k] < finalLower ? -1 : 1);
            value = direction > 0 ? finalLower : finalUpper;
        }
        prevUpper = finalUpper;
        prevLower = finalLower;
    });
    return { value, direction };
}

// RSI divergence, a classic reversal hint. Bullish: price makes a lower low but RSI a higher low
// (selling is exhausted). Bearish: higher high in price, lower high in RSI.
function rsiDivergence(prices, rsi, lookback = 30) {
    const len = Math.min(prices.length, rsi.length, lookback);
    const p = prices.slice(-len), r = rsi.slice(-len);
    if (p.length < 10) return { bullish: false, bearish: false };
    const pivots = beats => {
        const out = [];
        for (let i = 2; i < p.length - 2; i++) if ([-2, -1, 1, 2].every(d => beats(p[i], p[i + d]))) out.push(i);
        return out;
    };
    const lows = pivots((a, b) => a < b), highs = pivots((a, b) => a > b);
    const [l1, l2] = lows.slice(-2), [h1, h2] = highs.slice(-2);
    return {
        bullish: lows.length >= 2 && p[l2] < p[l1] && r[l2] > r[l1],
        bearish: highs.length >= 2 && p[h2] > p[h1] && r[h2] < r[h1]
    };
}

// Candlestick patterns on the latest 1-2 bars.
function candlePatterns(o, h, l, c) {
    const n = Math.min(o.length, h.length, l.length, c.length);
    if (n < 2) return [];
    const o1 = o[n - 1], h1 = h[n - 1], l1 = l[n - 1], c1 = c[n - 1], o0 = o[n - 2], c0 = c[n - 2];
    const body = Math.abs(c1 - o1), range = h1 - l1;
    if (range === 0) return [];
    const upperShadow = h1 - Math.max(o1, c1), lowerShadow = Math.min(o1, c1) - l1;
    const patterns = [];
    const add = (name, bullish, strength) => patterns.push({ name, bullish, strength });
    if (body / range < 0.1) add('Doji', 0, 0.5);
    if (lowerShadow > 2 * body && upperShadow < body && body / range < 0.4) add('Hammer', 1, 0.8);
    if (upperShadow > 2 * body && lowerShadow < body && body / range < 0.4) add('Shooting Star', -1, 0.8);
    if (c0 < o0 && c1 > o1 && c1 > o0 && o1 < c0) add('Bullish Engulfing', 1, 0.9);
    if (c0 > o0 && c1 < o1 && c1 < o0 && o1 > c0) add('Bearish Engulfing', -1, 0.9);
    return patterns;
}

// Latest volume against the average of the 20 bars before it.
function volumeRatio(v, period = 20) {
    if (v.length < period + 1) return 1;
    const avg = mean(v.slice(-period - 1, -1));
    return avg === 0 ? 1 : (v[v.length - 1] || 0) / avg;
}

// Volume-weighted average price over equal-length price and volume arrays.
function vwap(prices, volumes) {
    let pv = 0, vol = 0;
    prices.forEach((p, i) => { pv += p * volumes[i]; vol += volumes[i]; });
    return vol === 0 ? 0 : pv / vol;
}

// ============ SIGNAL ============

// Weights of the five factor scores per regime; the trend regime splits at ADX 40.
const REGIME_WEIGHTS = {
    strongTrend: { trend: 0.60, momentum: 0.22, meanRev: 0.03, volume: 0.10, pattern: 0.05 },
    trend: { trend: 0.42, momentum: 0.25, meanRev: 0.10, volume: 0.13, pattern: 0.10 },
    ranging: { trend: 0.08, momentum: 0.18, meanRev: 0.42, volume: 0.17, pattern: 0.15 },
    transitional: { trend: 0.22, momentum: 0.25, meanRev: 0.25, volume: 0.18, pattern: 0.10 }
};
const REGIME_LABELS = { uptrend: 'Uptrend', downtrend: 'Downtrend', ranging: 'Ranging Market', transitional: 'Transition' };
// [volatility % above which, price below which, risk score]. Empirical cut-offs that rank risk, not
// calibrated probabilities of loss: read the 1-10 result as an ordinal flag.
const RISK_STEPS = [[20, 0.001, 10], [15, 0.01, 9], [10, 0.1, 8], [7, 0, 7], [5, 0, 6], [3.5, 0, 5], [2, 0, 4], [1, 0, 3], [0.5, 0, 2]];

export function calculateBotSignal(data, options = {}) {
    options = { ...DEFAULT_OPTIONS, ...options };
    const prices = arr(data.prices);
    const cacheKey = `${data.symbol || 'unknown'}-${options.period || '1D'}-${priceHash(prices)}`;
    if (SIGNAL_CACHE.has(cacheKey)) return SIGNAL_CACHE.get(cacheKey);

    if (prices.length < 50 || !prices.every(x => x > 0)) {
        return { signalValue: 50, signalTitle: 'Insufficient Data', explanation: L('Not enough history. Pick a longer period.'), isInsufficient: true };
    }

    // Range indicators need real highs/lows. Without them they would silently turn into close-only
    // versions, so this is flagged in dataQuality and the ATR is corrected below.
    const ohlcAvailable = hasRealOHLC(data, prices);
    const opens = ohlcAvailable ? arr(data.opens || prices) : prices;
    const highs = ohlcAvailable ? data.highs : prices;
    const lows = ohlcAvailable ? data.lows : prices;
    const volumes = arr(data.volumes);
    const volumeAvailable = volumes.length === prices.length && volumes.some(v => v > 0);

    const currentPrice = prices[prices.length - 1];
    const lastDir = currentPrice > prices[prices.length - 2] ? 1 : -1;
    const ic = PERIOD_INDICATOR_CONFIG[options.period] || BASE_CONFIG;

    const rsiSeries = calculateRSISeries(prices, ic.rsiPeriod);
    const rsi = rsiSeries.length ? rsiSeries[rsiSeries.length - 1] : 50;
    const macd = calculateMACD(prices, ic.macdFast, ic.macdSlow, ic.macdSignal);
    const [sma20, sma50, sma200] = ic.sma.map(n => mean(prices.slice(-n)));
    // An SMA over fewer bars than its period is just the mean of what exists, so the longer
    // averages only count in the trend score when the history can support them.
    const hasSMA50 = prices.length >= ic.sma[1];
    const hasSMA200 = prices.length >= ic.sma[2];
    const priceSlope = regressionSlope(prices.slice(-Math.min(20, ic.sma[0])));
    const adx = adxIndicator(highs, lows, prices);
    const bb = bollinger(prices);
    const stoch = stochastic(highs, lows, prices);
    const obv = obvSlope(prices, volumes);
    const mfi = mfiIndicator(highs, lows, prices, volumes);
    const ichi = ichimoku(highs, lows);
    const supertrend = superTrend(highs, lows, prices);
    let atr = averageTrueRange(highs, lows, prices, ic.atrPeriod);
    if (!ohlcAvailable) atr *= CLOSE_ONLY_RANGE_FACTOR;
    const momentum = momentumPct(prices, ic.momentumPeriod);
    const momentum5 = momentumPct(prices, 5);
    const momentum20 = momentumPct(prices, 20);
    const drawdown = -QuantEngine.calculateMaxDrawdown(prices);
    const volRatio = volumeRatio(volumes);
    const divergence = rsiDivergence(prices.slice(-rsiSeries.length), rsiSeries);
    const patterns = candlePatterns(opens, highs, lows, prices);

    const regimeType = adx.adx >= 25 ? (adx.plusDI > adx.minusDI ? 'uptrend' : 'downtrend') : adx.adx < 20 ? 'ranging' : 'transitional';
    const trending = regimeType === 'uptrend' || regimeType === 'downtrend';
    const rawVolatilityPct = (atr / currentPrice) * 100;
    const volatilityPct = rawVolatilityPct / ic.volScale;
    const bbSqueeze = bb.bandwidth > 0 && bb.bandwidth < 4;

    // --- Factor scores, each in [-1, 1] ---
    const vote = (condition, weight) => condition ? weight : -weight;
    let trendScore = vote(currentPrice > sma20, 0.5);
    if (hasSMA50) trendScore += vote(currentPrice > sma50, 0.3);
    if (hasSMA200) trendScore += vote(currentPrice > sma200, 0.2);
    if (hasSMA50) trendScore += vote(sma20 > sma50, 0.2);
    if (hasSMA50 && hasSMA200) trendScore += vote(sma50 > sma200, 0.15);
    trendScore += clamp(priceSlope / 2, -0.3, 0.3);
    trendScore += 0.15 * ichi.signal;
    trendScore += 0.2 * supertrend.direction;
    // A weak ADX means low conviction in trend signals.
    trendScore = clamp((trendScore / 2) * clamp(adx.adx / 25, 0.4, 1), -1, 1);

    // RSI extremes weigh most; MACD adds histogram size, zero line and signal cross; the stochastic
    // only confirms in its extreme zones; 5/10/20-bar rate of change agreeing means strong momentum.
    let momentumScore = rsi < 30 ? 0.8 : rsi < 40 ? 0.4 : rsi > 70 ? -0.8 : rsi > 60 ? -0.4 : -((rsi - 50) / 25);
    momentumScore += clamp(macd.hist / (currentPrice * ic.macdNormFactor), -1, 1) * 0.7;
    momentumScore += vote(macd.line > 0, 0.15);
    momentumScore += vote(macd.line > macd.signal, 0.15);
    momentumScore += stoch.k < 20 && stoch.k > stoch.d ? 0.5 : stoch.k > 80 && stoch.k < stoch.d ? -0.5 : -((stoch.k - 50) / 100);
    const roc = (m, bars) => clamp(m / bars, -0.3, 0.3);
    momentumScore += (roc(momentum5, 5) + roc(momentum, 10) + roc(momentum20, 20)) * 0.35;
    momentumScore = clamp(momentumScore / 3.5, -1, 1);

    let meanRevScore = bb.percentB < 0 ? 0.9 : bb.percentB < 0.2 ? 0.6 : bb.percentB > 1 ? -0.9 : bb.percentB > 0.8 ? -0.6 : -((bb.percentB - 0.5) * 0.8);
    const bbZScore = bb.sd === 0 ? 0 : (currentPrice - sma20) / bb.sd;
    meanRevScore += bbZScore < -2 ? 0.6 : bbZScore > 2 ? -0.6 : -(bbZScore * 0.2);
    meanRevScore = clamp(meanRevScore / 1.5, -1, 1);

    // Price above VWAP means net buyers. Typical price is (H+L+C)/3, or the close without real OHLC.
    const vwapValue = volumeAvailable ? vwap(ohlcAvailable ? highs.map((h, i) => (h + lows[i] + prices[i]) / 3) : prices, volumes) : null;
    // Volume z-score against the 20 bars before today.
    let volZScore = 0;
    if (volumeAvailable && volumes.length >= 21) {
        const prior = volumes.slice(-21, -1), m = mean(prior), sd = sampleStdDev(prior, m);
        volZScore = sd === 0 ? 0 : (volumes[volumes.length - 1] - m) / sd;
    }
    let volumeScore = obv > 0.05 ? 0.4 : obv < -0.05 ? -0.4 : 0;
    volumeScore += mfi < 20 ? 0.5 : mfi > 80 ? -0.5 : -(((mfi - 50) / 50) * 0.4);
    if (vwapValue > 0) volumeScore += clamp(((currentPrice - vwapValue) / vwapValue) * 10, -0.4, 0.4);
    else if (volRatio > 1.5) volumeScore += 0.3 * lastDir;   // no volume data: nudge by the volume ratio
    // Unusual volume (z > 2) in the direction of the move confirms conviction.
    if (Math.abs(volZScore) > 2) volumeScore += clamp((Math.abs(volZScore) - 2) * 0.1, 0, 0.25) * lastDir;
    volumeScore = clamp(volumeScore, -1, 1);

    let patternScore = (divergence.bullish ? 0.5 : 0) - (divergence.bearish ? 0.5 : 0);
    for (const pat of patterns) patternScore += pat.bullish * pat.strength * 0.4;
    patternScore = clamp(patternScore, -1, 1);

    // --- Regime-weighted composite, then the confluence multiplier ---
    const weights = trending ? (adx.adx >= 40 ? REGIME_WEIGHTS.strongTrend : REGIME_WEIGHTS.trend) : REGIME_WEIGHTS[regimeType];
    const scores = { trend: trendScore, momentum: momentumScore, meanRev: meanRevScore, volume: volumeScore, pattern: patternScore };
    let totalScore = Object.keys(weights).reduce((s, k) => s + scores[k] * weights[k], 0);
    const factors = Object.values(scores);
    const compSign = totalScore >= 0 ? 1 : -1;
    const agreeing = factors.filter(f => Math.sign(f) === compSign && Math.abs(f) > 0.1).length;
    const confluenceRatio = agreeing / factors.length;
    const confluenceMult = 0.6 + confluenceRatio * 0.8;   // [0.6, 1.4]
    totalScore *= confluenceMult;

    // --- Risk score (1-10), penalty on the composite ---
    const lastVolume = volumes[volumes.length - 1] || 0;
    const riskScore = Math.min(10,
        (RISK_STEPS.find(([vol, minPrice]) => volatilityPct > vol || currentPrice < minPrice)?.[2] ?? 1)
        + (drawdown > 50 ? 2 : drawdown > 30 ? 1 : 0)
        + (lastVolume > 0 && lastVolume < 10000 ? 1 : 0));   // a very thin last bar adds risk
    if (riskScore > 4) totalScore -= (riskScore - 4) * 0.08 * compSign;
    if (riskScore >= 9) totalScore = Math.min(totalScore, -0.35);
    totalScore = clamp(totalScore, -1, 1);

    const signalValue = Math.round(50 + totalScore * 50);
    const title = signalValue >= 80 ? 'Strong Buy' : signalValue >= 55 ? 'Buy' : signalValue <= 20 ? 'Strong Sell' : signalValue <= 45 ? 'Sell' : 'Hold';

    // --- Risk management, adjusted to the regime ---
    const slDist = atr * (regimeType === 'ranging' ? options.slMult * 0.8 : options.slMult);
    const tpDist = atr * (trending ? options.tpMult * 1.2 : options.tpMult);
    const dir = totalScore >= 0 ? 1 : -1;
    // A stop can never sit at or below zero: floor it at 1% of the price.
    let stopLoss = currentPrice - dir * slDist;
    if (stopLoss <= 0) stopLoss = currentPrice * 0.01;
    const takeProfit = Math.max(currentPrice * 0.01, currentPrice + dir * tpDist);

    // Position size: risk a fixed fraction of capital (capped at 2%) so that hitting the stop loses
    // exactly that much, capped at maxPosition of capital. A Kelly fraction fed by an invented win
    // rate is unreliable, so half-Kelly is used ONLY when a backtested win rate over 30+ trades is supplied.
    let accountRiskFrac = clamp(options.accountRisk, 0.005, 0.02);
    let sizingMethod = 'fixed-fractional';
    if (typeof options.empiricalWinRate === 'number' && (options.empiricalTrades || 0) >= 30) {
        const p = clamp(options.empiricalWinRate, 0, 1), payoff = tpDist / slDist;
        accountRiskFrac = clamp(Math.max(0, p - (1 - p) / payoff) * 0.5, 0, 0.02);
        sizingMethod = 'half-kelly';
    }
    const maxShares = (options.maxPosition * options.accountCapital) / currentPrice;
    const riskBasedShares = (options.accountCapital * accountRiskFrac) / Math.max(slDist, currentPrice * 0.005);
    // Long-only context (e.g. PEA): bearish setups produce no position.
    const positionSize = dir > 0 ? Math.min(maxShares, riskBasedShares) : 0;

    const allPatterns = [...patterns];
    if (divergence.bullish) allPatterns.push({ name: 'Bullish RSI Divergence', bullish: 1, strength: 0.7 });
    if (divergence.bearish) allPatterns.push({ name: 'Bearish RSI Divergence', bullish: -1, strength: 0.7 });

    const result = {
        symbol: data.symbol,
        period: options.period,
        signalValue,
        signalTitle: title,
        risk: { score: riskScore, volatility: volatilityPct, drawdown },
        regime: { type: regimeType, strength: adx.adx, label: REGIME_LABELS[regimeType], squeeze: bbSqueeze },
        confluence: { ratio: confluenceRatio, agreeing, total: factors.length, multiplier: confluenceMult },
        dataQuality: {
            ohlc: ohlcAvailable ? 'full' : 'closes-only',
            volume: volumeAvailable,
            degraded: !ohlcAvailable,
            note: ohlcAvailable ? null : 'No intraday high/low: range indicators are approximated from closes; ATR is volatility-corrected.'
        },
        trade: { direction: dir > 0 ? 'long' : 'short', sizingMethod },
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
            obvSlope: obv, mfi, volRatio, vwap: vwapValue, volZScore,
            ichimoku: ichi, supertrend,
            bbZScore,
            scores, weights, weightedScore: totalScore,
            stopLoss, takeProfit, positionSize
        }
    };

    SIGNAL_CACHE.set(cacheKey, result);
    if (SIGNAL_CACHE.size > 100) SIGNAL_CACHE.delete(SIGNAL_CACHE.keys().next().value);
    return result;
}

// ============ VERDICT CARD ============

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
const REGIME_WORD = { uptrend: L('Rising'), downtrend: L('Falling'), ranging: L('Sideways'), transitional: L('Changing') };

/** Red at 0, yellow at 50, green at 100, blended in between. */
const SIG_STOPS = [[255, 107, 142], [242, 201, 76], [79, 224, 163]];
function signalColor(value) {
    const x = clamp(Number(value) || 0, 0, 100) / 50;
    const i = Math.min(1, Math.floor(x)), t = x - i;
    const [a, b] = [SIG_STOPS[i], SIG_STOPS[i + 1]];
    return `rgb(${a.map((c, k) => Math.round(c + (b[k] - c) * t)).join(', ')})`;
}

function plainReasons(result) {
    const e = result.explanation, r = result.regime.type;
    const trend = L('Trend'), flow = L('Money flow');
    return [
        r === 'uptrend' ? { tone: 'pos', key: trend, text: L('Rising. Buyers are in control.') }
            : r === 'downtrend' ? { tone: 'neg', key: trend, text: L('Falling. Sellers are in control.') }
            : r === 'ranging' ? { tone: 'neu', key: trend, text: L('Moving sideways, no clear direction.') }
            : { tone: 'neu', key: trend, text: L('Changing direction, not settled yet.') },
        e.rsi < 30 ? { tone: 'pos', key: 'Momentum', text: L('Fell a lot recently. A rebound often follows.') }
            : e.rsi > 70 ? { tone: 'neg', key: 'Momentum', text: L('Rose a lot recently. A pullback often follows.') }
            : e.macdHistogram > 0 ? { tone: 'pos', key: 'Momentum', text: L('Picking up speed upward.') }
            : { tone: 'neg', key: 'Momentum', text: L('Losing speed.') },
        e.obvSlope > 0.05 ? { tone: 'pos', key: flow, text: L('More money is coming in than going out.') }
            : e.obvSlope < -0.05 ? { tone: 'neg', key: flow, text: L('More money is leaving than coming in.') }
            : { tone: 'neu', key: flow, text: L('Buyers and sellers are balanced.') },
    ];
}

function summarySentence(result, reasons) {
    const count = tone => reasons.filter(x => x.tone === tone).length;
    if (result.signalValue >= 55) return count('pos') >= 2 ? L('Most signals point up.') : L('Signals lean up, but not all agree.');
    if (result.signalValue <= 45) return count('neg') >= 2 ? L('Most signals point down.') : L('Signals lean down, but not all agree.');
    return L('Signals disagree.');
}

// The engine sizes a 10 000 € account in the stock's own price units: scale it to the real amount and say shares.
function suggestedSize(size, pos) {
    const shares = size * convert(1, 'EUR', priceCurrency(pos));
    const text = shares < 1 ? '< 1' : shares.toLocaleString(LOCALE, { maximumFractionDigits: shares < 10 ? 2 : 0 });
    return L('{0} shares', text);
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
    const riskIdx = clamp(Math.ceil(result.risk.score / 2) - 1, 0, 4);
    const horizon = HORIZON_MAP[result.period] || { label: L('Medium term'), desc: L('Swing (weeks)') };
    const cur = currencySymbol(priceCurrency(positions[symbol]));

    // One diverging bar per indicator: rose left of the middle, mint right of it.
    const bar = value => {
        const x = clamp(value, 0, 100);
        return `<span class="vd-bar"><span class="vd-bar-fill ${x >= 50 ? 'is-pos' : 'is-neg'}" style="left:${Math.min(x, 50)}%;width:${Math.abs(x - 50)}%"></span></span>`;
    };
    // Gauge positions (0-100, 50 = neutral) per indicator.
    const rsiGauge = e.rsi < 30 ? 75 : e.rsi < 40 ? 62 : e.rsi > 70 ? 25 : e.rsi > 60 ? 38 : 50;
    const macdGauge = e.macdHistogram > 0 && e.macdLine > 0 ? 80 : e.macdHistogram > 0 ? 65 : e.macdHistogram < 0 && e.macdLine < 0 ? 20 : 35;
    const stochGauge = e.stochK < 20 && e.stochK > e.stochD ? 78 : e.stochK < 20 ? 68 : e.stochK > 80 && e.stochK < e.stochD ? 22 : e.stochK > 80 ? 32 : 50;
    const trendGauge = price > e.sma200 ? (price > e.sma50 ? 82 : 58) : (price < e.sma50 ? 18 : 42);
    const bbGauge = e.bbPercentB < 0 ? 80 : e.bbPercentB < 0.2 ? 68 : e.bbPercentB > 1 ? 15 : e.bbPercentB > 0.8 ? 30 : 50;
    const volGauge = e.obvSlope > 0.05 ? 72 : e.obvSlope < -0.05 ? 28 : 50;
    const regimeGauge = result.regime.type === 'uptrend' ? 78 : result.regime.type === 'downtrend' ? 22 : 50;
    const tone = x => x > 52 ? 'positive' : x < 48 ? 'negative' : '';

    const rows = [
        [L('Trend'), REGIME_WORD[result.regime.type] || result.regime.label, regimeGauge, `ADX ${Math.round(result.regime.strength || 0)}`],
        [L('Signals agreeing'), L('{0} of 5', result.confluence.agreeing), Math.round(50 + (result.confluence.agreeing / 5 - 0.5) * 60 * (result.signalValue >= 50 ? 1 : -1)), L('How many indicator families point the same way')],
        ...(result.regime.squeeze ? [['Squeeze', L('Prices compressed'), 50, L('A bigger move is likely soon, direction unknown')]] : []),
        [`RSI (${e.indicatorConfig?.rsiPeriod || 14})`, e.rsi.toFixed(0), rsiGauge, L('Below 30 = fell a lot, above 70 = rose a lot')],
        ['MACD', e.macdHistogram >= 0 ? L('Rising') : L('Falling'), macdGauge, L('Speed of the trend')],
        ['Stochastic', `${e.stochK.toFixed(0)}`, stochGauge, L('Where the price sits in its recent range')],
        [L('Long-term average ({0})', e.smaConfig?.[2] || 200), price > e.sma200 ? L('Above') : L('Below'), trendGauge, `${e.sma200.toFixed(2)} ${cur}`],
        [L('Bollinger bands'), `${(e.bbPercentB * 100).toFixed(0)}%`, bbGauge, L('Near 0% = low end of its usual range, 100% = high end')],
        [L('Money flow'), `MFI ${e.mfi.toFixed(0)}`, volGauge, L('Volume behind the moves')],
        ['Momentum', `${e.momentum >= 0 ? '+' : ''}${e.momentum.toFixed(1)}%`, clamp(50 + e.momentum * 2, 0, 100), L('Change over the last {0} points', e.indicatorConfig?.momentumPeriod || 10)],
        ...(result.patterns?.length ? [[L('Chart patterns'), result.patterns.map(p => p.name).join(', '), result.patterns[0].bullish > 0 ? 75 : result.patterns[0].bullish < 0 ? 25 : 50, L('Seen on the latest candles')]] : []),
        [L('Worst drop'), `-${e.drawdown.toFixed(1)}%`, clamp(50 - e.drawdown, 0, 100), L('Largest fall from a peak in this period')],
        [L('Risk'), `${result.risk.score}/10`, clamp(100 - result.risk.score * 10, 0, 100), RISK_WORDS[riskIdx]],
    ];
    const levels = [
        ['Horizon', horizon.label, horizon.desc],
        [termHtml('stoploss', 'Stop loss'), `${e.stopLoss.toFixed(2)} ${cur}`, L('Price where a trader would cut the loss')],
        [termHtml('takeprofit', 'Take profit'), `${e.takeProfit.toFixed(2)} ${cur}`, L('Price where a trader would take the gain')],
        [L('Suggested size'), suggestedSize(e.positionSize, positions[symbol]), result.trade?.sizingMethod === 'half-kelly' ? L('Half-Kelly, from a tested edge') : L('Risks about 1% of a 10 000 € account')],
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

export function updateSignal(symbol, data, options = {}) {
    const result = calculateBotSignal({ ...data, symbol }, options);
    updateSignalUI(symbol, result);
    return result;
}
