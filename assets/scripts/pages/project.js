import '../core/components.js';
import { initPage, sectionNav } from '../core/common.js';
import { reducedMotion, throttled, clamp01 } from '../core/config.js';
import { heroEntrance, trackImages, preloadImage } from '../core/intro.js';
import { loadProjects } from '../core/projects.js';
import { el } from '../core/dom.js';
import { scrubbingText, pixelReveal } from '../fx/effects.js';
import { thread, restDocks } from '../blocks/showcase.js';

const SITE = 'Léo Tosku | Design, Dev, Marketing';

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
    const pageTitle = `${project.title} · ${SITE}`;
    document.title = pageTitle;
    updateSearchMetadata(project, pageTitle);

    const heroImg = document.querySelector('.project-hero-img');
    heroImg.src = project.heroImage;
    heroImg.alt = project.title;
    heroImg.hidden = false;
    heroImg.fetchPriority = 'high';

    const facts = el('dl', 'article-facts');
    for (const [label, value] of [['Role', project.role], ['Year', project.date?.slice(0, 4)], ['Client', project.client]]) {
        if (!value) continue;
        const fact = el('div');
        fact.append(el('dt', '', label), el('dd', '', value));
        facts.append(fact);
    }
    const tags = el('div', 'article-tags');
    tags.append(...(project.tags ?? []).map(label => el('span', 'tag', label)));

    const header = document.querySelector('.article-header');
    header.replaceChildren(el('h1', 'article-title', project.title), el('p', 'article-subtitle', project.subtitle), facts, tags);

    if (reducedMotion) header.classList.add('loaded');
    else heroEntrance.then(() => requestAnimationFrame(() => header.classList.add('loaded')));

    const cta = document.querySelector('.project-cta-bottom');
    cta.insertAdjacentHTML('beforebegin', html);
    callsToAction(project, cta);
    pager(project, projects);
    chapterNav();
    trackImages();
    scrubbingText();
    pixelReveal(document.querySelectorAll('figure.case-panel, .gallery-item'));
}

function chapterNav() {
    const nav = document.querySelector('.section-nav');
    const titles = [...document.querySelectorAll('.project-main .title')];
    if (!nav || titles.length < 2) return nav?.remove();
    titles.forEach((title, i) => {
        const section = title.closest('section');
        if (!section.id) section.id = `chapter-${i + 1}`;
        const label = title.textContent.replace(/^(The|Le|La|Les|L['\u2019])\s*/i, '');
        const link = el('a', '', label.charAt(0).toUpperCase() + label.slice(1));
        link.href = `#${section.id}`;
        nav.append(link);
    });
    sectionNav(nav, lenis);
}

function updateSearchMetadata(project, pageTitle) {
    const url = new URL(`project.html?id=${encodeURIComponent(project.id)}`, location.origin).href;
    const image = new URL(project.heroImage, location.href).href;
    const description = `${SITE}: ${project.subtitle || `case study, ${project.title}`}`.slice(0, 160);

    document.querySelector('link[rel="canonical"]').href = url;
    document.querySelector('meta[name="description"]').content = description;
    setMeta('property', 'og:title', pageTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', image);
    setMeta('name', 'twitter:title', pageTitle);
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
        creator: { '@type': 'Person', name: 'Léo Tosku', jobTitle: 'Design, Development and Marketing', url: 'https://www.leotosku.com/' },
        keywords: project.tags?.join(', '),
    };
    let schema = document.querySelector('#project-schema');
    if (!schema) {
        schema = el('script');
        schema.id = 'project-schema';
        schema.type = 'application/ld+json';
        document.head.append(schema);
    }
    schema.textContent = JSON.stringify(structuredData);
}

function setMeta(attribute, name, content) {
    document.querySelector(`meta[${attribute}="${name}"]`).content = content;
}

// A link that opens in a new tab.
const externalLink = (className, href, label) => Object.assign(el('a', className, label), { href, target: '_blank', rel: 'noopener noreferrer' });

function callsToAction({ ctas = [], ctaPreview, ctaVideo, trailerUrl, trailerLabel, heroImage, title }, section) {
    const heroLinks = document.querySelector('.project-hero-links');
    if (!ctas.length) {
        heroLinks.remove();
        return section.remove();
    }
    const links = section.querySelector('.project-cta-text');
    for (const { label, url } of ctas) {
        heroLinks.append(externalLink('project-hero-live', url, label));
        links.append(externalLink('project-cta-bottom-link', url, label));
    }
    if (trailerUrl) links.append(externalLink('project-cta-bottom-link', trailerUrl, trailerLabel || 'Watch the trailer'));
    const preview = section.querySelector('.project-cta-preview');
    if (ctaVideo && /^[\w-]+$/.test(ctaVideo)) {
        const video = el('div', 'project-cta-preview project-cta-video');
        const play = el('button', 'project-cta-play');
        play.type = 'button';
        preloadImage(ctaPreview || heroImage);
        play.style.backgroundImage = `url('${ctaPreview || heroImage}')`;
        play.innerHTML = '<span class="project-cta-play-label">Play the video <small>Loads content from YouTube</small></span>';
        play.addEventListener('click', () => {
            const frame = Object.assign(el('iframe'), {
                src: `https://www.youtube-nocookie.com/embed/${ctaVideo}?autoplay=1`,
                title: `${title}, video`,
                allow: 'autoplay; accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen',
                referrerPolicy: 'strict-origin-when-cross-origin',
                allowFullscreen: true,
            });
            play.replaceWith(frame);
            frame.focus();
        });
        video.append(play);
        return preview.replaceWith(video);
    }
    preview.href = ctas[0].url;
    preview.setAttribute('aria-label', `Open: ${ctas[0].label}`);
    preview.querySelector('img').src = ctaPreview || heroImage;
}

function pager(project, projects) {
    const nav = document.querySelector('.project-pager');
    const caseStudies = projects.filter(p => p.subtitle);
    const i = caseStudies.indexOf(project);
    if (i === -1 || caseStudies.length < 2) return nav.remove();

    const [prevLink, nextLink] = nav.querySelectorAll('a');
    const fill = (link, p) => {
        link.href = `project.html?id=${p.id}`;
        link.querySelector('.project-pager-title').textContent = p.title;
        link.querySelector('.project-pager-role').textContent = p.role;
        preloadImage(p.heroImage);
        link.querySelector('.project-pager-img').style.backgroundImage = `url('${p.heroImage}')`;
    };
    fill(prevLink, caseStudies.at(i - 1));
    fill(nextLink, caseStudies[(i + 1) % caseStudies.length]);
    nav.hidden = false;
}

function progressBar(lenis) {
    const bar = el('div', 'reading-progress');
    bar.setAttribute('aria-hidden', 'true');
    const fill = el('span');
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
    document.title = `Project not found · ${SITE}`;
    document.querySelector('.project-main').innerHTML =
        '<div class="project-not-found"><p>Project not found.</p><a href="index.html">Back</a></div>';
}
