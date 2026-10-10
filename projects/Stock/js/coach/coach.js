// Home: the coach. It reads the portfolio as prices arrive, says what deserves attention in plain words,
// offers the options (doing nothing included) and the idea behind each situation, taught in the Academy.
// A question missed in the Academy comes back for a quick check, and the Academy card always closes the page.
import { el, icon } from '../core/utils.js';
import { getUserSettings, globalPeriod } from '../core/state.js';
import { periodPhrase, debounce } from '../core/constants.js';
import { money } from '../data/banks.js';
import { syncAiGates } from '../ai/ai-core.js';
import { L, Ln } from '../i18n/i18n.js';
import { academyReady, worlds, levelById, nextLevel, worldOf, missedQuestion, record, t } from '../learn/academy.js';
import { teacher, questionBox } from '../learn/academy-page.js';
import { findSituations, portfolioMove, howUsual, pct } from './situations.js';
import { para, richText } from './explain.js';
import { photoFigure } from './photos.js';

// Each kind of situation has its color, icon and word, so a glance says what a card is about.
const ICON = { down: 'trend-down', up: 'trend-down', warn: 'info', setup: 'help', tip: 'lightbulb', calm: 'check', review: 'history' };
const KIND = { down: L('Fall'), up: L('Rise'), warn: L('Risk'), setup: L('To set up'), tip: L('Good to know'), calm: L('All calm'), review: L('Quick check') };
const ACTION_LABEL = { profile: L('Open your profile'), bank: L('Choose your bank'), explorer: L('Open Explorer'), news: L('Read the news'), stock: L('Open it'), learn: L('Open the Academy') };
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
    else if (action === 'learn') nav.go('learn');
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

/* ── one situation in three levels: the headline, what it means in one sentence,
   then on demand what you can do and the idea behind it ── */
function disclose(label, iconName, panel, cls, onFirstOpen) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.prepend(icon(iconName));
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => {
        const open = panel.hidden;
        if (open && !panel.childElementCount) onFirstOpen?.();
        panel.hidden = !open;
        b.setAttribute('aria-expanded', String(open));
    });
    return b;
}

function fillFacts(card, s) {
    card.querySelector('.coach-icon').replaceChildren(icon(ICON[s.tone]));
    card.querySelector('.coach-kind').textContent = KIND[s.tone];
    card.querySelector('.coach-what').replaceChildren(richText(s.title));
    card.querySelector('.coach-lead').replaceChildren(richText(s.meaning[0]));

    const why = s.meaning.slice(1).map(m => para('coach-why', m));
    if (s.history) {
        const usual = para('coach-why', L('Checking how usual this is…'));
        why.push(usual);
        howUsual(s.history).then(text => { if (text) usual.replaceChildren(richText(text)); else usual.remove(); });
    }
    const list = el('ul', 'coach-options');
    for (const o of s.options) {
        const li = el('li');
        const text = el('div');
        text.append(el('span', 'coach-option', o.label), para('coach-why', o.detail));
        li.append(text);
        if (o.action) {
            const go = el('button', 'btn btn-quiet', ACTION_LABEL[o.action]);
            go.type = 'button';
            go.addEventListener('click', () => runAction(o.action, o.symbol));
            li.append(go);
        }
        list.append(li);
    }
    const more = card.querySelector('.coach-more');
    more.replaceChildren(list, ...why, ...(s.ask ? [askButton(s.ask)] : []));
}

function learnButton(levelId, label) {
    const b = el('button', 'btn btn-quiet', label);
    b.type = 'button';
    b.dataset.level = levelId;
    b.prepend(icon('school'));
    return b;
}

function fillLesson(panel, levelId) {
    academyReady.then(() => {
        const level = levelById(levelId);
        if (level) panel.replaceChildren(para('coach-idea', t(level.idea)), learnButton(levelId, L('Learn it with Nemeris')));
    });
}

function buildCard(s) {
    const card = el('article', `coach-card is-${s.tone}`);
    card.dataset.id = s.id;
    const text = el('div', 'coach-text');
    text.append(el('span', 'coach-kind'), el('h3', 'coach-what'), el('p', 'coach-lead'));
    const head = el('div', 'coach-head');
    head.append(el('span', 'coach-icon'), text);
    const more = el('div', 'coach-more');
    const lesson = el('div', 'coach-lesson');
    more.hidden = lesson.hidden = true;
    const actions = el('div', 'coach-actions');
    actions.append(
        disclose(L('What can I do?'), 'expand', more, 'btn coach-toggle'),
        disclose(L('The idea to remember'), 'lightbulb', lesson, 'link-btn coach-idea-btn', () => fillLesson(lesson, s.lesson)),
    );
    if (s.photo) card.append(photoFigure(s.photo));
    card.append(head, actions, more, lesson);
    return card;
}

/* ── a question missed in the Academy comes back once, so it sticks ── */
function reviewCard(q) {
    const card = el('article', 'coach-card is-review');
    const head = el('div', 'coach-head');
    const text = el('div', 'coach-text');
    text.append(el('span', 'coach-kind', KIND.review), el('h3', 'coach-what', L('Quick check, 30 seconds')));
    head.append(badge('history'), text);
    card.append(head, para('meta', L('You missed this one in the Academy. Getting it right now is what makes it stick.')), para('quiz-q', t(q.ask)),
        questionBox(q, { onDone: score => record(q.id, score) }));
    return card;
}

/* ── the Academy, always last: where the user is, and one button to go on ── */
function renderLearn() {
    const box = host.querySelector('.coach-learn');
    box.hidden = !worlds().length;
    if (box.hidden) return;
    const level = nextLevel();
    const world = level ? worldOf(level.id) : worlds().at(-1);
    box.style.setProperty('--world', world.color);
    box.querySelector('.coach-kind').textContent = `${L('Academy')} · ${t(world.name)}`;
    box.querySelector('.coach-what').textContent = !level ? L('You finished every world.') : level.boss ? L('Boss: {0}', t(level.title)) : t(level.title);
    box.querySelector('.coach-lead').textContent = !level ? L('Replay any level whenever you like: it keeps what you know sharp.')
        : level.boss ? t(level.intro)
        : L('A short level with Nemeris: learn, practise, then apply. No risk of doing it wrong.');
    const go = box.querySelector('.coach-learn-go');
    go.hidden = !level;
    if (!level) return;
    go.dataset.level = level.id;
    go.lastChild.textContent = level === worlds()[0].levels[0] ? L('Start') : L('Continue');
}

function learnCard() {
    const box = el('article', 'coach-learn');
    box.hidden = true;
    const text = el('div', 'coach-text');
    text.append(el('span', 'coach-kind'), el('h3', 'coach-what'), el('p', 'coach-lead'));
    const go = el('button', 'btn btn-primary coach-learn-go');
    go.type = 'button';
    go.append(icon('play'), el('span'));
    const map = el('button', 'link-btn', L('See all the worlds'));
    map.type = 'button';
    map.dataset.go = 'learn';
    const actions = el('div', 'coach-actions');
    actions.append(go, map);
    box.append(teacher(), text, actions);
    return box;
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

    const missed = !reviewShown && missedQuestion();
    if (missed) {
        reviewShown = true;
        host.querySelector('.coach-review').append(reviewCard(missed));
    }
    renderLearn();
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
    host.replaceChildren(hello, status, el('div', 'coach-cards'), el('div', 'coach-review'), learnCard());
    render();
    academyReady.then(refresh);
    for (const type of ['nemeris:portfolio', 'nemeris:settings', 'nemeris:academy']) window.addEventListener(type, refresh);
}
