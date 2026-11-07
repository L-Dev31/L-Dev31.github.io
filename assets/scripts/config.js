export const PIXEL = {
    screenWidthPerCell: 180,
    minCellPx: 3,
    maxDevicePixelRatio: 2,
    brightnessLevels: [20, 60, 130],
    gapShare: 0.25,
    shimmerAmount: 0.22,
    shimmerBeatMs: 240,
    dissolveDurationMs: 900,
};

export const INTRO = {
    maxWaitMs: 8000,
    settleMs: 120,
    videoMaxWaitMs: 3000,
    projectMarkEveryMs: 550,
    holdAfterLoadedMs: 750,
    fadeOutBeforeEntranceMs: 280,
    entranceClassMs: 2400,
    signature: {
        screenShare: 0.42,
        minCols: 16,
        maxCols: 40,
    },
};

export const SIGNATURE = {
    spinRadiansPerSecond: 0.9,
    tilt: 0.22,
    depth: 0.12,
    morphSeconds: 0.45,
    scrollTurnPerPx: 0.003,
    faceViewerEase: 5,
    minCols: 4,
    maxCols: 400,
    maxColsLowPower: 96,
    flightMinScreens: 0.6,
    lateFlightScreens: 0.4,
    introFlight: { endsAtSeconds: 1.6, startsAtSeconds: 0.25, lastsSeconds: 1.3 },
    footerNameRowsPerCol: 0.34,
};

export const CURSOR = {
    dotSizePx: 14,
    overLinkSizePx: 36,
    overWordSizePx: 76,
    pressedSizePx: 10,
    followEase: 0.2,
};

export const MAGNET = {
    pull: 0.3,
    maxPx: 10,
    ease: 0.2,
    selector: '.hero-socials a, .button, .hamburger, .brand a, .index-go, .culture-nav a, .showcase-step',
};

export const PAGE_TRANSITION = {
    coverMs: 620,
    giveUpMs: 4000,
};

export const TEXT_ENTRANCE = {
    lettersPerSecond: 55,
    secondsBetweenBlocks: 0.2,
    firstBlockDelaySeconds: 0.15,
    scrubSpreadLetters: 10,
    scrubSpreadLettersInProjects: 12,
};

export const PICTURE = {
    defaultGain: 1.3,
    aboutHeroGain: 3.2,
    refreshMs: 120,
    refreshMsLowPower: 400,
    appearSeconds: 1.2,
};

export const HERO_VIDEO = {
    refreshMs: 33,
    refreshMsLowPower: 80,
};

export const TEXT_PIXELS = {
    showDotsFromCoverage: 0.15,
    showCheckerFromCoverage: 0.25,
    showSolidFromCoverage: 0.4,
};

export const FLAGS = {
    waveAmount: 0.07,
    shades: 12,
};
