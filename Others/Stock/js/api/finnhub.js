// Utilise la valeur brute de api_mapping.finnhub pour le symbole dans les fetchs
export function getFinnhubSymbol(stock) {
  return stock.api_mapping.finnhub;
}

const cache = new Map();

const resMap = {
  "1D": { res: "1", days: 1 },
  "1W": { res: "5", days: 7 },
  "1M": { res: "15", days: 31 },
  "6M": { res: "60", days: 183 },
  "1Y": { res: "D", days: 365 },
  "3Y": { res: "W", days: 1095 },
  "5Y": { res: "M", days: 1825 }
};

function toUnix(ts) { return Math.floor(ts/1000); }

import globalRateLimiter from '../rate-limiter.js';
import { filterNullDataPoints } from '../general.js';

export async function fetchFromFinnhub(ticker, period="1D", symbol, typeOrStock, name, signal, apiKey){
  const key = `${ticker}:${period}`;
  if (cache.has(key)) return cache.get(key).data;

  const result = await globalRateLimiter.executeIfNotLimited(async () => {
    try {
      // Utiliser la valeur brute de api_mapping.finnhub pour le fetch
      const finnhubSymbol = getFinnhubSymbol(typeOrStock);
      
      const cfg = resMap[period] || resMap["1D"];
      const to = new Date();
      const from = new Date(to.getTime() - cfg.days * 24*60*60*1000);
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(finnhubSymbol)}&resolution=${cfg.res}&from=${toUnix(from)}&to=${toUnix(to)}&token=${apiKey}`;
      console.log(`[Finnhub] req ${finnhubSymbol} ${period} -> ${url}`);
      const r = await fetch(url, { signal });
      console.log(`[Finnhub] status ${r.status}`);
      if (r.status === 429) {
        globalRateLimiter.setRateLimitForApi('finnhub', 60000);
        return { source: "finnhub", error: true, errorCode: 429, throttled: true };
      }
      const j = await r.json();
      if (j.s !== "ok" || !j.t?.length) return { source: "finnhub", error: true, errorCode: 404, raw: j, errorMessage: j.s || "no_data" };
      const prices = j.c;
      const timestamps = j.t;

      // Filtrer les points null dès la source
      const { timestamps: filteredTimestamps, prices: filteredPrices } = filterNullDataPoints(timestamps, prices);

      console.log(`🔍 Données brutes: ${timestamps.length} points, après filtrage: ${filteredTimestamps.length} points valides`);

      if (filteredTimestamps.length === 0) {
        console.log(`📊 ${finnhubSymbol} - Aucune donnée valide après filtrage des valeurs null`);
        return { source: "finnhub", error: true, errorCode: "NO_VALID_DATA" };
      }

      const data = {
        source: "finnhub",
        timestamps: filteredTimestamps,
        prices: filteredPrices,
        open: filteredPrices[0] ?? null,
        high: Math.max(...filteredPrices),
        low: Math.min(...filteredPrices),
        price: filteredPrices[filteredPrices.length-1] ?? null
      };
      if (data.open && data.price) {
        data.change = data.price - data.open;
        data.changePercent = (data.change / data.open) * 100;
      } else { data.change = 0; data.changePercent = 0; }
      cache.set(key, { data, ts: Date.now() });
      return data;
    } catch (e) {
      if (e.name === "AbortError") { console.log("🚫 Requête Finnhub annulée"); throw e; }
      console.error("Erreur Finnhub:", e.message || e);
      return { source: "finnhub", error: true, errorCode: 500, errorMessage: e.message || String(e) };
    }
  }, 'finnhub');

  return result;
}
