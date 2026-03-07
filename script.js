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
            observe(aboutText);
        }

        document.querySelectorAll('.story-text').forEach(storyText => {
            const h3 = storyText.querySelector('h3');
            const para = storyText.querySelector('.story-paragraph');
            if (h3) {
                observe(h3);
            }
            if (para) {
                para.style.transitionDelay = '0.15s';
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

    const setupFeaturedProjects = () => {
        const list = document.querySelector('.featured-list');
        if (!list) {
            return;
        }

        let previewContainer = null;
        let previewImage = null;
        let previewDesc = null;
        let targetX = 0;
        let targetY = 0;
        let currentX = 0;
        let currentY = 0;
        let animationFrame = null;
        let projects = [];

        const filters = {
            all: document.getElementById('everything'),
            personal: document.getElementById('personal-project'),
            commissions: document.getElementById('commissions'),
            mobileAll: document.getElementById('everything-mobile')
        };

        const setActiveFilter = filterName => {
            [filters.all, filters.personal, filters.commissions].forEach(link => {
                if (!link) {
                    return;
                }
                link.classList.toggle('active', link.dataset.filter === filterName);
            });
        };

        const ensurePreview = () => {
            if (previewContainer || isMobile || prefersReducedMotion) {
                return;
            }
            previewContainer = document.createElement('div');
            previewContainer.className = 'project-preview-container';

            previewImage = document.createElement('img');
            previewImage.className = 'project-preview-img';
            previewContainer.appendChild(previewImage);

            previewDesc = document.createElement('div');
            previewDesc.className = 'project-preview-desc';
            previewContainer.appendChild(previewDesc);

            document.body.appendChild(previewContainer);
        };

        const animatePreview = () => {
            if (!previewContainer || previewContainer.style.display !== 'flex') {
                return;
            }

            currentX += (targetX - currentX) * 0.1;
            currentY += (targetY - currentY) * 0.1;
            previewContainer.style.left = `${currentX}px`;
            previewContainer.style.top = `${currentY}px`;
            animationFrame = requestAnimationFrame(animatePreview);
        };

        const showPreview = (imageUrl, description, x, y) => {
            ensurePreview();
            if (!previewContainer || !previewImage || !previewDesc) {
                return;
            }

            previewImage.src = imageUrl;
            previewDesc.textContent = description || '';
            previewContainer.style.display = 'flex';

            const size = (20 * window.innerHeight) / 100;
            const offset = (5 * window.innerHeight) / 100;

            targetX = x + offset;
            targetY = y - size / 2;

            if (!animationFrame) {
                animatePreview();
            }
        };

        const hidePreview = () => {
            if (previewContainer) {
                previewContainer.style.display = 'none';
            }
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
            link.addEventListener('mouseenter', event => {
                showPreview(imagePath, project.description, event.clientX, event.clientY);
                document.querySelector('.cursor')?.classList.add('cursor--small');
            });
            link.addEventListener('mousemove', event => {
                showPreview(imagePath, project.description, event.clientX, event.clientY);
            });
            link.addEventListener('mouseleave', () => {
                hidePreview();
                document.querySelector('.cursor')?.classList.remove('cursor--small');
            });

            return link;
        };

        const renderProjects = filterName => {
            setActiveFilter(filterName);

            const allowed = projects.filter(project => {
                if (isMobile && project.noPhone === true) {
                    return false;
                }
                if (filterName === 'all') {
                    return true;
                }
                return project.category === filterName;
            });

            list.innerHTML = '';
            if (!allowed.length) {
                list.innerHTML = '<p class="projects-empty">No project available for this filter.</p>';
                return;
            }

            allowed.forEach(project => {
                list.appendChild(buildProjectLink(project));
            });
        };

        const bindFilter = (el, filterName) => {
            if (!el) {
                return;
            }
            el.dataset.filter = filterName;
            el.addEventListener('click', event => {
                event.preventDefault();
                renderProjects(filterName);
            });
        };

        bindFilter(filters.all, 'all');
        bindFilter(filters.personal, 'personal-project');
        bindFilter(filters.commissions, 'commission');
        bindFilter(filters.mobileAll, 'all');

        fetchJson('projects.json')
            .then(data => {
                projects = Array.isArray(data.projects) ? data.projects : [];
                renderProjects('all');
            })
            .catch(error => {
                console.error('Failed to load projects:', error);
                list.innerHTML = '<p class="projects-empty">Unable to load projects for now.</p>';
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
            let maxScroll = document.documentElement.scrollHeight - window.innerHeight;

            const onWheel = event => {
                event.preventDefault();
                target += Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 100) * 0.75;
                target = Math.max(0, Math.min(target, maxScroll));
            };

            const updateSmoothScroll = () => {
                current += (target - current) * ease;
                if (Math.abs(target - current) < 0.1) {
                    current = target;
                }
                window.scrollTo(0, current);
                requestAnimationFrame(updateSmoothScroll);
            };

            window.addEventListener('wheel', onWheel, { passive: false });
            window.addEventListener('resize', () => {
                maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            });
            updateSmoothScroll();
        }
    };


    const init = () => {
        setupAge();
        setupCursor();
        setupFeaturedProjects();
        setupScrollEffects();
        setupHeaderAndText();
    };

    return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);

