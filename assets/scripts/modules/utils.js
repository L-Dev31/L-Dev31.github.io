export const MOBILE_BREAKPOINT = 1024;
export const REQUEST_TIMEOUT_MS = 8000;
export const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= MOBILE_BREAKPOINT;
export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let projectsDataPromise = null;

export function fetchJson(path, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = setTimeout(() => controller?.abort(), timeoutMs);

    return fetch(path, controller ? { signal: controller.signal } : undefined)
        .then(response => {
            if (!response.ok) throw new Error(`Load failed: ${path} (${response.status})`);
            return response.json();
        })
        .finally(() => clearTimeout(timeoutId));
}

export function getProjectsData() {
    if (!projectsDataPromise) {
        projectsDataPromise = fetchJson('assets/data/projects.json').catch(err => {
            projectsDataPromise = null;
            throw err;
        });
    }
    return projectsDataPromise;
}

export function resolveProjectHref(path) {
    if (!path?.trim()) return null;
    const t = path.trim();
    return /^(?:https?:)?\/\//i.test(t) || /^[a-z][a-z\d+.-]*:/i.test(t) ? t : `${t.replace(/\/+$/, '')}/`;
}

export const observe = (el, observer) => {
    if (!el) return;
    if (!observer) { el.classList.add('visible'); return; }
    observer.observe(el);
};

export const clamp01 = v => Math.max(0, Math.min(1, v));
