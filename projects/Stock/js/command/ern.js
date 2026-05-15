import { fetchYahooEarnings } from '../yahoo-finance.js';
import {
    esc, formatNumber, formatPercent, getRaw,
    panel, keyValueTable, sectionHeader, runTickerCommand
} from './market-data-shared.js';

function surpriseTable(history) {
    const rows = history.slice(-4).reverse().map(h => {
        const est = getRaw(h.epsEstimate);
        const act = getRaw(h.epsActual);
        const surp = getRaw(h.surprisePercent);
        const cls = surp == null ? 'terminal-muted' : surp > 0 ? 'terminal-pos' : surp < 0 ? 'terminal-neg' : 'terminal-muted';
        const surpStr = surp == null ? '-' : `${surp > 0 ? '+' : ''}${(surp * 100).toFixed(1)}%`;
        return `<tr>
            <th>${esc(h.quarter?.fmt || h.period || '-')}</th>
            <td>${est != null ? est.toFixed(2) : '-'}</td>
            <td>${act != null ? act.toFixed(2) : '-'}</td>
            <td class="${cls}">${surpStr}</td>
        </tr>`;
    }).join('');
    return `<table class="terminal-mini-table terminal-help-table">
        <thead><tr><th>QUARTER</th><th>EST.</th><th>ACTUAL</th><th>SURPRISE</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function trendTable(trend) {
    // earningsTrend periods: 0q, +1q, 0y, +1y
    const labels = { '0q': 'Current Qtr', '+1q': 'Next Qtr', '0y': 'Current Year', '+1y': 'Next Year' };
    const rows = trend
        .filter(t => labels[t.period])
        .map(t => {
            const e = t.earningsEstimate || {};
            const r = t.revenueEstimate || {};
            const epsAvg = getRaw(e.avg);
            const epsGrowth = getRaw(e.growth);
            const revAvg = getRaw(r.avg);
            const revGrowth = getRaw(r.growth);
            const fmtBn = v => v == null ? '-' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v.toFixed(2);
            return `<tr>
                <th>${labels[t.period]}</th>
                <td>${epsAvg != null ? epsAvg.toFixed(2) : '-'}</td>
                <td>${formatPercent(epsGrowth != null ? epsGrowth * 100 : null)}</td>
                <td>${fmtBn(revAvg)}</td>
                <td>${formatPercent(revGrowth != null ? revGrowth * 100 : null)}</td>
            </tr>`;
        }).join('');
    return `<table class="terminal-mini-table terminal-help-table">
        <thead><tr><th>PERIOD</th><th>EPS EST.</th><th>EPS GROWTH</th><th>REV EST.</th><th>REV GROWTH</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function formatEarningsDate(calendarEvents) {
    const ed = calendarEvents?.earnings?.earningsDate;
    if (!ed || !ed.length) return '<span class="terminal-muted">-</span>';
    const raw = getRaw(ed[0]);
    if (!raw) return '<span class="terminal-muted">-</span>';
    const d = new Date(raw < 1e12 ? raw * 1000 : raw);
    if (Number.isNaN(d.getTime())) return '<span class="terminal-muted">-</span>';
    return esc(d.toISOString().slice(0, 10));
}

export async function runErnCommand({ parts, getTarget, out, fmtErr }) {
    await runTickerCommand({
        parts,
        getTarget,
        out,
        fmtErr,
        usage: 'Usage: ERN <SYMBOL>',
        loadingPrefix: 'Earnings',
        onRun: async target => {
            const result = await fetchYahooEarnings(target.ticker, null);
            if (!result || result.error) { out('No earnings data available'); return; }

            const data = result.data || {};
            const ks = data.defaultKeyStatistics || {};
            const pr = data.price || {};
            const hist = data.earningsHistory?.history || [];
            const trend = data.earningsTrend?.trend || [];
            const cal = data.calendarEvents || {};

            const summary = [
                ['Ticker', esc(target.ticker)],
                ['Price', formatNumber(getRaw(pr.regularMarketPrice))],
                ['EPS TTM', formatNumber(getRaw(ks.trailingEps))],
                ['EPS Forward', formatNumber(getRaw(ks.forwardEps))],
                ['Next earnings', formatEarningsDate(cal)]
            ];

            let content = sectionHeader('Summary') + keyValueTable(summary, 'METRIC', 'VALUE');

            if (hist.length) {
                content += sectionHeader('EPS Surprise History') + surpriseTable(hist);
            }
            if (trend.length) {
                content += sectionHeader('Forward Estimates') + trendTable(trend);
            }

            out(panel(content), 'terminal-log', true);
        }
    });
}
