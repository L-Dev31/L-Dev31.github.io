const PROXIES = [
    { url: 'https://corsproxy.io/?',                      encode: false, wrapped: false },
    { url: 'https://api.allorigins.win/get?url=',        encode: true,  wrapped: true  },
    { url: 'https://api.codetabs.com/v1/proxy?quest=',    encode: true,  wrapped: false }
];
let currentProxyIndex = 0;
const proxyHealth = new Map();

function getProxyHealth(index) {
    if (!proxyHealth.has(index)) {
        proxyHealth.set(index, { blockedUntil: 0, failures: 0 });
    }
    return proxyHealth.get(index);
}

function unwrapResponse(text, proxy) {
    if (proxy.wrapped) {
        const wrapper = JSON.parse(text);
        return typeof wrapper.contents === 'string' ? wrapper.contents : JSON.stringify(wrapper.contents);
    }
    return text;
}

export async function proxyFetch(targetUrl, opts = {}) {
    const { signal, fetchOptions = {}, expect = 'json' } = opts;
    let lastError = null;
    let sawThrottle = false;

    for (let i = 0; i < PROXIES.length; i++) {
        const proxyIndex = (currentProxyIndex + i) % PROXIES.length;
        const p = PROXIES[proxyIndex];
        const health = getProxyHealth(proxyIndex);
        if (Date.now() < health.blockedUntil) continue;

        const finalUrl = `${p.url}${p.encode ? encodeURIComponent(targetUrl) : targetUrl}`;
        const mergedOptions = { ...fetchOptions, cache: 'no-store' };
        if (signal) mergedOptions.signal = signal;

        try {
            const r = await fetch(finalUrl, mergedOptions);

            if (r.status === 403 || r.status === 429) {
                sawThrottle = true;
                health.failures += 1;
                health.blockedUntil = Date.now() + (r.status === 429 ? 120000 : 45000);
                await new Promise(resolve => setTimeout(resolve, 250 + Math.random() * 250));
                lastError = new Error('HTTP_429');
                continue;
            }

            if (!r.ok) {
                health.failures += 1;
                if (health.failures >= 3) {
                    health.blockedUntil = Date.now() + 60000;
                }
                lastError = new Error(`HTTP_${r.status}`);
                continue;
            }

            currentProxyIndex = proxyIndex;
            health.failures = 0;
            health.blockedUntil = 0;

            const text = await r.text();
            try {
                const unwrapped = unwrapResponse(text, p);
                return expect === 'text' ? unwrapped : JSON.parse(unwrapped);
            } catch (parseError) {
                lastError = parseError;
                continue;
            }
        } catch (networkError) {
            lastError = networkError;
            const msg = String(networkError?.message || '').toLowerCase();
            health.failures += 1;

            if (msg.includes('name_not_resolved') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
                health.blockedUntil = Date.now() + 180000;
            } else if (health.failures >= 3) {
                health.blockedUntil = Date.now() + 60000;
            }

            await new Promise(resolve => setTimeout(resolve, 220));
        }
    }

    if (sawThrottle) {
        throw new Error('HTTP_429');
    }

    throw lastError || new Error('ALL_PROXIES_FAILED');
}

export async function proxyFetchSafe(targetUrl, signal) {
    try {
        return await proxyFetch(targetUrl, { signal, expect: 'json' });
    } catch (e) {
        const match = e.message?.match(/HTTP_(\d+)/);
        const code = match ? parseInt(match[1]) : 500;
        return {
            error: true,
            errorCode: code === 429 ? 429 : (code || 'ALL_PROXIES_FAILED'),
            throttled: code === 429,
            message: e.message
        };
    }
}
