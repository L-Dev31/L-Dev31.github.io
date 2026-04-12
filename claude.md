# L-Dev31 Portfolio – Claude Code Guide

## Quick Start
- **Owner:** Léo Tosku (UI/UX Designer, Graphic Designer)
- **Type:** Personal portfolio + commissioned web projects
- **Root files:** Main portfolio (index.html, style.css, script.js)
- **Projects:** In dedicated folders (SandFall/, Elements/, etc.)
- **Data format:** JSON (projects.json, companies.json)

**⚠️ Excluded folders (DO NOT MODIFY):** Stock, smag, BlackGoose, BMGE, LSDP, Others

---

## Portfolio Architecture

### Root Level
```
index.html          → Main portfolio page
style.css           → Global styles (dark theme, typography, effects)
script.js           → Core animations, scroll behavior, data loading
projects.json       → Project metadata
companies.json      → Work experience data
Elements/           → Shared assets (fonts, images, icons)
  ├── font/         → Custom typefaces
  └── image/        → Logo, favicon, portraits, company logos
```

### Project Structure
Each project folder contains:
```
index.html          → Project page
styles.css          → Project-specific styles
script.js           → Interactive elements
```

---

## Artistic Direction – The L-Dev31 Visual Language

### 🎨 Design Philosophy
- **Minimalist Elegance:** Clean, spacious layouts with intentional negative space
- **Dark Luxury:** Premium feel through dark backgrounds and subtle lighting effects
- **Innovation Focus:** Bold typography paired with smooth, refined interactions
- **Medium agnostic:** Consistent look across desktop and mobile

---

### Color Palette (CSS Variables in `:root`)

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | `#080808` | Primary background |
| `--bg-dark` | `#1c1c1c` | Secondary background, cards |
| `--white` | `#ffffff` | Pure white, highlights |
| `--text` | `#ccc` | Default text color |
| `--muted` | `#aaa` | Secondary text, disabled states |
| `--white-06` | `rgba(255,255,255,0.06)` | Subtle glass borders |
| `--glass-05` | `rgba(255,255,255,0.05)` | Glass background effect |
| `--border-strong` | `rgba(255,255,255,0.2)` | Strong borders, dividers |

**✅ DO:**
- Use the CSS variables—never hardcode colors
- Maintain high contrast: light text on dark backgrounds
- Use opacity/rgba for glassmorphism effects
- Keep color count minimal (≤ 3-4 accent colors per component)

**❌ DON'T:**
- Add bright colors (no `#ff0000`, neon colors)
- Use light backgrounds
- Apply colors directly—always use variables
- Mix too many color families (stick to grayscale + 1-2 accents)

---

### Typography

#### Font Stack (Custom & Google Fonts)

| Font | Weight | Style | Usage |
|------|--------|-------|-------|
| **Thin** | Regular | Light, elegant | Body text, descriptions |
| **Bold** | 900 | Heavy, impact | Headings, emphasis |
| **Heavitas** | — | Bold monospace feel | Titles, project names |
| **Lux** | 400 | Geometric | Accent text, CTAs |
| **Playfair Display** | 700 | Serif, classic | Large headers (optional) |
| **Material Symbols** | — | Icon font | UI icons (camera, menu, etc.) |

**✅ DO:**
- Use Thin for body/description text (thin = 200-400 weight equivalent)
- Use Bold for main headings (h1, h2)
- Pair Heavitas with minimalist layouts for tech projects
- Use Material Symbols for all icon buttons
- Apply letter-spacing for large titles to increase luxury feel
- Maintain readable line-height (1.5-1.8) for body text

**❌ DON'T:**
- Use system fonts; always apply custom fonts
- Mix more than 2 font families in one section
- Use serif fonts for UI buttons/navigation
- Apply font-weight `400` to Bold family (use Thin instead)
- Forget to load fonts with `<link rel="preconnect">` for performance

---

### Visual Effects & Interactions

#### Background Elements
- **Video backgrounds:** Dark, cinematic hero videos with parallax effects
- **Noise overlay:** Subtle film grain texture (`.noise` class)
- **Gradient overlays:** Rare; only for major transitions

**✅ DO:**
- Use `filter: grayscale() blur() brightness()` for video modulation
- Apply `data-parallax-speed` attribute for scroll-linked elements
- Load videos with `autoplay loop muted playsinline`
- Use `pointer-events: none` on decorative elements

