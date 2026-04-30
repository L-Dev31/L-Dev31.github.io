/* ══════════════════════════════════════════
   Globals
   ══════════════════════════════════════════ */

const MOBILE_BREAKPOINT = 1024;
const REQUEST_TIMEOUT_MS = 8000;
const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= MOBILE_BREAKPOINT;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let pendingParallaxRefresh = null;
let lenis = null;
let projectsDataPromise = null;

function fetchJson(path, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const supportsAbortController = typeof AbortController === 'function';
    const controller = supportsAbortController ? new AbortController() : null;
    const timeoutId = setTimeout(() => controller?.abort(), timeoutMs);

    return fetch(path, controller ? { signal: controller.signal } : undefined)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Unable to load ${path} (${response.status} ${response.statusText})`);
            }
            return response.json();
        })
        .catch(error => {
            if (error?.name === 'AbortError') {
                throw new Error(`Request timeout while loading ${path} (${timeoutMs}ms)`);
            }
            throw error;
        })
        .finally(() => clearTimeout(timeoutId));
}

function getProjectsData() {
    if (!projectsDataPromise) {
        projectsDataPromise = fetchJson('assets/data/projects.json').catch(err => {
            projectsDataPromise = null;
            throw err;
        });
    }
    return projectsDataPromise;
}

function resolveProjectHref(path) {
    if (typeof path !== 'string') return null;

    const trimmed = path.trim();
    if (!trimmed) return null;

    if (/^(?:https?:)?\/\//i.test(trimmed) || /^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
        return trimmed;
    }

    return `${trimmed.replace(/\/+$/, '')}/`;
}

/* ══════════════════════════════════════════
   Page Load Overlay
   ══════════════════════════════════════════ */

function setupPageLoader() {
    const loader = document.querySelector('.page-loader');
    const bar    = document.querySelector('.page-loader-bar');
    if (!loader || !bar) return;

    let didFinish = false;
    let safetyTimeoutId = null;

    // Animate the bar to near-complete on DOM ready
    requestAnimationFrame(() => {
        bar.style.width = '85%';
    });

    function finish() {
        if (didFinish) return;
        didFinish = true;
        if (safetyTimeoutId) clearTimeout(safetyTimeoutId);

        bar.style.width = '100%';
        setTimeout(() => {
            loader.classList.add('done');
        }, 350);
    }

    if (document.readyState === 'complete') {
        finish();
    } else {
        window.addEventListener('load', finish, { once: true });
        // Safety timeout: finish after 2s even if load never fires
        safetyTimeoutId = setTimeout(finish, 2000);
    }
}

/* ══════════════════════════════════════════
   Mobile Menu
   ══════════════════════════════════════════ */

function setupMobileMenu() {
    const btn   = document.querySelector('.hamburger');
    const menu  = document.querySelector('.mobile-menu');
    const icon  = btn?.querySelector('i');
    if (!btn || !menu) return;

    const setMenuState = isOpen => {
        menu.setAttribute('aria-hidden', String(!isOpen));
        btn.setAttribute('aria-expanded', String(isOpen));
        if (icon) {
            icon.classList.toggle('fa-bars', !isOpen);
            icon.classList.toggle('fa-times', isOpen);
        }
    };

    function open() {
        menu.classList.add('open');
        setMenuState(true);
        if (lenis) lenis.stop();
    }

    function close() {
        menu.classList.remove('open');
        setMenuState(false);
        if (lenis) lenis.start();
    }

    setMenuState(menu.classList.contains('open'));

    btn.addEventListener('click', () => {
        menu.classList.contains('open') ? close() : open();
    });

    menu.querySelectorAll('.mobile-menu-link').forEach(a => {
        a.addEventListener('click', close);
    });
}

/* ══════════════════════════════════════════
   Lenis Smooth Scroll
   ══════════════════════════════════════════ */

function setupLenis() {
    if (prefersReducedMotion || typeof window.Lenis === 'undefined') return;

    lenis = new window.Lenis({
        duration: 1.2,
        easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        touchMultiplier: 2,
        infinite: false
    });

    function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
}

/* ══════════════════════════════════════════
   Magnetic Hover
   ══════════════════════════════════════════ */

function setupMagneticLinks() {
    if (isMobile || prefersReducedMotion) return;

    document.querySelectorAll('.link, .footer-links li a').forEach(el => {
        el.addEventListener('mousemove', e => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) * 0.25;
            const dy = (e.clientY - cy) * 0.25;
            el.style.transform = `translate(${dx}px, ${dy}px)`;
        });

        el.addEventListener('mouseleave', () => {
            el.style.transform = '';
        });
    });
}

/* ══════════════════════════════════════════
   Smooth Anchor Scroll
   ══════════════════════════════════════════ */

function setupSmoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', e => {
            const id = link.getAttribute('href');
            if (!id || id === '#') return;
            const target = document.querySelector(id);
            if (!target) return;
            e.preventDefault();

            if (lenis) {
                lenis.scrollTo(target, { offset: 0, duration: 1.2 });
            } else {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}


/* ══════════════════════════════════════════
   Scroll Reveal
   ══════════════════════════════════════════ */

const observer = typeof window.IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) e.target.classList.add('visible');
            else if (e.boundingClientRect.top > 0) e.target.classList.remove('visible');
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' })
    : null;

const observe = el => {
    if (!el) return;
    if (!observer) {
        el.classList.add('visible');
        return;
    }
    observer.observe(el);
};

/* ══════════════════════════════════════════
   Text Split (word-by-line reveal)
   ══════════════════════════════════════════ */

function splitIntoLines(el) {
    if (!el || el.dataset._split) return;
    el.dataset._split = '1';

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
                frag.appendChild(document.createTextNode(part));
            } else {
                const span = document.createElement('span');
                span.className = 'split-word';
                span.textContent = part;
                frag.appendChild(span);
            }
        });
        node.parentNode.replaceChild(frag, node);
    });

    const words = el.querySelectorAll('.split-word');
    if (!words.length) return;

    let line = 0;
    let lastTop = words[0].getBoundingClientRect().top;
    words.forEach(w => {
        const top = w.getBoundingClientRect().top;
        if (Math.abs(top - lastTop) > 2) { line++; lastTop = top; }
        w.style.transitionDelay = `${line * 0.12}s`;
    });

    el.classList.add('split-animated');
}

/* ══════════════════════════════════════════
   Appear Text Scroll Scrub (letter-by-letter)
   ══════════════════════════════════════════ */

function setupScrubbingText() {
    if (prefersReducedMotion) return;

    const blocks = Array.from(document.querySelectorAll('.scrubbing-text'))
        .filter(el => !el.dataset._scrubInit);

    if (!blocks.length) return;

    const states = [];

    blocks.forEach(block => {
        block.dataset._scrubInit = '1';

        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach(node => {
            const fragment = document.createDocumentFragment();
            const tokens = node.textContent.split(/(\s+)/);

            tokens.forEach(token => {
                if (!token) return;

                if (/^\s+$/.test(token)) {
                    fragment.appendChild(document.createTextNode(token));
                    return;
                }

                const word = document.createElement('span');
                word.className = 'scrubbing-word';

                for (const ch of token) {
                    const span = document.createElement('span');
                    span.className = 'scrubbing-char';
                    span.textContent = ch;
                    word.appendChild(span);
                }

                fragment.appendChild(word);
            });

            node.parentNode.replaceChild(fragment, node);
        });

        const chars = Array.from(block.querySelectorAll('.scrubbing-char'));
        if (!chars.length) return;

        const mappedChars = chars.map((el, index) => ({ el, revealIndex: index }));
        const letterCount = mappedChars.length;

        states.push({
            block,
            chars: mappedChars,
            totalLetters: Math.max(1, letterCount)
        });
    });

    if (!states.length) return;

    const clamp01 = v => Math.max(0, Math.min(1, v));
    let ticking = false;

    function paint() {
        const referenceY = window.innerHeight * 0.70;
        const transitionLetterSpan = 10;

        states.forEach(state => {
            const rect = state.block.getBoundingClientRect();
            const distance = Math.max(rect.height, 1);
            const blockProgress = clamp01((referenceY - rect.top) / distance);
            const revealTravel = (state.totalLetters - 1) + transitionLetterSpan;
            const revealCursor = blockProgress * revealTravel;

            state.chars.forEach(charInfo => {
                const charProgress = clamp01((revealCursor - charInfo.revealIndex) / transitionLetterSpan);
                const opacity = 0.2 + (0.8 * charProgress);
                let blur = 0;
                if (charProgress > 0 && charProgress < 1) {
                    const transitionPhase = 1 - Math.abs((charProgress * 2) - 1);
                    blur = transitionPhase * 7;
                }

                charInfo.el.style.opacity = opacity.toFixed(3);
                charInfo.el.style.filter = `blur(${blur.toFixed(2)}px)`;
            });
        });

        ticking = false;
    }

    function requestPaint() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(paint);
    }

    paint();

    window.addEventListener('scroll', requestPaint, { passive: true });
    window.addEventListener('resize', requestPaint, { passive: true });
    window.addEventListener('load', requestPaint);
}

/* ══════════════════════════════════════════
   Custom Cursor
   ══════════════════════════════════════════ */

function setupCursor() {
    if (isMobile || prefersReducedMotion) return;

    const cursor = document.querySelector('.cursor');
    if (!cursor) return;

    document.documentElement.classList.add('has-custom-cursor');

    document.addEventListener('mousemove', e => {
        const scale = cursor.classList.contains('cursor--small') ? ' scale(0.5)' : '';
        cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)${scale}`;
    });
    document.addEventListener('mouseover', e => {
        if (e.target.closest('a, button, .clickable')) cursor.classList.add('cursor--small');
    });
    document.addEventListener('mouseout', e => {
        if (e.target.closest('a, button, .clickable')) cursor.classList.remove('cursor--small');
    });
}

