// Cookie-free audience measurement, sent to this site's own /_t endpoint.
// It stores nothing in the visitor's browser and respects Do Not Track and Global Privacy Control.
// Visit any page with ?stats=off once to switch it off for your own browser, ?stats=on to switch it back on.
(() => {
    const HOST = 'www.leotosku.com';
    const ENDPOINT = '/_t';
    if (location.hostname !== HOST) return;

    const query = new URLSearchParams(location.search);
    try {
        if (query.get('stats') === 'off') localStorage.setItem('stats-off', '1');
        if (query.get('stats') === 'on') localStorage.removeItem('stats-off');
        if (localStorage.getItem('stats-off')) return;
    } catch { /* storage blocked: measure normally */ }
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;

    const page = location.pathname.replace(/index\.html$/, '') + ['id', 'kind'].filter(key => query.get(key)).map((key, i) => `${i ? '&' : '?'}${key}=${encodeURIComponent(query.get(key).slice(0, 30))}`).join('');
    const send = data => {
        const body = JSON.stringify({ p: page, ...data });
        if (!(navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body))) fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
    };

    const referrer = (() => { try { const host = new URL(document.referrer).host; return host === HOST ? '' : host.replace(/^www\./, ''); } catch { return ''; } })();
    send({
        e: 'view', r: referrer, s: query.get('utm_source') ?? '', m: query.get('utm_medium') ?? '', c: query.get('utm_campaign') ?? '',
        l: navigator.language, w: innerWidth, t: matchMedia('(pointer: coarse)').matches,
    });

    // Clicks: the kind and label of what was pressed, never an address.
    addEventListener('click', event => {
        const control = event.target.closest?.('a[href], button, [data-track]');
        if (!control) return;
        const link = control.closest('a[href]');
        let kind = 'ui', destination = '';
        if (link) {
            const url = new URL(link.href, location.href);
            if (link.hasAttribute('download')) { kind = 'file'; destination = url.pathname.split('/').pop(); }
            else if (url.protocol === 'mailto:') kind = 'email';
            else if (url.protocol === 'tel:') kind = 'tel';
            else if (url.host !== location.host) { kind = 'out'; destination = url.host.replace(/^www\./, ''); }
            else { kind = 'in'; destination = url.pathname.replace(/index\.html$/, '') + (url.searchParams.get('id') ? `?id=${url.searchParams.get('id')}` : ''); }
        }
        const label = (control.dataset.track || control.getAttribute('aria-label') || control.textContent || '').replace(/\s+/g, ' ').trim();
        send({ e: 'click', k: kind, g: label, h: destination, z: control.closest('[id]')?.id ?? '' });
    }, true);

    // Sections reached (a section counts once it crosses the middle of the screen), and which showcase projects were looked at.
    const seen = new Set();
    const once = (event, key, extra) => { const id = `${event}:${key}`; if (key && !seen.has(id)) { seen.add(id); send({ e: event, k: key, ...extra }); } };
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) once('section', entry.target.id); }), { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
        document.querySelectorAll('main section[id], #contact').forEach(section => observer.observe(section));
    }
    addEventListener('showcasepalettechange', () => {
        const stage = document.querySelector('.showcase-stage');
        const id = new URL(document.querySelector('.showcase-link')?.href ?? location.href, location.href).searchParams.get('id');
        if (stage?.dataset.paletteActive === 'true') once('project', id);
    });

    // How far the page was read and for how long, sent once when the visitor leaves.
    const started = performance.now();
    let deepest = 0, left = false;
    addEventListener('scroll', () => { deepest = Math.max(deepest, (scrollY + innerHeight) / document.documentElement.scrollHeight); }, { passive: true });
    const leave = () => { if (left) return; left = true; send({ e: 'leave', d: Math.min(100, Math.round(deepest * 100)), ms: Math.round(performance.now() - started) }); };
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
    addEventListener('pagehide', leave);
})();
