// The Academy page: a world's path of levels, and the player that runs one level a step at a time.
import { el, icon, showCard } from '../core/utils.js';
import { L, LOCALE } from '../i18n/i18n.js';
import { richText, para } from '../coach/explain.js';
import { photoFigure } from '../coach/photos.js';
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

const react = (who, mood) => {
    who.classList.remove('is-happy', 'is-oops');
    void who.offsetWidth;
    who.classList.add(`is-${mood}`);
};

/** Text of the content file: **bold**, [[tappable|words]], and lines starting with "- " as a bullet list. */
function rich(text) {
    const inline = part => {
        const out = document.createDocumentFragment();
        part.split(/\*\*(.+?)\*\*/).forEach((bit, i) => out.append(i % 2 ? el('strong', null, bit) : richText(bit)));
        return out;
    };
    const out = document.createDocumentFragment();
    let list = null;
    for (const line of String(text).split('\n')) {
        if (line.startsWith('- ')) {
            if (!list) out.append(list = el('ul', 'learn-list'));
            const li = el('li');
            li.append(inline(line.slice(2)));
            list.append(li);
        } else {
            list = null;
            const p = el('p');
            p.append(inline(line));
            out.append(p);
        }
    }
    return out;
}

const WORD_MS = 45;
const START_MS = 350;

/** Wraps every word in a span that fades in after the one before: Nemeris "types" and the reader keeps pace. Returns the word count. */
function spoken(root) {
    let n = 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walk.nextNode()) texts.push(walk.currentNode);
    for (const node of texts) {
        const out = document.createDocumentFragment();
        for (const part of node.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { out.append(part); continue; }
            const word = el('span', 'w', part);
            word.style.setProperty('--i', n++);
            out.append(word);
        }
        node.replaceWith(out);
    }
    return n;
}

/** Nemeris says something in a chat bubble that fills in word by word. */
function talk(text, who = teacher()) {
    const row = el('div', 'learn-talk');
    const bubble = el('div', 'learn-bubble');
    bubble.append(rich(text));
    row.speechMs = START_MS + spoken(bubble) * WORD_MS;
    row.append(who, bubble);
    return row;
}

/** What comes after the words (a photo, an example, the answers) shows up one by one once she has finished. */
const afterWords = (row, nodes) => nodes.map((node, i) => {
    node.classList.add('later');
    node.style.setProperty('--after', `${row.speechMs + 250 + i * 350}ms`);
    return node;
});

/** Three icons, the first n lit: stars for a level's best run, hearts during a run. */
function lit(name, n) {
    const row = el('span', `learn-${name}s`);
    for (let i = 0; i < HEARTS; i++) {
        const mark = icon(name);
        mark.classList.toggle('is-lost', i >= n);
        row.append(mark);
    }
    return row;
}

function starRow(n) {
    const row = lit('star', n);
    row.setAttribute('aria-label', L('{0} of {1} hearts kept', n, HEARTS));
    return row;
}

/** The world's two flat colours: its accent and its background. */
const paint = w => {
    document.documentElement.style.setProperty('--world', w.color);
    document.documentElement.style.setProperty('--world-bg', w.bg);
};
const percent = n => (n / 100).toLocaleString(LOCALE, { style: 'percent' });
const levelNumber = level => worldOf(level.id).levels.filter(l => !l.boss).indexOf(level) + 1;

/* ── the map ── */
function gradesPanel() {
    const box = el('details', 'panel learn-grades');
    box.open = !matchMedia('(max-width: 899px)').matches;
    const all = grades();
    const summary = el('summary', 'panel-title', L('What you know'));
    summary.append(el('span', 'learn-average', percent(Math.round(all.reduce((sum, g) => sum + g.score, 0) / all.length))));
    box.append(summary);
    for (const g of all) {
        const bar = el('div', 'pbar pbar-compact');
        const head = el('div', 'pbar-head');
        head.append(el('span', 'pbar-label', g.name), el('span', 'pbar-detail', percent(g.score)));
        const track = el('div', 'pbar-track');
        const fill = el('div', 'pbar-fill');
        fill.style.transform = `scaleX(${g.score / 100})`;
        track.append(fill);
        bar.append(head, track);
        box.append(bar);
    }
    const words = el('button', 'link-btn', L('Every word explained'));
    words.type = 'button';
    words.dataset.library = '';
    box.append(el('p', 'meta', L('Each bar is the share of all the Academy\'s questions on that topic you got right on your last try.')), words);
    return box;
}

function node(level, next) {
    const open = isOpen(level.id);
    const li = el('li', `learn-node${level.boss ? ' is-boss' : ''}${isDone(level.id) ? ' is-done' : ''}${level === next ? ' is-next' : ''}`);
    const b = el('button');
    b.type = 'button';
    b.disabled = !open;
    const dot = el('span', 'learn-dot');
    dot.append(icon(level.boss === 'final' ? 'crown' : level.boss ? 'tower' : 'arrow'));
    const name = el('span', 'learn-name', t(level.title));
    b.append(dot, name);
    if (isDone(level.id)) b.append(starRow(stars(level.id)));
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
        const o = new Option(open ? t(x.name) : `${t(x.name)} · ${L('locked')}`, x.id);
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
    requestAnimationFrame(() => path.querySelector('.is-next')?.scrollIntoView({ block: 'center' }));
}

/* ── the player ── */
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/**
 * A question: options in a new order each time. While tries remain a wrong pick is greyed out (onMiss);
 * the end calls onDone(score): 1 right at once, .5 right on a second try, 0 missed.
 */
