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
