# Project Case Study Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single `project.html` template populated from per-project JSON files, reachable via `project.html?id={id}` from all project links on the homepage.

**Architecture:** Block-based renderer in `project.js` fetches `assets/data/projects/{id}.json` and renders 5 block types (text, pull-quote, image, gallery, metrics). A thin `project-script.js` orchestrates shared modules (Lenis, cursor, mobile menu, etc.) plus the renderer. Homepage routing in `projects.js` is updated so every project link goes to `project.html?id={id}` instead of external URLs or nowhere.

**Tech Stack:** Vanilla ES modules (no new dependencies), existing CSS custom properties, IntersectionObserver, Lenis scroll.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `project.html` | Page shell: navbar, hero img, article header, blocks container, footer |
| Create | `assets/scripts/project.js` | Fetch JSON, render all blocks + CTAs, setup animations |
| Create | `assets/scripts/project-script.js` | Thin orchestrator: import shared modules + call setupProjectPage |
| Create | `assets/data/projects/dran.json` | Stub for Dranima |
| Create | `assets/data/projects/cmck.json` | Stub for Portfolio (Charlie McKenzie) |
| Create | `assets/data/projects/bmge.json` | Stub for L-DEV's BMG Editor |
| Create | `assets/data/projects/mxal.json` | Stub for Mix and Light |
| Create | `assets/data/projects/sand.json` | Stub for SandFall Interactive |
| Create | `assets/data/projects/lsdp.json` | Stub for Les Saveurs de Provence |
| Create | `assets/data/projects/rcai.json` | Stub for Regards Croisés |
| Create | `assets/data/projects/ogfm.json` | Stub for L'Oreille qui Gratte |
| Create | `assets/data/projects/mego.json` | Stub for Megoteur |
| Create | `assets/data/projects/prfy.json` | Stub for Proofy |
| Create | `assets/data/projects/bgaw.json` | Stub for Black Goose |
| Create | `assets/data/projects/feat-mxal.json` | Stub for Mix and Light (featured) |
| Create | `assets/data/projects/gpmx.json` | Stub for GPMailbox |
| Create | `assets/data/projects/gptr.json` | Stub for GPTranslator |
| Create | `assets/data/projects/dgif.json` | Stub for DaGameThatIsFun |
| Modify | `assets/styles/style.css` | Append all project page CSS (new selectors only) |
| Modify | `assets/scripts/projects.js` | Route all project hrefs to `project.html?id={id}` |

---

## Task 1: CSS — Project Page Styles

**Files:**
- Modify: `assets/styles/style.css` (append at end of file)

- [ ] **Step 1: Append the project page CSS block to the end of `style.css`**

Add this entire block at the very end of `assets/styles/style.css`:

