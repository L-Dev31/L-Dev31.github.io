// Runs the heavy QuantEngine ops off the main thread (module worker, started by quant-client.js).
import { runOp } from '../quant-engine.js';

self.onmessage = ({ data: { id, op, args } }) => {
    try {
        self.postMessage({ id, result: runOp(op, args) });
    } catch (err) {
        self.postMessage({ id, error: err?.message || String(err) });
    }
};
