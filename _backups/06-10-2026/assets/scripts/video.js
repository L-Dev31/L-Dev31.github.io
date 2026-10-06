import { prefersReducedMotion } from './utils.js';

export function setupAboutHeroVideo(refreshParallax) {
    const container = document.querySelector('.about-header');
    const video = document.querySelector('.about-header-video');
    if (!container || !video) return;

    video.pause(); video.currentTime = 0;
    if (prefersReducedMotion) { video.play().catch(() => {}); return; }

    let targetTime = 0, rafId = null, vfcPending = false;
    const hasVFC = typeof video.requestVideoFrameCallback === 'function';

    const loop = () => {
        if (!video.duration) { rafId = requestAnimationFrame(loop); return; }
        const diff = targetTime - video.currentTime;
        if (Math.abs(diff) < 0.02) { if (!video.paused) video.pause(); video.playbackRate = 1; rafId = null; return; }

        if (diff > 0) {
            const rate = Math.min(8, Math.max(0.25, diff * 6));
            if (Math.abs(video.playbackRate - rate) > 0.05) video.playbackRate = rate;
            if (video.paused) video.play().catch(() => {});
            rafId = requestAnimationFrame(loop);
        } else {
            if (!video.paused) video.pause();
            video.currentTime = Math.max(0, video.currentTime + diff * 0.35);
            if (hasVFC && !vfcPending) {
                vfcPending = true;
                video.requestVideoFrameCallback(() => { vfcPending = false; rafId = requestAnimationFrame(loop); });
            } else if (!hasVFC) rafId = requestAnimationFrame(loop);
        }
    };

    const textEl = document.querySelector('.about-header-text'), overlayEl = document.querySelector('.about-header-overlay');
    const scrub = () => {
        if (!video.duration) return;
        const h = container.offsetHeight, scrollable = h - window.innerHeight;
        if (scrollable <= 0) return;
        const prog = Math.max(0, Math.min(1, -container.getBoundingClientRect().top / scrollable));
        targetTime = prog * video.duration;
        if (!rafId && !vfcPending) rafId = requestAnimationFrame(loop);

        container.style.setProperty('--hero-progress', prog.toFixed(4));
        const past = window.scrollY >= h;
        [video, textEl, overlayEl].forEach(el => { if (el) el.style.visibility = past ? 'hidden' : ''; });
        refreshParallax?.();
    };

    video.addEventListener('loadedmetadata', scrub);
    window.addEventListener('scroll', scrub, { passive: true });
    window.addEventListener('resize', scrub, { passive: true });
    scrub();
}

export function setupVideoVisibility() {
    if (typeof window.IntersectionObserver !== 'function') return;
    const videos = document.querySelectorAll('#hero-video, .footer-bg-video');
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
            const v = e.target;
            if (e.isIntersecting) { if (v.paused) v.play().catch(() => {}); }
            else { if (!v.paused) v.pause(); }
        });
    }, { threshold: 0.01 });
    videos.forEach(v => io.observe(v));
}
