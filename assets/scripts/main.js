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

// Home: masonry grid of case studies with category filters.
function projectGrid() {
    const grid = document.querySelector('.featured-scatter');
    if (!grid) return;
    const CATEGORIES = ['Design', 'UI/UX', 'Web', 'Photography', 'Tools', 'Video Games'];
    const cta = ctaCursor();

    loadProjects().then(projects => {
        projects = projects.filter(p => CATEGORIES.includes(p.category));
        let category = 'All';
        let columns = 0;

        const cards = projects.map(project => {
            const card = document.createElement('a');
            card.className = 'scatter-item';
            card.href = `project.html?id=${project.id}`;
            const img = new Image();
            img.alt = project.title;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.onload = img.onerror = () => img.classList.add('loaded');
            img.src = `assets/images/projects/${project.id}.png`;
            card.append(img);
            cta?.attach(card, project.title);
            return { project, card };
        });

        const columnCount = () => innerWidth <= 480 ? 2 : innerWidth <= 1024 ? 3 : 4;

        // Deal the cards round-robin into columns; odd columns drift slightly against the scroll.
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
            refreshParallax();
        };

        const filters = document.createElement('div');
        filters.className = 'featured-filters';
        for (const name of ['All', ...CATEGORIES.filter(c => projects.some(p => p.category === c))]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = name === 'All' ? 'filter-btn active' : 'filter-btn';
            button.textContent = name;
            button.addEventListener('click', () => {
                if (name === category) return;
                filters.querySelector('.active').classList.remove('active');
                button.classList.add('active');
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
        addEventListener('resize', throttled(() => {
            if (columnCount() !== columns) render();
        }));
    });
}