```css
/* ══════════════════════════════════════════
   Project Page
   ══════════════════════════════════════════ */

/* Hero */
.project-hero {
    position: relative;
    height: 100svh;
    overflow: hidden;
}

.project-hero-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    will-change: transform;
}

/* Article Header */
.article-header {
    padding: clamp(48px, 8vh, 80px) var(--pad-edge);
}

.article-header > * {
    opacity: 0;
    transform: translateY(12px);
    transition: opacity 0.7s var(--ease-out), transform 0.7s var(--ease-out);
}

.article-header.loaded > *:nth-child(1) { transition-delay: 0ms; }
.article-header.loaded > *:nth-child(2) { transition-delay: 80ms; }
.article-header.loaded > *:nth-child(3) { transition-delay: 160ms; }
.article-header.loaded > *:nth-child(4) { transition-delay: 240ms; }
.article-header.loaded > *:nth-child(5) { transition-delay: 320ms; }

.article-header.loaded > * {
    opacity: 1;
    transform: none;
}

.article-cta-top {
    display: inline-block;
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--text-muted);
    text-decoration: none;
    letter-spacing: 1px;
    margin-bottom: clamp(16px, 3vh, 32px);
    transition: color 0.2s ease;
}

.article-cta-top:hover { color: var(--white); }

.article-title {
    font-family: 'Bold', sans-serif;
    font-size: clamp(36px, 6vw, 96px);
    color: var(--white);
    margin: 0 0 clamp(12px, 2vh, 24px);
    line-height: 1.05;
}

.article-subtitle {
    font-family: var(--font-body);
    font-size: clamp(16px, 1.4vw, 20px);
    color: var(--text-muted);
    margin: 0 0 clamp(16px, 3vh, 32px);
}

.article-meta {
    font-family: var(--font-body);
    font-size: clamp(13px, 1vw, 15px);
    color: var(--text-muted);
    letter-spacing: 1px;
    margin: 0 0 clamp(12px, 2vh, 20px);
}

.article-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

/* Block base */
.project-block {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.7s var(--ease-out), transform 0.7s var(--ease-out);
}

.project-block.visible {
    opacity: 1;
    transform: none;
}

/* Block: text */
.project-block--text {
    padding: clamp(40px, 8vh, 80px) var(--pad-edge);
}

.block-text-inner {
    max-width: 68ch;
    margin: 0 auto;
}

.block-text-title {
    font-family: 'Bold', sans-serif;
    font-size: clamp(13px, 1vw, 16px);
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--white);
    margin: 0 0 clamp(16px, 3vh, 32px);
}

.block-text-body {
    font-family: var(--font-body);
    font-size: clamp(16px, 1.6vw, 20px);
    line-height: 1.7;
    color: var(--text);
    margin: 0;
}

/* Block: pull-quote */
.project-block--pull-quote {
    padding: clamp(60px, 12vh, 120px) var(--pad-edge);
    display: flex;
    justify-content: center;
}

.block-pullquote {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(28px, 4vw, 64px);
    color: var(--white);
    max-width: 22ch;
    margin: 0;
    text-align: center;
    line-height: 1.2;
}

/* Block: image */
.block-figure {
    margin: 0;
}

.block-figure img {
    width: 100%;
    max-height: 80vh;
    object-fit: cover;
    display: block;
}

.block-figure figcaption {
    text-align: center;
    padding: 12px var(--pad-edge);
    font-size: 13px;
    color: var(--text-muted);
    opacity: 0.6;
}

/* Block: gallery */
.project-block--gallery {
    padding: clamp(20px, 4vh, 40px) 0;
}

.block-gallery {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 0 var(--pad-edge);
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
}

.block-gallery::-webkit-scrollbar { display: none; }

.block-gallery img {
    height: 340px;
    width: auto;
    object-fit: cover;
    flex-shrink: 0;
    display: block;
}

/* Block: metrics */
.project-block--metrics {
    padding: clamp(40px, 8vh, 80px) var(--pad-edge);
}

.block-metrics {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: clamp(32px, 6vw, 80px);
}

.metric-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.metric-value {
    font-family: 'Bold', sans-serif;
    font-size: clamp(48px, 8vw, 96px);
    color: var(--white);
    line-height: 1;
}

.metric-label {
    font-family: var(--font-body);
    font-size: clamp(12px, 1vw, 14px);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 2px;
    text-align: center;
}

/* Bottom CTA */
.project-cta-bottom {
    padding: clamp(60px, 12vh, 120px) var(--pad-edge);
    display: flex;
    justify-content: center;
}

.project-cta-bottom-link {
    font-family: var(--font-display);
    font-style: italic;
    font-size: clamp(20px, 3vw, 44px);
    color: var(--white);
    text-decoration: none;
    text-align: center;
    transition: opacity 0.2s ease;
}

.project-cta-bottom-link:hover { opacity: 0.7; }

/* Not found */
.project-not-found {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: var(--pad-edge);
    text-align: center;
    gap: 24px;
}

.project-not-found p {
    font-family: 'Bold', sans-serif;
    font-size: clamp(24px, 4vw, 48px);
    color: var(--white);
    margin: 0;
}

.project-not-found a {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--text-muted);
    text-decoration: none;
    letter-spacing: 1px;
    transition: color 0.2s ease;
}

.project-not-found a:hover { color: var(--white); }

/* Reduced motion overrides */
@media (prefers-reduced-motion: reduce) {
    .article-header > * {
        transition: none;
        opacity: 1;
        transform: none;
    }

    .project-block {
        transition: none;
        opacity: 1;
        transform: none;
    }
}
```

