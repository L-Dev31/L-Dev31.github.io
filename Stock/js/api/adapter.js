import globalRateLimiter from '../rate-limiter.js';
import { filterNullOHLCDataPoints, computeChange } from '../utils.js';

/**
 * Factory to build OHLC fetchers with consistent error handling and normalization.
 * @param {Object} opts
 * @param {(stock:any,ticker:string)=>string} opts.mapSymbol - resolve provider ticker.
 * @param {(args:Object)=>({ url:string, options?:Object }|string)} opts.buildUrl - build request URL and optional fetch options.
 * @param {(response:any, ctx:Object)=>Object} opts.parse - parse provider payload to { timestamps, opens, highs, lows, closes, meta? }.
 * @param {(data:Object, ctx:Object)=>Object} [opts.transform] - optional post-normalization transform.
 * @param {string} opts.apiName - rate limiter key.
 */
export function makeOhlcAdapter({ mapSymbol, buildUrl, parse, transform, apiName }) {
  return async function fetcher(ticker, period, symbol, stock, name, signal, apiKey) {
    const providerSymbol = mapSymbol(stock, ticker, symbol);
    try {
      const built = buildUrl({ providerSymbol, period, apiKey });
      const url = typeof built === 'string' ? built : built.url;
      const extraOpts = typeof built === 'string' ? {} : (built.options || {});
      const r = await globalRateLimiter.executeIfNotLimited(
        () => fetch(url, { signal, ...extraOpts }),
        apiName
      );

      if (r.status === 429) {
        globalRateLimiter.setRateLimitForApi(apiName, 60000);
        return { source: apiName, error: true, errorCode: 429, throttled: true };
      }
      if (!r.ok) return { source: apiName, error: true, errorCode: r.status };

  const raw = await r.json();
  const ctx = { period, stock, symbol, ticker: providerSymbol };
  const parsed = parse(raw, ctx);
      if (!parsed || !parsed.timestamps?.length) return { source: apiName, error: true, errorCode: 'NO_VALID_DATA' };

      const { timestamps, opens, highs, lows, closes } = filterNullOHLCDataPoints(parsed.timestamps, parsed.opens, parsed.highs, parsed.lows, parsed.closes);
      if (!timestamps.length) return { source: apiName, error: true, errorCode: 'NO_VALID_DATA' };

      const price = closes[closes.length - 1];
      const { change, changePercent } = computeChange(opens[0], price);

      let data = {
        source: apiName,
        timestamps,
        prices: closes,
        opens,
        highs,
        lows,
        closes,
        open: opens[0],
        high: Math.max(...highs),
        low: Math.min(...lows),
        price,
        change,
        changePercent,
        meta: parsed.meta || null
      };

      if (typeof transform === 'function') {
        data = transform(data, ctx) || data;
      }

      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return { source: apiName, error: true, errorCode: 500 };
    }
  };
}
