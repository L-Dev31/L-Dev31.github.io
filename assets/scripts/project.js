// Case study page: project.html?id=<id> renders projects/cases/<id>.html with data from projects.json.
import { initPage, reveal, loadProjects, reducedMotion, throttled, clamp01 } from './common.js';
import { scrollyScenes } from './effects.js';

const lenis = initPage();
progressBar(lenis);
load();

async function load() {
    const id = new URLSearchParams(location.search).get('id') ?? '';
    if (!/^[\w-]+$/.test(id)) return notFound();
    try {
        const [projects, res] = await Promise.all([loadProjects(), fetch(`projects/cases/${id}.html`)]);
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
    scrollyScenes();
    callsToAction(project, cta);
    pager(project, projects);
    reveal(document.querySelectorAll('.project-cta-bottom, .project-pager, .case-gallery, .case-scene .title'));
    parallaxHero();
}

// Every link goes in the hero; all of them are repeated in the bottom section next to three preview tiles.
function callsToAction({ ctas = [], ctaImages = [] }, section) {
    const heroLinks = document.querySelector('.project-hero-links');
    if (ctas.length) {
        for (const { label, url } of ctas) {
            const heroLink = document.createElement('a');
            heroLink.className = 'project-hero-live';
            heroLink.href = url;
            heroLink.target = '_blank';
            heroLink.rel = 'noopener noreferrer';
            heroLink.textContent = `${label} →`;
            heroLinks.append(heroLink);
        }
    } else {
        heroLinks.remove();
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

// Hero image sinks slower than the page.
function parallaxHero() {
    if (reducedMotion) return;
    const heroImg = document.querySelector('.project-hero-img');
    const update = () => { heroImg.style.transform = `translateY(${scrollY * 0.3}px)`; };
    const scheduled = throttled(update);
    if (lenis) lenis.on('scroll', scheduled);
    else addEventListener('scroll', scheduled, { passive: true });
    update();
}

// Slim reading progress bar stuck to the bottom (replaces the hidden scrollbar).
function progressBar(lenis) {
    const bar = document.createElement('div');
    bar.className = 'reading-progress';
    bar.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    bar.append(fill);
    document.body.append(bar);

    const update = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        fill.style.transform = `scaleX(${max > 0 ? clamp01(scrollY / max) : 0})`;
    };
    const scheduled = throttled(update);
    if (lenis) lenis.on('scroll', scheduled);
    else addEventListener('scroll', scheduled, { passive: true });
    addEventListener('resize', scheduled, { passive: true });
    addEventListener('load', scheduled);
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
