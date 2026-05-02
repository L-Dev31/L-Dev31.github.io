import { isMobile, prefersReducedMotion } from './utils.js';

export function setupPageLoader() {
    const loader = document.querySelector('.page-loader');
    const bar = document.querySelector('.page-loader-bar');
    if (!loader || !bar) return;

    let didFinish = false;
    const finish = () => {
        if (didFinish) return;
        didFinish = true;
        bar.style.width = '100%';
        setTimeout(() => loader.classList.add('done'), 350);
    };

    requestAnimationFrame(() => bar.style.width = '85%');
    if (document.readyState === 'complete') finish();
    else {
        window.addEventListener('load', finish, { once: true });
        setTimeout(finish, 2000);
    }
}

export function setupMobileMenu(lenis) {
    const btn = document.querySelector('.hamburger');
    const menu = document.querySelector('.mobile-menu');
    const icon = btn?.querySelector('i');
    if (!btn || !menu) return;

    const toggle = (isOpen) => {
        menu.classList.toggle('open', isOpen);
        menu.setAttribute('aria-hidden', !isOpen);
        btn.setAttribute('aria-expanded', isOpen);
        if (icon) icon.className = isOpen ? 'fa fa-times' : 'fa fa-bars';
        isOpen ? lenis?.stop() : lenis?.start();
    };

    btn.addEventListener('click', () => toggle(!menu.classList.contains('open')));
    menu.querySelectorAll('.mobile-menu-link').forEach(a => a.addEventListener('click', () => toggle(false)));
}

export function setupCursor() {
    if (isMobile || prefersReducedMotion) return;
    const cursor = document.querySelector('.cursor');
    if (!cursor) return;

    document.documentElement.classList.add('has-custom-cursor-active');
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

export function setupCTACursor() {
    const el = document.querySelector('.cta-cursor');
    if (!el || isMobile || prefersReducedMotion) return null;

    let x = 0, y = 0, tx = 0, ty = 0, rafId = null, activeTargets = 0;
    const textEl = el.querySelector('.cta-cursor-text');
    const arrowEl = el.querySelector('.cta-cursor-arrow');
    const cursor = document.querySelector('.cursor');

    const loop = () => {
        x += (tx - x) * 0.15;
        y += (ty - y) * 0.15;
        el.style.left = `${x}px`; el.style.top = `${y}px`;
        rafId = requestAnimationFrame(loop);
    };

    return {
        show(text, showArrow) {
            el.classList.add('active');
            if (cursor) cursor.style.opacity = '0';
            if (text && textEl) textEl.textContent = text;
            if (arrowEl) arrowEl.style.display = showArrow ? '' : 'none';
            if (!rafId) loop();
        },
        hide() {
            el.classList.remove('active');
            if (cursor) cursor.style.opacity = '1';
            if (rafId && activeTargets === 0) { cancelAnimationFrame(rafId); rafId = null; }
        },
        move(cx, cy) { tx = cx; ty = cy; },
        attach(target, text, { showArrow = true } = {}) {
            target.addEventListener('mouseenter', e => {
                activeTargets++;
                this.move(e.clientX, e.clientY);
                this.show(text, showArrow);
            });
            target.addEventListener('mousemove', e => this.move(e.clientX, e.clientY));
            target.addEventListener('mouseleave', () => {
                activeTargets = Math.max(0, activeTargets - 1);
                this.hide();
            });
        }
    };
}

export function setupSmoothAnchors(lenis) {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', e => {
            const target = document.querySelector(link.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            lenis ? lenis.scrollTo(target, { duration: 1.2 }) : target.scrollIntoView({ behavior: 'smooth' });
        });
    });
}

export function setupBackToTop(lenis) {
    const btn = document.getElementById('back-to-top');
    const textContainer = document.getElementById('btt-text');
    if (!btn || !textContainer) return;

    const chars = Array.from(textContainer.textContent);
    textContainer.innerHTML = '';
    chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.transform = `rotate(${i * (360 / chars.length)}deg)`;
        textContainer.appendChild(span);
    });

    const footer = document.getElementById('footer');
    const update = () => {
        const visible = footer ? footer.getBoundingClientRect().top < window.innerHeight : window.scrollY > window.innerHeight * 0.5;
        btn.classList.toggle('visible', visible);
    };

    window.addEventListener('scroll', update, { passive: true });
    btn.addEventListener('click', () => lenis ? lenis.scrollTo(0) : window.scrollTo({ top: 0, behavior: 'smooth' }));
    update();
}
