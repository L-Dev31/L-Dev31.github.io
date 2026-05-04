import { isMobile, prefersReducedMotion, getProjectsData, resolveProjectHref } from './utils.js';

export function setupWebProjects() {
    const list = document.querySelector('.featured-list');
    const preview = document.querySelector('.project-preview-container');
    const img = document.querySelector('.project-preview-img');
    const desc = document.querySelector('.project-preview-desc');
    if (!list || !preview || !img || !desc) return;

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    const anim = () => {
        if (preview.style.display !== 'flex') return;
        cx += (tx - cx) * 0.1; cy += (ty - cy) * 0.1;
        preview.style.left = `${cx}px`; preview.style.top = `${cy}px`;
        raf = requestAnimationFrame(anim);
    };

    const update = (x, y) => { const h = window.innerHeight; tx = x + h * 0.05; ty = y - h * 0.1; };

    getProjectsData().then(data => {
        const projects = (data.projects || []).filter(p => p.category === 'web' && !(isMobile && p.noPhone));
        if (!projects.length) { list.innerHTML = '<p class="projects-empty">No projects.</p>'; return; }

        projects.forEach(p => {
            const href = resolveProjectHref(p.path);
            const a = document.createElement('a');
            a.className = `featured-project ${!href ? 'featured-project--disabled' : ''}`;
            if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            else { a.setAttribute('aria-disabled', 'true'); a.tabIndex = -1; }

            a.innerHTML = `
                <div class="featured-project-info">
                    <span class="featured-project-title">${p.title}</span>
                    <span class="featured-project-category">${p.type || 'UI/UX Design'}</span>
                </div>
                <span class="featured-meta">
                    ${p.creator?.trim() || href ? `<span class="featured-slot">${p.creator?.trim() ? `<span class="featured-author">${p.creator}</span>` : ''}</span>` : ''}
                </span>`;

            if (href) {
                a.addEventListener('mouseenter', e => {
                    if (isMobile || prefersReducedMotion) return;
                    img.src = `assets/images/websites/${p.id}.png`;
                    desc.textContent = p.description || '';
                    preview.style.display = 'flex';
                    update(e.clientX, e.clientY);
                    if (!raf) anim();
                });
                a.addEventListener('mousemove', e => update(e.clientX, e.clientY));
                a.addEventListener('mouseleave', () => { preview.style.display = 'none'; cancelAnimationFrame(raf); raf = null; });
            }
            list.appendChild(a);
        });
    }).catch(() => list.innerHTML = '<p class="projects-empty">Error loading projects.</p>');
}

export function setupHeightScroll(containerSelector, itemSelector, minH = 130, maxH = 200) {
    const container = document.querySelector(containerSelector);
    if (!container || isMobile) return;

    let items = [];
    const refresh = () => items = Array.from(container.querySelectorAll(itemSelector));
    const update = () => {
        const vh = window.innerHeight, halfVh = vh / 2, range = vh / 1.5;
        items.forEach(item => {
            const rect = item.getBoundingClientRect();
            if (rect.top > vh || rect.bottom < 0) return;
            const dist = Math.min(1, Math.abs(halfVh - (rect.top + rect.height / 2)) / range);
            const h = maxH - (maxH - minH) * dist;
            if (Math.abs(h - (parseFloat(item.style.height) || 0)) > 0.5) item.style.height = `${h}px`;
        });
    };

    window.addEventListener('scroll', update, { passive: true });
    new MutationObserver(refresh).observe(container, { childList: true });
    refresh(); update();
}

export function setupFeaturedProjects(ctaCursor, refreshParallax) {
    const container = document.querySelector('.featured-scatter');
    if (!container) return;

    getProjectsData().then(data => {
        const featured = (data.projects || []).filter(p => p.category === 'featured');
        if (!featured.length) { container.innerHTML = '<p class="projects-empty">No featured projects.</p>'; return; }

        const items = featured.map(p => {
            const href = resolveProjectHref(p.path);
            const a = document.createElement('a');
            a.className = 'scatter-item';
            if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            else a.setAttribute('aria-disabled', 'true');

            const img = new Image(); img.alt = p.title; img.loading = 'lazy'; img.decoding = 'async';
            img.src = p.image || `assets/images/projects/${p.id}.png`;
            img.onload = () => { img.decode ? img.decode().then(() => img.classList.add('loaded')).catch(() => img.classList.add('loaded')) : img.classList.add('loaded'); };
            img.onerror = () => img.classList.add('loaded');
            a.appendChild(img);

            if (ctaCursor) ctaCursor.attach(a, p.title, { showArrow: !!href });
            return a;
        });

        let currentCols = 0, resizeRaf = null;
        const layout = () => {
            const w = window.innerWidth, cols = w <= 480 ? 2 : (w <= 1024 ? 3 : 4);
            if (cols === currentCols) return;
            currentCols = cols;
            container.innerHTML = ''; container.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
            const columnEls = Array.from({ length: cols }, () => {
                const col = document.createElement('div'); col.className = 'scatter-column';
                container.appendChild(col); return col;
            });
            items.forEach((a, i) => columnEls[i % cols].appendChild(a));
            refreshParallax?.();
        };

        layout();
        window.addEventListener('resize', () => { if (!resizeRaf) resizeRaf = requestAnimationFrame(() => { layout(); resizeRaf = null; }); });
        window.addEventListener('load', () => refreshParallax?.());
    });
}
