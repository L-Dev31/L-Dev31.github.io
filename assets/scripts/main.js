// Home and about pages.
import { initPage, reveal, loadProjects, throttled, breakpoint, reducedMotion } from './common.js';
import { scrubbingText, parallax, scrollScrubbedVideo, ctaCursor, liquidHero } from './effects.js';

// ─── Shared constants ─────────────────────────────────────────────────────────
const CATEGORIES = ['Design', 'UI/UX', 'Web', 'Marketting', 'Photography', 'Tools', 'Video Games'];

initPage();
const refreshParallax = parallax();
scrubbingText();
scrollScrubbedVideo();
liquidHero();
reveal(document.querySelectorAll('section, .title'));

// ─── Perlin Displacement (canvas-based, no deps) ───────────────────────────────
const PerlinDisplacement = (() => {
    // Minimal 2D Perlin noise (Ken Perlin's improved algorithm, ~1KB)
    const p = new Uint8Array(512);
    const perm = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
    for (let i = 0; i < 256; i++) { p[i] = p[i + 256] = perm[i]; }

    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    const grad = (hash, x, y) => {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    };

    function noise2D(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = fade(x), v = fade(y);
        const A = p[X] + Y, B = p[X + 1] + Y;
        return lerp(lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
                    lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), v);
    }

    function fractalNoise(x, y, octaves = 3, persistence = 0.5, scale = 1) {
        let value = 0, amplitude = 1, frequency = scale, maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            value += amplitude * noise2D(x * frequency, y * frequency);
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return value / maxValue;
    }

    // Displace an image using perlin noise
    function displaceImage(srcImg, canvas, options = {}) {
        const {
            scale = 0.008,
            strength = 8,
            octaves = 3,
            time = 0,
            speed = 0.0003
        } = options;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const w = canvas.width = srcImg.naturalWidth || srcImg.width;
        const h = canvas.height = srcImg.naturalHeight || srcImg.height;

        ctx.drawImage(srcImg, 0, 0);
        const srcData = ctx.getImageData(0, 0, w, h);
        const dstData = ctx.createImageData(w, h);
        const srcPixels = srcData.data;
        const dstPixels = dstData.data;

        const t = time * speed;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const nx = x * scale + t;
                const ny = y * scale;
                const dx = fractalNoise(nx, ny, octaves) * strength;
                const dy = fractalNoise(nx + 1000, ny, octaves) * strength;
                const sx = Math.min(Math.max(Math.round(x + dx), 0), w - 1);
                const sy = Math.min(Math.max(Math.round(y + dy), 0), h - 1);
                const si = (sy * w + sx) * 4;
                const di = (y * w + x) * 4;
                dstPixels[di] = srcPixels[si];
                dstPixels[di + 1] = srcPixels[si + 1];
                dstPixels[di + 2] = srcPixels[si + 2];
                dstPixels[di + 3] = srcPixels[si + 3];
            }
        }
        ctx.putImageData(dstData, 0, 0);
        return canvas;
    }

    return { noise2D, fractalNoise, displaceImage };
})();

// Export for use in ProjectCarousel
export { PerlinDisplacement };

// ─── Project Grid (Desktop) ───────────────────────────────────────────────────
class ProjectGrid {
    constructor(container, projects, ctaCursor) {
        this.container = container;
        this.projects = projects.filter(p => CATEGORIES.includes(p.category));
        this.ctaCursor = ctaCursor;
        this.category = 'All';
        this.columns = 0;
        this.cards = [];
        this.filtersEl = null;
        this.resizeHandler = null;
    }

    mount() {
        this.buildCards();
        this.render();
        this.bindResize();
    }

    unmount() {
        this.filtersEl?.remove();
        this.container.replaceChildren();
        this.container.style.gridTemplateColumns = '';
        this.unbindResize();
    }

    buildCards() {
        this.cards = this.projects.map(project => {
            const card = document.createElement('a');
            card.className = 'scatter-item';
            card.href = `project.html?id=${project.id}`;
            card.setAttribute('aria-label', `View ${project.title}, ${project.category} project`);

            const img = new Image();
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.onload = img.onerror = () => img.classList.add('loaded');
            img.src = `assets/images/projects/${project.id}.png`;

            const details = document.createElement('span');
            details.className = 'scatter-item-details';
            const titleEl = document.createElement('strong');
            titleEl.textContent = project.title;
            const catEl = document.createElement('span');
            catEl.textContent = project.category;
            details.append(titleEl, catEl);

            card.append(img, details);
            this.ctaCursor?.attach(card, project.title);
            return { project, card };
        });
    }

    columnCount() {
        const w = innerWidth;
        return w < 360 ? 1 : w <= 600 ? 2 : w <= 1024 ? 3 : 4;
    }

