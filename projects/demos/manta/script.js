const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('network');
const ctx = canvas.getContext('2d');
const mantaLayer = document.createElement('canvas');
const mantaCtx = mantaLayer.getContext('2d');

const glowEl = document.getElementById('glow');
const ringEl = document.getElementById('cursor-ring');
const dotEl = document.getElementById('cursor-dot');
const hintEl = document.getElementById('hint');
const pageClasses = document.documentElement.classList;

const SHAPE_URL = 'assets/manta-shape.svg';
const OUTLINE_SAMPLES = 1000;
const RING_COUNT = 18;
const SMALL_SCREEN = 760;
const THREAD_SEGMENTS = 12;
const THREAD_WIDTHS = Array.from(
  { length: THREAD_SEGMENTS },
  (_, i) => .1 + .9 * Math.sin(Math.PI * (i + .5) / THREAD_SEGMENTS) ** 2
);
const LAYOUT_DELAY = 120;
const INERTIA = .9;

const lilac = alpha => `rgba(205,195,255,${alpha})`;
const white = alpha => `rgba(255,255,255,${alpha})`;
const clamp01 = value => Math.max(0, Math.min(1, value));

const cursor = { x: 0, y: 0 };
const trail = { x: 0, y: 0 };
const glow = { x: 0, y: 0 };
const manta = { x: 0, y: 0, size: 0 };
const pose = { x: 0, y: 0 };
const DRIFT_LIMIT = 10;

let intro = !reducedMotion;
let revealed = reducedMotion ? 1 : 0;
let revealShown = revealed;

let outline = [];
let perimeter = 0;
let width = 0;
let height = 0;
let points = [];
let rings = [];
let threadIds = [];
let pulses = [];
let ripples = [];
let nextPulseAt = 0;
let startTime;
let lastTime;
let resizeTimer;


async function loadOutline(url, count) {
  const markup = await (await fetch(url)).text();
  const source = new DOMParser().parseFromString(markup, 'image/svg+xml').querySelector('path');

  const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', source.getAttribute('d'));
  holder.style.display = 'none';
  holder.append(path);
  document.body.append(holder);

  const length = path.getTotalLength();
  const samples = Array.from({ length: count }, (_, i) => {
    const point = path.getPointAtLength(length * i / count);
    return [point.x, point.y];
  });
  holder.remove();
  return { samples, length };
}


function layout() {
  const footerTop = document.querySelector('footer').getBoundingClientRect().top;

  if (width > SMALL_SCREEN) {
    const textRight = Math.max(
      document.querySelector('h1').getBoundingClientRect().right,
      document.querySelector('h2').getBoundingClientRect().right
    );
    const room = width - textRight;
    manta.size = Math.min(room / 4.6, footerTop / 5) * 1.25;
    manta.x = textRight + room / 2;
    manta.y = footerTop * .54;
  } else {
    manta.size = width / 4.5 * 1.25;
    manta.x = width / 2;
    manta.y = footerTop - manta.size * 1.5 - 16;
  }

  if (cursor.x === 0 && cursor.y === 0) {
    cursor.x = width > SMALL_SCREEN ? width * .3 : width / 2;
    cursor.y = width > SMALL_SCREEN ? height * .62 : height * .3;
    Object.assign(trail, cursor);
    Object.assign(glow, cursor);
  }

  pose.x = manta.x;
  pose.y = manta.y;
  glowEl.style.setProperty('--size', Math.hypot(width, height) + 'px');
}

function resizeCanvases() {
  const scale = Math.min(devicePixelRatio, 2);
  canvas.width = mantaLayer.width = width * scale;
  canvas.height = mantaLayer.height = height * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  mantaCtx.setTransform(scale, 0, 0, scale, 0, 0);
}

function buildPoints() {
  points = [];
  rings = Array.from({ length: RING_COUNT + 1 }, () => []);
  pulses = [];
  ripples = [];
  nextPulseAt = 0;

  let innerRing = null;
  for (let level = 1; level <= RING_COUNT; level++) {
    const scale = level / RING_COUNT;
    const count = Math.max(6, Math.round(perimeter * manta.size * scale / 10));
    const ring = [];

    for (let i = 0; i < count; i++) {
      const [ox, oy] = outline[Math.floor(((i / count + level * .01) % 1) * outline.length)];
      ring.push(points.push({ dx: ox * manta.size * scale, dy: oy * manta.size * scale, level }) - 1);
    }

    ring.forEach((id, i) => {
      if (level === RING_COUNT) rings[level].push([id, ring[(i + 1) % count]]);
      if (innerRing) {
        const inner = innerRing[Math.round(((i / count + .01) % 1) * innerRing.length) % innerRing.length];
        rings[level].push([id, inner]);
      }
    });
    innerRing = ring;
  }

  threadIds = points.map((point, id) => id).filter(id => id % 4 === 0);
}

