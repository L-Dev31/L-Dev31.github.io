// Home: the coach. It reads the portfolio as prices arrive, says what deserves attention in plain words,
// offers the options (doing nothing included), and teaches the idea behind each situation with one check question.
// Ideas met earlier come back for a quick check on a spaced schedule.
import { el, icon } from '../core/utils.js';
import { getUserSettings, globalPeriod } from '../core/state.js';
import { periodPhrase, debounce } from '../core/constants.js';
import { money } from '../data/banks.js';
import { syncAiGates } from '../ai/ai-core.js';
import { L, Ln } from '../i18n/i18n.js';
import { LESSONS, LESSON_IDS } from './lessons.js';
import { markSeen, learnedCount, dueReview } from './learning.js';
import { findSituations, portfolioMove, howUsual, pct } from './situations.js';
import { explain, para, richText, quizBox } from './explain.js';

const ICON = { down: 'trend-down', up: 'trend-down', warn: 'info', info: 'lightbulb', calm: 'check' };
const ACTION_LABEL = { profile: L('Open your profile'), bank: L('Choose your bank'), explorer: L('Open Explorer'), news: L('Read the news'), stock: L('Open it'), library: L('See the ideas') };
const MAX_CARDS = 3;

function badge(name) {
    const b = el('span', 'coach-icon');
    b.append(icon(name));
    return b;
}

let host, nav;
const cards = new Map();
let reviewShown = false;

function greeting() {
    const h = new Date().getHours();
    const name = getUserSettings().name;
    const first = name && name !== 'Nemeris User' ? name.split(' ')[0] : '';
    const hello = h < 5 || h >= 18 ? L('Good evening') : h < 12 ? L('Good morning') : L('Good afternoon');
    return first ? `${hello}, ${first}.` : `${hello}.`;
}

function runAction(action, symbol) {
    if (action === 'profile') {
        nav.go('settings');
        document.querySelector('#card-settings .card-tab-btn[data-target="settings-profile"]')?.click();
    } else if (action === 'bank') document.getElementById('bank-change')?.click();
    else if (action === 'explorer') nav.go('explorer');
    else if (action === 'library') explain('library');
    else if (action === 'stock') nav.openSymbol(symbol);
    else if (action === 'news') {
        nav.openSymbol(symbol);
        document.querySelector(`#card-${CSS.escape(symbol)} .card-tab-btn[data-target="news"]`)?.click();
    }
}

function askButton(question) {
    const b = el('button', 'btn btn-quiet', L('Ask Nemeris'));
    b.type = 'button';
    b.dataset.needsAi = 'assistant';
    b.prepend(icon('sparkle'));
    b.addEventListener('click', () => window.nemerisAssistant?.send(question));
    return b;
}

/* ── one situation: what is happening, what it means, your options, the idea behind it ── */
function fillFacts(card, s) {
    const head = card.querySelector('.coach-head');
    const title = el('h3', 'coach-what');
    title.append(richText(s.title));
    head.replaceChildren(badge(ICON[s.tone]), title);

    const meaning = card.querySelector('.coach-meaning');
    meaning.replaceChildren(...s.meaning.map(m => para(null, m)));
    if (s.history) {
        const usual = para('coach-usual meta', L('Checking how usual this is…'));
        meaning.append(usual);
        howUsual(s.history).then(text => { if (text) usual.replaceChildren(richText(text)); else usual.remove(); });
    }

    const list = el('ul', 'coach-options');
    for (const o of s.options) {
        const li = el('li');
        const text = el('div');
        text.append(el('strong', null, o.label), para('meta', o.detail));
        li.append(text);
        if (o.action) {
            const go = el('button', 'btn btn-quiet', ACTION_LABEL[o.action]);
            go.type = 'button';
            go.addEventListener('click', () => runAction(o.action, o.symbol));
            li.append(go);
        }
        list.append(li);
    }
    card.querySelector('.coach-options-box').replaceChildren(el('h4', 'coach-label', L('What you can do')), list);
}

function learnBox(lessonId) {
    const lesson = LESSONS[lessonId];
    const box = el('details', 'coach-learn');
    const summary = el('summary');
    const idea = el('span', 'coach-idea');
    idea.append(el('span', 'coach-label', L('The idea to remember')), para(null, lesson.idea));
    summary.append(icon('lightbulb'), idea, el('span', 'coach-learn-cta', L('Understand')));
    box.append(summary);
    box.addEventListener('toggle', () => {
        if (!box.open || box.querySelector('.coach-lesson')) return;
        markSeen(lessonId);
        const inside = el('div', 'coach-lesson');
        inside.append(...lesson.body.map(b => para(null, b)), el('h4', 'coach-label', L('Check yourself')), quizBox(lessonId, renderProgress));
        box.append(inside);
    });
    return box;
}

