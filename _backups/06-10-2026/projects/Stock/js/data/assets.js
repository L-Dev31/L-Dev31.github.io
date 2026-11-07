import { buildOnlineIconCandidates } from './ticker-catalog.js';

/** Tries the next logo source; when none is left, shows the ticker initials instead. */
export function handleImageAssetError(img, symbol, market) {
    if (!img) return;
    const list = img.dataset.candidates ? JSON.parse(img.dataset.candidates) : buildOnlineIconCandidates(symbol, market) || [];
    const next = Number(img.dataset.cIndex || 0);
    if (next < list.length) {
        img.dataset.candidates = JSON.stringify(list);
        img.dataset.cIndex = String(next + 1);
        img.src = list[next];
        return;
    }
    const box = document.createElement('span');
    box.className = 'logo-fallback';
    box.textContent = String(symbol || '?').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    box.setAttribute('aria-hidden', 'true');
    img.replaceWith(box);
}