/* ══════════════════════════════════════════
   CTA Cursor
   ══════════════════════════════════════════ */

let CTACursor = null;

function setupCTACursor() {
    const el = document.querySelector('.cta-cursor');
    if (!el || isMobile || prefersReducedMotion) return;

    let x = 0, y = 0, tx = 0, ty = 0;
    let rafId = null;
    let activeTargets = 0;
    const textEl = el.querySelector('.cta-cursor-text');
    const arrowEl = el.querySelector('.cta-cursor-arrow');
    const dot = () => document.querySelector('.cursor');

    function loop() {
        x += (tx - x) * 0.15;
        y += (ty - y) * 0.15;
        el.style.left = `${x}px`;
        el.style.top  = `${y}px`;
        rafId = requestAnimationFrame(loop);
    }

    CTACursor = {
        show() {
            el.classList.add('active');
            const c = dot(); if (c) c.style.opacity = '0';
            if (!rafId) loop();
        },
        hide() {
            el.classList.remove('active');
            const c = dot(); if (c) c.style.opacity = '1';
            if (rafId && activeTargets === 0) { cancelAnimationFrame(rafId); rafId = null; }
        },
        move(cx, cy) { tx = cx; ty = cy; },
        setText(t) {
            if (!textEl || textEl.textContent === t) return;
            textEl.textContent = t;
        },
        setArrow(visible) { if (arrowEl) arrowEl.style.display = visible ? '' : 'none'; },
        attach(target, text, { showArrow = true } = {}) {
            target.addEventListener('mouseenter', e => {
                activeTargets++;
                this.setArrow(showArrow);
                if (text) this.setText(text);
                this.move(e.clientX, e.clientY);
                this.show();
            });
            target.addEventListener('mousemove',  e => this.move(e.clientX, e.clientY));
            target.addEventListener('mouseleave', () => {
                activeTargets = Math.max(0, activeTargets - 1);
                this.hide();
                this.setArrow(true);
            });
        }
    };
}

