import { isMobile, prefersReducedMotion, clamp01, observe } from './utils.js';

export function setupLenis() {
    if (prefersReducedMotion || typeof window.Lenis === 'undefined') return null;
    const lenis = new window.Lenis({ duration: 1.2, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), touchMultiplier: 2 });
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    return lenis;
}

export function setupMagneticLinks() {
    if (isMobile || prefersReducedMotion) return;
    document.querySelectorAll('.link, .footer-links li a').forEach(el => {
        el.addEventListener('mousemove', e => {
            const r = el.getBoundingClientRect();
            el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * 0.25}px, ${(e.clientY - (r.top + r.height / 2)) * 0.25}px)`;
        });
        el.addEventListener('mouseleave', () => el.style.transform = '');
    });
}

export function splitIntoLines(el) {
    if (!el || el.dataset._split) return;
    el.dataset._split = '1';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
            else {
                const span = document.createElement('span');
                span.className = 'split-word'; span.textContent = part;
                frag.appendChild(span);
            }
        });
        node.parentNode.replaceChild(frag, node);
    });

    const words = el.querySelectorAll('.split-word');
    if (!words.length) return;
    let line = 0, lastTop = words[0].getBoundingClientRect().top;
    words.forEach(w => {
        const top = w.getBoundingClientRect().top;
        if (Math.abs(top - lastTop) > 2) { line++; lastTop = top; }
        w.style.transitionDelay = `${line * 0.12}s`;
    });
    el.classList.add('split-animated');
}

export function setupScrubbingText() {
    if (prefersReducedMotion) return;
    const blocks = Array.from(document.querySelectorAll('.scrubbing-text')).filter(el => !el.dataset._scrubInit);
    if (!blocks.length) return;

    const states = blocks.map(block => {
        block.dataset._scrubInit = '1';
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach(node => {
            const frag = document.createDocumentFragment();
            node.textContent.split(/(\s+)/).forEach(token => {
                if (!token) return;
                if (/^\s+$/.test(token)) frag.appendChild(document.createTextNode(token));
                else {
                    const word = document.createElement('span');
                    word.className = 'scrubbing-word';
                    for (const ch of token) {
                        const span = document.createElement('span');
                        span.className = 'scrubbing-char'; span.textContent = ch;
                        word.appendChild(span);
                    }
                    frag.appendChild(word);
                }
            });
            node.parentNode.replaceChild(frag, node);
        });
        const chars = Array.from(block.querySelectorAll('.scrubbing-char'));
        return { block, chars: chars.map((el, i) => ({ el, revealIndex: i })), total: Math.max(1, chars.length) };
    });

    const paint = () => {
        const vh = window.innerHeight, refY = vh * 0.7, span = 10;
        states.forEach(s => {
            const r = s.block.getBoundingClientRect();
            if (r.top > vh || r.bottom < 0) return;
            const cursor = clamp01((refY - r.top) / Math.max(r.height, 1)) * (s.total - 1 + span);
            s.chars.forEach(c => {
                const prog = clamp01((cursor - c.revealIndex) / span);
                c.el.style.opacity = (0.2 + 0.8 * prog).toFixed(3);
                const blur = prog > 0 && prog < 1 ? (1 - Math.abs(prog * 2 - 1)) * 7 : 0;
                c.el.style.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : '';
            });
        });
    };

    let ticking = false;
    const requestPaint = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { paint(); ticking = false; }); } };
    ['scroll', 'resize', 'load'].forEach(ev => window.addEventListener(ev, requestPaint, { passive: true }));
    paint();
}

export function setupHeader() {
    const el = document.getElementById('site-title');
    if (!el || el.dataset._init) return;
    el.dataset._init = '1';
    const text = el.textContent; el.innerHTML = '';
    Array.from(text).forEach((ch, i) => {
        const span = document.createElement('span');
        span.className = 'site-title-letter'; span.textContent = ch === ' ' ? '\u00A0' : ch;
        span.style.transitionDelay = `${i * 0.03}s`; el.appendChild(span);
        setTimeout(() => span.classList.add('visible'), i * 30 + 50);
    });
}

export function setupTextReveal(observer) {
    document.querySelectorAll('.title').forEach(el => observe(el, observer));
    if (prefersReducedMotion) return;
    document.querySelectorAll('.story-text').forEach(st => {
        [st.querySelector('h3'), st.querySelector('.story-paragraph')].forEach(el => {
            if (el && !el.classList.contains('scrubbing-text')) { splitIntoLines(el); observe(el, observer); }
        });
    });
}

export function setupScrollEffects() {
    const header = document.getElementById('header') || document.querySelector('.about-header');
    let items = [], ticking = false;

    const collect = () => {
        if (isMobile || prefersReducedMotion) { items = []; return; }
        const s = window.scrollY;
        items = Array.from(document.querySelectorAll('[data-parallax-speed]')).map(el => {
            const speed = parseFloat(getComputedStyle(el).getPropertyValue('--parallax-speed')) || parseFloat(el.dataset.parallaxSpeed);
            return { el, speed, baseTop: el.getBoundingClientRect().top + s, halfH: el.offsetHeight / 2 };
        });
    };

    const update = () => {
        if (header) {
            const h = header.offsetHeight, prog = clamp01((window.scrollY - Math.max(0, h - window.innerHeight)) / (h - Math.max(0, h - window.innerHeight) || h || 1));
            header.style.setProperty('--hero-progress', prog.toFixed(4));
        }
        const center = window.scrollY + window.innerHeight / 2;
        items.forEach(({ el, speed, baseTop, halfH }) => {
            const f = (speed - 100) / 100;
            if (f) el.style.transform = `translateY(${(baseTop + halfH - center) * f}px)`;
        });
        ticking = false;
    };

    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { collect(); update(); }, { passive: true });
    window.addEventListener('load', () => { collect(); update(); });
    collect(); update();
    return () => { collect(); update(); }; // Return refresh function
}

export function setupLiquifyAll() {
    if (isMobile || prefersReducedMotion) return;
    const VS = `attribute vec2 a;varying vec2 v;void main(){gl_Position=vec4(a,0,1);v=a*.5+.5;}`;
    const UFS = `precision mediump float;varying vec2 v;uniform sampler2D u_prev;uniform vec2 u_cursor,u_vel;uniform float u_radius,u_decay;void main(){vec2 prev=(texture2D(u_prev,v).rg-.5)*2.0;float brush=smoothstep(u_radius,0.0,length((v-u_cursor)*vec2(16.0/9.0,1.0)));vec2 disp=clamp(prev*u_decay+u_vel*brush,-.5,.5);gl_FragColor=vec4(disp*.5+.5,0.0,1.0);}`;
    const RFS = `precision mediump float;varying vec2 v;uniform sampler2D u_src,u_disp;uniform float u_strength;void main(){vec2 disp=(texture2D(u_disp,v).rg-.5)*2.0;gl_FragColor=texture2D(u_src,clamp(v+disp*u_strength,0.0,1.0));}`;

    const init = (canvas, alpha) => {
        const gl = canvas.getContext('webgl', { alpha, premultipliedAlpha: false });
        if (!gl) return null;
        const mkS = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; };
        const mkP = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, mkS(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mkS(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null; };
        const mkT = (w, h, d) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, 10241, 9729); gl.texParameteri(gl.TEXTURE_2D, 10240, 9729); gl.texParameteri(gl.TEXTURE_2D, 10242, 33071); gl.texParameteri(gl.TEXTURE_2D, 10243, 33071); gl.texImage2D(gl.TEXTURE_2D, 0, 6408, w, h, 0, 6408, 5121, d || null); return t; };
        const upP = mkP(VS, UFS), rnP = mkP(VS, RFS); if (!upP || !rnP) return null;
        const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const DS = 128, n = new Uint8Array(DS * DS * 4).map((_, i) => i % 4 < 2 ? 128 : (i % 4 === 3 ? 255 : 0));
        let dR = mkT(DS, DS, n), dW = mkT(DS, DS, n);
        return { gl, upP, rnP, dR, dW, fR: gl.createFramebuffer(), fW: gl.createFramebuffer(), srcT: mkT(1, 1, new Uint8Array([0, 0, 0, 255])), DS, U: { p: gl.getUniformLocation(upP, 'u_prev'), c: gl.getUniformLocation(upP, 'u_cursor'), v: gl.getUniformLocation(upP, 'u_vel'), r: gl.getUniformLocation(upP, 'u_radius'), d: gl.getUniformLocation(upP, 'u_decay'), s: gl.getUniformLocation(rnP, 'u_src'), di: gl.getUniformLocation(rnP, 'u_disp'), st: gl.getUniformLocation(rnP, 'u_strength'), aU: gl.getAttribLocation(upP, 'a'), aR: gl.getAttribLocation(rnP, 'a') }, quad };
    };

    const run = (cfg) => {
        const inst = init(cfg.canvas, cfg.isVideo ? false : true); if (!inst) return;
        let { gl, upP, rnP, dR, dW, fR, fW, srcT, U, DS, quad } = inst;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fR); gl.framebufferTexture2D(gl.FRAMEBUFFER, 36064, 3553, dR, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fW); gl.framebufferTexture2D(gl.FRAMEBUFFER, 36064, 3553, dW, 0);
        let cx = 0.5, cy = 0.5, vx = 0, vy = 0, over = false, ready = false;
        const res = () => { const d = devicePixelRatio || 1, r = cfg.canvas.getBoundingClientRect(); cfg.canvas.width = r.width * d; cfg.canvas.height = r.height * d; };
        window.addEventListener('resize', res, { passive: true }); res();
        document.addEventListener('mousemove', e => { const r = cfg.canvas.getBoundingClientRect(); cx = (e.clientX - r.left) / r.width; cy = (e.clientY - r.top) / r.height; if (cfg.alwaysOn) { over = true; return; } const z = cfg.containingEl || cfg.canvas, zr = z.getBoundingClientRect(); over = e.clientY >= zr.top && e.clientY <= zr.bottom; });
        const load = () => { if (!cfg.source.complete) return; gl.activeTexture(gl.TEXTURE33985); gl.bindTexture(gl.TEXTURE_2D, srcT); gl.pixelStorei(37440, true); gl.texImage2D(gl.TEXTURE_2D, 0, 6408, 6408, 5121, cfg.source); ready = true; gl.pixelStorei(37440, false); cfg.source.style.opacity = '0'; };
        if (cfg.isVideo) cfg.source.addEventListener('playing', () => cfg.source.style.opacity = '0'); else if (cfg.source.complete) load(); else cfg.source.addEventListener('load', load);

        let pVX = 0, pVY = 0;
        (function render() {
            vx += (cx - pVX - vx) * 0.25; vy += (cy - pVY - vy) * 0.25; pVX = cx; pVY = cy;
            gl.bindFramebuffer(gl.FRAMEBUFFER, fW); gl.viewport(0, 0, DS, DS); gl.useProgram(upP);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(U.aU); gl.vertexAttribPointer(U.aU, 2, 5126, false, 0, 0);
            gl.activeTexture(gl.TEXTURE33984); gl.bindTexture(gl.TEXTURE_2D, dR); gl.uniform1i(U.p, 0);
            gl.uniform2f(U.c, cx, 1 - cy); gl.uniform2f(U.v, over ? -vx * 4 : 0, over ? vy * 4 : 0);
            gl.uniform1f(U.r, 0.14); gl.uniform1f(U.d, 0.91); gl.drawArrays(5, 0, 4);
            [dR, dW] = [dW, dR]; [fR, fW] = [fW, fR];
            if (cfg.isVideo && cfg.source.readyState >= 2) { ready = true; gl.activeTexture(gl.TEXTURE33985); gl.bindTexture(gl.TEXTURE_2D, srcT); gl.pixelStorei(37440, true); gl.texImage2D(gl.TEXTURE_2D, 0, 6408, 6408, 5121, cfg.source); gl.pixelStorei(37440, false); }
            if (ready) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cfg.canvas.width, cfg.canvas.height); gl.useProgram(rnP); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(U.aR); gl.vertexAttribPointer(U.aR, 2, 5126, false, 0, 0); gl.activeTexture(gl.TEXTURE33985); gl.bindTexture(gl.TEXTURE_2D, srcT); gl.uniform1i(U.s, 1); gl.activeTexture(gl.TEXTURE33984); gl.bindTexture(gl.TEXTURE_2D, dR); gl.uniform1i(U.di, 0); gl.uniform1f(U.st, 0.12); gl.drawArrays(5, 0, 4); }
            requestAnimationFrame(render);
        })();
    };

    const hC = document.getElementById('hero-canvas'), hV = document.getElementById('hero-video');
    if (hC && hV) run({ canvas: hC, source: hV, isVideo: true, containingEl: document.getElementById('header'), alwaysOn: false });
    document.querySelectorAll('img.liquify').forEach(img => {
        img.parentElement.style.position = 'relative';
        const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
        img.parentElement.appendChild(c); run({ canvas: c, source: img, isVideo: false, containingEl: img.parentElement, alwaysOn: false });
    });
}
