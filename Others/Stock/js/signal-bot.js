const SIGNAL_HISTORY = [];

const DEFAULT_OPTIONS = {
    accountCapital: 10000, accountRisk: 0.02, maxPosition: 0.2, slMult: 1.5, tpMult: 2.5, transactionCost: 0.0015, minLength: 30,
    weights: { rsi: 0.20, macd: 0.25, sma: 0.30, momentum: 0.15, volume: 0.10 }
};

const safe = arr => Array.isArray(arr) ? arr : [];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function validate(data, opts = {}) { const p = safe(data?.prices); return p.length >= Math.max(30, opts.minLength || 30) && p.every(x => x > 0); }

function rsi(prices, period = 14) {
    const p = safe(prices);
    if (p.length < period + 1) return 50;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) { const d = p[i] - p[i - 1]; d > 0 ? gain += d : loss -= d; }
    gain /= period; loss /= period;
    for (let i = period + 1; i < p.length; i++) { const d = p[i] - p[i - 1]; gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period; loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period; }
    return 100 - (100 / (1 + (loss === 0 ? 100 : gain / loss)));
}

function ema(prices, period) {
    const p = safe(prices);
    if (p.length === 0) return 0;
    if (p.length < period) return p.reduce((a, b) => a + b, 0) / p.length;
    const k = 2 / (period + 1);
    let e = p.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < p.length; i++) e = p[i] * k + e * (1 - k);
    return e;
}

function sma(prices, period) { const p = safe(prices); return p.length === 0 ? 0 : p.length < period ? p.reduce((a, b) => a + b, 0) / p.length : p.slice(-period).reduce((a, b) => a + b, 0) / period; }

function macd(prices, fast = 12, slow = 26, signal = 9) {
    const p = safe(prices);
    if (p.length < slow) return { line: 0, signal: 0, hist: 0, series: [] };
    const kf = 2 / (fast + 1), ks = 2 / (slow + 1);
    let ef = p.length >= fast ? p.slice(0, fast).reduce((a, b) => a + b, 0) / fast : p[0];
    let es = p.length >= slow ? p.slice(0, slow).reduce((a, b) => a + b, 0) / slow : p[0];
    const series = [];
    for (let i = 1; i < p.length; i++) { ef = p[i] * kf + ef * (1 - kf); es = p[i] * ks + es * (1 - ks); if (i >= slow - 1) series.push(ef - es); }
    const line = series[series.length - 1], sig = ema(series, signal);
    return { line, signal: sig, hist: line - sig, series };
}

function atr(highs, lows, closes, period = 14) {
    const h = safe(highs), l = safe(lows), c = safe(closes), n = Math.min(h.length, l.length, c.length);
    if (n < 2) return 0;
    const tr = [];
    for (let i = 1; i < n; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    if (tr.length < period) return tr.reduce((a, b) => a + b, 0) / tr.length;
    let a = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < tr.length; i++) a = (a * (period - 1) + tr[i]) / period;
    return a;
}

function adx(highs, lows, closes, period = 14) {
    const h = safe(highs), l = safe(lows), c = safe(closes), n = Math.min(h.length, l.length, c.length);
    if (n < period + 1) return 0;
    const tr = [], pdm = [], ndm = [];
    for (let i = 1; i < n; i++) { tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))); const hd = h[i] - h[i - 1], ld = l[i - 1] - l[i]; pdm.push(hd > ld && hd > 0 ? hd : 0); ndm.push(ld > hd && ld > 0 ? ld : 0); }
    let str = tr.slice(0, period).reduce((a, b) => a + b, 0), spdm = pdm.slice(0, period).reduce((a, b) => a + b, 0), sndm = ndm.slice(0, period).reduce((a, b) => a + b, 0);
    const dx = [];
    for (let i = period; i < tr.length; i++) { str = str - str / period + tr[i]; spdm = spdm - spdm / period + pdm[i]; sndm = sndm - sndm / period + ndm[i]; const pdi = 100 * spdm / str, ndi = 100 * sndm / str; dx.push(100 * Math.abs(pdi - ndi) / (pdi + ndi || 1)); }
    return dx.length > 0 ? dx.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, dx.length) : 0;
}

