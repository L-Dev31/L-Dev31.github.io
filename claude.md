# L-Dev31 Portfolio – Claude Code Guide

## Quick Start
- **Owner:** Léo Tosku (UI/UX Designer, Graphic Designer)
- **Type:** Personal portfolio + commissioned web projects
- **Root files:** Main portfolio (index.html, style.css, mobile.css, script.js)
- **Projects:** In dedicated folders (SandFall/, Elements/, etc.)
- **Data format:** JSON (projects.json, companies.json)

**⚠️ Excluded folders (DO NOT MODIFY):** Stock, smag, BlackGoose, BMGE, LSDP, Others

---

## Portfolio Architecture

### Root Level
```
index.html          → Main portfolio page
style.css           → Global styles (dark theme, typography, effects) — no media queries
mobile.css          → All responsive overrides (media queries only)
script.js           → Core animations, scroll behavior, data loading
projects.json       → Project metadata
companies.json      → Work experience data
Elements/           → Shared assets (fonts, images, icons)
  ├── font/         → Custom typefaces
  └── image/        → Logo, favicon, portraits, company logos
        └── project/ → Featured project images (max 800px wide, compressed)
```

### Project Structure
Each project folder contains:
```
index.html          → Project page
styles.css          → Project-specific styles
script.js           → Interactive elements
```

### CSS Architecture
- **style.css** — all base styles, fluid sizing via `clamp()`, zero media queries
- **mobile.css** — only `@media` blocks, imported after style.css
- Breakpoints: `1024px` (tablet), `768px` (phone landscape), `480px` (small phone)

---

## Artistic Direction – The L-Dev31 Visual Language

### Design Philosophy
- **Dark editorial:** Near-black canvas (`#000`–`#111`) with white text, never reversed
- **Cinematic depth:** Layered video, noise grain, and scroll-driven effects create atmosphere
- **Restrained luxury:** Effects are subtle and purposeful — no decorative noise for its own sake
- **Fluid tension:** Text and images overlap deliberately (negative margins, `mix-blend-mode`) rather than sitting neatly in boxes
- **Scroll as a medium:** The page is experienced through movement — parallax, scrub reveals, and hero fade are core to the feeling, not optional flourishes

---

### Color Palette (CSS Variables in `:root`)

| Variable | Value | Usage |
|----------|-------|-------|
| `--white` | `#fff` | Text, highlights, borders |
| `--text` | `#aaa` | Body text, secondary content |
| `--color-on-light` | `#111` | Text on white backgrounds (hover states) |
| `--white-06` | `rgba(255,255,255,0.06)` | Subtle glass borders |
| `--glass-05` | `rgba(255,255,255,0.05)` | Glass background effect |
| `--border-strong` | `rgba(255,255,255,0.2)` | Strong borders, dividers |
| `--shadow-float` | `0 10px 30px rgba(0,0,0,0.3)` | Elevated UI elements |
| `--pad-section` | `clamp(40px, 10vh, 120px)` | Vertical section padding |
| `--pad-edge` | `clamp(16px, 5%, 80px)` | Horizontal edge padding |

> The actual `body` background is `black`. Sections use the radial gradient below — do not set backgrounds individually.

**✅ DO:**
- Use CSS variables — never hardcode colors
- Keep color count minimal; this palette is grayscale-only by design
- Use `rgba` for overlays and glass effects

**❌ DON'T:**
- Add accent colors, neons, or anything non-grayscale
- Use light backgrounds anywhere
- Hardcode `#fff`, `#000`, `#aaa` — use variables

---

### Section Background — The Signature Radial Gradient

All main content sections (`#about-me`, `#web-projects`, `#featured-projects`, `#my-story`) share this background:

```css
background: radial-gradient(circle at 50% 100%, #333 0%, #202020 30%, #000 80%)
            center bottom / cover no-repeat fixed;
```

- The `fixed` attachment makes it behave like a single deep light source shining up through all sections as you scroll — a key part of the cinematic feel
- The light is centered at the bottom (`50% 100%`), creating a warm glow that fades to pure black at the edges and top
- **Never break this into per-section gradients** — the unified `fixed` attachment is what creates the illusion of depth across the scroll

---

### Typography

#### Font Stack