**❌ DON'T:**
- Add bright color overlays on videos
- Autoplay sound (videos must be muted)
- Use videos for non-hero sections

#### Animations & Transitions
- **Observer-based animation:** Trigger on scroll (IntersectionObserver API)
- **Cursor effects:** Custom cursor replacing OS cursor
- **Smooth transitions:** Default `transition: 0.1s-0.3s` for micro-interactions
- **Text splitting:** Split paragraphs into word/line spans for staggered fade-in

**✅ DO:**
- Use `IntersectionObserver` for scroll animations
- Keep animation duration ≤ 600ms
- Add `will-change: transform` only when animating
- Respect `prefers-reduced-motion` media query
- Trigger classes with `.visible` on intersection

**❌ DON'T:**
- Use `onscroll` event handlers (use Observer API)
- Create animations that last >1s without user trigger
- Animate layout properties (use `transform` instead)
- Ignore accessibility: always check `prefersReducedMotion`

#### Glass & Transparency Effects
- **Glassmorphism:** Subtle backgrounds with `background: rgba(255,255,255,0.05)` + `backdrop-filter: blur()`
- **Always pair:** Glassmorphism + border in `--white-06` or `--border-strong`

**✅ DO:**
- Apply `backdrop-filter: blur(10px)` for glass cards
- Combine with thin white borders `1px solid var(--white-06)`
- Use only on top layers (avoid deep nesting)

**❌ DON'T:**
- Apply glassmorphism to body/main backgrounds
- Use blur > 20px (performance impact)
- Ignore fallback colors (not all browsers support backdrop-filter)

---

### Cursor & Interaction Design

- **Custom cursor:** Always hidden (CSS `cursor: none !important`)
- **Cursor element:** Replaced by `.cursor` div (styled in JS)
- **CTA cursor:** Special hover state with "See more" text + arrow

**✅ DO:**
- Apply `cursor: none !important` to clickable elements
- Show custom cursor on hover over interactive elements
- Use `.cta-cursor` for "see more" / navigation hover states
- Change cursor size/style on different components

**❌ DON'T:**
- Use default OS cursor
- Leave any element with default `cursor: pointer`
- Create cursor effects without parallax/smoothing

---

### Layout & Spacing

#### Bento Grid System
- Used for featured projects
- Responsive: auto-fit columns with `minmax(250px, 1fr)`
- Gap: `var(--grid-gap)` (typically 24px)

#### Flexbox & Grid
- **Navigation:** Flex with space-between
- **Projects list:** CSS Grid for responsive layouts
- **Sections:** Full-width containers with centered content

**✅ DO:**
- Use CSS Grid for 2+ column layouts
- Use Flexbox for single-row components (nav, buttons)
- Define gap variables globally
- Use `gap` property instead of margin hacks

**❌ DON'T:**
- Mix inline styles with CSS classes
- Hardcode pixel values (use CSS variables)
- Use floats for layout

---

### Mobile & Responsive Design

#### Breakpoints
```css
/* Desktop-first approach */
@media (max-width: 1200px) { /* Tablets & wide phones */ }
@media (max-width: 768px)  { /* Tablets & phones */ }
@media (max-width: 480px)  { /* Small phones */ }
```

#### Mobile-Specific Elements
- **Icon navigation:** `.link-mobile` buttons with Material Symbols
- **Simplified layouts:** Reduce columns, increase padding
- **Font scaling:** Use `clamp(min, preferred, max)` for responsive typography

**✅ DO:**
- Test on real devices (not just chrome DevTools)
- Use `max-width` media queries (mobile-first concept, desktop tweaks)
- Apply `aspect-ratio` for images/videos
- Use `object-fit: cover` for image containers

**❌ DON'T:**
- Hide content entirely on mobile (accessibility issue)
- Create desktop-only features
- Use hard pixel values for responsive elements

---

### Component Patterns

#### Header Section
- **Background:** Video + noise overlay + title
- **Parallax:** Applied to images & text
- **Animation:** Fade-in on scroll with text splitting

```html
<!-- Pattern -->
<section id="header">
    <h1>{{ title }}</h1>
    <p class="quote">{{ tagline }}</p>
</section>
```

