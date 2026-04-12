/* ══════════════════════════════════════════
   Globals
   ══════════════════════════════════════════ */

const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 1024;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let pendingParallaxRefresh = null;

function fetchJson(path) {
    return fetch(path, { cache: 'no-store' }).then(r => {
        if (!r.ok) throw new Error(`${path} (${r.status})`);
        return r.json();
    });
}

/* ══════════════════════════════════════════
   Scroll Reveal
   ══════════════════════════════════════════ */

const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
        else if (e.boundingClientRect.top > 0) e.target.classList.remove('visible');
    });
}, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });

const observe = el => el && observer.observe(el);

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

    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    document.body.appendChild(cursor);

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

const CTACursor = (() => {
    const el = document.querySelector('.cta-cursor');
    if (!el || isMobile || prefersReducedMotion) return null;

    let x = 0, y = 0, tx = 0, ty = 0;
    const textEl = el.querySelector('.cta-cursor-text');
    const arrowEl = el.querySelector('.cta-cursor-arrow');
    const dot = () => document.querySelector('.cursor');

    (function loop() {
        x += (tx - x) * 0.15;
        y += (ty - y) * 0.15;
        el.style.left = `${x}px`;
        el.style.top  = `${y}px`;
        requestAnimationFrame(loop);
    })();

    return {
        show()  { el.classList.add('active');    const c = dot(); if (c) c.style.opacity = '0'; },
        hide()  { el.classList.remove('active'); const c = dot(); if (c) c.style.opacity = '1'; },
        move(cx, cy) { tx = cx; ty = cy; },
        setText(t)   { if (textEl) textEl.textContent = t; },
        setArrow(visible) { if (arrowEl) arrowEl.style.display = visible ? '' : 'none'; },
        attach(target, text, { showArrow = true } = {}) {
            target.addEventListener('mouseenter', e => { this.setArrow(showArrow); if (text) this.setText(text); this.move(e.clientX, e.clientY); this.show(); });
            target.addEventListener('mousemove',  e => this.move(e.clientX, e.clientY));
            target.addEventListener('mouseleave', () => { this.hide(); this.setArrow(true); });
        }
    };
})();

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

    function show(src, text, x, y) {
        if (isMobile || prefersReducedMotion) return;
        img.src = src;
        desc.textContent = text || '';
        preview.style.display = 'flex';
        const h = window.innerHeight;
        tx = x + h * 0.05;
        ty = y - h * 0.10;
        if (!raf) animPreview();
    }

    function hide() {
        preview.style.display = 'none';
        cancelAnimationFrame(raf);
        raf = null;
    }

    fetchJson('projects.json').then(data => {
        const projects = (data.projects || []).filter(p => p.category === 'web' && !(isMobile && p.noPhone));

        if (!projects.length) { list.innerHTML = '<p class="projects-empty">No project available.</p>'; return; }

        projects.forEach(p => {
            const a = document.createElement('a');
            a.className = 'featured-project';
            a.textContent = p.title;
            a.href = p.path.startsWith('http') ? p.path : `${p.path}/`;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';

            if (p.creator?.trim()) {
                const s = document.createElement('span');
                s.className = 'featured-author';
                s.textContent = ` ${p.creator}`;
                a.appendChild(s);
            }

            const src = `Elements/image/website/${p.id}.png`;
            a.addEventListener('mouseenter', e => show(src, p.description, e.clientX, e.clientY));
            a.addEventListener('mousemove',  e => show(src, p.description, e.clientX, e.clientY));
            a.addEventListener('mouseleave', hide);
            list.appendChild(a);
        });
    }).catch(() => {
        list.innerHTML = '<p class="projects-empty">Unable to load projects for now.</p>';
    });
}

/* ══════════════════════════════════════════
   Featured Projects
   ══════════════════════════════════════════ */

