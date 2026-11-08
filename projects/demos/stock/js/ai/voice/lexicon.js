// Finance words for speech recognition: the user's own stocks (names and tickers), market jargon and indices.
// Speech engines hear "lumi bird", "cac quarante" or "a a p l": this turns them back into Lumibird, CAC 40 and AAPL.
// Browser engines also get the words as hints when they support it, AI engines as a prompt.
// Pure functions, no DOM and no app state, so they can be tested on their own.

const TERMS = [
    ['ETF', ['etf', 'étéf', 'été f', 'i t f']],
    ['PEA-PME', ['pea pme', 'péa pme', 'pea pem', 'péa pé em e', 'pea p m e']],
    ['PEA', ['pea', 'péa']],
    ['CAC 40', ['cac 40', 'caca 40', 'kak 40', 'cack 40', 'cac quarante']],
    ['S&P 500', ['s&p 500', 's and p 500', 's et p 500', 'esse et p 500', 'snp 500', 's p 500']],
    ['Nasdaq', ['nasdaq', 'nasdac', 'nazdaq', 'nasdak', 'nas daq']],
    ['Dow Jones', ['dow jones', 'dao jones', 'do jones']],
    ['Euro Stoxx 50', ['euro stoxx 50', 'euro stock 50', 'euro stocks 50', 'eurostoxx 50']],
    ['Stoxx 600', ['stoxx 600', 'stock 600', 'stocks 600']],
    ['MSCI World', ['msci world', 'm s c i world']],
    ['MSCI', ['msci', 'emme esse cé i']],
    ['Euronext', ['euronext', 'euro next', 'euronex']],
    ['EBITDA', ['ebitda', 'e bit da', 'ebida', 'ebit da', 'ibida']],
    ['MACD', ['macd', 'mac d', 'mac dee', 'mac dé']],
    ['ISIN', ['isin', 'isine', 'izine']],
    ['UCITS', ['ucits', 'you sits', 'u cits']],
    ['drawdown', ['drawdown', 'draw down', 'dro down']],
    ['ratio de Sharpe', ['ratio de sharpe', 'ratio de sharp', 'ratio de charpe']],
    ['Sharpe ratio', ['sharpe ratio', 'sharp ratio']],
    ['free cash flow', ['free cash flow', 'free cash flo']],
];

const NUMBERS = {
    zero: 0, un: 1, une: 1, one: 1, deux: 2, two: 2, trois: 3, three: 3, quatre: 4, four: 4, cinq: 5, five: 5,
    six: 6, sept: 7, seven: 7, huit: 8, eight: 8, neuf: 9, nine: 9, dix: 10, ten: 10, vingt: 20, twenty: 20,
    trente: 30, thirty: 30, quarante: 40, forty: 40, cinquante: 50, fifty: 50, soixante: 60, sixty: 60,
    cent: 100, cents: 100, hundred: 100, mille: 1000, thousand: 1000,
};
const JOINERS = new Set(['and', 'et', '&']);
// One-letter words that are ordinary French or English, never a spelled ticker on their own.
const PLAIN_LETTERS = new Set(['a', 'y', 'o', 'i']);
const LEGAL = /\s*\([^)]*\)|\b(?:s\.?a\.?|s\.?e\.?|inc|corp|corporation|company|co|plc|ag|n\.?v\.?|ltd|limited|group|groupe|holdings?|s\.?p\.?a|& ?cie|et cie|cie)\b\.?/gi;
const MAX_SPAN = 6;

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tokensOf = text => [...String(text || '').matchAll(/[\p{L}\p{N}&]+/gu)].map(m => ({ raw: m[0], norm: fold(m[0]), start: m.index, end: m.index + m[0].length }));

/** The comparison key of spoken words: accents, spaces and "and/et" gone, number words turned into digits. */
function keyOf(norms) {
    let out = '', total = 0, current = 0, inNumber = false;
    const flush = () => { if (inNumber) out += String(total + current); total = 0; current = 0; inNumber = false; };
    for (const w of norms) {
        if (JOINERS.has(w)) continue;
        const n = NUMBERS[w];
        if (n == null) { flush(); out += w.replace(/[^a-z0-9]/g, ''); continue; }
        inNumber = true;
        if (n === 100) current = (current || 1) * 100;
        else if (n === 1000) { total += (current || 1) * 1000; current = 0; }
        else current += n;
    }
    flush();
    return out;
}
export const speechKey = text => keyOf(tokensOf(text).map(t => t.norm));

/** Name without legal suffixes or brackets: "Omer-Decugis & Cie" is said "Omer-Decugis". */
export const spokenName = name => String(name || '').replace(LEGAL, ' ').replace(/[\s,.&-]+$/, '').replace(/\s+/g, ' ').trim();

/**
 * stocks: [{ name, ticker, symbol }] from the portfolio and watchlist.
 * Returns { entries: Map(key -> { text, kind }), stocks, tickers, terms }. kind: name, ticker or term.
 */
export function buildLexicon(stocks = []) {
    const entries = new Map();
    const add = (key, text, kind) => { if (key && key.length >= 2 && !entries.has(key)) entries.set(key, { text, kind }); };
    const names = [], tickers = [];
    for (const s of stocks) {
        const full = String(s?.name || '').trim();
        const short = spokenName(full);
        if (short) { add(speechKey(full), short, 'name'); add(speechKey(short), short, 'name'); names.push(short); }
        // "LVMH Moët Hennessy Louis Vuitton" is said "LVMH": a capitalised first word stands for the company.
        const lead = short.split(' ')[0];
        if (short.includes(' ') && /^[A-Z]{3,}$/.test(lead)) add(fold(lead), lead, 'name');
        for (const t of [s?.symbol, s?.ticker]) {
            const base = String(t || '').toUpperCase().replace(/^\^/, '').split(/[.=-]/)[0];
            if (/^[A-Z0-9]{2,6}$/.test(base) && /[A-Z]/.test(base)) { add(fold(base), base, 'ticker'); tickers.push(base); }
        }
    }
    for (const [text, spoken] of TERMS) {
        add(speechKey(text), text, 'term');
        for (const s of spoken) add(speechKey(s), text, 'term');
    }
    return { entries, stocks: [...new Set(names)], tickers: [...new Set(tickers)], terms: TERMS.map(t => t[0]) };
}

