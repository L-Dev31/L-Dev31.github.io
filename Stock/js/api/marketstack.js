import globalRateLimiter from '../rate-limiter.js';

const periods = {
  "1D": { days: 1 },
  "1W": { days: 7 },
  "1M": { days: 31 },
  "6M": { days: 183 },
  "1Y": { days: 365 },
  "3Y": { days: 1095 },
  "5Y": { days: 1825 }
};

const cache = new Map();

export async function fetchFromMarketstack(ticker, period, symbol, _, name, signal, apiKey) {
  console.log(`\n🔍 === FETCH Marketstack ${ticker} (${name}) période ${period} ===`);
  const key = `${ticker}:${period}`;

  try {
    const marketstackTicker = ticker.replace(/-([A-Z]+)$/, '.$1');
    console.log(`[Marketstack] Ticker "${ticker}" transformé en "${marketstackTicker}"`);

    const cfg = periods[period] || periods["1D"];
    const to = new Date();
    const from = new Date(to.getTime() - (cfg.days * 24 * 60 * 60 * 1000));
    const toDate = to.toISOString().split('T')[0];
    const fromDate = from.toISOString().split('T')[0];

    const endpoint = 'eod';
    let url;

    if (period === "1D") {
      // Pour 1D → on récupère le dernier EOD connu
      url = `https://api.marketstack.com/v1/${endpoint}/latest?access_key=${apiKey}&symbols=${encodeURIComponent(marketstackTicker)}`;
    } else {
      // Autres périodes → plage de dates
      url = `https://api.marketstack.com/v1/${endpoint}?access_key=${apiKey}&symbols=${encodeURIComponent(marketstackTicker)}&date_from=${fromDate}&date_to=${toDate}&limit=1000`;
    }

    console.log(`📡 Requête Marketstack API (EOD): ${marketstackTicker}`);
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
      console.warn(`⚠️ Aucun résultat Marketstack pour ${marketstackTicker}.`, j);
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

    const data = {
      source: "marketstack",
      timestamps,
      prices,
      open: sortedData[0]?.open || prices[0] || null,
      high: Math.max(...sortedData.map(k => k.high || 0)),
      low: Math.min(...sortedData.map(k => k.low || Infinity)),
      price: prices[prices.length - 1],
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
      console.log(`🚫 Requête Marketstack annulée pour ${ticker}`);
      throw e;
    }
    console.error(`💥 Erreur Marketstack pour ${ticker}:`, e.message);
    return {
      source: "marketstack",
      error: true,
      errorCode: 500,
      errorMessage: e.message
    };
  }
}
