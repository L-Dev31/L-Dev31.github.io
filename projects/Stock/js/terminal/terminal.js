import { runNewsCommand } from './command/news.js';
import { runGoCommand, goToTicker } from './command/go.js';
import { runFaCommand } from './command/fa.js';
import { runAnrCommand } from './command/anr.js';
import { runErnCommand } from './command/ern.js';
import { runDvdCommand } from './command/dvd.js';
import { runRvCommand } from './command/rv.js';
import { runRiskCommand } from './command/risk.js';
import { runBetaCommand } from './command/beta.js';
import { runCompareCommand } from './command/compare.js';
import { runMcCommand } from './command/mc.js';
import { positions } from '../core/state.js';
import { openSimulation, normalizeHorizon, summarize, HORIZONS } from '../quant/simulation.js';

const INPUT_ID = 'terminal-input';
const OUTPUT_ID = 'terminal-output';
const PROMPT = 'USER>';
const TERMINAL_VERSION = '0.1';
const BANNER = [
    '█   █ █████ █   █ █████ ████  ███  ████',
    '██  █ █     ██ ██ █     █   █  █  █',
    '█ █ █ ████  █ █ █ ████  ████   █   ███',
    '█  ██ █     █   █ █     █  █   █      █',
    '█   █ █████ █   █ █████ █   █ ███ ████',
].join('\n');
const HISTORY_KEY = 'nemeris_terminal_history';
const HISTORY_MAX = 100;

const COMMAND_NAMES = ['GO', 'SIM', 'NEWS', 'FA', 'ANR', 'ERN', 'DVD', 'RV', 'RISK', 'BETA', 'COMPARE', 'MC', 'CLEAR', 'HELP'];

function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.slice(-HISTORY_MAX) : [];
    } catch (e) { return []; }
}

function persistHistory(arr) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(-HISTORY_MAX))); } catch (e) { /* quota */ }
}

let history = loadHistory();
let historyIdx = null;
let currentTask = null;

function cancelTask() {
    if (!currentTask) return false;
    try { currentTask.abort?.() || currentTask.abortController?.abort(); if (currentTask.intervalId) clearInterval(currentTask.intervalId); } catch (e) {}
    currentTask = null;
    return true;
}

function out(text, cls = 'terminal-log', html = false) {
    if (!html && cls === 'terminal-log' && window.terminalLogGlobal) { try { window.terminalLogGlobal(text); return; } catch (e) {} }
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
    if (!e) return 'Error';
    if (typeof e === 'string') return e;
    const c = e.errorCode || e.status || e.statusCode;
    if (c === 401) return '401 Unauthorized';
    if (c === 429) return '429 Too Many Requests';
    return e.message || e.errorMessage || JSON.stringify(e);
}

function getTarget(parts) {
    const raw = (parts[1] || '').toUpperCase();
    const pos = positions;
    if (raw) {
        if (pos[raw]) return { symbol: raw, ticker: pos[raw].ticker || raw };
        for (const [s, p] of Object.entries(pos)) {
            if (!p) continue;
            if ((p.ticker || '').toUpperCase() === raw) return { symbol: s, ticker: p.ticker || raw };
        }
        return { symbol: null, ticker: raw };
    }
    const active = window.getActiveSymbol?.();
    if (active && pos[active]) return { symbol: active, ticker: pos[active].ticker || active };
    return null;
}