| Font | Variable | Usage |
|------|----------|-------|
| **Thin** | `--font-body` | All body text, descriptions, nav links |
| **Lux** | `--font-display` | H1 hero title, section h3, big-name footer, CTAs |
| **Heavitas** | — | Available for project titles / tech contexts |
| **Bold** | — | Available for heavy emphasis |
| **Material Symbols** | — | Mobile nav icons only |

**✅ DO:**
- `--font-display` (Lux) for anything large and editorial — it's italic by default at large sizes
- `--font-body` (Thin) for all running text
- Apply `letter-spacing: 2px` on section titles and subtitles for luxury spacing
- Use `clamp()` for all font sizes — no fixed `px` or `vh` units alone

**❌ DON'T:**
- Mix more than 2 font families in one section
- Use system fonts anywhere
- Use `font-weight` with Lux (it's a single-weight display font)

---

### Visual Effects & Interactions

#### Scroll-Driven Parallax
Elements with `data-parallax-speed` are shifted vertically by JS on scroll. Speed `100` = no movement, below 100 = slower than scroll (drifts behind), above 100 = faster.

```html
<img data-parallax-speed="90" ...>   <!-- slightly slower = depth -->
<div data-parallax-speed="80" ...>   <!-- noticeably behind = layered feel -->
```

- `.scatter-column` elements also use a CSS custom property `--parallax-speed` for the same system
- **Never add `data-parallax-speed` to fixed-position elements** (e.g. the footer video — it broke layout)
- The hero video fades/blurs via `--hero-progress` CSS variable driven by scroll position

#### Scrub Text (Letter-by-Letter Scroll Reveal)
Class `.scrubbing-text` on any element activates a character-by-character opacity reveal tied to scroll position. Each character fades from `0.2` to `1` with a brief blur transition as it crosses 70% of the viewport.

```html
<div class="scrubbing-text">Your text here</div>
```

- Used on the about-me paragraph and story section headings/paragraphs
- The JS wraps text in `.scrubbing-word` > `.scrubbing-char` spans — do not pre-wrap manually
- Works on any block element; apply to `<h3>`, `<p>`, or `<div>`

#### Hero Video + WebGL Liquify
The hero uses a `<canvas>` + `<video>` combo. The JS (`setupLiquifyAll`) renders the video through a WebGL shader that distorts on mouse movement. On mobile/reduced-motion it degrades gracefully to the plain video.

- The canvas replaces the video visually — the `<video>` is hidden once playing
- Do not add `data-parallax-speed` to `#hero-video` — position is handled by the canvas

#### Word-Split Reveal (Story Section)
Elements processed by `splitIntoLines()` get words wrapped in `.split-word` spans. When the container gains `.visible` (via IntersectionObserver), words cascade in with staggered delays per line.

```css
/* Trigger class added by observer */
.split-animated.visible .split-word {
    opacity: 1;
    transform: none;
    filter: none;
}
```

#### Section Title Lines
`.title` h2 elements have animated `::before` / `::after` pseudo-elements that scale in from center when `.visible` is added. They always span `100vw` regardless of parent container width — this keeps line lengths identical across all sections.

#### Footer Text-Reveal Mask
The footer uses `mix-blend-mode: multiply` on `.footer-title-mask` (background `#111`) over the video. `.big-name` text is white — white × video = video shows through. `#111` × video ≈ black — the surround stays dark.

- This requires the footer itself to **not** have `isolation: isolate`
- `.footer-title-mask` must **not** have `overflow: hidden` (breaks blend on mobile)
- The footer video must **not** have `data-parallax-speed` (causes gaps)

#### Noise Overlay
`.noise` is a fixed full-screen PNG tile animated at 5fps to simulate film grain. It sits at `z-index: 1000` and is purely decorative (`pointer-events: none`).

#### Custom Cursor
- `.cursor` div follows mouse with `mix-blend-mode: exclusion` — inverts colors under it
- `.cta-cursor` is a pill-shaped label that replaces the dot cursor on hover over featured project items
- `cursor: none !important` on `html`, `body`, and all interactive elements — no exceptions

---

### Layout System

#### Fluid Spacing Variables
```css
--pad-section: clamp(40px, 10vh, 120px)  /* vertical section padding */
--pad-edge:    clamp(16px, 5%, 80px)     /* horizontal edge inset */
```
Use these everywhere instead of raw `vh` or `%` values.

#### Scatter Grid (Featured Projects)
The featured project gallery uses a CSS grid of `.scatter-column` divs. Column count is set **by JS** at runtime based on viewport width — do not hardcode `grid-template-columns` in CSS for this element.

| Viewport | Columns |
|----------|---------|
| > 1024px | 4 |
| 481–1024px | 3 |
| ≤ 480px | 2 |

Columns have different `--parallax-speed` values for a depth effect. Even columns scroll slightly slower.

#### About Me — Intentional Overlap
The about-me layout is a flex row where the text (`width: 100%`, `z-index: 10`, `mix-blend-mode: difference`) overlaps the portrait photo (negative `margin-left`). This is intentional — do not "fix" it into a clean two-column layout.

```css
.about-me-text  { width: 100%; z-index: 10; mix-blend-mode: difference; }
.about-me-image { width: 65%; margin-left: clamp(-160px, -18vw, -40px); }
```

This layout persists at all screen sizes — mobile just adjusts the overlap amount, never stacks.

---

### Image Guidelines

- **Featured project images:** Max 800px wide, compressed PNG, stored in `Elements/image/project/`
- **All images:** `loading="lazy" decoding="async"` attributes
- **Fade-in on load:** Featured project images start at `opacity: 0`, gain `.loaded` class after `image.decode()` resolves — ensures no flash of broken images
- `contain: content` on `.scatter-item` prevents layout shift before images load
- `backface-visibility: hidden` on all animated images for sub-pixel smoothness

---

### Responsive Strategy

- **style.css:** Zero media queries — everything scales via `clamp()`
- **mobile.css:** All `@media` overrides, imported separately
- The about-me overlap, scrub text, and parallax all work the same way at every size
- At `768px`: nav switches from text links to Material Symbols icons; story rows stack
- Story text alignment resets from right-aligned (odd rows, desktop) to left-aligned on mobile

---

## Coding Standards

### CSS
```css
/* Use variables — never hardcode values */
.component {
    font-family: var(--font-body);
    font-size: clamp(16px, 2vw, 24px);   /* always clamp for fluid sizing */
    color: var(--text);
    background: var(--glass-05);
    border: 1px solid var(--white-06);
    transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
```

### JavaScript
```javascript
// Always guard animations
if (!prefersReducedMotion) { /* animate */ }
if (isMobile) { /* skip heavy effects */ }

// Scroll effects: IntersectionObserver, never onscroll
const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
    });
}, { threshold: 0.1 });

// Image loading: use decode() for guaranteed paint
const img = new Image();
img.addEventListener('load', () => img.decode?.().then(() => img.classList.add('loaded')));
img.src = '...';
```

### HTML
- Semantic HTML5 — `<header>`, `<section>`, `<footer>`, `<nav>`
- `aria-hidden="true"` on all decorative elements (noise, video backgrounds, mask layers)
- `data-parallax-speed` on any element that should drift on scroll
- No inline styles

---

## Common Tasks

### Adding a New Project
1. Add entry to `projects.json` with `category: "featured"` or `"web"`
2. Add image to `Elements/image/project/{id}.png` — resize to max 800px wide before committing
3. For web projects, create project folder with `index.html`, `styles.css`, `script.js`
4. Match the radial gradient background and typography

### Adding a New Section
1. Use the shared section background (radial gradient, `fixed` attachment)
2. Add a `.title` h2 — the line animation is automatic via IntersectionObserver
3. Use `--pad-section` for vertical padding, `--pad-edge` for horizontal inset
4. Apply `.scrubbing-text` to any paragraph you want scroll-scrubbed

### Animation/Interactivity
1. IntersectionObserver → `.visible` class → CSS transition (never JS-driven style changes)
2. Check `prefersReducedMotion` before any motion
3. Parallax: add `data-parallax-speed` attribute (80–120 range)
4. Scrub text: add class `.scrubbing-text` — JS handles the rest

---

## Before You Start Coding

✅ **Checklist:**
- [ ] CSS variables for all colors and spacing
- [ ] `clamp()` for all font sizes and padding (no bare `px`/`vh`)
- [ ] No media queries in style.css — put them in mobile.css
- [ ] Dark theme throughout — no light backgrounds
- [ ] Custom fonts only — no system fonts
- [ ] `loading="lazy" decoding="async"` on all images
- [ ] `prefers-reduced-motion` checked before any animation
- [ ] `data-parallax-speed` instead of JS-driven transforms where possible
- [ ] `aria-hidden` on all decorative elements
- [ ] Test the radial gradient background — it should look like a single light source across all sections
