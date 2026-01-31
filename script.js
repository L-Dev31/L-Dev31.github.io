const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 1024;
let originalTextContent = null;
let resizeTimeout;
let projectPreviewImg, previewTargetX = 0, previewTargetY = 0, previewCurrentX = 0, previewCurrentY = 0, previewAnimFrame;

document.addEventListener('DOMContentLoaded', () => {
    initTime();
    initCursor();
    initBlurScroll();
    initTextSplitter();
    initParallax();
    loadFeaturedProjects();
    initTitleAnimation();
    
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(initTextSplitter, 150);
    });
});

function initTime() {
    const el = document.getElementById('header-hour');
    if(!el) return;
    const update = () => {
        const now = new Date();
        el.textContent = new Intl.DateTimeFormat('en-US', { 
            timeZone: 'Europe/Paris', 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
        }).format(now).toUpperCase();
    };
    update();
    setInterval(update, 15000);
}

function initCursor() {
    if (isMobile) return;
    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    document.body.appendChild(cursor);
    
    // Update transform each mousemove but include current scale state from class
    document.addEventListener('mousemove', e => {
        const scale = cursor.classList.contains('cursor--small') ? ' scale(0.5)' : '';
        cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)${scale}`;
    });

    const clickableSelector = 'a, button, .clickable';
    document.querySelectorAll(clickableSelector).forEach(el => {
        el.addEventListener('mouseenter', () => cursor.classList.add('cursor--small'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('cursor--small'));
        // keyboard accessibility: focus/blur should also toggle size
        el.addEventListener('focus', () => cursor.classList.add('cursor--small'));
        el.addEventListener('blur', () => cursor.classList.remove('cursor--small'));
    });
} 

function initBlurScroll() {
    let ticking = false;

    // Créer l'overlay s'il n'existe pas
    let overlay = document.querySelector('.header-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'header-overlay';
        document.body.appendChild(overlay);
    }

    const header = document.getElementById('header');
    const getHeaderHeight = () => header ? header.offsetHeight : window.innerHeight;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const scrolled = window.scrollY;
                const headerH = getHeaderHeight();
                // Progression 0 -> 1 sur une fraction de la hauteur du header (apparaît plus tôt en scroll)
                const progress = Math.min(1, Math.max(0, scrolled / (headerH * 0.5)));

                const maxDark = 1; // opacité maximale du dark overlay (opaque)
                const maxBlur = 8; // px maximal pour le blur

                overlay.style.background = `rgba(0,0,0,${progress * maxDark})`;
                overlay.style.backdropFilter = `blur(${progress * maxBlur}px)`;
                overlay.style.opacity = progress;

                // Restreindre l'overlay à la hauteur du header pour qu'il cache uniquement le header
                overlay.style.height = `${headerH}px`;
                overlay.style.top = `${header.offsetTop}px`;

                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

function initTextSplitter() {
    const container = document.getElementById('split-text');
    if (!container) return;

    if (!originalTextContent) originalTextContent = container.innerHTML;
    
    // Nettoyage préalable pour éviter les duplications lors du resize
    container.innerHTML = originalTextContent.replace(/<div class="text-line.*?>/g, '').replace(/<\/div>/g, '');
    
    // Création des spans pour chaque mot
    const allNodes = Array.from(container.childNodes);
    const wordSpans = [];
    container.innerHTML = '';
    
    allNodes.forEach(node => {
        if(node.nodeType === 3) { // Texte
            node.textContent.split(' ').forEach(txt => {
                if(!txt.trim()) return;
                const s = document.createElement('span');
                s.textContent = txt + ' ';
                s.style.display = 'inline-block';
                container.appendChild(s);
                wordSpans.push(s);
            });
        } else { // Élément (ex: strong)
            const s = document.createElement('span');
            s.innerHTML = node.outerHTML + ' ';
            s.style.display = 'inline-block';
            container.appendChild(s);
            wordSpans.push(s);
        }
    });

    // Regroupement par lignes visuelles
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

    // Injection du HTML structuré
    container.innerHTML = '';
    lines.forEach((line, i) => {
        const div = document.createElement('div');
        div.className = 'text-line';
        // Petit délai incrémental pour fluidité, mais l'apparition dépend surtout du scroll
        div.style.transitionDelay = `${i * 0.05}s`; 
        line.forEach(s => div.innerHTML += s.innerHTML);
        container.appendChild(div);
    });

    // Observer configuré pour couper à 50% du viewport
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            e.target.classList.toggle('visible', e.isIntersecting);
        });
    }, { 
        threshold: 0,
        rootMargin: "0px 0px -25% 0px"
    });
    
    document.querySelectorAll('.text-line').forEach(l => obs.observe(l));
}

function initParallax() {
    if(isMobile) return;
    const section = document.querySelector('.about-me-section');
    const text = document.querySelector('.about-me-text');
    const img = document.querySelector('.about-me-image');

    if(!section || !text || !img) return;

    let ticking = false;
    window.addEventListener('scroll', () => {
        if(!ticking) {
            window.requestAnimationFrame(() => {
                const rect = section.getBoundingClientRect();
                const viewH = window.innerHeight;
                
                // Active l'effet seulement quand la section est visible
                if(rect.top < viewH && rect.bottom > 0) {
                    const center = (rect.top + rect.height/2) - viewH/2;
                    text.style.transform = `translateY(${center * 0.1}px)`;
                    img.style.transform = `translateY(${center * -0.15}px)`;
                }
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

function initTitleAnimation() {
    const el = document.getElementById('site-title');
    if (!el) return;
    // Prevent double init
    if (el.dataset._init) return; el.dataset._init = '1';

    const text = el.textContent;
    el.innerHTML = '';
    const chars = Array.from(text);
    const spans = chars.map((ch, i) => {
        const s = document.createElement('span');
        s.className = 'site-title-letter';
        s.textContent = ch === ' ' ? '\u00A0' : ch;
        // give each letter a small delay via inline style (fallback)
        s.style.transitionDelay = `${i * 0.03}s`;
        el.appendChild(s);
        return s;
    });

    // Stagger the activation so letters slide up one after another
    spans.forEach((s, i) => {
        setTimeout(() => s.classList.add('visible'), i * 30 + 50);
    });

    // No color fill — keep title color as inverted mix-blend-mode throughout
    // (no-op)
}

function animateProjectPreview() {
  if (!projectPreviewImg || projectPreviewImg.style.display !== 'block') return;
  previewCurrentX += (previewTargetX - previewCurrentX) * 0.18;
  previewCurrentY += (previewTargetY - previewCurrentY) * 0.18;
  projectPreviewImg.style.left = previewCurrentX + 'px';
  projectPreviewImg.style.top = previewCurrentY + 'px';
  previewAnimFrame = requestAnimationFrame(animateProjectPreview);
}

function showProjectPreview(imgUrl, x, y) {
  if (!projectPreviewImg) {
    projectPreviewImg = document.createElement('img');
    projectPreviewImg.className = 'project-preview-img';
    document.body.appendChild(projectPreviewImg);
  }
  projectPreviewImg.src = imgUrl;
  projectPreviewImg.style.display = 'block';
  // Décalage de 10vh à droite, centré verticalement sur le curseur
  const size = 20 * window.innerHeight / 100; // 20vh en px
  previewTargetX = x + (10 * window.innerHeight / 100);
  previewTargetY = y - size / 2;
  if (!previewAnimFrame) animateProjectPreview();
}

function hideProjectPreview() {
  if (projectPreviewImg) projectPreviewImg.style.display = 'none';
  cancelAnimationFrame(previewAnimFrame);
  previewAnimFrame = null;
}

function loadFeaturedProjects() {
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
        if (project.path && !project.path.startsWith('http')) {
          a.href = project.path + '/';
        } else {
          a.href = project.path;
        }
        a.target = '_blank';
        if (project.creator && project.creator.trim()) {
          const author = document.createElement('span');
          author.className = 'featured-author';
          author.textContent = ` ${project.creator}`;
          a.appendChild(author);
        }
        // Image de hover automatique selon l'id
        const imgPath = `Elements/image/${project.id}-banner.png`;
        a.addEventListener('mouseenter', e => {
          showProjectPreview(imgPath, e.clientX, e.clientY);
          document.querySelector('.cursor')?.classList.add('cursor--small');
        });
        a.addEventListener('mousemove', e => {
          showProjectPreview(imgPath, e.clientX, e.clientY);
        });
        a.addEventListener('mouseleave', e => {
          hideProjectPreview();
          document.querySelector('.cursor')?.classList.remove('cursor--small');
        });
        a.addEventListener('focus', () => document.querySelector('.cursor')?.classList.add('cursor--small'));
        a.addEventListener('blur', () => document.querySelector('.cursor')?.classList.remove('cursor--small'));
        list.appendChild(a);
      });
    });
}