- [ ] **Step 2: Verify no existing selectors were touched**

Open `style.css` and confirm the new block starts after the last existing rule (the `.back-to-top` rules). There should be a clear `/* ═══ Project Page ═══ */` comment separating it.

---

## Task 2: project.html — Page Shell

**Files:**
- Create: `project.html`

- [ ] **Step 1: Create `project.html`**

Create `project.html` in the repo root with this content:

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project — Léo Tosku</title>
    <meta name="robots" content="noindex">
    <link rel="canonical" href="https://l-dev31.github.io/project.html">

    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="assets/styles/style.css">
    <link rel="stylesheet" href="assets/styles/mobile.css">
    <script src="https://unpkg.com/lenis@1.1.18/dist/lenis.min.js" defer></script>
    <script src="assets/scripts/project-script.js" type="module"></script>
    <link rel="icon" type="image/png" href="assets/images/core/favicon.png">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <link rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200">
</head>

<body>

    <a href="#article-header" class="skip-link">Skip to content</a>

    <!-- Page Load Overlay -->
    <div class="page-loader" aria-hidden="true">
        <div class="page-loader-bar"></div>
    </div>

    <!-- Noise Overlay -->
    <div class="noise" aria-hidden="true"></div>

    <!-- Custom Cursor -->
    <div class="cursor" aria-hidden="true"></div>

    <!-- Navbar -->
    <nav class="navbar" aria-label="Main navigation">
        <div class="brand">
            <a href="index.html" aria-label="Léo TOSKU / Back to home">
                <img src="assets/images/core/logo.svg" alt="L-Dev31 logo">
            </a>
        </div>

        <div class="navbar-center">
            <span class="status-badge" role="status" aria-label="Site status: Work in progress">
                <span class="status-dot" aria-hidden="true"></span>
                <span class="status-label-full">Work in progress</span>
                <span class="status-label-short">WIP</span>
            </span>
        </div>

        <div class="links-container">
            <a href="index.html#web-projects" class="link">Work</a>
            <a href="index.html#featured-projects" class="link">Projects</a>
            <a href="about.html" class="link">About</a>
            <a href="mailto:leotoskuepro@gmail.com" class="link link--cta">
                Contact
            </a>
            <button class="hamburger" aria-label="Open menu" aria-expanded="false">
                <i class="fa fa-bars"></i>
            </button>
        </div>
    </nav>

    <!-- Mobile Menu Overlay -->
    <div class="mobile-menu" aria-hidden="true">
        <nav class="mobile-menu-links" aria-label="Mobile navigation">
            <a href="index.html#web-projects" class="mobile-menu-link">Work</a>
            <a href="index.html#featured-projects" class="mobile-menu-link">Projects</a>
            <a href="about.html" class="mobile-menu-link">About</a>
            <a href="mailto:leotoskuepro@gmail.com" class="mobile-menu-link">Contact</a>
        </nav>
        <div class="mobile-menu-footer">
            <span>Léo TOSKU</span>
            <span>&copy; 2025</span>
        </div>
    </div>

    <!-- Project Hero -->
    <div class="project-hero" aria-hidden="true">
        <img class="project-hero-img" src="" alt="">
    </div>

    <!-- Article Header (populated by project.js) -->
    <div class="article-header" id="article-header"></div>

    <!-- Blocks (populated by project.js) -->
    <div class="project-blocks"></div>

    <!-- Bottom CTA (populated by project.js) -->
    <div class="project-cta-bottom"></div>

    <!-- Footer -->
    <footer id="footer" aria-label="Site footer">
        <video class="footer-bg-video" src="assets/images/core/bg.mp4" autoplay loop muted playsinline
            aria-hidden="true"></video>
        <div class="footer-title-mask" aria-hidden="true">
            <p class="big-name">Léo TOSKU</p>
        </div>
        <div class="footer-top-links">
            <div class="footer-col">
                <h3>Navigation</h3>
                <ul class="footer-links">
                    <li><a href="index.html">Home</a></li>
                    <li><a href="index.html#web-projects">Work</a></li>
                    <li><a href="about.html">About</a></li>
                    <li><a href="mailto:leotoskuepro@gmail.com">Contact</a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h3>Socials</h3>
                <ul class="footer-links social-labeled-links">
                    <li><a href="https://www.instagram.com/l_dev31/" target="_blank" rel="noopener noreferrer"><i
                                class="fab fa-instagram" aria-hidden="true"></i> <span>Instagram</span></a></li>
                    <li><a href="https://www.linkedin.com/in/léo-tosku" target="_blank" rel="noopener noreferrer"><i
                                class="fab fa-linkedin" aria-hidden="true"></i> <span>LinkedIn</span></a></li>
                    <li><a href="https://github.com/L-Dev31" target="_blank" rel="noopener noreferrer"><i
                                class="fab fa-github" aria-hidden="true"></i> <span>GitHub</span></a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h3>Contact</h3>
                <ul class="footer-links">
                    <li><a href="mailto:leotoskuepro@gmail.com">leotoskuepro@gmail.com</a></li>
                    <li><a href="tel:+330745370469">+33 07 45 37 04 69</a></li>
                </ul>
            </div>
        </div>
    </footer>

    <!-- Back to Top -->
    <button id="back-to-top" class="back-to-top" aria-label="Back to Top">
        <div class="btt-text" id="btt-text">Back to Top • Back to Top •</div>
        <div class="btt-icon">
            <img src="assets/images/core/top-arrow.svg" alt="">
        </div>
    </button>

