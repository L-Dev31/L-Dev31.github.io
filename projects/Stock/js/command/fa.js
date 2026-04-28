import { fetchYahooFinancials } from '../yahoo-finance.js';
import { esc, formatNumber, formatPercent, panel, keyValueTable, runTickerCommand } from './market-data-shared.js';

export async function runFaCommand({ parts, getTarget, out, fmtErr }) {
    await runTickerCommand({
        parts,
        getTarget,
        out,
        fmtErr,
        usage: 'Usage: FA <SYMBOL>',
        loadingPrefix: 'Financiers',
        onRun: async target => {
            const result = await fetchYahooFinancials(target.ticker, null);
            if (result && !result.error) {
                const financialData = result.financials?.financialData || {};
                const rows = [
                    ['Ticker', esc(target.ticker)],
                    ['Prix', formatNumber(financialData.currentPrice?.raw)],
                    ['Variation jour', formatPercent(financialData.dayChangePercent)],
                    ['52 semaines', financialData.fiftyTwoWeekLow?.raw != null && financialData.fiftyTwoWeekHigh?.raw != null
                        ? `${formatNumber(financialData.fiftyTwoWeekLow.raw)} -> ${formatNumber(financialData.fiftyTwoWeekHigh.raw)}`
                        : '<span class="terminal-muted">-</span>'],
                    ['Volume', formatNumber(financialData.regularMarketVolume, 0)],
                    ['Croissance CA', formatPercent(financialData.revenueGrowth != null ? Number(financialData.revenueGrowth) * 100 : null)],
                    ['Marges', financialData.grossMargins != null ? formatPercent(Number(financialData.grossMargins) * 100) : '<span class="terminal-muted">-</span>']
                ];
                out(panel(keyValueTable(rows, 'VALEUR', 'RESULTAT')), 'terminal-log', true);
                return;
            }

            out('No FA data available');
        }
    });
}