function showHelp(cmd) {
    const cmds = [
        { c: 'GO &lt;SYM&gt; [P]', d: 'Open ticker' }, { c: 'NEWS &lt;SYM&gt;', d: 'News' },
        { c: 'FA &lt;SYM&gt;', d: 'Fundamentals (valuation, margins, balance, market)' },
        { c: 'ANR &lt;SYM&gt;', d: 'Analyst consensus' },
        { c: 'ERN &lt;SYM&gt;', d: 'Earnings + EPS surprises + forward estimates' },
        { c: 'DVD &lt;SYM&gt;', d: 'Dividends' },
        { c: 'RV T1 T2...', d: 'Comparison' },
        { c: 'RISK &lt;SYM&gt; [RANGE]', d: 'Volatility / Sharpe / Sortino / VaR / DD' },
        { c: 'BETA &lt;SYM&gt; [BENCH]', d: 'Beta vs benchmark (default ^GSPC)' },
        { c: 'COMPARE T1 T2...', d: 'Correlation matrix + perf summary' },
        { c: 'MC &lt;SYM&gt; [DAYS] [PATHS]', d: 'Monte-Carlo price projection' },
        { c: 'SIM &lt;SYM&gt; [AMOUNT] [HORIZON]', d: 'Visual simulation of an amount, e.g. SIM AAPL 1000 5Y' },
        { c: 'CLEAR', d: 'Clear' }, { c: 'HELP [CMD]', d: 'Help' }
    ];

    if (!cmd) {
        const rows = cmds
            .map(x => `<tr><td><span class="terminal-command">${x.c}</span></td><td>${x.d}</td></tr>`)
            .join('');
        out('Terminal Commands:');
        const html = `<div class="terminal-panel"><table class="terminal-data-table terminal-help-table"><thead><tr><th>COMMAND</th><th>DESCRIPTION</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        out(html, 'terminal-log', true);
        return;
    }

    const c = cmd.toUpperCase();
    const found = cmds.find(x => x.c.startsWith(c));
    if (found) {
        out(`Help ${c}:`);
        const html = `<div class="terminal-panel"><table class="terminal-mini-table terminal-help-table"><thead><tr><th>COMMAND</th><th>DESCRIPTION</th></tr></thead><tbody><tr><td><span class="terminal-command">${found.c}</span></td><td>${found.d}</td></tr></tbody></table></div>`;
        out(html, 'terminal-log', true);
    }
    else out(`Unknown: ${c}`);
}

const COMMAND_HANDLERS = {
    GO: runGoCommand,
    NEWS: runNewsCommand,
    FA: runFaCommand,
    ANR: runAnrCommand,
    ERN: runErnCommand,
    DVD: runDvdCommand,
    RV: runRvCommand,
    RISK: runRiskCommand,
    BETA: runBetaCommand,
    COMPARE: runCompareCommand,
    MC: runMcCommand,
    SIM: runSimCommand
};

async function runSimCommand({ parts, getTarget, out, fmtErr }) {
    const target = getTarget(parts);
    if (!target?.ticker) { out('Usage: SIM <SYMBOL> [AMOUNT] [HORIZON], e.g. SIM AAPL 1000 5Y'); return; }
    const amount = Number(String(parts[2] || '').replace(',', '.')) || undefined;
    const hRaw = (parts[3] || '').toUpperCase();
    const horizon = hRaw ? (HORIZONS[hRaw] ? hRaw : normalizeHorizon(hRaw)) : undefined;
    try {
        let symbol = target.symbol;
        if (!symbol) {
            const r = await window.goToTicker?.({ symbol: target.ticker });
            if (!r?.ok) { out(`Not found: ${target.ticker}`); return; }
            symbol = r.symbol;
        } else {
            await window.goToTicker?.({ symbol });
        }
        out(`Simulation ${target.ticker}...`);
        const res = await openSimulation(symbol, { amount, horizon });
        if (!res) { out('Simulation failed.'); return; }
        const s = summarize(res);
        out(`${s.instrument}: ${s.invested} over ${s.horizon}. Median ${s.median_value}. 90% range ${s.range_90pct}. Chance of loss ${s.chance_of_loss}.`);
    } catch (e) {
        out(`Error: ${fmtErr(e)}`);
    }
}

function htmlToText(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    const rows = [...box.querySelectorAll('tr')];
    if (rows.length) return rows.map(r => [...r.children].map(c => c.textContent.trim()).filter(Boolean).join(' | ')).join('\n');
    return box.textContent.replace(/\s+\n/g, '\n').trim();
}

/**
 * Runs a command for the assistant and returns what it printed as plain text.
 * The command is also shown in the terminal so the user can see what was done.
 */
async function runCaptured(raw) {
    const lines = [];
    const el = document.getElementById(OUTPUT_ID);
    const echo = (text, cls = 'terminal-log', html = false) => {
        if (!el) return;
        const d = document.createElement('div');
        d.className = cls;
        if (html) d.innerHTML = text; else d.textContent = text;
        el.appendChild(d);
        el.scrollTop = el.scrollHeight;
    };
    const capture = (text, cls = 'terminal-log', html = false) => {
        lines.push(html ? htmlToText(text) : String(text));
        echo(text, cls, html);
    };
    echo(`${PROMPT} ${raw}`, 'terminal-log terminal-cmd');
    const parts = String(raw || '').trim().split(/\s+/);
    const cmd = (parts[0] || '').toUpperCase();
    const handler = COMMAND_HANDLERS[cmd];
    if (!handler) return { ok: false, output: `Unknown command: ${cmd}. Known: ${COMMAND_NAMES.join(', ')}` };
    try {
        await handler({ parts, getTarget, out: capture, fmtErr });
        return { ok: true, output: lines.join('\n').slice(0, 6000) };
    } catch (e) {
        return { ok: false, output: `Error: ${fmtErr(e)}` };
    }
}
window.nemerisTerminal = { run: runCaptured, commands: COMMAND_NAMES };

async function exec(raw) {
    if (!raw?.trim()) return;
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toUpperCase();

    if (cmd === 'CLEAR') { document.getElementById(OUTPUT_ID).innerHTML = ''; out(BANNER, 'terminal-banner'); cancelTask(); return; }
    if (cmd === 'HELP' || cmd === '?') { showHelp(parts[1]); return; }

    const handler = COMMAND_HANDLERS[cmd];
    if (handler) {
        await handler({ parts, getTarget, out, fmtErr });
        return;
    }

    out(`Unknown command: ${raw}`);
}

function init() {
    const inp = document.getElementById(INPUT_ID);
    const el = document.getElementById(OUTPUT_ID);
    if (!inp || !el) return;
    document.getElementById('terminal-title').textContent = `Nemeris Terminal v${TERMINAL_VERSION}`;
    out(BANNER, 'terminal-banner');

    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = inp.value;
            if (v.trim()) {
                if (history[history.length - 1] !== v) {
                    history.push(v);
                    persistHistory(history);
                }
            }
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
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const value = inp.value;
            const tokens = value.split(/\s+/);
            // Complete only the first token (command)
            if (tokens.length === 1) {
                const prefix = tokens[0].toUpperCase();
                if (!prefix) return;
                const matches = COMMAND_NAMES.filter(c => c.startsWith(prefix));
                if (matches.length === 1) {
                    inp.value = matches[0] + ' ';
                } else if (matches.length > 1) {
                    out(matches.join('  '), 'terminal-log');
                }
            } else {
                // Complete ticker (2nd token) from positions
                const prefix = tokens[tokens.length - 1].toUpperCase();
                if (!prefix) return;
                const tickers = Object.keys(positions).filter(s => s.startsWith(prefix));
                if (tickers.length === 1) {
                    tokens[tokens.length - 1] = tickers[0];
                    inp.value = tokens.join(' ');
                } else if (tickers.length > 1 && tickers.length <= 25) {
                    out(tickers.join('  '), 'terminal-log');
                }
            }
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
        // Ctrl+C stops a running command only in the terminal, with nothing selected: everywhere else it copies.
        const inTerminal = document.getElementById('card-terminal')?.classList.contains('active');
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && inTerminal && !String(window.getSelection?.() || '')) { e.preventDefault(); if (cancelTask()) out('Streaming stopped.'); }
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
