export const TRADING_DAYS = 252;

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const safeArray = (arr) => Array.isArray(arr) ? arr : [];

// ============ BASIC STATISTICS ============

export function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
}

// Sample standard deviation (n-1). Use for volatility estimated from return samples.
export function sampleStdDev(arr, precomputedMean) {
    if (!arr || arr.length < 2) return 0;
    const m = precomputedMean ?? mean(arr);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - m;
        s += d * d;
    }
    return Math.sqrt(s / (arr.length - 1));
}

// Population standard deviation (n). Use only for fully-observed windows
// (e.g. Bollinger bands, where the window IS the population by definition).
export function populationStdDev(arr, precomputedMean) {
    if (!arr || arr.length === 0) return 0;
    const m = precomputedMean ?? mean(arr);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - m;
        s += d * d;
    }
    return Math.sqrt(s / arr.length);
}

// ============ RETURNS ============

export function simpleReturns(prices) {
    if (!prices || prices.length < 2) return [];
    const out = new Array(prices.length - 1);
    for (let i = 1; i < prices.length; i++) {
        const prev = prices[i - 1];
        out[i - 1] = prev ? (prices[i] - prev) / prev : 0;
    }
    return out;
}

export function logReturns(prices) {
    if (!prices || prices.length < 2) return [];
    const out = new Array(prices.length - 1);
    for (let i = 1; i < prices.length; i++) {
        const prev = prices[i - 1];
        out[i - 1] = prev > 0 && prices[i] > 0 ? Math.log(prices[i] / prev) : 0;
    }
    return out;
}

// ============ MOVING AVERAGES ============

// SMA of the LAST `period` values. Falls back to the mean of all available data when the
// series is shorter than the period — callers that care must check length themselves
// (signal-bot gates SMA50/SMA200 validity explicitly for this reason).
export function sma(prices, period) {
    const p = safeArray(prices);
    if (p.length === 0) return 0;
    const n = Math.min(period, p.length);
    let s = 0;
    for (let i = p.length - n; i < p.length; i++) s += p[i];
    return s / n;
}

export function ema(prices, period) {
    const p = safeArray(prices);
    if (p.length === 0) return 0;
    if (p.length < period) return mean(p);
    const k = 2 / (period + 1);
    let e = 0;
    for (let i = 0; i < period; i++) e += p[i];
    e /= period;
    for (let i = period; i < p.length; i++) e = p[i] * k + e * (1 - k);
    return e;
}

// ============ REGRESSION ============

// OLS slope of the last `period` values against bar index, normalized to % of mean per bar.
// Shared by price-trend scoring and OBV-slope (previously two inline copies in signal-bot).
export function linRegSlopePct(values, period) {
    const v = safeArray(values);
    const p = period ? v.slice(-period) : v;
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
    const m = sumY / n;
    return m === 0 ? 0 : (slope / m) * 100;
}

// Same regression but normalized by mean ABSOLUTE level — required for series that
// oscillate around 0 (e.g. OBV), where mean-normalization would divide by ~0.
export function linRegSlopeAbsNorm(values, period) {
    const v = safeArray(values);
    const p = period ? v.slice(-period) : v;
    const n = p.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumAbs = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += p[i];
        sumXY += i * p[i];
        sumX2 += i * i;
        sumAbs += Math.abs(p[i]);
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return 0;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const meanAbs = sumAbs / n;
    return meanAbs === 0 ? 0 : slope / meanAbs;
}

// ============ DRAWDOWN ============

// Max peak-to-trough decline, returned as a POSITIVE fraction (0.35 = -35%).
// Callers choose sign/percent presentation.
export function maxDrawdown(prices) {
    const p = safeArray(prices);
    if (p.length < 2) return 0;
    let peak = p[0];
    let maxDD = 0;
    for (let i = 1; i < p.length; i++) {
        if (p[i] > peak) peak = p[i];
        else {
            const dd = (peak - p[i]) / peak;
            if (dd > maxDD) maxDD = dd;
        }
    }
    return maxDD;
}

// ============ RANGE / WILDER PRIMITIVES ============

// True-range series (Wilder). Single implementation — previously rebuilt inline by
// ATR, ADX and SuperTrend.
export function trueRanges(highs, lows, closes) {
    const h = safeArray(highs), l = safeArray(lows), c = safeArray(closes);
    const n = Math.min(h.length, l.length, c.length);
    if (n < 2) return [];
    const tr = new Array(n - 1);
    for (let i = 1; i < n; i++) {
        const hl = h[i] - l[i];
        const hc = Math.abs(h[i] - c[i - 1]);
        const lc = Math.abs(l[i] - c[i - 1]);
        tr[i - 1] = Math.max(hl, hc, lc);
    }
    return tr;
}

// Wilder's smoothing (RMA): seeds with the simple average of the first `period` values,
// then atr = (atr*(p-1) + x)/p. Returns the full smoothed series (aligned to arr[period-1...]).
export function wilderSmoothSeries(arr, period) {
    const a = safeArray(arr);
    if (a.length < period) return [];
    let s = 0;
    for (let i = 0; i < period; i++) s += a[i];
    let val = s / period;
    const out = [val];
    for (let i = period; i < a.length; i++) {
        val = (val * (period - 1) + a[i]) / period;
        out.push(val);
    }
    return out;
}

