// Scroll and mouse effects used on the home and about pages.
import { isMobile, reducedMotion, clamp01, throttled } from './common.js';

// Every character of .scrubbing-text fades and un-blurs in reading order as the block scrolls up.
export function scrubbingText() {
    if (reducedMotion) return;
    const SPREAD = 10; // how many characters are mid-transition at once

    const blocks = [...document.querySelectorAll('.scrubbing-text')].map(block => ({ block, chars: splitChars(block) }));

    const paint = () => {
        const readingLine = innerHeight * 0.7;
        for (const { block, chars } of blocks) {
            const r = block.getBoundingClientRect();
            if (r.top > innerHeight || r.bottom < 0) continue;
            const head = clamp01((readingLine - r.top) / Math.max(r.height, 1)) * (chars.length - 1 + SPREAD);
            chars.forEach((char, i) => {
                const t = clamp01((head - i) / SPREAD);
                const blur = t > 0 && t < 1 ? (1 - Math.abs(t * 2 - 1)) * 7 : 0;
                char.style.opacity = (0.2 + 0.8 * t).toFixed(3);
                char.style.filter = blur > 0.1 ? `blur(${blur.toFixed(2)}px)` : '';
            });
        }
    };

    const schedule = throttled(paint);
    ['scroll', 'resize', 'load'].forEach(event => addEventListener(event, schedule, { passive: true }));
    paint();
}

function splitChars(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
        const fragment = document.createDocumentFragment();
        for (const char of node.textContent) {
            if (/\s/.test(char)) {
                fragment.append(char);
                continue;
            }
            const span = document.createElement('span');
            span.className = 'scrubbing-char';
            span.textContent = char;
            fragment.append(span);
        }
        node.replaceWith(fragment);
    }
    return [...block.querySelectorAll('.scrubbing-char')];
}

// [data-parallax-speed] elements drift relative to the viewport centre: 100 is static, 90 lags behind, 110 runs ahead.
// Also exposes the hero's scroll progress (0 → 1) as --hero-progress for the CSS blur/fade.
// Returns a function to call after the layout changes.
export function parallax() {
    const hero = document.querySelector('#header, .about-header');
    let items = [];

    const measure = () => {
        if (isMobile || reducedMotion) return;
        items = [...document.querySelectorAll('[data-parallax-speed]')].map(el => {
            el.style.transform = '';
            const r = el.getBoundingClientRect();
            return { el, factor: el.dataset.parallaxSpeed / 100 - 1, center: r.top + scrollY + r.height / 2 };
        });
    };

    const update = () => {
        const start = Math.max(0, hero.offsetHeight - innerHeight);
        const length = Math.min(hero.offsetHeight, innerHeight) || 1;
        hero.style.setProperty('--hero-progress', clamp01((scrollY - start) / length).toFixed(4));

        const viewportCenter = scrollY + innerHeight / 2;
        for (const { el, factor, center } of items) {
            if (factor) el.style.transform = `translateY(${(center - viewportCenter) * factor}px)`;
        }
    };

    const refresh = () => {
        measure();
        update();
    };

    addEventListener('scroll', throttled(update), { passive: true });
    addEventListener('resize', refresh, { passive: true });
    addEventListener('load', refresh);
    refresh();
    return refresh;
}

// About page: the hero video follows the scroll position instead of playing on its own.
export function scrollScrubbedVideo() {
    const hero = document.querySelector('.about-header');
    if (!hero) return;
    const video = hero.querySelector('video');
    const layers = hero.querySelectorAll('video, .about-header-overlay, .about-header-text');

    video.pause();
    video.currentTime = 0;
    if (reducedMotion) {
        video.play().catch(() => {});
        return;
    }

    let target = 0, frame = null, waitingForFrame = false;

    // Videos can't play backwards: play forwards (faster the further behind), step backwards by hand.
    const seek = () => {
        frame = null;
        if (!video.duration) {
            frame = requestAnimationFrame(seek);
            return;
        }
        const diff = target - video.currentTime;
        if (Math.abs(diff) < 0.02) {
            video.pause();
            video.playbackRate = 1;
        } else if (diff > 0) {
            const rate = Math.min(8, Math.max(0.25, diff * 6));
            if (Math.abs(video.playbackRate - rate) > 0.05) video.playbackRate = rate;
            if (video.paused) video.play().catch(() => {});
            frame = requestAnimationFrame(seek);
        } else {
            video.pause();
            video.currentTime = Math.max(0, video.currentTime + diff * 0.35);
            if (!video.requestVideoFrameCallback) {
                frame = requestAnimationFrame(seek);
                return;
            }
            waitingForFrame = true;
            video.requestVideoFrameCallback(() => {
                waitingForFrame = false;
                frame = requestAnimationFrame(seek);
            });
        }
    };

    const onScroll = () => {
        const scrollable = hero.offsetHeight - innerHeight;
        if (!video.duration || scrollable <= 0) return;
        target = clamp01(-hero.getBoundingClientRect().top / scrollable) * video.duration;
        if (!frame && !waitingForFrame) frame = requestAnimationFrame(seek);

        const scrolledPast = scrollY >= hero.offsetHeight;
        layers.forEach(el => el.style.visibility = scrolledPast ? 'hidden' : '');
    };

    video.addEventListener('loadedmetadata', onScroll);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    onScroll();
}

