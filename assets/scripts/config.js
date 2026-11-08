// Pixel rendering and animation settings.
export const PIXEL = {
    // Cells across screen width; lower means bigger pixels.
    cellsAcrossScreen: 230,
    // Minimum cell size in px.
    minCellPx: 5,
    maxDevicePixelRatio: 2,
    // Brightness thresholds: dots, checker, solid.
    brightnessLevels: [20, 60, 130],
    // Cell gap as a fraction of cell size.
    gapShare: 0.25,
    // Flicker amount and interval.
    shimmerAmount: 0.22,
    shimmerBeatMs: 240,
    // Dissolve duration.
    dissolveDurationMs: 900,
};

// Loading intro.
export const INTRO = {
    // Maximum wait time.
    maxWaitMs: 5000,
    settleMs: 120,
    // Project mark interval.
    projectMarkEveryMs: 550,
    // Final pause.
    holdAfterLoadedMs: 750,
    fadeOutBeforeEntranceMs: 280,
    entranceClassMs: 2400,
    signature: {
        // Share of the shortest screen side.
        screenShare: 0.42,
        minCols: 16,
        maxCols: 40,
    },
};

// Pixel signature.
export const SIGNATURE = {
    // Spin speed and tilt.
    spinRadiansPerSecond: 0.9,
    tilt: 0.22,
    // Extrusion depth.
    depth: 0.12,
    // Shape morph duration.
    morphSeconds: 0.45,
    // Rotation per scroll pixel.
    scrollTurnPerPx: 0.003,
    // Resolution limits in cells.
    minCols: 4,
    maxCols: 400,
    maxColsLowPower: 96,
    // Flight lengths in screen heights.
    flightMinScreens: 0.6,
    // Intro-to-navbar flight timing, in seconds.
    introFlight: { endsAtSeconds: 1.6, startsAtSeconds: 0.25, lastsSeconds: 1.3 },
};

// Custom cursor.
export const CURSOR = {
    dotSizePx: 14,
    overLinkSizePx: 36,
    overWordSizePx: 76,
    pressedSizePx: 10,
    // Cursor lag; 1 means none.
    followEase: 0.2,
};

// Cursor-following elements.
export const MAGNET = {
    // Pull strength and pixel limit.
    pull: 0.3,
    maxPx: 10,
    ease: 0.2,
    // Magnetic element selector.
    selector: '.hero-socials a, .button, .hamburger, .brand a, .index-go, .section-nav a, .showcase-step',
};

// Page transition.
export const PAGE_TRANSITION = {
    coverMs: 620,
    giveUpMs: 4000,
};

// Text entrance.
export const TEXT_ENTRANCE = {
    lettersPerSecond: 55,
    secondsBetweenBlocks: 0.2,
    firstBlockDelaySeconds: 0.15,
    // Concurrent letters during scroll.
    scrubSpreadLetters: 10,
};

// Phones and portrait screens, where the layouts stack.
export const COMPACT = '(max-width: 900px), (max-aspect-ratio: 1/1)';

// Scroll parallax. 100 follows the page, below 100 trails it, above 100 runs ahead of it.
// Elements can also opt in with data-parallax-speed, and data-parallax-compact for phones and portrait screens.
export const PARALLAX = {
    // Selector, speed, speed on compact screens.
    auto: [
        ['.section-head .title', 91, 96],
        ['.section-head .section-note, .section-head .section-aside', 109, 104],
        ['.promise-picture', 90, 96],
    ],
    compactQuery: COMPACT,
    // How far from the screen center, in screen heights, an element is still moved.
    reachScreens: 1.6,
};

// Pixel images.
export const PICTURE = {
    // Contrast; higher lights more cells.
    defaultGain: 1.3,
    aboutHeroGain: 3.2,
    refreshMs: 120,
    refreshMsLowPower: 400,
    appearSeconds: 1.2,
};

// Home hero video.
// Home hero portrait: a sheet of video frames, moved by the scroll.
export const HERO_FRAMES = {
    url: 'assets/images/core/hero-frames.webp',
    width: 400,
    height: 226,
    columns: 7,
    // Frames used while the hero turns, and by the idle sway on devices with a mouse.
    turnFrames: 43,
    swayFrames: 15,
    refreshMs: 33,
    refreshMsLowPower: 80,
};

// Text cell coverage thresholds.
export const TEXT_PIXELS = {
    showDotsFromCoverage: 0.15,
    showCheckerFromCoverage: 0.25,
    showSolidFromCoverage: 0.4,
};

// Travel flags.
export const FLAGS = {
    waveAmount: 0.07,
    shades: 12,
};

const MOBILE_MAX_WIDTH = 768;
const TABLET_MAX_WIDTH = 1024;

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const lowPower = reducedMotion || navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2 || !!navigator.connection?.saveData;
export const clamp01 = value => Math.max(0, Math.min(1, value));

export const breakpoint = (() => {
    const mobileQuery = matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    const tabletQuery = matchMedia(`(max-width: ${TABLET_MAX_WIDTH}px)`);
    const subscribers = new Set();

    const fromWidth = () => (innerWidth <= MOBILE_MAX_WIDTH ? 'mobile' : innerWidth <= TABLET_MAX_WIDTH ? 'tablet' : 'desktop');
    let current = fromWidth();

    const recheck = () => {
        const next = fromWidth();
        if (next === current) return;
        current = next;
        subscribers.forEach(callback => callback(current));
    };
    mobileQuery.addEventListener('change', recheck);
    tabletQuery.addEventListener('change', recheck);
    addEventListener('resize', recheck, { passive: true });

    return {
        get current() { return current; },
        get isMobile() { return current === 'mobile'; },
        get isTablet() { return current === 'tablet'; },
        get isDesktop() { return current === 'desktop'; },
        onChange(callback) {
            subscribers.add(callback);
            return () => subscribers.delete(callback);
        },
        BREAKPOINT_MOBILE: MOBILE_MAX_WIDTH,
        BREAKPOINT_TABLET: TABLET_MAX_WIDTH,
    };
})();

export const isMobile = breakpoint.isMobile;

export function throttled(callback) {
    let queued = false;
    return () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            callback();
        });
    };
}
