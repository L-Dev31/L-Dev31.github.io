import { fetchYahooFinancials } from '../yahoo-finance.js';
import { esc, formatNumber, formatPercent, panel, keyValueTable, runTickerCommand } from './market-data-shared.js';

export async function runFaCommand({ parts, getTarget, out, fmtErr }) {
    await runTickerCommand({
        parts,
        getTarget,
        out,
        fmtErr,
        usage: 'Usage: FA <SYMBOL>',
        loadingPrefix: 'Financials',
        onRun: async target => {
            const result = await fetchYahooFinancials(target.ticker, null);
            if (result && !result.error) {
                const financialData = result.financials?.financialData || {};
                const rows = [
                    ['Ticker', esc(target.ticker)],
                    ['Price', formatNumber(financialData.currentPrice?.raw)],
                    ['Day variation', formatPercent(financialData.dayChangePercent)],
                    ['52 weeks', financialData.fiftyTwoWeekLow?.raw != null && financialData.fiftyTwoWeekHigh?.raw != null
                        ? `${formatNumber(financialData.fiftyTwoWeekLow.raw)} -> ${formatNumber(financialData.fiftyTwoWeekHigh.raw)}`
                        : '<span class="terminal-muted">-</span>'],
                    ['Volume', formatNumber(financialData.regularMarketVolume, 0)],
                    ['Revenue growth', formatPercent(financialData.revenueGrowth != null ? Number(financialData.revenueGrowth) * 100 : null)],
                    ['Margins', financialData.grossMargins != null ? formatPercent(Number(financialData.grossMargins) * 100) : '<span class="terminal-muted">-</span>']
                ];
                out(panel(keyValueTable(rows, 'VALUE', 'RESULT')), 'terminal-log', true);
                return;
            }

            out('No FA data available');
        }
    });
}