function momentum(prices, period = 10) { const p = safe(prices); if (p.length < period + 1) return 0; const prev = p[p.length - period - 1]; return prev === 0 ? 0 : ((p[p.length - 1] - prev) / prev) * 100; }
function volumeRatio(volumes, period = 20) { const v = safe(volumes); if (v.length < 2) return 1; const recent = v[v.length - 1], avg = v.slice(-Math.min(period, v.length)).reduce((a, b) => a + b, 0) / Math.min(period, v.length); return avg === 0 ? 1 : recent / avg; }
function stdDev(values, period = 20) { const v = safe(values); if (v.length < 2) return 0; const slice = v.slice(-Math.min(period, v.length)), mean = slice.reduce((a, b) => a + b, 0) / slice.length; return Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length); }

function detectCandlestickPatterns(opens, highs, lows, closes) {
    const patterns = [];
    if (!opens || opens.length < 2) return patterns;
    const i = closes.length - 1, O = opens[i], H = highs[i], L = lows[i], C = closes[i], pO = opens[i-1], pC = closes[i-1];
    const body = Math.abs(C - O), upper = H - Math.max(O, C), lower = Math.min(O, C) - L, range = H - L;
    if (range === 0) return patterns;
    if (body <= range * 0.1) patterns.push({ name: 'Doji', type: 'neutral', score: 0, desc: 'Indécision.' });
    if (lower > 2 * body && upper < body) patterns.push(pC < pO ? { name: 'Hammer', type: 'bullish', score: 0.6, desc: 'Rebond.' } : { name: 'Hanging Man', type: 'bearish', score: -0.6, desc: 'Retournement.' });
    if (upper > 2 * body && lower < body) patterns.push(pC > pO ? { name: 'Shooting Star', type: 'bearish', score: -0.6, desc: 'Rejet.' } : { name: 'Inverted Hammer', type: 'bullish', score: 0.6, desc: 'Rebond.' });
    const pBody = Math.abs(pC - pO);
    if (body > pBody && body > 0.0001) { if (C > O && pC < pO && C > pO && O < pC) patterns.push({ name: 'Bullish Engulfing', type: 'bullish', score: 0.8, desc: 'Acheteurs.' }); else if (C < O && pC > pO && C < pO && O > pC) patterns.push({ name: 'Bearish Engulfing', type: 'bearish', score: -0.8, desc: 'Vendeurs.' }); }
    return patterns;
}

function rsiSeries(prices, period = 14) {
    const p = safe(prices), res = new Array(p.length).fill(50);
    if (p.length < period + 1) return res;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) { const d = p[i] - p[i - 1]; d > 0 ? gain += d : loss -= d; }
    gain /= period; loss /= period; res[period] = 100 - (100 / (1 + (loss === 0 ? 100 : gain / loss)));
    for (let i = period + 1; i < p.length; i++) { const d = p[i] - p[i - 1]; gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period; loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period; res[i] = 100 - (100 / (1 + (loss === 0 ? 100 : gain / loss))); }
    return res;
}

function divergence(prices, indicator, lookback = 14) {
    const p = safe(prices), ind = safe(indicator), n = Math.min(p.length, ind.length);
    if (n < lookback + 2) return 0;
    const w = 3, minGap = 5, indRange = Math.max(...ind.slice(-lookback)) - Math.min(...ind.slice(-lookback)), threshold = indRange * 0.03;
    const isPeak = (arr, i) => i - w >= 0 && i + w < arr.length && arr[i] > Math.max(...arr.slice(i - w, i)) && arr[i] > Math.max(...arr.slice(i + 1, i + 1 + w)) && arr[i] - Math.max(Math.max(...arr.slice(i - w, i)), Math.max(...arr.slice(i + 1, i + 1 + w))) >= threshold;
    const isTrough = (arr, i) => i - w >= 0 && i + w < arr.length && arr[i] < Math.min(...arr.slice(i - w, i)) && arr[i] < Math.min(...arr.slice(i + 1, i + 1 + w)) && Math.min(Math.min(...arr.slice(i - w, i)), Math.min(...arr.slice(i + 1, i + 1 + w))) - arr[i] >= threshold;
    const pPeaks = [], pTroughs = [], iPeaks = [], iTroughs = [];
    for (let i = w; i < n - w; i++) { if (isPeak(p, i) && i >= n - lookback) pPeaks.push({ i, v: p[i] }); if (isTrough(p, i) && i >= n - lookback) pTroughs.push({ i, v: p[i] }); if (isPeak(ind, i) && i >= n - lookback) iPeaks.push({ i, v: ind[i] }); if (isTrough(ind, i) && i >= n - lookback) iTroughs.push({ i, v: ind[i] }); }
    const indStd = stdDev(ind, lookback) || 1;
    if (pPeaks.length >= 2 && iPeaks.length >= 2) { const pp1 = pPeaks[pPeaks.length - 1], pp2 = pPeaks[pPeaks.length - 2], ip1 = iPeaks[iPeaks.length - 1], ip2 = iPeaks[iPeaks.length - 2]; if (Math.abs(pp1.i - pp2.i) >= minGap && pp1.v > pp2.v && ip1.v < ip2.v) return -Math.min(0.5, (ip2.v - ip1.v) / indStd); }
    if (pTroughs.length >= 2 && iTroughs.length >= 2) { const pt1 = pTroughs[pTroughs.length - 1], pt2 = pTroughs[pTroughs.length - 2], it1 = iTroughs[iTroughs.length - 1], it2 = iTroughs[iTroughs.length - 2]; if (Math.abs(pt1.i - pt2.i) >= minGap && pt1.v < pt2.v && it1.v > it2.v) return Math.min(0.5, (it1.v - it2.v) / indStd); }
    return 0;
}