#### Project Cards
- **Structure:** Image + metadata (title, description, type)
- **Hover state:** Scale, opacity change, custom cursor
- **Responsive:** Stack on mobile

```html
<!-- Pattern -->
<div class="project-card" data-parallax-speed="70">
    <img src="" alt="" />
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
</div>
```

#### Navigation
- **Sticky/fixed:** Positioned at top
- **Links:** Desktop text + mobile icons
- **Logo:** SVG (crisp scaling)

```html
<!-- Pattern -->
<nav class="navbar">
    <img src="Elements/image/logo.svg" alt="" />
    <div class="links">
        <a href="#section">Link</a>
    </div>
</nav>
```

---

### Performance Guidelines

**✅ DO:**
- Load images with `loading="lazy" decoding="async"`
- Use CSS `will-change` only for animated elements
- Minify JSON data (no extra whitespace)
- Defer non-critical JS with `<script defer>`
- Use `preconnect` for external fonts/CDNs

**❌ DON'T:**
- Load all images eagerly
- Apply `will-change` globally
- Include unused CSS/JS files
- Load fonts synchronously
- Create animations on page load

---

## Coding Standards

### CSS
```css
/* Variable naming (camelCase) */
--primaryBg: #080808;
--cardBg: #1c1c1c;

/* Always group related properties */
.component {
    /* Layout */
    display: flex;
    gap: 1rem;
    
    /* Typography */
    font-family: 'Thin';
    font-size: 1rem;
    
    /* Styling */
    background: var(--bg-dark);
    border: 1px solid var(--white-06);
    
    /* Effects */
    transition: all 0.3s ease;
}
```

### JavaScript
```javascript
// Module Pattern
const ComponentName = (() => {
    const init = () => { /* setup */ };
    const handleEvent = () => { /* logic */ };
    return { init };
})();

// Always check for reduced motion
if (!prefersReducedMotion) { /* animate */ }

// Use IntersectionObserver for scroll effects
const observer = new IntersectionObserver(/* callback */);
observer.observe(element);
```

### HTML
- Valid semantic HTML5
- Accessibility: `aria-labels`, `alt` text, heading hierarchy
- Data attributes: `data-parallax-speed`, `data-id`, etc.
- No inline styles

---

## Common Tasks in Claude Code

### Adding a New Project
1. Add entry to `projects.json`
2. Create project folder with standard structure (index.html, styles.css, script.js)
3. Match color scheme & typography
4. Test on mobile

### Updating Styles
1. Always use CSS variables
2. Never hardcode colors
3. Test across breakpoints
4. Check contrast ratio (WCAG AA minimum)

### Animation/Interactivity
1. Use IntersectionObserver (not onscroll)
2. Check `prefersReducedMotion`
3. Keep duration ≤ 600ms
4. Pair animations with transitions

### Adding New Elements
1. Copy existing component patterns
2. Match typography family + sizing
3. Apply correct spacing with CSS grid/flex
4. Test cursor interactions

---

## Before You Start Coding

✅ **Checklist:**
- [ ] Use CSS variables for all colors
- [ ] Respect dark theme (no light backgrounds)
- [ ] Apply custom fonts (no system fonts)
- [ ] Add `loading="lazy"` to images
- [ ] Test `prefers-reduced-motion`
- [ ] Use Material Symbols for icons
- [ ] Check mobile responsiveness
- [ ] Maintain component patterns
- [ ] No hardcoded pixel values
- [ ] Accessibility: alt text, aria-labels

---

## Quick Reference: CSS Variables to Use

```css
/* Always available in :root */
--bg              /* #080808 - Primary bg */
--bg-dark         /* #1c1c1c - Secondary bg */
--white           /* #ffffff - White */
--text            /* #ccc - Default text */
--muted           /* #aaa - Secondary text */
--white-06        /* rgba(255,255,255,0.06) - Subtle border */
--glass-05        /* rgba(255,255,255,0.05) - Glass bg */
--border-strong   /* rgba(255,255,255,0.2) - Strong border */
```

---

## When to Reach Out / Limitations

- Custom domain configuration → check hosting provider
- Advanced animations (3D) → consider performance
- SEO optimization → ensure `<meta>` tags
- Analytics setup → integrate tracking library
- Form submissions → requires backend endpoint

