import { fetchJson, resolveProjectHref, prefersReducedMotion } from './utils.js';

export async function setupProjectPage(lenis) {
    const params = new URLSearchParams(location.search);
    const id = params.get('id')?.trim();

    if (!id) { renderNotFound(); return; }

    try {
        const data = await fetchJson(`assets/data/projects/${id}.json`);
        renderPage(data, lenis);
    } catch {
        renderNotFound();
    }
}

function renderNotFound() {
    document.title = 'Project not found — Léo Tosku';
    document.querySelector('.project-hero')?.remove();
    document.querySelector('.project-cta-bottom')?.remove();
    const header = document.querySelector('.article-header');
    if (header) header.remove();
    const blocks = document.querySelector('.project-blocks');
    if (blocks) blocks.remove();

    const div = document.createElement('div');
    div.className = 'project-not-found';
    div.innerHTML = '<p>Project not found.</p><a href="index.html">← Back</a>';
    const footer = document.getElementById('footer');
    footer ? footer.before(div) : document.body.appendChild(div);
}

function renderPage(data, lenis) {
    document.title = `${data.title} — Léo Tosku`;
    renderHero(data);
    renderArticleHeader(data);
    renderBlocks(data.blocks || []);
    renderBottomCTA(data);
    setupHeroParallax(lenis);
    setupBlockReveal();
    setupHeaderEntrance();
}

function renderHero(data) {
    const section = document.querySelector('.project-hero');
    const img = document.querySelector('.project-hero-img');
    if (!data.heroImage || !section || !img) {
        section?.remove();
        return;
    }
    img.src = data.heroImage;
    img.alt = data.title;
}

function renderArticleHeader(data) {
    const header = document.querySelector('.article-header');
    if (!header) return;

    const liveHref = resolveProjectHref(data.liveUrl);
    const metaParts = [data.year, data.role, data.client].filter(Boolean);

    header.innerHTML = `
        ${liveHref ? `<a href="${liveHref}" class="article-cta-top" target="_blank" rel="noopener noreferrer">View live →</a>` : ''}
        <h1 class="article-title">${data.title}</h1>
        ${data.subtitle ? `<p class="article-subtitle">${data.subtitle}</p>` : ''}
        ${metaParts.length ? `<p class="article-meta">${metaParts.join(' · ')}</p>` : ''}
        ${data.tags?.length ? `<div class="article-tags">${data.tags.map(t => `<span class="featured-tag">${t}</span>`).join('')}</div>` : ''}
    `;
}

function renderBlocks(blocks) {
    const container = document.querySelector('.project-blocks');
    if (!container) return;

    blocks.forEach(block => {
        const el = document.createElement('div');
        el.className = `project-block project-block--${block.type}`;

        switch (block.type) {
            case 'text':
                el.innerHTML = `
                    <div class="block-text-inner">
                        ${block.title ? `<h2 class="block-text-title">${block.title}</h2>` : ''}
                        <p class="block-text-body">${block.body || ''}</p>
                    </div>`;
                break;
            case 'pull-quote':
                el.innerHTML = `<blockquote class="block-pullquote">${block.text || ''}</blockquote>`;
                break;
            case 'image':
                el.innerHTML = `
                    <figure class="block-figure">
                        <img src="${block.src}" alt="${block.caption || ''}" loading="lazy" decoding="async">
                        ${block.caption ? `<figcaption>${block.caption}</figcaption>` : ''}
                    </figure>`;
                break;
            case 'gallery':
                el.innerHTML = `
                    <div class="block-gallery">
                        ${(block.images || []).map(src => `<img src="${src}" alt="" loading="lazy" decoding="async">`).join('')}
                    </div>`;
                break;
            case 'metrics':
                el.innerHTML = `
                    <div class="block-metrics">
                        ${(block.items || []).map(item => `
                            <div class="metric-item">
                                <span class="metric-value">${item.value}</span>
                                <span class="metric-label">${item.label}</span>
                            </div>`).join('')}
                    </div>`;
                break;
        }

        container.appendChild(el);
    });
}

function renderBottomCTA(data) {
    const ctaEl = document.querySelector('.project-cta-bottom');
    if (!ctaEl) return;

    const liveHref = resolveProjectHref(data.liveUrl);
    if (!liveHref) { ctaEl.remove(); return; }

    ctaEl.innerHTML = `<a href="${liveHref}" target="_blank" rel="noopener noreferrer" class="project-cta-bottom-link">Read all that? Here&rsquo;s how it looks →</a>`;
}

function setupHeroParallax(lenis) {
    const img = document.querySelector('.project-hero-img');
    if (!img || prefersReducedMotion) return;

    const update = scroll => { img.style.transform = `translateY(${scroll * 0.3}px)`; };

    if (lenis) lenis.on('scroll', ({ scroll }) => update(scroll));
    else window.addEventListener('scroll', () => update(window.scrollY), { passive: true });
}

function setupBlockReveal() {
    if (prefersReducedMotion) {
        document.querySelectorAll('.project-block').forEach(el => el.classList.add('visible'));
        return;
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                observer.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.project-block').forEach(el => observer.observe(el));
}

function setupHeaderEntrance() {
    const header = document.querySelector('.article-header');
    if (!header) return;

    if (prefersReducedMotion) { header.classList.add('loaded'); return; }

    requestAnimationFrame(() => requestAnimationFrame(() => header.classList.add('loaded')));
}