</body>

</html>
```

- [ ] **Step 2: Open `project.html` in browser (file:// or local server) and confirm**
  - Navbar renders, mobile menu button visible
  - Page loader bar animates then fades
  - Noise overlay visible
  - Footer renders with video background
  - Back to top button present
  - No console errors from missing scripts (project-script.js doesn't exist yet — the `type="module"` will silently fail or show a network error, that's expected at this stage)

---

## Task 3: project.js — Block Renderer

**Files:**
- Create: `assets/scripts/project.js`

- [ ] **Step 1: Create `assets/scripts/project.js`**

```js
import { fetchJson, resolveProjectHref, prefersReducedMotion } from './utils.js';

export async function setupProjectPage(lenis) {
    const params = new URLSearchParams(location.search);
    const id = params.get('id')?.trim();

    if (!id) { renderNotFound(); return; }

    try {
        const data = await fetchJson(`assets/data/projects/${id}.json`);
        renderPage(data, lenis);
    } catch {
        renderNotFound();
    }
}

function renderNotFound() {
    document.title = 'Project not found — Léo Tosku';
    document.querySelector('.project-hero')?.remove();
    document.querySelector('.project-cta-bottom')?.remove();
    const header = document.querySelector('.article-header');
    if (header) header.remove();
    const blocks = document.querySelector('.project-blocks');
    if (blocks) blocks.remove();

    const div = document.createElement('div');
    div.className = 'project-not-found';
    div.innerHTML = '<p>Project not found.</p><a href="index.html">← Back</a>';
    const footer = document.getElementById('footer');
    footer ? footer.before(div) : document.body.appendChild(div);
}

