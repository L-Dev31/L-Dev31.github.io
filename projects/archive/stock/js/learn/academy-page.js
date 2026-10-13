// The Academy page: a world's path of levels, and the player that runs one level a step at a time.
import { el, icon, showCard, floating, progressBar } from '../core/utils.js';
import { L, LOCALE, LANG } from '../i18n/i18n.js';
import { button, iconButton, richText, para, photoFigure } from '../coach/explain.js';
import { academyReady, worlds, worldOf, levelById, levelAfter, isOpen, isDone, stars, nextLevel, stepsOf, record, finish, grades, t } from './academy.js';

const HEARTS = 3;
const PHASE = {
    learn: [L('Learn'), L('no risk, take your time')],
    practice: [L('Practice'), L('you get a second try')],
    apply: [L('Apply'), L('one try per question')],
    boss: [L('Boss'), L('one try per question, and no hearts left means starting over')],
};
const card = document.getElementById('card-learn');
let world = null;

/** Nemeris the teacher: the voice orb's soft shape in one flat colour, with two big eyes. Every move is CSS. */
export function teacher() {
    const body = el('span', 'teacher');
    body.setAttribute('aria-hidden', 'true');
    body.append(el('i'), el('i'));
    return body;
}

export const react = (who, mood) => {
    who.classList.remove('is-happy', 'is-oops');
    void who.offsetWidth;
    who.classList.add(`is-${mood}`);
};

/** Text of the content file: **bold**, [[tappable|words]], and lines starting with "- " as a bullet list. */
function rich(text) {
    const out = document.createDocumentFragment();
    let list = null;
    for (const line of String(text).split('\n')) {
        const item = line.startsWith('- ');
        if (!item) list = null;
        else if (!list) out.append(list = el('ul', 'learn-list'));
        const n = el(item ? 'li' : 'p');
        line.slice(item ? 2 : 0).split(/\*\*(.+?)\*\*/).forEach((bit, i) => n.append(i % 2 ? el('strong', null, bit) : richText(bit)));
        (list || out).append(n);
    }
    return out;
}

const LETTER_MS = 48;
const START_MS = 350;

/** Wraps every letter in a span that appears after the one before: Nemeris types, at a pace that can be read. Returns the letter count. */
function spoken(root) {
    let n = 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walk.nextNode()) texts.push(walk.currentNode);
    for (const node of texts) {
        const out = document.createDocumentFragment();
        // The parts alternate between words and the spaces between them, which stay plain.
        for (const part of node.textContent.split(/(\s+)/).filter(Boolean)) {
            if (/^\s/.test(part)) { out.append(part); continue; }
            const word = el('span', 'word');
            for (const letter of part) {
                const mark = el('span', 'w', letter);
                mark.style.setProperty('--i', n++);
                word.append(mark);
            }
            out.append(word);
        }
        node.replaceWith(out);
    }
    return n;
}

/** Nemeris says something in a chat bubble that fills in word by word. */
export function talk(text, who = teacher()) {
    const row = el('div', 'learn-talk');
    const bubble = el('div', 'learn-bubble');
    bubble.append(rich(text));
    row.speechMs = START_MS + spoken(bubble) * LETTER_MS;
    row.append(who, bubble);
    return row;
}

/** What comes after the words (a photo, an example, the answers, the button) shows up one by one once she has finished. */
export const afterWords = (row, nodes) => nodes.map((node, i) => later(node, row.speechMs + 250 + i * 350));

// A node that has not appeared yet takes no room: it is hidden until its turn, then it fades in, slides down and
// pushes what follows it.
const waiting = new Map();
function reveal(node) {
    waiting.delete(node);
    node.hidden = false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const room = node.parentElement?.classList.contains('learn-stage') ? { marginTop: '-16px' } : {};
    node.style.overflow = 'hidden';
    node.animate([{ opacity: 0, height: 0, transform: 'translateY(-14px)', ...room }, { opacity: 1, height: `${node.offsetHeight}px`, transform: 'none', marginTop: 0 }], { duration: 480, easing: 'cubic-bezier(.2, .9, .3, 1.1)' })
        .finished.then(() => { node.style.overflow = ''; }, () => {});
}
function later(node, ms) {
    clearTimeout(waiting.get(node));
    node.hidden = true;
    if (ms <= 0) { reveal(node); return node; }
    waiting.set(node, setTimeout(() => reveal(node), ms));
    return node;
}
/** Shows everything still waiting now (a tap on the stage) or forgets it (a new step). */
const flushLater = () => [...waiting.keys()].forEach(reveal);
const dropLater = () => { waiting.forEach(clearTimeout); waiting.clear(); };

