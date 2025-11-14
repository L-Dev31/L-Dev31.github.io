const SIGNAL_HISTORY = [];

function safeArray(arr) {
  return Array.isArray(arr) ? arr : [];
}

function validateData(data) {
  if (!data) return false;
  const prices = safeArray(data.prices);
  if (prices.length < 5) return false;
  return true;
}

function calculateRSI(prices, period = 14) {
  const p = safeArray(prices);
  if (p.length < period + 1) return 50;
  const gains = [];
  const losses = [];
  for (let i = 1; i < p.length; i++) {
    const c = p[i] - p[i - 1];
    gains.push(c > 0 ? c : 0);
    losses.push(c < 0 ? Math.abs(c) : 0);
  }
  let avgG = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let avgL = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period;
    avgL = (avgL * (period - 1) + losses[i]) / period;
  }
  const rs = avgL === 0 ? 100 : avgG / avgL;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices, period) {
  const p = safeArray(prices);
  if (p.length === 0) return 0;
  if (p.length < period) return p[p.length - 1];
  const k = 2 / (period + 1);
  let ema = p.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < p.length; i++) {
    ema = (p[i] - ema) * k + ema;
  }
  return ema;
}

function calculateSMA(prices, period) {
  const p = safeArray(prices);
  if (p.length === 0) return 0;
  if (p.length < period) return p[p.length - 1];
  const slice = p.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
  const fastEMA = calculateEMA(prices, fast);
  const slowEMA = calculateEMA(prices, slow);
  const macdLine = fastEMA - slowEMA;
  const histArr = [];
  for (let i = 0; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    if (slice.length < slow) {
      histArr.push(0);
      continue;
    }
    const f = calculateEMA(slice, fast);
    const s = calculateEMA(slice, slow);
    histArr.push(f - s);
  }
  const signalLine = calculateEMA(histArr, signal);
  const histogram = macdLine - signalLine;
  return { macdLine, signalLine, histogram };
}

function calculateATR(highs, lows, closes, period = 14) {
  const h = safeArray(highs);
  const l = safeArray(lows);
  const c = safeArray(closes);
  const n = Math.min(h.length, l.length, c.length);
  if (n < 2) return 0;
  const trs = [];
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      h[i] - l[i],
      Math.abs(h[i] - c[i - 1]),
      Math.abs(l[i] - c[i - 1])
    );
    trs.push(tr);
  }
  if (trs.length === 0) return 0;
  if (trs.length < period) return trs[trs.length - 1];
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

function calculateMomentum(prices, period = 10) {
  const p = safeArray(prices);
  if (p.length < period + 1) return 0;
  const prev = p[p.length - period - 1];
  if (prev === 0) return 0;
  return ((p[p.length - 1] - prev) / prev) * 100;
}

function calculateVolumeRatio(volumes, period = 20) {
  const v = safeArray(volumes);
  if (v.length < period) return 1;
  const recent = v[v.length - 1];
  const avg = v.slice(-period).reduce((s, x) => s + x, 0) / period;
  return avg === 0 ? 1 : recent / avg;
}

function calculateStdDev(values, period = 20) {
  const v = safeArray(values);
  if (v.length < period) return 0;
  const slice = v.slice(-period);
  const mean = slice.reduce((s, x) => s + x, 0) / slice.length;
  const variance = slice.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / slice.length;
  return Math.sqrt(variance);
}

function normalizeRSI(rsi) {
  if (typeof rsi !== 'number') return 0;
  if (rsi <= 30) return 1;
  if (rsi >= 70) return -1;
  if (rsi < 50) return (rsi - 30) / 20;
  return -((rsi - 50) / 20);
}

function normalizeMACD(macd) {
  const v = Math.abs(macd.histogram || 0);
  const n = Math.min(v / 2, 1);
  return (macd.histogram || 0) >= 0 ? n : -n;
}