/* ══════════════════════════════════════════
   Header Title
   ══════════════════════════════════════════ */

function setupHeader() {
    const el = document.getElementById('site-title');
    if (!el || el.dataset._init) return;
    el.dataset._init = '1';

    const text = el.textContent;
    el.innerHTML = '';
    Array.from(text).forEach((ch, i) => {
        const span = document.createElement('span');
        span.className = 'site-title-letter';
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.transitionDelay = `${i * 0.03}s`;
        el.appendChild(span);
        setTimeout(() => span.classList.add('visible'), i * 30 + 50);
    });
}

/* ══════════════════════════════════════════
   Text Reveal
   ══════════════════════════════════════════ */

function setupTextReveal() {
    document.querySelectorAll('.title').forEach(observe);
    if (prefersReducedMotion) return;

    document.querySelectorAll('.story-text').forEach(st => {
        [st.querySelector('h3'), st.querySelector('.story-paragraph')].forEach(el => {
            if (!el || el.classList.contains('scrubbing-text')) return;
            splitIntoLines(el);
            observe(el);
        });
    });
}

/* ══════════════════════════════════════════
   Web Projects
   ══════════════════════════════════════════ */


function setupWebProjects() {
    const list    = document.querySelector('.featured-list');
    const preview = document.querySelector('.project-preview-container');
    const img     = document.querySelector('.project-preview-img');
    const desc    = document.querySelector('.project-preview-desc');
    if (!list || !preview || !img || !desc) return;

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

    function animPreview() {
        if (preview.style.display !== 'flex') return;
        cx += (tx - cx) * 0.1;
        cy += (ty - cy) * 0.1;
        preview.style.left = `${cx}px`;
        preview.style.top  = `${cy}px`;
        raf = requestAnimationFrame(animPreview);
    }

    function updatePosition(x, y) {
        const h = window.innerHeight;
        tx = x + h * 0.05;
        ty = y - h * 0.10;
    }

    function show(src, text, x, y) {
        if (isMobile || prefersReducedMotion) return;
        img.src = src;
        img.alt = text || 'Project preview';
        desc.textContent = text || '';
        preview.style.display = 'flex';
        updatePosition(x, y);
        if (!raf) animPreview();
    }

    function hide() {
        preview.style.display = 'none';
        cancelAnimationFrame(raf);
        raf = null;
    }

    getProjectsData().then(data => {
        const projects = (data.projects || []).filter(p => p.category === 'web' && !(isMobile && p.noPhone));

        if (!projects.length) { list.innerHTML = '<p class="projects-empty">No project available.</p>'; return; }

        projects.forEach(p => {
            const a = document.createElement('a');
            a.className = 'featured-project';

            const href = resolveProjectHref(p.path);
            if (href) {
                a.href = href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            } else {
                a.classList.add('featured-project--disabled');
                a.setAttribute('aria-disabled', 'true');
                a.tabIndex = -1;
            }

            // Title container
            const info = document.createElement('div');
            info.className = 'featured-project-info';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'featured-project-title';
            titleSpan.textContent = p.title;
            info.appendChild(titleSpan);

            const catSpan = document.createElement('span');
            catSpan.className = 'featured-project-category';
            catSpan.textContent = p.type || 'UI/UX Design';
            info.appendChild(catSpan);

            a.appendChild(info);

            // Right-side slot
            const meta = document.createElement('span');
            meta.className = 'featured-meta';

            if (p.creator?.trim() || href) {
                const slot = document.createElement('span');
                slot.className = 'featured-slot';

                if (p.creator?.trim()) {
                    const authorEl = document.createElement('span');
                    authorEl.className = 'featured-author';
                    authorEl.textContent = p.creator;
                    slot.appendChild(authorEl);
                }

                meta.appendChild(slot);
            }

            a.appendChild(meta);

            const src = `assets/images/websites/${p.id}.png`;
            if (href) {
                a.addEventListener('mouseenter', e => show(src, p.description, e.clientX, e.clientY));
                a.addEventListener('mousemove',  e => updatePosition(e.clientX, e.clientY));
                a.addEventListener('mouseleave', hide);
            }

            list.appendChild(a);
        });
    }).catch(() => {
        list.innerHTML = '<p class="projects-empty">Unable to load projects for now.</p>';
    });
}

