class GlobalRateLimiter {
  constructor() {
    if (GlobalRateLimiter.instance) {
      return GlobalRateLimiter.instance;
    }
    GlobalRateLimiter.instance = this;
    this.isRateLimited = false;
    this.rateLimitEndTime = 0;
    this.timeoutId = null;
    this.rejectQueue = [];
  }

  isGloballyRateLimited() {
    return this.isRateLimited;
  }

  getRemainingSeconds() {
    if (!this.isRateLimited) return 0;
    const remaining = Math.max(0, this.rateLimitEndTime - Date.now());
    return Math.ceil(remaining / 1000);
  }

  setGlobalRateLimit(durationMs) {
    if (this.isRateLimited) {
      const newEndTime = Date.now() + durationMs;
      if (newEndTime > this.rateLimitEndTime) {
        this.rateLimitEndTime = newEndTime;
        this._resetTimeout();
      }
      return;
    }

    this.isRateLimited = true;
    this.rateLimitEndTime = Date.now() + durationMs;

    console.log(`🚫 GLOBAL RATE LIMIT ACTIVATED - All APIs blocked for ${Math.ceil(durationMs/1000)}s`);

    // Notify UI: prefer direct function if present, otherwise dispatch an event
    if (typeof window !== 'undefined') {
      // expose quick properties for UI checks (load-order safe)
      try {
        window.__globalRateLimitActive = true;
        window.__globalRateLimitEndTime = this.rateLimitEndTime;
      } catch (e) { /* ignore */ }
      if (typeof window.startGlobalRateLimitCountdown === 'function') {
        try { window.startGlobalRateLimitCountdown(Math.ceil(durationMs/1000)); } catch(e) { /* ignore */ }
      } else {
        try {
          window.dispatchEvent(new CustomEvent('globalRateLimitStart', { detail: { seconds: Math.ceil(durationMs/1000) } }));
        } catch (e) { /* ignore */ }
      }
    }

    this._resetTimeout();
  }

  clearGlobalRateLimit() {
    if (!this.isRateLimited) return;

    this.isRateLimited = false;
    this.rateLimitEndTime = 0;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    console.log(`✅ GLOBAL RATE LIMIT CLEARED - APIs can resume requests`);

    // notify UI that global rate limit ended and clear quick properties
    if (typeof window !== 'undefined') {
      try { window.__globalRateLimitActive = false; window.__globalRateLimitEndTime = 0; } catch (e) { /* ignore */ }
      if (typeof window.stopGlobalRateLimitCountdown === 'function') {
        try { window.stopGlobalRateLimitCountdown(); } catch(e) { /* ignore */ }
      } else {
        try { window.dispatchEvent(new CustomEvent('globalRateLimitEnd')); } catch (e) { /* ignore */ }
      }
    }

    this._processRejectQueue();
  }

  async executeIfNotLimited(fn, apiName = 'unknown') {
    if (this.isRateLimited) {
      const remaining = this.getRemainingSeconds();
      console.log(`🚫 ${apiName} request BLOCKED by global rate limit (${remaining}s remaining)`);

      return new Promise((resolve, reject) => {
        this.rejectQueue.push({
          resolve,
          reject,
          apiName,
          error: {
            source: apiName,
            error: true,
            errorCode: 429,
            errorMessage: `Global rate limit active (${remaining}s remaining)`,
            globallyThrottled: true
          }
        });
      });
    }

    try {
      return await fn();
    } catch (error) {
      if (error?.errorCode === 429 || error?.throttled || error?.globallyThrottled) {
        const waitTime = error?.retryAfter ? error.retryAfter * 1000 : 60000;
        this.setGlobalRateLimit(waitTime);
      }
      throw error;
    }
  }

  _resetTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    const remaining = this.rateLimitEndTime - Date.now();
    if (remaining > 0) {
      this.timeoutId = setTimeout(() => {
        this.clearGlobalRateLimit();
      }, remaining);
    } else {
      this.clearGlobalRateLimit();
    }
  }

  _processRejectQueue() {
    const queue = [...this.rejectQueue];
    this.rejectQueue = [];

    queue.forEach(({ reject, error }) => {
      reject(error);
    });
  }

  forceClear() {
    this.clearGlobalRateLimit();
  }
}

const globalRateLimiter = new GlobalRateLimiter();

export default globalRateLimiter;
export { GlobalRateLimiter };