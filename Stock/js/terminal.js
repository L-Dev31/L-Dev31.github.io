import { runNewsCommand } from './command/news.js';
import { runGoCommand, goToTicker } from './command/go.js';
import { runFaCommand } from './command/fa.js';
import { runAnrCommand } from './command/anr.js';
import { runErnCommand } from './command/ern.js';
import { runDvdCommand } from './command/dvd.js';
import { runRvCommand } from './command/rv.js';

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
        out('Commandes terminal:');
        const html = `<div class="terminal-panel"><table class="terminal-data-table terminal-help-table"><thead><tr><th>COMMANDE</th><th>DESCRIPTION</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        out(html, 'terminal-log', true);
        return;
    }

    const c = cmd.toUpperCase();
    const found = cmds.find(x => x.c.startsWith(c));
    if (found) {
        out(`Aide ${c}:`);
        const html = `<div class="terminal-panel"><table class="terminal-mini-table terminal-help-table"><thead><tr><th>COMMANDE</th><th>DESCRIPTION</th></tr></thead><tbody><tr><td><span class="terminal-command">${found.c}</span></td><td>${found.d}</td></tr></tbody></table></div>`;
        out(html, 'terminal-log', true);
    }
    else out(`Inconnu: ${c}`);
}

const COMMAND_HANDLERS = {
    GO: runGoCommand,
    NEWS: runNewsCommand,
    FA: runFaCommand,
    ANR: runAnrCommand,
    ERN: runErnCommand,
    DVD: runDvdCommand,
    RV: runRvCommand
};

async function exec(raw) {
    if (!raw?.trim()) return;
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toUpperCase();

    if (cmd === 'CLEAR') { document.getElementById(OUTPUT_ID).innerHTML = ''; out('Terminal v0.1'); cancelTask(); return; }
    if (cmd === 'HELP' || cmd === '?') { showHelp(parts[1]); return; }

    const handler = COMMAND_HANDLERS[cmd];
    if (handler) {
        await handler({ parts, getTarget, out, fmtErr });
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

window.goToTicker = goToTicker;

export { init as initTerminal, exec as processCommand };