function setupFeaturedProjects() {
    const container = document.querySelector('.featured-scatter');
    if (!container) return;

    fetchJson('projects.json').then(data => {
        const featured = (data.projects || []).filter(p => p.category === 'featured');

        if (!featured.length) { container.innerHTML = '<p class="projects-empty">No featured projects yet.</p>'; return; }

        container.innerHTML = '';
        const columnCount = 4;
        const columns = Array.from({ length: columnCount }, () => {
            const col = document.createElement('div');
            col.className = 'scatter-column';
            container.appendChild(col);
            return col;
        });

        featured.forEach((p, index) => {
            const a = document.createElement('a');
            a.className = 'scatter-item';

            const hasPath = typeof p.path === 'string' && p.path.trim().length > 0;
            if (hasPath) {
                a.href = p.path;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            } else {
                a.setAttribute('aria-disabled', 'true');
            }

            const image = document.createElement('img');
            image.src = p.image || `Elements/image/project/${p.id}.png`;
            image.alt = p.title;
            image.loading = 'lazy';
            image.decoding = 'async';
            a.appendChild(image);

            if (CTACursor) CTACursor.attach(a, p.title, { showArrow: hasPath });
            columns[index % columnCount].appendChild(a);
        });

        window.addEventListener('load', () => pendingParallaxRefresh?.());

    }).catch(() => {
        container.innerHTML = '<p class="projects-empty">Unable to load featured projects.</p>';
    });
}

/* ══════════════════════════════════════════
   Parallax + Video Fade
   ══════════════════════════════════════════ */

function setupScrollEffects() {
    let ticking = false;
    const header = document.getElementById('header');
    let items = [];
    let heroFadeDistance = Math.max(window.innerHeight * 0.9, 480);

    function collect() {
        if (isMobile || prefersReducedMotion) {
            items = [];
            return;
        }
        const scrollTop = window.pageYOffset;
        items = Array.from(document.querySelectorAll('[data-parallax-speed], .scatter-column')).map(el => {
            const cssVar = getComputedStyle(el).getPropertyValue('--parallax-speed').trim();
            const speed  = cssVar ? parseFloat(cssVar) : (parseFloat(el.dataset.parallaxSpeed) || 100);
            const baseTop = el.getBoundingClientRect().top + scrollTop;
            return { el, speed, baseTop };
        });
    }

    function update() {
        if (header) {
            const progress = Math.min(1, Math.max(0, window.scrollY / heroFadeDistance));
            header.style.setProperty('--hero-progress', progress.toFixed(4));
        }
        const viewCenter = window.scrollY + window.innerHeight / 2;
        items.forEach(({ el, speed, baseTop }) => {
            const factor = (speed - 100) / 100;
            if (factor === 0) return;
            el.style.transform = `translateY(${(baseTop + el.offsetHeight / 2 - viewCenter) * factor}px)`;
        });
        ticking = false;
    }

    pendingParallaxRefresh = () => { collect(); update(); };

    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    window.addEventListener('resize', () => {
        heroFadeDistance = Math.max(window.innerHeight * 0.9, 480);
        collect();
        update();
    }, { passive: true });
    window.addEventListener('load', () => { collect(); update(); });
    collect();
    update();
}

/* ══════════════════════════════════════════
   Liquify (WebGL ping-pong FBO)
   ══════════════════════════════════════════ */

