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

export async function fetchFromYahoo(ticker, period, symbol, _, name, signal, apiKey) {
  console.log(`\n🔍 === FETCH Yahoo ${ticker} (${name}) période ${period} ===`);

  const result = await globalRateLimiter.executeIfNotLimited(async () => {
    const cfg = periods[period] || periods["1D"];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${cfg.interval}&range=${cfg.range}`;

    console.log(`📡 Requête Yahoo API: ${ticker} interval=${cfg.interval} range=${cfg.range}`);

    try {
      const r = await fetch(url, { signal });
      console.log(`📥 Réponse Yahoo: ${r.status}`);

      if (r.status === 429) {
        globalRateLimiter.setRateLimitForApi('yahoo', 60000);
        return { source: "yahoo", error: true, errorCode: 429, throttled: true };
      }

      if (!r.ok) return { source: "yahoo", error: true, errorCode: r.status };

      const j = await r.json();
      const res = j.chart?.result?.[0];
      const q = res?.indicators?.quote?.[0];

      if (!res || !q || !res.timestamp?.length)
        return { source: "yahoo", error: true, errorCode: 404 };

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

      console.log(`✅ ${t.length} points Yahoo récupérés`);
      console.log(`💰 Prix Yahoo: ${data.price}`);

      return data;

    } catch (e) {
      if (e.name === 'AbortError') { 
        console.log(`🚫 Requête Yahoo annulée pour ${ticker}`); 
        throw e;
      }
      console.error(`💥 Erreur Yahoo pour ${ticker}:`, e.message);
      return { source: "yahoo", error: true, errorCode: 500 };
    }
  }, 'yahoo');

  return result;
}