function renderPage(data, lenis) {
    document.title = `${data.title} — Léo Tosku`;
    renderHero(data);
    renderArticleHeader(data);
    renderBlocks(data.blocks || []);
    renderBottomCTA(data);
    setupHeroParallax(lenis);
    setupBlockReveal();
    setupHeaderEntrance();
}

function renderHero(data) {
    const section = document.querySelector('.project-hero');
    const img = document.querySelector('.project-hero-img');
    if (!data.heroImage || !section || !img) {
        section?.remove();
        return;
    }
    img.src = data.heroImage;
    img.alt = data.title;
}

function renderArticleHeader(data) {
    const header = document.querySelector('.article-header');
    if (!header) return;

    const liveHref = resolveProjectHref(data.liveUrl);
    const metaParts = [data.year, data.role, data.client].filter(Boolean);

    header.innerHTML = `
        ${liveHref ? `<a href="${liveHref}" class="article-cta-top" target="_blank" rel="noopener noreferrer">View live →</a>` : ''}
        <h1 class="article-title">${data.title}</h1>
        ${data.subtitle ? `<p class="article-subtitle">${data.subtitle}</p>` : ''}
        ${metaParts.length ? `<p class="article-meta">${metaParts.join(' · ')}</p>` : ''}
        ${data.tags?.length ? `<div class="article-tags">${data.tags.map(t => `<span class="featured-tag">${t}</span>`).join('')}</div>` : ''}
    `;
}

function renderBlocks(blocks) {
    const container = document.querySelector('.project-blocks');
    if (!container) return;

    blocks.forEach(block => {
        const el = document.createElement('div');
        el.className = `project-block project-block--${block.type}`;

        switch (block.type) {
            case 'text':
                el.innerHTML = `
                    <div class="block-text-inner">
                        ${block.title ? `<h2 class="block-text-title">${block.title}</h2>` : ''}
                        <p class="block-text-body">${block.body || ''}</p>
                    </div>`;
                break;
            case 'pull-quote':
                el.innerHTML = `<blockquote class="block-pullquote">${block.text || ''}</blockquote>`;
                break;
            case 'image':
                el.innerHTML = `
                    <figure class="block-figure">
                        <img src="${block.src}" alt="${block.caption || ''}" loading="lazy" decoding="async">
                        ${block.caption ? `<figcaption>${block.caption}</figcaption>` : ''}
                    </figure>`;
                break;
            case 'gallery':
                el.innerHTML = `
                    <div class="block-gallery">
                        ${(block.images || []).map(src => `<img src="${src}" alt="" loading="lazy" decoding="async">`).join('')}
                    </div>`;
                break;
            case 'metrics':
                el.innerHTML = `
                    <div class="block-metrics">
                        ${(block.items || []).map(item => `
                            <div class="metric-item">
                                <span class="metric-value">${item.value}</span>
                                <span class="metric-label">${item.label}</span>
                            </div>`).join('')}
                    </div>`;
                break;
        }

        container.appendChild(el);
    });
}

function renderBottomCTA(data) {
    const ctaEl = document.querySelector('.project-cta-bottom');
    if (!ctaEl) return;

    const liveHref = resolveProjectHref(data.liveUrl);
    if (!liveHref) { ctaEl.remove(); return; }

    ctaEl.innerHTML = `<a href="${liveHref}" target="_blank" rel="noopener noreferrer" class="project-cta-bottom-link">Read all that? Here&rsquo;s how it looks →</a>`;
}

function setupHeroParallax(lenis) {
    const img = document.querySelector('.project-hero-img');
    if (!img || prefersReducedMotion) return;

    const update = scroll => { img.style.transform = `translateY(${scroll * 0.3}px)`; };

    if (lenis) lenis.on('scroll', ({ scroll }) => update(scroll));
    else window.addEventListener('scroll', () => update(window.scrollY), { passive: true });
}

