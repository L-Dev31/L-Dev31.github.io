class RateLimiter {
    constructor() {
        if (RateLimiter.instance) return RateLimiter.instance;
        RateLimiter.instance = this;
        this.limiters = new Map();
    }

    get(api) {
        if (!this.limiters.has(api)) this.limiters.set(api, { limited: false, endTime: 0, timeout: null, queue: [] });
        return this.limiters.get(api);
    }

    isLimited(api) { return this.get(api).limited; }
    isRateLimited(api) { return this.isLimited(api); }

    remaining(api) {
        const l = this.get(api);
        return l.limited ? Math.ceil(Math.max(0, l.endTime - Date.now()) / 1000) : 0;
    }

    getRemainingSeconds(api) { return this.remaining(api); }

    set(api, ms) {
        const l = this.get(api);
        const end = Date.now() + ms;
        if (l.limited) { if (end > l.endTime) { l.endTime = end; this._reset(api); } return; }
        l.limited = true;
        l.endTime = end;
        try { window.__rateLimitedApi = api; window.__rateLimitEndTime = l.endTime; } catch(e) {}
        try { window.startRateLimitCountdown?.(Math.ceil(ms/1000)) || window.dispatchEvent(new CustomEvent('rateLimitStart', { detail: { apiName: api, seconds: Math.ceil(ms/1000) } })); } catch(e) {}
        this._reset(api);
    }

    clear(api) {
        const l = this.get(api);
        if (!l.limited) return;
        l.limited = false;
        l.endTime = 0;
        if (l.timeout) { clearTimeout(l.timeout); l.timeout = null; }
        try { window.__rateLimitedApi = null; window.__rateLimitEndTime = 0; } catch(e) {}
        try { window.stopRateLimitCountdown?.() || window.dispatchEvent(new CustomEvent('rateLimitEnd', { detail: { apiName: api } })); } catch(e) {}
        l.queue.splice(0).forEach(({ reject, error }) => reject(error));
    }

    async exec(fn, api = 'unknown') {
        const l = this.get(api);
        if (l.limited) {
            const rem = this.remaining(api);
            return new Promise((resolve, reject) => l.queue.push({ resolve, reject, error: { source: api, error: true, errorCode: 429, errorMessage: `Rate limit (${rem}s)`, throttled: true } }));
        }
        try { return await fn(); }
        catch (e) { if (e?.errorCode === 429 || e?.throttled) this.set(api, e?.retryAfter ? e.retryAfter * 1000 : 60000); throw e; }
    }

    async executeIfNotLimited(fn, api = 'unknown') { return this.exec(fn, api); }
    setRateLimitForApi(api, ms) { this.set(api, ms); }

    _reset(api) {
        const l = this.get(api);
        if (l.timeout) clearTimeout(l.timeout);
        const rem = l.endTime - Date.now();
        if (rem > 0) l.timeout = setTimeout(() => this.clear(api), rem);
        else this.clear(api);
    }

    forceClear(api) { this.clear(api); }
}

const rateLimiter = new RateLimiter();
export default rateLimiter;
export { RateLimiter };