function buildCard(s) {
    const card = el('article', `coach-card is-${s.tone}`);
    card.dataset.id = s.id;
    card.append(el('div', 'coach-head'), el('div', 'coach-meaning'), el('div', 'coach-options-box'), learnBox(s.lesson));
    if (s.ask) {
        const foot = el('div', 'coach-foot');
        foot.append(askButton(s.ask));
        card.append(foot);
    }
    return card;
}

/* ── the spaced check: an idea met days ago comes back as one question ── */
function reviewCard(id) {
    const card = el('article', 'coach-card is-review');
    const head = el('div', 'coach-head');
    head.append(badge('history'), el('h3', 'coach-what', L('Quick check, 30 seconds')));
    const note = el('p', 'meta', L('You met this idea a while ago. Remembering it now is what makes it stick.'));
    const after = el('p', 'meta coach-after');
    after.hidden = true;
    card.append(head, note, quizBox(id, right => {
        after.replaceChildren(richText(right ? L('Well remembered. Nemeris will ask again later, less often.') : L('No problem: it will come back soon. The idea: {0}', LESSONS[id].idea)));
        after.hidden = false;
        renderProgress();
    }), after);
    return card;
}

function renderProgress() {
    const done = learnedCount();
    host.querySelector('.coach-progress-text').textContent = done
        ? Ln(done, 'You understand {0} of {1} key ideas.', 'You understand {0} of {1} key ideas.', LESSON_IDS.length)
        : L('{0} key ideas to understand investing, one minute each.', LESSON_IDS.length);
    host.querySelector('.coach-progress-bar').style.setProperty('--done', done / LESSON_IDS.length);
}

function statusLine(situations) {
    const line = host.querySelector('.coach-status');
    const urgent = situations.filter(s => s.priority >= 40 && s.tone !== 'calm').length;
    const parts = [];
    if (situations[0]?.id === 'start') parts.push(L('Let us set you up, one step at a time.'));
    else parts.push(urgent ? Ln(urgent, 'One thing deserves a look.', '{0} things deserve a look.') : L('All calm.'));
    const move = portfolioMove();
    if (!move && situations[0]?.id !== 'start') parts.splice(0, 1, L('Checking the latest prices…'));
    if (move && situations[0]?.id !== 'start') {
        const signed = `${move.amount >= 0 ? '+' : '−'}${money(Math.abs(move.amount))}`;
        parts.push(move.pct >= 0
            ? L('Your portfolio is up {0} {1} ({2}).', pct(move.pct), periodPhrase(globalPeriod), signed)
            : L('Your portfolio is down {0} {1} ({2}).', pct(move.pct), periodPhrase(globalPeriod), signed));
    }
    line.textContent = parts.join(' ');
}

function render() {
    if (!host) return;
    host.querySelector('.coach-hello').textContent = greeting();
    const situations = findSituations().slice(0, MAX_CARDS);
    statusLine(situations);

    // Cards already on screen keep their lesson and quiz; only their figures are refreshed.
    const list = host.querySelector('.coach-cards');
    const keep = new Set(situations.map(s => s.id));
    for (const [id, card] of cards) if (!keep.has(id)) { card.remove(); cards.delete(id); }
    for (const s of situations) {
        let card = cards.get(s.id);
        if (!card) { card = buildCard(s); cards.set(s.id, card); }
        fillFacts(card, s);
        list.append(card);
    }

    const due = dueReview();
    if (!reviewShown && due && !situations.some(s => s.lesson === due)) {
        reviewShown = true;
        host.querySelector('.coach-review').append(reviewCard(due));
    }
    renderProgress();
    syncAiGates(host);
}

const refresh = debounce(render, 400);

/** Called once by general.js, which owns navigation. */
export function initCoach({ go, openSymbol }) {
    host = document.getElementById('coach');
    if (!host) return;
    nav = { go, openSymbol };
    const hello = el('p', 'coach-hello');
    const status = el('p', 'coach-status');
    const progress = el('button', 'coach-progress');
    progress.type = 'button';
    progress.dataset.library = '';
    const bar = el('span', 'coach-progress-bar');
    progress.append(el('span', 'coach-progress-text'), bar, el('span', 'coach-progress-cta', L('See all')));
    host.replaceChildren(hello, status, el('div', 'coach-cards'), el('div', 'coach-review'), progress);
    render();
    for (const type of ['nemeris:portfolio', 'nemeris:settings']) window.addEventListener(type, refresh);
}
