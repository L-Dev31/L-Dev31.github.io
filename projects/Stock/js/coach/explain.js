// The explainer: tap any underlined word, anywhere, to open a sheet that explains it as fully as a beginner needs.
// Words inside it are tappable too, with a back button, so one question can lead to the next.
import { el, icon } from '../core/utils.js';
import { getInvestor, comfortLevel, currencyCode } from '../core/state.js';
import { holdingRows } from '../data/holdings.js';
import { currentBank, money } from '../data/banks.js';
import { syncAiGates } from '../ai/ai-core.js';
import { L, LOCALE } from '../i18n/i18n.js';
import { TERMS } from './terms.js';
import { levelById, t as tr } from '../learn/academy.js';

/* ── text with tappable words: "[[key|shown words]]" ── */
export function termButton(key, text = TERMS[key]?.title) {
    const b = el('button', 'term', text);
    b.type = 'button';
    b.dataset.term = key;
    return b;
}

export function richText(text) {
    const out = document.createDocumentFragment();
    let last = 0;
    for (const m of String(text).matchAll(/\[\[(\w+)\|([^\]]+)\]\]/g)) {
        out.append(text.slice(last, m.index), TERMS[m[1]] ? termButton(m[1], m[2]) : m[2]);
        last = m.index + m[0].length;
    }
    out.append(String(text).slice(last));
    return out;
}

export const plainText = text => String(text).replace(/\[\[\w+\|([^\]]+)\]\]/g, '$1');

export function para(cls, text) {
    const p = el('p', cls);
    p.append(richText(text));
    return p;
}

/** The figures a term may use to give an example with the user's own numbers. */
function myNumbers() {
    const { rows, total } = holdingRows();
    return { rows, total, money, home: currencyCode(), bank: currentBank(), inv: getInvestor(), comfort: comfortLevel() };
}

/* ── the sheet ── */
const sheet = el('dialog', 'sheet explain');
sheet.setAttribute('aria-labelledby', 'explain-title');
const back = el('button', 'icon-btn');
back.type = 'button';
back.setAttribute('aria-label', L('Back'));
back.append(icon('chevron-left'));
const title = el('h2', 'sheet-title');
title.id = 'explain-title';
const close = el('button', 'icon-btn');
close.type = 'button';
close.setAttribute('aria-label', L('Close'));
close.append(icon('close'));
const head = el('div', 'sheet-head');
head.append(back, title, close);
const body = el('div', 'explain-body');
sheet.append(head, body);
document.body.append(sheet);

let trail = [];

function section(heading, ...content) {
    const s = el('section', 'explain-part');
    s.append(el('h3', null, heading), ...content);
    return s;
}

function chips(keys) {
    const row = el('div', 'chips');
    for (const k of keys) if (TERMS[k]) row.append(termButton(k));
    return row;
}

function askButton(subject) {
    const b = el('button', 'btn btn-quiet', L('Ask Nemeris about it'));
    b.type = 'button';
    b.dataset.needsAi = 'assistant';
    b.prepend(icon('sparkle'));
    b.addEventListener('click', () => {
        sheet.close();
        window.nemerisAssistant?.send(L('Explain "{0}" simply, with an example from my portfolio if it helps.', subject));
    });
    return b;
}

/** Opens the Academy on a level (academy-page.js handles every [data-level]). */
function levelLink(id, label) {
    const b = el('button', 'btn btn-quiet', label);
    b.type = 'button';
    b.dataset.level = id;
    b.prepend(icon('school'));
    return b;
}

const VIEWS = {
    term(key) {
        const t = TERMS[key];
        let yours = null;
        try { yours = t.yours?.(myNumbers()) || null; } catch { /* numbers not loaded yet */ }
        const parts = [
            para('explain-lead', t.short),
            section(L('In more detail'), ...t.more.map(m => para(null, m))),
            section(L('Example'), para('explain-example', t.example)),
        ];
        if (yours) parts.push(section(L('With your numbers'), para('explain-yours', yours)));
        const level = levelById(t.lesson);
        if (level) {
            const idea = section(L('The idea to remember'), para('explain-idea', tr(level.idea)), levelLink(level.id, L('Learn it with Nemeris')));
            idea.classList.add('explain-idea-box');
            parts.push(idea);
        }
        if (t.related?.length) parts.push(section(L('Related words'), chips(t.related)));
        parts.push(askButton(t.title));
        return [t.title, parts];
    },
    library() {
        const words = Object.keys(TERMS).sort((a, b) => TERMS[a].title.localeCompare(TERMS[b].title, LOCALE));
        return [L('Every word explained'), [el('p', 'explain-lead', L('Tap a word to read what it means, with an example.')), chips(words)]];
    },
};

function render() {
    const [kind, arg] = trail[trail.length - 1];
    const [heading, parts] = VIEWS[kind](arg);
    title.textContent = heading;
    body.replaceChildren(...parts);
    back.hidden = trail.length < 2;
    syncAiGates(body);
    body.scrollTop = 0;
}

/** Opens the explainer on a word ('term') or on the list of every word ('library'). */
export function explain(kind, arg) {
    if (kind === 'term' && !TERMS[arg]) return;
    if (sheet.open) trail.push([kind, arg]);
    else trail = [[kind, arg]];
    render();
    if (!sheet.open) sheet.showModal();
}

back.addEventListener('click', () => { trail.pop(); render(); });
close.addEventListener('click', () => sheet.close());
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

// Capture phase: underlined words can sit inside other buttons (a card, a summary) without triggering them.
document.addEventListener('click', e => {
    const term = e.target.closest('.term[data-term]');
    const library = !term && e.target.closest('[data-library]');
    if (!term && !library) return;
    e.preventDefault();
    e.stopPropagation();
    if (term) explain('term', term.dataset.term);
    else explain('library');
}, true);

/** A word's whole explanation as plain text, with the user's own numbers when they help (for the assistant). */
export function termDetails(key) {
    const t = TERMS[key];
    if (!t) return null;
    let yours = null;
    try { yours = t.yours?.(myNumbers()) || null; } catch { /* numbers not loaded yet */ }
    return {
        key, title: t.title, short: t.short,
        more: t.more.map(plainText), example: plainText(t.example),
        with_your_numbers: yours ? plainText(yours) : null,
        idea_to_remember: levelById(t.lesson) ? plainText(tr(levelById(t.lesson).idea)) : null,
        related: t.related || [],
    };
}

/** The word Nemeris explains for a free-form query ("ETF", "frais de courtage", "orderFee"), or null. */
export function findTerm(word) {
    const norm = x => String(x || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const q = norm(word);
    if (!q) return null;
    const keys = Object.keys(TERMS);
    return keys.find(k => k.toLowerCase() === q.replace(/ /g, ''))
        || keys.find(k => norm(TERMS[k].title) === q)
        || keys.find(k => norm(TERMS[k].title).includes(q) || q.includes(norm(TERMS[k].title)))
        || keys.find(k => norm(TERMS[k].short).includes(q))
        || null;
}
