# Project Case Study Page — project.html

**Date:** 2026-05-17
**Scope:** Single template page populated from per-project JSON. Covers all projects (web + featured). Block-based renderer for editorial variety.

---

## Decisions

- **Template:** One `project.html`, URL-param driven (`?id=sand`)
- **Content:** Per-project JSON at `assets/data/projects/{id}.json`
- **Renderer:** Block-based — 5 block types, each with a distinct visual treatment
- **Routing:** All homepage project links now go to `project.html?id={id}` — live URL moved into per-project JSON as `liveUrl`
- **CTAs:** Two "View live" links per project page (top + bottom), conditional on `liveUrl` existing. Bottom copy: *"Read all that? Here's how it looks →"*

---

## Architecture

### Files created

| File | Purpose |
|---|---|
| `project.html` | Page shell — navbar, hero, article header, block container, footer |
| `assets/scripts/project.js` | Fetches per-project JSON, renders blocks, wires CTAs |
| `assets/scripts/project-script.js` | Thin orchestrator: imports shared modules + setupProjectPage |
| `assets/data/projects/{id}.json` | One file per project (15 total) |

### Files modified

| File | Change |
|---|---|
| `assets/styles/style.css` | Project page styles (hero, article header, all block types, CTAs) |
| `assets/scripts/projects.js` | All project hrefs → `project.html?id={id}` for both web + featured |

### Files untouched

`script.js`, `animations.js`, `ui.js`, `utils.js`, `about.html`, `index.html` — no changes.

### Routing change detail

