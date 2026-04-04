import { runNewsCommand } from './command/news.js';
import { goToTicker } from './command/go.js';
import { runFaCommand, runAnrCommand, runErnCommand, runDvdCommand, runRvCommand } from './command/market-data.js';

const INPUT_ID = 'terminal-input';
const OUTPUT_ID = 'terminal-output';
const PROMPT = 'USER>';

let history = [];
let historyIdx = null;
let currentTask = null;

function cancelTask() {
    if (!currentTask) return false;
    try { currentTask.abort?.() || currentTask.abortController?.abort(); if (currentTask.intervalId) clearInterval(currentTask.intervalId); } catch (e) {}
    currentTask = null;
    return true;
}

function out(text, cls = 'terminal-log', html = false) {
    if (!html && window.terminalLogGlobal) { try { window.terminalLogGlobal(text); return; } catch (e) {} }
    const el = document.getElementById(OUTPUT_ID);
    if (!el) return;
    const d = document.createElement('div');
    d.className = cls;
    if (html) d.innerHTML = text; else d.textContent = text;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
    setTimeout(() => document.getElementById(INPUT_ID)?.scrollIntoView({ behavior: 'auto', block: 'end' }), 10);
}

function fmtErr(e) {
    if (!e) return 'Erreur';
    if (typeof e === 'string') return e;
    const c = e.errorCode || e.status || e.statusCode;
    if (c === 401) return '401 Unauthorized';
    if (c === 429) return '429 Too Many Requests';
    return e.message || e.errorMessage || JSON.stringify(e);
}

function getTarget(parts) {
    const raw = (parts[1] || '').toUpperCase();
    const pos = window.positions || {};
    if (raw) {
        if (pos[raw]) return { symbol: raw, ticker: pos[raw].api_mapping?.yahoo || pos[raw].ticker || raw };
        for (const [s, p] of Object.entries(pos)) {
            if (!p) continue;
            if ((p.ticker || '').toUpperCase() === raw) return { symbol: s, ticker: p.api_mapping?.yahoo || p.ticker || raw };
            if ((p.api_mapping?.yahoo || '').toUpperCase() === raw) return { symbol: s, ticker: p.api_mapping.yahoo };
        }
        return { symbol: null, ticker: raw };
    }
    const active = window.getActiveSymbol?.();
    if (active && pos[active]) return { symbol: active, ticker: pos[active].api_mapping?.yahoo || pos[active].ticker || active };
    return null;
}

function showHelp(cmd) {
    const cmds = [
        { c: 'GO &lt;SYM&gt; [P]', d: 'Ouvre onglet' }, { c: 'NEWS &lt;SYM&gt;', d: 'Actualités' },
        { c: 'FA &lt;SYM&gt;', d: 'Financiers' }, { c: 'ANR &lt;SYM&gt;', d: 'Analystes' },
        { c: 'ERN &lt;SYM&gt;', d: 'Résultats' }, { c: 'DVD &lt;SYM&gt;', d: 'Dividendes' },
        { c: 'RV T1 T2...', d: 'Comparaison' }, { c: 'CLEAR', d: 'Effacer' }, { c: 'HELP [CMD]', d: 'Aide' }
    ];

    if (!cmd) {
        const rows = cmds
            .map(x => `<tr><td><span class="terminal-command">${x.c}</span></td><td>${x.d}</td></tr>`)
            .join('');
        const html = `<div class="terminal-panel"><div class="terminal-panel-title">Commandes</div><table class="terminal-data-table terminal-help-table"><thead><tr><th>Commande</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        out(html, 'terminal-log', true);
        return;
    }

    const c = cmd.toUpperCase();
    const found = cmds.find(x => x.c.startsWith(c));
    if (found) {
        const html = `<div class="terminal-panel"><div class="terminal-panel-title">Aide</div><table class="terminal-mini-table"><tbody><tr><th>Commande</th><td><span class="terminal-command">${found.c}</span></td></tr><tr><th>Description</th><td>${found.d}</td></tr></tbody></table></div>`;
        out(html, 'terminal-log', true);
    }
    else out(`Inconnu: ${c}`);
}

async function exec(raw) {
    if (!raw?.trim()) return;
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toUpperCase();

    if (cmd === 'NEWS') {
        await runNewsCommand({ parts, getTarget, out, fmtErr });
        return;
    }

    if (cmd === 'CLEAR') { document.getElementById(OUTPUT_ID).innerHTML = ''; out('Terminal v0.1'); cancelTask(); return; }
    if (cmd === 'HELP' || cmd === '?') { showHelp(parts[1]); return; }

    if (cmd === 'GO') {
        const raw = (parts[1] || '').toUpperCase();
        const period = (parts[2] || '1D').toUpperCase();
        if (!raw) { out('Usage: GO <SYMBOL> [PERIOD]'); return; }
        const result = await goToTicker({ symbol: raw, period });
        if (result?.ok) out(`Ouvert: ${result.symbol || raw} ${period}`);
        else out(`Non trouvé: ${raw}`);
        return;
    }

    if (cmd === 'FA') {
        await runFaCommand({ parts, getTarget, out, fmtErr });
        return;
    }

    if (cmd === 'ANR') {
        await runAnrCommand({ parts, getTarget, out, fmtErr });
        return;
    }

    if (cmd === 'ERN') {
        await runErnCommand({ parts, getTarget, out, fmtErr });
        return;
    }

    if (cmd === 'DVD') {
        await runDvdCommand({ parts, getTarget, out, fmtErr });
        return;
    }

    if (cmd === 'RV') {
        await runRvCommand({ parts, out, fmtErr });
        return;
    }

    out(`Commande inconnue: ${raw}`);
}

function init() {
    const inp = document.getElementById(INPUT_ID);
    const el = document.getElementById(OUTPUT_ID);
    if (!inp || !el) return;
    out('Terminal v0.1 - HELP');

    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = inp.value;
            if (v.trim()) history.push(v);
            historyIdx = null;
            out(`${PROMPT} ${v}`, 'terminal-log terminal-cmd');
            exec(v);
            inp.value = '';
            setTimeout(() => { inp.focus(); inp.scrollIntoView({ behavior: 'auto', block: 'end' }); }, 20);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!history.length) return;
            historyIdx = historyIdx === null ? history.length - 1 : Math.max(0, historyIdx - 1);
            inp.value = history[historyIdx] || '';
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!history.length) return;
            if (historyIdx === null) { inp.value = ''; return; }
            historyIdx = Math.min(history.length - 1, historyIdx + 1);
            inp.value = historyIdx >= history.length ? '' : history[historyIdx] || '';
        }
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const card = document.getElementById('card-terminal');
            if (card?.classList.contains('active')) window.closeTerminalCard?.();
            else { window.openTerminalCard?.(); inp.focus(); }
        }
        if (e.key === 'Escape') window.closeTerminalCard?.() || document.getElementById('card-terminal')?.classList.remove('active');
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); if (cancelTask()) out('Streaming stoppé.'); }
    });

    document.getElementById('card-terminal')?.addEventListener('click', e => {
        if (e.target.closest('a, button, input, textarea, select, [contenteditable], .copy-btn')) return;
        inp.focus();
        inp.select?.();
    });
}

document.addEventListener('DOMContentLoaded', init);

export { init as initTerminal, exec as processCommand };