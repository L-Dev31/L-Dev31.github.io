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
    legal: [
        ['#legal-notice', 'Legal notice'],
        ['#demos', 'Demo projects'],
        ['#privacy', 'Privacy'],
        ['#cookies', 'Cookies'],
        ['#accessibility', 'Accessibility'],
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

const templates = new Map();

function template(name) {
    if (!templates.has(name)) {
        templates.set(name, loadComponent(name).then(html => {
            const node = document.createElement('template');
            node.innerHTML = html;
            return node;
        }));
    }
    return templates.get(name);
}

async function hydrate(root) {
    const placeholders = [...root.querySelectorAll('site-navbar, site-footer, site-page-loader, site-socials')];
    await Promise.all(placeholders.map(async placeholder => {
        const name = placeholder.localName.slice('site-'.length);
        const content = (await template(name)).content.cloneNode(true);
        if (name === 'navbar') {
            const brand = content.querySelector('.brand a');
            if (placeholder.dataset.page === 'home') brand.href = '#header';
            renderSections(content.querySelector('.section-nav'), placeholder.dataset.page);
        }
        if (name === 'socials') {
            const nav = document.createElement('nav');
            nav.className = placeholder.dataset.class ?? '';
            nav.setAttribute('aria-label', placeholder.dataset.label ?? 'Social links');
            nav.append(content);
            placeholder.replaceWith(nav);
            return;
        }
        await hydrate(content);
        placeholder.replaceWith(content);
    }));
}

const socials = await template('socials');
export const socialLinks = () => socials.content.cloneNode(true);

await hydrate(document);
