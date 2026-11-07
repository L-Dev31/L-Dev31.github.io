import { initPage, reveal, loadProjects, reducedMotion, throttled, clamp01, breakpoint, track, heroEntrance } from './common.js';
import { scrollyScenes } from './effects.js';
import { thread, restDocks } from './showcase.js';

const isMobile = breakpoint.isMobile;

const lenis = initPage();
thread(restDocks());
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
    updateSearchMetadata(project);

    const heroImg = document.querySelector('.project-hero-img');
    heroImg.src = project.heroImage;
    heroImg.alt = project.title;
    heroImg.hidden = false;
    track(project.heroImage, heroImg.decode().catch(() => {}));

    const details = [
        project.role && `As a ${project.role}`,
        project.date && `In ${project.date.slice(0, 4)}`,
        project.client && `For ${project.client}`,
    ].filter(Boolean);

    const header = document.querySelector('.article-header');
    const title = document.createElement('h1');
    title.className = 'article-title';
    title.textContent = project.title;

    const subtitle = document.createElement('p');
    subtitle.className = 'article-subtitle';
    subtitle.textContent = project.subtitle;

    const meta = document.createElement('p');
    meta.className = 'article-meta';
    meta.textContent = details.join(' · ');

    const tags = document.createElement('div');
    tags.className = 'article-tags';
    for (const label of project.tags ?? []) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = label;
        tags.append(tag);
    }
    header.replaceChildren(title, subtitle, meta, tags);

    if (reducedMotion) header.classList.add('loaded');
    else heroEntrance.then(() => requestAnimationFrame(() => header.classList.add('loaded')));

    const cta = document.querySelector('.project-cta-bottom');
    cta.insertAdjacentHTML('beforebegin', html);
    scrollyScenes();
    callsToAction(project, cta);
    pager(project, projects);
    reveal(document.querySelectorAll('.project-cta-bottom, .project-pager, .case-gallery, .case-scene .title'));
    parallaxHero();
}

function updateSearchMetadata(project) {
    const url = new URL(`project.html?id=${encodeURIComponent(project.id)}`, location.origin).href;
    const image = new URL(project.heroImage, location.href).href;
    const description = (project.subtitle || `Case study: ${project.title} by Léo Tosku.`).slice(0, 160);

    document.querySelector('link[rel="canonical"]').href = url;
    document.querySelector('meta[name="description"]').content = description;
    setMeta('property', 'og:title', `${project.title} — Léo Tosku`);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', image);
    setMeta('name', 'twitter:title', `${project.title} — Léo Tosku`);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', image);

    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: project.title,
        description,
        url,
        image,
        dateCreated: project.date,
        creator: { '@type': 'Person', name: 'Léo Tosku', url: 'https://l-dev31.github.io/' },
        keywords: project.tags?.join(', '),
    };
    let schema = document.querySelector('#project-schema');
    if (!schema) {
        schema = document.createElement('script');
        schema.id = 'project-schema';
        schema.type = 'application/ld+json';
        document.head.append(schema);
    }
    schema.textContent = JSON.stringify(structuredData);
}

function setMeta(attribute, name, content) {
    document.querySelector(`meta[${attribute}="${name}"]`).content = content;
}

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

function parallaxHero() {
    if (isMobile || reducedMotion) return;
    const heroImg = document.querySelector('.project-hero-img');
    const update = () => { heroImg.style.transform = `translateY(${scrollY * 0.3}px)`; };
    const scheduled = throttled(update);
    if (lenis) lenis.on('scroll', scheduled);
    else addEventListener('scroll', scheduled, { passive: true });
    update();
}

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
