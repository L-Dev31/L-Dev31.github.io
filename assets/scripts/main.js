// Home and about pages.
import { initPage, reveal, loadProjects, throttled, breakpoint } from './common.js';
import { scrubbingText, parallax, scrollScrubbedVideo, ctaCursor, liquidHero } from './effects.js';

// ─── Shared constants ─────────────────────────────────────────────────────────
const CATEGORIES = ['Design', 'UI/UX', 'Web', 'Marketting', 'Photography', 'Tools', 'Video Games'];

initPage();
const refreshParallax = parallax();
scrubbingText();
scrollScrubbedVideo();
liquidHero();
reveal(document.querySelectorAll('section, .title'));

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
// A full-screen horizontal scroller: one project per screen, dots at the bottom.
class ProjectCarousel {
    constructor(section, projects) {
        this.section = section;
        this.projects = projects.filter(p => CATEGORIES.includes(p.category));
        this.wrapper = this.carousel = this.dots = null;
        this.observer = null;
    }

    mount() {
        const el = (tag, cls, text) => {
            const n = document.createElement(tag);
            n.className = cls;
            if (text) n.textContent = text;
            return n;
        };
        this.wrapper = el('div', 'mob-carousel-section');
        // One View project button for the whole showcase: fixed on screen, its link follows the active project
        this.cta = el('a', 'mob-card-cta');
        this.cta.append(el('i', 'mob-glow'), el('i', 'mob-glow'), el('span', '', 'View project'));
        this.carousel = el('div', 'mob-carousel');
        this.carousel.setAttribute('role', 'list');
        this.dots = el('nav', 'mob-dots');
        this.dots.setAttribute('aria-label', 'Project navigation');

        this.projects.forEach((project, i) => {
            const card = el('article', 'mob-card');
            card.setAttribute('role', 'listitem');
            card.setAttribute('aria-label', project.title);

            // Top part: image, with the title over a black-to-transparent fade
            const top = el('div', 'mob-card-top');
            const img = el('img', 'mob-card-img');
            img.src = `assets/images/projects/${project.id}.png`;
            img.alt = '';
            img.decoding = 'async';
            if (i > 0) img.loading = 'lazy';
            top.append(img, el('div', 'mob-smoke'), el('h3', 'mob-card-title', project.title));

            // Bottom part: role, description, tags, button
            const bottom = el('div', 'mob-card-bottom');
            const year = project.date ? project.date.slice(0, 4) : '';
            const role = el('p', 'mob-card-role', [project.role, year].filter(Boolean).join(' · '));
            const tags = el('div', 'mob-card-tags');
            (project.tags || []).slice(0, 5).forEach(t => tags.append(el('span', '', t)));
            bottom.append(role, el('p', 'mob-card-desc', project.subtitle || project.lede || ''), tags);

            card.append(top, bottom);
            this.carousel.append(card);

            const dot = el('button', i === 0 ? 'mob-dot active' : 'mob-dot');
            dot.type = 'button';
            dot.setAttribute('aria-label', `Project ${i + 1}: ${project.title}`);
            dot.addEventListener('click', () => this.carousel.scrollTo({ left: i * this.carousel.clientWidth, behavior: 'smooth' }));
            this.dots.append(dot);
        });

        this.wrapper.append(this.carousel, this.cta, this.dots);
        this.setActive(0);
        this.section.append(this.wrapper);

        // The dot of the card that is mostly in view is the active one
        this.observer = new IntersectionObserver(entries => {
            for (const e of entries) {
                const on = e.intersectionRatio >= 0.6;
                e.target.classList.toggle('is-active', on);
                if (!on) continue;
                const i = [...this.carousel.children].indexOf(e.target);
                this.setActive(i);
            }
        }, { root: this.carousel, threshold: 0.6 });
        [...this.carousel.children].forEach(c => this.observer.observe(c));
    }

    setActive(i) {
        [...this.dots.children].forEach((d, k) => d.classList.toggle('active', k === i));
        const p = this.projects[i];
        this.cta.href = `project.html?id=${p.id}`;
        this.cta.setAttribute('aria-label', `View project: ${p.title}`);
    }

    unmount() {
        this.observer?.disconnect();
        this.wrapper?.remove();
        this.wrapper = this.carousel = this.dots = null;
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