function setupLiquify() {
    const canvas = document.getElementById('hero-canvas');
    const video  = document.getElementById('hero-video');
    if (!canvas || !video || isMobile || prefersReducedMotion) return;

    const gl = canvas.getContext('webgl', { alpha: false });
    if (!gl) return;

    function makeShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }

    function makeProgram(vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, makeShader(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, makeShader(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    }

    function makeTex(w, h, data) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
        return t;
    }

    function makeFBO(tex) {
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return f;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    const bindQuad = a => {
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    };

    const VS = `attribute vec2 a; varying vec2 v; void main() { gl_Position = vec4(a,0,1); v = a*.5+.5; }`;

    const updateProg = makeProgram(VS,
        `precision mediump float;
         varying vec2 v;
         uniform sampler2D u_prev;
         uniform vec2 u_cursor, u_vel;
         uniform float u_radius, u_decay;
         void main() {
             vec2 prev = (texture2D(u_prev, v).rg - .5) * 2.0;
             float brush = smoothstep(u_radius, 0.0, length((v - u_cursor) * vec2(16.0/9.0, 1.0)));
             vec2 disp = clamp(prev * u_decay + u_vel * brush, -.5, .5);
             gl_FragColor = vec4(disp * .5 + .5, 0.0, 1.0);
         }`
    );

    const renderProg = makeProgram(VS,
        `precision mediump float;
         varying vec2 v;
         uniform sampler2D u_video, u_disp;
         uniform float u_strength;
         void main() {
             vec2 disp = (texture2D(u_disp, v).rg - .5) * 2.0;
             gl_FragColor = texture2D(u_video, clamp(v + disp * u_strength, 0.0, 1.0));
         }`
    );

    if (!updateProg || !renderProg) return;

    const U = {
        prev:   gl.getUniformLocation(updateProg, 'u_prev'),
        cursor: gl.getUniformLocation(updateProg, 'u_cursor'),
        vel:    gl.getUniformLocation(updateProg, 'u_vel'),
        radius: gl.getUniformLocation(updateProg, 'u_radius'),
        decay:  gl.getUniformLocation(updateProg, 'u_decay'),
        video:  gl.getUniformLocation(renderProg, 'u_video'),
        disp:   gl.getUniformLocation(renderProg, 'u_disp'),
        str:    gl.getUniformLocation(renderProg, 'u_strength'),
    };
    const aUp = gl.getAttribLocation(updateProg, 'a');
    const aRn = gl.getAttribLocation(renderProg, 'a');

    const DSIZE   = 128;
    const neutral = new Uint8Array(DSIZE * DSIZE * 4).fill(0).map((_, i) => i % 4 < 2 ? 128 : (i % 4 === 3 ? 255 : 0));
    let dispR = makeTex(DSIZE, DSIZE, neutral), dispW = makeTex(DSIZE, DSIZE, neutral);
    let fboR  = makeFBO(dispR),                 fboW  = makeFBO(dispW);
    const videoTex = makeTex(1, 1, new Uint8Array([0,0,0,255]));

    let cx = .5, cy = .5, rawVX = 0, rawVY = 0, smVX = 0, smVY = 0, overHeader = false;
    const header = document.getElementById('header');

    document.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;
        const ny = (e.clientY - r.top)  / r.height;
        rawVX = nx - cx; rawVY = ny - cy;
        cx = nx; cy = ny;
        const hr = header.getBoundingClientRect();
        overHeader = e.clientY >= hr.top && e.clientY <= hr.bottom;
    });

    const resize = () => {
        const dpr = devicePixelRatio || 1;
        const r = canvas.getBoundingClientRect();
        canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    };
    window.addEventListener('resize', resize, { passive: true });
    resize();

    let videoReady = false;

    function render() {
        smVX += (rawVX - smVX) * 0.25; smVY += (rawVY - smVY) * 0.25;
        rawVX *= 0.75; rawVY *= 0.75;

        const vx = overHeader ? smVX * 4 : 0;
        const vy = overHeader ? smVY * 4 : 0;

        gl.bindFramebuffer(gl.FRAMEBUFFER, fboW);
        gl.viewport(0, 0, DSIZE, DSIZE);
        gl.useProgram(updateProg);
        bindQuad(aUp);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, dispR);
        gl.uniform1i(U.prev, 0);
        gl.uniform2f(U.cursor, cx, 1 - cy);
        gl.uniform2f(U.vel, -vx, vy);
        gl.uniform1f(U.radius, 0.14);
        gl.uniform1f(U.decay,  0.91);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        [dispR, dispW] = [dispW, dispR];
        [fboR,  fboW]  = [fboW,  fboR];

        if (video.readyState >= 2) {
            videoReady = true;
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, videoTex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        }

        if (videoReady) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.useProgram(renderProg);
            bindQuad(aRn);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, videoTex); gl.uniform1i(U.video, 1);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dispR);    gl.uniform1i(U.disp, 0);
            gl.uniform1f(U.str, 0.12);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        requestAnimationFrame(render);
    }

    video.addEventListener('playing', () => { video.style.opacity = '0'; });
    render();
}

/* ══════════════════════════════════════════
   Init
   ══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    setupCursor();
    setupHeader();
    setupScrubbingText();
    setupTextReveal();
    setupWebProjects();
    setupFeaturedProjects();
    setupScrollEffects();
    setupLiquify();
});
