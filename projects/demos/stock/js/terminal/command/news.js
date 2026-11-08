import { fetchNews } from '../../data/yahoo-finance.js';

/** The recent headlines of one ticker (an empty list when there are none or Yahoo failed). */
export async function fetchTickerNewsItems({ ticker, limit = 50, days = 7 }) {
    return (await fetchNews(ticker, limit, days)).items;
}

/** The same for a portfolio symbol: searched under its Yahoo ticker, every headline tagged with the symbol. */
export async function fetchSymbolNewsItems({ symbol, positions, limit = 50, days = 7 }) {
    const items = await fetchTickerNewsItems({ ticker: positions?.[symbol]?.ticker || symbol, limit, days });
    return items.map(item => ({ ...item, symbol }));
}
