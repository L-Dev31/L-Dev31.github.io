// Utilise la valeur brute de api_mapping.yahoo pour le symbole dans les fetchs
export function getYahooSymbol(stock) {
  return stock.api_mapping.yahoo;
}

const YAHOO_PROXY_BASE_URL = 'https://corsproxy.io/'; 

const periods = {
  "1D": { interval: "1m", range: "1d" },
  "1W": { interval: "5m", range: "5d" },
  "1M": { interval: "15m", range: "1mo" },
  "6M": { interval: "1h", range: "6mo" },
  "1Y": { interval: "1d", range: "1y" },
  "3Y": { interval: "1wk", range: "3y" },
  "5Y": { interval: "1wk", range: "5y" }
};

import globalRateLimiter from '../rate-limiter.js';

export async function fetchFromYahoo(ticker, period, symbol, stock, name, signal, apiKey) {
  console.log(`\n🔍 === FETCH Yahoo ${ticker} (${name}) période ${period} ===`);

  const yahooSymbol = getYahooSymbol(stock);
  console.log(`📈 Utilisation du symbole Yahoo: ${yahooSymbol}`);

  const result = await globalRateLimiter.executeIfNotLimited(async () => {
    const cfg = periods[period] || periods["1D"];
    // Use yahooSymbol for Yahoo Finance API
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${cfg.interval}&range=${cfg.range}`;
    const url = `${YAHOO_PROXY_BASE_URL}?${yahooUrl}`;
    console.log(`📡 Requête via Proxy: ${url}`);

    try {
      const r = await fetch(url, { signal });
      console.log(`📥 Réponse Proxy: ${r.status}`);

      if (r.status === 429) {
        globalRateLimiter.setRateLimitForApi('yahoo', 60000);
        return { source: "yahoo", error: true, errorCode: 429, throttled: true };
      }

      if (!r.ok) {
        // Amélioration de la journalisation des erreurs
        try {
          const errorText = await r.text();
          console.error(`💥 Erreur HTTP ${r.status} pour ${yahooSymbol}. Corps de la réponse:`, errorText.substring(0, 200)); // Limiter à 200 caractères
        } catch (e) {
          console.error(`💥 Erreur HTTP ${r.status} pour ${yahooSymbol}. Impossible de lire le corps de la réponse.`);
        }
        return { source: "yahoo", error: true, errorCode: r.status };
      }

      const j = await r.json();
      const res = j.chart?.result?.[0];
      const q = res?.indicators?.quote?.[0];

      if (!res || !q || !res.timestamp?.length) {
        // Amélioration de la journalisation pour les réponses vides/incomplètes
        console.error(`💥 Erreur 404/Réponse vide pour ${yahooSymbol}. Réponse JSON:`, JSON.stringify(j).substring(0, 200));
        return { source: "yahoo", error: true, errorCode: 404 };
      }

      const t = res.timestamp;
      const c = q.close;

      const data = {
        source: "yahoo",
        timestamps: t,
        prices: c,
        open: c[0],
        high: Math.max(...c),
        low: Math.min(...c),
        price: c[c.length - 1]
      };

      data.changePercent = ((data.price - data.open) / data.open) * 100;
      data.change = data.price - data.open;

      console.log(`✅ ${t.length} points Yahoo récupérés via proxy`);
      console.log(`💰 Prix Yahoo: ${data.price}`);

      return data;

    } catch (e) {
      if (e.name === 'AbortError') { 
        console.log(`🚫 Requête Yahoo annulée pour ${yahooSymbol}`); 
        throw e;
      }
      console.error(`💥 Erreur Proxy/Yahoo pour ${yahooSymbol}:`, e.message);
      return { source: "yahoo", error: true, errorCode: 500 };
    }
  }, 'yahoo');

  return result;
}
