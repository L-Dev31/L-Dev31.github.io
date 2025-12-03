const SIGNAL_HISTORY = [];

/**
 * Configuration par défaut du Signal Bot
 * Basé sur les principes mathématiques de l'analyse technique (Investopedia)
 * 
 * Pondérations selon l'importance théorique:
 * - SMA (30%): Tendance long terme - le plus fiable historiquement
 * - MACD (25%): Momentum moyen terme - croisements significatifs
 * - RSI (20%): Oscillateur - meilleur en range (ADX < 25)
 * - Momentum (15%): ROC court terme - confirmation de direction
 * - Volume (10%): Confirmation - valide les mouvements de prix
 */
const DEFAULT_OPTIONS = {
  accountCapital: 10000,
  accountRisk: 0.02,        // 2% risque par trade (règle classique)
  maxPosition: 0.2,         // 20% max du capital par position
  slMult: 1.5,              // Stop Loss = 1.5 × ATR
  tpMult: 2.5,              // Take Profit = 2.5 × ATR (ratio R:R 1:1.67)
  transactionCost: 0.0015,  // 0.15% frais de transaction
  minLength: 30,            // Minimum 30 périodes pour calculs fiables
  weights: { 
    rsi: 0.20,       // RSI: oscillateur classique (Wilder 1978)
    macd: 0.25,      // MACD: momentum trend-following (Appel 1979)
    sma: 0.30,       // SMA: tendance pure, très fiable
    momentum: 0.15,  // ROC: confirmation court terme
    volume: 0.10     // Volume: confirmation des mouvements
  }
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

function detectCandlestickPatterns(opens, highs, lows, closes) {
  const patterns = [];
  if (!opens || opens.length < 2) return patterns;
  const len = closes.length;
  
  const i = len - 1; // Last candle
  const O = opens[i], H = highs[i], L = lows[i], C = closes[i];
  const prevO = opens[i-1], prevH = highs[i-1], prevL = lows[i-1], prevC = closes[i-1];

  const body = Math.abs(C - O);
  const upperShadow = H - Math.max(O, C);
  const lowerShadow = Math.min(O, C) - L;
  const totalRange = H - L;
  
  // Avoid division by zero or invalid data
  if (totalRange === 0) return patterns;

  // Doji
  if (body <= totalRange * 0.1) {
    patterns.push({ name: 'Doji', type: 'neutral', score: 0, desc: 'Indécision du marché.' });
  }

  // Hammer (Bullish) & Hanging Man (Bearish)
  // Small body, long lower shadow, small/no upper shadow
  if (lowerShadow > 2 * body && upperShadow < body) {
    if (prevC < prevO) {
       patterns.push({ name: 'Hammer', type: 'bullish', score: 0.6, desc: 'Rebond potentiel (Haussier).' });
    } else {
       patterns.push({ name: 'Hanging Man', type: 'bearish', score: -0.6, desc: 'Retournement potentiel (Baissier).' });
    }
  }

  // Shooting Star (Bearish) & Inverted Hammer (Bullish)
  // Small body, long upper shadow, small/no lower shadow
  if (upperShadow > 2 * body && lowerShadow < body) {
    if (prevC > prevO) {
      patterns.push({ name: 'Shooting Star', type: 'bearish', score: -0.6, desc: 'Rejet des hauts (Baissier).' });
    } else {
      patterns.push({ name: 'Inverted Hammer', type: 'bullish', score: 0.6, desc: 'Rebond potentiel (Haussier).' });
    }
  }

  // Engulfing
  const prevBody = Math.abs(prevC - prevO);
  if (body > prevBody && body > 0.0001) {
      if (C > O && prevC < prevO && C > prevO && O < prevC) {
          patterns.push({ name: 'Bullish Engulfing', type: 'bullish', score: 0.8, desc: 'Acheteurs prennent le contrôle.' });
      } else if (C < O && prevC > prevO && C < prevO && O > prevC) {
          patterns.push({ name: 'Bearish Engulfing', type: 'bearish', score: -0.8, desc: 'Vendeurs prennent le contrôle.' });
      }
  }

  return patterns;
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

/**
 * Normalise les indicateurs selon les standards mathématiques du marché.
 * Sources: Investopedia, Wilder's "New Concepts in Technical Trading Systems"
 * 
 * RSI: Oscillateur 0-100, zone neutre 30-70 (Wilder, 1978)
 *      <30 = survendu (signal haussier), >70 = suracheté (signal baissier)
 * 
 * Momentum (ROC): Pourcentage de changement, pas de bornes fixes
 *      Dépend de la volatilité du titre (±5% stable, ±15% volatile)
 * 
 * Volume: Ratio vs moyenne, 1.0 = normal
 */
function normalize(indicator, value, invert = false) {
  const ranges = {
    rsi: [30, 70],        // RSI: Wilder standard (période 14)
    momentum: [-15, 15],  // ROC: plage adaptée (voir ROC Investopedia)
    volume: [0.7, 1.5]    // Volume ratio normalisé
  };
  const [low, high] = ranges[indicator] || [0, 100];
  const mid = (low + high) / 2;
  const range = (high - low) / 2;
  let norm = (value - mid) / range;
  if (invert) norm = -norm;
  return clamp(norm, -1, 1);
}

/**
 * Détermine le régime de marché selon l'ADX (Wilder, 1978)
 * Source: Investopedia "Average Directional Index (ADX)"
 * 
 * ADX < 20: Pas de tendance (trendless) - RSI plus fiable
 * ADX 20-25: Tendance émergente - attention
 * ADX > 25: Tendance établie - MACD/SMA plus fiables
 * ADX > 40: Tendance très forte - suivre la tendance
 * ADX > 50: Tendance extrême - attention au retournement
 */
function marketRegime(adxVal, volMult) {
  // ADX < 20 = marché sans tendance (Wilder threshold)
  if (adxVal < 20) return { type: 'range', filter: 0.75 };
  // ADX > 50 = tendance extrême, possible épuisement
  if (adxVal > 50) return { type: 'extreme_trend', filter: 1.1 };
  // ADX > 40 = tendance très forte
  if (adxVal > 40) return { type: 'strong_trend', filter: 1.25 };
  // ADX 25-40 = tendance établie
  if (adxVal >= 25) return { type: 'trending', filter: 1.1 };
  // Volatilité excessive = prudence (ATR > 5% du prix)
  if (volMult > 0.05) return { type: 'high_vol', filter: 0.85 };
  // ADX 20-25 = tendance émergente
  return { type: 'normal', filter: 1.0 };
}

function computeStops(price, atr, direction, regime, slMult, tpMult) {
  const regimeAdj = regime.type === 'high_vol' ? 1.3 : regime.type === 'range' ? 0.8 : 1.0;
  
  // Limiter SL/TP à des pourcentages raisonnables
  const maxSlPct = 0.06; // Max 6% stop loss
  const maxTpPct = 0.10; // Max 10% take profit (ratio 1:1.67 minimum)
  
  let slDist = Math.min(slMult * atr * regimeAdj, price * maxSlPct);
  let tpDist = Math.min(tpMult * atr * regimeAdj, price * maxTpPct);
  
  // Garantir un ratio R:R minimum de 1:1.5
  if (tpDist < slDist * 1.5) {
    tpDist = slDist * 1.5;
  }
  
  const sl = price - direction * slDist;
  const tp = price + direction * tpDist;
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
  const opens = data.opens ? safe(data.opens) : null;
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
  
  const patterns = detectCandlestickPatterns(opens, highs, lows, closes);

  const divMACD = divergence(shortPrices, macdShort.series, 14);
  const divRSI = divergence(shortPrices, rsiSeries(shortPrices), 14);

  /**
   * RSI Score: Wilder's RSI (1978)
   * - Inversé car RSI élevé = suracheté = baissier
   * - RSI 50 = équilibre parfait entre acheteurs/vendeurs
   */
  const rsiScore = normalize('rsi', rsiShort, true) * 0.7 + normalize('rsi', rsiLong, true) * 0.3;
  
  /**
   * MACD Score: Gerald Appel (1979)
   * - Le MACD n'a PAS de niveaux overbought/oversold fixes (Investopedia)
   * - On normalise par rapport à un % du prix (typiquement 0.5-2% est significatif)
   * - Histogramme positif = momentum haussier, négatif = baissier
   */
  const macdPct = price > 0 ? (macdShort.hist / price) * 100 : 0;
  const macdLongPct = price > 0 ? (macdLong.hist / price) * 100 : 0;
  // Normaliser sur une plage de ±2% du prix (typique pour la plupart des actions)
  const macdScore = clamp(macdPct / 2, -1, 1) * 0.7 + clamp(macdLongPct / 2, -1, 1) * 0.3;
  
  // SMA Score: basé sur position relative + alignement des moyennes
  // Position relative (multiplicateur 50 pour plus de sensibilité)
  const sma20Pos = clamp((price - sma20) / (sma20 || 1) * 50, -1, 1);
  const sma50Pos = clamp((price - sma50) / (sma50 || 1) * 50, -1, 1);
  const sma200Pos = clamp((price - sma200) / (sma200 || 1) * 50, -1, 1);
  
  // Bonus pour alignement (SMA20 > SMA50 > SMA200 = bullish)
  const smaAligned = (sma20 > sma50 && sma50 > sma200) ? 0.3 : 
                     (sma20 < sma50 && sma50 < sma200) ? -0.3 : 0;
  
  // Score combiné : 50% position + 30% alignement + 20% position longue terme
  const smaScore = clamp(sma20Pos * 0.4 + sma50Pos * 0.2 + sma200Pos * 0.1 + smaAligned, -1, 1);
  
  /**
   * ADX Multiplier (Wilder, 1978)
   * L'ADX mesure UNIQUEMENT la force de tendance, PAS la direction.
   * Source: Investopedia "The ADX identifies a strong trend when ADX is over 25"
   * 
   * < 20: Pas de tendance → réduire confiance dans signaux directionnels
   * 20-25: Tendance émergente → confiance normale
   * 25-40: Tendance établie → augmenter confiance
   * > 40: Tendance forte → haute confiance mais attention à l'épuisement
   */
  const adxMultiplier = adxVal < 20 ? 0.8 : 
                        adxVal < 25 ? 0.9 + (adxVal - 20) * 0.02 :
                        adxVal < 40 ? 1.0 + (adxVal - 25) * 0.015 :
                        1.2 + Math.min((adxVal - 40) * 0.005, 0.1); // Cap à 1.3
  
  const momScore = normalize('momentum', mom);
  const volScore = normalize('volume', volRatio);

  const parts = {
    rsi: rsiScore,
    macd: macdScore,
    sma: smaScore,
    momentum: momScore,
    volume: volScore
  };

  let score = composite(parts, options.weights);
  
  // Appliquer le multiplicateur ADX (force de tendance)
  score *= adxMultiplier;
  
  // Ajouter les divergences (signaux de retournement)
  score += 0.2 * (divMACD + divRSI);
  
  if (patterns.length > 0) {
      const patternScore = patterns.reduce((acc, p) => acc + p.score, 0);
      score += 0.2 * clamp(patternScore, -1, 1);
  }

  score *= regime.filter;
  
  /**
   * PROTECTION CONTRE LES EXTRÊMES (Investopedia RSI/Momentum standards)
   * 
   * RSI: 70/30 = overbought/oversold standards (Wilder)
   *      80/20 = extrême, forte probabilité de retournement
   *      En tendance forte (ADX > 40), le RSI peut rester extrême longtemps
   * 
   * Momentum (ROC): Pas de seuils universels selon Investopedia
   *      Dépend de la volatilité historique du titre
   *      On utilise 20% comme seuil raisonnable pour la plupart des actions
   */
  
  // RSI extrême - mais en tendance forte, ne pas trop pénaliser
  const rsiProtectionFactor = adxVal > 40 ? 0.3 : 0.6; // Moins de protection en forte tendance
  
  if (rsiShort > 75 && score > 0) {
    // RSI suracheté (>75) + signal haussier = prudence
    const overboughtPenalty = Math.min((rsiShort - 70) / 30, 1); // 0 à 1
    score *= (1 - overboughtPenalty * rsiProtectionFactor);
  } else if (rsiShort < 25 && score < 0) {
    // RSI survendu (<25) + signal baissier = prudence
    const oversoldPenalty = Math.min((30 - rsiShort) / 30, 1);
    score *= (1 - oversoldPenalty * rsiProtectionFactor);
  }
  
  // Momentum extrême - seuil adaptatif selon volatilité (approximé par ATR)
  const momThreshold = Math.max(15, volMult * 400); // Plus volatile = seuil plus haut
  if (Math.abs(mom) > momThreshold) {
    // Momentum extrême = attention au retournement
    score *= 0.85;
  }
  
  const smoothed = smooth(score, options.prevSmoothed, 0.15);
  const final = clamp(smoothed, -1, 1);
  const signal = Math.round(50 + final * 50);
  const direction = Math.sign(final) || 1;
  
  const stops = computeStops(price, atrVal, direction, regime, options.slMult, options.tpMult);
  const posSize = positionSize(signal, price, stops.sl, regime, options.accountCapital, options.accountRisk, options.maxPosition, options.transactionCost);

  let title = 'Garder', desc = 'Position neutre';
  let warning = null;
  
  // Avertissements pour conditions extrêmes
  if (rsiShort > 80) warning = '⚠️ RSI suracheté';
  else if (rsiShort < 20) warning = '⚠️ RSI survendu';
  if (Math.abs(mom) > 30) warning = (warning ? warning + ' | ' : '') + '⚠️ Momentum extrême';
  
  if (signal >= 80) { title = 'Acheter'; desc = 'Achat très fort'; }
  else if (signal >= 65) { title = 'Acheter'; desc = 'Achat confirmé'; }
  else if (signal >= 55) { title = 'Acheter'; desc = 'Achat modéré'; }
  else if (signal <= 20) { title = 'Vendre'; desc = 'Vente forte'; }
  else if (signal <= 35) { title = 'Vendre'; desc = 'Vente confirmée'; }
  else if (signal <= 45) { title = 'Vendre'; desc = 'Vente modérée'; }
  
  // Ajouter l'avertissement au titre si présent
  if (warning) desc += ` (${warning})`;

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
    patterns: patterns,
    regime: regime.type,
    regimeFilter: regime.filter,
    weightedScore: score,
    smoothed,
    positionSize: Math.abs(posSize),
    positionDirection: posSize >= 0 ? 'long' : 'short',
    stopLoss: stops.sl,
    takeProfit: stops.tp,
    currentPrice: price
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
      
      /**
       * Couleurs selon les seuils mathématiques standards (Investopedia)
       * RSI: <30 = buy (survendu), >70 = sell (suracheté)
       * MACD: positif = buy, négatif = sell
       * ADX: >25 = signal fort (mais pas directionnel)
       */
      const getColor = (indicator, val) => {
        const ranges = {
          rsi: { buy: v => v < 30, sell: v => v > 70 },  // Wilder standard
          macd: { buy: v => v > 0, sell: v => v < 0 },   // Direction du momentum
          adx: { buy: v => v > 25, sell: () => false },  // Force seulement
          momentum: { buy: v => v > 5, sell: v => v < -5 },
          volume: { buy: v => v > 1.5, sell: v => v < 0.7 },
          atr: { buy: () => false, sell: () => false },  // Volatilité, pas direction
          smoothed: { buy: v => v > 0.1, sell: v => v < -0.1 },
          positionSize: { buy: v => v > 0.1, sell: v => v < -0.1 }
        };
        const r = ranges[indicator];
        return r ? (r.buy(val) ? 'signal-value-buy' : r.sell(val) ? 'signal-value-sell' : 'signal-value-neutral') : 'signal-value-neutral';
      };

      /**
       * Descriptions selon les règles mathématiques du marché (Investopedia)
       */
      const getDesc = (indicator, ...args) => {
        const descs = {
          // RSI: Wilder (1978) - 30/70 sont les seuils standards
          rsi: v => v < 30 ? 'Survendu — opportunité achat.' : 
                    v < 40 ? 'Zone basse — surveiller.' : 
                    v > 70 ? 'Suracheté — prendre profits.' : 
                    v > 60 ? 'Zone haute — attention.' : 
                    'Équilibre (zone 40-60).',
          // MACD: Appel (1979) - pas de niveaux absolus, relatif au prix
          macd: (v, price) => {
            const pct = price > 0 ? Math.abs(v / price * 100) : Math.abs(v);
            const dir = v > 0 ? 'haussier' : 'baissier';
            if (pct > 3) return `Momentum ${dir} très fort.`;
            if (pct > 1) return `Momentum ${dir} marqué.`;
            if (pct > 0.3) return `Légère pression ${dir}e.`;
            return 'Momentum neutre.';
          },
          // ADX: Wilder (1978) - 20/25/40 sont les seuils officiels
          adx: v => v > 50 ? 'Tendance extrême — épuisement possible.' : 
                    v > 40 ? 'Tendance très forte — suivre.' : 
                    v > 25 ? 'Tendance établie — signaux fiables.' : 
                    v > 20 ? 'Tendance émergente.' : 
                    'Pas de tendance — range.',
          // SMA: Position relative et alignement
          sma: (price, s20, s50, s200) => {
            const aboveAll = price > s20 && price > s50 && price > s200;
            const belowAll = price < s20 && price < s50 && price < s200;
            const aligned = s20 > s50 && s50 > s200;
            const alignedDown = s20 < s50 && s50 < s200;
            if (aboveAll && aligned) return 'Tendance haussière alignée.';
            if (aboveAll) return 'Prix au-dessus des MM.';
            if (belowAll && alignedDown) return 'Tendance baissière alignée.';
            if (belowAll) return 'Prix sous les MM.';
            return 'Tendance mixte.';
          },
          // Momentum (ROC): Investopedia - seuils adaptés à la volatilité
          momentum: v => v > 15 ? 'Forte accélération haussière.' : 
                         v > 5 ? 'Accélération haussière.' : 
                         v > 2 ? 'Légère hausse.' :
                         v < -15 ? 'Forte accélération baissière.' : 
                         v < -5 ? 'Accélération baissière.' : 
                         v < -2 ? 'Légère baisse.' :
                         'Momentum stable.',
          // Volume: Confirmation des mouvements
          volume: v => v > 2 ? 'Volume très élevé — conviction forte.' : 
                       v > 1.5 ? 'Volume élevé — confirmation.' : 
                       v < 0.5 ? 'Volume très faible — prudence.' : 
                       v < 0.7 ? 'Volume faible — manque conviction.' : 
                       'Volume normal.',
          // ATR: Volatilité pure (Wilder)
          atr: v => v > 3 ? 'Haute volatilité — risque accru.' : 
                    v < 0.3 ? 'Faible volatilité.' : 
                    'Volatilité modérée.',
          // Régime de marché
          regime: type => ({ 
            range: 'Range — RSI plus fiable.', 
            trending: 'Tendance — suivre MACD/SMA.',
            strong_trend: 'Forte tendance — suivre.', 
            extreme_trend: 'Tendance extrême — attention retournement.',
            high_vol: 'Haute volatilité — prudence.', 
            normal: 'Conditions normales.' 
          })[type] || 'Normal.',
          // Signal final
          smoothed: v => v > 0.35 ? 'Signal achat fort.' : 
                         v > 0.15 ? 'Signal achat modéré.' : 
                         v > 0.05 ? 'Signal achat faible.' :
                         v < -0.35 ? 'Signal vente fort.' : 
                         v < -0.15 ? 'Signal vente modéré.' : 
                         v < -0.05 ? 'Signal vente faible.' :
                         'Signal neutre.',
          positionSize: v => Math.abs(v) > 0.15 ? 'Position importante.' : 
                             Math.abs(v) < 0.05 ? 'Position réduite.' : 
                             'Taille normale.'
        };
        const fn = descs[indicator];
        if (!fn) return '';
        return fn(...args);
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
        
        // Afficher les valeurs exactes de SL et TP (déjà calculées correctement selon la direction)
        set('.stop-loss-value', e.stopLoss.toFixed(4));
        set('.take-profit-value', e.takeProfit.toFixed(4));

        const setDesc = (sel, txt) => {
          const el = clone.querySelector(sel);
          if (el) el.textContent = txt;
        };

        setDesc('.rsi-desc', getDesc('rsi', e.rsi));
        setDesc('.macd-desc', getDesc('macd', e.macdHistogram, e.currentPrice));
        setDesc('.sma20-desc', getDesc('sma', e.currentPrice, e.sma20, e.sma50, e.sma200));
        setDesc('.sma50-desc', getDesc('sma', e.currentPrice, e.sma20, e.sma50, e.sma200));
        setDesc('.sma200-desc', getDesc('sma', e.currentPrice, e.sma20, e.sma50, e.sma200));
        setDesc('.adx-desc', getDesc('adx', e.adx));
        setDesc('.momentum-desc', getDesc('momentum', e.momentum));
        setDesc('.volume-desc', getDesc('volume', e.volumeRatio));
        setDesc('.atr-desc', getDesc('atr', e.atr));
        setDesc('.regime-desc', getDesc('regime', e.regime));
        setDesc('.volatility-desc', `Filtre de régime: ${e.regimeFilter.toFixed(2)}x`);
        setDesc('.smoothed-desc', getDesc('smoothed', e.smoothed));
        setDesc('.position-desc', getDesc('positionSize', e.positionSize));
        
        // Calculer les % de perte/gain selon la direction
        const isLong = e.positionDirection === 'long';
        const slPct = Math.abs((e.stopLoss - e.currentPrice) / e.currentPrice * 100).toFixed(2);
        const tpPct = Math.abs((e.takeProfit - e.currentPrice) / e.currentPrice * 100).toFixed(2);
        setDesc('.stop-desc', `Perte max: -${slPct}%`);
        setDesc('.take-desc', `Gain visé: +${tpPct}%`);

        if (e.patterns && e.patterns.length > 0) {
            const tbody = clone.querySelector('tbody');
            const tr = document.createElement('tr');
            const names = e.patterns.map(p => p.name).join(', ');
            const descs = e.patterns.map(p => p.desc).join(' ');
            const type = e.patterns.some(p => p.type === 'bullish') ? 'signal-value-buy' : 
                         e.patterns.some(p => p.type === 'bearish') ? 'signal-value-sell' : 'signal-value-neutral';
            
            tr.innerHTML = `
              <td class="signal-table-cell">Patterns</td>
              <td class="signal-table-cell ${type}">${names}</td>
              <td class="signal-table-cell">${descs}</td>
            `;
            tbody.appendChild(tr);
        }

        if (signalResult.backtest && !signalResult.backtest.error) {
            const bt = signalResult.backtest;
            const tbody = clone.querySelector('tbody');
            const tr = document.createElement('tr');
            
            // Calcul de la durée
            let durationLabel = '';
            let durationDays = 0;
            if (bt.equityCurve && bt.equityCurve.length > 1) {
                let startTs = bt.equityCurve[0].ts;
                let endTs = bt.equityCurve[bt.equityCurve.length - 1].ts;
                
                if (startTs < 100000000) {
                    durationDays = bt.equityCurve.length;
                    durationLabel = `${durationDays} jours`;
                } else {
                    if (startTs < 100000000000) {
                        startTs *= 1000;
                        endTs *= 1000;
                    }
                    durationDays = Math.round((endTs - startTs) / (1000 * 60 * 60 * 24));
                    if (durationDays >= 365) {
                        const years = (durationDays / 365).toFixed(1);
                        durationLabel = `${years} ans`;
                    } else {
                        durationLabel = `${durationDays} jours`;
                    }
                }
            }

            // Résultat clair et compréhensible
            const botValue = bt.finalCapital;
            const holdValue = bt.endPrice;
            const startP = bt.startPrice;
            
            const botPct = parseFloat(bt.botReturn);
            const holdPct = parseFloat(bt.buyHoldReturn);
            const botSign = botPct >= 0 ? '+' : '';
            const botClass = botPct >= 0 ? 'signal-value-buy' : 'signal-value-sell';
            const botBetter = botPct > holdPct;
            
            tr.innerHTML = `
              <td class="signal-table-cell">
                Simulation sur ${durationLabel}<br>
                <small style="opacity:0.7">Théoriquement selon Signal Bot</small>
              </td>
              <td class="signal-table-cell ${botClass}">
                <strong>${botSign}${bt.botReturn}%</strong><br>
                <small style="opacity:0.7">${bt.winningTrades}/${bt.totalTrades} trades gagnés</small>
              </td>
              <td class="signal-table-cell">
                ${botBetter ? '✅ Bat le marché' : '❌ Sous-performe'}<br>
                <small style="opacity:0.7">Marché: ${holdPct >= 0 ? '+' : ''}${bt.buyHoldReturn}%</small>
              </td>
            `;
            tbody.appendChild(tr);
        }

        expContent.appendChild(clone);
      }
    }
  }

  cursor.classList.add('animated');
  setTimeout(() => cursor.classList.remove('animated'), 1200);
}