function normalize(indicator, value, invert = false) {
    const ranges = { rsi: [30, 70], momentum: [-15, 15], volume: [0.7, 1.5] }, [low, high] = ranges[indicator] || [0, 100], mid = (low + high) / 2, range = (high - low) / 2;
    let norm = (value - mid) / range; if (invert) norm = -norm; return clamp(norm, -1, 1);
}

function marketRegime(adxVal, volMult) {
    if (adxVal < 20) return { type: 'range', filter: 0.75 };
    if (adxVal > 50) return { type: 'extreme_trend', filter: 1.1 };
    if (adxVal > 40) return { type: 'strong_trend', filter: 1.25 };
    if (adxVal >= 25) return { type: 'trending', filter: 1.1 };
    if (volMult > 0.05) return { type: 'high_vol', filter: 0.85 };
    return { type: 'normal', filter: 1.0 };
}

function computeStops(price, atr, direction, regime, slMult, tpMult) {
    const adj = regime.type === 'high_vol' ? 1.3 : regime.type === 'range' ? 0.8 : 1.0;
    let slDist = Math.min(slMult * atr * adj, price * 0.06), tpDist = Math.min(tpMult * atr * adj, price * 0.10);
    if (tpDist < slDist * 1.5) tpDist = slDist * 1.5;
    return { sl: Math.max(0.01, price - direction * slDist), tp: Math.max(0.01, price + direction * tpDist) };
}

function positionSize(signal, price, sl, regime, capital, risk, maxPos, txCost) {
    const direction = Math.sign((signal - 50) / 50) || 1, riskPerUnit = Math.abs(price - sl);
    if (!price || riskPerUnit <= 0) return 0;
    const units = Math.floor((capital * (risk - txCost)) / riskPerUnit), posPct = ((units * price) / capital) * regime.filter;
    return clamp(posPct, 0, maxPos) * direction;
}

function composite(parts, weights) { let sum = 0, wsum = 0; for (const k in weights) if (parts[k] !== undefined) { sum += parts[k] * weights[k]; wsum += weights[k]; } return wsum === 0 ? 0 : sum / wsum; }
function smooth(value, prev, alpha = 0.15) { return typeof prev === 'number' ? prev * (1 - alpha) + value * alpha : value; }
function recordSignal(symbol, result) { SIGNAL_HISTORY.push({ ts: Date.now(), symbol, result }); if (SIGNAL_HISTORY.length > 5000) SIGNAL_HISTORY.shift(); }

