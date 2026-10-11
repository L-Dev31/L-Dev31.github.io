// Runs QuantEngine ops in a Worker, or in-thread when module Workers are unsupported or have failed.
import { QuantEngine, runOp } from './quant-engine.js';

let worker = null, workerFailed = false, nextId = 1;
const pending = new Map();

function getWorker() {
    if (workerFailed || worker) return worker;
    try {
        worker = new Worker(new URL('./workers/quant.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data: { id, result, error } }) => {
            const slot = pending.get(id);
            pending.delete(id);
            if (error) slot?.reject(new Error(error));
            else slot?.resolve(result);
        };
        worker.onerror = () => {
            workerFailed = true;
            worker = null;
            for (const slot of pending.values()) slot.reject(new Error('worker failed'));
            pending.clear();
        };
    } catch {
        workerFailed = true;
        worker = null;
    }
    return worker;
}

export function runQuant(op, ...args) {
    const w = getWorker();
    if (!w) return new Promise(resolve => resolve(runOp(op, args)));   // blocks the main thread, but works everywhere
    return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        w.postMessage({ id, op, args });
    });
}

// Cheap ops can be called directly, without the worker round trip.
export { QuantEngine };
