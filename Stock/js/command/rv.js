import { fetchYahooFinancials, fetchYahooChartSnapshot } from '../yahoo-finance.js';
import { esc, formatNumber, formatPercent, panel, keyValueTable } from './market-data-shared.js';

export async function runRvCommand({ parts, out, fmtErr }) {
    const targets = parts.slice(1).map(s => s.toUpperCase()).filter(Boolean);
    if (targets.length < 2) {
        out('Usage: RV T1 T2... (min 2)');
        return;
    }

    out(`Comparaison: ${targets.join(', ')}`);
    try {
        const results = [];
        for (const target of targets) {
            let ticker = target;
            if (window.positions?.[target]) ticker = window.positions[target].api_mapping?.yahoo || window.positions[target].ticker || ticker;
            const response = await fetchYahooFinancials(ticker, null);
            if (response && !response.error && response.financials?.financialData) {
                const financialData = response.financials.financialData;
                const price = financialData.currentPrice?.raw ?? null;
                const dayChangePercent = financialData.dayChangePercent ?? null;
                results.push({
                    ticker: target,
                    pe: financialData.trailingPE || financialData.forwardPE,
                    revenue: financialData.totalRevenue?.raw || financialData.totalRevenue,
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
                `Prix ${formatNumber(r.price)}`,
                `Var jour ${formatPercent(r.dayChangePercent)}`,
                `PE ${formatNumber(r.pe)}`,
                `CA ${r.revenue != null ? formatNumber(r.revenue, 0) : '<span class="terminal-muted">-</span>'}`
            ].join(' | ');
            return [esc(r.ticker), details];
        });
        out(panel(keyValueTable(rows, 'TICKER', 'INDICATEURS')), 'terminal-log', true);
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
    }
}