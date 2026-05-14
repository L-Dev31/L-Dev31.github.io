// Nemeris Quant Worker — runs heavy calculations off the main thread.
// Loaded as ES module worker: new Worker(url, { type: 'module' }).
import { QuantEngine } from '../quant-engine.js';

self.onmessage = (e) => {
    const { id, op, args } = e.data || {};
    try {
        const fn = QuantEngine[op];
        if (typeof fn !== 'function') {
            self.postMessage({ id, error: `Unknown op: ${op}` });
            return;
        }
        const result = fn.apply(QuantEngine, args || []);
        self.postMessage({ id, result });
    } catch (err) {
        self.postMessage({ id, error: err?.message || String(err) });
    }
};