function updateSignal(symbol, data, options = {}) {
  const result = calculateBotSignal({ ...data, symbol }, options);
  
  // Exécuter le backtest pour obtenir la performance théorique
  try {
    const backtestResult = runBacktest(data, options);
    result.backtest = backtestResult;
  } catch (e) {
    console.error("Erreur lors du backtest:", e);
  }

  updateSignalUI(symbol, result);
  return result;
}

/**
 * Simule une performance théorique ("Forwarding Théorique") basée sur les données historiques.
 * Cette fonction rejoue le passé bougie par bougie, applique les signaux (dont les patterns comme Hanging Man),
 * et calcule les gains/pertes potentiels.
 * 
 * @param {Object} data - Données historiques complètes (prices, highs, lows, opens, volumes)
 * @param {Object} options - Options de simulation (capital, frais, etc.)
 * @returns {Object} Résultats de la simulation (trades, performance, winRate, etc.)
 */
function runBacktest(data, options = {}) {
  // Pour le backtest "par action", on autorise une exposition à 100% du capital alloué
  const opts = { ...DEFAULT_OPTIONS, ...options, maxPosition: 1.0 };
  
  // 1. Nettoyage des données
  const rawPrices = safe(data.prices);
  const rawHighs = safe(data.highs || data.prices);
  const rawLows = safe(data.lows || data.prices);
  const rawOpens = safe(data.opens || data.prices);
  const rawVolumes = safe(data.volumes);
  const rawTimestamps = safe(data.timestamps || []);

  const validIndices = [];
  for(let i=0; i<rawPrices.length; i++) {
      if (rawPrices[i] > 0 && rawHighs[i] > 0 && rawLows[i] > 0) {
          validIndices.push(i);
      }
  }

  if (validIndices.length < opts.minLength) {
    return { error: "Données insuffisantes." };
  }

  const prices = validIndices.map(i => rawPrices[i]);
  const highs = validIndices.map(i => rawHighs[i]);
  const lows = validIndices.map(i => rawLows[i]);
  const opens = validIndices.map(i => rawOpens[i]);
  const volumes = validIndices.map(i => rawVolumes[i]);
  const timestamps = rawTimestamps.length > 0 ? validIndices.map(i => rawTimestamps[i]) : [];
  const len = prices.length;
  
  // Adapter le startIndex en fonction de la quantité de données disponibles
  // On a besoin d'au moins 50 bougies pour les indicateurs de base
  const minStart = 50;
  const idealStart = 200;
  const startIndex = Math.min(idealStart, Math.max(minStart, Math.floor(len * 0.1)));
  
  if (len <= startIndex + 10) {
    return { error: "Période trop courte pour simuler." };
  }

  // 2. Calcul vectorisé des indicateurs (Optimisation majeure)
  const calcSMA = (p, n) => {
    const res = new Float32Array(len);
    let sum = 0;
    for(let i=0; i<len; i++) {
      sum += p[i];
      if(i >= n) sum -= p[i-n];
      if(i >= n-1) res[i] = sum/n;
    }
    return res;
  };

  const calcRSI = (p, n) => {
    const res = new Float32Array(len).fill(50);
    let gain=0, loss=0;
    for(let i=1; i<len; i++) {
      const d = p[i] - p[i-1];
      if(i <= n) {
        if(d>0) gain+=d; else loss-=d;
        if(i===n) { gain/=n; loss/=n; }
      } else {
        gain = (gain*(n-1) + (d>0?d:0))/n;
        loss = (loss*(n-1) + (d<0?-d:0))/n;
      }
      if(i >= n) res[i] = 100 - (100/(1+(loss===0?100:gain/loss)));
    }
    return res;
  };

  const calcMACD = (p) => {
    const hist = new Float32Array(len);
    let ema12=p[0], ema26=p[0], ema9=0;
    const k12=2/13, k26=2/27, k9=2/10;
    for(let i=0; i<len; i++) {
      ema12 = p[i]*k12 + ema12*(1-k12);
      ema26 = p[i]*k26 + ema26*(1-k26);
      const line = ema12 - ema26;
      if(i===0) ema9 = line;
      else ema9 = line*k9 + ema9*(1-k9);
      hist[i] = line - ema9;
    }
    return hist;
  };

  const calcATR = (h, l, c, n) => {
    const res = new Float32Array(len);
    let val = 0;
    for(let i=1; i<len; i++) {
      const tr = Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1]));
      if(i <= n) {
        if(i===n) val = tr/n; // Approx init
        else val += tr/n;
      } else {
        val = (val*(n-1) + tr)/n;
      }
      res[i] = val;
    }
    return res;
  };

  // Indicateurs pré-calculés
  const sma20 = calcSMA(prices, 20);
  const sma50 = calcSMA(prices, 50);
  const sma200 = calcSMA(prices, 200);
  const rsi14 = calcRSI(prices, 14);
  const rsi50 = calcRSI(prices, 50);
  const macdHist = calcMACD(prices);
  const atr14 = calcATR(highs, lows, prices, 14);
  
  // Momentum & VolRatio
  const mom = new Float32Array(len);
  const volRatio = new Float32Array(len).fill(1);
  for(let i=0; i<len; i++) {
      if(i>=10) mom[i] = prices[i-10]!==0 ? ((prices[i]-prices[i-10])/prices[i-10])*100 : 0;
      if(i>=20) {
          let sum=0; 
          for(let j=0; j<20; j++) sum += volumes[i-j];
          const avg = sum/20;
          volRatio[i] = avg>0 ? volumes[i]/avg : 1;
      }
  }

  // 3. Simulation basée sur 1 action
  const startPrice = prices[startIndex];
  const endPrice = prices[len - 1];
  const initialCapital = startPrice; // On simule l'achat d'1 action
  let capital = initialCapital;
  const buyHoldStartPrice = startPrice;
  let position = null;
  let totalFees = 0;
  const trades = [];
  const equityCurve = [];
  let prevSmoothed = 0;

  for (let i = startIndex; i < len; i++) {
    const price = prices[i];
    const ts = timestamps.length > i ? timestamps[i] : i;

    // Gestion Position
    if (position) {
      let exitPrice = null;
      if (position.type === 'long') {
        if (lows[i] <= position.sl) exitPrice = position.sl;
        else if (highs[i] >= position.tp) exitPrice = position.tp;
      } else {
        if (highs[i] >= position.sl) exitPrice = position.sl;
        else if (lows[i] <= position.tp) exitPrice = position.tp;
      }

      if (exitPrice) {
        const pnl = (position.type === 'long' ? exitPrice - position.entryPrice : position.entryPrice - exitPrice) * position.size;
        const cost = exitPrice * position.size * opts.transactionCost;
        capital += pnl - cost;
        totalFees += cost + position.entryCost;
        trades.push({ pnl: pnl - cost });
        position = null;
      }
    }

    // Calcul Signal (Réplique simplifiée de calculateBotSignal)
    if (!position) {
      // Patterns (sur les 2 dernières bougies)
      let patternScore = 0;
      let hasBullish = false, hasBearish = false;
      
      const body = Math.abs(prices[i] - opens[i]);
      const range = highs[i] - lows[i];
      if (range > 0) {
          const lowerShadow = Math.min(opens[i], prices[i]) - lows[i];
          const upperShadow = highs[i] - Math.max(opens[i], prices[i]);
          
          // Hammer / Hanging Man
          if (lowerShadow > 2 * body && upperShadow < body) {
              if (prices[i-1] < opens[i-1]) { hasBullish = true; patternScore += 0.6; } // Hammer
              else { hasBearish = true; patternScore -= 0.6; } // Hanging Man
          }
          // Engulfing
          const prevBody = Math.abs(prices[i-1] - opens[i-1]);
          if (body > prevBody) {
              if (prices[i] > opens[i] && prices[i-1] < opens[i-1]) { hasBullish = true; patternScore += 0.8; }
              else if (prices[i] < opens[i] && prices[i-1] > opens[i-1]) { hasBearish = true; patternScore -= 0.8; }
          }
      }

      // Scores
      const rsiS = (clamp((rsi14[i]-50)/20, -1, 1)) * 0.7 + (clamp((rsi50[i]-50)/20, -1, 1)) * 0.3;
      const macdS = clamp(macdHist[i], -1, 1);
      const smaS = (prices[i] > sma20[i] ? 0.5 : -0.5) + (prices[i] > sma50[i] ? 0.3 : -0.3) + (prices[i] > sma200[i] ? 0.2 : -0.2);
      
      let score = rsiS * 0.2 + macdS * 0.25 + smaS * 0.25 + clamp(mom[i]/5, -1, 1) * 0.1 + clamp(patternScore, -1, 1) * 0.2;
      
      // Smoothing
      const smoothed = prevSmoothed * 0.85 + score * 0.15;
      prevSmoothed = smoothed;
      const final = clamp(smoothed, -1, 1);
      const signal = 50 + final * 50;

      // Entrée
      let entryType = null;
      if (signal >= 65 || (signal >= 55 && hasBullish)) entryType = 'long';
      else if (signal <= 35 || (signal <= 45 && hasBearish)) entryType = 'short';

      if (entryType) {
        const atr = atr14[i] || price * 0.01;
        const slDist = atr * opts.slMult;
        const tpDist = atr * opts.tpMult;
        const sl = entryType === 'long' ? price - slDist : price + slDist;
        const tp = entryType === 'long' ? price + tpDist : price - tpDist;
        
        const risk = Math.abs(price - sl);
        const amount = capital * opts.accountRisk; // 2% risk
        const size = amount / risk;
        
        // Limite max position (100% capital)
        const maxSize = (capital * opts.maxPosition) / price;
        const finalSize = Math.min(size, maxSize);

        if (finalSize > 0.000001) { 
            const cost = finalSize * price * opts.transactionCost;
            position = { type: entryType, entryPrice: price, size: finalSize, sl, tp, entryCost: cost };
        }
      }
    }
    equityCurve.push({ ts, equity: capital });
  }

  const winningTrades = trades.filter(t => t.pnl > 0);
  const totalPnl = trades.reduce((acc, t) => acc + t.pnl, 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  
  // Buy & Hold : acheter au début, vendre à la fin
  const buyHoldEndPrice = prices[len - 1];
  const buyHoldReturn = ((buyHoldEndPrice - buyHoldStartPrice) / buyHoldStartPrice) * 100;
  const botReturn = ((capital - initialCapital) / initialCapital) * 100;

  return {
    startPrice,
    endPrice,
    initialCapital: initialCapital,
    finalCapital: capital,
    totalPnl,
    totalFees,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    winRate: winRate.toFixed(2),
    equityCurve,
    botReturn: botReturn.toFixed(2),
    buyHoldReturn: buyHoldReturn.toFixed(2)
  };
}

export {
  calculateBotSignal,
  updateSignal,
  updateSignalUI,
  runBacktest,
  SIGNAL_HISTORY,
  rsi,
  ema,
  atr,
  adx,
  computeStops,
  positionSize
};