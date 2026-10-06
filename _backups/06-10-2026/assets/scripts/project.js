import { setupPageLoader, setupMobileMenu, setupCursor, setupBackToTop } from './ui.js';
import { setupLenis, setupMagneticLinks, setupTextReveal } from './animations.js';
import { prefersReducedMotion, getProjectsData, observeSections } from './utils.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

document.addEventListener('DOMContentLoaded', async () => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    setupPageLoader();
    const lenis = setupLenis();
    setupMobileMenu(lenis);
    setupCursor();
    setupBackToTop(lenis);
    setupMagneticLinks();

    const id = new URLSearchParams(location.search).get('id')?.trim();
    if (!id || !/^[\w-]+$/.test(id)) return renderNotFound();

    document.title = `${id.toUpperCase()} — Léo Tosku`;

    try {
        const [projectsData, res] = await Promise.all([
            getProjectsData(),
            fetch(`projects/Portfolio/${id}.html`)
        ]);
        const all = projectsData.projects || [];
        const data = all.find(p => p.id === id);
        if (!data || !res.ok) return renderNotFound();
        renderProject(data, await res.text(), lenis, all);
    } catch {
        renderNotFound();
    }
});

function renderProject(data, html, lenis, all = []) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    document.title = `${data.title || 'Project'} — Léo Tosku`;

    const heroImg = document.querySelector('.project-hero-img');
    if (data.heroImage && heroImg) {
        heroImg.src = data.heroImage;
        heroImg.alt = data.title || '';
        heroImg.hidden = false;
    } else {
        document.querySelector('.project-hero')?.remove();
    }

    const header = document.querySelector('.article-header');
    if (header) {
        const meta = [
            data.role && `As a ${data.role}`,
            data.date && `In ${data.date.slice(0, 4)}`,
            data.client && `For ${data.client}`
        ].filter(Boolean);

        header.innerHTML = [
            `<h1 class="article-title">${esc(data.title)}</h1>`,
            data.subtitle && `<p class="article-subtitle">${esc(data.subtitle)}</p>`,
            meta.length && `<p class="article-meta">${meta.map(esc).join(' · ')}</p>`,
            data.tags?.length && `<div class="article-tags">${data.tags.map(t => `<span class="featured-tag">${esc(t)}</span>`).join('')}</div>`
        ].filter(Boolean).join('');

        if (prefersReducedMotion) header.classList.add('loaded');
        else requestAnimationFrame(() => requestAnimationFrame(() => header.classList.add('loaded')));
    }

    const ctaBottom = document.querySelector('.project-cta-bottom');
    if (ctaBottom) ctaBottom.before(...tmp.childNodes);

    const ctaSection = document.querySelector('.project-cta-bottom');
    const hasCtas = data.ctas?.length > 0;
    const hasImages = data.ctaImages?.length > 0;

    const heroLive = document.querySelector('.project-hero-live');
    if (heroLive) {
        const firstCta = hasCtas ? data.ctas[0] : null;
        if (firstCta) {
            heroLive.textContent = firstCta.label + ' →';
            heroLive.href = firstCta.url;
        } else {
            heroLive.remove();
        }
    }

    if (!hasCtas && !hasImages) {
        ctaSection?.remove();
    } else {
        const ctaText = document.querySelector('.project-cta-text');
        ctaText?.querySelector('.project-cta-bottom-link')?.remove();
        if (hasCtas && ctaText) {
            data.ctas.forEach(cta => {
                const a = document.createElement('a');
                a.href = cta.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.className = 'project-cta-bottom-link';
                a.textContent = cta.label + ' →';
                ctaText.appendChild(a);
            });
        }

        const ctaTiles = document.querySelectorAll('.project-cta-tile');
        if (hasImages && ctaTiles.length) {
            ctaTiles.forEach((tile, i) => {
                const src = data.ctaImages[i];
                if (src) tile.style.backgroundImage = `url('${src}')`;
            });
            if (!prefersReducedMotion && ctaSection) {
                const updateCtaParallax = () => {
                    const rect = ctaSection.getBoundingClientRect();
                    const center = (rect.top + rect.height / 2) - window.innerHeight / 2;
                    ctaTiles.forEach(tile => {
                        const speed = parseFloat(tile.dataset.speed) || 0;
                        tile.style.transform = `translateY(${center * speed}px)`;
                    });
                };
                lenis ? lenis.on('scroll', updateCtaParallax)
                    : window.addEventListener('scroll', updateCtaParallax, { passive: true });
                updateCtaParallax();
            }
        } else {
            document.querySelector('.project-cta-gallery')?.remove();
        }
    }

    setupPager(data, all);

    if (!prefersReducedMotion) {
        const img = document.querySelector('.project-hero-img');
        if (img) {
            const tick = s => { img.style.transform = `translateY(${s * 0.3}px)`; };
            lenis ? lenis.on('scroll', ({ scroll }) => tick(scroll))
                : window.addEventListener('scroll', () => tick(window.scrollY), { passive: true });
        }
    }

    const obs = prefersReducedMotion ? null : new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) e.target.classList.add('visible');
            else if (e.boundingClientRect.top > 0) e.target.classList.remove('visible');
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });

    setupTextReveal(obs);
    observeSections(obs);

    document.querySelectorAll('.case-row').forEach(r => obs ? obs.observe(r) : r.classList.add('visible'));

    if (!prefersReducedMotion) {
        const figs = document.querySelectorAll('.case-panel:not([data-no-parallax]) img');
        if (figs.length) {
            const tick = () => figs.forEach(img => {
                const r = img.getBoundingClientRect();
                const center = (r.top + r.height / 2) - window.innerHeight / 2;
                img.style.transform = `translateY(${center * -0.06}px)`;
            });
            lenis ? lenis.on('scroll', tick) : window.addEventListener('scroll', tick, { passive: true });
            tick();
        }
    }
}

function setupPager(data, all) {
    const pager = document.querySelector('.project-pager');
    if (!pager) return;

    // Navigable projects: enabled, with a case study page (have a subtitle), in JSON order.
    const list = all.filter(p => !p.disabled && p.subtitle);
    const idx = list.findIndex(p => p.id === data.id);

    // Need at least one other project to navigate to.
    if (idx === -1 || list.length < 2) { pager.remove(); return; }

    const prev = list[(idx - 1 + list.length) % list.length];
    const next = list[(idx + 1) % list.length];

    const fill = (sel, p) => {
        const el = pager.querySelector(sel);
        if (!el || !p) return;
        el.href = `project.html?id=${encodeURIComponent(p.id)}`;
        el.setAttribute('aria-label', `${el.classList.contains('project-pager-item--prev') ? 'Previous' : 'Next'} project: ${p.title}`);
        el.querySelector('.project-pager-title').textContent = p.title || '';
        el.querySelector('.project-pager-role').textContent = p.role || p.category || '';
        const img = el.querySelector('.project-pager-img');
        if (img && p.heroImage) img.style.backgroundImage = `url('${p.heroImage}')`;
    };

    fill('.project-pager-item--prev', prev);
    fill('.project-pager-item--next', next);
    pager.hidden = false;
}

function renderNotFound() {
    document.title = 'Project not found — Léo Tosku';
    ['.project-hero', '.project-cta-bottom', '.article-header', '.project-blocks']
        .forEach(s => document.querySelector(s)?.remove());
    const div = Object.assign(document.createElement('div'), {
        className: 'project-not-found',
        innerHTML: '<p>Project not found.</p><a href="index.html">← Back</a>'
    });
    const footer = document.getElementById('footer');
    footer ? footer.before(div) : document.body.appendChild(div);
}
