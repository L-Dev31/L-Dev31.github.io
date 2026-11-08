// Home: the coach. It reads the portfolio as prices arrive, says what deserves attention in plain words,
// offers the options (doing nothing included) and the idea behind each situation, taught in the Academy.
// The page opens on its most pressing card, a situation or else the next lesson; the others follow under it.
import { el } from '../core/utils.js';
import { getUserSettings, globalPeriod } from '../core/state.js';
import { periodPhrase, debounce } from '../core/constants.js';
import { money } from '../data/banks.js';
import { syncAiGates } from '../ai/ai-core.js';
import { L, Ln } from '../i18n/i18n.js';
import { academyReady, worlds, nextLevel, worldOf, t } from '../learn/academy.js';
import { teacher } from '../learn/academy-page.js';
import { findSituations, portfolioMove, howUsual, pct } from './situations.js';
import { button, askButton, lessonIdea, para, richText, photoFigure } from './explain.js';

// Each kind of situation has its word, so a glance says what a card is about.
const KIND = { down: L('Fall'), up: L('Rise'), warn: L('Risk'), setup: L('To set up'), tip: L('Good to know'), calm: L('All calm') };
const ACTION_LABEL = { profile: L('Open your profile'), bank: L('Choose your bank'), explorer: L('Open Explorer'), news: L('Read the news'), stock: L('Open it'), learn: L('Open the Academy') };
const MAX_CARDS = 3;

let host, nav;
const cards = new Map();

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
    else if (action === 'explorer' || action === 'learn') nav.go(action);
    else if (action === 'stock') nav.openSymbol(symbol);
    else if (action === 'news') {
        nav.openSymbol(symbol);
        document.querySelector(`#card-${CSS.escape(symbol)} .card-tab-btn[data-target="news"]`)?.click();
    }
}

// A card's headline: its kind, what is happening, what it means in one sentence (filled in later).
function headline() {
    const text = el('div', 'coach-text');
    text.append(el('span', 'coach-kind'), el('h3', 'coach-what'), el('p', 'coach-lead'));
    return text;
}

/* ── one situation in three levels: the headline, what it means in one sentence,
   then on demand what you can do and the idea behind it ── */
function disclose(label, iconName, panel, cls, onFirstOpen) {
    const b = button(cls, label, iconName);
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
            const go = button('btn btn-quiet', ACTION_LABEL[o.action]);
            go.addEventListener('click', () => runAction(o.action, o.symbol));
            li.append(go);
        }
        list.append(li);
    }
    card.querySelector('.coach-more').replaceChildren(list, ...why, ...(s.ask ? [askButton(L('Ask Nemeris'), s.ask)] : []));
}

function buildCard(s) {
    const card = el('article', `coach-card is-${s.tone}`);
    card.dataset.id = s.id;
    const head = el('div', 'coach-head');
    head.append(headline());
    const more = el('div', 'coach-more');
    const lesson = el('div', 'coach-lesson');
    more.hidden = lesson.hidden = true;
    const actions = el('div', 'coach-actions');
    actions.append(
        disclose(L('What can I do?'), 'expand', more, 'btn coach-toggle'),
        disclose(L('The idea to remember'), 'lightbulb', lesson, 'link-btn coach-idea-btn',
            () => academyReady.then(() => lesson.replaceChildren(...lessonIdea('coach-idea', s.lesson)))),
    );
    if (s.photo) card.append(photoFigure(s.photo));
    card.append(head, actions, more, lesson);
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
    const go = button('btn btn-primary coach-learn-go', null, 'play');
    go.append(el('span'));
    const map = button('link-btn', L('See all the worlds'));
    map.dataset.go = 'learn';
    const actions = el('div', 'coach-actions');
    actions.append(go, map);
    box.append(teacher(), headline(), actions);
    return box;
}

// What is worth acting on now.
const pressing = s => s && (s.id === 'start' || (s.priority >= 40 && s.tone !== 'calm'));

function statusLine(situations) {
    const move = portfolioMove();
    let text;
    if (situations[0]?.id === 'start') text = L('Let us set you up, one step at a time.');
    else if (!move) text = L('Checking the latest prices…');
    else {
        const urgent = situations.filter(pressing).length;
        const signed = `${move.amount >= 0 ? '+' : '−'}${money(Math.abs(move.amount))}`;
        text = `${urgent ? Ln(urgent, 'One thing deserves a look.', '{0} things deserve a look.') : L('All calm.')} ${move.pct >= 0
            ? L('Your portfolio is up {0} {1} ({2}).', pct(move.pct), periodPhrase(globalPeriod), signed)
            : L('Your portfolio is down {0} {1} ({2}).', pct(move.pct), periodPhrase(globalPeriod), signed)}`;
    }
    host.querySelector('.coach-status').textContent = text;
}

function render() {
    if (!host) return;
    host.querySelector('.coach-hello').textContent = greeting();
    const situations = findSituations().slice(0, MAX_CARDS);
    statusLine(situations);

    // Cards already on screen keep their lesson and quiz; only their figures are refreshed.
    const keep = new Set(situations.map(s => s.id));
    for (const [id, card] of cards) if (!keep.has(id)) { card.remove(); cards.delete(id); }
    const shown = situations.map(s => {
        let card = cards.get(s.id);
        if (!card) cards.set(s.id, card = buildCard(s));
        fillFacts(card, s);
        return card;
    });

    renderLearn();
    // The first card leads: a pressing situation, else the next lesson. The others follow, the lesson last.
    const lesson = host.querySelector('.coach-learn');
    const lead = pressing(situations[0]) || lesson.hidden ? shown.shift() : lesson;
    host.querySelector('.coach-hero').replaceChildren(...(lead ? [lead] : []));
    host.querySelector('.coach-cards').replaceChildren(...shown, ...(lead === lesson || lesson.hidden ? [] : [lesson]));
    syncAiGates(host);
}

const refresh = debounce(render, 400);

/** Called once by general.js, which owns navigation. */
export function initCoach({ go, openSymbol }) {
    host = document.getElementById('coach');
    if (!host) return;
    nav = { go, openSymbol };
    const hero = el('div', 'coach-hero');
    hero.append(learnCard());
    host.replaceChildren(el('p', 'coach-hello'), el('p', 'coach-status'), hero, el('div', 'coach-cards'));
    render();
    academyReady.then(refresh);
    for (const type of ['nemeris:portfolio', 'nemeris:settings', 'nemeris:academy']) window.addEventListener(type, refresh);
}
