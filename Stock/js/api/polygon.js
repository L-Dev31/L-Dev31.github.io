const periods = {
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
  async process() { if (!this.queue.length) return; const now = Date.now(); this.pending = this.pending.filter(t => now - t < this.window); if (this.pending.length < this.max) { const { fn, resolve, reject } = this.queue.shift(); this.pending.push(now); try { resolve(await fn()); } catch (e) { reject(e); } if (this.queue.length) setTimeout(() => this.process(), 100); } else { const wait = this.window - (now - Math.min(...this.pending)) + 100; const seconds = Math.max(1, Math.round(wait/1000)); console.log(`⏳ Rate limit Polygon: ${this.pending.length}/${this.max} requêtes, attente ${seconds}s`); if (typeof window !== 'undefined' && window.startRateLimitCountdown) { window.startRateLimitCountdown(seconds); } setTimeout(() => this.process(), wait); } }
}

const limiter = new RateLimiter();
const cache = new Map();
const mappingCache = new Map();

function resolvePolygonTicker(localTicker) {
  if (mappingCache.has(localTicker)) return mappingCache.get(localTicker);

  let polygonTicker = localTicker;
  // Détection Crypto ou Matière Première (ex: BTCUSD, XAUUSD)
  if (/^[A-Z]{3,6}USD$/.test(localTicker) || /^XAU|XAG/.test(localTicker)) {
    polygonTicker = `C:${localTicker}`;
  }
  // Pour les actions (US, EU), Polygon utilise souvent le ticker tel quel (ex: AAPL, AL2SI.PA)
  // Aucune autre transformation n'est nécessaire pour les cas que nous gérons.

  console.log(`[Polygon] Ticker local "${localTicker}" résolu en "${polygonTicker}"`);
  mappingCache.set(localTicker, polygonTicker);
  return polygonTicker;
}

export async function fetchFromPolygon(ticker, period, symbol, _, name, signal, apiKey) {
  console.log(`\n🔍 === FETCH Polygon ${ticker} (${name}) période ${period} ===`);
  const key = `${ticker}:${period}`;
  try {
    const polygonTicker = resolvePolygonTicker(ticker);
    const cfg = periods[period] || periods["1D"];
    const to = new Date();
    const from = new Date(to.getTime() - (cfg.days * 24 * 60 * 60 * 1000));
    const toDate = to.toISOString().split('T')[0];
    const fromDate = from.toISOString().split('T')[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(polygonTicker )}/range/${cfg.mult}/${cfg.timespan}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
    
    console.log(`📡 Requête Polygon API: ${polygonTicker} du ${fromDate} au ${toDate}`);
    const r = await limiter.exec(() => fetch(url, { signal }));
    console.log(`📥 Réponse Polygon: ${r.status} ${r.statusText}`);

    if (r.status === 429) {
      return { source: "massive", error: true, errorCode: 429, throttled: true };
    }

    const j = await r.json();
    if (!j?.results?.length) {
      console.warn(`⚠️ Aucun résultat Polygon pour ${polygonTicker}.`, j);
      return { source: "massive", error: true, errorCode: 404, errorMessage: j.error || "Aucune donnée", raw: j };
    }

    console.log(`✅ ${j.results.length} points de données bruts récupérés de Polygon`);
    
    let relevantResults = j.results;
    if (period === "1D") {
        const twentyFourHoursAgo = to.getTime() - (24 * 60 * 60 * 1000);
        relevantResults = j.results.filter(k => k.t >= twentyFourHoursAgo);
        console.log(`ℹ️ ${relevantResults.length} points Polygon conservés pour la période 1D.`);
    }

    if (relevantResults.length === 0) {
        return { source: "massive", error: true, errorCode: 404, errorMessage: "Pas de points de données pertinents" };
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
    
    console.log(`💰 Prix Polygon: ${data.price?.toFixed(2)} USD`);
    cache.set(key, { data, ts: Date.now() });
    return data;

  } catch (e) {
    if (e.name === 'AbortError') { console.log(`🚫 Requête Polygon annulée pour ${ticker}`); throw e; }
    console.error(`💥 Erreur Polygon pour ${ticker}:`, e.message);
    return { source: "massive", error: true, errorCode: 500, errorMessage: e.message };
  }
}
