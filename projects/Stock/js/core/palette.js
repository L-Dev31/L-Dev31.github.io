// Colors for charts and canvases, read from the CSS tokens (styles/base.css) so they follow the theme.
let cache = null;

/** The theme's colors, read once (a theme change reloads the page). */
export function colors() {
    if (cache) return cache;
    const css = getComputedStyle(document.documentElement);
    const token = name => css.getPropertyValue(name).trim();
    cache = {
        accent: token('--accent'), pos: token('--pos'), neg: token('--neg'), warn: token('--warn'),
        text: token('--text'), text2: token('--text-2'), muted: token('--muted'), faint: token('--faint'),
        surface: token('--surface'), grid: token('--grid'), line: token('--line-2'),
        inverse: token('--inverse'), onInverse: token('--on-inverse'),
    };
    return cache;
}

/** "#RRGGBB" with an opacity, as "rgba(r, g, b, a)". */
export function alpha(hex, a) {
    const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
