// alphavantage.js - Alpha Vantage API integration for stock app

// Utilise la valeur brute de api_mapping.alpha_vantage pour le symbole dans les fetchs
export function getAlphaVantageSymbol(stockOrTicker) {
  if (!stockOrTicker) return null;
  if (typeof stockOrTicker === 'string') return stockOrTicker;
  if (stockOrTicker.api_mapping && stockOrTicker.api_mapping.alpha_vantage) return stockOrTicker.api_mapping.alpha_vantage;
  return stockOrTicker.ticker || null;
}

import globalRateLimiter from '../rate-limiter.js';
import { filterNullDataPoints } from '../general.js';

const periods = {
  "1D": { days: 1 },
  "1W": { days: 7 },
  "1M": { days: 31 },
  "6M": { days: 183 },
  "1Y": { days: 365 },
  "3Y": { days: 1095 },
  "5Y": { days: 1825 },
  "MAX": { days: 7300 }
};

const cache = new Map();

export async function fetchFromAlphaVantage(ticker, period, symbol, typeOrStock, name, signal, apiKey) {
  console.log(`\n🔍 === FETCH Alpha Vantage ${ticker} (${name}) période ${period} ===`);
  const key = `${ticker}:${period}`;

  try {
    // Utiliser la valeur brute de api_mapping.alpha_vantage pour le fetch
    const alphaVantageSymbol = getAlphaVantageSymbol(typeOrStock) || ticker || symbol;
    
    const cfg = periods[period] || periods["1D"];

    // Alpha Vantage a des limites: 5 appels/minute, 500/jour pour free tier
    // On utilise TIME_SERIES_DAILY qui donne les 100 derniers jours par défaut
    // Pour plus de données, il faudrait utiliser un endpoint premium

    const url = `https://alpha-vantage.p.rapidapi.com/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(alphaVantageSymbol)}&outputsize=compact&datatype=json`;

    console.log(`📡 Requête Alpha Vantage API: ${alphaVantageSymbol}`);

    const response = await globalRateLimiter.executeIfNotLimited(
      () => fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'alpha-vantage.p.rapidapi.com'
        },
        signal
      }),
      'Alpha Vantage'
    );

    console.log(`📥 Réponse Alpha Vantage: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️ Erreur API Alpha Vantage:`, errorText);
      
      // Si c'est une erreur 429, activer le rate limiter pour cette API
      if (response.status === 429) {
        globalRateLimiter.setRateLimitForApi('alphavantage', 60000); // 60 secondes par défaut
      }
      
      return {
        source: "alphavantage",
        error: true,
        errorCode: response.status,
        errorMessage: errorText || "Erreur API"
      };
    }

    const j = await response.json();

    if (j['Error Message'] || j['Note']) {
      console.warn(`⚠️ Erreur Alpha Vantage:`, j['Error Message'] || j['Note']);
      
      // Si c'est un message de rate limit, activer le rate limiter pour cette API
      const errorMsg = (j['Error Message'] || j['Note'] || '').toLowerCase();
      if (errorMsg.includes('rate limit') || errorMsg.includes('exceeded')) {
        globalRateLimiter.setRateLimitForApi('alphavantage', 60000); // 60 secondes par défaut
      }
      
      return {
        source: "alphavantage",
        error: true,
        errorCode: 429,
        errorMessage: j['Error Message'] || j['Note'],
        throttled: true
      };
    }

    if (!j['Time Series (Daily)']) {
      console.warn(`⚠️ Aucune donnée Alpha Vantage pour ${alphaVantageSymbol}.`, j);
      return {
        source: "alphavantage",
        error: true,
        errorCode: 404,
        errorMessage: "Aucune donnée disponible"
      };
    }

    const timeSeries = j['Time Series (Daily)'];
    const dates = Object.keys(timeSeries).sort(); // Trier par date croissante

    console.log(`✅ ${dates.length} points de données quotidiens récupérés de Alpha Vantage`);

    // Pour les périodes courtes (1D), prendre le dernier point disponible
    // Pour les périodes longues, filtrer selon la plage demandée
    let relevantDates;
    if (period === "1D") {
      // Pour 1D, prendre seulement le dernier point de données disponible
      relevantDates = [dates[dates.length - 1]];
      console.log(`ℹ️ Période 1D: utilisation du dernier point disponible (${relevantDates[0]})`);
    } else {
      // Pour les autres périodes, filtrer selon la plage
      const to = new Date();
      const from = new Date(to.getTime() - (cfg.days * 24 * 60 * 60 * 1000));

      relevantDates = dates.filter(dateStr => {
        const date = new Date(dateStr);
        return date >= from && date <= to;
      });
    }

    if (relevantDates.length === 0) {
      return {
        source: "alphavantage",
        error: true,
        errorCode: 404,
        errorMessage: "Pas de données pour cette période"
      };
    }

    // Créer les tableaux de données
    const prices = relevantDates.map(date => parseFloat(timeSeries[date]['4. close']) || 0);
    const timestamps = relevantDates.map(date => Math.floor(new Date(date).getTime() / 1000));

    // Filtrer les points null dès la source
    const { timestamps: filteredTimestamps, prices: filteredPrices } = filterNullDataPoints(timestamps, prices);

    console.log(`🔍 Données brutes: ${timestamps.length} points, après filtrage: ${filteredTimestamps.length} points valides`);

    if (filteredTimestamps.length === 0) {
      console.log(`📊 ${alphaVantageSymbol} - Aucune donnée valide après filtrage des valeurs null`);
      return { source: "alphavantage", error: true, errorCode: "NO_VALID_DATA" };
    }

    const data = {
      source: "alphavantage",
      timestamps: filteredTimestamps,
      prices: filteredPrices,
      open: parseFloat(timeSeries[relevantDates[0]]['1. open']) || filteredPrices[0],
      high: Math.max(...filteredPrices),
      low: Math.min(...filteredPrices),
      price: filteredPrices[filteredPrices.length - 1]
    };

    // Pour 1D avec un seul point, utiliser la même valeur pour open/high/low si pas disponible
    if (period === "1D" && relevantDates.length === 1) {
      const dayData = timeSeries[relevantDates[0]];
      const closePrice = parseFloat(dayData['4. close']) || 0;
      data.open = parseFloat(dayData['1. open']) || closePrice;
      data.high = parseFloat(dayData['2. high']) || closePrice;
      data.low = parseFloat(dayData['3. low']) || closePrice;
      data.price = closePrice;
      console.log(`ℹ️ Période 1D: OHLC ajusté - O:${data.open} H:${data.high} L:${data.low} C:${data.price}`);
    }

    if (data.open && data.price) {
      data.changePercent = ((data.price - data.open) / data.open) * 100;
      data.change = data.price - data.open;
    } else {
      data.changePercent = 0;
      data.change = 0;
    }

    console.log(`💰 Prix Alpha Vantage: ${data.price?.toFixed(2)} USD`);
    cache.set(key, { data, ts: Date.now() });
    return data;

  } catch (e) {
    if (e.name === 'AbortError') {
      console.log(`🚫 Requête Alpha Vantage annulée pour ${alphaVantageSymbol}`);
      throw e;
    }
    
    console.error(`💥 Erreur Alpha Vantage pour ${alphaVantageSymbol}:`, e.message);
    return {
      source: "alphavantage",
      error: true,
      errorCode: 500,
      errorMessage: e.message
    };
  }
}