const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 1024;

const App = (() => {
    const splitTextState = new Map();
    let resizeTimer = null;

    const observer = new IntersectionObserver(entries => {
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

    const observe = el => {
        if (el) observer.observe(el);
    };

    const setupHeaderAndText = () => {
        // Suppression de l'affichage de l'heure

        const titleEl = document.getElementById('site-title');
        if (titleEl && !titleEl.dataset._init) {
            titleEl.dataset._init = '1';

            const text = titleEl.textContent;
            titleEl.innerHTML = '';
            const chars = Array.from(text);
            const spans = chars.map(ch => {
                const s = document.createElement('span');
                s.className = 'site-title-letter';
                s.textContent = ch === ' ' ? '\u00A0' : ch;
                s.style.transitionDelay = `s`;
                titleEl.appendChild(s);
                return s;
            });

            spans.forEach((s, i) => {
                setTimeout(() => s.classList.add('visible'), i * 30 + 50);
            });
        }

        document.querySelectorAll('.title').forEach(observe);

        const waitForStoryImages = () => {
            const imgs = Array.from(document.querySelectorAll('.story-image img'));
            if (!imgs.length) return Promise.resolve();
            return Promise.all(imgs.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.addEventListener('load', resolve, { once: true });
                    img.addEventListener('error', resolve, { once: true });
                });
            }));
        };

        const initTextReveal = () => {
            const targets = [
                document.getElementById('split-text'),
                ...Array.from(document.querySelectorAll('.story-paragraph')),
                ...Array.from(document.querySelectorAll('.story-text h3'))
            ];
            targets.forEach(splitText);
        };

        const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
        Promise.all([fontsReady, waitForStoryImages()]).then(() => {
            requestAnimationFrame(() => requestAnimationFrame(initTextReveal));
        });

        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(initTextReveal, 150);
        });
    };

    const setupCursor = () => {
        if (isMobile) return;
        const cursor = document.createElement('div');
        cursor.className = 'cursor';
        document.body.appendChild(cursor);

        document.addEventListener('mousemove', e => {
            const scale = cursor.classList.contains('cursor--small') ? ' scale(0.5)' : '';
            cursor.style.transform = `translate(` + e.clientX + `px, ` + e.clientY + `px)` + scale;
        });

        const clickableSelector = 'a, button, .clickable';
        document.querySelectorAll(clickableSelector).forEach(el => {
            el.addEventListener('mouseenter', () => cursor.classList.add('cursor--small'));
            el.addEventListener('mouseleave', () => cursor.classList.remove('cursor--small'));
            el.addEventListener('focus', () => cursor.classList.add('cursor--small'));
            el.addEventListener('blur', () => cursor.classList.remove('cursor--small'));
        });
    };

    const setupFeaturedProjects = () => {
        const list = document.querySelector('.featured-list');
        if (!list) return;

        let container = null;
        let img = null;
        let desc = null;
        let targetX = 0;
        let targetY = 0;
        let currentX = 0;
        let currentY = 0;
        let animFrame = null;

        const ensurePreview = () => {
            if (container) return;
            container = document.createElement('div');
            container.className = 'project-preview-container';
            img = document.createElement('img');
            img.className = 'project-preview-img';
            container.appendChild(img);
            desc = document.createElement('div');
            desc.className = 'project-preview-desc';
            container.appendChild(desc);
            document.body.appendChild(container);
        };

        const animate = () => {
            if (!container || container.style.display !== 'flex') return;
            currentX += (targetX - currentX) * 0.10;
            currentY += (targetY - currentY) * 0.10;
            container.style.left = currentX + 'px';
            container.style.top = currentY + 'px';
            animFrame = requestAnimationFrame(animate);
        };

        const showPreview = (imgUrl, description, x, y) => {
            ensurePreview();
            img.src = imgUrl;
            desc.textContent = description || '';
            container.style.display = 'flex';

            const size = 20 * window.innerHeight / 100;
            const offset = 5 * window.innerHeight / 100;

            targetX = x + offset;
            targetY = y - size / 2;
            if (!animFrame) animate();
        };

        const hidePreview = () => {
            if (container) container.style.display = 'none';
            cancelAnimationFrame(animFrame);
            animFrame = null;
        };

        fetch('projects.json')
            .then(res => res.json())
            .then(data => {
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
                        showPreview(imgPath, project.description, e.clientX, e.clientY);
                        document.querySelector('.cursor')?.classList.add('cursor--small');
                    });
                    a.addEventListener('mousemove', e => showPreview(imgPath, project.description, e.clientX, e.clientY));
                    a.addEventListener('mouseleave', () => {
                        hidePreview();
                        document.querySelector('.cursor')?.classList.remove('cursor--small');
                    });
                    list.appendChild(a);
                });
            });
    };

    const setupScrollEffects = () => {
        let ticking = false;
        const header = document.getElementById('header');
        const video = document.querySelector('.header-bg-video');

        const parallaxItems = isMobile
            ? []
            : Array.from(document.querySelectorAll('[data-parallax-speed]')).map(el => ({
                el: el,
                speed: parseFloat(el.dataset.parallaxSpeed) || 100,
                baseTop: 0
            }));

        const cacheParallaxPositions = () => {
            const scrollTop = window.pageYOffset;
            parallaxItems.forEach(item => {
                const rect = item.el.getBoundingClientRect();
                item.baseTop = rect.top + scrollTop;
            });
        };

        const update = () => {
            if (video && header) {
                const scrolled = window.scrollY;
                const headerH = header.offsetHeight;
                const threshold = headerH * 0.35;
                const progress = Math.min(1, Math.max(0, scrolled / threshold));
                video.style.setProperty('--video-prog', progress);
            }

            if (parallaxItems.length) {
                const viewH = window.innerHeight;
                const scrolled = window.scrollY;
                const viewCenter = scrolled + viewH / 2;

                parallaxItems.forEach(item => {
                    const elCenter = item.baseTop + (item.el.offsetHeight / 2);
                    const diff = elCenter - viewCenter;
                    const factor = (item.speed - 100) / 100;
                    if (factor === 0) return;
                    const y = diff * factor;
                    item.el.style.transform = `translateY(` + y + `px)`;
                });
            }

            ticking = false;
        };

        const onScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(update);
                ticking = true;
            }
        };

        if (video || parallaxItems.length) {
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', () => cacheParallaxPositions(), { passive: true });
            cacheParallaxPositions();
            update();
        }

        if (!isMobile) {
            let target = window.scrollY;
            let current = window.scrollY;
            const ease = 0.1;
            let maxScroll = document.documentElement.scrollHeight - window.innerHeight;

            const onWheel = e => {
                e.preventDefault();
                target += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.75;
                target = Math.max(0, Math.min(target, maxScroll));
            };

            const updateSmooth = () => {
                current += (target - current) * ease;
                if (Math.abs(target - current) < 0.1) current = target;
                window.scrollTo(0, current);
                requestAnimationFrame(updateSmooth);
            };

            window.addEventListener('wheel', onWheel, { passive: false });
            window.addEventListener('resize', () => {
                maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            });
            updateSmooth();
        }
    };

    const splitText = el => {
        if (!el) return;
        const original = splitTextState.get(el) || el.innerHTML;
        splitTextState.set(el, original);

        el.innerHTML = original.replace(/<div class="text-line.*?>/g, '').replace(/<\/div>/g, '');
        const allNodes = Array.from(el.childNodes);
        const wordSpans = [];
        el.innerHTML = '';

        allNodes.forEach(node => {
            if (node.nodeType === 3) {
                node.textContent.split(' ').forEach(txt => {
                    if (!txt.trim()) return;
                    const s = document.createElement('span');
                    s.textContent = txt + ' ';
                    s.style.display = 'inline-block';
                    el.appendChild(s);
                    wordSpans.push(s);
                });
            } else {
                const s = document.createElement('span');
                s.innerHTML = node.outerHTML + ' ';
                s.style.display = 'inline-block';
                el.appendChild(s);
                wordSpans.push(s);
            }
        });

        if (!wordSpans.length) return;

        const lines = [];
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

        el.innerHTML = '';
        lines.forEach((line, i) => {
            const div = document.createElement('div');
            div.className = 'text-line';
            if (i === lines.length - 1) div.classList.add('last-line');
            div.style.transitionDelay = `${i * 0.05}s`;
            line.forEach(s => div.innerHTML += s.innerHTML);
            el.appendChild(div);
            observe(div);
        });
    };

    const init = () => {
        setupCursor();
        setupFeaturedProjects();
        setupScrollEffects();
        setupHeaderAndText();
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);

