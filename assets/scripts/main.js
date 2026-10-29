// Home and about pages.
import { initPage, reveal, loadProjects, throttled } from './common.js';
import { scrubbingText, parallax, scrollScrubbedVideo, ctaCursor, liquidHero } from './effects.js';

initPage();
const refreshParallax = parallax();
scrubbingText();
scrollScrubbedVideo();
liquidHero();
reveal(document.querySelectorAll('section, .title'));
projectGrid();

// Home: project grid — masonry on desktop, swipeable card carousel on mobile.
function projectGrid() {
    const grid = document.querySelector('.featured-scatter');
    if (!grid) return;
    const CATEGORIES = ['Design', 'UI/UX', 'Web', 'Marketting', 'Photography', 'Tools', 'Video Games'];
    const cta = ctaCursor();

    loadProjects().then(allProjects => {
        const projects = allProjects.filter(p => CATEGORIES.includes(p.category));

        if (window.innerWidth <= 768) {
            buildMobileCarousel(projects, grid);
        } else {
            buildDesktopGrid(projects, grid, cta);
        }

        addEventListener('resize', throttled(() => {
            const isMob = window.innerWidth <= 768;
            const hasCarousel = !!document.querySelector('.mob-carousel-section');
            if (isMob && !hasCarousel) {
                // switched to mobile — tear down desktop, build carousel
                const existingFilters = document.querySelector('.featured-filters');
                existingFilters?.remove();
                grid.replaceChildren();
                grid.style.gridTemplateColumns = '';
                buildMobileCarousel(projects, grid);
            } else if (!isMob && hasCarousel) {
                // switched to desktop — tear down carousel, build grid
                document.querySelector('.mob-carousel-section')?.remove();
                document.querySelector('.mob-nav')?.remove();
                grid.style.display = '';
                buildDesktopGrid(projects, grid, cta);
            }
        }));
    });
}

// ── Desktop: masonry scatter grid with category filters ──────────────────────
function buildDesktopGrid(projects, grid, cta) {
    const CATEGORIES = ['Design', 'UI/UX', 'Web', 'Marketting', 'Photography', 'Tools', 'Video Games'];
    let category = 'All';
    let columns = 0;

    const cards = projects.map(project => {
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
        cta?.attach(card, project.title);
        return { project, card };
    });

    const columnCount = () => innerWidth < 360 ? 1 : innerWidth <= 600 ? 2 : innerWidth <= 1024 ? 3 : 4;

    const render = () => {
        columns = columnCount();
        const cols = Array.from({ length: columns }, (_, i) => {
            const col = document.createElement('div');
            col.className = 'scatter-column';
            col.dataset.parallaxSpeed = i % 2 ? 102 : 98;
            return col;
        });
        cards
            .filter(({ project }) => category === 'All' || project.category === category)
            .forEach(({ card }, i) => cols[i % columns].append(card));
        grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
        grid.replaceChildren(...cols);
    };

    // Remove any lingering carousel
    document.querySelector('.mob-carousel-section')?.remove();
    document.querySelector('.mob-nav')?.remove();
    grid.style.display = '';

    // Remove any existing filter bar before creating a new one
    document.querySelector('.featured-filters')?.remove();

    const filters = document.createElement('div');
    filters.className = 'featured-filters';
    filters.setAttribute('aria-label', 'Filter projects');
    for (const name of ['All', ...CATEGORIES.filter(c => projects.some(p => p.category === c))]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = name === 'All' ? 'filter-btn active' : 'filter-btn';
        button.setAttribute('aria-pressed', String(name === 'All'));
        button.textContent = name;
        button.addEventListener('click', () => {
            if (name === category) return;
            const active = filters.querySelector('.active');
            active.classList.remove('active');
            active.setAttribute('aria-pressed', 'false');
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');
            button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            grid.classList.add('filtering');
            setTimeout(() => {
                category = name;
                render();
                grid.classList.remove('filtering');
            }, 350);
        });
        filters.append(button);
    }
    grid.before(filters);
    render();
}

// ── Mobile: full-screen swipeable card carousel ──────────────────────────────
function buildMobileCarousel(projects, grid) {
    // Hide the scatter grid while the carousel is showing
    grid.style.display = 'none';

    const section = document.getElementById('featured-projects');

    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'mob-carousel-section';

    // Carousel track
    const carousel = document.createElement('div');
    carousel.className = 'mob-carousel';
    carousel.setAttribute('role', 'list');

    // Nav strip (sticky at the bottom of the section)
    const nav = document.createElement('div');
    nav.className = 'mob-nav';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Projects');

    const navBtns = [];

    projects.forEach((project, idx) => {
        const paddedIndex = String(idx + 1).padStart(3, '0');

        // Card
        const card = document.createElement('article');
        card.className = 'mob-card';
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label', project.title);

        // Image
        const imgDiv = document.createElement('div');
        imgDiv.className = 'mob-card-img';
        imgDiv.style.backgroundImage = `url(assets/images/projects/${project.id}.png)`;
        imgDiv.setAttribute('aria-hidden', 'true');

        // Body
        const body = document.createElement('div');
        body.className = 'mob-card-body';

        // Meta: e.g. "001 · DESIGN"
        const meta = document.createElement('p');
        meta.className = 'mob-card-meta';
        meta.textContent = `${paddedIndex} · ${(project.category || '').toUpperCase()}`;

        // Title
        const titleEl = document.createElement('h3');
        titleEl.className = 'mob-card-title';
        titleEl.textContent = project.title;

        // Role · date (year only)
        const year = project.date ? project.date.slice(0, 4) : '';
        const roleEl = document.createElement('p');
        roleEl.className = 'mob-card-role';
        roleEl.textContent = [project.role, year].filter(Boolean).join(' · ');

        // Short description
        const desc = document.createElement('p');
        desc.className = 'mob-card-desc';
        desc.textContent = project.subtitle || project.lede || '';

        // Tags
        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'mob-card-tags';
        (project.tags || []).slice(0, 5).forEach(tag => {
            const pill = document.createElement('span');
            pill.textContent = tag;
            tagsDiv.append(pill);
        });

        // CTA button
        const cta = document.createElement('a');
        cta.className = 'mob-card-cta';
        cta.href = `project.html?id=${project.id}`;
        cta.textContent = 'VIEW PROJECT →';
        cta.setAttribute('aria-label', `View project: ${project.title}`);

        body.append(meta, titleEl, roleEl, desc, tagsDiv, cta);
        card.append(imgDiv, body);
        carousel.append(card);

        // Nav button
        const btn = document.createElement('button');
        btn.className = idx === 0 ? 'mob-nav-btn active' : 'mob-nav-btn';
        btn.type = 'button';
        btn.textContent = project.title;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(idx === 0));
        btn.setAttribute('aria-label', `Go to project: ${project.title}`);
        btn.addEventListener('click', () => {
            carousel.scrollTo({ left: idx * carousel.clientWidth, behavior: 'smooth' });
        });
        navBtns.push(btn);
        nav.append(btn);
    });

    wrapper.append(carousel, nav);
    section.append(wrapper);

    // IntersectionObserver: update active nav pill as user swipes
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const idx = [...carousel.children].indexOf(entry.target);
            if (idx < 0) continue;
            navBtns.forEach((b, i) => {
                const active = i === idx;
                b.classList.toggle('active', active);
                b.setAttribute('aria-selected', String(active));
            });
            // Scroll the active nav pill into view
            navBtns[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, { root: carousel, threshold: 0.5 });

    [...carousel.children].forEach(card => observer.observe(card));
}
