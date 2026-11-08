import { reducedMotion, isMobile, throttled } from './config.js';
import { INTRO } from './config.js';
import { loadProjects, projectMark, SIGNATURE_URL } from './projects.js';

const loading = { total: 0, done: 0, open: true, lastFile: '', onChange: () => {} };
const nativeFetch = window.fetch.bind(window);

function displayName(url) {
    try {
        const { pathname, hostname } = new URL(url, location.href);
        const inAssets = /assets\/(.+)$/.exec(pathname);
        if (inAssets) return inAssets[1];
        const file = pathname.split('/').pop() || 'index.html';
        return hostname === location.hostname ? file : `${hostname} ${file}`;
    } catch {
        return String(url);
    }
}

export function track(url, promise) {
    if (!loading.open) return promise;
    loading.total++;
    const markDone = () => {
        loading.done++;
        if (url) loading.lastFile = displayName(url);
        loading.onChange();
    };
    Promise.resolve(promise).then(markDone, markDone);
    loading.onChange();
    return promise;
}

window.fetch = (input, init) => {
    const response = nativeFetch(input, init);
    if (loading.open) {
        const url = typeof input === 'string' ? input : input.url;
        track(url, response.then(finished => finished.clone().arrayBuffer()));
    }
    return response;
};

let resolveIntroLoaded = () => {};
export const introLoaded = new Promise(resolve => { resolveIntroLoaded = resolve; });

let entranceStartedAt = Infinity;
let startEntrance = () => {};
export const heroEntrance = new Promise(resolve => {
    startEntrance = () => {
        entranceStartedAt = performance.now();
        resolve();
    };
});

export function entrance() {
    if (reducedMotion) return 1e6;
    if (entranceStartedAt === Infinity) return 0;
    return (performance.now() - entranceStartedAt) / 1000;
}

function fontFileUrls() {
    const urls = new Map();
    for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of rules) {
            if (!(rule instanceof CSSFontFaceRule)) continue;
            const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
            const style = rule.style.getPropertyValue('font-style') || 'normal';
            const file = /url\(["']?([^"')]+)/.exec(rule.style.getPropertyValue('src'))?.[1];
            if (file) urls.set(`${family}|${style}`, new URL(file, sheet.href || location.href).href);
        }
    }
    return urls;
}

const eventually = (target, events) => new Promise(resolve => {
    events.forEach(name => target.addEventListener(name, resolve, { once: true }));
});

function dissolveLoader(loader, whenDone) {
    if (reducedMotion) {
        loader.classList.add('done');
        whenDone();
        return;
    }
    import('./pixel.js').then(({ dissolve }) => {
        const color = getComputedStyle(loader).backgroundColor;
        loader.classList.add('dissolving');
        dissolve(loader, { color, fixed: true }, () => {
            loader.classList.add('done');
            whenDone();
        });
    });
}

function trackExistingResources(trackFont) {
    track(location.href, Promise.resolve());

    for (const element of document.querySelectorAll('link[rel="stylesheet"][href], script[src]')) {
        track(element.href || element.src, Promise.resolve());
    }
    for (const image of document.images) {
        if (!image.getAttribute('src') || image.loading === 'lazy') continue;
        track(image.src, image.complete ? Promise.resolve() : eventually(image, ['load', 'error']));
    }
    for (const video of document.querySelectorAll('video[preload="auto"]')) {
        const ready = video.readyState >= 2
            ? Promise.resolve()
            : Promise.race([eventually(video, ['loadeddata', 'error']), new Promise(resolve => setTimeout(resolve, INTRO.videoMaxWaitMs))]);
        track(video.currentSrc || video.src, ready);
    }

    document.fonts.forEach(trackFont);
    document.fonts.addEventListener('loading', event => event.fontfaces.forEach(trackFont));
}

function drawIntroSignature(loader, canvas, onReady) {
    import('./pixel.js').then(({ extrudedSvg, CELL }) => {
        const { screenShare, minCols, maxCols } = INTRO.signature;
        const shortSide = Math.min(innerWidth, innerHeight);
        const cols = Math.max(minCols, Math.min(maxCols, Math.floor((shortSide * screenShare) / CELL / 4) * 4));
        loader.style.setProperty('--sign', `${cols * CELL}px`);
        onReady?.(extrudedSvg, cols);
    });
}

