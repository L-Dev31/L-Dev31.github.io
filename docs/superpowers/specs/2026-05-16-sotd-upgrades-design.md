# SOTD Upgrades — index.html & about.html

**Date:** 2026-05-16
**Scope:** Apply Awwwards SOTD principles to existing pages — no new pages, no chapter numbers.

---

## Principles applied

- Scrollytelling — staggered scroll-triggered reveals on all major list/block elements
- Breathing room — increased inter-section vertical rhythm
- Full-bleed transition — one editorial pull-quote break on about.html
- Consistent voice — all additions use existing tokens (Lux, Thin, `--ease-out`, `--white`, grain untouched)

---

## index.html — 3 changes

### 1. Web project list — staggered scroll entry

**Target:** `.featured-project` items inside `.featured-list`
**Mechanism:** In `setupWebProjects()`, after each item is appended to the DOM, set `el.style.transitionDelay = ${index * 80}ms`. A dedicated `IntersectionObserver` created inside `setupWebProjects()` (threshold 0.1) adds `.visible` to trigger the transition. The existing CSS `transition` on `.featured-project` must be extended (not replaced) to include opacity and transform.
**CSS:**
```css
.featured-project {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s var(--ease-out), transform 0.6s var(--ease-out), background 0.25s ease, color 0.25s ease;
}
.featured-project.visible {
  opacity: 1;
  transform: none;
}
```
**Note:** `.featured-project--disabled` items still reveal (just not interactive) — same stagger.

### 2. Featured scatter — staggered scroll entry

**Target:** `.scatter-item` elements inside `.featured-scatter`
**Mechanism:** In `setupFeaturedProjects()`, after `layout()` distributes items into columns, observe each `.scatter-item` with `delay = colIndex × 60ms` — all items in the same column reveal simultaneously, columns fire left-to-right. The existing `transition: filter 0.25s ease` on `.scatter-item` must be extended, not replaced.
**CSS:**
```css
.scatter-item {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.7s var(--ease-out), transform 0.7s var(--ease-out), filter 0.25s ease;
}
.scatter-item.visible {
  opacity: 1;
  transform: none;
}
```
**Note:** Image `.loaded` opacity transition is kept — it runs after the container is already visible.

### 3. Breathing room between sections

**Target:** `#web-projects` and `#featured-projects`
**Mechanism:** Increase bottom padding on `#web-projects` and top padding on `#featured-projects` so the transition between sections has a clear visual pause. Use `clamp()` to stay fluid.
**CSS delta:**
```css
#web-projects {
  padding: var(--pad-section) 0 clamp(80px, 14vh, 160px);
}
#featured-projects {
  padding: clamp(80px, 14vh, 160px) 0 clamp(120px, 18vh, 220px);
}
```

---

## about.html — 3 changes

### 1. Uncomment the 3 story rows

**Target:** `#my-story .story-container` in about.html
**Mechanism:** Remove the HTML comment wrapping the Childhood, Guadeloupe, and Now story rows. The scrubbing text and parallax on these rows are already wired — no JS changes needed.
**Result:** Four story rows total (About me, Childhood, Guadeloupe, Now) — a proper narrative arc.

### 2. Exp/edu blocks — staggered scroll entry

**Target:** `.exp-block` elements inside `#experience` and `#education`
**Mechanism:** New `setupExpReveal()` function in `animations.js`. Uses a dedicated IntersectionObserver with `threshold: 0.1`. Sets `transitionDelay` per index within each section (0ms, 100ms, 200ms...). Adds `.visible` on intersection.
**CSS:**
```css
.exp-block {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.65s var(--ease-out), transform 0.65s var(--ease-out);
}
.exp-block.visible {
  opacity: 1;
  transform: none;
}
```
**Called from:** `script.js` → `setupExpReveal()` (applies to both about.html and any future page using `.exp-block`).

### 3. Full-bleed editorial break (Story → Experience)

**Target:** Between `#my-story` and `#experience` in about.html
**Mechanism:** A new `<div class="chapter-break">` element inserted in the HTML between the two sections. Contains a single `<p>` with a short, bold statement in Lux italic at display size.
**Copy:** *"I build digital work that is clear, ambitious, and grounded in real use."*
**CSS:**
```css
.chapter-break {
  width: 100%;
  padding: clamp(80px, 16vh, 180px) var(--pad-edge);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--section-gradient) center bottom / cover no-repeat fixed;
  position: relative;
  z-index: 2;
}
.chapter-break p {
  font-family: var(--font-display);
  font-style: italic;
  font-size: clamp(28px, 5vw, 72px);
  color: var(--white);
  max-width: 18ch;
  margin: 0;
  line-height: 1.1;
}
```
**Animation:** `.chapter-break p` observed by the main IntersectionObserver in `script.js` (same one used for `.title` elements) — adds `.visible` for a fade+slide entry. No scrubbing-text here (already heavy on about.html).

---

## Files touched

| File | Changes |
|---|---|
| `assets/styles/style.css` | Add hidden states + transitions for `.featured-project`, `.scatter-item`, `.exp-block`; increase section padding; add `.chapter-break` block |
| `assets/scripts/animations.js` | Add `setupExpReveal()` |
| `assets/scripts/projects.js` | Stagger logic in `setupWebProjects()` and `setupFeaturedProjects()` |
| `assets/scripts/script.js` | Import + call `setupExpReveal()`; add `.chapter-break p` to the main IntersectionObserver scope |
| `index.html` | No structural changes |
| `about.html` | Uncomment 3 story rows; add `.chapter-break` element between `#my-story` and `#experience` |

---

## Constraints

- No chapter numbers — explicitly excluded
- No new fonts, no new dependencies
- All animations respect `prefers-reduced-motion` (existing `prefersReducedMotion` guard in utils.js)
- Stagger delays: web projects 80ms, exp-blocks 100ms, scatter items by column index × 60ms
- No changes to grain, cursor, Lenis, parallax, scrubbing text, footer, navbar — those stay untouched