/** Three icons, the first n lit: stars for a level's best run, hearts during a run. */
function lit(name, n) {
    const row = el('span', `learn-${name}s`);
    for (let i = 0; i < HEARTS; i++) {
        const mark = icon(name);
        mark.classList.toggle('is-lost', i >= n);
        row.append(mark);
    }
    if (name === 'star') row.setAttribute('aria-label', L('{0} of {1} hearts kept', n, HEARTS));
    return row;
}

/** The world's two flat colours: its accent and its background. */
const paint = w => {
    document.documentElement.style.setProperty('--world', w.color);
    document.documentElement.style.setProperty('--world-bg', w.bg);
};
const percent = n => (n / 100).toLocaleString(LOCALE, { style: 'percent' });

/* ── the map ── */
// On phones "What you know" is a floating button: it takes turns with the assistant's.
const phone = matchMedia('(max-width: 899px)');
const gradesOpened = floating('grades', () => {
    const box = card.querySelector('.learn-grades');
    if (box && phone.matches) box.open = false;
});

function gradesPanel() {
    const box = el('details', 'panel learn-grades');
    box.open = !phone.matches;
    box.addEventListener('toggle', () => { if (box.open && phone.matches) gradesOpened(); });
    const all = grades();
    const summary = el('summary', 'panel-title');
    const average = Math.round(all.reduce((sum, g) => sum + g.score, 0) / all.length);
    const mini = el('span', 'learn-mini');
    mini.append(el('i'));
    mini.firstChild.style.width = `${average}%`;
    const ring = el('span', 'learn-ring');
    ring.style.setProperty('--p', `${average}%`);
    ring.append(el('b', null, `${average}%`));
    const close = el('span', 'learn-close');
    close.setAttribute('aria-label', L('Close'));
    close.append(icon('close'));
    summary.append(el('span', 'learn-label', L('What you know')), el('span', 'learn-average', percent(average)), mini, icon('chevron-left'), ring, close);
    box.append(summary);
    for (const g of all) box.append(progressBar({ label: g.name, detail: percent(g.score), compact: true, eta: false }).set(g.score / 100).el);
    const words = button('link-btn', L('Every word explained'));
    words.dataset.library = '';
    box.append(words);
    return box;
}

function node(level, next) {
    const li = el('li', `learn-node${level.boss ? ' is-boss' : ''}${isDone(level.id) ? ' is-done' : ''}${level === next ? ' is-next' : ''}`);
    const b = button();
    b.disabled = !isOpen(level.id);
    const dot = el('span', 'learn-dot');
    dot.append(icon(level.boss === 'final' ? 'crown' : level.boss ? 'tower' : 'play'));
    b.append(dot, el('span', 'learn-name', t(level.title)));
    if (isDone(level.id)) b.append(lit('star', stars(level.id)));
    b.addEventListener('click', () => play(level));
    li.append(b);
    return li;
}

function renderMap(w) {
    world = w || world || worldOf(nextLevel()?.id) || worlds()[0];
    if (!world) return;
    paint(world);
    const head = el('h1', 'view-title learn-title');
    const pick = el('select', 'world-select');
    pick.setAttribute('aria-label', L('World'));
    for (const x of worlds()) {
        const open = isOpen(x.levels[0].id);
        const o = new Option(open ? t(x.name) : L('Locked'), x.id);
        o.disabled = !open;
        pick.append(o);
    }
    pick.value = world.id;
    pick.addEventListener('change', () => renderMap(worlds().find(x => x.id === pick.value)));
    head.append(icon(world.icon), pick);

    const next = world.levels.find(l => isOpen(l.id) && !isDone(l.id));
    const finished = world.levels.every(l => isDone(l.id));
    const say = finished ? L('You finished this world. Replay any level whenever you like.')
        : !next ? L('This world opens when you finish the one before it.')
        : next === world.levels[0] ? t(world.intro)
        : L('Next: {0}. Ready when you are.', t(next.title));
    const path = el('ol', 'learn-path');
    for (const level of world.levels) path.append(node(level, next));
    const main = el('div', 'learn-world');
    main.append(head, talk(say), path);
    const split = el('div', 'learn-split');
    split.append(main, gradesPanel());
    card.dataset.view = 'map';
    card.replaceChildren(split);
    // Always in reach, so the next step is one tap away.
    if (next) {
        const start = button('learn-start', next.boss ? L('Face the boss') : L('Start the lesson'));
        start.dataset.level = next.id;
        main.append(start);
    }
    requestAnimationFrame(() => path.querySelector('.is-next')?.scrollIntoView({ block: 'center' }));
}

