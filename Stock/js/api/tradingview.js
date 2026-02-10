import { proxyFetch } from '../proxy-fetch.js';

const TV_SCANNER_BASE = 'https://scanner.tradingview.com';

const DEFAULT_PAYLOAD = {
    filter: [{ left: 'type', operation: 'in_range', right: ['stock', 'dr', 'fund'] }],
    options: { lang: 'en' },
    columns: ['name', 'exchange', 'description'],
    sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' }
};

export async function fetchTradingViewScanPage(region, offset, count, payload = DEFAULT_PAYLOAD) {
    const body = { ...payload, range: [offset, offset + count] };
    return proxyFetch(`${TV_SCANNER_BASE}/${region}/scan`, {
        fetchOptions: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }
    });
}

export async function fetchAllTradingViewRows(region, maxTotal = 600, batchSize = 200) {
    const allRows = [];
    for (let offset = 0; offset < maxTotal; offset += batchSize) {
        let data;
        try {
            data = await fetchTradingViewScanPage(region, offset, batchSize);
        } catch (e) {
            if (allRows.length === 0) return [];
            break;
        }
        const rows = data?.data || [];
        if (!rows.length) break;
        allRows.push(...rows);
        if (rows.length < batchSize) break;
    }
    return allRows;
}