In `setupWebProjects()`: always set `a.href = \`project.html?id=${p.id}\`` (no `target="_blank"`, no `rel` — it's an internal page). Remove `featured-project--disabled` class, `aria-disabled`, and `tabIndex = -1` logic — every project now has a page. Keep hover preview (img.src / desc / mouseenter/mousemove/mouseleave) unchanged.

In `setupFeaturedProjects()`: always set `a.href = \`project.html?id=${p.id}\`` (internal, no `target="_blank"`). `ctaCursor.attach()` always passes `showArrow: true`.

`resolveProjectHref` remains in utils.js — still used inside `project.js` to resolve the `liveUrl` field.

### Error state

If `?id` param is absent or the JSON fetch returns a non-OK response, `project.js` renders a centered message: "Project not found." with a `← Back` link to `index.html`. No crash, no blank page.

---

## Per-Project JSON Schema

Path: `assets/data/projects/{id}.json`

```json
{
  "id": "sand",
  "title": "SandFall Interactive",
  "subtitle": "Complete brand & web redesign for an indie game studio.",
  "year": "2024",
  "role": "UI/UX Designer",
  "client": "SandFall Interactive",
  "tags": ["redesign", "brand", "web"],
  "heroImage": "assets/images/projects/sand-hero.png",
  "liveUrl": "projects/SandFall",
  "blocks": [
    { "type": "text", "title": "Overview", "body": "..." },
    { "type": "pull-quote", "text": "The studio needed an identity that matched the ambition of their games." },
    { "type": "image", "src": "assets/images/projects/sand-1.png", "caption": "Before / After" },
    { "type": "text", "title": "Process", "body": "..." },
    { "type": "gallery", "images": ["assets/images/projects/sand-2.png", "assets/images/projects/sand-3.png"] },
    { "type": "metrics", "items": [{ "label": "Pages redesigned", "value": "12" }, { "label": "Delivery", "value": "3 weeks" }] },
    { "type": "text", "title": "Outcome", "body": "..." }
  ]
}
```

All fields except `id` and `title` are optional. Missing `liveUrl` → no CTAs rendered. Missing `heroImage` → hero section hidden. Missing `subtitle`/`year`/`role`/`client` → those metadata slots are omitted.

---

## Block Types

### `text`
- Container: `max-width: 68ch`, centered with `margin: 0 auto`, `padding: clamp(40px, 8vh, 80px) var(--pad-edge)`
- `title` → `<h2>` in Bold, tracked, uppercase (matching existing `.title` style)
- `body` → `<p>` in Thin, `font-size: clamp(16px, 1.6vw, 20px)`, `line-height: 1.7`

### `pull-quote`
- Full-width, `padding: clamp(60px, 12vh, 120px) var(--pad-edge)`
- `<blockquote>` → Lux italic, `font-size: clamp(28px, 4vw, 64px)`, centered, `max-width: 22ch`, `color: var(--white)`
- Same visual voice as `.chapter-break p` from the SOTD spec

### `image`
- Full-bleed: `width: 100%`, `max-height: 80vh`, `object-fit: cover`
- `caption` → centered below in muted body (`opacity: 0.5`, `font-size: 13px`)
- Wrapped in `<figure>`

### `gallery`
- Horizontal scroll strip: `display: flex`, `overflow-x: auto`, `gap: 12px`, `padding: 0 var(--pad-edge)`
- Each image: `height: 340px`, `width: auto`, `object-fit: cover`, `flex-shrink: 0`
- `-webkit-overflow-scrolling: touch`, no scrollbar visible (`scrollbar-width: none`)

### `metrics`
- `display: flex`, `flex-wrap: wrap`, `justify-content: center`, `gap: clamp(32px, 6vw, 80px)`
- Each item: `value` in Bold display size (`clamp(48px, 8vw, 96px)`), `label` in Thin muted below

---

## Page Layout

```
[ Navbar — identical to index.html ]

[ Hero ]
  Full-bleed image, height: 100svh, object-fit: cover
  Subtle parallax: translateY keyed to scroll (same pattern as story-portrait)

[ Article Header ]
  padding: clamp(48px, 8vh, 80px) var(--pad-edge)
  width: 100%, padded with `var(--pad-edge)` on both sides (no inner max-width cap — matches section rhythm)
  ─ "View live →" CTA (if liveUrl) — top, understated link style
  ─ Title (h1, Bold, large)
  ─ Subtitle (p, Thin, muted)
  ─ Metadata row: year · role · client
  ─ Tags (same .featured-tag chips as index.html)

[ Blocks — in JSON order ]
  Each block wrapped in .project-block, revealed by IntersectionObserver

[ Bottom CTA ]
  (if liveUrl) Full-width centered link:
  "Read all that? Here's how it looks →"
  Lux italic, large, links to liveUrl (resolveProjectHref applied)

[ Footer — identical to index.html ]
```

---

## Animation & Effects

Reused from existing modules (no new animation code):
- `setupPageLoader` — same progress bar
- `setupLenis` — smooth scroll
- `setupCursor` — custom cursor
- `setupMobileMenu` — hamburger
- `setupBackToTop` — back to top button

New in `project.js`:
- **Hero parallax:** `scroll` event listener (or Lenis `on('scroll')`) — `heroImg.style.transform = \`translateY(${scrollY * 0.3}px)\`` — same coefficient as story portraits
- **Block reveal:** Single `IntersectionObserver` (threshold: 0.1) on each `.project-block`. Each block starts `opacity: 0; transform: translateY(24px)`. On intersection, adds `.visible`. Delay = `blockIndex × 0` (each block triggers independently as it enters viewport — no stagger needed since blocks are full-width and sequential)
- **Article header entrance:** On page load, title/subtitle/metadata stagger in: `opacity: 0 → 1` with `transitionDelay` 0ms / 80ms / 160ms / 240ms — triggered by adding `.loaded` class to `.article-header` after JSON renders

All animations respect `prefersReducedMotion` (guard from utils.js).

---

## CSS additions to style.css

New selectors (all scoped, no interference with existing rules):

```
.project-hero
.project-hero-img
.article-header
.article-header.loaded > * (stagger entrance)
.article-meta
.article-cta-top
.project-blocks
.project-block (opacity/transform base state)
.project-block.visible
.project-block--text
.project-block--pull-quote
.project-block--image
.project-block--gallery
.project-block--metrics
.metric-item
.project-cta-bottom
.project-not-found
```

No existing selectors modified.

---

## Constraints

- No new fonts, no new JS dependencies
- `resolveProjectHref` reused for liveUrl resolution
- All 15 per-project JSON files created as stubs (id + title only) — content filled by Léo
- `prefersReducedMotion` respected on all animations
- Mobile: gallery is touch-scrollable, hero is full-bleed, text blocks use `var(--pad-edge)` for consistent margin
- Navbar, footer, grain, cursor — untouched, identical to other pages
