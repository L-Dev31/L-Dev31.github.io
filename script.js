const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 1024;

class ScrollObserver {
    constructor(element) {
        this.element = typeof element == 'string' ? document.querySelector(element) : element;
        this.observer = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('visible');
                } else if (e.boundingClientRect.top > 0) {
                    e.target.classList.remove('visible');
                }
            });
        }, {
            threshold: 0,
            rootMargin: "0px 0px -25% 0px"
        });
    }

    observe(el) {
        if (el) this.observer.observe(el);
    }
}

class SplitTextReveal extends ScrollObserver {
    constructor(elementSelector) {
        super(elementSelector);
        if (!this.element) return;
        this.originalContent = this.element.innerHTML;
        this.resizeTimeout = null;
        this.init();
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => this.init(), 150);
        });
    }

    init() {
        this.element.innerHTML = this.originalContent.replace(/<div class="text-line.*?>/g, '').replace(/<\/div>/g, '');
        const allNodes = Array.from(this.element.childNodes);
        const wordSpans = [];
        this.element.innerHTML = '';

        allNodes.forEach(node => {
            if (node.nodeType === 3) {
                node.textContent.split(' ').forEach(txt => {
                    if (!txt.trim()) return;
                    const s = document.createElement('span');
                    s.textContent = txt + ' ';
                    s.style.display = 'inline-block';
                    this.element.appendChild(s);
                    wordSpans.push(s);
                });
            } else {
                const s = document.createElement('span');
                s.innerHTML = node.outerHTML + ' ';
                s.style.display = 'inline-block';
                this.element.appendChild(s);
                wordSpans.push(s);
            }
        });

        if (wordSpans.length === 0) return;

        let lines = [];
        let currentLine = [];
        let lastTop = wordSpans[0].offsetTop;

        wordSpans.forEach(span => {
            if (span.offsetTop > lastTop + 5) {
                lines.push(currentLine);
                currentLine = [];
                lastTop = span.offsetTop;
            }
            currentLine.push(span);
        });
        lines.push(currentLine);

        this.element.innerHTML = '';
        lines.forEach((line, i) => {
            const div = document.createElement('div');
            div.className = 'text-line';
            if (i === lines.length - 1) div.classList.add('last-line');
            div.style.transitionDelay = `${i * 0.05}s`;
            line.forEach(s => div.innerHTML += s.innerHTML);
            this.element.appendChild(div);
            this.observe(div);
        });
    }
}

class ElementReveal extends ScrollObserver {
    constructor(selector) {
        super();
        document.querySelectorAll(selector).forEach(el => this.observe(el));
    }
}

class TimeManager {
    constructor() {
        this.el = document.getElementById('header-hour');
        if (this.el) this.init();
    }

    init() {
        const update = () => {
            const now = new Date();
            this.el.textContent = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Europe/Paris',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }).format(now).toUpperCase();
        };
        update();
        setInterval(update, 15000);
    }
}

class CursorManager {
    constructor() {
        if (isMobile) return;
        this.cursor = document.createElement('div');
        this.cursor.className = 'cursor';
        document.body.appendChild(this.cursor);
        this.init();
    }

    init() {
        document.addEventListener('mousemove', e => {
            const scale = this.cursor.classList.contains('cursor--small') ? ' scale(0.5)' : '';
            this.cursor.style.transform = `translate(` + e.clientX + `px, ` + e.clientY + `px)` + scale;
        });

        const clickableSelector = 'a, button, .clickable';
        document.querySelectorAll(clickableSelector).forEach(el => {
            el.addEventListener('mouseenter', () => this.cursor.classList.add('cursor--small'));
            el.addEventListener('mouseleave', () => this.cursor.classList.remove('cursor--small'));
            el.addEventListener('focus', () => this.cursor.classList.add('cursor--small'));
            el.addEventListener('blur', () => this.cursor.classList.remove('cursor--small'));
        });
    }
} 

class BlurScrollHeader {
    constructor() {
        this.ticking = false;
        this.video = document.querySelector('.header-bg-video');
        this.header = document.getElementById('header');
        this.init();
    }

    init() {
        if (!this.video || !this.header) return;
        window.addEventListener('scroll', () => {
            if (!this.ticking) {
                window.requestAnimationFrame(() => this.update());
                this.ticking = true;
            }
        }, { passive: true });
    }

    update() {
        const scrolled = window.scrollY;
        const headerH = this.header.offsetHeight;
        const threshold = headerH * 0.35;
        const progress = Math.min(1, Math.max(0, scrolled / threshold));
        this.video.style.setProperty('--video-prog', progress);
        this.ticking = false;
    }
}

class ParallaxEffect {
    constructor() {
        if (isMobile) return;
        this.elements = [];
        this.ticking = false;
        this.init();
    }

    init() {
        const els = document.querySelectorAll('[data-parallax-speed]');
        if (!els.length) return;

        this.elements = Array.from(els).map(el => ({
            el: el,
            speed: parseFloat(el.dataset.parallaxSpeed) || 100,
            baseTop: 0
        }));

        this.cachePositions();
        window.addEventListener('resize', () => this.cachePositions(), { passive: true });
        window.addEventListener('scroll', () => {
            if (!this.ticking) {
                window.requestAnimationFrame(() => this.update());
                this.ticking = true;
            }
        }, { passive: true });

        this.update();
    }

    cachePositions() {
        const scrollTop = window.pageYOffset;
        this.elements.forEach(item => {
            const rect = item.el.getBoundingClientRect();
            item.baseTop = rect.top + scrollTop;
        });
    }

