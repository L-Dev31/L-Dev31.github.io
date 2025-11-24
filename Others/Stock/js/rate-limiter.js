class RateLimiter {
  constructor() {
    if (RateLimiter.instance) {
      return RateLimiter.instance;
    }
    RateLimiter.instance = this;
    this.rateLimiters = new Map(); // Map<apiName, {isRateLimited: boolean, rateLimitEndTime: number, timeoutId: number, rejectQueue: []}>
  }

  getRateLimiter(apiName) {
    if (!this.rateLimiters.has(apiName)) {
      this.rateLimiters.set(apiName, {
        isRateLimited: false,
        rateLimitEndTime: 0,
        timeoutId: null,
        rejectQueue: []
      });
    }
    return this.rateLimiters.get(apiName);
  }

  isRateLimited(apiName) {
    const rl = this.getRateLimiter(apiName);
    return rl.isRateLimited;
  }

  getRemainingSeconds(apiName) {
    const rl = this.getRateLimiter(apiName);
    if (!rl.isRateLimited) return 0;
    const remaining = Math.max(0, rl.rateLimitEndTime - Date.now());
    return Math.ceil(remaining / 1000);
  }

  setRateLimitForApi(apiName, durationMs) {
    const rl = this.getRateLimiter(apiName);
    if (rl.isRateLimited) {
      const newEndTime = Date.now() + durationMs;
      if (newEndTime > rl.rateLimitEndTime) {
        rl.rateLimitEndTime = newEndTime;
        this._resetTimeout(apiName);
      }
      return;
    }

    rl.isRateLimited = true;
    rl.rateLimitEndTime = Date.now() + durationMs;

    console.log(`🚫 ${apiName} RATE LIMIT ACTIVATED - ${apiName} blocked for ${Math.ceil(durationMs/1000)}s`);

    // Notify UI: prefer direct function if present, otherwise dispatch an event
    if (typeof window !== 'undefined') {
      // expose quick properties for UI checks (load-order safe)
      try {
        window.__rateLimitedApi = apiName;
        window.__rateLimitEndTime = rl.rateLimitEndTime;
      } catch (e) { /* ignore */ }
      if (typeof window.startRateLimitCountdown === 'function') {
        try { window.startRateLimitCountdown(Math.ceil(durationMs/1000)); } catch(e) { /* ignore */ }
      } else {
        try {
          window.dispatchEvent(new CustomEvent('rateLimitStart', { detail: { apiName, seconds: Math.ceil(durationMs/1000) } }));
        } catch (e) { /* ignore */ }
      }
    }

    this._resetTimeout(apiName);
  }

  clearRateLimitForApi(apiName) {
    const rl = this.getRateLimiter(apiName);
    if (!rl.isRateLimited) return;

    rl.isRateLimited = false;
    rl.rateLimitEndTime = 0;

    if (rl.timeoutId) {
      clearTimeout(rl.timeoutId);
      rl.timeoutId = null;
    }

    console.log(`✅ ${apiName} RATE LIMIT CLEARED - ${apiName} can resume requests`);

    // notify UI that rate limit ended and clear quick properties
    if (typeof window !== 'undefined') {
      try { window.__rateLimitedApi = null; window.__rateLimitEndTime = 0; } catch (e) { /* ignore */ }
      if (typeof window.stopRateLimitCountdown === 'function') {
        try { window.stopRateLimitCountdown(); } catch(e) { /* ignore */ }
      } else {
        try { window.dispatchEvent(new CustomEvent('rateLimitEnd', { detail: { apiName } })); } catch (e) { /* ignore */ }
      }
    }

    this._processRejectQueue(apiName);
  }

  async executeIfNotLimited(fn, apiName = 'unknown') {
    const rl = this.getRateLimiter(apiName);
    if (rl.isRateLimited) {
      const remaining = this.getRemainingSeconds(apiName);
      console.log(`🚫 ${apiName} request BLOCKED by rate limit (${remaining}s remaining)`);

      return new Promise((resolve, reject) => {
        rl.rejectQueue.push({
          resolve,
          reject,
          apiName,
          error: {
            source: apiName,
            error: true,
            errorCode: 429,
            errorMessage: `Rate limit active (${remaining}s remaining)`,
            throttled: true
          }
        });
      });
    }

    try {
      return await fn();
    } catch (error) {
      if (error?.errorCode === 429 || error?.throttled) {
        const waitTime = error?.retryAfter ? error.retryAfter * 1000 : 60000;
        this.setRateLimitForApi(apiName, waitTime);
      }
      throw error;
    }
  }

  _resetTimeout(apiName) {
    const rl = this.getRateLimiter(apiName);
    if (rl.timeoutId) {
      clearTimeout(rl.timeoutId);
    }

    const remaining = rl.rateLimitEndTime - Date.now();
    if (remaining > 0) {
      rl.timeoutId = setTimeout(() => {
        this.clearRateLimitForApi(apiName);
      }, remaining);
    } else {
      this.clearRateLimitForApi(apiName);
    }
  }

  _processRejectQueue(apiName) {
    const rl = this.getRateLimiter(apiName);
    const queue = [...rl.rejectQueue];
    rl.rejectQueue = [];

    queue.forEach(({ reject, error }) => {
      reject(error);
    });
  }

  forceClear(apiName) {
    this.clearRateLimitForApi(apiName);
  }
}

const rateLimiter = new RateLimiter();

export default rateLimiter;
export { RateLimiter };