import { fetchYahooFinancials } from '../yahoo-finance.js';
import {
    esc, formatNumber, formatPercent, formatLargeNumber, getRaw,
    panel, keyValueTable, sectionHeader, runTickerCommand
} from './market-data-shared.js';

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
            if (!result || result.error) { out('No FA data available'); return; }

            const fd = result.financials?.financialData || {};
            const ks = result.financials?.defaultKeyStatistics || {};
            const sd = result.financials?.summaryDetail || {};
            const pr = result.financials?.price || {};
            const ap = result.financials?.assetProfile || {};

            // Percent values from Yahoo come as decimals (0.305 = 30.5%) — multiply.
            const pct = v => { const r = getRaw(v); return r == null ? null : r * 100; };

            const sectorLine = ap.sector || ap.industry
                ? `<div class="terminal-log" style="opacity:.7;margin-bottom:4px;">${esc(ap.sector || '')}${ap.industry ? ' / ' + esc(ap.industry) : ''}</div>`
                : '';

            const valuation = [
                ['Market Cap', formatLargeNumber(pr.marketCap ?? sd.marketCap)],
                ['P/E (trailing)', formatNumber(getRaw(sd.trailingPE))],
                ['Forward P/E', formatNumber(getRaw(sd.forwardPE ?? ks.forwardPE))],
                ['PEG ratio', formatNumber(getRaw(ks.pegRatio))],
                ['P/B', formatNumber(getRaw(ks.priceToBook))],
                ['P/S', formatNumber(getRaw(ks.priceToSalesTrailing12Months ?? sd.priceToSalesTrailing12Months))],
                ['EV / Revenue', formatNumber(getRaw(ks.enterpriseToRevenue))],
                ['EV / EBITDA', formatNumber(getRaw(ks.enterpriseToEbitda))]
            ];

            const profitability = [
                ['Gross margin', formatPercent(pct(fd.grossMargins))],
                ['Operating margin', formatPercent(pct(fd.operatingMargins))],
                ['Profit margin', formatPercent(pct(fd.profitMargins ?? ks.profitMargins))],
                ['EBITDA margin', formatPercent(pct(fd.ebitdaMargins))],
                ['Revenue growth (YoY)', formatPercent(pct(fd.revenueGrowth))],
                ['Earnings growth (YoY)', formatPercent(pct(fd.earningsGrowth))],
                ['ROE', formatPercent(pct(fd.returnOnEquity))],
                ['ROA', formatPercent(pct(fd.returnOnAssets))]
            ];

            const balance = [
                ['Total cash', formatLargeNumber(fd.totalCash)],
                ['Total debt', formatLargeNumber(fd.totalDebt)],
                ['Debt / Equity', formatNumber(getRaw(fd.debtToEquity))],
                ['Current ratio', formatNumber(getRaw(fd.currentRatio))],
                ['Quick ratio', formatNumber(getRaw(fd.quickRatio))],
                ['Free cash flow', formatLargeNumber(fd.freeCashflow)],
                ['Operating cash flow', formatLargeNumber(fd.operatingCashflow)]
            ];

            const price = getRaw(fd.currentPrice) ?? getRaw(pr.regularMarketPrice);
            const low52 = getRaw(sd.fiftyTwoWeekLow ?? fd.fiftyTwoWeekLow);
            const high52 = getRaw(sd.fiftyTwoWeekHigh ?? fd.fiftyTwoWeekHigh);

            const market = [
                ['Price', formatNumber(price)],
                ['Day variation', formatPercent(getRaw(pr.regularMarketChangePercent) != null ? getRaw(pr.regularMarketChangePercent) * 100 : getRaw(fd.dayChangePercent))],
                ['52W range', (low52 != null && high52 != null) ? `${formatNumber(low52)} → ${formatNumber(high52)}` : '<span class="terminal-muted">-</span>'],
                ['Volume', formatLargeNumber(sd.regularMarketVolume ?? fd.regularMarketVolume)],
                ['Avg volume (10d)', formatLargeNumber(sd.averageVolume10days ?? sd.averageDailyVolume10Day)],
                ['Beta', formatNumber(getRaw(ks.beta ?? sd.beta))],
                ['Dividend yield', formatPercent(pct(sd.dividendYield))],
                ['Payout ratio', formatPercent(pct(sd.payoutRatio))],
                ['Short ratio', formatNumber(getRaw(ks.shortRatio))],
                ['Short % of float', formatPercent(pct(ks.shortPercentOfFloat))]
            ];

            const content =
                sectorLine +
                sectionHeader('Valuation') + keyValueTable(valuation, 'METRIC', 'VALUE') +
                sectionHeader('Profitability') + keyValueTable(profitability, 'METRIC', 'VALUE') +
                sectionHeader('Balance Sheet') + keyValueTable(balance, 'METRIC', 'VALUE') +
                sectionHeader('Market & Income') + keyValueTable(market, 'METRIC', 'VALUE');

            out(panel(content), 'terminal-log', true);
        }
    });
}