function calculateBotSignal(data, options = {}) {
    options = { ...DEFAULT_OPTIONS, ...options };
    if (!validate(data, options)) { const p = safe(data?.prices); return { signalValue: 50, signalTitle: 'Garder', signalDesc: 'Données insuffisantes', explanation: 'Données insuffisantes', insufficientReason: p.length < 30 ? `Min 30 pts, ${p.length} reçus.` : 'Prix invalides.', details: {} }; }

    const symbol = data.symbol || options.symbol || 'UNKNOWN', price = data.price || safe(data.prices).slice(-1)[0] || 0, vols = safe(data.volumes), highs = safe(data.highs || data.prices), lows = safe(data.lows || data.prices), closes = safe(data.prices), opens = data.opens ? safe(data.opens) : null, longPrices = safe(data.longPrices || closes);

    const rsiShort = rsi(closes, 14), rsiLong = rsi(longPrices, 50), macdShort = macd(closes), macdLong = macd(longPrices), sma20 = sma(closes, 20), sma50 = sma(longPrices, 50), sma200 = sma(longPrices, 200), mom = momentum(closes, 10), volRatio = volumeRatio(vols, 20), atrVal = atr(highs, lows, closes, 14), adxVal = adx(highs, lows, closes, 14), std = stdDev(closes, 20), volMult = atrVal / (price || 1), regime = marketRegime(adxVal, volMult), patterns = detectCandlestickPatterns(opens, highs, lows, closes), divMACD = divergence(closes, macdShort.series, 14), divRSI = divergence(closes, rsiSeries(closes), 14);

    const rsiScore = normalize('rsi', rsiShort, true) * 0.7 + normalize('rsi', rsiLong, true) * 0.3;
    const macdPct = price > 0 ? (macdShort.hist / price) * 100 : 0, macdLongPct = price > 0 ? (macdLong.hist / price) * 100 : 0, macdScore = clamp(macdPct / 2, -1, 1) * 0.7 + clamp(macdLongPct / 2, -1, 1) * 0.3;
    const sma20Pos = clamp((price - sma20) / (sma20 || 1) * 50, -1, 1), sma50Pos = clamp((price - sma50) / (sma50 || 1) * 50, -1, 1), sma200Pos = clamp((price - sma200) / (sma200 || 1) * 50, -1, 1), smaAligned = (sma20 > sma50 && sma50 > sma200) ? 0.3 : (sma20 < sma50 && sma50 < sma200) ? -0.3 : 0, smaScore = clamp(sma20Pos * 0.4 + sma50Pos * 0.2 + sma200Pos * 0.1 + smaAligned, -1, 1);
    const adxMult = adxVal < 20 ? 0.8 : adxVal < 25 ? 0.9 + (adxVal - 20) * 0.02 : adxVal < 40 ? 1.0 + (adxVal - 25) * 0.015 : 1.2 + Math.min((adxVal - 40) * 0.005, 0.1);
    const momScore = normalize('momentum', mom), volScore = normalize('volume', volRatio);

    let score = composite({ rsi: rsiScore, macd: macdScore, sma: smaScore, momentum: momScore, volume: volScore }, options.weights) * adxMult + 0.2 * (divMACD + divRSI);
    if (patterns.length > 0) score += 0.2 * clamp(patterns.reduce((a, p) => a + p.score, 0), -1, 1);
    score *= regime.filter;
    const rpf = adxVal > 40 ? 0.3 : 0.6;
    if (rsiShort > 75 && score > 0) score *= (1 - Math.min((rsiShort - 70) / 30, 1) * rpf);
    else if (rsiShort < 25 && score < 0) score *= (1 - Math.min((30 - rsiShort) / 30, 1) * rpf);
    if (Math.abs(mom) > Math.max(15, volMult * 400)) score *= 0.85;

    const smoothed = smooth(score, options.prevSmoothed, 0.15), final = clamp(smoothed, -1, 1), signal = Math.round(50 + final * 50), direction = Math.sign(final) || 1;
    const stops = computeStops(price, atrVal, direction, regime, options.slMult, options.tpMult), posSize = positionSize(signal, price, stops.sl, regime, options.accountCapital, options.accountRisk, options.maxPosition, options.transactionCost);

    let title = 'Garder', desc = 'Neutre', warning = null;
    if (rsiShort > 80) warning = '⚠️ RSI suracheté'; else if (rsiShort < 20) warning = '⚠️ RSI survendu';
    if (Math.abs(mom) > 30) warning = (warning ? warning + ' | ' : '') + '⚠️ Momentum extrême';
    if (signal >= 80) { title = 'Acheter'; desc = 'Achat très fort'; } else if (signal >= 65) { title = 'Acheter'; desc = 'Achat confirmé'; } else if (signal >= 55) { title = 'Acheter'; desc = 'Achat modéré'; } else if (signal <= 20) { title = 'Vendre'; desc = 'Vente forte'; } else if (signal <= 35) { title = 'Vendre'; desc = 'Vente confirmée'; } else if (signal <= 45) { title = 'Vendre'; desc = 'Vente modérée'; }
    if (warning) desc += ` (${warning})`;

    const result = { symbol, signalValue: signal, signalTitle: title, signalDesc: desc, explanation: { rsi: rsiShort, macdHistogram: macdShort.hist, sma20, sma50, sma200, adx: adxVal, momentum: mom, volumeRatio: volRatio, atr: atrVal, stddev: std, divergenceMACD: divMACD, divergenceRSI: divRSI, patterns, regime: regime.type, regimeFilter: regime.filter, weightedScore: score, smoothed, positionSize: Math.abs(posSize), positionDirection: posSize >= 0 ? 'long' : 'short', stopLoss: stops.sl, takeProfit: stops.tp, currentPrice: price }, details: { rsi: rsiShort.toFixed(2), macd: macdShort.hist.toFixed(4), sma20: sma20.toFixed(2), sma50: sma50.toFixed(2), sma200: sma200.toFixed(2), adx: adxVal.toFixed(2), momentum: mom.toFixed(2), volumeRatio: volRatio.toFixed(2), atr: atrVal.toFixed(4), regime: regime.type, regimeFilter: regime.filter.toFixed(2), weightedScore: score.toFixed(4), smoothed: smoothed.toFixed(4), positionSize: posSize.toFixed(4), stopLoss: stops.sl.toFixed(4), takeProfit: stops.tp.toFixed(4) } };
    recordSignal(symbol, result);
    return result;
}