function setupHeightScroll(containerSelector, itemSelector, minH = 130, maxH = 200) {
    const container = document.querySelector(containerSelector);
    if (!container || isMobile) return;

    const update = () => {
        const items = container.querySelectorAll(itemSelector);
        const vh = window.innerHeight;
        items.forEach(item => {
            const rect = item.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const distFromCenter = Math.abs(vh / 2 - center);
            const normalizedDist = Math.min(1, distFromCenter / (vh / 1.5));
            const h = maxH - (maxH - minH) * normalizedDist;
            item.style.height = `${h}px`;
            item.style.paddingTop = '0';
            item.style.paddingBottom = '0';
        });
    };

    window.addEventListener('scroll', update, { passive: true });
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true });
    update();
}

function setupFeaturedListHeightScroll() {
    setupHeightScroll('.featured-list', '.featured-project', 130, 200);
}

function setupExperienceHeightScroll() {
    setupHeightScroll('#experience .exp-stack', '.exp-block', 130, 200);
}

function setupEducationHeightScroll() {
    setupHeightScroll('#education .exp-stack', '.exp-block', 130, 200);
}

/* ══════════════════════════════════════════
   Featured Projects
   ══════════════════════════════════════════ */

function setupFeaturedProjects() {
    const container = document.querySelector('.featured-scatter');
    if (!container) return;

    getProjectsData().then(data => {
        const featured = (data.projects || []).filter(p => p.category === 'featured');

        if (!featured.length) { container.innerHTML = '<p class="projects-empty">No featured projects yet.</p>'; return; }

        const items = featured.map(p => {
            const a = document.createElement('a');
            a.className = 'scatter-item';

            const href = resolveProjectHref(p.path);
            const hasPath = Boolean(href);
            if (hasPath) {
                a.href = href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            } else {
                a.setAttribute('aria-disabled', 'true');
            }

            const image = new Image();
            image.alt = p.title;
            image.loading = 'lazy';
            image.decoding = 'async';

            function reveal() { image.classList.add('loaded'); }
            image.addEventListener('load', () => {
                if (image.decode) {
                    image.decode().then(reveal).catch(reveal);
                } else {
                    reveal();
                }
            });
            image.addEventListener('error', reveal);

            image.src = p.image || `assets/images/projects/${p.id}.png`;
            a.appendChild(image);

            if (CTACursor) CTACursor.attach(a, p.title, { showArrow: hasPath });
            return a;
        });

        function getColumnCount() {
            const w = window.innerWidth;
            if (w <= 480)  return 2;
            if (w <= 1024) return 3;
            return 4;
        }

        let currentCols = 0;
        let resizeRafId = null;

        function layoutColumns() {
            const cols = getColumnCount();
            if (cols === currentCols) return;
            currentCols = cols;

            container.innerHTML = '';
            container.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

            const columns = Array.from({ length: cols }, () => {
                const col = document.createElement('div');
                col.className = 'scatter-column';
                container.appendChild(col);
                return col;
            });

            items.forEach((a, i) => columns[i % cols].appendChild(a));
            pendingParallaxRefresh?.();
        }

        function onResize() {
            if (resizeRafId) return;
            resizeRafId = requestAnimationFrame(() => {
                resizeRafId = null;
                layoutColumns();
            });
        }

        layoutColumns();
        window.addEventListener('resize', onResize);

        if (document.readyState === 'complete') {
            pendingParallaxRefresh?.();
        } else {
            window.addEventListener('load', () => pendingParallaxRefresh?.(), { once: true });
        }

    }).catch(() => {
        container.innerHTML = '<p class="projects-empty">Unable to load featured projects.</p>';
    });
}

