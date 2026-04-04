import { fetchNews } from '../yahoo-finance.js';
import { loadApiConfig } from '../state.js';
import { periodToDays } from '../constants.js';

export async function fetchTickerNewsItems({ ticker, config, limit = 50, days = 7, apiName = null }) {
    const api = apiName || window.getSelectedApi?.() || window.selectedApi || 'yahoo';
    const result = await fetchNews(ticker, config, limit, days, api);
    if (result?.error || !Array.isArray(result?.items)) return [];
    return result.items;
}

export async function fetchSymbolNewsItems({ symbol, positions, config, limit = 50, days = 7, apiName = null }) {
    const api = apiName || window.getSelectedApi?.() || window.selectedApi || 'yahoo';
    const mapped = positions?.[symbol]?.api_mapping?.[api] || positions?.[symbol]?.ticker || symbol;
    const items = await fetchTickerNewsItems({ ticker: mapped, config, limit, days, apiName: api });
    return items.map(item => ({ ...item, symbol }));
}

export async function runNewsCommand({ parts, getTarget, out, fmtErr }) {
    const rawQuery = parts.slice(1).join(' ').trim().toUpperCase();

    if (!rawQuery) {
        window.openNewsPage?.(null, { search: '' });
        out('Actualités globales');
        return;
    }

    const target = getTarget(parts);
    if (!target?.ticker) {
        out('Erreur: ticker invalide');
        window.openNewsPage?.(null, { search: rawQuery });
        return;
    }

    out(`Actualites ${target.ticker}...`);

    try {
        const config = await loadApiConfig();
        const api = window.getSelectedApi?.() || window.selectedApi || 'yahoo';

        if (target.symbol && window.positions?.[target.symbol]) {
            const period = window.positions[target.symbol].currentPeriod || '1D';
            const results = await fetchSymbolNewsItems({
                symbol: target.symbol,
                positions: window.positions,
                config,
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

        const results = await fetchTickerNewsItems({ ticker: target.ticker, config, limit: 50, days: 7, apiName: api });
        if (!results.length) {
            out(`Aucune actualité trouvée pour ${target.ticker}`);
            window.openNewsPage(null, { search: rawQuery });
            return;
        }

        out(`${results.length} articles`);
        window.openNewsPage(null, { search: rawQuery });
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
        window.openNewsPage?.(null, { search: rawQuery });
    }
}
