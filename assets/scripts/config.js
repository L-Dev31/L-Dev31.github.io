// ---------------------------------------------------------------------------
// Every setting of the pixel renders and their animations lives here.
// Change a number, reload: nothing else needs touching.
// ---------------------------------------------------------------------------

// Shared by every pixel drawing on the site (hero, pictures, text, signature, flags, dissolves).
export const PIXEL = {
    // Cell size = screen width / this number. Lower = bigger pixels. 180 gives 8px on a 1440px screen.
    screenWidthPerCell: 180,
    // Cells are never smaller than this (phones).
    minCellPx: 3,
    maxDevicePixelRatio: 2,
    // Brightness (0-255) where a cell goes from empty to dots, to checker, to solid.
    brightnessLevels: [20, 60, 130],
    // Space between cells, as a share of the cell. 0 = no gap.
    gapShare: 0.25,
    // How much the cells flicker (0.22 = +-22%) and how often.
    shimmerAmount: 0.22,
    shimmerBeatMs: 240,
    // Length of the pixel dissolve (intro exit, page change).
    dissolveDurationMs: 900,
};

// The loading screen with the turning signature and the real progress bar.
export const INTRO = {
    // The intro never holds the page longer than this.
    maxWaitMs: 8000,
    settleMs: 120,
    videoMaxWaitMs: 3000,
    // The solid changes to the next project's mark this often while loading.
    projectMarkEveryMs: 550,
    // Pause on the final signature before the intro leaves.
    holdAfterLoadedMs: 750,
    fadeOutBeforeEntranceMs: 280,
    entranceClassMs: 2400,
    signature: {
        // Size of the intro signature: share of the shortest screen side.
        screenShare: 0.42,
        minCols: 16,
        maxCols: 40,
    },
};

// The pixel solid that follows the page: turning, flying, morphing.
export const SIGNATURE = {
    // Turning speed (radians per second) and how far it leans back.
    spinRadiansPerSecond: 0.9,
    tilt: 0.22,
    // Thickness of the extrusion.
    depth: 0.12,
    // Time for the cells to reassemble from one shape to the next.
    morphSeconds: 0.45,
    // How much scrolling also turns it.
    scrollTurnPerPx: 0.003,
    faceViewerEase: 5,
    // Resolution limits, in cells across.
    minCols: 4,
    maxCols: 400,
    maxColsLowPower: 96,
    // Shortest flight between two stops, in screens of scrolling.
    flightMinScreens: 0.6,
    lateFlightScreens: 0.4,
    // Intro to navbar flight: when it ends / starts / how long it lasts (seconds).
    introFlight: { endsAtSeconds: 1.6, startsAtSeconds: 0.25, lastsSeconds: 1.3 },
    // Height of the footer name's grid relative to its width.
    footerNameRowsPerCol: 0.34,
};

// The round dot that replaces the system cursor.
export const CURSOR = {
    dotSizePx: 14,
    overLinkSizePx: 36,
    overWordSizePx: 76,
    pressedSizePx: 10,
    // Lag behind the mouse: 1 = none, lower = more floaty.
    followEase: 0.2,
};

// Pills and buttons that lean toward the cursor.
export const MAGNET = {
    // Share of the distance to the cursor, and the cap in px.
    pull: 0.3,
    maxPx: 10,
    ease: 0.2,
    // Add a selector here to make another element magnetic.
    selector: '.hero-socials a, .button, .hamburger, .brand a, .index-go, .culture-nav a, .showcase-step',
};

// Pixel curtain between two pages.
export const PAGE_TRANSITION = {
    coverMs: 620,
    giveUpMs: 4000,
};

// Titles and text that write themselves in letter by letter.
export const TEXT_ENTRANCE = {
    lettersPerSecond: 55,
    secondsBetweenBlocks: 0.2,
    firstBlockDelaySeconds: 0.15,
    // How many letters are mid-transition at once when scrolling.
    scrubSpreadLetters: 10,
    scrubSpreadLettersInProjects: 12,
};

// Pixel pictures (hero of About / Culture, portrait, menu).
export const PICTURE = {
    // Contrast: higher = more cells lit. About hero uses the strong one.
    defaultGain: 1.3,
    aboutHeroGain: 3.2,
    refreshMs: 120,
    refreshMsLowPower: 400,
    appearSeconds: 1.2,
};

// The pixel video of the home hero.
export const HERO_VIDEO = {
    refreshMs: 33,
    refreshMsLowPower: 80,
};

// Pixel letters: how much of a cell a letter must cover for it to light.
export const TEXT_PIXELS = {
    showDotsFromCoverage: 0.15,
    showCheckerFromCoverage: 0.25,
    showSolidFromCoverage: 0.4,
};

// Flags of the Travels section.
export const FLAGS = {
    waveAmount: 0.07,
    shades: 12,
};