function updateSignalUI(symbol, signalResult) {
    const cursor = document.getElementById(`signal-cursor-${symbol}`), container = document.querySelector(`#card-${symbol} .signal-state-container`), title = document.querySelector(`#card-${symbol} .signal-state-title`), description = document.querySelector(`#card-${symbol} .signal-state-description`);
    if (!cursor || !container || !title || !description) return;

    cursor.style.left = `${signalResult.signalValue}%`;
    let stateClass = signalResult.isSuspended ? 'suspended-state' : signalResult.isClosed ? 'closed-state' : signalResult.signalDesc === 'Données insuffisantes' ? 'insufficient-state' : signalResult.signalTitle === 'Acheter' ? 'buy-state' : signalResult.signalTitle === 'Vendre' ? 'sell-state' : '';
    container.className = `signal-state-container ${stateClass}`;
    title.textContent = signalResult.signalDesc;

    if (signalResult.isSuspended) description.textContent = 'Cotation suspendue.';
    else if (signalResult.isClosed) description.textContent = 'Marché fermé.';
    else if (signalResult.signalDesc === 'Données insuffisantes') description.textContent = signalResult.insufficientReason || 'Données insuffisantes.';
    else { const advice = { 'Achat très fort': 'acheter maintenant.', 'Achat confirmé': 'prendre position.', 'Achat modéré': 'entrer progressivement.', 'Position neutre': 'attendre confirmation.', 'Vente modérée': 'prendre bénéfices partiels.', 'Vente confirmée': 'réduire position.', 'Vente forte': 'vendre.' }[signalResult.signalDesc] || 'surveiller.'; description.textContent = `Conseillé : ${advice}`; }

    const card = document.querySelector(`#card-${symbol}`), hide = signalResult.signalDesc === 'Données insuffisantes' || signalResult.isClosed || signalResult.isSuspended;
    card?.querySelector('.signal-labels')?.classList.toggle('hidden-by-bot', hide);
    card?.querySelector('.signal-bar')?.classList.toggle('hidden-by-bot', hide);

    const expSection = document.querySelector(`#card-${symbol} .signal-explanation`), expContent = document.querySelector(`#card-${symbol} .explanation-content`);
    if (expSection && expContent) {
        if (hide) expSection.classList.add('hidden-by-bot');
        else {
            expSection.classList.remove('hidden-by-bot');
            const e = signalResult.explanation;
            const getColor = (ind, val) => ({ rsi: { buy: v => v < 30, sell: v => v > 70 }, macd: { buy: v => v > 0, sell: v => v < 0 }, adx: { buy: v => v > 25, sell: () => false }, momentum: { buy: v => v > 5, sell: v => v < -5 }, volume: { buy: v => v > 1.5, sell: v => v < 0.7 }, smoothed: { buy: v => v > 0.1, sell: v => v < -0.1 }, positionSize: { buy: v => v > 0.1, sell: v => v < -0.1 } }[ind] ? (({ rsi, macd, adx, momentum, volume, smoothed, positionSize }[ind]?.buy(val)) ? 'signal-value-buy' : ({ rsi, macd, adx, momentum, volume, smoothed, positionSize }[ind]?.sell(val)) ? 'signal-value-sell' : 'signal-value-neutral') : 'signal-value-neutral');
            expContent.innerHTML = '';
            const tpl = document.getElementById('signal-explanation-table-template');
            if (tpl) {
                const clone = tpl.content.cloneNode(true);
                const set = (sel, val, c) => { const el = clone.querySelector(sel); if (el) { el.textContent = val; if (c) { el.classList.remove('signal-value-buy', 'signal-value-sell', 'signal-value-neutral'); el.classList.add(c); } } };
                set('.rsi-value', e.rsi.toFixed(2), e.rsi < 30 ? 'signal-value-buy' : e.rsi > 70 ? 'signal-value-sell' : 'signal-value-neutral');
                set('.macd-value', e.macdHistogram.toFixed(4), e.macdHistogram > 0 ? 'signal-value-buy' : e.macdHistogram < 0 ? 'signal-value-sell' : 'signal-value-neutral');
                set('.sma20-value', e.sma20.toFixed(2)); set('.sma50-value', e.sma50.toFixed(2)); set('.sma200-value', e.sma200.toFixed(2));
                set('.adx-value', e.adx.toFixed(2), e.adx > 25 ? 'signal-value-buy' : 'signal-value-neutral');
                set('.momentum-value', `${e.momentum.toFixed(2)}%`, e.momentum > 5 ? 'signal-value-buy' : e.momentum < -5 ? 'signal-value-sell' : 'signal-value-neutral');
                set('.volume-value', e.volumeRatio.toFixed(2), e.volumeRatio > 1.5 ? 'signal-value-buy' : e.volumeRatio < 0.7 ? 'signal-value-sell' : 'signal-value-neutral');
                set('.atr-value', e.atr.toFixed(4)); set('.regime-value', e.regime); set('.volatility-multiplier-value', e.regimeFilter.toFixed(2));
                set('.smoothed-value', e.smoothed.toFixed(4), e.smoothed > 0.1 ? 'signal-value-buy' : e.smoothed < -0.1 ? 'signal-value-sell' : 'signal-value-neutral');
                set('.position-size-value', `${(e.positionSize * 100).toFixed(2)}%`);
                set('.stop-loss-value', e.stopLoss.toFixed(4)); set('.take-profit-value', e.takeProfit.toFixed(4));
                const setDesc = (sel, txt) => { const el = clone.querySelector(sel); if (el) el.textContent = txt; };
                setDesc('.rsi-desc', e.rsi < 30 ? 'Survendu.' : e.rsi > 70 ? 'Suracheté.' : 'Équilibre.');
                setDesc('.macd-desc', e.macdHistogram > 0 ? 'Momentum haussier.' : e.macdHistogram < 0 ? 'Momentum baissier.' : 'Neutre.');
                setDesc('.adx-desc', e.adx > 40 ? 'Tendance forte.' : e.adx > 25 ? 'Tendance.' : 'Range.');
                setDesc('.momentum-desc', e.momentum > 5 ? 'Hausse.' : e.momentum < -5 ? 'Baisse.' : 'Stable.');
                setDesc('.volume-desc', e.volumeRatio > 1.5 ? 'Volume élevé.' : e.volumeRatio < 0.7 ? 'Volume faible.' : 'Normal.');
                setDesc('.smoothed-desc', e.smoothed > 0.15 ? 'Achat.' : e.smoothed < -0.15 ? 'Vente.' : 'Neutre.');
                setDesc('.stop-desc', `Perte max: -${Math.abs((e.stopLoss - e.currentPrice) / e.currentPrice * 100).toFixed(2)}%`);
                setDesc('.take-desc', `Gain visé: +${Math.abs((e.takeProfit - e.currentPrice) / e.currentPrice * 100).toFixed(2)}%`);
                if (e.patterns?.length) { const tbody = clone.querySelector('tbody'), tr = document.createElement('tr'), names = e.patterns.map(p => p.name).join(', '), type = e.patterns.some(p => p.type === 'bullish') ? 'signal-value-buy' : e.patterns.some(p => p.type === 'bearish') ? 'signal-value-sell' : 'signal-value-neutral'; tr.innerHTML = `<td class="signal-table-cell">Patterns</td><td class="signal-table-cell ${type}">${names}</td><td class="signal-table-cell">${e.patterns.map(p => p.desc).join(' ')}</td>`; tbody?.appendChild(tr); }
                if (signalResult.backtest && !signalResult.backtest.error) { const bt = signalResult.backtest, tbody = clone.querySelector('tbody'), tr = document.createElement('tr'), botPct = parseFloat(bt.botReturn), holdPct = parseFloat(bt.buyHoldReturn); tr.innerHTML = `<td class="signal-table-cell">Simulation<br><small style="opacity:0.7">Signal Bot</small></td><td class="signal-table-cell ${botPct >= 0 ? 'signal-value-buy' : 'signal-value-sell'}"><strong>${botPct >= 0 ? '+' : ''}${bt.botReturn}%</strong><br><small>${bt.winningTrades}/${bt.totalTrades} gagnés</small></td><td class="signal-table-cell">${botPct > holdPct ? '✅ Bat marché' : '❌ Sous-perf'}<br><small>Marché: ${holdPct >= 0 ? '+' : ''}${bt.buyHoldReturn}%</small></td>`; tbody?.appendChild(tr); }
                expContent.appendChild(clone);
            }
        }
    }
    cursor.classList.add('animated'); setTimeout(() => cursor.classList.remove('animated'), 1200);
}

