import { runQuant } from '../quant-client.js';
import { fetchCloses, resolveTicker } from './quant-shared.js';
import { esc, formatNumber, formatPercent, panel } from './market-data-shared.js';

export async function runCompareCommand({ parts, out, fmtErr }) {
    const tokens = parts.slice(1).map(s => s.toUpperCase()).filter(Boolean);
    if (tokens.length < 2) { out('Usage: COMPARE T1 T2 [T3...]'); return; }
    if (tokens.length > 10) { out('Max 10 tickers.'); return; }

    out(`Correlation matrix: ${tokens.join(', ')}...`);

    try {
        const series = await Promise.all(tokens.map(t => fetchCloses(resolveTicker(t), '1y', '1d')));
        const pricesMap = {};
        const valid = [];
        for (let i = 0; i < tokens.length; i++) {
            if (series[i].length >= 30) {
                pricesMap[tokens[i]] = series[i];
                valid.push(tokens[i]);
            }
        }
        if (valid.length < 2) { out('Not enough valid series.'); return; }

        const matrix = await runQuant('correlationMatrix', pricesMap);

        // Also a perf summary per ticker
        const perf = valid.map(t => {
            const p = pricesMap[t];
            const first = p[0], last = p[p.length - 1];
            return { t, ret: ((last - first) / first) * 100, vol: stdev(returns(p)) * Math.sqrt(252) * 100 };
        });

        out(panel(matrixHtml(valid, matrix) + perfHtml(perf)), 'terminal-log', true);
    } catch (e) {
        out(`Error: ${fmtErr(e)}`);
    }
}

function matrixHtml(tickers, matrix) {
    const head = ['<th></th>', ...tickers.map(t => `<th>${esc(t)}</th>`)].join('');
    const body = tickers.map(a => {
        const cells = tickers.map(b => {
            const r = matrix[a]?.[b] ?? 0;
            return `<td style="${corrStyle(r)}">${formatNumber(r, 2)}</td>`;
        }).join('');
        return `<tr><th>${esc(a)}</th>${cells}</tr>`;
    }).join('');
    return `<table class="terminal-mini-table terminal-help-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function perfHtml(rows) {
    const body = rows.map(r => `<tr><th>${esc(r.t)}</th><td>${formatPercent(r.ret)}</td><td>${formatPercent(r.vol)}</td></tr>`).join('');
    return `<table class="terminal-mini-table terminal-help-table" style="margin-top:8px"><thead><tr><th>TICKER</th><th>1Y RETURN</th><th>ANN. VOL</th></tr></thead><tbody>${body}</tbody></table>`;
}

function corrStyle(r) {
    const a = Math.min(1, Math.abs(r));
    if (r >= 0) return `background:rgba(46,160,67,${a * 0.35})`;
    return `background:rgba(248,81,73,${a * 0.35})`;
}

function returns(p) {
    const out = new Array(p.length - 1);
    for (let i = 1; i < p.length; i++) out[i - 1] = p[i - 1] ? (p[i] - p[i - 1]) / p[i - 1] : 0;
    return out;
}
function stdev(arr) {
    if (arr.length < 2) return 0;
    let m = 0; for (let i = 0; i < arr.length; i++) m += arr[i]; m /= arr.length;
    let s = 0; for (let i = 0; i < arr.length; i++) { const d = arr[i] - m; s += d * d; }
    return Math.sqrt(s / arr.length);
}
