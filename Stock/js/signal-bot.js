const SIGNAL_HISTORY = [];

const DEFAULT_OPTIONS = {
  accountCapital: 10000,
  accountRisk: 0.02,
  maxPosition: 0.2,
  divergenceWeight: 0.25,
  minLength: 30,
  weights: { rsi: 0.18, macd: 0.26, sma: 0.26, momentum: 0.12, volume: 0.08 }
};

function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function validateData(data, options = {}) {
  if (!data) return false;
  const prices = safeArray(data.prices);
  // Require enough points for RSI(14) and MACD(slow=26) calculations as a sensible minimum
  const minRequired = Math.max(15, options.minLength || 15);
  if (prices.length < minRequired) return false;
  return true;
}

function calculateRSI(prices, period = 14) {
  const p = safeArray(prices);
  if (p.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = p[i] - p[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < p.length; i++) {
    const change = p[i] - p[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
  }
  const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
  const p = safeArray(prices);
  if (p.length === 0) return 0;
  if (p.length < period) return p.reduce((s, v) => s + v, 0) / p.length;
  const k = 2 / (period + 1);
  // seed EMA with SMA of first 'period' values for more stable start
  let ema = p.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < p.length; i++) ema = p[i] * k + ema * (1 - k);
  return ema;
}

function calculateSMA(prices, period) {
  const p = safeArray(prices);
  if (p.length === 0) return 0;
  if (p.length < period) return p.reduce((s, v) => s + v, 0) / p.length;
  return p.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
  const p = safeArray(prices);
  if (p.length < slow) return { macdLine: 0, signalLine: 0, histogram: 0, macdHistory: [] };
  const macdHistory = [];
  const kf = 2 / (fast + 1);
  const ks = 2 / (slow + 1);
  let emaFast = p.length >= fast ? p.slice(0, fast).reduce((s, v) => s + v, 0) / fast : p[0];
  let emaSlow = p.length >= slow ? p.slice(0, slow).reduce((s, v) => s + v, 0) / slow : p[0];
  for (let i = 1; i < p.length; i++) {
    emaFast = p[i] * kf + emaFast * (1 - kf);
    emaSlow = p[i] * ks + emaSlow * (1 - ks);
    if (i >= slow - 1) macdHistory.push(emaFast - emaSlow);
  }
  const macdLine = macdHistory[macdHistory.length - 1];
  const signalLine = calculateEMA(macdHistory, signal);
  const histogram = macdLine - signalLine;
  return { macdLine, signalLine, histogram, macdHistory };
}

function calculateATR(highs, lows, closes, period = 14) {
  const h = safeArray(highs);
  const l = safeArray(lows);
  const c = safeArray(closes);
  const n = Math.min(h.length, l.length, c.length);
  if (n < 2) return 0;
  const trs = [];
  for (let i = 1; i < n; i++) trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  if (trs.length < period) return trs.reduce((s, v) => s + v, 0) / trs.length;
  // moyenne initiale sur les 'period' premiers TR
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}

function calculateMomentum(prices, period = 10) {
  const p = safeArray(prices);
  if (p.length < period + 1) return 0;
  const prev = p[p.length - period - 1];
  return prev === 0 ? 0 : ((p[p.length - 1] - prev) / prev) * 100;
}

function calculateVolumeRatio(volumes, period = 20) {
  const v = safeArray(volumes);
  if (v.length < 2) return 1;
  const recent = v[v.length - 1];
  const avg = v.slice(-Math.min(period, v.length)).reduce((s, x) => s + x, 0) / Math.min(period, v.length);
  return avg === 0 ? 1 : recent / avg;
}

function calculateStdDev(values, period = 20) {
  const v = safeArray(values);
  if (v.length < 2) return 0;
  const slice = v.slice(-Math.min(period, v.length));
  const mean = slice.reduce((s, x) => s + x, 0) / slice.length;
  const variance = slice.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / slice.length;
  return Math.sqrt(variance);
}

function normalizeRSI(rsi) {
  if (isNaN(rsi)) return 0;
  // RSI bas -> valeur positive (achat), RSI haut -> valeur négative (vente)
  return clamp((50 - rsi) / 20, -1, 1);
}

function normalizeMACD(macd, stddev) {
  const hist = macd.histogram || 0;
  const normalized = stddev > 0 ? hist / stddev : hist;
  return clamp(normalized, -1, 1);
}

function normalizeSMA(currentPrice, sma) {
  if (!sma || sma === 0) return 0;
  const ratio = (currentPrice - sma) / sma;
  return clamp(ratio * 10, -1, 1);
}

function normalizeMomentum(m) {
  return clamp((m || 0) / 10, -1, 1);
}

function normalizeVolume(vr) {
  return clamp((vr - 1) * 2, -1, 1);
}

function detectDivergence(prices, indicator, lookback = 14) {
  const p = safeArray(prices);
  const ind = safeArray(indicator);
  const n = Math.min(p.length, ind.length);
  if (n < lookback + 2) return 0;
  const window = 3; // look around index for local extrema
  const minSeparation = 3; // min index distance between peaks/troughs
  const indStd = calculateStdDev(ind, lookback) || 1;
  const indMin = Math.min(...ind.slice(Math.max(0, n - lookback), n));
  const indMax = Math.max(...ind.slice(Math.max(0, n - lookback), n));
  const indRange = Math.max(1e-6, indMax - indMin);
  const prominenceFactor = 0.02; // threshold as fraction of range
  function isPeak(arr, i) {
    if (i - window < 0 || i + window >= arr.length) return false;
    const leftMax = Math.max(...arr.slice(i - window, i));
    const rightMax = Math.max(...arr.slice(i + 1, i + 1 + window));
    const peakProm = arr[i] - Math.max(leftMax, rightMax);
    return arr[i] > leftMax && arr[i] > rightMax && peakProm >= (indRange * prominenceFactor);
  }
  function isTrough(arr, i) {
    if (i - window < 0 || i + window >= arr.length) return false;
    const leftMin = Math.min(...arr.slice(i - window, i));
    const rightMin = Math.min(...arr.slice(i + 1, i + 1 + window));
    const troughProm = Math.min(leftMin, rightMin) - arr[i];
    return arr[i] < leftMin && arr[i] < rightMin && troughProm >= (indRange * prominenceFactor);
  }
  let pricePeaks = [], priceTroughs = [], indPeaks = [], indTroughs = [];
  for (let i = 1; i < n - 1; i++) {
    if (isPeak(p, i)) pricePeaks.push({ idx: i, val: p[i] });
    if (isTrough(p, i)) priceTroughs.push({ idx: i, val: p[i] });
    if (isPeak(ind, i)) indPeaks.push({ idx: i, val: ind[i] });
    if (isTrough(ind, i)) indTroughs.push({ idx: i, val: ind[i] });
  }
  const recentPricePeaks = pricePeaks.filter(pk => pk.idx >= n - lookback);
  const recentIndPeaks = indPeaks.filter(pk => pk.idx >= n - lookback);
  const recentPriceTroughs = priceTroughs.filter(tr => tr.idx >= n - lookback);
  const recentIndTroughs = indTroughs.filter(tr => tr.idx >= n - lookback);
  if (recentPricePeaks.length >= 2 && recentIndPeaks.length >= 2) {
    const l = recentPricePeaks.length - 1;
    const lastPP = recentPricePeaks[l].val;
    const prevPP = recentPricePeaks[l - 1].val;
    const lastIP = recentIndPeaks[recentIndPeaks.length - 1].val;
    const prevIP = recentIndPeaks[recentIndPeaks.length - 2].val;
    const idxGap = Math.abs(recentPricePeaks[l].idx - recentPricePeaks[l - 1].idx);
    if (idxGap >= minSeparation && lastPP > prevPP && lastIP < prevIP) {
      const mag = clamp((prevIP - lastIP) / indStd, -0.5, 0.5);
      return -mag;
    }
  }
  if (recentPriceTroughs.length >= 2 && recentIndTroughs.length >= 2) {
    const l = recentPriceTroughs.length - 1;
    const lastPT = recentPriceTroughs[l].val;
    const prevPT = recentPriceTroughs[l - 1].val;
    const lastIT = recentIndTroughs[recentIndTroughs.length - 1].val;
    const prevIT = recentIndTroughs[recentIndTroughs.length - 2].val;
    const idxGap = Math.abs(recentPriceTroughs[l].idx - recentPriceTroughs[l - 1].idx);
    if (idxGap >= minSeparation && lastPT < prevPT && lastIT > prevIT) {
      const mag = clamp((lastIT - prevIT) / indStd, -0.5, 0.5);
      return mag;
    }
  }
  return 0;
}

function calculateRSISeries(prices, period = 14) {
  const p = safeArray(prices);
  const res = new Array(p.length).fill(50);
  if (p.length < period + 1) return res;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = p[i] - p[i - 1];
    if (change > 0) avgGain += change; else avgLoss += Math.abs(change);
  }
  avgGain /= period; avgLoss /= period;
  res[period] = 100 - (100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss)));
  for (let i = period + 1; i < p.length; i++) {
    const change = p[i] - p[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    res[i] = 100 - (100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss)));
  }
  return res;
}