    render() {
        this.columns = this.columnCount();
        const cols = Array.from({ length: this.columns }, (_, i) => {
            const col = document.createElement('div');
            col.className = 'scatter-column';
            col.dataset.parallaxSpeed = i % 2 ? 102 : 98;
            return col;
        });

        this.cards
            .filter(({ project }) => this.category === 'All' || project.category === this.category)
            .forEach(({ card }, i) => cols[i % this.columns].append(card));

        this.container.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`;
        this.container.replaceChildren(...cols);
        this.container.style.display = '';
    }

    setCategory(category) {
        if (category === this.category) return;
        this.category = category;
        this.container.classList.add('filtering');
        setTimeout(() => {
            this.render();
            this.container.classList.remove('filtering');
        }, 350);
    }

    buildFilters() {
        this.filtersEl?.remove();
        const filters = document.createElement('div');
        filters.className = 'featured-filters';
        filters.setAttribute('aria-label', 'Filter projects');

        const activeCategories = ['All', ...CATEGORIES.filter(c => this.projects.some(p => p.category === c))];
        for (const name of activeCategories) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = name === 'All' ? 'filter-btn active' : 'filter-btn';
            button.setAttribute('aria-pressed', String(name === 'All'));
            button.textContent = name;
            button.addEventListener('click', () => {
                const active = filters.querySelector('.active');
                active?.classList.remove('active');
                active?.setAttribute('aria-pressed', 'false');
                button.classList.add('active');
                button.setAttribute('aria-pressed', 'true');
                button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                this.setCategory(name);
            });
            filters.append(button);
        }
        this.container.before(filters);
        this.filtersEl = filters;
    }

    bindResize() {
        this.resizeHandler = throttled(() => {
            const newColumns = this.columnCount();
            if (newColumns !== this.columns) this.render();
        });
        addEventListener('resize', this.resizeHandler, { passive: true });
    }

    unbindResize() {
        this.resizeHandler && removeEventListener('resize', this.resizeHandler);
    }
}

// ─── Project Carousel (Mobile) ────────────────────────────────────────────────
class ProjectCarousel {
    constructor(section, projects) {
        this.section = section;
        this.projects = projects.filter(p => CATEGORIES.includes(p.category));
        this.wrapper = null;
        this.carousel = null;
        this.nav = null;
        this.navBtns = [];
        this.observer = null;
        this.startX = 0;
    }

    mount() {
        this.render();
        this.bindEvents();
        this.syncNav(0);
    }

    unmount() {
        this.observer?.disconnect();
        this.carousel?.removeEventListener('touchstart', this.onTouchStart);
        this.carousel?.removeEventListener('touchend', this.onTouchEnd);
        this.wrapper?.remove();
        this.wrapper = this.carousel = this.nav = null;
    }

    render() {
        // Hide the scatter grid
        const grid = this.section.querySelector('.featured-scatter');
        if (grid) grid.style.display = 'none';

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'mob-carousel-section';

        this.carousel = document.createElement('div');
        this.carousel.className = 'mob-carousel';
        this.carousel.setAttribute('role', 'list');
        // CSS scroll-snap handles the "page per card" behavior
        this.carousel.style.scrollSnapType = 'x mandatory';

        this.nav = document.createElement('nav');
        this.nav.className = 'mob-nav';
        this.nav.setAttribute('aria-label', 'Project navigation');

        this.projects.forEach((project, idx) => {
            const paddedIndex = String(idx + 1).padStart(3, '0');

            // Card
            const card = document.createElement('article');
            card.className = 'mob-card';
            card.setAttribute('role', 'listitem');
            card.setAttribute('aria-label', project.title);
            card.style.scrollSnapAlign = 'start';

            // Image - use canvas for perlin displacement
            const imgUrl = `assets/images/projects/${project.id}.png`;
            const canvas = document.createElement('canvas');
            canvas.className = 'mob-card-img';
            canvas.setAttribute('aria-hidden', 'true');
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';

            // Load image and apply displacement
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
                this.applyDisplacement(canvas, img, idx);
                this.startDisplacementLoop(canvas, img, idx);
            };
            img.src = imgUrl;

            // Body
            const body = document.createElement('div');
            body.className = 'mob-card-body';

            const meta = document.createElement('p');
            meta.className = 'mob-card-meta';
            meta.textContent = `${paddedIndex} · ${(project.category || '').toUpperCase()}`;

            const titleEl = document.createElement('h3');
            titleEl.className = 'mob-card-title';
            titleEl.textContent = project.title;

            const year = project.date ? project.date.slice(0, 4) : '';
            const roleEl = document.createElement('p');
            roleEl.className = 'mob-card-role';
            roleEl.textContent = [project.role, year].filter(Boolean).join(' · ');

            const desc = document.createElement('p');
            desc.className = 'mob-card-desc';
            desc.textContent = project.subtitle || project.lede || '';

            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'mob-card-tags';
            (project.tags || []).slice(0, 5).forEach(tag => {
                const pill = document.createElement('span');
                pill.textContent = tag;
                tagsDiv.append(pill);
            });

            const cta = document.createElement('a');
            cta.className = 'mob-card-cta';
            cta.href = `project.html?id=${project.id}`;
            cta.textContent = 'VIEW PROJECT →';
            cta.setAttribute('aria-label', `View project: ${project.title}`);

            body.append(meta, titleEl, roleEl, desc, tagsDiv, cta);
            card.append(canvas, body);
            this.carousel.append(card);

            // Nav dot
            const btn = document.createElement('button');
            btn.className = idx === 0 ? 'mob-nav-btn active' : 'mob-nav-btn';
            btn.type = 'button';
            btn.setAttribute('aria-label', `Go to project ${idx + 1}: ${project.title}`);
            btn.addEventListener('click', () => this.scrollToIndex(idx));
            this.navBtns.push(btn);
            this.nav.append(btn);
        });

        this.wrapper.append(this.carousel, this.nav);
        this.section.append(this.wrapper);

        // IntersectionObserver: update active nav pill as user swipes
        this.observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const idx = [...this.carousel.children].indexOf(entry.target);
                if (idx >= 0) this.syncNav(idx);
            }
        }, { root: this.carousel, threshold: 0.6 }); // 60% = more reliable on mobile

        [...this.carousel.children].forEach(card => this.observer.observe(card));
    }

    bindEvents() {
        this.onTouchStart = e => { this.startX = e.touches[0].clientX; };
        this.onTouchEnd = e => {
            const dx = e.changedTouches[0].clientX - this.startX;
            if (Math.abs(dx) > 50) {
                const current = this.navBtns.findIndex(b => b.classList.contains('active'));
                this.scrollToIndex(current + (dx < 0 ? 1 : -1));
            }
        };
        this.carousel.addEventListener('touchstart', this.onTouchStart, { passive: true });
        this.carousel.addEventListener('touchend', this.onTouchEnd, { passive: true });
    }

    // Perlin displacement on card images
    applyDisplacement(canvas, img, cardIdx) {
        if (reducedMotion) return;
        PerlinDisplacement.displaceImage(img, canvas, {
            scale: 0.006,
            strength: 6,
            octaves: 3,
            time: cardIdx * 1000 // offset each card
        });
    }

    startDisplacementLoop(canvas, img, cardIdx) {
        if (reducedMotion) return;
        let frame = 0;
        const animate = () => {
            if (!document.body.contains(canvas)) return; // stop if unmounted
            PerlinDisplacement.displaceImage(img, canvas, {
                scale: 0.006,
                strength: 6,
                octaves: 3,
                time: frame + cardIdx * 1000,
                speed: 0.00015
            });
            frame++;
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    syncNav(newIdx) {
        newIdx = Math.max(0, Math.min(newIdx, this.projects.length - 1));
        const activeBtn = this.navBtns[newIdx];
        if (!activeBtn) return;

        // Calculate pill position based on active button
        const navRect = this.nav.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        const left = btnRect.left - navRect.left;
        const width = btnRect.width;

        // Update CSS custom properties for sliding pill
        this.nav.style.setProperty('--pill-left', `${left}px`);
        this.nav.style.setProperty('--pill-width', `${width}px`);

        // Update active state
        this.navBtns.forEach((b, i) => {
            b.classList.toggle('active', i === newIdx);
        });
    }

    scrollToIndex(idx) {
        idx = Math.max(0, Math.min(idx, this.projects.length - 1));
        this.carousel.scrollTo({ left: idx * this.carousel.clientWidth, behavior: 'smooth' });
    }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
let grid = null;
let carousel = null;
let cta = null;

function toggleGrid(show) {
    const gridEl = document.querySelector('.featured-scatter');
    const filtersEl = document.querySelector('.featured-filters');
    if (gridEl) gridEl.style.display = show ? '' : 'none';
    if (filtersEl) filtersEl.style.display = show ? '' : 'none';
}

async function initProjects() {
    const allProjects = await loadProjects();
    cta = ctaCursor();

    const gridContainer = document.querySelector('.featured-scatter');
    const section = document.getElementById('featured-projects');
    if (!gridContainer || !section) return;

    grid = new ProjectGrid(gridContainer, allProjects, cta);
    carousel = new ProjectCarousel(section, allProjects);

    // Initial mount based on current breakpoint
    const isMobile = breakpoint.isMobile;
    console.log('[DEBUG] breakpoint:', breakpoint.current, 'isMobile:', isMobile, 'innerWidth:', innerWidth);
    if (isMobile) {
        carousel.mount();
        toggleGrid(false);
    } else {
        grid.mount();
        grid.buildFilters();
        toggleGrid(true);
    }

    // React to breakpoint changes (not raw resize)
    breakpoint.onChange(bp => {
        const nowMobile = bp === 'mobile';
        console.log('[DEBUG] breakpoint change:', bp);
        if (nowMobile) {
            grid.unmount();
            carousel.mount();
            toggleGrid(false);
        } else {
            carousel.unmount();
            grid.mount();
            grid.buildFilters();
            toggleGrid(true);
        }
    });
}

initProjects();