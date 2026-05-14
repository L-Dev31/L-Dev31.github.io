// Nemeris Quant Client — thin wrapper that runs QuantEngine ops in a Worker.
// Falls back to in-thread execution if Worker / module Workers are unsupported.
import { QuantEngine } from './quant-engine.js';

let worker = null;
let nextId = 1;
const pending = new Map();
let workerFailed = false;

function getWorker() {
    if (workerFailed) return null;
    if (worker) return worker;
    try {
        worker = new Worker(new URL('./workers/quant.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => {
            const { id, result, error } = e.data || {};
            const slot = pending.get(id);
            if (!slot) return;
            pending.delete(id);
            if (error) slot.reject(new Error(error));
            else slot.resolve(result);
        };
        worker.onerror = () => {
            workerFailed = true;
            worker = null;
            for (const [, slot] of pending) slot.reject(new Error('worker failed'));
            pending.clear();
        };
        return worker;
    } catch {
        workerFailed = true;
        return null;
    }
}

export function runQuant(op, ...args) {
    const w = getWorker();
    if (!w) {
        // Synchronous fallback — safe for any QuantEngine op, but blocks main thread.
        try {
            const fn = QuantEngine[op];
            if (typeof fn !== 'function') return Promise.reject(new Error(`Unknown op: ${op}`));
            return Promise.resolve(fn.apply(QuantEngine, args));
        } catch (e) {
            return Promise.reject(e);
        }
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ id, op, args });
    });
}

// Re-export sync access for trivially-cheap ops (no worker overhead worth it).
export { QuantEngine };