/* ══════════════════════════════════════════
   Parallax + Video Fade
   ══════════════════════════════════════════ */

function setupScrollEffects() {
    let ticking = false;
    const header = document.getElementById('header') || document.querySelector('.about-header');
    let items = [];

    function collect() {
        if (isMobile || prefersReducedMotion) {
            items = [];
            return;
        }
        const scrollTop = window.scrollY;
        items = Array.from(document.querySelectorAll('[data-parallax-speed]')).map(el => {
            const cssVar = getComputedStyle(el).getPropertyValue('--parallax-speed').trim();
            const speed  = cssVar ? parseFloat(cssVar) : parseFloat(el.dataset.parallaxSpeed);
            const baseTop = el.getBoundingClientRect().top + scrollTop;
            const halfHeight = el.offsetHeight / 2;
            return { el, speed, baseTop, halfHeight };
        });
    }

    function update() {
        if (header) {
            const fadeEnd = header.offsetHeight;
            const fadeStart = Math.max(0, fadeEnd - window.innerHeight);
            const range = fadeEnd - fadeStart || fadeEnd || 1;
            const progress = Math.min(1, Math.max(0, (window.scrollY - fadeStart) / range));
            header.style.setProperty('--hero-progress', progress.toFixed(4));
        }
        const viewCenter = window.scrollY + window.innerHeight / 2;
        items.forEach(({ el, speed, baseTop, halfHeight }) => {
            const factor = (speed - 100) / 100;
            if (factor === 0) return;
            el.style.transform = `translateY(${(baseTop + halfHeight - viewCenter) * factor}px)`;
        });
        ticking = false;
    }

    pendingParallaxRefresh = () => { collect(); update(); };

    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    window.addEventListener('resize', () => {
        collect();
        update();
    }, { passive: true });
    window.addEventListener('load', () => { collect(); update(); });
    collect();
    update();
}

