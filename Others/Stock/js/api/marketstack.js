import globalRateLimiter from '../rate-limiter.js';
import { filterNullDataPoints, filterNullOHLCDataPoints } from '../general.js';

// Utilise la valeur brute de api_mapping.marketstack pour le symbole dans les fetchs
export function getMarketstackSymbol(stockOrTicker) {
  if (!stockOrTicker) return null;
  if (typeof stockOrTicker === 'string') return stockOrTicker;
  if (stockOrTicker.api_mapping && stockOrTicker.api_mapping.marketstack) return stockOrTicker.api_mapping.marketstack;
  return stockOrTicker.ticker || null;
}

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

export async function fetchFromMarketstack(ticker, period, symbol, typeOrStock, name, signal, apiKey) {
  console.log(`\n🔍 === FETCH Marketstack ${ticker} (${name}) période ${period} ===`);
  const key = `${ticker}:${period}`;

  try {
    // Utiliser la valeur brute de api_mapping.marketstack pour le fetch
    const marketstackSymbol = getMarketstackSymbol(typeOrStock) || symbol || ticker;
    
    const cfg = periods[period] || periods["1D"];
    const to = new Date();
    const from = new Date(to.getTime() - (cfg.days * 24 * 60 * 60 * 1000));
    const toDate = to.toISOString().split('T')[0];
    const fromDate = from.toISOString().split('T')[0];

    const endpoint = 'eod';
    let url;

    if (period === "1D") {
      // Pour 1D → on récupère le dernier EOD connu
      url = `https://api.marketstack.com/v1/${endpoint}/latest?access_key=${apiKey}&symbols=${encodeURIComponent(marketstackSymbol)}`;
    } else {
      // Autres périodes → plage de dates
      url = `https://api.marketstack.com/v1/${endpoint}?access_key=${apiKey}&symbols=${encodeURIComponent(marketstackSymbol)}&date_from=${fromDate}&date_to=${toDate}&limit=1000`;
    }

    console.log(`📡 Requête Marketstack API (EOD): ${marketstackSymbol}`);
    const r = await globalRateLimiter.executeIfNotLimited(
      () => fetch(url, { signal }),
      'Marketstack'
    );
    console.log(`📥 Réponse Marketstack: ${r.status} ${r.statusText}`);

    if (!r.ok) {
      const errJson = await r.json().catch(() => ({}));
      console.warn(`⚠️ Erreur API Marketstack:`, errJson);
      return {
        source: "marketstack",
        error: true,
        errorCode: r.status,
        errorMessage: errJson?.error?.message || "Erreur API"
      };
    }

    const j = await r.json();
    const dataArray = j?.data ? j.data : Array.isArray(j) ? j : [j];

    if (!dataArray.length) {
      console.warn(`⚠️ Aucun résultat Marketstack pour ${marketstackSymbol}.`, j);
      return {
        source: "marketstack",
        error: true,
        errorCode: 404,
        errorMessage: "Aucune donnée"
      };
    }

    console.log(`✅ ${dataArray.length} points de données EOD récupérés de Marketstack`);

    // MarketStack peut renvoyer les données dans différents ordres selon l'endpoint
    // Pour les plages de dates, s'assurer qu'elles sont du plus ancien au plus récent
    let sortedData = dataArray;
    if (dataArray.length > 1) {
      // Trier par date croissante (plus ancien au plus récent)
      sortedData = [...dataArray].sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    const prices = sortedData.map(k => k.close || 0);
    const timestamps = sortedData.map((k) => {
      const baseTime = Math.floor(new Date(k.date).getTime() / 1000);
      // Pour EOD, utiliser l'heure de clôture (16h)
      return baseTime + (16 * 60 * 60);
    });
    const opens = sortedData.map(k => k.open || 0);
    const highs = sortedData.map(k => k.high || 0);
    const lows = sortedData.map(k => k.low || 0);
    const closes = sortedData.map(k => k.close || 0);

    // Filtrer les points null dès la source
    const { timestamps: filteredTimestamps, opens: filteredOpens, highs: filteredHighs, lows: filteredLows, closes: filteredCloses } = filterNullOHLCDataPoints(timestamps, opens, highs, lows, closes);
    const filteredPrices = filteredCloses;

    console.log(`🔍 Données brutes: ${timestamps.length} points, après filtrage: ${filteredTimestamps.length} points valides`);

    if (filteredTimestamps.length === 0) {
      console.log(`📊 ${marketstackSymbol} - Aucune donnée valide après filtrage des valeurs null`);
      return { source: "marketstack", error: true, errorCode: "NO_VALID_DATA" };
    }

    const data = {
      source: "marketstack",
      timestamps: filteredTimestamps,
      prices: filteredPrices,
      opens: filteredOpens,
      highs: filteredHighs,
      lows: filteredLows,
      closes: filteredCloses,
      open: filteredOpens[0],
      high: Math.max(...filteredHighs),
      low: Math.min(...filteredLows),
      price: filteredPrices[filteredPrices.length - 1],
      exchange: sortedData[0]?.exchange || null
    };

    if (data.open && data.price) {
      data.changePercent = ((data.price - data.open) / data.open) * 100;
      data.change = data.price - data.open;
    } else {
      data.changePercent = 0;
      data.change = 0;
    }

    cache.set(key, { data, ts: Date.now() });
    return data;

  } catch (e) {
    if (e.name === 'AbortError') {
      console.log(`🚫 Requête Marketstack annulée pour ${marketstackSymbol}`);
      throw e;
    }
    console.error(`💥 Erreur Marketstack pour ${marketstackSymbol}:`, e.message);
    return {
      source: "marketstack",
      error: true,
      errorCode: 500,
      errorMessage: e.message
    };
  }
}