function setupBlockReveal() {
    if (prefersReducedMotion) {
        document.querySelectorAll('.project-block').forEach(el => el.classList.add('visible'));
        return;
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                observer.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.project-block').forEach(el => observer.observe(el));
}

function setupHeaderEntrance() {
    const header = document.querySelector('.article-header');
    if (!header) return;

    if (prefersReducedMotion) { header.classList.add('loaded'); return; }

    requestAnimationFrame(() => requestAnimationFrame(() => header.classList.add('loaded')));
}
```

- [ ] **Step 2: Verify the module parses correctly**

Open browser devtools console on `project.html` and check there are no syntax errors from the module import (project-script.js still doesn't exist — that's Task 4).

---

## Task 4: project-script.js — Orchestrator

**Files:**
- Create: `assets/scripts/project-script.js`

- [ ] **Step 1: Create `assets/scripts/project-script.js`**

```js
import { setupPageLoader, setupMobileMenu, setupCursor, setupBackToTop } from './ui.js';
import { setupLenis, setupMagneticLinks } from './animations.js';
import { setupProjectPage } from './project.js';

document.addEventListener('DOMContentLoaded', () => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    setupPageLoader();
    const lenis = setupLenis();
    setupMobileMenu(lenis);
    setupCursor();
    setupBackToTop(lenis);
    setupMagneticLinks();
    setupProjectPage(lenis);
});
```

- [ ] **Step 2: Verify error state in browser**

Navigate to `project.html` (no `?id` param). Expected:
- Page loader animates and fades
- Navbar renders
- "Project not found." message appears in the body
- "← Back" link is present and goes to `index.html`
- No JS errors in console

- [ ] **Step 3: Commit CSS + HTML + JS**

```bash
git add assets/styles/style.css project.html assets/scripts/project.js assets/scripts/project-script.js
git commit -m "feat: add project.html template with block renderer"
```

---

## Task 5: Per-Project JSON Stubs

**Files:**
- Create: `assets/data/projects/` (15 JSON files)

- [ ] **Step 1: Create the `assets/data/projects/` directory and all 15 stub files**

Create `assets/data/projects/dran.json`:
```json
{
  "id": "dran",
  "title": "Dranima",
  "blocks": []
}
```

Create `assets/data/projects/cmck.json`:
```json
{
  "id": "cmck",
  "title": "Portfolio",
  "blocks": []
}
```

Create `assets/data/projects/bmge.json`:
```json
{
  "id": "bmge",
  "title": "L-DEV's BMG Editor",
  "blocks": []
}
```

Create `assets/data/projects/mxal.json`:
```json
{
  "id": "mxal",
  "title": "Mix and Light (Redesign)",
  "blocks": []
}
```

Create `assets/data/projects/sand.json`:
```json
{
  "id": "sand",
  "title": "SandFall Interactive (Redesign)",
  "blocks": []
}
```

Create `assets/data/projects/lsdp.json`:
```json
{
  "id": "lsdp",
  "title": "Les Saveurs de Provence (Redesign)",
  "blocks": []
}
```

Create `assets/data/projects/rcai.json`:
```json
{
  "id": "rcai",
  "title": "Regards Croisés",
  "blocks": []
}
```

Create `assets/data/projects/ogfm.json`:
```json
{
  "id": "ogfm",
  "title": "L'Oreille qui Gratte",
  "blocks": []
}
```

Create `assets/data/projects/mego.json`:
```json
{
  "id": "mego",
  "title": "Megoteur",
  "liveUrl": "https://megoteur.com/",
  "blocks": []
}
```

Create `assets/data/projects/prfy.json`:
```json
{
  "id": "prfy",
  "title": "Proofy",
  "blocks": []
}
```

Create `assets/data/projects/bgaw.json`:
```json
{
  "id": "bgaw",
  "title": "Black Goose",
  "blocks": []
}
```

Create `assets/data/projects/feat-mxal.json`:
```json
{
  "id": "feat-mxal",
  "title": "Mix and Light",
  "blocks": []
}
```

Create `assets/data/projects/gpmx.json`:
```json
{
  "id": "gpmx",
  "title": "GPMailbox",
  "blocks": []
}
```

Create `assets/data/projects/gptr.json`:
```json
{
  "id": "gptr",
  "title": "GPTranslator",
  "blocks": []
}
```

Create `assets/data/projects/dgif.json`:
```json
{
  "id": "dgif",
  "title": "DaGameThatIsFun",
  "blocks": []
}
```

- [ ] **Step 2: Verify a stub renders correctly**

Navigate to `project.html?id=sand`. Expected:
- Page title becomes "SandFall Interactive (Redesign) — Léo Tosku"
- Hero section is removed (no `heroImage` in stub)
- Article header shows only the title "SandFall Interactive (Redesign)" (other fields absent, no CTAs)
- No blocks rendered (empty array)
- Bottom CTA removed (no `liveUrl`)
- No console errors

Navigate to `project.html?id=mego`. Expected:
- Title: "Megoteur — Léo Tosku"
- No hero (no `heroImage`)
- Article header: title "Megoteur" + top CTA "View live →" (links to `https://megoteur.com/`, opens in new tab)
- No blocks rendered (empty array)
- Bottom CTA "Read all that? Here's how it looks →" links to `https://megoteur.com/`

