// ============================================================================
// proxy-fetch.js — passerelle unique vers le Cloudflare Worker (CORS bypass).
//
// Une seule fonction publique de fetch : proxyFetch(targetUrl, opts).
// Retourne TOUJOURS un objet enveloppé :
//   - succès :  { data }
//   - échec  :  { error: true, errorCode, throttled? }
// Ne throw que AbortError (laisse l'appelant gérer l'abort).
//
// Détection panne worker : 3 échecs consécutifs "côté worker" (réseau, 403, 5xx)
// émettent l'event `workerFailure`. 401/404/422 = Yahoo refuse, pas une panne.
// ============================================================================

import { getUserSettings, saveUserSettings } from './state.js';

export const DEFAULT_WORKER_URL = 'https://nemeris.leotoskuepro.workers.dev';
const WORKER_FAIL_THRESHOLD = 3;

let workerFails = 0;
let workerDown = false;

const emit = (name, detail) => {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ }
};

function onWorkerFailure(reason) {
    workerFails++;
    if (!workerDown && workerFails >= WORKER_FAIL_THRESHOLD) {
        workerDown = true;
        emit('workerFailure', { reason });
    }
}

function onWorkerOk() {
    if (workerFails === 0 && !workerDown) return;
    workerFails = 0;
    if (workerDown) { workerDown = false; emit('workerRecovered', {}); }
}

export function getProxyBaseUrl() {
    return getUserSettings().proxyUrl || DEFAULT_WORKER_URL;
}

export function setProxyBaseUrl(url) {
    try {
        saveUserSettings({ proxyUrl: url?.trim() || '' });
    } catch { /* ignore */ }
    workerFails = 0;
    if (workerDown) { workerDown = false; emit('workerRecovered', {}); }
}

function wrap(targetUrl, base) {
    if (base.includes('{url}')) return base.replace('{url}', encodeURIComponent(targetUrl));
    return `${base}${base.includes('?') ? '&' : '?'}url=${encodeURIComponent(targetUrl)}`;
}

export async function proxyFetch(targetUrl, { signal, expect = 'json' } = {}) {
    let r;
    try {
        r = await fetch(wrap(targetUrl, getProxyBaseUrl()), { signal, cache: 'no-store' });
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        onWorkerFailure('network');
        return { error: true, errorCode: 0, message: e.message };
    }

    const s = r.status;

    // 429 = throttled (Yahoo). 401/404/422 = Yahoo refuse (crumb/ticker mort/param). Worker fonctionne.
    if (s === 429) return { error: true, errorCode: 429, throttled: true };
    if (s === 401 || s === 404 || s === 422) return { error: true, errorCode: s };

    // 403/5xx/autres non-OK = probable panne worker.
    if (!r.ok) {
        onWorkerFailure(`HTTP_${s}`);
        return { error: true, errorCode: s };
    }

    onWorkerOk();
    try {
        const text = await r.text();
        return { data: expect === 'text' ? text : JSON.parse(text) };
    } catch (e) {
        return { error: true, errorCode: 'PARSE_ERROR', message: e.message };
    }
}

// Test de santé worker — utilise v8/finance/chart (endpoint public, pas de crumb requis).
export async function pingProxy(url) {
    try {
        const base = (url || getProxyBaseUrl()).trim();
        if (!base) return false;
        const target = 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d';
        const r = await fetch(wrap(target, base), { cache: 'no-store' });
        return r.ok;
    } catch { return false; }
}