// Last value of Wilder smoothing; mean fallback for short series (ATR behaviour).
export function wilderSmoothLast(arr, period) {
    const a = safeArray(arr);
    if (a.length === 0) return 0;
    if (a.length < period) return mean(a);
    const series = wilderSmoothSeries(a, period);
    return series[series.length - 1];
}

// Wilder's running SUM (used by ADX DI lines): s = s - s/p + x.
export function wilderSumSeries(arr, period) {
    const a = safeArray(arr);
    if (a.length < period) return [];
    let s = 0;
    for (let i = 0; i < period; i++) s += a[i];
    const out = [s];
    for (let i = period; i < a.length; i++) {
        s = s - (s / period) + a[i];
        out.push(s);
    }
    return out;
}

// ============ VOLUME ============

// VWAP (Volume-Weighted Average Price) over a series of [price, volume] pairs.
// Pass parallel arrays: prices (typically typical price = (H+L+C)/3) and volumes.
// Returns the VWAP for the full window, or 0 if total volume is zero.
export function vwap(prices, volumes) {
    const p = safeArray(prices), v = safeArray(volumes);
    const n = Math.min(p.length, v.length);
    if (n === 0) return 0;
    let sumPV = 0, sumV = 0;
    for (let i = 0; i < n; i++) {
        sumPV += p[i] * v[i];
        sumV  += v[i];
    }
    return sumV === 0 ? 0 : sumPV / sumV;
}

// Rolling VWAP series: returns one VWAP value per bar, anchored to bar 0.
// Useful for cumulative intraday/session VWAP lines.
export function vwapSeries(prices, volumes) {
    const p = safeArray(prices), v = safeArray(volumes);
    const n = Math.min(p.length, v.length);
    const out = new Array(n);
    let sumPV = 0, sumV = 0;
    for (let i = 0; i < n; i++) {
        sumPV += p[i] * v[i];
        sumV  += v[i];
        out[i] = sumV === 0 ? p[i] : sumPV / sumV;
    }
    return out;
}

// ============ CORRELATION ============

// Sample covariance of two equal-length arrays (n-1 denominator).
export function covariance(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    let s = 0;
    for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my);
    return s / (n - 1);
}

// Pearson correlation coefficient [-1, 1].
// Returns 0 when either series has zero variance (flat line).
export function pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const xs = x.slice(0, n), ys = y.slice(0, n);
    const cov = covariance(xs, ys);
    const sx  = sampleStdDev(xs);
    const sy  = sampleStdDev(ys);
    return sx === 0 || sy === 0 ? 0 : cov / (sx * sy);
}

// Rolling Pearson correlation: returns one correlation per bar (after the first `period` bars).
// Useful for live correlation charts between two assets.
export function rollingCorrelation(x, y, period) {
    const n = Math.min(x.length, y.length);
    if (n < period) return [];
    const out = new Array(n - period + 1);
    for (let i = 0; i <= n - period; i++) {
        out[i] = pearsonCorrelation(x.slice(i, i + period), y.slice(i, i + period));
    }
    return out;
}

// ============ PROBABILITY / Z-SCORES ============

// Z-score of a single value against a reference array (uses sample std dev).
// Returns 0 when std dev is zero (all values identical).
export function zScore(value, arr) {
    const m = mean(arr);
    const s = sampleStdDev(arr, m);
    return s === 0 ? 0 : (value - m) / s;
}

// Rolling Z-score series: for each bar i >= period, z = (x[i] - mean(window)) / std(window).
// Returns an array aligned to index `period - 1` of the input.
export function rollingZScore(arr, period) {
    const a = safeArray(arr);
    if (a.length < period) return [];
    const out = new Array(a.length - period + 1);
    for (let i = 0; i <= a.length - period; i++) {
        const window = a.slice(i, i + period);
        const m = mean(window);
        const s = sampleStdDev(window, m);
        out[i] = s === 0 ? 0 : (a[i + period - 1] - m) / s;
    }
    return out;
}

// Cumulative distribution function of the standard normal (Φ(z)).
// Uses the Horner-form rational approximation (Abramowitz & Stegun 26.2.17),
// max error < 7.5e-8 — sufficient for price-anomaly detection.
export function normalCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.319381530
               + t * (-0.356563782
               + t * (1.781477937
               + t * (-1.821255978
               + t *  1.330274429))));
    const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const p = 1 - pdf * poly;
    return z >= 0 ? p : 1 - p;
}

// Probability (0-1) that the current price is an extreme outlier given the
// distribution of the reference window. Returns the two-tailed p-value.
// p < 0.05 → statistically unusual move at 95 % confidence.
export function outlierPValue(value, arr) {
    const z = zScore(value, arr);
    return 2 * (1 - normalCDF(Math.abs(z)));
}

// ============ PERCENTILES ============

// Linear-interpolation percentile on a PRE-SORTED ascending array (q in [0,1]).
export function percentileSorted(sorted, q) {
    const n = sorted.length;
    if (n === 0) return 0;
    if (n === 1) return sorted[0];
    const pos = q * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