function build() {
  width = innerWidth;
  height = innerHeight;
  layout();
  moveCursor();
  placeTrailing();
  resizeCanvases();
  buildPoints();
  paintManta();
}


function pointX(point) {
  return pose.x + point.dx;
}

function pointY(point) {
  return pose.y + point.dy;
}

function threadControl(point) {
  return [
    cursor.x + (pose.x - cursor.x) * .55 + point.dx * .15,
    cursor.y + (pose.y - cursor.y) * .55 + point.dy * .15
  ];
}

function paintManta() {
  mantaCtx.clearRect(0, 0, width, height);

  for (let level = 1; level <= RING_COUNT; level++) {
    const outer = level === RING_COUNT;
    mantaCtx.lineWidth = outer ? 1 : .7;
    mantaCtx.strokeStyle = lilac(outer ? .9 : .1 + .5 * (level / RING_COUNT) ** 1.6);
    mantaCtx.beginPath();
    for (const [a, b] of rings[level]) {
      mantaCtx.moveTo(manta.x + points[a].dx, manta.y + points[a].dy);
      mantaCtx.lineTo(manta.x + points[b].dx, manta.y + points[b].dy);
    }
    mantaCtx.stroke();
  }

  for (const point of points) {
    const scale = point.level / RING_COUNT;
    const dot = 1 + 1.3 * scale;
    mantaCtx.fillStyle = point.level === RING_COUNT ? 'rgba(240,236,255,.95)' : lilac(.3 + .7 * scale);
    mantaCtx.fillRect(manta.x + point.dx - dot / 2, manta.y + point.dy - dot / 2, dot, dot);
  }
}


function moveCursor() {
  dotEl.style.translate = `${cursor.x}px ${cursor.y}px`;
  if (reducedMotion) {
    Object.assign(trail, cursor);
    Object.assign(glow, cursor);
    placeTrailing();
  }
}

function placeTrailing() {
  ringEl.style.translate = hintEl.style.translate = `${trail.x}px ${trail.y}px`;
  const reach = Math.hypot(Math.max(glow.x, width - glow.x), Math.max(glow.y, height - glow.y));
  const scale = reach / Math.hypot(width, height);
  glowEl.style.transform = `translate3d(${glow.x}px,${glow.y}px,0) scale(${scale})`;
}

function followCursor(frames) {
  const ease = 1 - INERTIA ** frames;
  const distance = Math.abs(trail.x - cursor.x) + Math.abs(trail.y - cursor.y);
  if (distance < .1) return;

  trail.x += (cursor.x - trail.x) * ease;
  trail.y += (cursor.y - trail.y) * ease;
  glow.x = trail.x;
  glow.y = trail.y;
  placeTrailing();
}


function curvePoint(start, control, end, t) {
  const rest = 1 - t;
  return rest * rest * start + 2 * rest * t * control + t * t * end;
}

function drawThreads(alpha) {
  const curves = threadIds.map(id => {
    const point = points[id];
    const [controlX, controlY] = threadControl(point);
    return [controlX, controlY, pointX(point), pointY(point)];
  });

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = lilac(intro ? .12 : .08);

  for (let i = 0; i < THREAD_SEGMENTS; i++) {
    const from = i / THREAD_SEGMENTS;
    const to = (i + 1) / THREAD_SEGMENTS;
    ctx.lineWidth = THREAD_WIDTHS[i];
    ctx.beginPath();
    for (const [controlX, controlY, endX, endY] of curves) {
      ctx.moveTo(curvePoint(cursor.x, controlX, endX, from), curvePoint(cursor.y, controlY, endY, from));
      ctx.lineTo(curvePoint(cursor.x, controlX, endX, to), curvePoint(cursor.y, controlY, endY, to));
    }
    ctx.stroke();
  }
}

function driftPose(frames) {
  if (reducedMotion) return;
  const ease = 1 - INERTIA ** frames;
  const offset = value => Math.max(-DRIFT_LIMIT, Math.min(DRIFT_LIMIT, value * .02));
  pose.x += (manta.x + offset(cursor.x - manta.x) - pose.x) * ease;
  pose.y += (manta.y + offset(cursor.y - manta.y) - pose.y) * ease;
}

