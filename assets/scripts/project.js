// Case study page: project.html?id=<id> renders projects/Portfolio/<id>.html with data from projects.json.
import { initPage, reveal, loadProjects, reducedMotion } from './common.js';

const lenis = initPage();
load();

async function load() {
    const id = new URLSearchParams(location.search).get('id') ?? '';
    if (!/^[\w-]+$/.test(id)) return notFound();
    try {
        const [projects, res] = await Promise.all([loadProjects(), fetch(`projects/Portfolio/${id}.html`)]);
        const project = projects.find(p => p.id === id);
        if (!project || !res.ok) return notFound();
        render(project, await res.text(), projects);
    } catch {
        notFound();
    }
}

function render(project, html, projects) {
    document.title = `${project.title} — Léo Tosku`;

    const heroImg = document.querySelector('.project-hero-img');
    heroImg.src = project.heroImage;
    heroImg.alt = project.title;
    heroImg.hidden = false;

    const meta = [
        project.role && `As a ${project.role}`,
        project.date && `In ${project.date.slice(0, 4)}`,
        project.client && `For ${project.client}`,
    ].filter(Boolean).join(' · ');

    const header = document.querySelector('.article-header');
    header.innerHTML = `
        <h1 class="article-title">${escapeHtml(project.title)}</h1>
        <p class="article-subtitle">${escapeHtml(project.subtitle)}</p>
        <p class="article-meta">${escapeHtml(meta)}</p>
        <div class="article-tags">${project.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>`;
    if (reducedMotion) header.classList.add('loaded');
    else requestAnimationFrame(() => requestAnimationFrame(() => header.classList.add('loaded')));

    const cta = document.querySelector('.project-cta-bottom');
    cta.insertAdjacentHTML('beforebegin', html);
    callsToAction(project, cta);
    pager(project, projects);
    reveal(document.querySelectorAll('section, .title, .case-row'));
    if (!reducedMotion) parallax(cta);
}

// The first link goes in the hero, all of them in the bottom section next to three preview tiles.
function callsToAction({ ctas = [], ctaImages = [] }, section) {
    const heroLink = document.querySelector('.project-hero-live');
    if (ctas.length) {
        heroLink.href = ctas[0].url;
        heroLink.textContent = `${ctas[0].label} →`;
    } else {
        heroLink.remove();
    }

    if (!ctas.length && !ctaImages.length) return section.remove();

    for (const { label, url } of ctas) {
        const link = document.createElement('a');
        link.className = 'project-cta-bottom-link';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `${label} →`;
        section.querySelector('.project-cta-text').append(link);
    }

    if (!ctaImages.length) return section.querySelector('.project-cta-gallery').remove();
    section.querySelectorAll('.project-cta-tile').forEach((tile, i) => {
        if (ctaImages[i]) tile.style.backgroundImage = `url('${ctaImages[i]}')`;
    });
}

function pager(project, projects) {
    const nav = document.querySelector('.project-pager');
    const caseStudies = projects.filter(p => p.subtitle);
    const i = caseStudies.indexOf(project);
    if (i === -1 || caseStudies.length < 2) return nav.remove();

    const [prevLink, nextLink] = nav.querySelectorAll('a');
    const fill = (link, p, direction) => {
        link.href = `project.html?id=${p.id}`;
        link.setAttribute('aria-label', `${direction} project: ${p.title}`);
        link.querySelector('.project-pager-title').textContent = p.title;
        link.querySelector('.project-pager-role').textContent = p.role;
        link.querySelector('.project-pager-img').style.backgroundImage = `url('${p.heroImage}')`;
    };
    fill(prevLink, caseStudies.at(i - 1), 'Previous');
    fill(nextLink, caseStudies[(i + 1) % caseStudies.length], 'Next');
    nav.hidden = false;
}

// Hero image sinks slower than the page, case study images and CTA tiles drift around the viewport centre.
function parallax(cta) {
    const heroImg = document.querySelector('.project-hero-img');
    const tiles = [...document.querySelectorAll('.project-cta-tile')];
    const panels = [...document.querySelectorAll('.case-panel:not([data-no-parallax])')]
        .map(panel => panel.querySelector('img'))
        .filter(Boolean);
    const offsetFromCenter = el => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 - innerHeight / 2;
    };

    const update = () => {
        heroImg.style.transform = `translateY(${scrollY * 0.3}px)`;
        if (tiles.length) {
            const offset = offsetFromCenter(cta);
            tiles.forEach(tile => tile.style.transform = `translateY(${offset * tile.dataset.speed}px)`);
        }
        panels.forEach(img => img.style.transform = `translateY(${offsetFromCenter(img.parentElement) * -0.06}px)`);
    };

    if (lenis) lenis.on('scroll', update);
    else addEventListener('scroll', update, { passive: true });
    update();
}

function notFound() {
    document.title = 'Project not found — Léo Tosku';
    document.querySelector('.project-main').innerHTML =
        '<div class="project-not-found"><p>Project not found.</p><a href="index.html">← Back</a></div>';
}

function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
