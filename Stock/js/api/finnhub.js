const API_KEY = "d47t9shr01qk80biejc0d47t9shr01qk80biejcg"
const BASE = "https://finnhub.io/api/v1"

const ranges = {
    "1D": { res: 1, from: 1 },
    "5D": { res: 5, from: 5 },
    "1M": { res: 30, from: 30 },
    "6M": { res: 60, from: 182 },
    "1Y": { res: 60, from: 365 },
    "5Y": { res: "D", from: 1825 }
}

export async function fetchFromFinnhub(ticker, period, symbol, setApiStatus, companyName, signal) {
    try {
        const r = ranges[period] || ranges["1D"]
        const now = Math.floor(Date.now() / 1000)
        const from = now - r.from * 24 * 3600

        const url = `${BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${r.res}&from=${from}&to=${now}&token=${API_KEY}`
        const resp = await fetch(url)
        if (!resp.ok) {
            // For 1D, if 403 on candle, fallback to quote
            if (period === "1D" && resp.status === 403) {
                const quoteUrl = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`
                const qResp = await fetch(quoteUrl)
                if (qResp.ok) {
                    const data = await qResp.json()
                    if (data && isFinite(data.c)) {
                        let timestamps, prices
                        if (isFinite(data.pc) && data.pc !== data.c) {
                            timestamps = [now - 3600, now]
                            prices = [data.pc, data.c]
                        } else {
                            timestamps = [now]
                            prices = [data.c]
                        }
                        return {
                            source: "finnhub",
                            timestamps,
                            prices,
                            open: isFinite(data.o) ? data.o : null,
                            high: isFinite(data.h) ? data.h : null,
                            low: isFinite(data.l) ? data.l : null,
                            previousClose: isFinite(data.pc) ? data.pc : null,
                            price: data.c,
                            change: isFinite(data.pc) ? data.c - data.pc : 0,
                            changePercent: isFinite(data.pc) ? ((data.c - data.pc) / data.pc) * 100 : 0
                        }
                    }
                }
            }
            return { source: "finnhub", error: true, errorCode: resp.status }
        }

        const data = await resp.json()
        if (!data || data.s !== "ok") return { source: "finnhub", error: true, errorCode: 400 }

        const timestamps = data.t || []
        const prices = data.c || []

        const open = prices.length ? prices[0] : null
        const high = prices.length ? Math.max(...prices) : null
        const low = prices.length ? Math.min(...prices) : null
        const last = prices.length ? prices[prices.length - 1] : null

        let previousClose = null
        try {
            const q = await fetch(`${BASE}/quote?symbol=${symbol}&token=${API_KEY}`)
            const jq = await q.json()
            if (jq && jq.pc) previousClose = jq.pc
        } catch(e){}

        return {
            source: "finnhub",
            timestamps,
            prices,
            open,
            high,
            low,
            previousClose,
            price: last,
            change: previousClose ? last - previousClose : 0,
            changePercent: previousClose ? ((last - previousClose) / previousClose) * 100 : 0
        }
    } catch(e){
        return { source: "finnhub", error: true, errorCode: 500 }
    }
}
