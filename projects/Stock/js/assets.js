import { buildOnlineIconCandidates } from './ticker-catalog.js';

/**
 * Handles image load errors by attempting fallbacks from a list of candidates
 * or showing a text-based fallback.
 */
export function handleImageAssetError(img, symbol, market, isLogo = false) {
    if (!img) return;

    const candidates = img.dataset.candidates ? JSON.parse(img.dataset.candidates) : buildOnlineIconCandidates(symbol, market);
    let idx = parseInt(img.dataset.cIndex || '0', 10);

    if (candidates && idx < candidates.length) {
        img.src = candidates[idx];
        img.dataset.cIndex = (idx + 1).toString();
        img.dataset.candidates = JSON.stringify(candidates);
        return;
    }

    // All candidates failed or none provided -> Text Fallback
    const parent = img.parentElement;
    if (!parent) return;

    parent.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = isLogo ? 'logo-fallback' : 'tab-logo-fallback';
    
    const textEl = document.createElement('div');
    textEl.className = isLogo ? 'logo-name' : 'fallback-text';
    const ticker = (symbol || '').toUpperCase();
    textEl.textContent = ticker;
    textEl.title = ticker;

    if (!isLogo && ticker.length > 4) {
        const fontSize = Math.max(6, 12 - (ticker.length - 4) * 2);
        textEl.style.fontSize = fontSize + 'px';
    }

    wrapper.appendChild(textEl);
    parent.appendChild(wrapper);
}