function drawManta() {
  ctx.globalAlpha = revealShown;
  ctx.drawImage(mantaLayer, pose.x - manta.x, pose.y - manta.y, width, height);
  ctx.globalAlpha = 1;
}

function drawRipples(time) {
  const duration = 1500;
  ripples = ripples.filter(ripple => time - ripple.start < duration);

  for (const ripple of ripples) {
    const progress = (time - ripple.start) / duration;
    const radius = manta.size * .55 * (1 - (1 - progress) ** 2);
    const band = 5 + manta.size * .03;
    ctx.fillStyle = white((1 - progress) * .9);

    for (const point of points) {
      const gap = Math.abs(Math.hypot(point.dx - ripple.point.dx, point.dy - ripple.point.dy) - radius);
      if (gap > band) continue;
      const dot = 1.2 + (1 - gap / band) * 2;
      ctx.fillRect(pointX(point) - dot / 2, pointY(point) - dot / 2, dot, dot);
    }
  }
}

function randomThreadPoint() {
  return points[threadIds[Math.random() * threadIds.length | 0]];
}

function spawnIdlePulse(time) {
  if (intro || time < nextPulseAt || pulses.length >= 6) return;
  pulses.push({ point: randomThreadPoint(), start: time, duration: 1600 + Math.random() * 1000 });
  nextPulseAt = time + 350 + Math.random() * 350;
}

function drawPulses(time) {
  const trailLength = 6;

  pulses = pulses.filter(pulse => {
    if (time < pulse.start) return true;

    const progress = (time - pulse.start) / pulse.duration;
    const [controlX, controlY] = threadControl(pulse.point);
    const endX = pointX(pulse.point);
    const endY = pointY(pulse.point);

    for (let i = 0; i < trailLength; i++) {
      const t = Math.max(0, progress - i * .012);
      const rest = 1 - t;
      ctx.fillStyle = white(1 - i / trailLength);
      ctx.fillRect(
        rest * rest * cursor.x + 2 * rest * t * controlX + t * t * endX - 1.5,
        rest * rest * cursor.y + 2 * rest * t * controlY + t * t * endY - 1.5,
        3,
        3
      );
    }

    if (progress < 1) return true;
    ripples.push({ point: pulse.point, start: time });
    if (intro) advanceReveal();
    return false;
  });
}


function advanceReveal() {
  revealed = Math.min(1, revealed + 1 / 90);
  if (revealed === 1) reveal();
}

function reveal() {
  intro = false;
  document.body.classList.remove('intro');
}

function launchPulses(count, time) {
  for (let i = 0; i < count; i++) {
    pulses.push({
      point: randomThreadPoint(),
      start: time + Math.random() * 250,
      duration: 900 + Math.random() * 700
    });
  }
}

function sendBurst(time) {
  if (reducedMotion || !points.length) return;
  launchPulses(40, time);
  if (intro) {
    launchPulses(40, time + 450);
    launchPulses(40, time + 900);
  }
}


function frame(time) {
  startTime ??= time;
  const frames = Math.max(0, Math.min(64, time - (lastTime ?? time))) / 16.7;
  lastTime = time;

  followCursor(frames);
  driftPose(frames);
  revealShown += (revealed - revealShown) * (1 - .9 ** frames);

  ctx.clearRect(0, 0, width, height);
  drawThreads(reducedMotion ? 1 : clamp01((time - startTime) / 1200));
  drawManta();

  if (!reducedMotion) {
    drawRipples(time);
    spawnIdlePulse(time);
    drawPulses(time);
    requestAnimationFrame(frame);
  }
}


addEventListener('pointermove', event => {
  cursor.x = event.clientX;
  cursor.y = event.clientY;
  moveCursor();
  pageClasses.toggle('over-link', !!event.target.closest('a'));
});

addEventListener('pointerdown', event => {
  cursor.x = event.clientX;
  cursor.y = event.clientY;
  moveCursor();
  pageClasses.add('pressed');
  sendBurst(performance.now());
});

addEventListener('pointerup', () => pageClasses.remove('pressed'));

addEventListener('keydown', event => {
  if (!intro || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  sendBurst(performance.now());
});

document.addEventListener('translated', () => {
  if (outline.length) build();
});

addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!outline.length) return;
    build();
    if (reducedMotion) requestAnimationFrame(frame);
  }, LAYOUT_DELAY);
});

async function start() {
  const shape = await loadOutline(SHAPE_URL, OUTLINE_SAMPLES);
  outline = shape.samples;
  perimeter = shape.length;

  if (reducedMotion) reveal();
  build();
  document.fonts.ready.then(build);
  requestAnimationFrame(frame);
}

start();