function emaSmooth(value, prev, alpha = 0.2) { return typeof prev === 'number' ? prev * (1 - alpha) + value * alpha : value; }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function computeVolatilityMultiplier(atr, price) { if (price <= 0) return 1; const atrNorm = atr / price; return clamp(1 / (1 + 5 * atrNorm), 0.3, 1); }

function computePositionSizing(signalValue, currentPrice, stopLoss, accountCapital = 10000, accountRisk = 0.02, maxPosition = 0.2) {
  // signalValue: 0..100 -> target ratio -1..1
  const targetRatio = (signalValue - 50) / 50;
  const direction = Math.sign(targetRatio) || 1;
  const riskPerUnit = Math.abs(currentPrice - stopLoss);
  if (!currentPrice || riskPerUnit <= 0) {
    console.warn('computePositionSizing: invalid currentPrice or riskPerUnit:', currentPrice, riskPerUnit);
    return 0;
  }
  const riskAmount = accountCapital * accountRisk;
  const units = Math.floor(riskAmount / riskPerUnit);
  const positionValue = units * currentPrice;
  const positionPct = positionValue / accountCapital;
  const signedPct = clamp(positionPct, 0, maxPosition) * direction;
  if (Math.abs(signedPct) <= 0) console.warn('computePositionSizing: computed 0 positionPct, riskAmount or riskPerUnit too small', positionPct, units, riskAmount, riskPerUnit);
  return signedPct;
}

