const periods = {
  // Astuce : on demande 2 jours pour forcer un intervalle plus fin
  "1D": { mult: 1, timespan: "minute", days: 2 }, 
  "1W": { mult: 5, timespan: "minute", days: 7 },
  "1M": { mult: 30, timespan: "minute", days: 31 },
  "6M": { mult: 2, timespan: "hour", days: 183 },
  "1Y": { mult: 1, timespan: "day", days: 365 },
  "5Y": { mult: 1, timespan: "week", days: 1825 }
};

class RateLimiter {
  constructor(max = 5, window = 60000) { this.max = max; this.window = window; this.queue = []; this.pending = []; }
  async exec(fn) { return new Promise((resolve, reject) => { this.queue.push({ fn, resolve, reject }); if (this.queue.length === 1) this.process(); }); }
  async process() { if (!this.queue.length) return; const now = Date.now(); this.pending = this.pending.filter(t => now - t < this.window); if (this.pending.length < this.max) { const { fn, resolve, reject } = this.queue.shift(); this.pending.push(now); try { resolve(await fn()); } catch (e) { reject(e); } if (this.queue.length) setTimeout(() => this.process(), 100); } else { const wait = this.window - (now - Math.min(...this.pending)) + 100; const seconds = Math.max(1, Math.round(wait/1000)); console.log(`⏳ Rate limit: ${this.pending.length}/${this.max} requêtes, attente ${seconds}s`); if (typeof window !== 'undefined' && window.startRateLimitCountdown) { window.startRateLimitCountdown(seconds); } setTimeout(() => this.process(), wait); } }
}

const limiter = new RateLimiter();
const cache = new Map();
const mappingCache = new Map();

async function resolvePolygonTicker(localTicker) {
  if (mappingCache.has(localTicker)) return mappingCache.get(localTicker);
  if (localTicker.endsWith('.PA')) { mappingCache.set(localTicker, localTicker); return localTicker; }
  if (/^[CX]:/.test(localTicker)) { mappingCache.set(localTicker, localTicker); return localTicker; }
  if (/^[A-Z]{3,6}USD$/.test(localTicker) || /^XAU|XAG/.test(localTicker)) { const t = `C:${localTicker}`; mappingCache.set(localTicker, t); return t; }
  try {
    const refUrl = `https://api.polygon.io/v3/reference/tickers?ticker=${encodeURIComponent(localTicker )}&active=true`;
    const r = await fetch(refUrl);
    if (r.ok) {
      const j = await r.json();
      if (j.results && j.results.length) {
        const poly = j.results[0].ticker;
        mappingCache.set(localTicker, poly);
        return poly;
      }
    }
  } catch (e) { console.warn('resolvePolygonTicker erreur:', e.message); }
  mappingCache.set(localTicker, localTicker);
  return localTicker;
}

export async function fetchFromPolygon(ticker, period, symbol, _, name, signal, apiKey) {
  console.log(`\n🔍 === FETCH ${ticker} (${name}) période ${period} ===`);
  const key = `${ticker}:${period}`;
  try {
    const polygonTicker = await resolvePolygonTicker(ticker, apiKey);
    const cfg = periods[period] || periods["1D"];
    const to = new Date();
    const from = new Date(to.getTime() - (cfg.days * 24 * 60 * 60 * 1000));
    const toDate = to.toISOString().split('T')[0];
    const fromDate = from.toISOString().split('T')[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(polygonTicker )}/range/${cfg.mult}/${cfg.timespan}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
    
    console.log(`📡 Requête API (polygonTicker=${polygonTicker}): ${polygonTicker} du ${fromDate} au ${toDate}`);
    const r = await limiter.exec(() => fetch(url, { signal }));
    console.log(`📥 Réponse: ${r.status} ${r.statusText}`);

    if (r.status === 429) {
      if (typeof window !== 'undefined' && window.setApiStatus) { try { window.setApiStatus(symbol, 'fetching', { api: 'massive', loadingFallback: true, errorCode: 429 }); } catch (e) {} }
      return { source: "massive", error: true, errorCode: 429, throttled: true };
    }

    const j = await r.json();
    if (!j?.results?.length) {
      console.warn(`⚠️ Aucun résultat pour ${polygonTicker}. Cela peut être dû à un ticker non trouvé ou à des restrictions de votre plan API.`, j);
      const err = { source: "massive", error: true, errorCode: 404, polygonTicker, raw: j };
      cache.set(key, { data: err, ts: Date.now() });
      return err;
    }

    console.log(`✅ ${j.results.length} points de données bruts récupérés pour ${polygonTicker}`);
    
    let relevantResults = j.results;
    if (period === "1D") {
        const twentyFourHoursAgo = to.getTime() - (24 * 60 * 60 * 1000);
        relevantResults = j.results.filter(k => k.t >= twentyFourHoursAgo);
        console.log(`ℹ️ ${relevantResults.length} points conservés pour la période 1D.`);
    }

    if (relevantResults.length === 0) {
        console.warn(`⚠️ Aucun point de données pertinent trouvé pour ${polygonTicker} dans la période demandée.`);
        return { source: "massive", error: true, errorCode: 404, errorMessage: "No relevant data points" };
    }

    const prices = relevantResults.map(k => k.c || 0);
    const data = {
      source: "massive",
      timestamps: relevantResults.map(k => Math.floor(k.t / 1000)),
      prices,
      open: prices[0] || null,
      high: Math.max(...prices),
      low: Math.min(...prices),
      price: prices[prices.length - 1]
    };
    
    if (data.open && data.price) {
      data.changePercent = ((data.price - data.open) / data.open) * 100;
      data.change = data.price - data.open;
    } else {
      data.changePercent = 0;
      data.change = 0;
    }
    
    console.log(`💰 Prix: ${data.price?.toFixed(2)} USD (min: ${data.low?.toFixed(2)}, max: ${data.high?.toFixed(2)})`);
    console.log(`📈 Performance: ${data.changePercent?.toFixed(2)}% (${data.change?.toFixed(2)} USD)`);
    cache.set(key, { data, ts: Date.now() });
    return data;

  } catch (e) {
    if (e.name === 'AbortError') { console.log(`🚫 Requête annulée pour ${ticker}`); throw e; }
    console.error(`💥 Erreur pour ${ticker}:`, e.message);
    return { source: "massive", error: true, errorCode: 500 };
  }
}
