// Utilise la valeur brute de api_mapping.polygon pour le symbole dans les fetchs
export function getPolygonSymbol(stock) {
  return stock.api_mapping.polygon;
}

const periods = {
  "1D": { multiplier: 1, timespan: "minute", days: 1 },
  "1W": { multiplier: 5, timespan: "minute", days: 5 },
  "1M": { multiplier: 15, timespan: "minute", days: 30 },
  "6M": { multiplier: 1, timespan: "hour", days: 180 },
  "1Y": { multiplier: 1, timespan: "day", days: 365 },
  "3Y": { multiplier: 1, timespan: "week", days: 1095 },
  "5Y": { multiplier: 1, timespan: "month", days: 1825 }
};

import globalRateLimiter from '../rate-limiter.js';

export async function fetchFromPolygon(ticker, period, symbol, typeOrStock, name, signal, apiKey) {
  // Utilise symbol pour Polygon, sans formatage
  console.log(`\n🔍 === FETCH Polygon ${symbol} (${name}) période ${period} ===`);

  // Le 4ème paramètre peut être soit un type (string), soit l'objet stock complet
  let type = typeOrStock;
  let currency = 'USD';
  let eurRate = 1;
  if (typeof typeOrStock === 'object' && typeOrStock !== null) {
    type = typeOrStock.type;
    currency = typeOrStock.currency || 'USD';
    if (typeof typeOrStock.eurRate === 'number') {
      eurRate = typeOrStock.eurRate;
    }
    console.log(`📦 Objet stock reçu, type extrait: ${type}, currency: ${currency}`);
  }
  if (!type) {
    console.error(`❌ Type non fourni pour ${symbol}. Ajoutez le champ "type" dans stocks.json!`);
    console.log(`   Exemples: "type": "equity" | "crypto" | "commodity" | "forex"`);
  } else {
    console.log(`📋 Type d'asset: ${type}`);
  }

  // Utiliser la valeur brute de api_mapping.polygon pour le fetch
  const polygonSymbol = getPolygonSymbol(typeOrStock);

  const result = await globalRateLimiter.executeIfNotLimited(async () => {
    const cfg = periods[period] || periods["1D"];
    
    // End date: yesterday (to ensure data is available)
    const to = new Date();
    to.setDate(to.getDate() - 1);
    to.setHours(23, 59, 59, 999);
    
    // Start date: go back the configured number of days from yesterday
    const from = new Date(to.getTime() - cfg.days * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);
    
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(polygonSymbol)}/range/${cfg.multiplier}/${cfg.timespan}/${fromStr}/${toStr}?apiKey=${apiKey}`;

    console.log(`📡 Requête Polygon API: ${polygonSymbol} multiplier=${cfg.multiplier} timespan=${cfg.timespan} from=${fromStr} to=${toStr}`);

    try {
      const r = await fetch(url, { signal });
      console.log(`📥 Réponse Polygon: ${r.status} ${r.statusText}`);

      if (r.status === 429) {
        console.log(`⏳ Rate limit Polygon atteint (429)`);
        globalRateLimiter.setRateLimitForApi('massive', 60000);
        return { source: "massive", error: true, errorCode: 429, throttled: true };
      }

      if (!r.ok) {
        const errorText = await r.text();
        console.warn(`⚠️ Erreur API Polygon: ${errorText}`);
        return { source: "massive", error: true, errorCode: r.status, errorMessage: errorText || "Erreur API" };
      }

      const j = await r.json();

      if (j.error) {
        console.log(`⚠️ Erreur dans la réponse JSON Polygon: ${j.error}`);
        return { source: "massive", error: true, errorCode: 404, errorMessage: j.error };
      }

      if (!j.results || j.results.length === 0) {
        console.log(`⚠️ Aucune donnée Polygon pour ${polygonSymbol} (résultats vides)`);
        console.log(`   Status: ${j.status}, Ticker: ${j.ticker || 'N/A'}, Count: ${j.resultsCount || 0}`);
        return {
          source: "massive",
          error: true,
          errorCode: 404,
          errorMessage: "Aucune donnée disponible"
        };
      }

      const results = j.results;
      console.log(`✅ ${results.length} points de données bruts récupérés de Polygon`);

      const timestamps = results.map(r => Math.floor(r.t / 1000));
      const prices = results.map(r => r.c);

      console.log(`ℹ️ Traitement des données: ${timestamps.length} timestamps, ${prices.length} prix`);

      let data = {
        source: "massive",
        timestamps,
        prices: [...prices],
        open: results[0].o,
        high: Math.max(...results.map(r => r.h)),
        low: Math.min(...results.map(r => r.l)),
        price: results[results.length - 1].c
      };

      // Currency management: if not USD, convert to EUR using eurRate
      if ((type === 'commodity' || type === 'crypto') && currency === 'EUR' && eurRate && eurRate !== 1) {
        data.price = data.price * eurRate;
        data.open = data.open * eurRate;
        data.high = data.high * eurRate;
        data.low = data.low * eurRate;
        data.prices = data.prices.map(p => p * eurRate);
        console.log(`💶 Conversion USD→EUR appliquée (rate: ${eurRate})`);
      }

      data.changePercent = ((data.price - data.open) / data.open) * 100;
      data.change = data.price - data.open;

      console.log(`✅ Données Polygon traitées: ${results.length} points conservés`);
      console.log(`💰 Prix Polygon: ${data.price?.toFixed(2)} (variation: ${data.changePercent?.toFixed(2)}%)`);

      return data;

    } catch (e) {
      if (e.name === 'AbortError') {
        console.log(`🚫 Requête Polygon annulée pour ${polygonSymbol}`);
        throw e;
      }
      console.error(`💥 Erreur Polygon pour ${polygonSymbol}:`, e.message);
      return { source: "massive", error: true, errorCode: 500, errorMessage: e.message };
    }
  }, 'massive');

  return result;
}