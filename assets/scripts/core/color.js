// Colours as the site writes them: #rgb, #rrggbb, rgb(), rgba(), and linear-gradient() of those.

// The red, green and blue channels (0 to 255) of one colour.
export function parseColor(color) {
    const hex = /^#([\da-f]{3,8})$/i.exec(color.trim())?.[1];
    if (hex) {
        const full = hex.length <= 4 ? [...hex].map(digit => digit + digit).join('') : hex;
        return [0, 2, 4].map(start => parseInt(full.slice(start, start + 2), 16));
    }
    return (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
}

export const isGradient = color => color.startsWith('linear-gradient(');

// The colours listed in a gradient, as written, or null for a plain colour.
export function gradientStops(color) {
    if (!isGradient(color)) return null;
    const stops = color.match(/#[\da-f]{3,8}|rgba?\([^)]*\)/gi);
    return stops?.length > 1 ? stops : null;
}

// The first and the last colour as channels: a plain colour is both.
export function colorEnds(color) {
    const stops = gradientStops(color);
    if (stops) return [parseColor(stops[0]), parseColor(stops.at(-1))];
    const solid = parseColor(color);
    return [solid, solid];
}

// The colour between two others, as an rgb() string.
export function mixColors(first, last, progress) {
    const start = parseColor(first), end = parseColor(last);
    return `rgb(${start.map((value, index) => Math.round(value + (end[index] - value) * progress)).join(',')})`;
}
