const periodMap = {
  "1D": { interval: "5min", days: 1, outputsize: 300 },
  "1W": { interval: "30min", days: 7, outputsize: 350 },
  "1M": { interval: "2h", days: 31, outputsize: 400 },
  "6M": { interval: "1day", days: 183, outputsize: 200 },
  "1Y": { interval: "1day", days: 365, outputsize: 400 },
  "5Y": { interval: "1week", days: 1825, outputsize: 300 }
};

class RateLimiter {
  constructor(max = 8, window = 60000) { this.max = max; this.window = window; this.queue = []; this.pending = []; }
  async exec(fn) { return new Promise((resolve, reject) => { this.queue.push({ fn, resolve, reject }); if (this.queue.length === 1) this.process(); }); }
  async process() { if (!this.queue.length) return; const now = Date.now(); this.pending = this.pending.filter(t => now - t < this.window); if (this.pending.length < this.max) { const { fn, resolve, reject } = this.queue.shift(); this.pending.push(now); if (typeof window !== 'undefined' && window.stopRateLimitCountdown) { window.stopRateLimitCountdown(); } try { resolve(await fn()); } catch (e) { reject(e); } if (this.queue.length) setTimeout(() => this.process(), 100); } else { const wait = this.window - (now - Math.min(...this.pending)) + 100; const seconds = Math.max(1, Math.round(wait/1000)); console.log(`⏳ Rate limit Twelve Data: ${this.pending.length}/${this.max} requêtes, attente ${seconds}s`); if (typeof window !== 'undefined' && window.startRateLimitCountdown) { window.startRateLimitCountdown(seconds); } setTimeout(() => this.process(), wait); } }
}

const limiter = new RateLimiter();
const cache = new Map();

function resolveTwelveDataTicker(localTicker) {
  if (/^[A-Z]{3,6}USD$/.test(localTicker)) { const crypto = localTicker.slice(0, -3); return `${crypto}/USD`; }
  if (localTicker === 'XAUUSD') return 'XAU/USD';
  if (localTicker === 'XAGUSD') return 'XAG/USD';
  return localTicker;
}

export async function fetchFromTwelveData(ticker, period, symbol, _, name, signal, apiKey) {
  console.log(`\n🔍 === FETCH Twelve Data ${ticker} (${name}) période ${period} ===`);
  const key = `${ticker}:${period}`;
  
  try {
    const twelveTicker = resolveTwelveDataTicker(ticker);
    const cfg = periodMap[period] || periodMap["1D"];
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(twelveTicker )}&interval=${cfg.interval}&outputsize=${cfg.outputsize}&apikey=${apiKey}`;
    
    console.log(`📡 Requête Twelve Data API: ${twelveTicker} interval=${cfg.interval} outputsize=${cfg.outputsize}`);
    
    const r = await limiter.exec(() => fetch(url, { signal }));
    console.log(`📥 Réponse: ${r.status} ${r.statusText}`);
    
    if (r.status === 429) {
      if (typeof window !== 'undefined' && window.setApiStatus) { try { window.setApiStatus(symbol, 'fetching', { api: 'twelvedata', loadingFallback: true, errorCode: 429 }); } catch (e) {} }
      return { source: "twelvedata", error: true, errorCode: 429, throttled: true };
    }
    
    const j = await r.json();
    
    if (j.status === 'error' || !j.values || !j.values.length) {
      const isPlanError = j.message && j.message.includes("plan");
      const errorMessage = isPlanError ? `Accès non autorisé pour ${twelveTicker} (vérifiez votre plan d'abonnement).` : (j.message || 'Aucune donnée');
      console.warn(`⚠️ Erreur ou aucun résultat pour ${twelveTicker}:`, errorMessage);
      const err = { source: "twelvedata", error: true, errorCode: j.code || 404, errorMessage, twelveTicker };
      cache.set(key, { data: err, ts: Date.now() });
      return err;
    }
    
    console.log(`✅ ${j.values.length} points de données bruts récupérés pour ${twelveTicker}`);
    
    const values = j.values.reverse();
    
    const periodStartTimestamp = Math.floor((Date.now() - cfg.days * 24 * 60 * 60 * 1000) / 1000);
    const filteredValues = values.filter(v => {
        const timestamp = Math.floor(new Date(v.datetime).getTime() / 1000);
        return timestamp >= periodStartTimestamp;
    });

    if (filteredValues.length === 0) {
        console.warn(`⚠️ Aucune donnée pour ${twelveTicker} dans la période ${period}.`);
        return { source: "twelvedata", error: true, errorCode: 404, errorMessage: `Pas de données sur ${period}.` };
    }
    console.log(`ℹ️ ${filteredValues.length} points de données conservés pour la période ${period}`);

    const prices = filteredValues.map(v => parseFloat(v.close) || 0);
    const timestamps = filteredValues.map(v => Math.floor(new Date(v.datetime).getTime() / 1000));
    
    const data = {
      source: "twelvedata",
      timestamps,
      prices,
      open: parseFloat(filteredValues[0]?.open) || prices[0] || null,
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
    console.error(`💥 Erreur Twelve Data pour ${ticker}:`, e.message);
    return { source: "twelvedata", error: true, errorCode: 500, errorMessage: e.message };
  }
}
