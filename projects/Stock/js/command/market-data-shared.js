export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatNumber(value, maximumFractionDigits = 2) {
    if (value == null || !Number.isFinite(Number(value))) return '<span class="terminal-muted">-</span>';
    return Number(value).toLocaleString('en-US', { maximumFractionDigits });
}

export function formatPercent(value, maximumFractionDigits = 2) {
    if (value == null || !Number.isFinite(Number(value))) return '<span class="terminal-muted">-</span>';
    const numeric = Number(value);
    const cls = numeric > 0 ? 'terminal-pos' : numeric < 0 ? 'terminal-neg' : 'terminal-muted';
    const sign = numeric > 0 ? '+' : '';
    return `<span class="${cls}">${sign}${numeric.toFixed(maximumFractionDigits)}%</span>`;
}

export function panel(content) {
    return `<div class="terminal-panel">${content}</div>`;
}

export function keyValueTable(rows, leftHeader = 'VALEUR', rightHeader = 'RESULTAT') {
    const body = rows
        .map(([label, value]) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`)
        .join('');
    return `<table class="terminal-mini-table terminal-help-table"><thead><tr><th>${esc(leftHeader)}</th><th>${esc(rightHeader)}</th></tr></thead><tbody>${body}</tbody></table>`;
}

export async function runTickerCommand({ parts, getTarget, out, fmtErr, usage, loadingPrefix, onRun }) {
    const target = getTarget(parts);
    if (!target?.ticker) {
        out(usage);
        return;
    }

    out(`${loadingPrefix} ${target.ticker}...`);

    try {
        await onRun(target);
    } catch (error) {
        out(`Erreur: ${fmtErr(error)}`);
    }
}