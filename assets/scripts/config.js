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
    maxWaitMs: 8000,
    settleMs: 120,
    videoMaxWaitMs: 3000,
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
export const HERO_VIDEO = {
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