export function questionBox(q, { tries = 1, onMiss, onDone }) {
    const box = el('div', 'quiz');
    const options = el('div', 'quiz-options');
    const why = el('p', 'quiz-why');
    why.hidden = true;
    let missed = 0;
    for (const [text, right] of shuffle(q.options.map((o, i) => [t(o), i === q.answer]))) {
        const b = el('button', 'quiz-option');
        b.type = 'button';
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

/** The level's name across the Academy's screen, on violet. The same from the map and from Home. */
function splash(level) {
    const box = el('div', 'learn-splash');
    box.append(el('p', 'learn-splash-kind', level.boss ? L('Boss') : L('Level {0}', levelNumber(level))), el('h1', null, t(level.title)));
    const end = () => { box.classList.add('is-out'); setTimeout(() => box.remove(), 400); };
    box.addEventListener('click', end);
    setTimeout(end, 2300);
    // Only the Academy's own screen turns violet: the sidebar and the rest stay as they are.
    document.querySelector('main.container').append(box);
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
    const button = (label, action, cls = 'btn') => {
        const b = el('button', cls, label);
        b.type = 'button';
        b.addEventListener('click', action);
        actions.append(b);
    };
    if (won && after) button(L('Next level'), () => play(after), 'btn btn-primary');
    else if (!won) button(L('Try again'), () => play(level), 'btn btn-primary');
    button(t(world.back), () => renderMap(world), won && after ? 'btn btn-quiet' : 'btn btn-primary');
    const box = el('div', 'learn-result');
    box.append(el('h1', null, won ? (level.boss ? L('Boss beaten!') : L('Level done!')) : L('No hearts left')), who, won ? starRow(hearts) : lit('heart', 0), bubble, actions);
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
    let at = 0, hearts = best, busy = false;
    const nemeris = teacher();
    const close = el('button', 'icon-btn');
    close.type = 'button';
    close.setAttribute('aria-label', L('Back to the map'));
    close.append(icon('close'));
    close.addEventListener('click', () => renderMap(world));
    const track = el('div', 'pbar-track');
    const fill = el('div', 'pbar-fill');
    track.append(fill);
    const lives = el('span', 'learn-hearts');
    const top = el('div', 'learn-top');
    top.append(close, track, lives);
    const phase = el('p', 'learn-phase');
    const stage = el('div', 'learn-stage');
    stage.addEventListener('click', () => stage.classList.add('skip'));
    const back = el('button', 'icon-btn learn-back');
    back.type = 'button';
    back.setAttribute('aria-label', L('Previous step'));
    back.append(icon('chevron-left'));
    const next = el('button', 'btn btn-primary learn-next');
    next.type = 'button';
    const nav = el('div', 'learn-nav');
    nav.append(back, next);
    const player = el('div', 'learn-play');
    player.append(top, phase, stage, nav);
    card.dataset.view = 'play';
    card.replaceChildren(player);
    splash(level);

    const drawHearts = () => lives.replaceChildren(...lit('heart', hearts).children);
    const move = text => { next.hidden = false; next.textContent = text; };

    function draw() {
        const s = steps[at];
        fill.style.transform = `scaleX(${at / steps.length})`;
        const [name, rule] = PHASE[s.phase];
        phase.replaceChildren(el('strong', null, name), ` · ${rule}`);
        phase.dataset.phase = s.phase;
        // Going back is for what carries no risk: a graded question cannot be answered twice.
        back.hidden = !(at > 0 && !graded(steps[at - 1]));
        stage.classList.remove('skip');
        if (s.say) {
            const row = talk(t(s.say), nemeris);
            stage.replaceChildren(row, ...afterWords(row, [...(s.photo ? [photoFigure(s.photo, 'learn-photo')] : []), ...(s.example ? [para('explain-example', t(s.example))] : [])]));
            return move(L('Continue'));
        }
        next.hidden = true;
        const tries = s.phase === 'learn' ? Infinity : s.phase === 'practice' ? 2 : 1;
        const row = talk(t(s.ask), nemeris);
        stage.replaceChildren(row, ...afterWords(row, [questionBox(s, {
            tries,
            onMiss: () => react(nemeris, 'oops'),
            onDone: score => {
                react(nemeris, score ? 'happy' : 'oops');
                if (s.phase !== 'learn') record(s.id, score);
                if (!score && s.phase !== 'learn') { hearts--; drawHearts(); }
                move(L('Continue'));
            },
        })]));
    }

    /** Slides out to one side, the next step slides in from the other. dir: 1 forward, -1 back. */
    async function go(to, dir) {
        if (busy) return;
        busy = true;
        const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const out = stage.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 80}px)` }], { duration: calm ? 0 : 170, easing: 'ease-in', fill: 'forwards' });
        await out.finished.catch(() => {});
        if (to >= steps.length || !hearts) {
            out.cancel();
            busy = false;
            if (hearts) finish(level.id, hearts);
            return result(level, { won: hearts > 0, hearts, best });
        }
        at = to;
        draw();
        out.cancel();
        stage.animate([{ opacity: 0, transform: `translateX(${dir * 110}px) scale(.96)` }, { opacity: 1, transform: 'none' }], { duration: calm ? 0 : 520, easing: 'cubic-bezier(.2,.9,.3,1.12)' });
        busy = false;
    }

    next.addEventListener('click', () => go(at + 1, 1));
    back.addEventListener('click', () => go(at - 1, -1));
    drawHearts();
    draw();
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
