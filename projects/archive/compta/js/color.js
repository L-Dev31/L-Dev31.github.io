export const hexToRgb = hex => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

export const mixHex = (a, b, t) => {
  const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
};

const linear = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = hex => {
  const [r, g, b] = hexToRgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

const hueToRgb = (p, q, t) => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};
export function hslToHex(h, s, l) {
  if (!s) { const v = l * 255; return rgbToHex([v, v, v]); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return rgbToHex([hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)].map(v => v * 255));
}

export function ensureContrast(hex, bg, min = 4.5) {
  if (contrastRatio(hex, bg) >= min) return hex;
  const [h, s, l0] = hexToHsl(hex);
  const darken = luminance(bg) > 0.5;
  for (let l = l0, i = 0; i < 50; i++, l += darken ? -0.02 : 0.02) {
    if (l < 0 || l > 1) break;
    const candidate = hslToHex(h, s, l);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return darken ? '#000000' : '#ffffff';
}

export const pickForeground = (bg, a = '#ffffff', b = '#0a0a0a') =>
  contrastRatio(a, bg) >= contrastRatio(b, bg) ? a : b;

export const THEME_PRESETS = [
  { id: 'default', label: 'Défaut', accent: '#0f766e', bg: '#faf9f6', bg2: '#f3faf4', text: '#072010' },
  { id: 'ocean', label: 'Océan', accent: '#0369a1', bg: '#f8fafb', bg2: '#eaf4fb', text: '#0b2436' },
  { id: 'plum', label: 'Aubergine', accent: '#7c3aed', bg: '#faf9fc', bg2: '#f3edfc', text: '#1e1033' },
  { id: 'terracotta', label: 'Terracotta', accent: '#c2410c', bg: '#fdfaf7', bg2: '#fdf0e6', text: '#2b1608' },
  { id: 'slate', label: 'Ardoise', accent: '#475569', bg: '#f8fafc', bg2: '#eef1f5', text: '#0f172a' },
  { id: 'forest', label: 'Forêt', accent: '#15803d', bg: '#f8faf7', bg2: '#eef6ec', text: '#0f2416' },
  { id: 'rose', label: 'Rose', accent: '#be185d', bg: '#fdf9fa', bg2: '#fdeef2', text: '#34071a' },
  { id: 'amber', label: 'Ambre', accent: '#b45309', bg: '#fdfbf6', bg2: '#fdf3dd', text: '#2b1c05' }
];

export function resolveTheme(theme = {}, defaults) {
  const bg = theme.bg || defaults.bg;
  const bg2 = theme.bg2 || defaults.bg2;
  const accent = ensureContrast(ensureContrast(theme.accent || defaults.accent, bg, 3), bg2, 3);
  const text = ensureContrast(ensureContrast(theme.text || defaults.text, bg, 4.5), bg2, 4.5);
  const onAccent = pickForeground(accent, '#ffffff', text);
  return { bg, bg2, accent, text, onAccent };
}