function normalizeSMA(currentPrice, sma) {
  if (!sma || sma === 0) return 0;
  const ratio = currentPrice / sma;
  if (ratio > 1.05) return 1;
  if (ratio < 0.95) return -1;
  return Math.max(-1, Math.min(1, (ratio - 1) * 20));
}

function normalizeMomentum(m) {
  const abs = Math.abs(m || 0);
  const n = Math.min(abs / 10, 1);
  return (m || 0) >= 0 ? n : -n;
}

function normalizeVolume(vr) {
  if (vr > 1.5) return 1;
  if (vr < 0.5) return -1;
  return Math.max(-1, Math.min(1, (vr - 1) * 2));
}

function detectDivergence(prices, indicatorValues, lookback = 14) {
  const p = safeArray(prices);
  const ind = safeArray(indicatorValues);
  if (p.length < lookback + 2 || ind.length < lookback + 2) return 0;
  const lastPrice = p[p.length - 1];
  const prevPrice = p[p.length - lookback - 1];
  const lastInd = ind[ind.length - 1];
  const prevInd = ind[ind.length - lookback - 1];
  if ((lastPrice > prevPrice && lastInd < prevInd) || (lastPrice < prevPrice && lastInd > prevInd)) {
    return 0.8;
  }
  return 0;
}

