import { getUserSettings, saveUserSettings } from '../core/state.js';

export const DEFAULT_WORKER_URL = '';
const WORKER_FAIL_THRESHOLD = 3;

let workerFails = 0;
let workerDown = false;

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

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

export const getProxyBaseUrl = () => getUserSettings().proxyUrl || DEFAULT_WORKER_URL;

export function setProxyBaseUrl(url) {
    const trimmed = url?.trim() || '';
    if (trimmed && !trimmed.startsWith('https://')) {
        emit('workerFailure', { reason: 'Proxy URL must use HTTPS' });
        return;
    }
    saveUserSettings({ proxyUrl: trimmed });
    workerFails = 0;
    if (workerDown) { workerDown = false; emit('workerRecovered', {}); }
}

function wrap(targetUrl, base) {
    if (base.includes('{url}')) return base.replace('{url}', encodeURIComponent(targetUrl));
    return `${base}${base.includes('?') ? '&' : '?'}url=${encodeURIComponent(targetUrl)}`;
}

/** Fetches through the user's Worker. quiet: failures don't count toward "Worker down" (web pages, not Yahoo). */
export async function proxyFetch(targetUrl, { signal, expect = 'json', quiet = false } = {}) {
    const base = getProxyBaseUrl();
    if (!base) return { error: true, errorCode: 'NO_WORKER' };
    let r;
    try {
        r = await fetch(wrap(targetUrl, base), { signal, cache: 'no-store' });
    } catch (e) {
        if (e.name === 'AbortError') throw e;
        if (!quiet) onWorkerFailure('network');
        return { error: true, errorCode: 0, message: e.message };
    }
    const s = r.status;
    if (s === 429) return { error: true, errorCode: 429, throttled: true };
    if (s === 401 || s === 404 || s === 422) return { error: true, errorCode: s };
    if (!r.ok) {
        if (!quiet) onWorkerFailure(`HTTP_${s}`);
        return { error: true, errorCode: s };
    }
    if (!quiet) onWorkerOk();
    try {
        const text = await r.text();
        return { data: expect === 'text' ? text : JSON.parse(text) };
    } catch (e) {
        return { error: true, errorCode: 'PARSE_ERROR', message: e.message };
    }
}

export async function pingProxy(url) {
    const base = (url || getProxyBaseUrl()).trim();
    if (!base) return false;
    try {
        const r = await fetch(wrap('https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d', base), { cache: 'no-store' });
        return r.ok;
    } catch { return false; }
}
