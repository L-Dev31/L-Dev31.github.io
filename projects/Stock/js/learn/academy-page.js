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

function talk(text, who = teacher()) {
    const row = el('div', 'learn-talk');
    const bubble = el('p', 'learn-bubble');
    bubble.append(richText(text));
    row.append(who, bubble);
    return row;
}

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

const percent = n => (n / 100).toLocaleString(LOCALE, { style: 'percent' });
const levelNumber = level => worldOf(level.id).levels.filter(l => !l.boss).indexOf(level) + 1;

/* ── the map ── */
function gradesPanel() {
    const box = el('section', 'panel learn-grades');
    box.append(el('h2', 'panel-title', L('What you know')));
    for (const g of grades()) {
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
    dot.append(icon(!open ? 'lock' : level.boss === 'final' ? 'trophy' : level.boss ? 'swords' : isDone(level.id) ? 'check' : 'play'));
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
    document.documentElement.style.setProperty('--world', world.color);
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
    card.replaceChildren(head, talk(say), path, gradesPanel());
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

function video(id) {
    const b = el('button', 'learn-video');
    b.type = 'button';
    b.setAttribute('aria-label', L('Watch the short video'));
    const img = el('img');
    img.alt = '';
    img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    b.append(img, icon('play'));
    b.addEventListener('click', () => {
        const frame = el('iframe', 'learn-video');
        frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
        frame.title = L('Video');
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        b.replaceWith(frame);
    });
    return b;
}

function play(level) {
    if (!isOpen(level.id)) return;
    world = worldOf(level.id);
    document.documentElement.style.setProperty('--world', world.color);
    const steps = stepsOf(level);
    // A run must be losable: with only two graded questions, one miss ends it.
    const graded = steps.filter(s => s.ask && s.phase !== 'learn').length;
    let at = -1, hearts = Math.max(1, Math.min(HEARTS, graded - 1));
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
    const next = el('button', 'btn btn-primary learn-next');
    next.type = 'button';
    const player = el('div', 'learn-play');
    player.append(top, phase, stage, next);
    card.replaceChildren(player);

    const drawHearts = () => lives.replaceChildren(...lit('heart', hearts).children);
    const title = text => {
        phase.replaceChildren(el('strong', null, text));
        delete phase.dataset.phase;
    };
    const show = (text, ...content) => {
        stage.replaceChildren(talk(text, nemeris), ...content);
        stage.scrollIntoView?.({ block: 'nearest' });
    };
    const button = (label, action) => {
        next.hidden = false;
        next.textContent = label;
        next.onclick = action;
    };

    function step() {
        at++;
        fill.style.transform = `scaleX(${at / steps.length})`;
        if (at >= steps.length) return win();
        const s = steps[at];
        const [name, rule] = PHASE[s.phase];
        phase.replaceChildren(el('strong', null, name), ` · ${rule}`);
        phase.dataset.phase = s.phase;
        if (s.say) {
            show(t(s.say), ...(s.photo ? [photoFigure(s.photo, 'learn-photo')] : []), ...(s.example ? [para('explain-example', t(s.example))] : []));
            return button(L('Continue'), step);
        }
        next.hidden = true;
        const tries = s.phase === 'learn' ? Infinity : s.phase === 'practice' ? 2 : 1;
        show(t(s.ask), questionBox(s, {
            tries,
            onMiss: () => react(nemeris, 'oops'),
            onDone: score => {
                react(nemeris, score ? 'happy' : 'oops');
                if (s.phase !== 'learn') record(s.id, score);
                if (!score && s.phase !== 'learn') { hearts--; drawHearts(); }
                if (hearts) button(L('Continue'), step);
                else button(L('See what happens'), lose);
            },
        }));
    }

    function win() {
        finish(level.id, hearts);
        react(nemeris, 'happy');
        title(level.boss ? L('Boss beaten!') : L('Level done!'));
        const after = levelAfter(level.id);
        show(level.boss ? L('You beat {0}! Everything before it is now solid.', t(level.title)) : L('To remember: {0}', t(level.idea)), starRow(hearts));
        button(after ? L('Next level') : L('Back to the map'), () => (after ? play(after) : renderMap(world)));
    }

    function lose() {
        react(nemeris, 'oops');
        title(L('No hearts left'));
        show(level.boss
            ? L('{0} wins this time. What you learned is still yours: the test starts again from the beginning.', t(level.title))
            : L('That happens to everyone. Try the level again: it will feel easier the second time.'));
        button(L('Try again'), () => play(level));
    }

    drawHearts();
    title(level.boss ? L('Boss: {0}', t(level.title)) : L('Level {0}', levelNumber(level)));
    const film = t(level.video) || (level === world.levels[0] ? t(world.video) : '');
    const rules = el('ul', 'learn-rules');
    for (const k of level.boss ? ['boss'] : ['learn', 'practice', 'apply']) rules.append(el('li', null, `${PHASE[k][0]} · ${PHASE[k][1]}`));
    show(level.boss ? t(level.intro) : t(level.title), ...(film ? [video(film)] : []), rules);
    button(L('Start'), step);
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