function computeStops(currentPrice, atr, direction = 1, slMult = 1.5, tpMult = 2.5) {
  // direction must be ±1 - compute stops based on final signal direction
  const sl = currentPrice - direction * slMult * atr;
  const tp = currentPrice + direction * tpMult * atr;
  if (sl <= 0) console.warn('computeStops: calculated stopLoss <= 0 (sl, currentPrice, atr):', sl, currentPrice, atr);
  return { stopLoss: Math.max(0, sl), takeProfit: Math.max(0, tp) };
}

function mergeTimeframesShortLong(data) { const shortPrices = safeArray(data.prices); const longPrices = safeArray(data.longPrices || data.prices); return { shortPrices, longPrices }; }

function calculateCompositeScore(parts, weights) { let sum = 0; let wsum = 0; for (const k in weights) { if (parts.hasOwnProperty(k)) { sum += parts[k] * weights[k]; wsum += weights[k]; } } return wsum === 0 ? 0 : sum / wsum; }

function recordSignal(symbol, result) { SIGNAL_HISTORY.push({ timestamp: Date.now(), symbol, result }); if (SIGNAL_HISTORY.length > 5000) SIGNAL_HISTORY.shift(); }

function calculateBotSignal(data, options = {}) {
  options = Object.assign({}, DEFAULT_OPTIONS, options || {});
  if (!validateData(data, options)) {
    let reasonMsg = '';
    if (!data) reasonMsg = 'Aucune donnée reçue pour ce symbole.';
    else {
      const prices = safeArray(data.prices);
      const vols = safeArray(data.volumes);
      const highs = safeArray(data.highs);
      const lows = safeArray(data.lows);
      const clauses = [];
      if (prices.length < 5) clauses.push(`pas assez de points de prix (requis: 5, reçus: ${prices.length})`);
      if (vols.length === 0) clauses.push(`les volumes sont manquants (l'analyse de volume est indisponible)`);
      if (highs.length === 0 || lows.length === 0) clauses.push(`les valeurs haut/bas intraday sont absentes (l'ATR et les mesures de volatilité peuvent être inexactes)`);
      if (clauses.length === 0) reasonMsg = 'Données incomplètes pour effectuer l\'analyse technique.';
      else if (clauses.length === 1) reasonMsg = clauses[0].charAt(0).toUpperCase() + clauses[0].slice(1) + '.';
      else { const allButLast = clauses.slice(0, -1).join(', '); const last = clauses[clauses.length - 1]; reasonMsg = allButLast.charAt(0).toUpperCase() + allButLast.slice(1) + ' et ' + last + '.'; }
    }
    return { signalValue: 50, signalTitle: 'Garder', signalDesc: 'Données insuffisantes', explanation: 'Données insuffisantes', insufficientReason: reasonMsg, details: {} };
  }

  const symbol = data.symbol || options.symbol || 'UNKNOWN';
  const currentPrice = typeof data.price === 'number' ? data.price : safeArray(data.prices)[data.prices.length - 1] || 0;
  const volumes = safeArray(data.volumes);
  const highs = safeArray(data.highs || data.prices);
  const lows = safeArray(data.lows || data.prices);
  const closes = safeArray(data.prices);
  const { shortPrices, longPrices } = mergeTimeframesShortLong(data);
  if (shortPrices.some(p => p < 0)) console.warn(`Negative prices detected for ${symbol}. Analysis may be inaccurate.`);

  const rsiShort = calculateRSI(shortPrices);
  const rsiLong = calculateRSI(longPrices, 50);
  const macdShort = calculateMACD(shortPrices);
  const macdLong = calculateMACD(longPrices);
  const sma20 = calculateSMA(shortPrices, 20);
  const sma50 = calculateSMA(longPrices, 50);
  const sma200 = calculateSMA(longPrices, 200);
  const sma200Fallback = longPrices.length < 200;
  const momentum = calculateMomentum(shortPrices);
  const volumeRatio = calculateVolumeRatio(volumes);
  const atr = calculateATR(highs, lows, closes);
  const stddev = calculateStdDev(shortPrices);
  const divergenceMACD = detectDivergence(shortPrices, macdShort.macdHistory);
  const rsiSeries = calculateRSISeries(shortPrices);
  const divergenceRSI = detectDivergence(shortPrices, rsiSeries);

  const rsiScore = normalizeRSI(rsiShort) * 0.9 + normalizeRSI(rsiLong) * 0.1;
  const macdScore = normalizeMACD(macdShort, stddev) * 0.9 + normalizeMACD(macdLong, stddev) * 0.1;
  const smaScore = normalizeSMA(currentPrice, sma20) * 0.6 + normalizeSMA(currentPrice, sma50) * 0.3 + normalizeSMA(currentPrice, sma200) * 0.1;
  const momentumScore = normalizeMomentum(momentum);
  const volumeScore = normalizeVolume(volumeRatio);

  const indicatorParts = { rsi: rsiScore, macd: macdScore, sma: smaScore, momentum: momentumScore, volume: volumeScore };
  const weights = options.weights;
  let weightedScore = calculateCompositeScore(indicatorParts, weights);
  const divergenceWeight = options.divergenceWeight;
  weightedScore += divergenceWeight * (divergenceMACD + divergenceRSI);
  const volMultiplier = computeVolatilityMultiplier(atr, currentPrice);
  weightedScore *= volMultiplier;
  const smoothed = emaSmooth(weightedScore, options.prevSmoothed, 0.15);
  const finalScore = clamp(smoothed, -1, 1);
  const signalValue = Math.round(50 + finalScore * 50);
  const direction = Math.sign(finalScore) || 1;
  const stops = computeStops(currentPrice, atr, direction, options.slMult, options.tpMult);
  const positionSize = computePositionSizing(signalValue, currentPrice, stops.stopLoss, options.accountCapital || 10000, options.accountRisk || 0.02, options.maxPosition || 0.2);

  let signalTitle = 'Garder';
  let signalDesc = 'Position neutre - Attendre';
  if (signalValue >= 80) { signalTitle = 'Acheter'; signalDesc = 'Achat très fort'; }
  else if (signalValue >= 65) { signalTitle = 'Acheter'; signalDesc = 'Achat confirmé'; }
  else if (signalValue >= 55) { signalTitle = 'Acheter'; signalDesc = 'Achat modéré'; }
  else if (signalValue <= 20) { signalTitle = 'Vendre'; signalDesc = 'Vente forte'; }
  else if (signalValue <= 35) { signalTitle = 'Vendre'; signalDesc = 'Vente confirmée'; }
  else if (signalValue <= 45) { signalTitle = 'Vendre'; signalDesc = 'Vente modérée'; }

  const explanation = { rsi: rsiShort, macdHistogram: macdShort.histogram, sma20, sma50, sma200, sma200Fallback, momentum, volumeRatio, atr, stddev, divergenceMACD, divergenceRSI, weightedScore, volatilityMultiplier: volMultiplier, smoothed, positionSize, stopLoss: stops.stopLoss, takeProfit: stops.takeProfit };

  const result = {
    symbol,
    signalValue,
    signalTitle,
    signalDesc,
    explanation,
    details: {
      rsi: rsiShort.toFixed(2),
      macd: macdShort.histogram.toFixed(4),
      sma20: sma20.toFixed(2),
      sma50: sma50.toFixed(2),
      sma200: sma200.toFixed(2),
      momentum: momentum.toFixed(2),
      volumeRatio: volumeRatio.toFixed(2),
      atr: atr.toFixed(4),
      weightedScore: weightedScore.toFixed(4),
      volatilityMultiplier: volMultiplier.toFixed(4),
      smoothed: smoothed.toFixed(4),
      positionSize: positionSize.toFixed(4),
      stopLoss: stops.stopLoss.toFixed(4),
      takeProfit: stops.takeProfit.toFixed(4)
    }
  };

  recordSignal(symbol, result);
  return result;
}