/* ══════════════════════════════════════════
   Liquify  -  WebGL ping-pong FBO
   ══════════════════════════════════════════ */

function setupLiquifyAll() {
    if (isMobile || prefersReducedMotion) return;

    const VS = `attribute vec2 a;varying vec2 v;void main(){gl_Position=vec4(a,0,1);v=a*.5+.5;}`;
    const UPDATE_FS = `precision mediump float;
        varying vec2 v;
        uniform sampler2D u_prev;
        uniform vec2 u_cursor,u_vel;
        uniform float u_radius,u_decay;
        void main(){
            vec2 prev=(texture2D(u_prev,v).rg-.5)*2.0;
            float brush=smoothstep(u_radius,0.0,length((v-u_cursor)*vec2(16.0/9.0,1.0)));
            vec2 disp=clamp(prev*u_decay+u_vel*brush,-.5,.5);
            gl_FragColor=vec4(disp*.5+.5,0.0,1.0);
        }`;
    const RENDER_FS = `precision mediump float;
        varying vec2 v;
        uniform sampler2D u_src,u_disp;
        uniform float u_strength;
        void main(){
            vec2 disp=(texture2D(u_disp,v).rg-.5)*2.0;
            gl_FragColor=texture2D(u_src,clamp(v+disp*u_strength,0.0,1.0));
        }`;

    function initInstance(canvas, alphaBlend) {
        const gl = canvas.getContext('webgl', { alpha: alphaBlend, premultipliedAlpha: false });
        if (!gl) return null;

        const mkShader = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
        };
        const mkProg = (vs, fs) => {
            const p = gl.createProgram();
            gl.attachShader(p, mkShader(gl.VERTEX_SHADER, vs));
            gl.attachShader(p, mkShader(gl.FRAGMENT_SHADER, fs));
            gl.linkProgram(p);
            return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
        };
        const mkTex = (w, h, data) => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
            return t;
        };
        const mkFBO = tex => {
            const f = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, f);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return f;
        };

        const upProg = mkProg(VS, UPDATE_FS);
        const rnProg = mkProg(VS, RENDER_FS);
        if (!upProg || !rnProg) return null;

        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const bindQ = a => {
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(a);
            gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        };

        const DS = 128;
        const neutral = new Uint8Array(DS * DS * 4);
        for (let i = 0; i < neutral.length; i += 4) {
            neutral[i] = 128;
            neutral[i + 1] = 128;
            neutral[i + 2] = 0;
            neutral[i + 3] = 255;
        }
        let dR = mkTex(DS,DS,neutral), dW = mkTex(DS,DS,neutral);
        let fR = mkFBO(dR), fW = mkFBO(dW);
        const srcTex = mkTex(1,1,new Uint8Array([0,0,0,255]));

        const U = {
            prev:   gl.getUniformLocation(upProg,'u_prev'),
            cursor: gl.getUniformLocation(upProg,'u_cursor'),
            vel:    gl.getUniformLocation(upProg,'u_vel'),
            radius: gl.getUniformLocation(upProg,'u_radius'),
            decay:  gl.getUniformLocation(upProg,'u_decay'),
            src:    gl.getUniformLocation(rnProg,'u_src'),
            disp:   gl.getUniformLocation(rnProg,'u_disp'),
            str:    gl.getUniformLocation(rnProg,'u_strength'),
            aUp:    gl.getAttribLocation(upProg,'a'),
            aRn:    gl.getAttribLocation(rnProg,'a'),
        };

        return { gl, upProg, rnProg, dR, dW, fR, fW, srcTex, U, DS, neutral, mkTex, mkFBO, bindQ };
    }

    function runInstance({ canvas, source, isVideo, containingEl, alwaysOn }) {
        const inst = initInstance(canvas, isVideo ? false : true);
        if (!inst) return;

        let { gl, upProg, rnProg, dR, dW, fR, fW, srcTex, U, DS, bindQ } = inst;

        let cx=.5,cy=.5,rawVX=0,rawVY=0,smVX=0,smVY=0,over=false,srcReady=false;

        const resize = () => {
            const dpr = devicePixelRatio||1;
            const r = canvas.getBoundingClientRect();
            canvas.width = r.width*dpr; canvas.height = r.height*dpr;
        };
        window.addEventListener('resize', resize, { passive:true });
        resize();

        document.addEventListener('mousemove', e => {
            const r = canvas.getBoundingClientRect();
            const nx = (e.clientX-r.left)/r.width;
            const ny = (e.clientY-r.top)/r.height;
            rawVX = nx-cx; rawVY = ny-cy;
            cx = nx; cy = ny;
            if (alwaysOn) { over = true; return; }
            const zone = containingEl || canvas;
            const zr = zone.getBoundingClientRect();
            over = e.clientY>=zr.top && e.clientY<=zr.bottom;
        });

        if (!isVideo) {
            const load = () => {
                if (!source.complete||!source.naturalWidth) return;
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, srcTex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                try { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source); srcReady=true; } catch(_){}
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                source.style.opacity = '0';
            };
            if (source.complete) load(); else source.addEventListener('load', load);
        } else {
            source.addEventListener('playing', () => { source.style.opacity='0'; });
        }

        (function render() {
            smVX+=(rawVX-smVX)*.25; smVY+=(rawVY-smVY)*.25;
            rawVX*=.75; rawVY*=.75;
            const vx=over?smVX*4:0, vy=over?smVY*4:0;

            gl.bindFramebuffer(gl.FRAMEBUFFER, fW);
            gl.viewport(0,0,DS,DS);
            gl.useProgram(upProg);
            bindQ(U.aUp);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,dR);
            gl.uniform1i(U.prev,0);
            gl.uniform2f(U.cursor,cx,1-cy);
            gl.uniform2f(U.vel,-vx,vy);
            gl.uniform1f(U.radius,.14);
            gl.uniform1f(U.decay,.91);
            gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
            [dR,dW]=[dW,dR]; [fR,fW]=[fW,fR];

            if (isVideo) {
                if (source.readyState>=2) {
                    srcReady=true;
                    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,srcTex);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
                    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
                }
            }

            if (srcReady) {
                gl.bindFramebuffer(gl.FRAMEBUFFER,null);
                gl.viewport(0,0,canvas.width,canvas.height);
                gl.useProgram(rnProg);
                bindQ(U.aRn);
                gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,srcTex); gl.uniform1i(U.src,1);
                gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,dR);     gl.uniform1i(U.disp,0);
                gl.uniform1f(U.str,.12);
                gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
            }

            requestAnimationFrame(render);
        })();
    }

    const heroCanvas = document.getElementById('hero-canvas');
    const heroVideo  = document.getElementById('hero-video');
    if (heroCanvas && heroVideo) {
        runInstance({ canvas: heroCanvas, source: heroVideo, isVideo: true, containingEl: document.getElementById('header'), alwaysOn: false });
    }

    document.querySelectorAll('img.liquify').forEach(img => {
        const parent = img.parentElement;
        parent.style.position = 'relative';
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
        parent.appendChild(canvas);
        runInstance({ canvas, source: img, isVideo: false, containingEl: parent, alwaysOn: false });
    });
}