function emaSmooth(value, prev, alpha = 0.2) {
  if (typeof prev !== 'number') return value;
  return prev * (1 - alpha) + value * alpha;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function computeVolatilityMultiplier(atr, price) {
  if (!price || price === 0) return 1;
  const atrNorm = atr / price;
  const k = 5;
  const factor = 1 / (1 + k * atrNorm);
  return clamp(factor, 0.3, 1);
}

function computePositionSizing(signalValue, accountRisk = 0.02, maxPosition = 0.2) {
  const target = (signalValue - 50) / 50;
  const fraction = clamp(target, -1, 1);
  const size = fraction * maxPosition;
  return clamp(size, -maxPosition, maxPosition);
}

function computeStops(currentPrice, atr, slMult = 1.5, tpMult = 2.5) {
  const sl = currentPrice - slMult * atr;
  const tp = currentPrice + tpMult * atr;
  return { stopLoss: Math.max(0, sl), takeProfit: Math.max(0, tp) };
}

function mergeTimeframesShortLong(data) {
  const shortPrices = Array.isArray(data.prices) ? data.prices : [];
  const longPrices = Array.isArray(data.longPrices) ? data.longPrices : shortPrices;
  return { shortPrices, longPrices };
}

function calculateCompositeScore(parts, weights) {
  let sum = 0;
  let wsum = 0;
  for (const k in parts) {
    if (Object.prototype.hasOwnProperty.call(weights, k)) {
      const w = weights[k];
      sum += parts[k] * w;
      wsum += w;
    }
  }
  return wsum === 0 ? 0 : sum / wsum;
}

function recordSignal(symbol, result) {
  SIGNAL_HISTORY.push({
    timestamp: Date.now(),
    symbol,
    result
  });
  if (SIGNAL_HISTORY.length > 5000) SIGNAL_HISTORY.shift();
}

function calculateBotSignal(data, options = {}) {
  if (!validateData(data)) {
    // Build a useful message explaining why data are insufficient
    let reasonMsg = '';
    if (!data) {
      reasonMsg = 'Aucune donnée reçue pour ce symbole.';
    } else {
      const prices = Array.isArray(data.prices) ? data.prices : [];
      const vols = Array.isArray(data.volumes) ? data.volumes : [];
      const highs = Array.isArray(data.highs) ? data.highs : [];
      const lows = Array.isArray(data.lows) ? data.lows : [];

      const clauses = [];
      if (prices.length < 5) clauses.push(`pas assez de points de prix (requis: 5, reçus: ${prices.length})`);
      if (vols.length === 0) clauses.push(`les volumes sont manquants (l'analyse de volume est indisponible)`);
      if (highs.length === 0 || lows.length === 0) clauses.push(`les valeurs haut/bas intraday sont absentes (l'ATR et les mesures de volatilité peuvent être inexactes)`);

      if (clauses.length === 0) {
        reasonMsg = 'Données incomplètes pour effectuer l\'analyse technique.';
      } else if (clauses.length === 1) {
        // Capitalize first letter and finish with a period
        reasonMsg = clauses[0].charAt(0).toUpperCase() + clauses[0].slice(1) + '.';
      } else {
        // Join into a single natural sentence using commas and 'et' before last clause
        const allButLast = clauses.slice(0, -1).join(', ');
        const last = clauses[clauses.length - 1];
        reasonMsg = allButLast.charAt(0).toUpperCase() + allButLast.slice(1) + ' et ' + last + '.';
      }
    }

    return {
      signalValue: 50,
      signalTitle: 'Garder',
      signalDesc: 'Données insuffisantes',
      explanation: 'Données insuffisantes',
      insufficientReason: reasonMsg,
      details: {}
    };
  }

  const symbol = data.symbol || options.symbol || 'UNKNOWN';
  const currentPrice = typeof data.price === 'number' ? data.price : safeArray(data.prices).slice(-1)[0];
  const volumes = safeArray(data.volumes);
  const highs = Array.isArray(data.highs) ? data.highs : safeArray(data.prices);
  const lows = Array.isArray(data.lows) ? data.lows : safeArray(data.prices);
  const closes = safeArray(data.prices);
  const { shortPrices, longPrices } = mergeTimeframesShortLong(data);

  const rsiShort = calculateRSI(shortPrices, 14);
  const rsiLong = calculateRSI(longPrices, 50);
  const macdShort = calculateMACD(shortPrices);
  const macdLong = calculateMACD(longPrices);
  const sma20 = calculateSMA(shortPrices, 20);
  const sma50 = calculateSMA(longPrices, 50);
  const sma200 = calculateSMA(longPrices, 200);
  const momentum = calculateMomentum(shortPrices, 10);
  const volumeRatio = calculateVolumeRatio(volumes, 20);
  const atr = calculateATR(highs, lows, closes, 14);
  const stddev = calculateStdDev(shortPrices, 20);
  const divergenceMACD = detectDivergence(shortPrices, Array.isArray(shortPrices) ? shortPrices.map((v, i) => {
    return i < shortPrices.length - 1 ? shortPrices[i + 1] - shortPrices[i] : 0;
  }) : [], 14);
  const divergenceRSI = detectDivergence(shortPrices, safeArray(shortPrices).map((p, i) => {
    return i % 3 === 0 ? calculateRSI(shortPrices.slice(0, i + 1), 14) : 0;
  }), 14);

  const rsiScore = normalizeRSI(rsiShort) * 0.9 + normalizeRSI(rsiLong) * 0.1;
  const macdScore = normalizeMACD(macdShort) * 0.9 + normalizeMACD(macdLong) * 0.1;
  const smaScore = normalizeSMA(currentPrice, sma20) * 0.6 + normalizeSMA(currentPrice, sma50) * 0.3 + normalizeSMA(currentPrice, sma200) * 0.1;
  const momentumScore = normalizeMomentum(momentum);
  const volumeScore = normalizeVolume(volumeRatio);

  const indicatorParts = {
    rsi: rsiScore,
    macd: macdScore,
    sma: smaScore,
    momentum: momentumScore,
    volume: volumeScore
  };

  const weights = {
    rsi: 0.18,
    macd: 0.26,
    sma: 0.26,
    momentum: 0.12,
    volume: 0.08
  };

  let weightedScore = calculateCompositeScore(indicatorParts, weights);

  const divergencePenalty = Math.max(divergenceMACD, divergenceRSI);
  if (divergencePenalty > 0) weightedScore *= (1 - 0.5 * divergencePenalty);

  const volMultiplier = computeVolatilityMultiplier(atr, currentPrice);
  weightedScore *= volMultiplier;

  let prevSmoothed = options.prevSmoothed;
  const smoothed = emaSmooth(weightedScore, prevSmoothed, 0.15);

  const finalScore = clamp(smoothed, -1, 1);

  const signalValue = Math.round(clamp(((finalScore + 1) / 2) * 100, 0, 100));

  const positionSize = computePositionSizing(signalValue, options.accountRisk || 0.02, options.maxPosition || 0.25);

  const stops = computeStops(currentPrice, atr, options.slMult || 1.5, options.tpMult || 2.5);

  let signalTitle = 'Garder';
  let signalDesc = 'Position neutre - Attendre';
  if (signalValue >= 80) {
    signalTitle = 'Acheter';
    signalDesc = 'Achat très fort';
  } else if (signalValue >= 65) {
    signalTitle = 'Acheter';
    signalDesc = 'Achat confirmé';
  } else if (signalValue >= 55) {
    signalTitle = 'Acheter';
    signalDesc = 'Achat modéré';
  } else if (signalValue >= 45) {
    signalTitle = 'Garder';
    signalDesc = 'Neutre';
  } else if (signalValue >= 30) {
    signalTitle = 'Vendre';
    signalDesc = 'Vente modérée';
  } else {
    signalTitle = 'Vendre';
    signalDesc = 'Vente forte';
  }

  const explanation = {
    rsi: rsiShort,
    macdHistogram: macdShort.histogram,
    sma20,
    sma50,
    sma200,
    momentum,
    volumeRatio,
    atr,
    stddev,
    divergenceMACD,
    divergenceRSI,
    weightedScore: weightedScore,
    volatilityMultiplier: volMultiplier,
    smoothed,
    positionSize,
    stopLoss: stops.stopLoss,
    takeProfit: stops.takeProfit
  };

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
  if (!signalCursor || !signalStateContainer || !signalStateTitle || !signalStateDescription) {
    return;
  }
  const cursorPosition = signalResult.signalValue;
  signalCursor.style.left = `${cursorPosition}%`;
  signalStateContainer.className = `signal-state-container ${
    signalResult.signalDesc === 'Données insuffisantes' ? 'insufficient-state' :
    signalResult.signalTitle === 'Acheter' ? 'buy-state' :
    signalResult.signalTitle === 'Vendre' ? 'sell-state' : ''
  }`;

  // Get current period for the symbol
  const currentPeriod = window.positions && window.positions[symbol] ? window.positions[symbol].currentPeriod || '1D' : '1D';

  signalStateTitle.textContent = signalResult.signalDesc;

  // Build a user-facing recommendation line starting with 'Conseillé :' depending on the state
  try {
    const title = signalResult.signalTitle || '';
    const desc = signalResult.signalDesc || '';
    let advice = '';

    if (desc === 'Données insuffisantes') {
      // For insufficient data, show the natural reason sentence (no 'Conseillé:' prefix) as requested
      signalStateDescription.textContent = signalResult.insufficientReason || `Données insuffisantes pour la période ${currentPeriod}.`;
    } else if (title === 'Acheter') {
      if (desc.toLowerCase().includes('très')) {
        advice = 'acheter maintenant ; envisager une allocation plus importante en respectant strictement votre gestion du risque et les stops.';
      } else if (desc.toLowerCase().includes('confirm')) {
        advice = 'acheter ; prendre position selon votre plan et gérer la taille de la position selon votre tolérance au risque.';
      } else if (desc.toLowerCase().includes('modéré')) {
        advice = 'entrer progressivement (acheter par paliers) et surveiller le signal.';
      } else {
        advice = 'considérer un achat selon votre stratégie personnelle.';
      }
      signalStateDescription.textContent = `Conseillé : ${advice}`;
    } else if (title === 'Garder') {
      advice = 'ne rien changer pour l\'instant ; surveiller l\'évolution et attendre une confirmation.';
      signalStateDescription.textContent = `Conseillé : ${advice}`;
    } else if (title === 'Vendre') {
      if (desc.toLowerCase().includes('modéré')) {
        advice = 'prendre des bénéfices partiels ou réduire légèrement l\'exposition en suivant votre plan de gestion du risque.';
      } else {
        advice = 'vendre et réduire significativement la position ; envisager des couvertures si nécessaire.';
      }
      signalStateDescription.textContent = `Conseillé : ${advice}`;
    } else {
      // Fallback: show period with suggestion to monitor
      signalStateDescription.textContent = `Conseillé : surveiller la période ${currentPeriod} et agir selon votre plan.`;
    }
  } catch (err) {
    // Fallback to previous behavior if anything goes wrong
    signalStateDescription.textContent = `Signal d'achat/vente pour ${currentPeriod}`;
    console.warn('updateSignalUI: unable to build advice text', err);
  }
  // Hide signal labels and bar when data is insufficient, show them otherwise
  try {
    const cardRoot = document.querySelector(`#card-${symbol}`);
    if (cardRoot) {
      const labelsEl = cardRoot.querySelector('.signal-labels');
      const barEl = cardRoot.querySelector('.signal-bar');
      if (signalResult.signalDesc === 'Données insuffisantes') {
        if (labelsEl) labelsEl.style.display = 'none';
        if (barEl) barEl.style.display = 'none';
      } else {
        if (labelsEl) labelsEl.style.display = '';
        if (barEl) barEl.style.display = '';
      }
    }
  } catch (err) {
    // Non-fatal: if DOM nodes not found, continue silently
    console.warn('updateSignalUI: unable to toggle signal labels/bar', err);
  }
  const explanationSelector = `#card-${symbol} .signal-explanation`;
  const contentSelector = `#card-${symbol} .explanation-content`;
  const signalExplanation = document.querySelector(explanationSelector);
  const explanationContent = document.querySelector(contentSelector);
  if (signalExplanation && explanationContent) {
    // Cacher seulement si données insuffisantes
    if (signalResult.signalDesc === 'Données insuffisantes') {
      signalExplanation.style.display = 'none';
    } else {
      signalExplanation.style.display = 'block';
      const e = signalResult.explanation;

      // Function to determine color class for each indicator value
      const getValueColor = (indicator, value) => {
        switch(indicator) {
          case 'rsi':
            if (value < 30) return 'signal-value-buy'; // Oversold - good to buy
            if (value > 70) return 'signal-value-sell'; // Overbought - good to sell
            return 'signal-value-neutral'; // Neutral zone

          case 'macd':
            if (value > 0.001) return 'signal-value-buy'; // Bullish
            if (value < -0.001) return 'signal-value-sell'; // Bearish
            return 'signal-value-neutral'; // Neutral

          case 'momentum':
            if (value > 1) return 'signal-value-buy'; // Positive momentum
            if (value < -1) return 'signal-value-sell'; // Negative momentum
            return 'signal-value-neutral'; // No significant momentum

          case 'volume':
            if (value > 1.5) return 'signal-value-buy'; // Very high volume
            if (value < 0.7) return 'signal-value-sell'; // Very low volume
            return 'signal-value-neutral'; // Normal volume

          case 'atr':
            if (value > 3) return 'signal-value-sell'; // Very high volatility
            if (value < 0.3) return 'signal-value-buy'; // Very low volatility
            return 'signal-value-neutral'; // Normal volatility

          case 'volatilityMultiplier':
            if (value < 0.7) return 'signal-value-buy'; // Signal significantly strengthened
            if (value > 1.3) return 'signal-value-sell'; // Signal significantly weakened
            return 'signal-value-neutral'; // Normal adjustment

          case 'smoothed':
            if (value > 0.3) return 'signal-value-buy'; // Strong buy signal
            if (value < -0.3) return 'signal-value-sell'; // Strong sell signal
            return 'signal-value-neutral'; // Weak signal

          case 'positionSize':
            if (value > 0.2) return 'signal-value-buy'; // Large position
            if (value < 0.03) return 'signal-value-sell'; // Very small position
            return 'signal-value-neutral'; // Normal position

          default:
            // For SMA values and others that don't significantly impact status
            return 'signal-value-neutral';
        }
      };

      explanationContent.innerHTML = `
        <table class="signal-explanation-table">
          <thead>
            <tr>
              <th class="signal-table-header">Indicateur</th>
              <th class="signal-table-header">Valeur</th>
              <th class="signal-table-header">Explication</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="signal-table-cell">RSI</td>
              <td class="signal-table-cell ${getValueColor('rsi', e.rsi || 0)}">${(e.rsi || 0).toFixed(2)}</td>
              <td class="signal-table-cell">Mesure si l'actif est suracheté (>70) ou survendu (<30). ${e.rsi < 45 ? 'Zone d\'achat' : e.rsi > 55 ? 'Zone de vente' : 'Neutre'}</td>
            </tr>
            <tr>
              <td class="signal-table-cell">MACD Histogramme</td>
              <td class="signal-table-cell ${getValueColor('macd', e.macdHistogram || 0)}">${(e.macdHistogram || 0).toFixed(4)}</td>
              <td class="signal-table-cell">Compare deux moyennes mobiles. ${e.macdHistogram > 0 ? 'Tendance haussière' : 'Tendance baissière'}</td>
            </tr>
            <tr>
              <td class="signal-table-cell">SMA20</td>
              <td class="signal-table-cell ${getValueColor('sma20', e.sma20 || 0)}">${(e.sma20 || 0).toFixed(2)}</td>
              <td class="signal-table-cell">Prix moyen des 20 dernières périodes</td>
            </tr>
            <tr>
              <td class="signal-table-cell">SMA50</td>
              <td class="signal-table-cell ${getValueColor('sma50', e.sma50 || 0)}">${(e.sma50 || 0).toFixed(2)}</td>
              <td class="signal-table-cell">Prix moyen des 50 dernières périodes</td>
            </tr>
            <tr>
              <td class="signal-table-cell">SMA200</td>
              <td class="signal-table-cell ${getValueColor('sma200', e.sma200 || 0)}">${(e.sma200 || 0).toFixed(2)}</td>
              <td class="signal-table-cell">Tendance long terme</td>
            </tr>
            <tr>
              <td class="signal-table-cell">Momentum</td>
              <td class="signal-table-cell ${getValueColor('momentum', e.momentum || 0)}">${(e.momentum || 0).toFixed(2)}%</td>
              <td class="signal-table-cell">Vitesse du mouvement des prix</td>
            </tr>
            <tr>
              <td class="signal-table-cell">Volume Ratio</td>
              <td class="signal-table-cell ${getValueColor('volume', e.volumeRatio || 0)}">${(e.volumeRatio || 0).toFixed(2)}</td>
              <td class="signal-table-cell">Volume actuel vs moyenne</td>
            </tr>
            <tr>
              <td class="signal-table-cell">ATR</td>
              <td class="signal-table-cell ${getValueColor('atr', e.atr || 0)}">${(e.atr || 0).toFixed(4)}</td>
              <td class="signal-table-cell">Mesure de la volatilité des prix</td>
            </tr>
            <tr>
              <td class="signal-table-cell">Volatilité Multiplier</td>
              <td class="signal-table-cell ${getValueColor('volatilityMultiplier', e.volatilityMultiplier || 0)}">${(e.volatilityMultiplier || 0).toFixed(4)}</td>
              <td class="signal-table-cell">Réduction du signal en période volatile</td>
            </tr>
            <tr>
              <td class="signal-table-cell">Signal Lissé</td>
              <td class="signal-table-cell ${getValueColor('smoothed', e.smoothed || 0)}">${(e.smoothed || 0).toFixed(4)}</td>
              <td class="signal-table-cell">Signal final après tous les calculs</td>
            </tr>
            <tr>
              <td class="signal-table-cell">Taille Position</td>
              <td class="signal-table-cell ${getValueColor('positionSize', e.positionSize || 0)}">${((e.positionSize || 0) * 100).toFixed(2)}%</td>
              <td class="signal-table-cell">Pourcentage du portefeuille à investir</td>
            </tr>
            <tr>
              <td class="signal-table-cell">Stop Loss</td>
              <td class="signal-table-cell signal-value-neutral">${(e.stopLoss || 0).toFixed(4)}</td>
              <td class="signal-table-cell">Niveau de vente automatique pour limiter pertes</td>
            </tr>
            <tr>
              <td class="signal-table-cell">Take Profit</td>
              <td class="signal-table-cell signal-value-neutral">${(e.takeProfit || 0).toFixed(4)}</td>
              <td class="signal-table-cell">Niveau de vente automatique pour prendre bénéfices</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top:25px;font-size:10px;color:#fff;opacity:0.5;line-height:1.4;text-align:left;">
          Disclaimer : Ce signal est fourni à titre informatif uniquement et ne constitue pas un conseil en investissement. Investissez uniquement ce que vous pouvez vous permettre de perdre.
        </div>
      `;
      // Supprimer l'ancien disclaimer s'il existe
      const card = document.querySelector(`#card-${symbol}`);
      if (card) {
        const oldDisclaimer = card.querySelector('.signal-disclaimer-root');
        if (oldDisclaimer) {
          oldDisclaimer.remove();
        }
      }
    }
  }
  signalCursor.classList.add('animated');
  setTimeout(() => {
    signalCursor.classList.remove('animated');
  }, 1200);

  // Initialize custom tooltips for signal info icons
  initializeCustomTooltips();

  console.log(`=== BOT SIGNAL for ${symbol} ===`);
  console.log(`Signal: ${signalResult.signalValue}% - ${signalResult.signalTitle}`);
  console.log(`Details:`, signalResult.details);
}

function updateSignal(symbol, data, options = {}) {
  const signalResult = calculateBotSignal(Object.assign({}, data, { symbol }), options);
  updateSignalUI(symbol, signalResult);
  return signalResult;
}

// Custom tooltip functionality for signal info icons
function initializeCustomTooltips() {
  // Remove existing tooltips first
  const existingTooltips = document.querySelectorAll('.custom-tooltip');
  existingTooltips.forEach(tooltip => tooltip.remove());

  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'custom-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    background: rgba(26, 26, 30, 0.95);
    color: #e8e9f3;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: 'Poppins', sans-serif;
    max-width: 250px;
    z-index: 10000;
    pointer-events: none;
    opacity: 0;
    transform: translateY(-5px);
    transition: all 0.2s ease;
    border: 1px solid rgba(168, 162, 255, 0.3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    line-height: 1.4;
  `;
  document.body.appendChild(tooltip);

  // Add event listeners to all signal info icons
  const infoIcons = document.querySelectorAll('.signal-info-icon');

  infoIcons.forEach(icon => {
    let hideTimeout;

    icon.addEventListener('mouseenter', (e) => {
      clearTimeout(hideTimeout);

      const tooltipText = e.target.getAttribute('data-tooltip');
      if (!tooltipText) return;

      tooltip.textContent = tooltipText;

      // Position the tooltip
      const rect = e.target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
      let top = rect.top - tooltipRect.height - 8;

      // Adjust if tooltip goes off screen
      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }

      // If tooltip would go above viewport, show it below
      if (top < 10) {
        top = rect.bottom + 8;
      }

      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    });

    icon.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(() => {
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(-5px)';
      }, 150);
    });
  });

  // Hide tooltip when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('signal-info-icon')) {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(-5px)';
    }
  });
}

export { calculateBotSignal, updateSignal, updateSignalUI, SIGNAL_HISTORY };