function distance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
    }
    return d[a.length][b.length];
}

/** "and" and "et" only join words inside a name ("S and P"), a match never starts or ends on them. */
const bounded = span => !JOINERS.has(span[0].norm) && !JOINERS.has(span[span.length - 1].norm);

/** A near miss on one of the user's stock names ("lumi bird", "omer de cugis"). One short word never qualifies:
 *  too many real words sit one letter away from a company ("accord" and Accor). */
function nearName(span, lex) {
    const key = keyOf(span.map(t => t.norm));
    if (key.length < 5 || /^\d+$/.test(key) || (span.length === 1 && key.length < 7)) return null;
    let best = null;
    for (const [k, e] of lex.entries) {
        if (e.kind !== 'name' || k[0] !== key[0] || Math.abs(k.length - key.length) > 2) continue;
        const d = distance(key, k);
        if (d <= (k.length >= 9 ? 2 : 1) && (!best || d < best.d)) best = { e, d };
    }
    return best;
}

/** An exact hit. A short ticker that is also a word ("ai" in "j'ai", "or", "en") counts only when heard in capitals. */
function exact(span, lex) {
    if (!bounded(span)) return null;
    const key = keyOf(span.map(t => t.norm));
    const e = lex.entries.get(key);
    if (!e) return null;
    if (e.kind === 'ticker' && key.length < 4 && !span.every(t => t.raw === t.raw.toUpperCase())) return null;
    return e;
}

/** A run of single letters said one by one ("a a p l", "p e r"): a spelled ticker or acronym. */
function letterRun(src, tokens, i) {
    let j = i;
    while (j < tokens.length && tokens[j].norm.length === 1 && /[a-z0-9]/.test(tokens[j].norm)
        && (j === i || /^\s+$/.test(src.slice(tokens[j - 1].end, tokens[j].start)))) j++;
    const run = tokens.slice(i, j);
    const letters = run.filter(t => /[a-z]/.test(t.norm));
    if (run.length < 3 || letters.length < 2 || letters.every(t => PLAIN_LETTERS.has(t.norm))) return null;
    return { n: run.length, text: run.map(t => t.norm.toUpperCase()).join('') };
}

/** Rewrites what the engine heard with the right spelling. Returns { text, hits }. */
export function correctTranscript(text, lex) {
    const src = String(text || '');
    if (!lex || !src.trim()) return { text: src, hits: 0 };
    const tokens = tokensOf(src);
    const out = [];
    let pos = 0, hits = 0;
    const put = (i, n, value) => {
        out.push(src.slice(pos, tokens[i].start), value);
        pos = tokens[i + n - 1].end;
        hits++;
        return n;
    };
    const longest = (i, max, test) => {
        for (let n = Math.min(max, tokens.length - i); n >= 1; n--) {
            const e = test(tokens.slice(i, i + n), lex);
            if (e) return put(i, n, e.text);
        }
        return 0;
    };
    // Near misses: the closest span wins, not the longest ("air liquid" before "air liquid va").
    const closest = i => {
        let best = null;
        for (let n = 1; n <= Math.min(4, tokens.length - i); n++) {
            const span = tokens.slice(i, i + n);
            const hit = bounded(span) ? nearName(span, lex) : null;
            if (hit && (!best || hit.d < best.d)) best = { ...hit, n };
        }
        return best ? put(i, best.n, best.e.text) : 0;
    };
    for (let i = 0; i < tokens.length;) {
        let used = longest(i, MAX_SPAN, exact);
        if (!used) {
            const run = letterRun(src, tokens, i);
            if (run) used = put(i, run.n, lex.entries.get(fold(run.text))?.text || run.text);
        }
        if (!used) used = closest(i);
        i += used || 1;
    }
    out.push(src.slice(pos));
    return { text: out.join(''), hits };
}

/** Of the engine's guesses for one sentence, the one that names the most known finance words. */
export function bestAlternative(alternatives, lex) {
    let best = null;
    for (const alt of alternatives) {
        const r = correctTranscript(alt, lex);
        if (!best || r.hits > best.hits) best = r;
    }
    return best?.text ?? '';
}

/** Hints for browser engines that take them (contextual biasing): the user's stocks first. */
export function hintPhrases(lex, max = 80) {
    const list = [...lex.stocks.map(p => [p, 6]), ...lex.tickers.map(p => [p, 4]), ...lex.terms.map(p => [p, 3])];
    const seen = new Set();
    return list.filter(([p]) => !seen.has(p) && seen.add(p)).slice(0, max).map(([phrase, boost]) => ({ phrase, boost }));
}

const PROMPT_LEAD = { fr: 'Conversation sur la Bourse et l\'investissement. Vocabulaire : ', en: 'A conversation about stocks and investing. Vocabulary: ' };
/** Prompt for an AI transcription model: it spells the words it was shown. */
export function recognitionPrompt(lex, lang, max = 600) {
    let text = PROMPT_LEAD[lang] || PROMPT_LEAD.en;
    for (const word of [...lex.stocks, ...lex.tickers, ...lex.terms]) {
        if (text.length + word.length + 2 > max) break;
        text += text.endsWith(' ') ? word : `, ${word}`;
    }
    return `${text}.`;
}
