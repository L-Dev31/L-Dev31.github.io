import { COMMANDS, goToTicker, fmtErr } from './commands.js';
import { positions } from '../core/state.js';

const INPUT_ID = 'terminal-input';
const OUTPUT_ID = 'terminal-output';
const PROMPT = 'USER>';
const BANNER = [
    '█   █ █████ █   █ █████ ████  ███  ████',
    '██  █ █     ██ ██ █     █   █  █  █',
    '█ █ █ ████  █ █ █ ████  ████   █   ███',
    '█  ██ █     █   █ █     █  █   █      █',
    '█   █ █████ █   █ █████ █   █ ███ ████',
].join('\n');
const HISTORY_KEY = 'nemeris_terminal_history';
const HISTORY_MAX = 100;

const COMMAND_NAMES = [...Object.keys(COMMANDS), 'CLEAR', 'HELP'];

// The help table: command, description. Shown as HTML, hence the escaped brackets.
const HELP = [
    ['GO &lt;SYM&gt; [P]', 'Open ticker'], ['NEWS &lt;SYM&gt;', 'News'],
    ['FA &lt;SYM&gt;', 'Fundamentals (valuation, margins, balance, market)'],
    ['ANR &lt;SYM&gt;', 'Analyst consensus'],
    ['ERN &lt;SYM&gt;', 'Earnings + EPS surprises + forward estimates'],
    ['DVD &lt;SYM&gt;', 'Dividends'],
    ['RV T1 T2...', 'Comparison'],
    ['RISK &lt;SYM&gt; [RANGE]', 'Volatility / Sharpe / Sortino / VaR / DD'],
    ['BETA &lt;SYM&gt; [BENCH]', 'Beta vs benchmark (default ^GSPC)'],
    ['COMPARE T1 T2...', 'Correlation matrix + perf summary'],
    ['MC &lt;SYM&gt; [DAYS] [PATHS]', 'Monte-Carlo price projection'],
    ['SIM &lt;SYM&gt; [AMOUNT] [HORIZON]', 'Visual simulation of an amount, e.g. SIM AAPL 1000 5Y'],
    ['CLEAR', 'Clear'], ['HELP [CMD]', 'Help'],
];

let history = [];
try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (Array.isArray(saved)) history = saved.slice(-HISTORY_MAX);
} catch { /* no usable history saved */ }
let historyIdx = null;

function write(text, cls = 'terminal-log', html = false) {
    const box = document.getElementById(OUTPUT_ID);
    if (!box) return;
    const line = document.createElement('div');
    line.className = cls;
    line[html ? 'innerHTML' : 'textContent'] = text;
    box.append(line);
    box.scrollTop = box.scrollHeight;
}

function out(text, cls = 'terminal-log', html = false) {
    // Plain lines go through the app-wide logger (general.js) when it is there.
    if (!html && cls === 'terminal-log' && window.terminalLogGlobal) return window.terminalLogGlobal(text);
    write(text, cls, html);
    setTimeout(() => document.getElementById(INPUT_ID)?.scrollIntoView({ behavior: 'auto', block: 'end' }), 10);
}

function showHelp(cmd) {
    const panel = (rows, tableClass) => `<div class="terminal-panel"><table class="${tableClass} terminal-help-table"><thead><tr><th>COMMAND</th><th>DESCRIPTION</th></tr></thead><tbody>`
        + rows.map(([c, d]) => `<tr><td><span class="terminal-command">${c}</span></td><td>${d}</td></tr>`).join('') + '</tbody></table></div>';
    if (!cmd) {
        out('Terminal Commands:');
        out(panel(HELP, 'terminal-data-table'), 'terminal-log', true);
        return;
    }
    const name = cmd.toUpperCase();
    const found = HELP.find(([c]) => c.startsWith(name));
    if (!found) return out(`Unknown: ${name}`);
    out(`Help ${name}:`);
    out(panel([found], 'terminal-mini-table'), 'terminal-log', true);
}

// A failing command prints its error like any other line.
async function run(cmd, parts, print) {
    try { await COMMANDS[cmd](parts, print); } catch (e) { print(`Error: ${fmtErr(e)}`); }
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
    const capture = (text, cls, html) => {
        lines.push(html ? htmlToText(text) : String(text));
        write(text, cls, html);
    };
    write(`${PROMPT} ${raw}`, 'terminal-log terminal-cmd');
    const parts = String(raw || '').trim().split(/\s+/);
    const cmd = (parts[0] || '').toUpperCase();
    if (!COMMANDS[cmd]) return { ok: false, output: `Unknown command: ${cmd}. Known: ${COMMAND_NAMES.join(', ')}` };
    await run(cmd, parts, capture);
    return { ok: true, output: lines.join('\n').slice(0, 6000) };
}
window.nemerisTerminal = { run: runCaptured, commands: COMMAND_NAMES };

async function exec(raw) {
    if (!raw?.trim()) return;
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toUpperCase();

    if (cmd === 'CLEAR') {
        document.getElementById(OUTPUT_ID).innerHTML = '';
        out(BANNER, 'terminal-banner');
    } else if (cmd === 'HELP' || cmd === '?') showHelp(parts[1]);
    else if (COMMANDS[cmd]) await run(cmd, parts, out);
    else out(`Unknown command: ${raw}`);
}

function init() {
    const inp = document.getElementById(INPUT_ID);
    if (!inp || !document.getElementById(OUTPUT_ID)) return;
    document.getElementById('terminal-title').textContent = 'Nemeris Terminal v0.1';
    out(BANNER, 'terminal-banner');

    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = inp.value;
            if (v.trim() && history[history.length - 1] !== v) {
                history.push(v);
                try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_MAX))); } catch { /* storage full */ }
            }
            historyIdx = null;
            out(`${PROMPT} ${v}`, 'terminal-log terminal-cmd');
            exec(v);
            inp.value = '';
            setTimeout(() => { inp.focus(); inp.scrollIntoView({ behavior: 'auto', block: 'end' }); }, 20);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (!history.length) return;
            const up = e.key === 'ArrowUp';
            if (historyIdx === null && !up) { inp.value = ''; return; }
            historyIdx = historyIdx === null ? history.length - 1 : up ? Math.max(0, historyIdx - 1) : Math.min(history.length - 1, historyIdx + 1);
            inp.value = history[historyIdx] || '';
        } else if (e.key === 'Tab') {
            e.preventDefault();
            // The first word completes to a command, the next ones to a symbol from the portfolio.
            const tokens = inp.value.split(/\s+/);
            const prefix = tokens[tokens.length - 1].toUpperCase();
            if (!prefix) return;
            const first = tokens.length === 1;
            const matches = (first ? COMMAND_NAMES : Object.keys(positions)).filter(name => name.startsWith(prefix));
            if (matches.length === 1) {
                tokens[tokens.length - 1] = matches[0];
                inp.value = tokens.join(' ') + (first ? ' ' : '');
            } else if (matches.length > 1 && (first || matches.length <= 25)) out(matches.join('  '));
        }
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (document.getElementById('card-terminal')?.classList.contains('active')) window.closeTerminalCard?.();
            else { window.openTerminalCard?.(); inp.focus(); }
        }
        if (e.key === 'Escape') window.closeTerminalCard?.();
    });

    document.getElementById('card-terminal')?.addEventListener('click', e => {
        if (e.target.closest('a, button, input, textarea, select, [contenteditable], .copy-btn')) return;
        inp.focus();
        inp.select?.();
    });
}

document.addEventListener('DOMContentLoaded', init);

window.goToTicker = goToTicker;
