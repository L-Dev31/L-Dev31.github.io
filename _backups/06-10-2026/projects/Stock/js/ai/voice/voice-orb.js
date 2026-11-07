// The voice and microphone levels shape the bubble and drive the halo's size and brightness.
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
let threePromise;

function loadThree() {
    threePromise ||= import(THREE_URL);
    return threePromise;
}

const SNOISE = /* glsl */ `
    vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + 2.0 * C.xxx;
        vec3 x3 = x0 - D.yyy;
        i = mod(i, 289.0);
        vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m *= m;
        return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }
`;

/* ── the body: a soft, slowly flowing surface, pushed outward by the voice ── */
const coreVertex = /* glsl */ `
    uniform float uTime;
    uniform float uEnergy;
    varying vec3 vNormal;
    varying vec3 vDir;
    varying vec3 vView;
    ${SNOISE}
    float field(vec3 d) {
        float e = uEnergy;
        float slow = snoise(d * 1.2 + vec3(0.0, uTime * 0.16, uTime * 0.11));
        float fine = snoise(d * 2.4 - vec3(uTime * 0.22, 0.0, uTime * 0.18));
        float wave = sin(dot(d, vec3(0.28, 1.0, 0.18)) * 4.0 - uTime * (1.6 + e * 6.0));
        return slow * (0.035 + e * 0.15) + fine * (0.004 + e * 0.055) + wave * e * 0.05;
    }
    void main() {
        vec3 d = normalize(position);
        float r = length(position);
        vec3 t1 = normalize(cross(d, abs(d.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
        vec3 t2 = cross(d, t1);
        const float eps = 0.012;
        vec3 dA = normalize(d + t1 * eps);
        vec3 dB = normalize(d + t2 * eps);
        vec3 p0 = d * (r + field(d));
        vec3 pA = dA * (r + field(dA));
        vec3 pB = dB * (r + field(dB));
        vec3 n = normalize(cross(pA - p0, pB - p0));
        if (dot(n, d) < 0.0) n = -n;
        vec4 mv = modelViewMatrix * vec4(p0, 1.0);
        vNormal = normalize(normalMatrix * n);
        vDir = d;
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
    }
`;

/* A small nebula inside, faint stars, a key light for depth and a bright rim. */
const coreFragment = /* glsl */ `
    uniform float uTime;
    uniform vec3 uDeep;
    uniform vec3 uColA;
    uniform vec3 uColB;
    uniform vec3 uColC;
    varying vec3 vNormal;
    varying vec3 vDir;
    varying vec3 vView;
    float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vnoise(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; } return v; }
    void main() {
        vec3 N = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 V = normalize(vView);
        float ndv = abs(dot(N, V));
        float fres = pow(1.0 - ndv, 2.6);
        vec3 q = vDir * 1.9 + vec3(0.0, uTime * 0.05, uTime * 0.03);
        float warp = fbm(q * 1.6 + uTime * 0.09);
        float f = fbm(q + warp * 1.35);
        float g = fbm(q * 2.3 - warp + 7.0);
        vec3 col = uDeep;
        col = mix(col, uColA * 0.85, smoothstep(0.42, 0.68, f));
        col = mix(col, uColB * 0.9, smoothstep(0.58, 0.8, g) * 0.35);
        col += uColC * pow(smoothstep(0.55, 0.85, f), 3.0) * 0.5;
        vec3 cell = vDir * 34.0;
        float h = hash(floor(cell));
        float speck = smoothstep(0.22, 0.0, length(fract(cell) - 0.5)) * step(0.975, h);
        col += uColC * speck * (0.55 + 0.45 * sin(uTime * 2.6 + h * 60.0)) * (0.35 + ndv);
        vec3 L = normalize(vec3(-0.55, 0.75, 0.55));
        col *= 0.7 + max(dot(N, L), 0.0) * 0.5;
        col += mix(uColA, uColC, 0.35) * fres * 1.3;
        // A clear heart: the surface is opaque at its edge and fades to nothing where it faces the viewer.
        float alpha = clamp(0.04 + pow(1.0 - ndv, 1.7) * 1.05, 0.0, 1.0) * (gl_FrontFacing ? 1.0 : 0.45);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
    }
`;