/* ── the player ── */
/**
 * Slides the stage out to one side, lets swap() fill it, slides it in from the other. dir: 1 forward, -1 back.
 * swap() returning false stops there. Taps during a slide are ignored.
 */
export async function slide(stage, dir, swap) {
    if (stage.sliding) return;
    stage.sliding = true;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const out = stage.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 80}px)` }], { duration: calm ? 0 : 170, easing: 'ease-in', fill: 'forwards' });
    await out.finished.catch(() => {});
    const goOn = swap();
    out.cancel();
    if (goOn !== false) stage.animate([{ opacity: 0, transform: `translateX(${dir * 110}px) scale(.96)` }, { opacity: 1, transform: 'none' }], { duration: calm ? 0 : 520, easing: 'cubic-bezier(.2,.9,.3,1.12)' });
    stage.sliding = false;
}

/**
 * What both players (a level, the questionnaire) are made of: a progress bar on top, the stage, Back and Next under it.
 * Tapping the stage shows the words at once; progress(share) fills the bar and makes Nemeris type the next words again.
 */
export function player(cls, nextCls) {
    const fill = el('div', 'pbar-fill');
    const track = el('div', 'pbar-track');
    track.append(fill);
    const top = el('div', 'learn-top');
    top.append(track);
    const stage = el('div', 'learn-stage');
    const back = button('btn learn-back', L('Back'), 'chevron-left');
    const next = button(nextCls);
    const nav = el('div', 'learn-nav');
    nav.append(back, next);
    const box = el('div', cls);
    box.append(top, stage, nav);
    stage.addEventListener('click', () => { box.classList.add('skip'); flushLater(); });
    const progress = share => {
        fill.style.transform = `scaleX(${share})`;
        box.classList.remove('skip');
        dropLater();
    };
    return { box, top, stage, back, next, progress };
}

const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/**
 * A question: options in a new order each time. While tries remain a wrong pick is greyed out (onMiss);
 * the end calls onDone(score): 1 right at once, .5 right on a second try, 0 missed.
 */
/** The number a person typed, in either language's habits ("1 157,63", "1,157.63", "12 %"), or null. */
function readNumber(raw) {
    let s = String(raw).replace(/[\s\u00a0\u202f%€$£]/g, '').replace('−', '-');
    const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) s = comma > dot ? s.replaceAll('.', '').replace(',', '.') : s.replaceAll(',', '');
    else if (comma >= 0) s = (LANG === 'fr' || /^-?\d+,\d{1,2}$/.test(s)) && s.split(',').length === 2 ? s.replace(',', '.') : s.replaceAll(',', '');
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** A question answered with a number: typed, because recalling beats recognising. Same scoring as the choices. */
function numberBox(q, { tries, onMiss, onDone }) {
    const box = el('div', 'quiz');
    const field = el('input', 'quiz-input');
    field.type = 'text';
    field.inputMode = 'decimal';
    field.autocomplete = 'off';
    field.setAttribute('aria-label', L('Your answer'));
    const unit = q.unit ? el('span', 'quiz-unit', q.unit) : null;
    const check = button('btn', L('Check'));
    const row = el('div', 'quiz-number');
    row.append(field, ...(unit ? [unit] : []), check);
    const why = el('p', 'quiz-why');
    why.hidden = true;
    const tol = q.tol ?? Math.max(0.005, Math.abs(q.answer) * 0.005);
    const shown = `${q.answer.toLocaleString(LOCALE, { maximumFractionDigits: 6 })}${q.unit ? ` ${q.unit}` : ''}`;
    const limit = Math.min(tries, 3);
    let missed = 0;
    const submit = () => {
        const value = readNumber(field.value);
        if (value === null) { why.hidden = false; why.replaceChildren(el('strong', null, L('Type a number.'))); return; }
        const right = Math.abs(value - q.answer) <= tol;
        why.hidden = false;
        if (!right && ++missed < limit) {
            why.replaceChildren(el('strong', null, L('Not quite. Check your steps and try again.')), ...(q.hint ? [' ', richText(t(q.hint))] : []));
            field.select();
            onMiss?.();
            return;
        }
        field.disabled = check.disabled = true;
        row.classList.add(right ? 'right' : 'wrong');
        why.replaceChildren(el('strong', null, right ? L('Right!') : L('Not this time. The answer is {0}.', shown)), ' ', richText(t(q.why)));
        onDone(right ? (missed ? 0.5 : 1) : 0);
    };
    check.addEventListener('click', submit);
    field.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    box.append(row, why);
    return box;
}

function questionBox(q, { tries = 1, onMiss, onDone }) {
    if (q.type === 'number') return numberBox(q, { tries, onMiss, onDone });
    const box = el('div', 'quiz');
    const options = el('div', 'quiz-options');
    const why = el('p', 'quiz-why');
    why.hidden = true;
    let missed = 0;
    for (const [text, right] of shuffle(q.options.map((o, i) => [t(o), i === q.answer]))) {
        const b = button('quiz-option');
        b.append(richText(text));
        b.addEventListener('click', () => {
            why.hidden = false;
            if (!right && ++missed < tries) {
                b.disabled = true;
                b.classList.add('wrong');
                why.replaceChildren(el('strong', null, L('Not quite. Try another one.')));
                onMiss?.();
                return;
            }
            for (const o of options.children) o.disabled = true;
            if (!right) b.classList.add('wrong');
            [...options.children].find(o => o.dataset.right)?.classList.add('right');
            why.replaceChildren(el('strong', null, right ? L('Right!') : L('Not this time.')), ' ', richText(t(q.why)));
            onDone(right ? (missed ? 0.5 : 1) : 0);
        });
        b.dataset.right = right ? '1' : '';
        options.append(b);
    }
    box.append(options, why);
    return box;
}

/** A level's title screen over the main area: a small line fades in, then the title rises word by word. Resolves once it is gone. */
function splash(level) {
    const number = worlds().indexOf(world) + 1;
    const kind = level.boss ? L('Boss · World {0}', number) : L('Level {0} · World {1}', world.levels.filter(l => !l.boss).indexOf(level) + 1, number);
    const box = el('div', 'learn-splash');
    const words = t(level.title).split(' ');
    const title = el('h1');
    words.forEach((word, i) => {
        const span = el('span', null, word);
        span.style.setProperty('--i', i);
        title.append(span, ' ');
    });
    box.append(el('p', 'learn-splash-kind', kind), title);
    // The whole main area takes the world's colour; the sidebar and the bottom bar are never touched.
    document.querySelector('main.container').append(box);
    return new Promise(done => {
        const end = () => {
            if (box.classList.contains('is-out')) return;
            box.classList.add('is-out');
            setTimeout(() => { box.remove(); done(); }, 400);
        };
        box.addEventListener('click', end);
        setTimeout(end, 1300 + words.length * 180 + 1200);
    });
}

/** The end of a level: its result big in the middle, Nemeris under it (jumping for joy on a perfect run), then the stars. */
function result(level, { won, hearts, best }) {
    const after = levelAfter(level.id);
    const who = teacher();
    who.classList.add(won ? (hearts === best ? 'is-joy' : 'is-happy') : 'is-oops');
    const bubble = el('div', 'learn-bubble');
    bubble.append(won ? (level.boss ? richText(L('You beat {0}! Everything before it is now solid.', t(level.title))) : rich(L('To remember: {0}', t(level.idea)))) : richText(level.boss
        ? L('{0} wins this time. What you learned is still yours: the test starts again from the beginning.', t(level.title))
        : L('That happens to everyone. Try the level again: it will feel easier the second time.')));
    const actions = el('div', 'learn-actions');
    const add = (label, action, cls) => {
        const b = button(cls, label);
        b.addEventListener('click', action);
        actions.append(b);
    };
    if (won && after) add(L('Next level'), () => play(after), 'btn btn-primary');
    else if (!won) add(L('Try again'), () => play(level), 'btn btn-primary');
    add(t(world.back), () => renderMap(world), won && after ? 'btn btn-quiet' : 'btn btn-primary');
    const box = el('div', 'learn-result');
    box.append(el('h1', null, won ? (level.boss ? L('Boss beaten!') : L('Level done!')) : L('No hearts left')), who, won ? lit('star', hearts) : lit('heart', 0), bubble, actions);
    card.dataset.view = 'play';
    card.replaceChildren(box);
}

function play(level) {
    if (!isOpen(level.id)) return;
    world = worldOf(level.id);
    paint(world);
    // A boss starts with Nemeris saying what is coming.
    const steps = [...(level.boss ? [{ say: level.intro, phase: 'boss' }] : []), ...stepsOf(level)];
    const graded = s => s.ask && s.phase !== 'learn';
    // A run must be losable: with only two graded questions, one miss ends it.
    const best = Math.max(1, Math.min(HEARTS, steps.filter(graded).length - 1));
    let at = 0, hearts = best;
    const nemeris = teacher();
    const { box, top, stage, back, next, progress } = player('learn-play', 'btn btn-primary learn-next');
    const close = iconButton('close', L('Back to the map'));
    close.addEventListener('click', () => renderMap(world));
    const lives = el('span', 'learn-hearts');
    top.prepend(close);
    top.append(lives);
    const phase = el('p', 'learn-phase');
    stage.before(phase);
    card.dataset.view = 'play';
    card.replaceChildren(box);

    const drawHearts = () => lives.replaceChildren(...lit('heart', hearts).children);
    const move = (after = 0) => { next.textContent = L('Continue'); later(next, after); };

    function draw() {
        const s = steps[at];
        progress(at / steps.length);
        const [name, rule] = PHASE[s.phase];
        phase.replaceChildren(el('strong', null, name), ` · ${rule}`);
        phase.dataset.phase = s.phase;
        // Going back is for what carries no risk: a graded question cannot be answered twice.
        back.hidden = !(at > 0 && !graded(steps[at - 1]));
        if (s.say) {
            const row = talk(t(s.say), nemeris);
            const extras = afterWords(row, [...(s.photo ? [photoFigure(s.photo, 'learn-photo')] : []), ...(s.example ? [para('explain-example', t(s.example))] : [])]);
            stage.replaceChildren(row, ...extras);
            return move(row.speechMs + 250 + extras.length * 350);
        }
        next.hidden = true;
        const row = talk(t(s.ask), nemeris);
        stage.replaceChildren(row, ...afterWords(row, [questionBox(s, {
            tries: s.phase === 'learn' ? Infinity : s.phase === 'practice' ? 2 : 1,
            onMiss: () => react(nemeris, 'oops'),
            onDone: score => {
                react(nemeris, score ? 'happy' : 'oops');
                if (s.phase !== 'learn') record(s.id, score);
                if (!score && s.phase !== 'learn') { hearts--; drawHearts(); }
                move();
            },
        })]));
    }

    const go = (to, dir) => slide(stage, dir, () => {
        if (to < steps.length && hearts) {
            at = to;
            return draw();
        }
        if (hearts) finish(level.id, hearts);
        result(level, { won: hearts > 0, hearts, best });
        return false;
    });

    next.addEventListener('click', () => go(at + 1, 1));
    back.addEventListener('click', () => go(at - 1, -1));
    drawHearts();
    // The first step starts once the title screen is gone, so the teacher's words are not typed behind it.
    splash(level).then(draw);
}

/** Opens the Academy: on a level when it is open, else on the map of its world. */
export async function openAcademy(levelId) {
    showCard('card-learn');
    await academyReady;
    const level = levelId && levelById(levelId);
    if (level && isOpen(level.id)) play(level);
    else renderMap(level && isOpen(worldOf(level.id).levels[0].id) ? worldOf(level.id) : null);
}

// Any element with data-level, anywhere (a Home card, a word's explanation), opens that level.
document.addEventListener('click', e => {
    const target = e.target.closest('[data-level]');
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    target.closest('dialog')?.close();
    openAcademy(target.dataset.level);
}, true);
