import { fetchNews } from '../yahoo-finance.js';
import { periodToDays } from '../constants.js';

export async function fetchTickerNewsItems({ ticker, limit = 50, days = 7, apiName = null }) {
    const api = apiName || window.getSelectedApi?.() || window.selectedApi || 'yahoo';
    const result = await fetchNews(ticker, limit, days, api);
    if (result?.error || !Array.isArray(result?.items)) return [];
    return result.items;
}

export async function fetchSymbolNewsItems({ symbol, positions, limit = 50, days = 7, apiName = null }) {
    const api = apiName || window.getSelectedApi?.() || window.selectedApi || 'yahoo';
    const mapped = positions?.[symbol]?.ticker || symbol;
    const items = await fetchTickerNewsItems({ ticker: mapped, limit, days, apiName: api });
    return items.map(item => ({ ...item, symbol }));
}

export async function runNewsCommand({ parts, getTarget, out, fmtErr }) {
    const rawQuery = parts.slice(1).join(' ').trim().toUpperCase();

    if (!rawQuery) {
        window.openNewsPage?.(null, { search: '' });
        out('Global News');
        return;
    }

    const target = getTarget(parts);
    if (!target?.ticker) {
        out('Error: invalid ticker');
        window.openNewsPage?.(null, { search: rawQuery });
        return;
    }

    out(`News for ${target.ticker}...`);

    try {
        const api = window.getSelectedApi?.() || window.selectedApi || 'yahoo';

        if (target.symbol && window.positions?.[target.symbol]) {
            const period = window.positions[target.symbol].currentPeriod || '1D';
            const results = await fetchSymbolNewsItems({
                symbol: target.symbol,
                positions: window.positions,
                limit: 20,
                days: periodToDays(period),
                apiName: api
            });
            out(`${(results || []).length} articles`);
            if (window.positions[target.symbol]) {
                window.positions[target.symbol].news = results;
                window.positions[target.symbol].lastNewsFetch = Date.now();
            }
            window.updateNewsUI?.(target.symbol, results);
            window.openNewsPage(target.symbol, { search: target.ticker || target.symbol });
            return;
        }

        const results = await fetchTickerNewsItems({ ticker: target.ticker, limit: 50, days: 7, apiName: api });
        if (!results.length) {
            out(`No news found for ${target.ticker}`);
            window.openNewsPage(null, { search: rawQuery });
            return;
        }

        out(`${results.length} articles`);
        window.openNewsPage(null, { search: rawQuery });
    } catch (error) {
        out(`Error: ${fmtErr(error)}`);
        window.openNewsPage?.(null, { search: rawQuery });
    }
}
