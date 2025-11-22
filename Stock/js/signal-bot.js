const SIGNAL_HISTORY = [];

const DEFAULT_OPTIONS = {
  accountCapital: 10000,
  accountRisk: 0.02,
  maxPosition: 0.2,
  slMult: 1.8,
  tpMult: 3.0,
  transactionCost: 0.0015,
  minLength: 30,
  weights: { rsi: 0.20, macd: 0.25, sma: 0.25, adx: 0.15, momentum: 0.10, volume: 0.05 }
};

const safe = arr => Array.isArray(arr) ? arr : [];

function validate(data, opts = {}) {
  if (!data) return false;
  const p = safe(data.prices);
  const min = Math.max(30, opts.minLength || 30);
  return p.length >= min && p.every(x => x > 0);
}

function rsi(prices, period = 14) {
  const p = safe(prices);
  if (p.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = p[i] - p[i - 1];
    d > 0 ? gain += d : loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
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

function sma(prices, period) {
  const p = safe(prices);
  if (p.length === 0) return 0;
  if (p.length < period) return p.reduce((a, b) => a + b, 0) / p.length;
  return p.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function macd(prices, fast = 12, slow = 26, signal = 9) {
  const p = safe(prices);
  if (p.length < slow) return { line: 0, signal: 0, hist: 0, series: [] };
  const kf = 2 / (fast + 1), ks = 2 / (slow + 1);
  let ef = p.length >= fast ? p.slice(0, fast).reduce((a, b) => a + b, 0) / fast : p[0];
  let es = p.length >= slow ? p.slice(0, slow).reduce((a, b) => a + b, 0) / slow : p[0];
  const series = [];
  for (let i = 1; i < p.length; i++) {
    ef = p[i] * kf + ef * (1 - kf);
    es = p[i] * ks + es * (1 - ks);
    if (i >= slow - 1) series.push(ef - es);
  }
  const line = series[series.length - 1];
  const sig = ema(series, signal);
  return { line, signal: sig, hist: line - sig, series };
}

function atr(highs, lows, closes, period = 14) {
  const h = safe(highs), l = safe(lows), c = safe(closes);
  const n = Math.min(h.length, l.length, c.length);
  if (n < 2) return 0;
  const tr = [];
  for (let i = 1; i < n; i++) {
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  if (tr.length < period) return tr.reduce((a, b) => a + b, 0) / tr.length;
  let a = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) a = (a * (period - 1) + tr[i]) / period;
  return a;
}

function adx(highs, lows, closes, period = 14) {
  const h = safe(highs), l = safe(lows), c = safe(closes);
  const n = Math.min(h.length, l.length, c.length);
  if (n < period + 1) return 0;
  const tr = [], pdm = [], ndm = [];
  for (let i = 1; i < n; i++) {
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    const hd = h[i] - h[i - 1], ld = l[i - 1] - l[i];
    pdm.push(hd > ld && hd > 0 ? hd : 0);
    ndm.push(ld > hd && ld > 0 ? ld : 0);
  }
  const smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  const smoothPDM = pdm.slice(0, period).reduce((a, b) => a + b, 0);
  const smoothNDM = ndm.slice(0, period).reduce((a, b) => a + b, 0);
  let str = smoothTR, spdm = smoothPDM, sndm = smoothNDM;
  const dx = [];
  for (let i = period; i < tr.length; i++) {
    str = str - str / period + tr[i];
    spdm = spdm - spdm / period + pdm[i];
    sndm = sndm - sndm / period + ndm[i];
    const pdi = 100 * spdm / str, ndi = 100 * sndm / str;
    dx.push(100 * Math.abs(pdi - ndi) / (pdi + ndi || 1));
  }
  return dx.length > 0 ? dx.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, dx.length) : 0;
}

function momentum(prices, period = 10) {
  const p = safe(prices);
  if (p.length < period + 1) return 0;
  const prev = p[p.length - period - 1];
  return prev === 0 ? 0 : ((p[p.length - 1] - prev) / prev) * 100;
}

function volumeRatio(volumes, period = 20) {
  const v = safe(volumes);
  if (v.length < 2) return 1;
  const recent = v[v.length - 1];
  const avg = v.slice(-Math.min(period, v.length)).reduce((a, b) => a + b, 0) / Math.min(period, v.length);
  return avg === 0 ? 1 : recent / avg;
}

function stdDev(values, period = 20) {
  const v = safe(values);
  if (v.length < 2) return 0;
  const slice = v.slice(-Math.min(period, v.length));
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
  return Math.sqrt(variance);
}

function divergence(prices, indicator, lookback = 14) {
  const p = safe(prices), ind = safe(indicator);
  const n = Math.min(p.length, ind.length);
  if (n < lookback + 2) return 0;
  const w = 3, minGap = 5;
  const indRange = Math.max(...ind.slice(-lookback)) - Math.min(...ind.slice(-lookback));
  const threshold = indRange * 0.03;
  const isPeak = (arr, i) => {
    if (i - w < 0 || i + w >= arr.length) return false;
    const left = Math.max(...arr.slice(i - w, i));
    const right = Math.max(...arr.slice(i + 1, i + 1 + w));
    return arr[i] > left && arr[i] > right && arr[i] - Math.max(left, right) >= threshold;
  };
  const isTrough = (arr, i) => {
    if (i - w < 0 || i + w >= arr.length) return false;
    const left = Math.min(...arr.slice(i - w, i));
    const right = Math.min(...arr.slice(i + 1, i + 1 + w));
    return arr[i] < left && arr[i] < right && Math.min(left, right) - arr[i] >= threshold;
  };
  const pPeaks = [], pTroughs = [], iPeaks = [], iTroughs = [];
  for (let i = w; i < n - w; i++) {
    if (isPeak(p, i) && i >= n - lookback) pPeaks.push({ i, v: p[i] });
    if (isTrough(p, i) && i >= n - lookback) pTroughs.push({ i, v: p[i] });
    if (isPeak(ind, i) && i >= n - lookback) iPeaks.push({ i, v: ind[i] });
    if (isTrough(ind, i) && i >= n - lookback) iTroughs.push({ i, v: ind[i] });
  }
  const indStd = stdDev(ind, lookback) || 1;
  if (pPeaks.length >= 2 && iPeaks.length >= 2) {
    const pp1 = pPeaks[pPeaks.length - 1], pp2 = pPeaks[pPeaks.length - 2];
    const ip1 = iPeaks[iPeaks.length - 1], ip2 = iPeaks[iPeaks.length - 2];
    if (Math.abs(pp1.i - pp2.i) >= minGap && pp1.v > pp2.v && ip1.v < ip2.v) {
      return -Math.min(0.5, (ip2.v - ip1.v) / indStd);
    }
  }
  if (pTroughs.length >= 2 && iTroughs.length >= 2) {
    const pt1 = pTroughs[pTroughs.length - 1], pt2 = pTroughs[pTroughs.length - 2];
    const it1 = iTroughs[iTroughs.length - 1], it2 = iTroughs[iTroughs.length - 2];
    if (Math.abs(pt1.i - pt2.i) >= minGap && pt1.v < pt2.v && it1.v > it2.v) {
      return Math.min(0.5, (it1.v - it2.v) / indStd);
    }
  }
  return 0;
}

function rsiSeries(prices, period = 14) {
  const p = safe(prices);
  const res = new Array(p.length).fill(50);
  if (p.length < period + 1) return res;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = p[i] - p[i - 1];
    d > 0 ? gain += d : loss -= d;
  }
  gain /= period;
  loss /= period;
  res[period] = 100 - (100 / (1 + (loss === 0 ? 100 : gain / loss)));
  for (let i = period + 1; i < p.length; i++) {
    const d = p[i] - p[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
    res[i] = 100 - (100 / (1 + (loss === 0 ? 100 : gain / loss)));
  }
  return res;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalize(indicator, value, invert = false) {
  const ranges = {
    rsi: [30, 70],
    adx: [20, 40],
    momentum: [-5, 5],
    volume: [0.7, 1.5]
  };
  const [low, high] = ranges[indicator] || [0, 100];
  const mid = (low + high) / 2;
  const range = (high - low) / 2;
  let norm = (value - mid) / range;
  if (invert) norm = -norm;
  return clamp(norm, -1, 1);
}

function marketRegime(adxVal, volMult) {
  if (adxVal < 20) return { type: 'range', filter: 0.5 };
  if (adxVal > 40) return { type: 'strong_trend', filter: 1.2 };
  if (volMult > 1.5) return { type: 'high_vol', filter: 0.7 };
  return { type: 'normal', filter: 1.0 };
}

function computeStops(price, atr, direction, regime, slMult, tpMult) {
  const regimeAdj = regime.type === 'high_vol' ? 1.3 : regime.type === 'range' ? 0.8 : 1.0;
  const sl = price - direction * slMult * atr * regimeAdj;
  const tp = price + direction * tpMult * atr * regimeAdj;
  return { sl: Math.max(0.01, sl), tp: Math.max(0.01, tp) };
}

function positionSize(signal, price, sl, regime, capital, risk, maxPos, txCost) {
  const target = (signal - 50) / 50;
  const direction = Math.sign(target) || 1;
  const riskPerUnit = Math.abs(price - sl);
  if (!price || riskPerUnit <= 0) return 0;
  const netRisk = risk - txCost;
  const riskAmount = capital * netRisk;
  const units = Math.floor(riskAmount / riskPerUnit);
  const posValue = units * price;
  let posPct = posValue / capital;
  posPct *= regime.filter;
  return clamp(posPct, 0, maxPos) * direction;
}

function composite(parts, weights) {
  let sum = 0, wsum = 0;
  for (const k in weights) {
    if (parts[k] !== undefined) {
      sum += parts[k] * weights[k];
      wsum += weights[k];
    }
  }
  return wsum === 0 ? 0 : sum / wsum;
}

function smooth(value, prev, alpha = 0.15) {
  return typeof prev === 'number' ? prev * (1 - alpha) + value * alpha : value;
}

function recordSignal(symbol, result) {
  SIGNAL_HISTORY.push({ ts: Date.now(), symbol, result });
  if (SIGNAL_HISTORY.length > 5000) SIGNAL_HISTORY.shift();
}

function calculateBotSignal(data, options = {}) {
  options = { ...DEFAULT_OPTIONS, ...options };
  
  if (!validate(data, options)) {
    const prices = safe(data.prices);
    let reason = 'Données insuffisantes ou invalides.';
    if (prices.length < 30) reason = `Minimum 30 points requis, ${prices.length} reçus.`;
    else if (prices.some(p => p <= 0)) reason = 'Prix invalides détectés (≤ 0).';
    return {
      signalValue: 50,
      signalTitle: 'Garder',
      signalDesc: 'Données insuffisantes',
      explanation: 'Données insuffisantes',
      insufficientReason: reason,
      details: {}
    };
  }

  const symbol = data.symbol || options.symbol || 'UNKNOWN';
  const price = data.price || safe(data.prices).slice(-1)[0] || 0;
  const vols = safe(data.volumes);
  const highs = safe(data.highs || data.prices);
  const lows = safe(data.lows || data.prices);
  const closes = safe(data.prices);
  const shortPrices = closes;
  const longPrices = safe(data.longPrices || closes);

  const rsiShort = rsi(shortPrices, 14);
  const rsiLong = rsi(longPrices, 50);
  const macdShort = macd(shortPrices);
  const macdLong = macd(longPrices);
  const sma20 = sma(shortPrices, 20);
  const sma50 = sma(longPrices, 50);
  const sma200 = sma(longPrices, 200);
  const mom = momentum(shortPrices, 10);
  const volRatio = volumeRatio(vols, 20);
  const atrVal = atr(highs, lows, closes, 14);
  const adxVal = adx(highs, lows, closes, 14);
  const std = stdDev(shortPrices, 20);
  const volMult = atrVal / (price || 1);
  const regime = marketRegime(adxVal, volMult);

  const divMACD = divergence(shortPrices, macdShort.series, 14);
  const divRSI = divergence(shortPrices, rsiSeries(shortPrices), 14);

  const rsiScore = normalize('rsi', rsiShort, true) * 0.7 + normalize('rsi', rsiLong, true) * 0.3;
  const macdScore = clamp(macdShort.hist / (std || 1), -1, 1) * 0.7 + clamp(macdLong.hist / (std || 1), -1, 1) * 0.3;
  const smaScore = clamp((price - sma20) / (sma20 || 1) * 10, -1, 1) * 0.5 +
                   clamp((price - sma50) / (sma50 || 1) * 10, -1, 1) * 0.3 +
                   clamp((price - sma200) / (sma200 || 1) * 10, -1, 1) * 0.2;
  const adxScore = normalize('adx', adxVal);
  const momScore = normalize('momentum', mom);
  const volScore = normalize('volume', volRatio);

  const parts = {
    rsi: rsiScore,
    macd: macdScore,
    sma: smaScore,
    adx: adxScore,
    momentum: momScore,
    volume: volScore
  };

  let score = composite(parts, options.weights);
  score += 0.25 * (divMACD + divRSI);
  score *= regime.filter;
  
  const smoothed = smooth(score, options.prevSmoothed, 0.15);
  const final = clamp(smoothed, -1, 1);
  const signal = Math.round(50 + final * 50);
  const direction = Math.sign(final) || 1;
  
  const stops = computeStops(price, atrVal, direction, regime, options.slMult, options.tpMult);
  const posSize = positionSize(signal, price, stops.sl, regime, options.accountCapital, options.accountRisk, options.maxPosition, options.transactionCost);

  let title = 'Garder', desc = 'Position neutre';
  if (signal >= 80) { title = 'Acheter'; desc = 'Achat très fort'; }
  else if (signal >= 65) { title = 'Acheter'; desc = 'Achat confirmé'; }
  else if (signal >= 55) { title = 'Acheter'; desc = 'Achat modéré'; }
  else if (signal <= 20) { title = 'Vendre'; desc = 'Vente forte'; }
  else if (signal <= 35) { title = 'Vendre'; desc = 'Vente confirmée'; }
  else if (signal <= 45) { title = 'Vendre'; desc = 'Vente modérée'; }

  const explanation = {
    rsi: rsiShort,
    macdHistogram: macdShort.hist,
    sma20, sma50, sma200,
    adx: adxVal,
    momentum: mom,
    volumeRatio: volRatio,
    atr: atrVal,
    stddev: std,
    divergenceMACD: divMACD,
    divergenceRSI: divRSI,
    regime: regime.type,
    regimeFilter: regime.filter,
    weightedScore: score,
    smoothed,
    positionSize: posSize,
    stopLoss: stops.sl,
    takeProfit: stops.tp
  };

  const result = {
    symbol,
    signalValue: signal,
    signalTitle: title,
    signalDesc: desc,
    explanation,
    details: {
      rsi: rsiShort.toFixed(2),
      macd: macdShort.hist.toFixed(4),
      sma20: sma20.toFixed(2),
      sma50: sma50.toFixed(2),
      sma200: sma200.toFixed(2),
      adx: adxVal.toFixed(2),
      momentum: mom.toFixed(2),
      volumeRatio: volRatio.toFixed(2),
      atr: atrVal.toFixed(4),
      regime: regime.type,
      regimeFilter: regime.filter.toFixed(2),
      weightedScore: score.toFixed(4),
      smoothed: smoothed.toFixed(4),
      positionSize: posSize.toFixed(4),
      stopLoss: stops.sl.toFixed(4),
      takeProfit: stops.tp.toFixed(4)
    }
  };

  recordSignal(symbol, result);
  return result;
}

function updateSignalUI(symbol, signalResult) {
  const cursor = document.getElementById(`signal-cursor-${symbol}`);
  const container = document.querySelector(`#card-${symbol} .signal-state-container`);
  const title = document.querySelector(`#card-${symbol} .signal-state-title`);
  const description = document.querySelector(`#card-${symbol} .signal-state-description`);
  if (!cursor || !container || !title || !description) return;

  cursor.style.left = `${signalResult.signalValue}%`;
  
  const stateClass = signalResult.signalDesc === 'Données insuffisantes' ? 'insufficient-state' :
                     signalResult.signalTitle === 'Acheter' ? 'buy-state' :
                     signalResult.signalTitle === 'Vendre' ? 'sell-state' : '';
  container.className = `signal-state-container ${stateClass}`;

  const period = window.positions?.[symbol]?.currentPeriod || '1D';
  title.textContent = signalResult.signalDesc;

  if (signalResult.signalDesc === 'Données insuffisantes') {
    description.textContent = signalResult.insufficientReason || `Données insuffisantes pour ${period}.`;
  } else {
    const advice = {
      'Achat très fort': 'acheter maintenant avec allocation importante selon votre gestion du risque.',
      'Achat confirmé': 'prendre position selon votre plan de trading.',
      'Achat modéré': 'entrer progressivement et surveiller le signal.',
      'Position neutre': 'attendre une confirmation avant d\'agir.',
      'Vente modérée': 'prendre des bénéfices partiels ou réduire l\'exposition.',
      'Vente confirmée': 'réduire significativement la position.',
      'Vente forte': 'vendre et envisager des couvertures.'
    }[signalResult.signalDesc] || 'surveiller et agir selon votre plan.';
    description.textContent = `Conseillé : ${advice}`;
  }

  const card = document.querySelector(`#card-${symbol}`);
  if (card) {
    const labels = card.querySelector('.signal-labels');
    const bar = card.querySelector('.signal-bar');
    const hide = signalResult.signalDesc === 'Données insuffisantes';
    labels?.classList.toggle('hidden-by-bot', hide);
    bar?.classList.toggle('hidden-by-bot', hide);
  }

  const expSection = document.querySelector(`#card-${symbol} .signal-explanation`);
  const expContent = document.querySelector(`#card-${symbol} .explanation-content`);
  
  if (expSection && expContent) {
    if (signalResult.signalDesc === 'Données insuffisantes') {
      expSection.classList.add('hidden-by-bot');
    } else {
      expSection.classList.remove('hidden-by-bot');
      const e = signalResult.explanation;
      
      const getColor = (indicator, val) => {
        const ranges = {
          rsi: { buy: v => v < 30, sell: v => v > 70 },
          macd: { buy: v => v > 0.001, sell: v => v < -0.001 },
          adx: { buy: v => v > 25, sell: v => v < 20 },
          momentum: { buy: v => v > 1, sell: v => v < -1 },
          volume: { buy: v => v > 1.5, sell: v => v < 0.7 },
          atr: { buy: v => v < 0.3, sell: v => v > 3 },
          smoothed: { buy: v => v > 0.3, sell: v => v < -0.3 },
          positionSize: { buy: v => v > 0.2, sell: v => v < 0.03 }
        };
        const r = ranges[indicator];
        return r ? (r.buy(val) ? 'signal-value-buy' : r.sell(val) ? 'signal-value-sell' : 'signal-value-neutral') : 'signal-value-neutral';
      };

      const getDesc = (indicator, val) => {
        const descs = {
          rsi: v => v < 30 ? 'Survendu — rebond possible.' : v > 70 ? 'Suracheté — correction possible.' : 'Neutre.',
          macd: v => v > 0.001 ? 'Pression acheteuse.' : v < -0.001 ? 'Pression vendeuse.' : 'Peu significatif.',
          adx: v => v > 40 ? 'Tendance très forte.' : v > 25 ? 'Tendance confirmée.' : v < 20 ? 'Marché en range.' : 'Tendance faible.',
          sma: (s20, s50, s200) => s20 > s50 && s50 > s200 ? 'Tendance haussière confirmée.' : s20 < s50 && s50 < s200 ? 'Tendance baissière confirmée.' : 'Indécise.',
          momentum: v => v > 1 ? 'Accélération haussière.' : v < -1 ? 'Accélération baissière.' : 'Faible.',
          volume: v => v > 1.5 ? 'Volume élevé — signaux fiables.' : v < 0.7 ? 'Volume faible — prudence.' : 'Normal.',
          atr: v => v > 3 ? 'Volatilité élevée — risque accru.' : v < 0.3 ? 'Faible volatilité.' : 'Modérée.',
          regime: type => ({ range: 'Marché en range — attendre les cassures.', strong_trend: 'Tendance forte — suivre la direction.', high_vol: 'Haute volatilité — réduire les positions.', normal: 'Conditions normales.' })[type] || 'Normal.',
          smoothed: v => v > 0.3 ? 'Signal haussier fort.' : v < -0.3 ? 'Signal baissier fort.' : 'Neutre.',
          positionSize: v => v > 0.2 ? 'Position importante.' : v < 0.03 ? 'Position minimale.' : 'Taille normale.'
        };
        return descs[indicator] ? descs[indicator](val) : '';
      };

      expContent.innerHTML = '';
      const tpl = document.getElementById('signal-explanation-table-template');
      if (tpl) {
        const clone = tpl.content.cloneNode(true);
        const set = (sel, val, color) => {
          const el = clone.querySelector(sel);
          if (el) {
            el.textContent = val;
            if (color) {
              el.classList.remove('signal-value-buy', 'signal-value-sell', 'signal-value-neutral');
              el.classList.add(color);
            }
          }
        };

        set('.rsi-value', e.rsi.toFixed(2), getColor('rsi', e.rsi));
        set('.macd-value', e.macdHistogram.toFixed(4), getColor('macd', e.macdHistogram));
        set('.sma20-value', e.sma20.toFixed(2));
        set('.sma50-value', e.sma50.toFixed(2));
        set('.sma200-value', e.sma200.toFixed(2));
        set('.adx-value', e.adx.toFixed(2), getColor('adx', e.adx));
        set('.momentum-value', `${e.momentum.toFixed(2)}%`, getColor('momentum', e.momentum));
        set('.volume-value', e.volumeRatio.toFixed(2), getColor('volume', e.volumeRatio));
        set('.atr-value', e.atr.toFixed(4), getColor('atr', e.atr));
        set('.regime-value', e.regime);
        set('.volatility-multiplier-value', e.regimeFilter.toFixed(2));
        set('.smoothed-value', e.smoothed.toFixed(4), getColor('smoothed', e.smoothed));
        set('.position-size-value', `${(e.positionSize * 100).toFixed(2)}%`, getColor('positionSize', e.positionSize));
        set('.stop-loss-value', e.stopLoss.toFixed(4));
        set('.take-profit-value', e.takeProfit.toFixed(4));

        const setDesc = (sel, txt) => {
          const el = clone.querySelector(sel);
          if (el) el.textContent = txt;
        };

        setDesc('.rsi-desc', getDesc('rsi', e.rsi));
        setDesc('.macd-desc', getDesc('macd', e.macdHistogram));
        setDesc('.sma20-desc', getDesc('sma', e.sma20, e.sma50, e.sma200));
        setDesc('.sma50-desc', getDesc('sma', e.sma20, e.sma50, e.sma200));
        setDesc('.sma200-desc', getDesc('sma', e.sma20, e.sma50, e.sma200));
        setDesc('.adx-desc', getDesc('adx', e.adx));
        setDesc('.momentum-desc', getDesc('momentum', e.momentum));
        setDesc('.volume-desc', getDesc('volume', e.volumeRatio));
        setDesc('.atr-desc', getDesc('atr', e.atr));
        setDesc('.regime-desc', getDesc('regime', e.regime));
        setDesc('.volatility-desc', `Filtre de régime: ${e.regimeFilter.toFixed(2)}x`);
        setDesc('.smoothed-desc', getDesc('smoothed', e.smoothed));
        setDesc('.position-desc', getDesc('positionSize', e.positionSize));
        setDesc('.stop-desc', `Stop Loss: ${e.stopLoss.toFixed(4)}`);
        setDesc('.take-desc', `Take Profit: ${e.takeProfit.toFixed(4)}`);

        expContent.appendChild(clone);
      }
    }
  }

  cursor.classList.add('animated');
  setTimeout(() => cursor.classList.remove('animated'), 1200);
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
  SIGNAL_HISTORY,
  rsi,
  ema,
  atr,
  adx,
  computeStops,
  positionSize
};