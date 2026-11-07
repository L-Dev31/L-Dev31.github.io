import { reducedMotion, lowPower, isMobile, clamp01 } from './env.js';
import { entrance, introLoaded } from './intro.js';
import { loadProjects, projectMark, SIGNATURE_URL } from './projects.js';
import { INTRO, SIGNATURE } from './config.js';
import { extrudedSvg, CELL } from './pixel.js';
import { pixelWrite } from './effects.js';

const cssVariable = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const smoothstep = t => t * t * (3 - 2 * t);
const pad2 = number => String(number).padStart(2, '0');

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
}

function titleFontSize(title) {
    const MAX_VW = 13;
    const VW_BUDGET = 88;
    const AVERAGE_LETTER_WIDTH = 0.46;
    return `${Math.min(MAX_VW, VW_BUDGET / (title.length * AVERAGE_LETTER_WIDTH)).toFixed(2)}vw`;
}

export function showcase(container, projects, lenis) {
    if (!container || !projects.length) return null;
    const changeListeners = new Set();
    container.style.setProperty('--count', projects.length);
    container.setAttribute('aria-hidden', 'true');

    const stage = createElement('div', 'showcase-stage');
    const counter = createElement('p', 'showcase-count');
    const title = createElement('p', 'showcase-title');
    const titleLink = createElement('a', 'showcase-link');
    titleLink.dataset.cursor = 'View';
    titleLink.tabIndex = -1;
    titleLink.append(title);

    const tags = createElement('ul', 'index-tags showcase-tags');
    const leftSide = createElement('div', 'showcase-side showcase-left');
    leftSide.append(tags);

    const role = createElement('p', 'index-role');
    const subtitle = createElement('p', 'index-text');
    const caseStudyLink = createElement('a', 'index-go showcase-go', 'Read the case study ');
    caseStudyLink.append(createElement('span', '', '↗'));
    caseStudyLink.tabIndex = -1;
    const rightSide = createElement('div', 'showcase-side showcase-right');
    rightSide.append(role, subtitle, caseStudyLink);

    const stepButtons = createElement('div', 'showcase-steps');
    const markAnchor = createElement('div', 'showcase-anchor');
    stage.append(counter, titleLink, leftSide, rightSide, stepButtons, markAnchor);
    container.replaceChildren(stage);

    const scrollTravel = () => Math.max(1, container.offsetHeight - innerHeight);

    function scrollToProject(index) {
        const top = container.getBoundingClientRect().top + scrollY;
        const target = top + ((index + 0.5) / projects.length) * scrollTravel();
        if (lenis) lenis.scrollTo(target, { duration: 1.1 });
        else scrollTo({ top: target, behavior: reducedMotion ? 'auto' : 'smooth' });
    }

    projects.forEach((project, index) => {
        const button = createElement('button', 'showcase-step');
        button.type = 'button';
        button.tabIndex = -1;
        button.dataset.cursor = pad2(index + 1);
        button.addEventListener('click', () => scrollToProject(index));
        stepButtons.append(button);
    });

    const stillMark = isMobile || reducedMotion ? createElement('img', 'showcase-mark') : null;
    if (stillMark) {
        stillMark.alt = '';
        markAnchor.append(stillMark);
    }

    let currentIndex = -1;

    function showProject(index) {
        const isFirst = currentIndex === -1;
        currentIndex = index;
        const project = projects[index];

        counter.textContent = `${pad2(index + 1)} / ${pad2(projects.length)}`;
        titleLink.href = caseStudyLink.href = `project.html?id=${project.id}`;
        title.style.setProperty('--fit', titleFontSize(project.title));
        if (isFirst) title.textContent = project.title;
        else pixelWrite(title, project.title);

        const firstTags = (project.tags || []).slice(0, 3);
        tags.replaceChildren(...[project.category, ...firstTags].map(tag => createElement('li', 'index-tag', tag)));
        role.textContent = `Role: ${project.role}`;
        subtitle.textContent = project.subtitle;
        if (stillMark) stillMark.src = projectMark(project);

        stage.classList.remove('is-changing');
        void stage.offsetWidth;
        stage.classList.add('is-changing');
        [...stepButtons.children].forEach((button, i) => button.classList.toggle('is-current', i === index));
        changeListeners.forEach(listener => listener(project));
    }

    let updateQueued = false;
    function updateFromScroll() {
        updateQueued = false;
        const progress = clamp01(-container.getBoundingClientRect().top / scrollTravel());
        const index = Math.min(projects.length - 1, Math.floor(progress * projects.length));
        if (index !== currentIndex) showProject(index);
    }
    addEventListener('scroll', () => {
        if (updateQueued) return;
        updateQueued = true;
        requestAnimationFrame(updateFromScroll);
    }, { passive: true });
    addEventListener('resize', updateFromScroll, { passive: true });
    updateFromScroll();

    return {
        anchor: markAnchor,
        current: () => projects[Math.max(0, currentIndex)],
        onChange: listener => changeListeners.add(listener),
    };
}

