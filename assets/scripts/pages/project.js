import '../core/components.js';
import { initPage, sectionNav } from '../core/common.js';
import { reducedMotion, throttled, clamp01 } from '../core/config.js';
import { heroEntrance, trackImages, preloadImage } from '../core/intro.js';
import { loadProjects } from '../core/projects.js';
import { scrubbingText, pixelReveal } from '../fx/effects.js';
import { thread, restDocks } from '../blocks/showcase.js';

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
    document.title = `${project.title} · Léo Tosku | Design, Dev, Marketing`;
    updateSearchMetadata(project);

    const heroImg = document.querySelector('.project-hero-img');
    heroImg.src = project.heroImage;
    heroImg.alt = project.title;
    heroImg.hidden = false;
    heroImg.fetchPriority = 'high';

    const details = [
        ['Role', project.role],
        ['Year', project.date?.slice(0, 4)],
        ['Client', project.client],
    ].filter(([, value]) => value);

    const header = document.querySelector('.article-header');
    const title = document.createElement('h1');
    title.className = 'article-title';
    title.textContent = project.title;

    const subtitle = document.createElement('p');
    subtitle.className = 'article-subtitle';
    subtitle.textContent = project.subtitle;

    const facts = document.createElement('dl');
    facts.className = 'article-facts';
    for (const [label, value] of details) {
        const fact = document.createElement('div');
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        term.textContent = label;
        description.textContent = value;
        fact.append(term, description);
        facts.append(fact);
    }

    const tags = document.createElement('div');
    tags.className = 'article-tags';
    for (const label of project.tags ?? []) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = label;
        tags.append(tag);
    }
    header.replaceChildren(title, subtitle, facts, tags);

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
        const link = document.createElement('a');
        link.href = `#${section.id}`;
        const label = title.textContent.replace(/^(The|Le|La|Les|L['\u2019])\s*/i, '');
        link.textContent = label.charAt(0).toUpperCase() + label.slice(1);
        nav.append(link);
    });
    sectionNav(nav, lenis);
}

function updateSearchMetadata(project) {
    const url = new URL(`project.html?id=${encodeURIComponent(project.id)}`, location.origin).href;
    const image = new URL(project.heroImage, location.href).href;
    const description = `Léo Tosku | Design, Dev, Marketing: ${project.subtitle || `case study, ${project.title}`}`.slice(0, 160);

    document.querySelector('link[rel="canonical"]').href = url;
    document.querySelector('meta[name="description"]').content = description;
    setMeta('property', 'og:title', `${project.title} · Léo Tosku | Design, Dev, Marketing`);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', image);
    setMeta('name', 'twitter:title', `${project.title} · Léo Tosku | Design, Dev, Marketing`);
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

function callsToAction({ ctas = [], ctaPreview, ctaVideo, trailerUrl, trailerLabel, heroImage, title }, section) {
    const heroLinks = document.querySelector('.project-hero-links');
    if (!ctas.length) {
        heroLinks.remove();
        return section.remove();
    }
    for (const { label, url } of ctas) {
        const heroLink = document.createElement('a');
        heroLink.className = 'project-hero-live';
        heroLink.href = url;
        heroLink.target = '_blank';
        heroLink.rel = 'noopener noreferrer';
        heroLink.textContent = label;
        heroLinks.append(heroLink);

        const link = document.createElement('a');
        link.className = 'project-cta-bottom-link';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = label;
        section.querySelector('.project-cta-text').append(link);
    }
    if (trailerUrl) {
        const link = document.createElement('a');
        link.className = 'project-cta-bottom-link';
        link.href = trailerUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = trailerLabel || 'Watch the trailer';
        section.querySelector('.project-cta-text').append(link);
    }
    const preview = section.querySelector('.project-cta-preview');
    if (ctaVideo && /^[\w-]+$/.test(ctaVideo)) {
        const video = document.createElement('div');
        video.className = 'project-cta-preview project-cta-video';
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'project-cta-play';
        preloadImage(ctaPreview || heroImage);
        play.style.backgroundImage = `url('${ctaPreview || heroImage}')`;
        play.innerHTML = '<span class="project-cta-play-label">Play the video <small>Loads content from YouTube</small></span>';
        play.addEventListener('click', () => {
            const frame = document.createElement('iframe');
            frame.src = `https://www.youtube-nocookie.com/embed/${ctaVideo}?autoplay=1`;
            frame.title = `${title}, video`;
            frame.allow = 'autoplay; accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            frame.allowFullscreen = true;
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
    const fill = (link, p, direction) => {
        link.href = `project.html?id=${p.id}`;
        link.querySelector('.project-pager-title').textContent = p.title;
        link.querySelector('.project-pager-role').textContent = p.role;
        preloadImage(p.heroImage);
        link.querySelector('.project-pager-img').style.backgroundImage = `url('${p.heroImage}')`;
    };
    fill(prevLink, caseStudies.at(i - 1), 'Previous');
    fill(nextLink, caseStudies[(i + 1) % caseStudies.length], 'Next');
    nav.hidden = false;
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
    document.title = 'Project not found · Léo Tosku | Design, Dev, Marketing';
    document.querySelector('.project-main').innerHTML =
        '<div class="project-not-found"><p>Project not found.</p><a href="index.html">Back</a></div>';
}