function updateSignal(symbol, data, options = {}) {
    const volume = data?.volumes?.[data.volumes.length - 1] || data?.volume || 0, changePercent = data?.changePercent || 0, timestamps = data?.timestamps || [], lastTs = timestamps.length > 0 ? Math.max(...timestamps) : 0, now = Math.floor(Date.now() / 1000), daysSince = lastTs > 0 ? (now - lastTs) / 86400 : 0;
    const noActivity = volume === 0 && Math.abs(changePercent) < 0.001, isSuspended = (noActivity && daysSince > 3) || daysSince > 7;
    if (isSuspended) { const r = { symbol, signalValue: 50, signalTitle: 'Suspendu', signalDesc: 'Cotation suspendue', isClosed: true, isSuspended: true }; updateSignalUI(symbol, r); return r; }
    const result = calculateBotSignal({ ...data, symbol }, options);
    try { result.backtest = runBacktest(data, options); } catch (e) {}
    updateSignalUI(symbol, result);
    return result;
}

function runBacktest(data, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options, maxPosition: 1.0 };
    const rawP = safe(data.prices), rawH = safe(data.highs || rawP), rawL = safe(data.lows || rawP), rawO = safe(data.opens || rawP), rawV = safe(data.volumes), rawT = safe(data.timestamps || []);
    const validIdx = rawP.map((p, i) => p > 0 && rawH[i] > 0 && rawL[i] > 0 ? i : -1).filter(i => i >= 0);
    if (validIdx.length < opts.minLength) return { error: 'Données insuffisantes.' };
    const prices = validIdx.map(i => rawP[i]), highs = validIdx.map(i => rawH[i]), lows = validIdx.map(i => rawL[i]), opens = validIdx.map(i => rawO[i]), volumes = validIdx.map(i => rawV[i]), timestamps = rawT.length ? validIdx.map(i => rawT[i]) : [], len = prices.length;
    const startIdx = Math.min(200, Math.max(50, Math.floor(len * 0.1)));
    if (len <= startIdx + 10) return { error: 'Période trop courte.' };

    const calcSMA = (p, n) => { const r = new Float32Array(len); let s = 0; for (let i = 0; i < len; i++) { s += p[i]; if (i >= n) s -= p[i - n]; if (i >= n - 1) r[i] = s / n; } return r; };
    const calcRSI = (p, n) => { const r = new Float32Array(len).fill(50); let g = 0, l = 0; for (let i = 1; i < len; i++) { const d = p[i] - p[i - 1]; if (i <= n) { if (d > 0) g += d; else l -= d; if (i === n) { g /= n; l /= n; } } else { g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n; } if (i >= n) r[i] = 100 - (100 / (1 + (l === 0 ? 100 : g / l))); } return r; };
    const calcMACD = p => { const h = new Float32Array(len); let e12 = p[0], e26 = p[0], e9 = 0; for (let i = 0; i < len; i++) { e12 = p[i] * 0.1538 + e12 * 0.8462; e26 = p[i] * 0.0741 + e26 * 0.9259; const line = e12 - e26; e9 = i === 0 ? line : line * 0.2 + e9 * 0.8; h[i] = line - e9; } return h; };
    const calcATR = (h, l, c, n) => { const r = new Float32Array(len); let v = 0; for (let i = 1; i < len; i++) { const tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])); if (i <= n) { if (i === n) v = tr / n; else v += tr / n; } else v = (v * (n - 1) + tr) / n; r[i] = v; } return r; };

    const sma20 = calcSMA(prices, 20), sma50 = calcSMA(prices, 50), sma200 = calcSMA(prices, 200), rsi14 = calcRSI(prices, 14), macdH = calcMACD(prices), atr14 = calcATR(highs, lows, prices, 14);
    const mom = new Float32Array(len), vr = new Float32Array(len).fill(1);
    for (let i = 10; i < len; i++) if (prices[i - 10] !== 0) mom[i] = ((prices[i] - prices[i - 10]) / prices[i - 10]) * 100;
    for (let i = 20; i < len; i++) { let s = 0; for (let j = 0; j < 20; j++) s += volumes[i - j]; vr[i] = s > 0 ? volumes[i] / (s / 20) : 1; }

    const startP = prices[startIdx], initial = startP;
    let capital = initial, position = null, fees = 0, prev = 0;
    const trades = [], eq = [];

    for (let i = startIdx; i < len; i++) {
        const p = prices[i], ts = timestamps.length > i ? timestamps[i] : i;
        if (position) {
            let exit = null;
            if (position.type === 'long') { if (lows[i] <= position.sl) exit = position.sl; else if (highs[i] >= position.tp) exit = position.tp; }
            else { if (highs[i] >= position.sl) exit = position.sl; else if (lows[i] <= position.tp) exit = position.tp; }
            if (exit) { const pnl = (position.type === 'long' ? exit - position.entry : position.entry - exit) * position.size, cost = exit * position.size * opts.transactionCost; capital += pnl - cost; fees += cost + position.cost; trades.push({ pnl: pnl - cost }); position = null; }
        }
        if (!position) {
            let ps = 0, bullish = false, bearish = false;
            const body = Math.abs(prices[i] - opens[i]), range = highs[i] - lows[i];
            if (range > 0) { const ls = Math.min(opens[i], prices[i]) - lows[i], us = highs[i] - Math.max(opens[i], prices[i]); if (ls > 2 * body && us < body) { if (prices[i - 1] < opens[i - 1]) { bullish = true; ps += 0.6; } else { bearish = true; ps -= 0.6; } } const pb = Math.abs(prices[i - 1] - opens[i - 1]); if (body > pb) { if (prices[i] > opens[i] && prices[i - 1] < opens[i - 1]) { bullish = true; ps += 0.8; } else if (prices[i] < opens[i] && prices[i - 1] > opens[i - 1]) { bearish = true; ps -= 0.8; } } }
            const rsiS = clamp((rsi14[i] - 50) / 20, -1, 1), macdS = clamp(macdH[i], -1, 1), smaS = (p > sma20[i] ? 0.5 : -0.5) + (p > sma50[i] ? 0.3 : -0.3) + (p > sma200[i] ? 0.2 : -0.2);
            let score = rsiS * 0.2 + macdS * 0.25 + smaS * 0.25 + clamp(mom[i] / 5, -1, 1) * 0.1 + clamp(ps, -1, 1) * 0.2;
            const smoothed = prev * 0.85 + score * 0.15; prev = smoothed;
            const signal = 50 + clamp(smoothed, -1, 1) * 50;
            let type = null; if (signal >= 65 || (signal >= 55 && bullish)) type = 'long'; else if (signal <= 35 || (signal <= 45 && bearish)) type = 'short';
            if (type) { const a = atr14[i] || p * 0.01, slD = a * opts.slMult, tpD = a * opts.tpMult, sl = type === 'long' ? p - slD : p + slD, tp = type === 'long' ? p + tpD : p - tpD, risk = Math.abs(p - sl), size = Math.min((capital * opts.accountRisk) / risk, (capital * opts.maxPosition) / p); if (size > 0.000001) position = { type, entry: p, size, sl, tp, cost: size * p * opts.transactionCost }; }
        }
        eq.push({ ts, equity: capital });
    }

    const win = trades.filter(t => t.pnl > 0).length, endP = prices[len - 1];
    return { startPrice: startP, endPrice: endP, initialCapital: initial, finalCapital: capital, totalPnl: trades.reduce((a, t) => a + t.pnl, 0), totalFees: fees, totalTrades: trades.length, winningTrades: win, winRate: (trades.length > 0 ? (win / trades.length) * 100 : 0).toFixed(2), equityCurve: eq, botReturn: (((capital - initial) / initial) * 100).toFixed(2), buyHoldReturn: (((endP - startP) / startP) * 100).toFixed(2) };
}

export { calculateBotSignal, updateSignal, updateSignalUI, runBacktest, SIGNAL_HISTORY, rsi, ema, atr, adx, computeStops, positionSize };