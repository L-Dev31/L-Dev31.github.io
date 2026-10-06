// The explainer: tap any underlined word, anywhere, to open a sheet that explains it as fully as a beginner needs.
// Words inside it are tappable too, with a back button, so one question can lead to the next.
import { el, icon } from '../core/utils.js';
import { getInvestor, comfortLevel, currencyCode } from '../core/state.js';
import { holdingRows } from '../data/holdings.js';
import { currentBank, money } from '../data/banks.js';
import { syncAiGates } from '../ai/ai-core.js';
import { L, Ln, LOCALE } from '../i18n/i18n.js';
import { TERMS } from './terms.js';
import { LESSONS, LESSON_IDS } from './lessons.js';
import { markSeen, answer, status, learnedCount } from './learning.js';

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

/* ── a check question: options in a new order each time, an answer that explains ── */
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

export function quizBox(id, onAnswer) {
    const { quiz } = LESSONS[id];
    const box = el('div', 'quiz');
    const options = el('div', 'quiz-options');
    const why = el('p', 'quiz-why');
    why.hidden = true;
    for (const { text, right } of shuffle(quiz.options.map((text, i) => ({ text, right: i === quiz.answer })))) {
        const b = el('button', 'quiz-option', text);
        b.type = 'button';
        if (right) b.dataset.right = '';
        b.addEventListener('click', () => {
            for (const o of options.children) {
                o.disabled = true;
                if ('right' in o.dataset) o.classList.add('right');
            }
            if (!right) b.classList.add('wrong');
            why.replaceChildren(el('strong', null, right ? L('Right.') : L('Not quite.')), ' ', richText(quiz.why));
            why.hidden = false;
            answer(id, right);
            onAnswer?.(right);
        });
        options.append(b);
    }
    box.append(para('quiz-q', quiz.q), options, why);
    return box;
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

function lessonLink(id, label) {
    const b = el('button', 'btn btn-quiet', label);
    b.type = 'button';
    b.dataset.lesson = id;
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
        if (t.lesson) {
            const idea = section(L('The idea to remember'), para('explain-idea', LESSONS[t.lesson].idea), lessonLink(t.lesson, L('Understand it in one minute')));
            idea.classList.add('explain-idea-box');
            parts.push(idea);
        }
        if (t.related?.length) parts.push(section(L('Related words'), chips(t.related)));
        parts.push(askButton(t.title));
        return [t.title, parts];
    },
    lesson(id) {
        const lesson = LESSONS[id];
        markSeen(id);
        const words = Object.keys(TERMS).filter(k => TERMS[k].lesson === id);
        const parts = [
            para('explain-lead explain-idea', lesson.idea),
            ...lesson.body.map(b => para(null, b)),
            section(L('Check yourself'), quizBox(id)),
        ];
        if (words.length) parts.push(section(L('Words behind this idea'), chips(words)));
        parts.push(askButton(lesson.title));
        return [lesson.title, parts];
    },
    library() {
        const STATUS = { new: L('New'), met: L('To check'), learned: L('Learned'), solid: L('Solid') };
        const list = el('div', 'lesson-list');
        for (const id of LESSON_IDS) {
            const row = el('button', 'lesson-row');
            row.type = 'button';
            row.dataset.lesson = id;
            const text = el('span', 'lesson-row-text');
            text.append(el('span', 'lesson-row-title', LESSONS[id].title), el('span', 'lesson-row-idea', plainText(LESSONS[id].idea)));
            const s = status(id);
            row.append(text, el('span', `lesson-status is-${s}`, STATUS[s]));
            list.append(row);
        }
        const words = Object.keys(TERMS).sort((a, b) => TERMS[a].title.localeCompare(TERMS[b].title, LOCALE));
        return [L('What Nemeris can teach you'), [
            el('p', 'explain-lead', Ln(learnedCount(), 'You understand {0} of {1} key ideas. Each takes a minute, with one question to check.', 'You understand {0} of {1} key ideas. Each takes a minute, with one question to check.', LESSON_IDS.length)),
            list,
            section(L('All the words'), chips(words)),
        ]];
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

/** Opens the explainer on a word ('term'), a lesson ('lesson') or the list of everything ('library'). */
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
    const lesson = !term && e.target.closest('[data-lesson]');
    const library = !term && !lesson && e.target.closest('[data-library]');
    if (!term && !lesson && !library) return;
    e.preventDefault();
    e.stopPropagation();
    if (term) explain('term', term.dataset.term);
    else if (lesson) explain('lesson', lesson.dataset.lesson);
    else explain('library');
}, true);