- [ ] **Step 3: Commit JSON stubs**

```bash
git add assets/data/projects/
git commit -m "feat: add per-project JSON stubs for all 15 projects"
```

---

## Task 6: Homepage Routing Change — projects.js

**Files:**
- Modify: `assets/scripts/projects.js`

- [ ] **Step 1: Update `setupWebProjects()` in `assets/scripts/projects.js`**

Find this block (lines 24–30 approximately):
```js
projects.forEach(p => {
    const href = resolveProjectHref(p.path);
    const a = document.createElement('a');
    a.className = `featured-project ${!href ? 'featured-project--disabled' : ''}`;
    if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else { a.setAttribute('aria-disabled', 'true'); a.tabIndex = -1; }
```

Replace with:
```js
projects.forEach(p => {
    const liveHref = resolveProjectHref(p.path);
    const a = document.createElement('a');
    a.className = 'featured-project';
    a.href = `project.html?id=${p.id}`;
```

Also update the hover preview conditional — find:
```js
            if (href) {
                a.addEventListener('mouseenter', e => {
```

Replace `if (href)` with `if (liveHref)`:
```js
            if (liveHref) {
                a.addEventListener('mouseenter', e => {
```

- [ ] **Step 2: Update `setupFeaturedProjects()` in `assets/scripts/projects.js`**

Find this block (lines 93–96 approximately):
```js
            const a = document.createElement('a');
            a.className = 'scatter-item';
            if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            else a.setAttribute('aria-disabled', 'true');
```

Replace with:
```js
            const a = document.createElement('a');
            a.className = 'scatter-item';
            a.href = `project.html?id=${p.id}`;
```

Find:
```js
            if (ctaCursor) ctaCursor.attach(a, p.title, { showArrow: !!href });
```

Replace with:
```js
            if (ctaCursor) ctaCursor.attach(a, p.title, { showArrow: true });
```

Also remove the `const href = resolveProjectHref(p.path);` line inside the `.map()` callback in `setupFeaturedProjects()` (it is no longer used there).

- [ ] **Step 3: Verify on index.html**

Open `index.html` in browser. Expected:
- All 6 web project rows are now clickable (none disabled/faded)
- Hovering a web project with a `path` (e.g. Dranima) still shows the preview image
- Clicking any web project navigates to `project.html?id={id}` (check URL bar)
- All featured scatter items are clickable
- Clicking a featured item navigates to `project.html?id={id}`
- CTA cursor arrow shows on all featured items (not conditional anymore)

- [ ] **Step 4: Commit routing change**

