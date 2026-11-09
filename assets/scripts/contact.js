import { clamp01, throttled, reducedMotion, lowPower, COMPACT } from './config.js';

const ease = x => x * x * (3 - 2 * x);
const range = (value, from, to) => clamp01((value - from) / (to - from));

// How the contact section opens. "Let's talk." sits alone on a dark screen. As the page scrolls the
// two words part, like the travel flags, and a window opens between them. The window shows a pixel
// picture, then grows until it is the whole screen and the white section takes over. The picture is
// drawn again with more cells as the window grows, so a cell keeps the size it has everywhere else.
const TIMELINE = {
    // Share of the pinned scroll for each step.
    open: [0, 0.3],
    grow: [0.3, 0.74],
    wipe: [0.62, 0.86],
    // The words grow while the window opens, then again while it expands.
    growOpen: 0.2,
    growExpand: 0.55,
    // Gap kept between a word and the window, in font sizes.
    gap: 0.12,
    // Share of the wipe after which the screen counts as light.
    lightAfter: 0.92,
};

let landing = null;

// Where the page should land to show the finished section, for links to #contact.
export const contactLanding = () => landing?.() ?? null;

export function contactScene() {
    const intro = document.querySelector('.contact-intro');
    const stage = intro?.querySelector('.contact-stage');
    if (!stage) return;

    if (lowPower || reducedMotion) {
        intro.classList.add('is-static');
        stage.dataset.tone = 'light';
        return;
    }

    const heading = stage.querySelector('.contact-heading');
    const halves = [...heading.querySelectorAll('.contact-half')];
    const view = stage.querySelector('.contact-window');
    const picture = stage.querySelector('.contact-picture');
    const compact = matchMedia(COMPACT);
    let size = { W: 0, H: 0, bw: 1, bh: 1, dwell: 1, font: 16, shift: 0, vertical: false };
    let lastState = '';

    // The size of the window when it opens is set in the stylesheet, as a share of the screen.
    const opening = name => parseFloat(getComputedStyle(stage).getPropertyValue(name)) || 0.5;

    const measure = () => {
        const vertical = compact.matches;
        stage.dataset.axis = vertical ? 'y' : 'x';
        size = {
            vertical,
            W: stage.clientWidth,
            H: stage.clientHeight,
            bw: stage.clientWidth * opening('--face-width') || 1,
            bh: stage.clientHeight * opening('--face-height') || 1,
            dwell: Math.max(1, intro.offsetHeight - stage.offsetHeight),
            font: parseFloat(getComputedStyle(heading).fontSize) || 16,
            // The two words are not the same width: the join starts off centre so the title reads as centred.
            shift: vertical ? 0 : (halves[0].offsetWidth - halves[1].offsetWidth) / 2,
        };
    };

    const set = (name, value) => stage.style.setProperty(name, value);

    const update = () => {
        const { vertical, W, H, bw, bh, dwell, font, shift } = size;
        const top = intro.getBoundingClientRect().top;
        // Out of sight the scene does not change, so it is only updated once when it leaves.
        const state = top > innerHeight ? 'before' : top < -intro.offsetHeight ? 'after' : 'active';
        if (state !== 'active' && state === lastState) return;
        lastState = state;
        const approach = clamp01(1 - top / innerHeight);
        const pinned = clamp01(-top / dwell);
        const open = ease(range(pinned, ...TIMELINE.open));
        const grow = ease(range(pinned, ...TIMELINE.grow));
        const wipe = ease(range(pinned, ...TIMELINE.wipe));

        const w = bw * open + (W - bw) * grow;
        const h = bh * open + (H - bh) * grow;
        const scale = 1 + TIMELINE.growOpen * open + TIMELINE.growExpand * grow;

        set('--appear', ease(range(approach, 0.55, 1)).toFixed(3));
        set('--half', ((1 - 0.15 * open) * (1 - grow)).toFixed(3));
        set('--g', scale.toFixed(3));
        const pad = font * TIMELINE.gap;
        set('--off', `${((vertical ? h : w) / 2 + pad).toFixed(1)}px`);
        set('--join', `${(shift * (1 - open)).toFixed(1)}px`);
        set('--w', `${w.toFixed(1)}px`);
        set('--h', `${h.toFixed(1)}px`);
        set('--wipe', wipe.toFixed(3));
        view.style.clipPath = `inset(${((H - h) / 2).toFixed(1)}px ${((W - w) / 2).toFixed(1)}px)`;
        stage.dataset.tone = wipe > TIMELINE.lightAfter ? 'light' : 'dark';
    };

    const refresh = () => { measure(); update(); };

    import('./effects.js').then(({ pixelPicture }) => {
        const black = getComputedStyle(document.documentElement).getPropertyValue('--black').trim();
        pixelPicture(picture, picture.dataset.picture, { color: black, center: Number(picture.dataset.center ?? 0.5), anchor: 0.5, watch: true, active: () => lastState === 'active' });
    });

    landing = () => intro.getBoundingClientRect().top + scrollY + size.dwell;

    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', refresh, { passive: true });
    compact.addEventListener('change', refresh);
    document.fonts?.ready.then(refresh);
    new ResizeObserver(throttled(refresh)).observe(intro);
    refresh();
}
