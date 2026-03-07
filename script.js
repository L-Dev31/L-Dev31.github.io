const isMobile =
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 1024;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const App = (() => {
    const observer = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                } else if (entry.boundingClientRect.top > 0) {
                    entry.target.classList.remove('visible');
                }
            });
        },
        {
            threshold: 0.1,
            rootMargin: '0px 0px -10% 0px'
        }
    );

    const observe = el => {
        if (el) {
            observer.observe(el);
        }
    };

    const splitIntoLines = el => {
        if (!el || el.dataset._split) return;
        el.dataset._split = '1';

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        textNodes.forEach(node => {
            const parts = node.textContent.split(/(\s+)/);
            const frag = document.createDocumentFragment();
            parts.forEach(part => {
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

        let lineIndex = 0;
        let lastTop = words[0].getBoundingClientRect().top;

        words.forEach(w => {
            const top = w.getBoundingClientRect().top;
            if (Math.abs(top - lastTop) > 2) {
                lineIndex++;
                lastTop = top;
            }
            w.style.transitionDelay = `${lineIndex * 0.12}s`;
        });

        el.classList.add('split-animated');
    };

    const fetchJson = path => {
        return fetch(path, { cache: 'no-store' }).then(response => {
            if (!response.ok) {
                throw new Error(`${path} (${response.status})`);
            }
            return response.json();
        });
    };

    const setupAge = () => {
        document.querySelectorAll('.age[data-dob]').forEach(el => {
            const dob = new Date(el.dataset.dob);
            if (Number.isNaN(dob.getTime())) {
                return;
            }
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            const isBeforeBirthday = monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate());
            if (isBeforeBirthday) {
                age -= 1;
            }
            el.textContent = String(Math.max(0, age));
        });
    };

    const setupHeaderAndText = () => {
        const titleEl = document.getElementById('site-title');
        if (titleEl && !titleEl.dataset._init) {
            titleEl.dataset._init = '1';

            const text = titleEl.textContent || '';
            titleEl.innerHTML = '';
            const chars = Array.from(text);
            const spans = chars.map((ch, index) => {
                const span = document.createElement('span');
                span.className = 'site-title-letter';
                span.textContent = ch === ' ' ? '\u00A0' : ch;
                span.style.transitionDelay = `${index * 0.03}s`;
                titleEl.appendChild(span);
                return span;
            });

            spans.forEach((span, index) => {
                setTimeout(() => span.classList.add('visible'), index * 30 + 50);
            });
        }

        document.querySelectorAll('.title').forEach(observe);

        if (prefersReducedMotion) {
            return;
        }

        const aboutText = document.getElementById('split-text');
        if (aboutText) {
            splitIntoLines(aboutText);
            observe(aboutText);
        }

        document.querySelectorAll('.story-text').forEach(storyText => {
            const h3 = storyText.querySelector('h3');
            const para = storyText.querySelector('.story-paragraph');
            if (h3) {
                splitIntoLines(h3);
                observe(h3);
            }
            if (para) {
                splitIntoLines(para);
                observe(para);
            }
        });
    };

    const setupCursor = () => {
        if (isMobile || prefersReducedMotion) {
            return;
        }

        const cursor = document.createElement('div');
        cursor.className = 'cursor';
        document.body.appendChild(cursor);

        document.addEventListener('mousemove', event => {
            const scale = cursor.classList.contains('cursor--small') ? ' scale(0.5)' : '';
            cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)${scale}`;
        });

        document.addEventListener('mouseover', event => {
            if (event.target.closest('a, button, .clickable')) {
                cursor.classList.add('cursor--small');
            }
        });

        document.addEventListener('mouseout', event => {
            if (event.target.closest('a, button, .clickable')) {
                cursor.classList.remove('cursor--small');
            }
        });
    };

    /* ── CTA Cursor ──
     *  Usage:  CTACursor.attach(element)   — adds hover see-more effect
     *          CTACursor.detach(element)   — removes it
     *          CTACursor.show() / .hide()  — manual control
     *          CTACursor.move(x, y)        — update position
     */
    const CTACursor = (() => {
        const el = document.querySelector('.cta-cursor');
        if (!el || isMobile || prefersReducedMotion) return null;

        let x = 0, y = 0, tx = 0, ty = 0;
        const defaultCursor = () => document.querySelector('.cursor');

        (function loop() {
            x += (tx - x) * 0.15;
            y += (ty - y) * 0.15;
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            requestAnimationFrame(loop);
        })();

        let customText = 'See more';
        const textEl = el.querySelector('.cta-cursor-text');
        
        const api = {
            show()  { el.classList.add('active'); const c = defaultCursor(); if (c) c.style.opacity = '0'; },
            hide()  { el.classList.remove('active'); const c = defaultCursor(); if (c) c.style.opacity = '1'; },
            move(cx, cy) { tx = cx; ty = cy; },
            setText(text) { customText = text; if (textEl) textEl.textContent = text; },
            attach(target, text) {
                target.addEventListener('mouseenter', e => { if (text) api.setText(text); api.move(e.clientX, e.clientY); api.show(); });
                target.addEventListener('mousemove',  e => { api.move(e.clientX, e.clientY); });
                target.addEventListener('mouseleave', () => { api.hide(); });
            },
            detach(target) {
                target.replaceWith(target.cloneNode(true));
            }
        };
        return api;
    })();

    const setupFeaturedProjects = () => {
        const list = document.querySelector('.featured-list');
        const previewContainer = document.querySelector('.project-preview-container');
        const previewImage = document.querySelector('.project-preview-img');
        const previewDesc = document.querySelector('.project-preview-desc');
        
        if (!list || !previewContainer || !previewImage || !previewDesc) return;

        let projects = [];
        let targetX = 0, targetY = 0;
        let currentX = 0, currentY = 0;
        let animationFrame = null;

        const animatePreview = () => {
            if (previewContainer.style.display !== 'flex') return;
            currentX += (targetX - currentX) * 0.1;
            currentY += (targetY - currentY) * 0.1;
            previewContainer.style.left = `${currentX}px`;
            previewContainer.style.top = `${currentY}px`;
            animationFrame = requestAnimationFrame(animatePreview);
        };

        const showPreview = (imageUrl, description, x, y) => {
            if (isMobile || prefersReducedMotion) return;
            previewImage.src = imageUrl;
            previewDesc.textContent = description || '';
            previewContainer.style.display = 'flex';
            
            const size = (20 * window.innerHeight) / 100;
            const offset = (5 * window.innerHeight) / 100;
            targetX = x + offset;
            targetY = y - size / 2;
            
            if (!animationFrame) animatePreview();
        };

        const hidePreview = () => {
            previewContainer.style.display = 'none';
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        };

        const buildProjectLink = project => {
            const link = document.createElement('a');
            link.className = 'featured-project';
            link.textContent = project.title;
            link.href = project.path.startsWith('http') ? project.path : `${project.path}/`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            if (project.creator?.trim()) {
                const author = document.createElement('span');
                author.className = 'featured-author';
                author.textContent = ` ${project.creator}`;
                link.appendChild(author);
            }

            const imagePath = `Elements/image/${project.id}-banner.png`;
            link.addEventListener('mouseenter', e => {
                showPreview(imagePath, project.description, e.clientX, e.clientY);
            });
            link.addEventListener('mousemove', e => {
                showPreview(imagePath, project.description, e.clientX, e.clientY);
            });
            link.addEventListener('mouseleave', () => {
                hidePreview();
            });

            return link;
        };

        const renderProjects = () => {
            const webProjects = projects.filter(p => p.category === 'web');
            const allowed = webProjects.filter(p => !(isMobile && p.noPhone === true));

            list.innerHTML = '';
            if (!allowed.length) {
                list.innerHTML = '<p class="projects-empty">No project available.</p>';
                return;
            }
            allowed.forEach(project => list.appendChild(buildProjectLink(project)));
        };

        fetchJson('projects.json')
            .then(data => {
                projects = Array.isArray(data.projects) ? data.projects : [];
                renderProjects();
            })
            .catch(error => {
                console.error('Failed to load projects:', error);
                list.innerHTML = '<p class="projects-empty">Unable to load projects for now.</p>';
            });
    };

    const setupBentoProjects = () => {
        const bentoGrid = document.querySelector('.bento-grid');
        if (!bentoGrid) return;

        /* ── Build bento items ── */
        const buildBentoItem = project => {
            const link = document.createElement('a');
            link.className = 'bento-item';
            if (project.category === 'featured') {
                link.classList.add('featured');
            }
            link.href = project.path.startsWith('http') ? project.path : `${project.path}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';

            const img = document.createElement('img');
            img.src = project.image || (project.category === 'featured' ? `Elements/image/${project.id}.jpg` : `Elements/image/${project.id}-banner.png`);
            img.alt = project.title;
            img.loading = 'lazy';
            img.decoding = 'async';
            if (project.category !== 'featured') {
                img.setAttribute('data-parallax-speed', '70');
            }
            link.appendChild(img);

            // Only add info section for web projects
            if (project.category !== 'featured') {
                const info = document.createElement('div');
                info.className = 'bento-item-info';

                const title = document.createElement('div');
                title.className = 'bento-item-title';
                title.textContent = project.title;
                info.appendChild(title);

                if (project.creator) {
                    const creator = document.createElement('div');
                    creator.className = 'bento-item-creator';
                    creator.textContent = `by ${project.creator}`;
                    info.appendChild(creator);
                }

                link.appendChild(info);
            }

            // Attach CTA cursor with custom text for featured projects
            if (CTACursor) {
                if (project.category === 'featured') {
                    CTACursor.attach(link, project.title);
                } else {
                    CTACursor.attach(link);
                }
            }

            return link;
        };

        fetchJson('projects.json')
            .then(data => {
                const all = Array.isArray(data.projects) ? data.projects : [];
                const featured = all.filter(p => p.category === 'featured');
                if (!featured.length) {
                    bentoGrid.innerHTML = '<p class="projects-empty">No featured projects yet.</p>';
                } else {
                    featured.forEach(p => bentoGrid.appendChild(buildBentoItem(p)));
                }
            })
            .catch(err => {
                console.error('Failed to load featured projects:', err);
                bentoGrid.innerHTML = '<p class="projects-empty">Unable to load featured projects.</p>';
            });
    };

    const setupScrollEffects = () => {
        let ticking = false;
        const header = document.getElementById('header');
        const video = document.querySelector('.header-bg-video');

        const parallaxItems = isMobile || prefersReducedMotion
            ? []
            : Array.from(document.querySelectorAll('[data-parallax-speed]')).map(el => ({
                  el,
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
                const headerHeight = header.offsetHeight;
                const threshold = headerHeight * 0.35;
                const progress = Math.min(1, Math.max(0, scrolled / threshold));
                video.style.setProperty('--video-prog', progress);
            }

            if (parallaxItems.length) {
                const viewHeight = window.innerHeight;
                const scrolled = window.scrollY;
                const viewCenter = scrolled + viewHeight / 2;

                parallaxItems.forEach(item => {
                    const elCenter = item.baseTop + item.el.offsetHeight / 2;
                    const diff = elCenter - viewCenter;
                    const factor = (item.speed - 100) / 100;
                    if (factor === 0) {
                        return;
                    }
                    item.el.style.transform = `translateY(${diff * factor}px)`;
                });
            }

            ticking = false;
        };

        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(update);
                ticking = true;
            }
        };

        if (video || parallaxItems.length) {
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', cacheParallaxPositions, { passive: true });
            cacheParallaxPositions();
            update();
        }

        if (!isMobile && !prefersReducedMotion) {
            let target = window.scrollY;
            let current = window.scrollY;
            const ease = 0.1;

            const getMaxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

            const onWheel = event => {
                event.preventDefault();
                target += Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 100) * 0.75;
                target = Math.max(0, Math.min(target, getMaxScroll()));
            };

            // Intercept anchor clicks so the smooth scroll knows where to go
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', e => {
                    const id = anchor.getAttribute('href').slice(1);
                    const dest = document.getElementById(id);
                    if (!dest) return;
                    e.preventDefault();
                    target = Math.max(0, Math.min(dest.getBoundingClientRect().top + window.scrollY, getMaxScroll()));
                });
            });

            const updateSmoothScroll = () => {
                current += (target - current) * ease;
                if (Math.abs(target - current) < 0.1) {
                    current = target;
                }
                window.scrollTo(0, current);
                requestAnimationFrame(updateSmoothScroll);
            };

            window.addEventListener('wheel', onWheel, { passive: false });
            updateSmoothScroll();
        }
    };


    const init = () => {
        setupAge();
        setupCursor();
        setupFeaturedProjects();
        setupBentoProjects();
        setupScrollEffects();
        setupHeaderAndText();
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);