export function pageLoader() {
    const loader = document.querySelector('.page-loader');
    const root = document.documentElement;
    const bar = loader.querySelector('.page-loader-bar');
    const percentText = loader.querySelector('.page-loader-count');
    const fileText = loader.querySelector('.page-loader-file');
    const signatureCanvas = loader.querySelector('.page-loader-sign');

    let shownShare = 0;
    let finished = false;
    let pageLoaded = document.readyState === 'complete';
    let loaderSolid = null;
    let settleTimer = 0;

    if (!reducedMotion) root.classList.add('intro-waiting');

    const signatureTravels = !isMobile && !reducedMotion;
    loader.classList.toggle('has-thread', signatureTravels);

    drawIntroSignature(loader, signatureCanvas, (extrudedSvg, cols) => {
        if (signatureTravels || finished) return;
        const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
        loaderSolid = extrudedSvg(signatureCanvas, accent, { morph: true });
        loaderSolid.show(SIGNATURE_URL, cols);

        loadProjects().then(projects => {
            const marks = projects.map(projectMark);
            let next = 0;
            const showNextMark = () => {
                if (finished || !marks.length) return;
                loaderSolid.show(marks[next++ % marks.length], cols);
                setTimeout(showNextMark, INTRO.projectMarkEveryMs);
            };
            showNextMark();
        }, () => {});
        introLoaded.then(() => loaderSolid.show(SIGNATURE_URL, cols));
    });

    const leaveIntro = () => {
        loader.classList.add('is-leaving');
        const fadeMs = reducedMotion ? 0 : INTRO.fadeOutBeforeEntranceMs;
        setTimeout(() => {
            root.classList.remove('intro-waiting');
            root.classList.add('intro-in');
            startEntrance();
            dissolveLoader(loader, () => loaderSolid?.hide());
            setTimeout(() => root.classList.remove('intro-in'), INTRO.entranceClassMs);
        }, fadeMs);
    };

    const finish = allLoaded => {
        if (finished) return;
        finished = true;
        loading.open = false;
        window.fetch = nativeFetch;
        resolveIntroLoaded();
        if (allLoaded) {
            bar.style.transform = 'scaleX(1)';
            percentText.textContent = '100%';
        }
        setTimeout(leaveIntro, reducedMotion ? 0 : INTRO.holdAfterLoadedMs);
    };

    const fontUrls = fontFileUrls();
    const trackedFonts = new WeakSet();
    const trackFont = face => {
        if (trackedFonts.has(face) || face.status === 'unloaded') return;
        trackedFonts.add(face);
        const key = `${face.family.replace(/["']/g, '')}|${face.style}`;
        track(fontUrls.get(key) || face.family, face.loaded);
    };

    const allTrackedResourcesLoaded = () => loading.done === loading.total;

    const repaintProgress = () => {
        if (finished) return;
        document.fonts.forEach(trackFont);

        const ceiling = pageLoaded ? 1 : 0.99;
        const share = loading.total ? Math.min(ceiling, loading.done / loading.total) : 0;
        shownShare = Math.max(shownShare, share);
        bar.style.transform = `scaleX(${shownShare})`;
        percentText.textContent = `${String(Math.floor(shownShare * 100)).padStart(3, '0')}%`;
        fileText.textContent = loading.lastFile;

        clearTimeout(settleTimer);
        if (!pageLoaded || !allTrackedResourcesLoaded()) return;
        settleTimer = setTimeout(() => {
            document.fonts.forEach(trackFont);
            if (allTrackedResourcesLoaded()) finish(true);
        }, INTRO.settleMs);
    };
    loading.onChange = throttled(repaintProgress);

    trackExistingResources(trackFont);

    if (!pageLoaded) {
        addEventListener('load', () => {
            pageLoaded = true;
            loading.onChange();
        }, { once: true });
    }
    setTimeout(() => finish(false), INTRO.maxWaitMs);
    loading.onChange();
}