/* ══════════════════════════════════════════
   About Page — Scroll-driven video scrub
   ══════════════════════════════════════════ */

function setupAboutHeroVideo() {
    const container = document.querySelector('.about-header');
    const video = document.querySelector('.about-header-video');
    if (!container || !video) return;

    video.pause();
    video.currentTime = 0;

    if (prefersReducedMotion) {
        video.play().catch(() => {});
        return;
    }

    let targetTime = 0, rafId = null, vfcPending = false;
    const hasVFC = typeof video.requestVideoFrameCallback === 'function';

    function next() {
        rafId = requestAnimationFrame(scrubLoop);
    }

    function scrubLoop() {
        if (!video.duration) { rafId = requestAnimationFrame(scrubLoop); return; }
        const diff = targetTime - video.currentTime;

        if (Math.abs(diff) < 0.02) {
            if (!video.paused) video.pause();
            video.playbackRate = 1;
            rafId = null;
            return;
        }

        if (diff > 0) {
            const rate = Math.min(8, Math.max(0.25, diff * 6));
            if (Math.abs(video.playbackRate - rate) > 0.05) video.playbackRate = rate;
            if (video.paused) video.play().catch(() => {});
            next();
        } else {
            if (!video.paused) video.pause();
            video.currentTime = Math.max(0, video.currentTime + diff * 0.35);
            if (hasVFC && !vfcPending) {
                vfcPending = true;
                video.requestVideoFrameCallback(() => {
                    vfcPending = false;
                    next();
                });
            } else if (!hasVFC) {
                next();
            }
        }
    }

    const textEl = document.querySelector('.about-header-text');
    const overlayEl = document.querySelector('.about-header-overlay');

    function scrub() {
        if (!video.duration) return;
        const scrollable = container.offsetHeight - window.innerHeight;
        if (scrollable <= 0) return;
        const progress = Math.max(0, Math.min(1, -container.getBoundingClientRect().top / scrollable));
        targetTime = progress * video.duration;
        if (!rafId && !vfcPending) rafId = requestAnimationFrame(scrubLoop);

        // Update progress for CSS (fades, blurs)
        container.style.setProperty('--hero-progress', progress.toFixed(4));

        const past = window.scrollY >= container.offsetHeight;
        video.style.visibility = past ? 'hidden' : '';
        if (textEl) textEl.style.visibility = past ? 'hidden' : '';
        if (overlayEl) overlayEl.style.visibility = past ? 'hidden' : '';
        
        // Refresh parallax just in case
        if (pendingParallaxRefresh) pendingParallaxRefresh();
    }

    video.addEventListener('loadedmetadata', scrub);
    window.addEventListener('scroll', scrub, { passive: true });
    window.addEventListener('resize', scrub, { passive: true });
    scrub();
}

