import { isMobile, prefersReducedMotion, getProjectsData } from './utils.js';

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
        const projects = (data.projects || []).filter(p => p.category === 'web');
        if (!projects.length) { list.innerHTML = '<p class="projects-empty">No projects.</p>'; return; }

        projects.forEach(p => {
            const a = document.createElement('a');
            a.className = 'featured-project';
            a.href = `project.html?id=${p.id}`;

            const tagsHtml = p.tags && p.tags.length > 0
                ? p.tags.map(tag => `<span class="featured-tag">${tag}</span>`).join('')
                : '';

            a.innerHTML = `
                <div class="featured-project-info">
                    <span class="featured-project-title">${p.title}</span>
                    <div class="featured-project-tags">${tagsHtml}</div>
                </div>
                <span class="featured-meta">
                    ${p.creator?.trim() ? `<span class="featured-slot"><span class="featured-author">${p.creator}</span></span>` : ''}
                </span>`;

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
        const categories = ['All', 'Design', 'Web', 'Photography', 'Tools', 'Video Games'];

        const featured = (data.projects || []).filter(p => categories.includes(p.category));

        if (!featured.length) { container.innerHTML = '<p class="projects-empty">No featured projects.</p>'; return; }

        const filtersContainer = document.createElement('div');
        filtersContainer.className = 'featured-filters';
        container.before(filtersContainer);

        const projectItems = featured.map(p => {
            const a = document.createElement('a');
            a.className = 'scatter-item';
            a.href = `project.html?id=${p.id}`;
            a.dataset.category = p.category;
            if (p.date) a.dataset.date = p.date;

            const img = new Image(); img.alt = p.title; img.loading = 'lazy'; img.decoding = 'async';
            img.src = p.image || `assets/images/projects/${p.id}.png`;
            img.onload = () => img.classList.add('loaded');
            img.onerror = () => img.classList.add('loaded');
            a.appendChild(img);

            if (ctaCursor) ctaCursor.attach(a, p.title, { showArrow: true });
            return a;
        });

        let currentCategory = 'All';
        let currentCols = 0, resizeRaf = null;

        const renderGrid = (force = false) => {
            const cols = window.innerWidth <= 480 ? 2 : (window.innerWidth <= 1024 ? 3 : 4);
            if (!force && cols === currentCols) return;
            currentCols = cols;

            container.innerHTML = '';
            container.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
            const columnEls = Array.from({ length: cols }, () => {
                const col = document.createElement('div');
                col.className = 'scatter-column';
                container.appendChild(col);
                return col;
            });

            const filtered = currentCategory === 'All'
                ? [...projectItems].sort((a, b) => {
                    const da = a.dataset.date ? new Date(a.dataset.date).getTime() : 0;
                    const db = b.dataset.date ? new Date(b.dataset.date).getTime() : 0;
                    return db - da;
                })
                : projectItems.filter(el => el.dataset.category === currentCategory);
            filtered.forEach((el, i) => columnEls[i % cols].appendChild(el));
            refreshParallax?.();
        };

        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${cat === 'All' ? 'active' : ''}`;
            btn.textContent = cat;
            btn.type = 'button';

            btn.addEventListener('click', () => {
                if (currentCategory === cat) return;
                filtersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                container.classList.add('filtering');
                setTimeout(() => {
                    currentCategory = cat;
                    renderGrid(true);
                    container.classList.remove('filtering');
                }, 350);
            });

            filtersContainer.appendChild(btn);
        });

        renderGrid(true);
        window.addEventListener('resize', () => { if (!resizeRaf) resizeRaf = requestAnimationFrame(() => { renderGrid(false); resizeRaf = null; }); });
        window.addEventListener('load', () => refreshParallax?.());
    });
}