    update() {
        const viewH = window.innerHeight;
        const scrolled = window.scrollY;
        const viewCenter = scrolled + viewH / 2;

        this.elements.forEach(item => {
            const elCenter = item.baseTop + (item.el.offsetHeight / 2);
            const diff = elCenter - viewCenter;
            const factor = (item.speed - 100) / 100;
            if (factor === 0) return;
            const y = diff * factor;
            item.el.style.transform = `translateY(` + y + `px)`;
        });

        this.ticking = false;
    }
}

class SmoothScroll {
    constructor() {
        if (isMobile) return;
        this.target = window.scrollY;
        this.current = window.scrollY;
        this.ease = 0.1;
        this.onWheel = this.onWheel.bind(this);
        this.update = this.update.bind(this);
        
        window.addEventListener('wheel', this.onWheel, { passive: false });
        this.maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.addEventListener('resize', () => {
            this.maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        });
        
        this.update();
    }

    onWheel(e) {
        e.preventDefault();
        this.target += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.75;
        this.target = Math.max(0, Math.min(this.target, this.maxScroll));
    }

    update() {
        this.current += (this.target - this.current) * this.ease;
        if (Math.abs(this.target - this.current) < 0.1) this.current = this.target;
        window.scrollTo(0, this.current);
        requestAnimationFrame(this.update);
    }
}

class HeroTitleAnimation {
    constructor() {
        this.el = document.getElementById('site-title');
        if (this.el && !this.el.dataset._init) {
            this.el.dataset._init = '1';
            this.init();
        }
    }

    init() {
        const text = this.el.textContent;
        this.el.innerHTML = '';
        const chars = Array.from(text);
        const spans = chars.map((ch, i) => {
            const s = document.createElement('span');
            s.className = 'site-title-letter';
            s.textContent = ch === ' ' ? '\u00A0' : ch;
            s.style.transitionDelay = `s`;
            this.el.appendChild(s);
            return s;
        });

        spans.forEach((s, i) => {
            setTimeout(() => s.classList.add('visible'), i * 30 + 50);
        });
    }
}

class ProjectPreview {
    constructor() {
        this.container = null;
        this.img = null;
        this.desc = null;
        this.targetX = 0;
        this.targetY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.animFrame = null;
    }

    show(imgUrl, description, x, y) {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'project-preview-container';
            this.img = document.createElement('img');
            this.img.className = 'project-preview-img';
            this.container.appendChild(this.img);
            this.desc = document.createElement('div');
            this.desc.className = 'project-preview-desc';
            this.container.appendChild(this.desc);
            document.body.appendChild(this.container);
        }
        
        this.img.src = imgUrl;
        this.desc.textContent = description || '';
        this.container.style.display = 'flex';
        
        const size = 20 * window.innerHeight / 100;
        const offset = 5 * window.innerHeight / 100;

        this.targetX = x + offset;
        this.targetY = y - size / 2;
        if (!this.animFrame) this.animate();
    }

    hide() {
        if (this.container) this.container.style.display = 'none';
        cancelAnimationFrame(this.animFrame);
        this.animFrame = null;
    }

    animate() {
        if (!this.container || this.container.style.display !== 'flex') return;
        this.currentX += (this.targetX - this.currentX) * 0.10;
        this.currentY += (this.targetY - this.currentY) * 0.10;
        this.container.style.left = this.currentX + 'px';
        this.container.style.top = this.currentY + 'px';
        this.animFrame = requestAnimationFrame(() => this.animate());
    }
}

class FeaturedProjects {
    constructor() {
        this.preview = new ProjectPreview();
        this.load();
    }

    load() {
        fetch('projects.json')
            .then(res => res.json())
            .then(data => {
                const list = document.querySelector('.featured-list');
                if (!list) return;
                list.innerHTML = '';
                data.projects.forEach(project => {
                    const a = document.createElement('a');
                    a.className = 'featured-project';
                    a.textContent = project.title;
                    a.href = project.path.startsWith('http') ? project.path : project.path + '/';
                    a.target = '_blank';
                    
                    if (project.creator?.trim()) {
                        const author = document.createElement('span');
                        author.className = 'featured-author';
                        author.textContent = ` ` + project.creator;
                        a.appendChild(author);
                    }

                    const imgPath = `Elements/image/` + project.id + `-banner.png`;
                    a.addEventListener('mouseenter', e => {
                        this.preview.show(imgPath, project.description, e.clientX, e.clientY);
                        document.querySelector('.cursor')?.classList.add('cursor--small');
                    });
                    a.addEventListener('mousemove', e => this.preview.show(imgPath, project.description, e.clientX, e.clientY));
                    a.addEventListener('mouseleave', () => {
                        this.preview.hide();
                        document.querySelector('.cursor')?.classList.remove('cursor--small');
                    });
                    list.appendChild(a);
                });
            });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = {
        time: new TimeManager(),
        cursor: new CursorManager(),
        header: new BlurScrollHeader(),
        elements: new ElementReveal('.title'),
        parallax: new ParallaxEffect(),
        projects: new FeaturedProjects(),
        hero: new HeroTitleAnimation(),
        scroll: new SmoothScroll()
    };

    const initTextReveal = () => {
        window.app.textReveal = [
            new SplitTextReveal(document.getElementById('split-text')),
            ...Array.from(document.querySelectorAll('.story-paragraph')).map(el => new SplitTextReveal(el)),
            ...Array.from(document.querySelectorAll('.story-text h3')).map(el => new SplitTextReveal(el))
        ];
    };

    if (document.fonts) {
        document.fonts.ready.then(initTextReveal);
    } else {
        window.addEventListener('load', initTextReveal);
    }
});

