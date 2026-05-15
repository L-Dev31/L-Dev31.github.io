import { fetchYahooQuotesBatch } from '../yahoo-finance.js';
import { esc, formatNumber, formatPercent, panel, sectionHeader } from './market-data-shared.js';

const MACRO_GROUPS = [
    {
        title: 'Volatility & Risk',
        tickers: [
            { sym: '^VIX', label: 'VIX (S&P vol)' },
            { sym: '^VVIX', label: 'VVIX (vol of vol)' },
            { sym: '^MOVE', label: 'MOVE (bond vol)' }
        ]
    },
    {
        title: 'US Treasury Yields',
        tickers: [
            { sym: '^IRX', label: '3M T-Bill', isYield: true },
            { sym: '^FVX', label: '5Y Treasury', isYield: true },
            { sym: '^TNX', label: '10Y Treasury', isYield: true },
            { sym: '^TYX', label: '30Y Treasury', isYield: true }
        ]
    },
    {
        title: 'FX & Dollar',
        tickers: [
            { sym: 'DX-Y.NYB', label: 'US Dollar Index' },
            { sym: 'EURUSD=X', label: 'EUR / USD' },
            { sym: 'GBPUSD=X', label: 'GBP / USD' },
            { sym: 'USDJPY=X', label: 'USD / JPY' }
        ]
    },
    {
        title: 'Major Indices',
        tickers: [
            { sym: '^GSPC', label: 'S&P 500' },
            { sym: '^IXIC', label: 'Nasdaq Composite' },
            { sym: '^DJI', label: 'Dow Jones' },
            { sym: '^FCHI', label: 'CAC 40' },
            { sym: '^GDAXI', label: 'DAX' },
            { sym: '^FTSE', label: 'FTSE 100' },
            { sym: '^N225', label: 'Nikkei 225' }
        ]
    },
    {
        title: 'Commodities',
        tickers: [
            { sym: 'GC=F', label: 'Gold' },
            { sym: 'SI=F', label: 'Silver' },
            { sym: 'CL=F', label: 'WTI Crude' },
            { sym: 'BZ=F', label: 'Brent Crude' },
            { sym: 'NG=F', label: 'Natural Gas' },
            { sym: 'HG=F', label: 'Copper' }
        ]
    }
];

function buildTable(group, quoteMap) {
    const rows = group.tickers.map(t => {
        const q = quoteMap[t.sym];
        if (!q) {
            return `<tr>
                <th>${esc(t.label)}</th>
                <td><span class="terminal-muted">-</span></td>
                <td><span class="terminal-muted">-</span></td>
                <td><span class="terminal-muted">${esc(t.sym)}</span></td>
            </tr>`;
        }
        const price = q.regularMarketPrice;
        const chgPct = q.regularMarketChangePercent;
        const displayPrice = t.isYield && price != null ? `${formatNumber(price, 2)}%` : formatNumber(price, 2);
        return `<tr>
            <th>${esc(t.label)}</th>
            <td>${displayPrice}</td>
            <td>${formatPercent(chgPct)}</td>
            <td><span class="terminal-muted">${esc(t.sym)}</span></td>
        </tr>`;
    }).join('');
    return `<table class="terminal-mini-table terminal-help-table">
        <thead><tr><th>INSTRUMENT</th><th>LEVEL</th><th>Δ DAY</th><th>SYMBOL</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

export async function runMacroCommand({ out, fmtErr }) {
    out('Macro dashboard...');

    try {
        const allSymbols = MACRO_GROUPS.flatMap(g => g.tickers.map(t => t.sym));
        const quotes = await fetchYahooQuotesBatch(allSymbols, null);
        if (!quotes) { out('Macro data unavailable'); return; }

        const quoteMap = {};
        for (const q of quotes) {
            if (q?.symbol) quoteMap[q.symbol] = q;
        }

        const content = MACRO_GROUPS
            .map(g => sectionHeader(g.title) + buildTable(g, quoteMap))
            .join('');

        out(panel(content), 'terminal-log', true);
    } catch (e) {
        out(`Error: ${fmtErr(e)}`);
    }
}