```bash
git add assets/scripts/projects.js
git commit -m "feat: route all project links to project.html case study page"
```

---

## Task 7: Full End-to-End Verification

- [ ] **Step 1: Test the full flow — web project**

1. Open `index.html`
2. Click "SandFall Interactive (Redesign)" in the web projects list
3. Confirm you land on `project.html?id=sand`
4. Confirm title = "SandFall Interactive (Redesign) — Léo Tosku"
5. Confirm navbar "Work" and "Projects" links go to `index.html#web-projects` and `index.html#featured-projects`
6. Confirm footer renders, back-to-top works
7. Confirm custom cursor is active (on desktop)

- [ ] **Step 2: Test the full flow — featured project with liveUrl (Megoteur)**

1. Open `index.html`, click Megoteur in the featured scatter
2. Confirm you land on `project.html?id=mego`
3. Confirm "View live →" top CTA links to `https://megoteur.com/` (opens in new tab)
4. Confirm "Read all that? Here's how it looks →" bottom CTA links to the same
5. Scroll: confirm page loader, Lenis, cursor all work

- [ ] **Step 3: Test error state**

Navigate to `project.html?id=doesnotexist`. Confirm:
- Title is "Project not found — Léo Tosku"
- "Project not found." message displayed
- "← Back" link goes to `index.html`

- [ ] **Step 4: Test with a rich stub (add temp blocks to `sand.json` for visual check)**

Temporarily update `assets/data/projects/sand.json` to:
```json
{
  "id": "sand",
  "title": "SandFall Interactive (Redesign)",
  "subtitle": "Complete brand & web redesign for an indie game studio.",
  "year": "2024",
  "role": "UI/UX Designer",
  "client": "SandFall Interactive",
  "tags": ["redesign", "brand", "web"],
  "liveUrl": "projects/SandFall",
  "blocks": [
    { "type": "text", "title": "Overview", "body": "This is a test overview paragraph to verify text block rendering." },
    { "type": "pull-quote", "text": "The studio needed an identity that matched the ambition of their games." },
    { "type": "metrics", "items": [{ "label": "Pages redesigned", "value": "12" }, { "label": "Delivery", "value": "3 weeks" }] }
  ]
}
```

Navigate to `project.html?id=sand`. Confirm:
- Article header stagger entrance works (elements fade in sequentially)
- Top CTA "View live →" present
- Text block renders with title + body
- Pull-quote renders in Lux italic at display size
- Metrics block shows large value + label
- Block reveal: scroll down — each block fades in from translateY(24px)
- Bottom CTA "Read all that? Here's how it looks →" present

Revert `sand.json` to stub (empty `blocks: []`) after verification, or leave as-is if you want to keep the content.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: project case study page — full implementation complete"
```

---

## Notes for Content Authoring

Each project JSON at `assets/data/projects/{id}.json` accepts these optional top-level fields:

| Field | Type | Description |
|---|---|---|
| `subtitle` | string | One-line project tagline |
| `year` | string | e.g. `"2024"` |
| `role` | string | e.g. `"UI/UX Designer"` |
| `client` | string | Client or team name |
| `tags` | string[] | Reuses `.featured-tag` chip style |
| `heroImage` | string | Path to full-bleed hero image |
| `liveUrl` | string | Absolute URL or local path — enables both CTAs |
| `blocks` | Block[] | Ordered content blocks (see Block Types below) |

**Block types:**
- `{ "type": "text", "title": "...", "body": "..." }` — section with heading + paragraph
- `{ "type": "pull-quote", "text": "..." }` — editorial Lux italic quote
- `{ "type": "image", "src": "...", "caption": "..." }` — full-bleed image, caption optional
- `{ "type": "gallery", "images": ["...", "..."] }` — horizontal scroll strip
- `{ "type": "metrics", "items": [{ "label": "...", "value": "..." }] }` — stat callouts