/* ══════════════════════════════════════════
   Pause background videos when offscreen
   ══════════════════════════════════════════ */

function setupVideoVisibility() {
    if (typeof window.IntersectionObserver !== 'function') return;

    const videos = document.querySelectorAll('#hero-video, .footer-bg-video');
    if (!videos.length) return;

    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const v = entry.target;
            if (entry.isIntersecting) {
                if (v.paused) v.play().catch(() => {});
            } else {
                if (!v.paused) v.pause();
            }
        });
    }, { threshold: 0.01 });

    videos.forEach(v => io.observe(v));
}

/* ══════════════════════════════════════════
   Back to Top
   ══════════════════════════════════════════ */

function setupBackToTop() {
    const btn = document.getElementById('back-to-top');
    const textContainer = document.getElementById('btt-text');
    if (!btn || !textContainer) return;

    // Create circular text from the string
    const text = textContainer.textContent;
    textContainer.innerHTML = '';
    const chars = Array.from(text);
    const totalChars = chars.length;
    const degPerChar = 360 / totalChars;

    chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.transform = `rotate(${i * degPerChar}deg)`;
        textContainer.appendChild(span);
    });

    const footer = document.getElementById('footer');
    const updateVisibility = () => {
        if (!footer) {
            if (window.scrollY > window.innerHeight * 0.5) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
            return;
        }
        
        const rect = footer.getBoundingClientRect();
        // Visible if footer top is within viewport
        if (rect.top < window.innerHeight) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    };

    window.addEventListener('scroll', updateVisibility, { passive: true });
    btn.addEventListener('click', () => {
        if (lenis) {
            lenis.scrollTo(0);
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    updateVisibility();
}

/* ══════════════════════════════════════════
   Init
   ══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    const setupTasks = [
        ['page loader', setupPageLoader],
        ['lenis', setupLenis],
        ['mobile menu', setupMobileMenu],
        ['cursor', setupCursor],
        ['cta cursor', setupCTACursor],
        ['header', setupHeader],
        ['text scrubbing', setupScrubbingText],
        ['text reveal', setupTextReveal],
        ['web projects', setupWebProjects],
        ['featured list height', setupFeaturedListHeightScroll],
        ['featured projects', setupFeaturedProjects],
        ['scroll effects', setupScrollEffects],
        ['liquify', setupLiquifyAll],
        ['smooth anchors', setupSmoothAnchors],
        ['about hero video', setupAboutHeroVideo],
        ['video visibility', setupVideoVisibility],
        ['back to top', setupBackToTop]
    ];

    setupTasks.forEach(([name, task]) => {
        try {
            task();
        } catch (error) {
            console.error(`[init] ${name} failed`, error);
        }
    });

});