/* ── the atmosphere: a glow around the body, brighter with the voice ── */
const haloVertex = /* glsl */ `
    varying vec3 vNormal;
    void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
const haloFragment = /* glsl */ `
    uniform vec3 uColor;
    uniform float uStrength;
    varying vec3 vNormal;
    void main() {
        // A ring of light hugging the bubble's edge; nothing in front of its clear heart.
        float z = max(-vNormal.z, 0.0);
        float edge = 0.78;
        float glow = (z < edge ? pow(z / edge, 3.0) : exp(-(z - edge) * 10.0)) * uStrength;
        gl_FragColor = vec4(uColor * glow, glow);
        #include <colorspace_fragment>
    }
`;

/* ── stardust: specks orbiting on tilted paths, twinkling ── */
const dustVertex = /* glsl */ `
    uniform float uTime;
    uniform float uSwirl;
    uniform float uPixel;
    attribute vec3 aAxis;
    attribute float aSpeed;
    attribute float aSize;
    attribute float aPhase;
    varying float vTwinkle;
    vec3 spin(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
    void main() {
        vec3 p = spin(position, aAxis, uSwirl * aSpeed + aPhase);
        p *= 1.0 + sin(uTime * 0.7 + aPhase) * 0.02;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vTwinkle = 0.45 + 0.55 * sin(uTime * (1.2 + aSpeed) + aPhase * 7.0);
        gl_PointSize = aSize * uPixel * (7.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;
const dustFragment = /* glsl */ `
    uniform vec3 uColor;
    varying float vTwinkle;
    void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(smoothstep(0.5, 0.0, d), 2.0) * vTwinkle;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
    }
`;

// How far the canvas reaches past the orb's box, so the glow and the dust are not cut off (matches styles/assistant.css).
const CANVAS_SCALE = 1.9;

/** Mounts the orb. Returns null when WebGL or the CDN is unavailable: the CSS orb stays. */
export async function mountVoiceOrb(container) {
    if (!container) return null;
    try {
        const THREE = await loadThree();
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.setAttribute('aria-hidden', 'true');

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
        camera.position.z = 3.9 * CANVAS_SCALE;
        const group = new THREE.Group();
        scene.add(group);

        const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const shared = { uTime: { value: 0 }, uEnergy: { value: 0 } };
        const colors = { deep: new THREE.Color('#1A1340'), a: new THREE.Color('#A99CFF'), b: new THREE.Color('#4FE0A3'), c: new THREE.Color('#DCD7EF') };

        const coreMat = new THREE.ShaderMaterial({
            vertexShader: coreVertex,
            fragmentShader: coreFragment,
            uniforms: { ...shared, uDeep: { value: colors.deep }, uColA: { value: colors.a }, uColB: { value: colors.b }, uColC: { value: colors.c } },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 28), coreMat);

        const haloMat = new THREE.ShaderMaterial({
            vertexShader: haloVertex,
            fragmentShader: haloFragment,
            uniforms: { uColor: { value: colors.a }, uStrength: { value: 0.3 } },
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
        });
        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.45, 48, 32), haloMat);

        const COUNT = 170;
        const pos = new Float32Array(COUNT * 3), axis = new Float32Array(COUNT * 3);
        const speed = new Float32Array(COUNT), size = new Float32Array(COUNT), phase = new Float32Array(COUNT);
        const v = new THREE.Vector3(), k = new THREE.Vector3();
        for (let i = 0; i < COUNT; i++) {
            v.randomDirection().multiplyScalar(1.12 + Math.pow(Math.random(), 1.8) * 0.9);
            k.randomDirection().cross(v).normalize();
            pos.set([v.x, v.y, v.z], i * 3);
            axis.set([k.x, k.y, k.z], i * 3);
            speed[i] = (0.25 + Math.random() * 0.75) * (Math.random() < 0.5 ? -1 : 1);
            size[i] = 1.2 + Math.pow(Math.random(), 3) * 3.2;
            phase[i] = Math.random() * Math.PI * 2;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        dustGeo.setAttribute('aAxis', new THREE.BufferAttribute(axis, 3));
        dustGeo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
        dustGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
        dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
        const dustMat = new THREE.ShaderMaterial({
            vertexShader: dustVertex,
            fragmentShader: dustFragment,
            uniforms: { ...shared, uSwirl: { value: 0 }, uPixel: { value: renderer.getPixelRatio() }, uColor: { value: colors.c } },
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
        });
        const dust = new THREE.Points(dustGeo, dustMat);
        halo.renderOrder = 0;
        dust.renderOrder = 1;
        core.renderOrder = 2;
        group.add(halo, dust, core);

        const updatePalette = () => {
            const css = getComputedStyle(document.documentElement);
            const read = (name, target) => { const value = css.getPropertyValue(name).trim(); if (value) target.setStyle(value); };
            read('--accent', colors.a);
            read('--pos', colors.b);
            read('--text-2', colors.c);
            read('--accent-strong', colors.deep);
            colors.deep.multiplyScalar(0.1);
        };
        updatePalette();
        const paletteObserver = new MutationObserver(updatePalette);
        paletteObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

        container.appendChild(renderer.domElement);
        container.dataset.renderer = 'three';
        const resize = () => {
            const w = Math.max(1, Math.round(container.clientWidth * CANVAS_SCALE));
            const h = Math.max(1, Math.round(container.clientHeight * CANVAS_SCALE));
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h, false);
        };
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
        observer?.observe(container);
        if (!observer) window.addEventListener('resize', resize);
        resize();

        // Voice level: continuous from the AI's audio, word pulses from the browser voice. Between pulses,
        // and for voices that give none, a speech-like rhythm keeps the orb alive while it speaks.
        let level = 0, levelAt = -1e9, mic = 0, state = 'listening', running = true, frame = 0, swirl = 0, energy = 0;
        const clock = new THREE.Clock();
        const render = () => {
            if (!running) return;
            frame = requestAnimationFrame(render);
            const dt = Math.min(clock.getDelta(), 0.1);
            const t = clock.elapsedTime * (calm ? 0.35 : 1);
            const now = performance.now();
            let target;
            if (state === 'speaking') {
                const live = now - levelAt < 450 ? level : 0;
                const rhythm = now - levelAt > 700 ? 0.22 + 0.3 * Math.max(0, Math.sin(t * 8.3 + Math.sin(t * 2.1) * 2.4)) * (0.6 + 0.4 * Math.sin(t * 3.3)) : 0;
                target = Math.max(0.18, live, rhythm);
            } else if (state === 'thinking') target = 0.1 + 0.05 * Math.sin(t * 2.2);
            else target = 0.03 + 0.03 * (0.5 + 0.5 * Math.sin(t * 1.3));
            target = Math.max(target, mic * 0.9);
            if (calm) target *= 0.5;
            energy += (target - energy) * (target > energy ? 0.3 : 0.08);
            level *= 0.9;
            swirl += dt * (state === 'thinking' ? 0.9 : state === 'speaking' ? 0.5 : 0.22) * (calm ? 0.3 : 1);
            shared.uTime.value = t;
            shared.uEnergy.value = energy;
            dustMat.uniforms.uSwirl.value = swirl;
            haloMat.uniforms.uStrength.value = 0.22 + energy * 2.0;
            halo.scale.setScalar(0.8 + energy * 0.45);
            group.rotation.y = t * 0.12;
            group.rotation.x = Math.sin(t * 0.21) * 0.25;
            renderer.render(scene, camera);
        };
        render();

        return {
            /** The assistant's voice level, 0 to 1. */
            setAmplitude(value) {
                const x = Math.max(0, Math.min(1, Number(value) || 0));
                if (x > 0.01) levelAt = performance.now();
                level = Math.max(level, x);
            },
            /** The microphone level, 0 to 1: the orb moves when the user talks too. */
            setInputLevel(value) { mic = Math.max(0, Math.min(1, Number(value) || 0)); },
            setState(value) { state = value || 'listening'; },
            dispose() {
                running = false;
                cancelAnimationFrame(frame);
                observer?.disconnect();
                if (!observer) window.removeEventListener('resize', resize);
                paletteObserver.disconnect();
                for (const m of [core, halo, dust]) { m.geometry.dispose(); m.material.dispose(); }
                renderer.dispose();
                renderer.domElement.remove();
                delete container.dataset.renderer;
            },
        };
    } catch {
        return null;
    }
}
