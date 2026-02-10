const PROXIES = [
    { url: 'https://corsproxy.io/?',                      encode: false, wrapped: false },
    { url: 'https://api.allorigins.win/get?url=',        encode: true,  wrapped: true  },
    { url: 'https://thingproxy.freeboard.io/fetch/',      encode: false, wrapped: false },
    { url: 'https://api.codetabs.com/v1/proxy?quest=',    encode: true,  wrapped: false }
];
let currentProxyIndex = 0;

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

    for (let i = 0; i < PROXIES.length; i++) {
        const proxyIndex = (currentProxyIndex + i) % PROXIES.length;
        const p = PROXIES[proxyIndex];
        const finalUrl = `${p.url}${p.encode ? encodeURIComponent(targetUrl) : targetUrl}`;
        const mergedOptions = { ...fetchOptions, cache: 'no-store' };
        if (signal) mergedOptions.signal = signal;

        try {
            const r = await fetch(finalUrl, mergedOptions);

            if (r.status === 403 || r.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 900));
                lastError = new Error(`HTTP_${r.status}`);
                continue;
            }

            if (!r.ok) {
                lastError = new Error(`HTTP_${r.status}`);
                continue;
            }

            currentProxyIndex = proxyIndex;

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
            await new Promise(resolve => setTimeout(resolve, 350));
        }
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
