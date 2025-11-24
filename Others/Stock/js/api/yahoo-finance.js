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
import { filterNullDataPoints } from '../general.js';

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

      // Log détaillé pour le débogage
      console.log(`🔍 Analyse réponse Yahoo pour ${yahooSymbol}:`);
      console.log(`  - res existe:`, !!res);
      console.log(`  - meta existe:`, !!res?.meta);
      console.log(`  - indicators existe:`, !!res?.indicators);
      console.log(`  - quote existe:`, !!res?.indicators?.quote);
      console.log(`  - q (quote[0]) existe:`, !!q);
      console.log(`  - timestamp length:`, res?.timestamp?.length || 0);
      console.log(`  - close length:`, q?.close?.length || 0);

      if (!res || !q || !res.timestamp?.length || !q.close?.length) {
        // Vérifier si on a au moins les métadonnées (cas normal où le marché n'a pas encore ouvert)
        if (res?.meta && (!res.timestamp?.length || !q?.close?.length)) {
          console.log(`📊 ${yahooSymbol} - Le cours de l'action n'a pas encore démarré pour cette période (${period})`);
          return { source: "yahoo", error: true, errorCode: "NO_DATA" };
        }
        
        // Cas d'erreur réelle (pas de métadonnées ou structure complètement cassée)
        console.error(`💥 Erreur réponse incomplète pour ${yahooSymbol}. res:`, !!res, 'q:', !!q, 'timestamp:', res?.timestamp?.length, 'close:', q?.close?.length);
        console.error(`Réponse JSON:`, JSON.stringify(j).substring(0, 500));
        return { source: "yahoo", error: true, errorCode: 404 };
      }

      const t = res.timestamp;
      const c = q.close;

      // Filtrer les points null dès la source
      const { timestamps: filteredTimestamps, prices: filteredPrices } = filterNullDataPoints(t, c);

      console.log(`🔍 Données brutes: ${t.length} points, après filtrage: ${filteredTimestamps.length} points valides`);

      if (filteredTimestamps.length === 0) {
        console.log(`📊 ${yahooSymbol} - Aucune donnée valide après filtrage des valeurs null`);
        return { source: "yahoo", error: true, errorCode: "NO_VALID_DATA" };
      }

      const data = {
        source: "yahoo",
        timestamps: filteredTimestamps,
        prices: filteredPrices,
        open: filteredPrices[0],
        high: Math.max(...filteredPrices),
        low: Math.min(...filteredPrices),
        price: filteredPrices[filteredPrices.length - 1]
      };

      data.changePercent = ((data.price - data.open) / data.open) * 100;
      data.change = data.price - data.open;

      console.log(`✅ ${filteredTimestamps.length} points Yahoo valides récupérés via proxy`);
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

// Fetch company summary/profile and description
export async function fetchYahooSummary(ticker, signal) {
  const yahooSymbol = ticker;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile,summaryProfile,price`;
  const proxy = `${YAHOO_PROXY_BASE_URL}?${url}`;
  try {
    const r = await fetch(proxy, { signal });
    console.log(`fetchYahooSummary ${ticker} => status ${r.status}`);
    if (!r.ok) return { error: true, errorCode: r.status };
    const j = await r.json();
    console.log('fetchYahooSummary raw:', j);
    const res = j.quoteSummary?.result?.[0];
    return {
      source: 'yahoo',
      summary: res?.assetProfile || res?.summaryProfile || null,
      price: res?.price || null
    };
  } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, errorMessage: e.message }; }
}

// Fetch financial statements and related data
export async function fetchYahooFinancials(ticker, signal) {
  const yahooSymbol = ticker;
  const modules = 'financialData,balanceSheetHistory,cashflowStatementHistory,earnings';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=${modules}`;
  const proxy = `${YAHOO_PROXY_BASE_URL}?${url}`;
  try {
    const r = await fetch(proxy, { signal });
    if (!r.ok) return { error: true, errorCode: r.status };
    const j = await r.json();
    const res = j.quoteSummary?.result?.[0];
    return { source: 'yahoo', financials: res || null };
  } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, errorMessage: e.message }; }
}

export async function fetchYahooEarnings(ticker, signal) {
  const yahooSymbol = ticker;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=earnings`;
  const proxy = `${YAHOO_PROXY_BASE_URL}?${url}`;
  try {
    const r = await fetch(proxy, { signal });
    if (!r.ok) return { error: true, errorCode: r.status };
    const j = await r.json();
    const res = j.quoteSummary?.result?.[0];
    return { source: 'yahoo', earnings: res?.earnings || null };
  } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, errorMessage: e.message }; }
}

export async function fetchYahooDividends(ticker, from, to, signal) {
  const yahooSymbol = ticker;
  const start = from || '2000-01-01';
  const end = to || new Date().toISOString().slice(0,10);
  const period1 = Math.floor(new Date(start).getTime() / 1000);
  const period2 = Math.floor(new Date(end).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v7/finance/download/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=1d&events=div`;
  const proxy = `${YAHOO_PROXY_BASE_URL}?${url}`;
  try {
    const r = await fetch(proxy, { signal });
    if (!r.ok) return { error: true, errorCode: r.status };
    const text = await r.text();
    // CSV: Date,Dividends
    const lines = text.trim().split('\n').slice(1);
    const items = lines.map(l => {
      const cols = l.split(',');
      return { date: cols[0], dividend: parseFloat(cols[1]) };
    });
    return { source: 'yahoo', dividends: items };
  } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, errorMessage: e.message }; }
}

export async function fetchYahooOptions(ticker, date, signal) {
  const yahooSymbol = ticker;
  const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(yahooSymbol)}${date ? `?date=${date}` : ''}`;
  const proxy = `${YAHOO_PROXY_BASE_URL}?${url}`;
  try {
    const r = await fetch(proxy, { signal });
    if (!r.ok) return { error: true, errorCode: r.status };
    const j = await r.json();
    return { source: 'yahoo', options: j.optionChain || j.option || j }; // raw return
  } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, errorMessage: e.message }; }
}

export async function fetchYahooAnalysis(ticker, signal) {
  const yahooSymbol = ticker;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=recommendationTrend,upgradeDowngradeHistory`;
  const proxy = `${YAHOO_PROXY_BASE_URL}?${url}`;
  try {
    const r = await fetch(proxy, { signal });
    if (!r.ok) return { error: true, errorCode: r.status };
    const j = await r.json();
    const res = j.quoteSummary?.result?.[0];
    return { source: 'yahoo', analysis: res || null };
  } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, errorMessage: e.message }; }
}

export async function fetchYahooNews(ticker, limit = 10, signal) {
  const yahooSymbol = ticker;
  // Use search endpoint to retrieve news
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(yahooSymbol)}&newsCount=${limit}`;
  const proxy = `${YAHOO_PROXY_BASE_URL}?${url}`;
  try {
    const r = await fetch(proxy, { signal });
    if (!r.ok) return { error: true, errorCode: r.status, items: [] };
    const j = await r.json();
    const items = (j?.news || []).slice(0, limit).map(i => ({ id: i.uuid || i.link, title: i.title, url: i.link, publisher: i.publisher, publishedAt: i.providerPublishTime || i.unixTimeMs || Date.now(), summary: i.summary || '' }));
    return { source: 'yahoo', items };
  } catch (e) { return { source: 'yahoo', error: true, errorCode: 500, errorMessage: e.message, items: [] }; }
}
