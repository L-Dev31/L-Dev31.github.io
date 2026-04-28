import { fetchYahooEarnings } from '../yahoo-finance.js';
import { esc, formatNumber, formatPercent, panel, keyValueTable, runTickerCommand } from './market-data-shared.js';

export async function runErnCommand({ parts, getTarget, out, fmtErr }) {
    await runTickerCommand({
        parts,
        getTarget,
        out,
        fmtErr,
        usage: 'Usage: ERN <SYMBOL>',
        loadingPrefix: 'Results',
        onRun: async target => {
            const result = await fetchYahooEarnings(target.ticker, null);
            if (result && !result.error) {
                const e = result.earnings || {};
                let earningsDate = '<span class="terminal-muted">-</span>';
                if (e.earningsTimestamp) {
                    const d = new Date((Number(e.earningsTimestamp) < 1e12 ? Number(e.earningsTimestamp) * 1000 : Number(e.earningsTimestamp)));
                    if (!Number.isNaN(d.getTime())) earningsDate = esc(d.toISOString().slice(0, 10));
                }
                const rows = [
                    ['Ticker', esc(target.ticker)],
                    ['EPS TTM', formatNumber(e.epsTrailingTwelveMonths)],
                    ['EPS Forward', formatNumber(e.epsForward)],
                    ['EPS Current Year', formatNumber(e.epsCurrentYear)],
                    ['Price', formatNumber(e.regularMarketPrice)],
                    ['1-Year Variation', formatPercent(e.yearlyPriceDeltaPercent)],
                    ['Earnings Date', earningsDate]
                ];
                out(panel(keyValueTable(rows, 'VALUE', 'RESULT')), 'terminal-log', true);
                return;
            }

            out('No earnings data available');
        }
    });
}