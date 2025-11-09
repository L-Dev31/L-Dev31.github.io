const API = "qCYBOa_qaJxa3aWA42_NNPjb47QJk2iB"

// Rate limiter pour le plan gratuit (5 req/min)
class RateLimiter {
  constructor(maxRequests = 5, timeWindow = 60000) {
    this.maxRequests = maxRequests
    this.timeWindow = timeWindow
    this.queue = []
    this.pending = []
  }

  async execute(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.processQueue()
    })
  }

  async processQueue() {
    if (this.queue.length === 0) return
    
    // Nettoyer les anciennes requêtes
    const now = Date.now()
    this.pending = this.pending.filter(time => now - time < this.timeWindow)
    
    // Si on peut faire une requête
    if (this.pending.length < this.maxRequests) {
      const { fn, resolve, reject } = this.queue.shift()
      this.pending.push(Date.now())
      
      try {
        const result = await fn()
        resolve(result)
      } catch (error) {
        reject(error)
      }
      
      // Traiter la prochaine requête
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 100)
      }
    } else {
      // Attendre avant de réessayer
      const oldestRequest = Math.min(...this.pending)
      const waitTime = this.timeWindow - (now - oldestRequest) + 100
      setTimeout(() => this.processQueue(), waitTime)
    }
  }
}

// Instance unique du rate limiter
const rateLimiter = new RateLimiter(5, 60000) // 5 req/min

function p(url, signal) {
  return rateLimiter.execute(() =>
    fetch(url, { signal })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
  )
}

const periods = {
  "1D": { mult: 1, timespan: "day", days: 1 },
  "5D": { mult: 1, timespan: "day", days: 5 },
  "1M": { mult: 1, timespan: "day", days: 30 },
  "6M": { mult: 1, timespan: "day", days: 182 },
  "1Y": { mult: 1, timespan: "day", days: 365 },
  "5Y": { mult: 1, timespan: "day", days: 1825 }
}

// Vérifier si c'est un ticker crypto/forex (non supporté en gratuit)
function isCryptoOrForex(symbol, ticker) {
  // Vérifier le symbol original (Yahoo Finance format)
  const symbolPatterns = [
    /=F$/,                  // Futures Yahoo (GC=F, CL=F)
    /-USD$/,                // Crypto Yahoo (BTC-USD)
    /^(BTC|ETH|XRP|ADA)/,  // Cryptos
    /=X$/                   // Forex Yahoo (EURUSD=X)
  ]
  
  // Vérifier le ticker Polygon
  const tickerPatterns = [
    /^X:[A-Z]+$/,           // Format Polygon crypto (X:BTCUSD)
    /^C:[A-Z]+$/,           // Format Polygon forex (C:EURUSD)
    /USD$/,                 // Paires vs USD
    /EUR$/,                 // Paires vs EUR
    /^(XAU|XAG|GC|SI|CL)/  // Métaux/commodités
  ]
  
  return symbolPatterns.some(p => p.test(symbol)) || 
         tickerPatterns.some(p => p.test(ticker))
}

// Rechercher un ticker via le nom avec l'API Polygon
async function searchTickerByName(name, signal) {
  try {
    const url = `https://api.polygon.io/v3/reference/tickers?search=${encodeURIComponent(name)}&active=true&limit=10&apiKey=${API}`
    const r = await rateLimiter.execute(() => fetch(url, { signal }))
    if (!r.ok) {
      // Retourner l'erreur HTTP au lieu de null
      return { error: true, errorCode: r.status }
    }
    
    const j = await r.json()
    if (!j.results || !j.results.length) return null
    
    // Retourner le premier résultat correspondant
    return j.results[0].ticker
  } catch (e) {
    console.error('Erreur recherche ticker:', e)
    return { error: true, errorCode: 500 }
  }
}

// Fallback: chercher le ticker via le nom
async function fetchFromFallback(symbol, ticker, period, signal, name) {
  try {
    // Essayer de chercher le bon ticker via le nom
    if (name) {
      console.log(`Recherche du ticker pour "${name}"...`)
      const result = await searchTickerByName(name, signal)
      
      // Si c'est un objet d'erreur, le retourner
      if (result && typeof result === 'object' && result.error) {
        return {
          source: "massive",
          error: true,
          errorCode: result.errorCode,
          message: `Erreur lors de la recherche de ticker pour "${name}"`
        }
      }
      
      if (result && result !== ticker) {
        console.log(`Ticker trouvé: ${result} au lieu de ${ticker}`)
        // Réessayer avec le nouveau ticker trouvé
        return fetchFromPolygon(result, period, symbol, null, name, signal)
      }
    }
    
    // Si pas trouvé, retourner une erreur
    return {
      source: "massive",
      error: true,
      errorCode: 404,
      message: `Aucun ticker trouvé pour "${name || symbol}" sur Polygon.io`
    }
  } catch (e) {
    return { source: "massive", error: true, errorCode: 500 }
  }
}

export async function fetchFromPolygon(ticker, period, symbol, setApiStatus, name, signal) {
  try {
    // Vérifier si le ticker est supporté (utilise symbol ET ticker)
    if (isCryptoOrForex(symbol, ticker)) {
      console.warn(`${symbol} (${ticker}) non supporté en gratuit, tentative de fallback...`)
      return await fetchFromFallback(symbol, ticker, period, signal, name)
    }
    
    const cfg = periods[period] || periods["1D"]
    const to = new Date().toISOString()
    const from = new Date(Date.now() - cfg.days * 86400 * 1000).toISOString()
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${cfg.mult}/${cfg.timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${API}`
    
    // Utiliser le rate limiter
    const r = await rateLimiter.execute(() => fetch(url, { signal }))
    
    if (!r.ok) {
      // Si 400, probablement un ticker non supporté
      if (r.status === 400) {
        console.warn(`${ticker} retourne 400, tentative de fallback...`)
        return await fetchFromFallback(symbol, ticker, period, signal, name)
      }
      // Si toujours 429, attendre plus longtemps
      if (r.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 15000))
        return fetchFromPolygon(ticker, period, symbol, setApiStatus, name, signal)
      }
      return { source: "massive", error: true, errorCode: r.status }
    }
    
    const j = await r.json()
    if (!j || !j.results || !j.results.length) {
      return { source: "massive", error: true, errorCode: 400 }
    }
    
    const timestamps = j.results.map(k => Math.floor(k.t / 1000))
    const prices = j.results.map(k => k.c || 0)
    const open = prices[0] || null
    const high = prices.length ? Math.max(...prices) : null
    const low = prices.length ? Math.min(...prices) : null
    const last = prices.length ? prices[prices.length - 1] : null
    
    let prev = null
    try {
      const qr = await p(`https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true&apiKey=${API}`, signal)
      if (qr && qr.results && qr.results[0]) prev = qr.results[0].c
    } catch (e) { }
    
    return {
      source: "massive",
      timestamps,
      prices,
      open,
      high,
      low,
      previousClose: prev,
      price: last
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e
    return { source: "massive", error: true, errorCode: 500 }
  }
}