function updateSignalUI(symbol, signalResult) {
  const signalCursor = document.getElementById(`signal-cursor-${symbol}`);
  const signalStateContainer = document.querySelector(`#card-${symbol} .signal-state-container`);
  const signalStateTitle = document.querySelector(`#card-${symbol} .signal-state-title`);
  const signalStateDescription = document.querySelector(`#card-${symbol} .signal-state-description`);
  if (!signalCursor || !signalStateContainer || !signalStateTitle || !signalStateDescription) return;
  const cursorPosition = signalResult.signalValue;
  signalCursor.style.left = `${cursorPosition}%`;
  let stateClass = '';
  if (signalResult.signalDesc === 'Données insuffisantes') stateClass = 'insufficient-state';
  else if (signalResult.signalTitle === 'Acheter') stateClass = 'buy-state';
  else if (signalResult.signalTitle === 'Vendre') stateClass = 'sell-state';
  signalStateContainer.className = `signal-state-container ${stateClass}`;
  const currentPeriod = window.positions?.[symbol]?.currentPeriod || '1D';
  signalStateTitle.textContent = signalResult.signalDesc;
  let advice = '';
  const descLower = signalResult.signalDesc.toLowerCase();
  if (descLower === 'données insuffisantes') signalStateDescription.textContent = signalResult.insufficientReason || `Données insuffisantes pour la période ${currentPeriod}.`;
  else if (signalResult.signalTitle === 'Acheter') {
    if (descLower.includes('très')) advice = 'acheter maintenant ; envisager une allocation plus importante en respectant strictement votre gestion du risque et les stops.';
    else if (descLower.includes('confirm')) advice = 'acheter ; prendre position selon votre plan et gérer la taille de la position selon votre tolérance au risque.';
    else if (descLower.includes('modéré')) advice = 'entrer progressivement (acheter par paliers) et surveiller le signal.';
    else advice = 'considérer un achat selon votre stratégie personnelle.';
    signalStateDescription.textContent = `Conseillé : ${advice}`;
  } else if (signalResult.signalTitle === 'Garder') { advice = 'ne rien changer pour l\'instant ; surveiller l\'évolution et attendre une confirmation.'; signalStateDescription.textContent = `Conseillé : ${advice}`; }
  else if (signalResult.signalTitle === 'Vendre') { if (descLower.includes('modéré')) advice = 'prendre des bénéfices partiels ou réduire légèrement l\'exposition en suivant votre plan de gestion du risque.'; else advice = 'vendre et réduire significativement la position ; envisager des couvertures si nécessaire.'; signalStateDescription.textContent = `Conseillé : ${advice}`; }
  else signalStateDescription.textContent = `Conseillé : surveiller la période ${currentPeriod} et agir selon votre plan.`;
  const cardRoot = document.querySelector(`#card-${symbol}`);
  if (cardRoot) {
    const labelsEl = cardRoot.querySelector('.signal-labels');
    const barEl = cardRoot.querySelector('.signal-bar');
    const hide = signalResult.signalDesc === 'Données insuffisantes';
    if (labelsEl) {
      if (hide) labelsEl.classList.add('hidden-by-bot'); else labelsEl.classList.remove('hidden-by-bot');
    }
    if (barEl) {
      if (hide) barEl.classList.add('hidden-by-bot'); else barEl.classList.remove('hidden-by-bot');
    }
  }
  const signalExplanation = document.querySelector(`#card-${symbol} .signal-explanation`);
  const explanationContent = document.querySelector(`#card-${symbol} .explanation-content`);
  if (signalExplanation && explanationContent) {
    if (signalResult.signalDesc === 'Données insuffisantes') {
      signalExplanation.classList.add('hidden-by-bot');
    } else {
      signalExplanation.classList.remove('hidden-by-bot');
      const e = signalResult.explanation;
      const getValueColor = (indicator, value) => {
        switch (indicator) {
          case 'rsi': return value < 30 ? 'signal-value-buy' : value > 70 ? 'signal-value-sell' : 'signal-value-neutral';
          case 'macd': return value > 0.001 ? 'signal-value-buy' : value < -0.001 ? 'signal-value-sell' : 'signal-value-neutral';
          case 'momentum': return value > 1 ? 'signal-value-buy' : value < -1 ? 'signal-value-sell' : 'signal-value-neutral';
          case 'volume': return value > 1.5 ? 'signal-value-buy' : value < 0.7 ? 'signal-value-sell' : 'signal-value-neutral';
          case 'atr': return value > 3 ? 'signal-value-sell' : value < 0.3 ? 'signal-value-buy' : 'signal-value-neutral';
          case 'volatilityMultiplier': return value < 0.7 ? 'signal-value-buy' : value > 1.3 ? 'signal-value-sell' : 'signal-value-neutral';
          case 'smoothed': return value > 0.3 ? 'signal-value-buy' : value < -0.3 ? 'signal-value-sell' : 'signal-value-neutral';
          case 'positionSize': return value > 0.2 ? 'signal-value-buy' : value < 0.03 ? 'signal-value-sell' : 'signal-value-neutral';
          default: return 'signal-value-neutral';
        }
      };
      // Use the signal explanation table template instead of building an innerHTML string
      explanationContent.innerHTML = '';
      const tpl = document.getElementById('signal-explanation-table-template');
      if (tpl) {
        const tableClone = tpl.content.cloneNode(true);
        const setValue = (selector, value, colorClass) => {
          const el = tableClone.querySelector(selector);
          if (el) {
            el.textContent = value;
            if (colorClass) {
              el.classList.remove('signal-value-buy','signal-value-sell','signal-value-neutral');
              el.classList.add(colorClass);
            }
          }
        };
        // Fill values with colors
        setValue('.rsi-value', e.rsi.toFixed(2), getValueColor('rsi', e.rsi));
        setValue('.macd-value', e.macdHistogram.toFixed(4), getValueColor('macd', e.macdHistogram));
        setValue('.sma20-value', e.sma20.toFixed(2), getValueColor('sma20', e.sma20));
        setValue('.sma50-value', e.sma50.toFixed(2), getValueColor('sma50', e.sma50));
        setValue('.sma200-value', `${e.sma200.toFixed(2)}${e.sma200Fallback ? ' (fallback)' : ''}`, getValueColor('sma200', e.sma200));
        setValue('.momentum-value', `${e.momentum.toFixed(2)}%`, getValueColor('momentum', e.momentum));
        setValue('.volume-value', e.volumeRatio.toFixed(2), getValueColor('volume', e.volumeRatio));
        setValue('.atr-value', e.atr.toFixed(4), getValueColor('atr', e.atr));
        setValue('.volatility-multiplier-value', e.volatilityMultiplier.toFixed(4), getValueColor('volatilityMultiplier', e.volatilityMultiplier));
        setValue('.smoothed-value', e.smoothed.toFixed(4), getValueColor('smoothed', e.smoothed));
        setValue('.position-size-value', `${(e.positionSize * 100).toFixed(2)}%`, getValueColor('positionSize', e.positionSize));
        setValue('.stop-loss-value', e.stopLoss.toFixed(4), 'signal-value-neutral');
        setValue('.take-profit-value', e.takeProfit.toFixed(4), 'signal-value-neutral');

        explanationContent.appendChild(tableClone);
      }

      // Add a disclaimer below the table
      if (cardRoot) { const oldDisclaimer = cardRoot.querySelector('.signal-disclaimer-root'); if (oldDisclaimer) oldDisclaimer.remove(); }
      const disclaimer = document.createElement('div');
      disclaimer.className = 'signal-disclaimer-root';
      disclaimer.textContent = 'Disclaimer : Ce signal est fourni à titre informatif uniquement et ne constitue pas un conseil en investissement. Investissez uniquement ce que vous pouvez vous permettre de perdre.';
      explanationContent.appendChild(disclaimer);
      if (cardRoot) { const oldDisclaimer = cardRoot.querySelector('.signal-disclaimer-root'); if (oldDisclaimer) oldDisclaimer.remove(); }
    }
  }
  signalCursor.classList.add('animated');
  setTimeout(() => signalCursor.classList.remove('animated'), 1200);
  console.log(`=== BOT SIGNAL for ${symbol} ===`);
  console.log(`Signal: ${signalResult.signalValue}% - ${signalResult.signalTitle}`);
  console.log(`Details:`, signalResult.details);
}

function updateSignal(symbol, data, options = {}) { const signalResult = calculateBotSignal({ ...data, symbol }, options); updateSignalUI(symbol, signalResult); return signalResult; }

export { calculateBotSignal, updateSignal, updateSignalUI, SIGNAL_HISTORY, calculateRSI, calculateEMA, calculateATR, computeStops, computePositionSizing };