function parseColor(color) {
    if (color.startsWith('#')) return [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
    return color.match(/[\d.]+/g).slice(0, 3).map(Number);
}

function blendColors(from, to, amount) {
    const start = parseColor(from), end = parseColor(to);
    const channels = start.map((value, i) => Math.round(value + (end[i] - value) * amount));
    return `rgb(${channels.join(',')})`;
}

function blendBoxes(from, to, amount) {
    const lerp = (a, b) => a + (b - a) * amount;
    return {
        x: lerp(from.x, to.x),
        y: lerp(from.y, to.y),
        size: lerp(from.size, to.size),
        aspect: lerp(from.aspect ?? 1, to.aspect ?? 1),
    };
}

function dockScrollRange(dock) {
    const box = dock.element.getBoundingClientRect();
    const halfScreen = innerHeight * 0.5;
    return [box.top + scrollY - halfScreen, Math.max(0, box.bottom + scrollY - halfScreen)];
}

function openFlights(ranges) {
    const minFlight = innerHeight * SIGNATURE.flightMinScreens;
    for (let i = 0; i < ranges.length - 1; i++) {
        const gap = ranges[i + 1][0] - ranges[i][1];
        if (gap >= minFlight) continue;
        const middle = (ranges[i][1] + ranges[i + 1][0]) / 2;
        ranges[i][1] = middle - minFlight / 2;
        ranges[i + 1][0] = middle + minFlight / 2;
    }
}

function locateOnPath(ranges, scroll) {
    const last = ranges.length - 1;
    for (let i = 0; i <= last; i++) {
        if (scroll <= ranges[i][1]) return { from: i, progress: 0 };
        if (i < last && scroll < ranges[i + 1][0]) {
            return { from: i, progress: (scroll - ranges[i][1]) / (ranges[i + 1][0] - ranges[i][1]) };
        }
    }
    return { from: last, progress: 0 };
}

export function thread(firstDocks) {
    if (isMobile || reducedMotion || !firstDocks.length) return null;

    let docks = firstDocks;

    const canvas = createElement('canvas', 'thread is-intro');
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    const solid = extrudedSvg(canvas, cssVariable('--accent'), { morph: true });

    const drawnLogo = document.querySelector('.brand a');
    if (drawnLogo) drawnLogo.style.opacity = '0';

    let shownShape = null, shownColor = '';
    let shownCols = 0, shownRows = 0;
    let lastScroll = scrollY;
    let introBox = null;
    let introMarks = [];
    let pageLoaded = false;
    loadProjects().then(projects => { introMarks = projects.map(projectMark); }, () => {});
    introLoaded.then(() => { pageLoaded = true; });

    function readIntroBox() {
        const sign = document.querySelector('.page-loader-sign')?.getBoundingClientRect();
        if (sign?.width && entrance() <= 0) {
            introBox = { x: sign.left + sign.width / 2, y: sign.top + sign.height / 2, size: sign.width };
        }
        return introBox ?? { x: innerWidth / 2, y: innerHeight / 2, size: 320 };
    }

    function shapeFor(dock, secondsSinceEntrance) {
        const duringIntro = secondsSinceEntrance <= 0 && !pageLoaded && introMarks.length;
        if (!duringIntro) return dock.shape();
        return introMarks[Math.floor(performance.now() / INTRO.projectMarkEveryMs) % introMarks.length];
    }

    function frame() {
        requestAnimationFrame(frame);
        const scroll = scrollY;
        const ranges = docks.map(dockScrollRange);
        openFlights(ranges);
        const { from, progress } = locateOnPath(ranges, scroll);
        const fromDock = docks[from];
        const toDock = progress > 0 ? docks[from + 1] : fromDock;
        const eased = smoothstep(clamp01(progress));

        let box = blendBoxes(fromDock.box(), toDock.box(), eased);
        let color = blendColors(fromDock.color(), toDock.color(), eased);

        const seconds = entrance();
        const intro = SIGNATURE.introFlight;
        if (seconds < intro.endsAtSeconds) {
            const settled = seconds <= 0 ? 0 : smoothstep(clamp01((seconds - intro.startsAtSeconds) / intro.lastsSeconds));
            box = blendBoxes(readIntroBox(), box, settled);
            color = blendColors(cssVariable('--accent'), color, settled);
        } else if (canvas.classList.contains('is-intro')) {
            canvas.classList.remove('is-intro');
        }

        const maxCols = lowPower ? SIGNATURE.maxColsLowPower : SIGNATURE.maxCols;
        const cols = Math.max(SIGNATURE.minCols, Math.min(maxCols, Math.round(box.size / CELL / 4) * 4));
        const rows = Math.max(SIGNATURE.minCols, Math.round(cols * (box.aspect ?? 1)));
        canvas.style.width = `${cols * CELL}px`;
        canvas.style.height = `${rows * CELL}px`;
        canvas.style.transform = `translate(${(box.x - (cols * CELL) / 2).toFixed(1)}px, ${(box.y - (rows * CELL) / 2).toFixed(1)}px)`;

        if (color !== shownColor) solid.recolor((shownColor = color));

        const isResting = progress === 0 && !!fromDock.rest && seconds >= intro.endsAtSeconds;
        canvas.classList.toggle('at-rest', isResting);

        const targetDock = progress > 0.5 ? toDock : fromDock;
        const shape = shapeFor(targetDock, seconds);
        if (shape !== shownShape || cols !== shownCols || rows !== shownRows) {
            shownShape = shape;
            shownCols = cols;
            shownRows = rows;
            solid.show([shape, SIGNATURE_URL], cols, rows);
        }

        solid.nudge((scroll - lastScroll) * SIGNATURE.scrollTurnPerPx);
        lastScroll = scroll;
    }
    requestAnimationFrame(frame);

    return {
        setDocks(list) {
            if (!list.length) return;
            docks = list;
        },
    };
}

function navbarLogoBox() {
    const box = document.querySelector('.brand img').getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, size: box.width };
}

const navbarLogoColor = () => getComputedStyle(document.querySelector('.brand a')).color;

const restingInNavbar = element => ({
    element,
    rest: true,
    color: navbarLogoColor,
    shape: () => SIGNATURE_URL,
    box: navbarLogoBox,
});

export function restDocks() {
    return [restingInNavbar(document.body)];
}

export function homeDocks(stage) {
    const docks = [];
    const hero = document.querySelector('.hero-spacer');
    if (hero) docks.push(restingInNavbar(hero));

    if (stage) {
        docks.push({
            element: stage.anchor.closest('.showcase'),
            color: () => cssVariable('--black'),
            shape: () => projectMark(stage.current()),
            box: () => {
                const box = stage.anchor.getBoundingClientRect();
                return { x: box.left + box.width / 2, y: box.top + box.height / 2, size: box.width };
            },
        });
    }

    const promise = document.querySelector('#promise');
    if (promise) docks.push(restingInNavbar(promise));
    return docks;
}
