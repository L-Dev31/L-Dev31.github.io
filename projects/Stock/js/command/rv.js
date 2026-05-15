import { fetchYahooFinancials, fetchYahooChartSnapshot } from '../yahoo-finance.js';
import { esc, formatNumber, formatPercent, panel, keyValueTable } from './market-data-shared.js';

export async function runRvCommand({ parts, out, fmtErr }) {
    const targets = parts.slice(1).map(s => s.toUpperCase()).filter(Boolean);
    if (targets.length < 2) {
        out('Usage: RV T1 T2... (min 2)');
        return;
    }

    out(`Comparison: ${targets.join(', ')}`);
    try {
        const results = [];
        for (const target of targets) {
            let ticker = target;
            if (window.positions?.[target]) ticker = window.positions[target].ticker || ticker;
            const response = await fetchYahooFinancials(ticker, null);
            if (response && !response.error && response.financials?.financialData) {
                const fd = response.financials.financialData;
                const sd = response.financials.summaryDetail || {};
                const ks = response.financials.defaultKeyStatistics || {};
                const pr = response.financials.price || {};
                const price = fd.currentPrice?.raw ?? pr.regularMarketPrice?.raw ?? null;
                const dayChangePercent = pr.regularMarketChangePercent?.raw != null
                    ? pr.regularMarketChangePercent.raw * 100
                    : (fd.dayChangePercent ?? null);
                results.push({
                    ticker: target,
                    pe: sd.trailingPE?.raw ?? sd.forwardPE?.raw ?? ks.forwardPE?.raw ?? null,
                    revenue: fd.totalRevenue?.raw ?? null,
                    price,
                    dayChangePercent
                });
            } else {
                const snap = await fetchYahooChartSnapshot(ticker, '1mo', '1d');
                const meta = snap?.meta || {};
                const price = meta.regularMarketPrice ?? null;
                const prev = meta.chartPreviousClose ?? null;
                const dayChangePercent = (price != null && prev) ? ((price - prev) / prev) * 100 : null;
                results.push({ ticker: target, pe: null, revenue: null, price, dayChangePercent });
            }
        }

        const rows = results.map(r => {
            const details = [
                `Price ${formatNumber(r.price)}`,
                `Day Var ${formatPercent(r.dayChangePercent)}`,
                `PE ${formatNumber(r.pe)}`,
                `Rev ${r.revenue != null ? formatNumber(r.revenue, 0) : '<span class="terminal-muted">-</span>'}`
            ].join(' | ');
            return [esc(r.ticker), details];
        });
        out(panel(keyValueTable(rows, 'TICKER', 'INDICATORS')), 'terminal-log', true);
    } catch (error) {
        out(`Error: ${fmtErr(error)}`);
    }
}