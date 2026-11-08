const sections = {
    home: [
        ['#selected-projects', 'Selected'],
        ['#all-projects', 'All projects'],
        ['#promise', 'What to expect'],
    ],
    about: [
        ['#my-story', 'About me'],
        ['#experience', 'Experience'],
        ['#education', 'Education'],
        ['#journey', 'Journey'],
    ],
    culture: [
        ['#films', 'Films', 'films'],
        ['#series', 'Series', 'series'],
        ['#anime', 'Anime', 'anime'],
        ['#games', 'Games', 'games'],
        ['#books', 'Books', 'books'],
        ['#travels', 'Travels', 'travels'],
    ],
};

async function loadComponent(name) {
    const response = await fetch(new URL(`../components/${name}.html`, import.meta.url));
    if (!response.ok) throw new Error(`Could not load ${name} component`);
    return response.text();
}

function renderSections(nav, page) {
    if (!nav) return;
    if (page === 'culture-all') {
        nav.remove();
        return;
    }
    for (const [href, label, count] of sections[page] ?? []) {
        const link = document.createElement('a');
        link.href = href;
        link.append(label);
        if (count) {
            const value = document.createElement('span');
            value.dataset.count = count;
            link.append(' ', value);
        }
        nav.append(link);
    }
}

const placeholders = [...document.querySelectorAll('site-navbar, site-footer, site-page-loader')];
await Promise.all(placeholders.map(async placeholder => {
    const name = placeholder.localName.slice('site-'.length);
    const template = document.createElement('template');
    template.innerHTML = await loadComponent(name);
    if (name === 'navbar') {
        const page = placeholder.dataset.page;
        const brand = template.content.querySelector('.brand a');
        if (page === 'home') brand.href = '#header';
        renderSections(template.content.querySelector('.section-nav'), page);
    }
    placeholder.replaceWith(template.content);
}));