// A "See more" pill that trails the mouse while hovering a target.
export function ctaCursor() {
    const pill = document.querySelector('.cta-cursor');
    if (!pill || isMobile || reducedMotion) return null;
    const label = pill.querySelector('.cta-cursor-text');
    const dot = document.querySelector('.cursor');
    let x = 0, y = 0, targetX = 0, targetY = 0, frame = null;

    const follow = () => {
        x += (targetX - x) * 0.15;
        y += (targetY - y) * 0.15;
        pill.style.left = `${x}px`;
        pill.style.top = `${y}px`;
        frame = requestAnimationFrame(follow);
    };
    const aim = e => {
        targetX = e.clientX;
        targetY = e.clientY;
    };

    return {
        attach(target, text) {
            target.addEventListener('mouseenter', e => {
                aim(e);
                label.textContent = text;
                pill.classList.add('active');
                dot.style.opacity = '0';
                frame ??= requestAnimationFrame(follow);
            });
            target.addEventListener('mousemove', aim);
            target.addEventListener('mouseleave', () => {
                pill.classList.remove('active');
                dot.style.opacity = '1';
                cancelAnimationFrame(frame);
                frame = null;
            });
        },
    };
}

// Home hero: WebGL "liquid" distortion of the background video that follows the mouse.
// A 128×128 displacement field is pushed around by the mouse velocity and slowly relaxes
// (ping-ponged between two framebuffers), then used to offset where the video is sampled.
const VERTEX = `
    attribute vec2 position;
    varying vec2 uv;
    void main() {
        gl_Position = vec4(position, 0.0, 1.0);
        uv = position * 0.5 + 0.5;
    }`;

const UPDATE_FIELD = `
    precision mediump float;
    varying vec2 uv;
    uniform sampler2D field;
    uniform vec2 mouse, velocity;
    void main() {
        vec2 previous = (texture2D(field, uv).rg - 0.5) * 2.0;
        float brush = smoothstep(0.14, 0.0, length((uv - mouse) * vec2(16.0 / 9.0, 1.0)));
        vec2 displacement = clamp(previous * 0.91 + velocity * brush, -0.5, 0.5);
        gl_FragColor = vec4(displacement * 0.5 + 0.5, 0.0, 1.0);
    }`;

const DRAW_VIDEO = `
    precision mediump float;
    varying vec2 uv;
    uniform sampler2D video, field;
    void main() {
        vec2 displacement = (texture2D(field, uv).rg - 0.5) * 2.0;
        gl_FragColor = texture2D(video, clamp(uv + displacement * 0.12, 0.0, 1.0));
    }`;

export function liquidHero() {
    const canvas = document.getElementById('hero-canvas');
    const video = document.getElementById('hero-video');
    const hero = document.getElementById('header');
    if (!canvas || isMobile || reducedMotion) return;
    const gl = canvas.getContext('webgl', { alpha: false, premultipliedAlpha: false });
    if (!gl) return;

    const program = fragment => {
        const p = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            gl.attachShader(p, shader);
        }
        gl.bindAttribLocation(p, 0, 'position');
        gl.linkProgram(p);
        return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    };
    const texture = (size, pixels) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return t;
    };
    const target = tex => {
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fb };
    };

    const updateField = program(UPDATE_FIELD);
    const drawVideo = program(DRAW_VIDEO);
    if (!updateField || !drawVideo) return;

    // Full-screen quad shared by both programs.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Field textures start at (0.5, 0.5) = no displacement. Unit 0 holds the field, unit 1 the video.
    const SIZE = 128;
    const still = new Uint8Array(SIZE * SIZE * 4).map((_, i) => [128, 128, 0, 255][i % 4]);
    let read = target(texture(SIZE, still));
    let write = target(texture(SIZE, still));
    const videoTexture = texture(1, new Uint8Array([0, 0, 0, 255]));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.activeTexture(gl.TEXTURE0);

    gl.useProgram(drawVideo);
    gl.uniform1i(gl.getUniformLocation(drawVideo, 'video'), 1);
    gl.uniform1i(gl.getUniformLocation(drawVideo, 'field'), 0);
    gl.useProgram(updateField);
    gl.uniform1i(gl.getUniformLocation(updateField, 'field'), 0);
    const mouseUniform = gl.getUniformLocation(updateField, 'mouse');
    const velocityUniform = gl.getUniformLocation(updateField, 'velocity');

    let mouseX = 0.5, mouseY = 0.5, lastX = 0.5, lastY = 0.5, velocityX = 0, velocityY = 0;
    let overHero = false, hasFrame = false;

    document.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        mouseX = (e.clientX - r.left) / r.width;
        mouseY = (e.clientY - r.top) / r.height;
        const h = hero.getBoundingClientRect();
        overHero = e.clientY >= h.top && e.clientY <= h.bottom;
    });

    const resize = () => {
        const r = canvas.getBoundingClientRect();
        canvas.width = r.width * devicePixelRatio;
        canvas.height = r.height * devicePixelRatio;
    };
    addEventListener('resize', resize, { passive: true });
    resize();

    // The canvas takes over once the video is running.
    video.addEventListener('playing', () => video.style.opacity = '0');

    const render = () => {
        if (gl.isContextLost()) return;
        velocityX += (mouseX - lastX - velocityX) * 0.25;
        velocityY += (mouseY - lastY - velocityY) * 0.25;
        lastX = mouseX;
        lastY = mouseY;

        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
        gl.viewport(0, 0, SIZE, SIZE);
        gl.useProgram(updateField);
        gl.bindTexture(gl.TEXTURE_2D, read.tex);
        gl.uniform2f(mouseUniform, mouseX, 1 - mouseY);
        gl.uniform2f(velocityUniform, overHero ? -velocityX * 4 : 0, overHero ? velocityY * 4 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        [read, write] = [write, read];

        if (video.readyState >= 2) {
            gl.activeTexture(gl.TEXTURE1);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.activeTexture(gl.TEXTURE0);
            hasFrame = true;
        }

        if (hasFrame) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.useProgram(drawVideo);
            gl.bindTexture(gl.TEXTURE_2D, read.tex);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        requestAnimationFrame(render);
    };
    render();
}
