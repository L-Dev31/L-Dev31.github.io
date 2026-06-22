const CONFIG = { imageFolder:'images/BG/', slideInterval:30000, password:'312007' };
let currentImageIndex = 0, localImages = [], autoChangeInterval = null, isLoginMode = false, userProfile = null, currentGridConfig = null, currentGridPositions = [];
const knownImages = ['1.jpg','2.jpg','3.jpg','4.jpg','5.jpg','6.jpg','219692.jpg','7704801.jpg','8957663.jpg'];

async function loadImages() {
    const found = [];
    for (const name of knownImages) { if (await imageExists(CONFIG.imageFolder+name)) found.push(name); }
    localImages = found;
    return found;
}
function imageExists(src) {
    return new Promise(r => {
        const img = new Image();
        img.onload = () => r(true);
        img.onerror = () => r(false);
        img.src = src;
        setTimeout(() => r(false), 2000);
    });
}
function createIndicators() {
    const el = document.getElementById('imageIndicators');
    if (!el) return;
    el.innerHTML = '';
    localImages.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'indicator-dot';
        dot.addEventListener('click', () => changeToImage(i));
        el.appendChild(dot);
    });
    updateIndicators();
}
function updateIndicators() {
    document.querySelectorAll('.indicator-dot').forEach((d, i) => d.classList.toggle('active', i === currentImageIndex));
}
function changeToImage(index) {
    if (index < 0 || index >= localImages.length) return;
    currentImageIndex = index;
    const bg = document.getElementById('background');
    bg.style.opacity = '0';
    setTimeout(() => { bg.style.backgroundImage = `url(${CONFIG.imageFolder}${localImages[index]})`; bg.style.opacity = '1'; updateIndicators(); }, 500);
    resetAutoChange();
}
function nextImage() { changeToImage(currentImageIndex === localImages.length - 1 ? 0 : currentImageIndex + 1); }
function previousImage() { changeToImage(currentImageIndex === 0 ? localImages.length - 1 : currentImageIndex - 1); }
function startAutoChange() { clearInterval(autoChangeInterval); autoChangeInterval = setInterval(nextImage, CONFIG.slideInterval); }
function resetAutoChange() { startAutoChange(); }
function showLoginScreen() {
    isLoginMode = true;
    document.body.classList.add('blur-mode');
    setTimeout(() => {
        document.getElementById('loginScreen').classList.add('active');
        setTimeout(() => document.getElementById('passwordInput')?.focus(), 300);
    }, 100);
}
function hideLoginScreen() {
    isLoginMode = false;
    document.getElementById('loginScreen').classList.remove('active');
    setTimeout(() => document.body.classList.remove('blur-mode'), 200);
    const pi = document.getElementById('passwordInput');
    if (pi) { pi.value = ''; pi.blur(); }
}
function handleLogin() {
    const pw = document.getElementById('passwordInput')?.value || '';
    if (!pw.trim()) { shakeElement(document.getElementById('passwordInput')); return; }
    if (pw === CONFIG.password) { showDesktop(); }
    else {
        const inp = document.getElementById('passwordInput');
        shakeElement(inp);
        inp.style.borderColor = 'rgba(255,100,100,0.8)';
        setTimeout(() => { inp.style.borderColor = 'rgba(255,255,255,0.2)'; inp.value = ''; }, 500);
    }
}
function shakeElement(el) {
    if (!el) return;
    el.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => el.style.animation = '', 500);
}
async function showDesktop() {
    const fade = document.getElementById('fadeOverlay'), login = document.getElementById('loginScreen'), desktop = document.getElementById('desktop');
    fade.className = 'login-transition';
    setTimeout(() => fade.classList.add('zoom-in'), 50);
    setTimeout(() => { login.classList.remove('active'); document.body.classList.remove('blur-mode'); }, 600);
    setTimeout(async () => {
        if (!window.appLauncher.appsData) await loadApps();
        await loadDesktopItems();
        if (!userProfile) await loadUserProfile();
        updateUserInterface();
        loadSavedWallpaper();
        updateDesktopTime();
        setInterval(updateDesktopTime, 1000);
        setupTaskbarPositionWatcher();
        loadTaskbarSettings();
        desktop.classList.add('active');
        setTimeout(() => fade.classList.add('fade-out'), 100);
        setTimeout(() => { fade.className = ''; fade.style.cssText = ''; }, 800);
    }, 1000);
}
function calculateDesktopGrid() {
    const taskbar = document.getElementById('taskbar');
    const rect = taskbar.getBoundingClientRect();
    const pos = getCurrentTaskbarPosition();
    const cw = 110, ch = 110;
    let aw = window.innerWidth, ah = window.innerHeight, sx = 20, sy = 20;
    if (pos === 'bottom') ah -= rect.height;
    else if (pos === 'top') { ah -= rect.height; sy = rect.height + 20; }
    else if (pos === 'left') { aw -= rect.width; sx = rect.width + 20; }
    else if (pos === 'right') aw -= rect.width;
    return { cellWidth:cw, cellHeight:ch, padding:sx, paddingY:sy, rows:Math.floor((ah-sy)/ch), cols:Math.floor((aw-sx)/cw), taskbarPosition:pos };
}
function createGridPositions(g) {
    const p = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) p.push({ x:g.padding+(c*g.cellWidth), y:g.paddingY+(r*g.cellHeight), row:r, col:c });
    return p;
}
function findClosestGridPosition(x, y) {
    if (!currentGridPositions.length) return null;
    let closest = currentGridPositions[0], minD = Infinity;
    currentGridPositions.forEach(p => { const d = Math.hypot(p.x-x, p.y-y); if (d < minD) { minD = d; closest = p; } });
    return closest;
}
async function loadDesktopItems() {
    try {
        const items = await fetchHomeItemsFromServer();
        if (!Array.isArray(items) || !items.length) throw new Error('No desktop items returned.');
        const el = document.getElementById('desktopIcons');
        if (!el) return;
        el.innerHTML = '';
        const gc = calculateDesktopGrid();
        currentGridConfig = gc;
        const gp = createGridPositions(gc);
        currentGridPositions = gp;
        const saved = loadIconPositions();
        const used = new Set();
        const sk = (r,c) => r+','+c;
        const validated = items.map(item => {
            let pos = null, assigned = false;
            if (saved[item.name]) {
                const s = saved[item.name];
                if (s.gridRow !== undefined && s.gridCol !== undefined) {
                    const sr = parseInt(s.gridRow), sc = parseInt(s.gridCol);
                    if (sr >= 0 && sr < gc.rows && sc >= 0 && sc < gc.cols && !used.has(sk(sr,sc))) {
                        const gPos = gp.find(p => p.row===sr && p.col===sc);
                        if (gPos) { used.add(sk(sr,sc)); pos = gPos; assigned = true; }
                    }
                }
                if (!assigned) {
                    let closest = null, minD = Infinity;
                    for (const g of gp) { const d = Math.hypot(g.x-s.x, g.y-s.y); if (d < minD && !used.has(sk(g.row,g.col))) { minD = d; closest = g; } }
                    if (closest) { used.add(sk(closest.row,closest.col)); pos = closest; assigned = true; }
                }
            }
            if (!assigned) for (const g of gp) { if (!used.has(sk(g.row,g.col))) { used.add(sk(g.row,g.col)); pos = g; break; } }
            return { item, pos };
        });
        validated.forEach(({item, pos}) => {
            const di = document.createElement('div');
            di.className = 'desktop-item';
            if (pos) { di.style.position='absolute'; di.style.left=pos.x+'px'; di.style.top=pos.y+'px'; di.dataset.gridRow=pos.row; di.dataset.gridCol=pos.col; }
            let icon;
            if (item.isDirectory || item.type==='folder') icon = `<img src="images/folder.png" alt="${item.name}" class="folder-icon">`;
            else if (item.type==='app') icon = `<img src="${item.icon}" alt="${item.name}" class="app-icon">`;
            else if (item.type==='file') {
                if (typeof item.icon==='string' && item.icon.startsWith('fas ')) icon = `<div class="file-icon-fa"><i class="${item.icon}"></i></div>`;
                else if (item.icon) icon = `<img src="${item.icon}" alt="${item.name}" class="file-icon">`;
                else icon = `<div class="file-icon-fa"><i class="fas fa-file"></i></div>`;
            } else icon = `<div class="file-icon-fa"><i class="fas fa-question-circle"></i></div>`;
            di.innerHTML = `${icon}<span>${item.name}</span>`;
            let clickTimeout = null;
            di.addEventListener('click', e => {
                if (typeof isDragging !== 'undefined' && isDragging) { e.preventDefault(); e.stopPropagation(); return; }
                if (clickTimeout) {
                    clearTimeout(clickTimeout); clickTimeout = null;
                    if (window.universalLauncher) { window.universalLauncher.launch(window.universalLauncher.createLaunchItem(item), {basePath:'home'}); }
                    else if (item.isDirectory || item.type==='folder') window.appLauncher.launchApp('app1', {path:item.name});
                    else if (item.type==='app') window.appLauncher.launchApp(item.appId);
                    else if (item.type==='file') {
                        const ext = item.name.split('.').pop().toLowerCase();
                        if (['txt','md','json','js','css','html','xml','csv','log'].includes(ext))
                            fetch('home/'+item.name).then(r=>r.text()).then(c=>window.appLauncher.launchApp('app3',{fileName:item.name,content:c})).catch(()=>window.appLauncher.launchApp('app3',{fileName:item.name,content:''}));
                    }
                } else clickTimeout = setTimeout(() => clickTimeout = null, 300);
            });
            makeIconDraggable(di, item.name);
            el.appendChild(di);
        });
        window.desktopData = { desktopItems: items };
    } catch (e) {
        console.error('Could not load desktop items:', e);
    }
}
async function fetchHomeItemsFromServer() {
    try {
        const f = new DirectoryFetcher();
        if (window.appLauncher?.appsData) f.setAppsData(window.appLauncher.appsData.apps);
        return await f.fetchDirectoryContents('');
    } catch (e) { return []; }
}
async function loadApps() {
    try {
        const r = await fetch('Datas/apps.json');
        const data = await r.json();
        loadTaskbarApps(data.apps.filter(a => a.showInTaskbar));
        loadSettingsApps(data.apps);
    } catch (e) { console.error('Failed to load apps:', e); }
}
function loadTaskbarApps(apps) {
    const el = document.getElementById('taskbarApps');
    el.innerHTML = '';
    apps.forEach(app => {
        const img = document.createElement('img');
        img.src = app.icon; img.alt = app.name; img.className = 'taskbar-app'; img.title = app.name;
        img.dataset.appId = app.id; img.dataset.pinned = 'true';
        img.addEventListener('click', () => {
            if (window.universalLauncher?.appLauncher) window.universalLauncher.launch(window.universalLauncher.createLaunchItem(app));
            else window.appLauncher.launchApp(app.id);
        });
        el.appendChild(img);
    });
}
function loadSettingsApps(apps) {
    const el = document.getElementById('appGrid');
    el.innerHTML = '';
    apps.forEach(app => {
        const div = document.createElement('div');
        div.className = 'app-item';
        div.innerHTML = `<img src="${app.icon}" alt="${app.name}"><span>${app.name}</span>`;
        div.addEventListener('click', () => {
            if (window.universalLauncher?.appLauncher) window.universalLauncher.launch(window.universalLauncher.createLaunchItem(app));
            else window.appLauncher.launchApp(app.id);
            if (taskbarManager) taskbarManager.hideStartMenu();
        });
        el.appendChild(div);
    });
}
function updateDesktopTime() {
    const t = document.getElementById('desktopTime'), d = document.getElementById('desktopDate');
    if (!t || !d) return;
    const now = new Date();
    t.textContent = new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).format(now);
    d.textContent = new Intl.DateTimeFormat('en-US',{month:'numeric',day:'numeric',year:'numeric'}).format(now);
}

class TaskbarManager {
    constructor() {
        this.settings = { taskbarPosition:'bottom', taskbarAlignment:'center' };
        this.taskbarElement = null;
        this.zIndexProtectionInterval = null;
    }
    loadSettings() {
        try { const s = localStorage.getItem('desktop-settings'); if (s) this.settings = {...this.settings,...JSON.parse(s)}; } catch(e) {}
    }
    saveSettings() {
        try { localStorage.setItem('desktop-settings', JSON.stringify(this.settings)); } catch(e) {}
    }
    init() { this.setupEventListeners(); this.applyTaskbarSettings(); }
    setupEventListeners() {
        document.getElementById('startButton')?.addEventListener('click', e => { e.stopPropagation(); this.toggleStartMenu(); });
        document.getElementById('closeSettings')?.addEventListener('click', () => this.hideStartMenu());
        document.getElementById('logoutButton')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); logout(); });
        document.addEventListener('click', e => {
            const sp = document.getElementById('settingsPanel'), sb = document.getElementById('startButton');
            if (this.isStartMenuOpen && sp && !sp.contains(e.target) && !sb?.contains(e.target)) this.hideStartMenu();
        });
    }
    toggleStartMenu() { this.isStartMenuOpen ? this.hideStartMenu() : this.showStartMenu(); }
    showStartMenu() {
        const sp = document.getElementById('settingsPanel'), sb = document.getElementById('startButton');
        if (!sp) return;
        this.isStartMenuOpen = true;
        sp.classList.remove('position-bottom','position-top','position-left','position-right');
        sp.classList.add('position-'+this.settings.taskbarPosition);
        this.positionStartMenu();
        requestAnimationFrame(() => { sp.classList.add('active'); sb?.classList.add('active'); });
    }
    hideStartMenu() {
        const sp = document.getElementById('settingsPanel'), sb = document.getElementById('startButton');
        if (!sp) return;
        this.isStartMenuOpen = false;
        sp.classList.remove('active');
        sb?.classList.remove('active');
    }
    positionStartMenu() {
        const sb = document.getElementById('startButton'), tb = document.getElementById('taskbar'), sp = document.getElementById('settingsPanel');
        if (!sb || !tb || !sp) return;
        const sr = sb.getBoundingClientRect(), tr = tb.getBoundingClientRect(), gap = 12;
        sp.style.left = ''; sp.style.right = ''; sp.style.top = ''; sp.style.bottom = '';
        switch(this.settings.taskbarPosition) {
            case 'bottom': sp.style.bottom = (window.innerHeight-tr.top+gap)+'px'; sp.style.left = Math.max(20,sr.left)+'px'; break;
            case 'top': sp.style.top = (tr.bottom+gap)+'px'; sp.style.left = Math.max(20,sr.left)+'px'; break;
            case 'left': sp.style.left = (tr.right+gap)+'px'; requestAnimationFrame(() => this.alignVerticalMenu(sp,sr)); break;
            case 'right': sp.style.right = (window.innerWidth-tr.left+gap)+'px'; requestAnimationFrame(() => this.alignVerticalMenu(sp,sr)); break;
        }
    }
    alignVerticalMenu(panel, sr) {
        const pr = panel.getBoundingClientRect();
        let top;
        switch(this.settings.taskbarAlignment) {
            case 'center': top = sr.top+(sr.height/2)-(pr.height/2); break;
            case 'end': top = sr.bottom-pr.height; break;
            default: top = sr.top; break;
        }
        top = Math.max(20, Math.min(top, window.innerHeight-pr.height-20));
        panel.style.top = top+'px';
    }
    applyTaskbarSettings() {
        const tb = document.getElementById('taskbar');
        if (!tb) return;
        tb.className = 'taskbar';
        tb.classList.add('position-'+this.settings.taskbarPosition, 'align-'+this.settings.taskbarAlignment);
        setTimeout(() => { if (typeof loadDesktopItems === 'function') loadDesktopItems(); }, 50);
        if (this.isStartMenuOpen) setTimeout(() => this.positionStartMenu(), 100);
        if (window.windowManager) setTimeout(() => window.windowManager.adjustMaximizedWindowsForTaskbar(), 150);
        this.saveSettings();
    }
    updateTaskbarPosition(p) { this.settings.taskbarPosition = p; this.applyTaskbarSettings(); }
    updateTaskbarAlignment(a) { this.settings.taskbarAlignment = a; this.applyTaskbarSettings(); }
    enableZIndexProtection() {
        const tb = document.getElementById('taskbar');
        if (!tb) return;
        this.taskbarElement = tb;
        this.zIndexProtectionInterval = setInterval(() => this.enforceTaskbarZIndex(), 5000);
        if (window.MutationObserver) {
            new MutationObserver(() => setTimeout(() => this.enforceTaskbarZIndex(), 10))
                .observe(tb, { attributes:true, attributeFilter:['style','class'] });
        }
        document.addEventListener('focusin', () => this.enforceTaskbarZIndex());
    }
    enforceTaskbarZIndex() {
        if (!this.taskbarElement) return;
        if ((parseInt(window.getComputedStyle(this.taskbarElement).zIndex)||0) < 999999) this.taskbarElement.style.zIndex = '999999';
    }
    disableZIndexProtection() {
        if (this.zIndexProtectionInterval) { clearInterval(this.zIndexProtectionInterval); this.zIndexProtectionInterval = null; }
    }
}
function loadTaskbarSettings() { if (window.taskbarManager?.loadSettings) window.taskbarManager.loadSettings(); }

async function loadUserProfile() {
    try {
        let ud = JSON.parse(localStorage.getItem('user-data'));
        if (ud) { userProfile = { user: { name:ud.name, profilePicture:ud.profilePicture } }; return userProfile; }
        const r = await fetch('Datas/user-profile.json');
        userProfile = await r.json();
        localStorage.setItem('user-data', JSON.stringify({ name:userProfile.user.name, profilePicture:userProfile.user.profilePicture, password:'312007' }));
        return userProfile;
    } catch(e) {
        userProfile = { user: { name:'Keira Mayhew', profilePicture:'images/profile.png' } };
        localStorage.setItem('user-data', JSON.stringify({ name:'Keira Mayhew', profilePicture:'images/profile.png', password:'312007' }));
        return userProfile;
    }
}
function updateUserInterface() {
    if (!userProfile) return;
    const u = userProfile.user;
    if (u.profilePicture) imageExists(u.profilePicture).then(ok => updateProfilePictures(u, ok));
    else updateProfilePictures(u, false);
    const un = document.querySelector('.user-name'), uns = document.querySelector('.user-name-small'), fun = document.querySelector('.footer-user-name');
    if (un) un.textContent = u.name;
    if (uns) uns.textContent = u.name;
    if (fun) fun.textContent = u.name;
    updateMetadata();
}
function updateProfilePictures(u, exists) {
    const pp = document.querySelector('.profile-picture'), ua = document.querySelector('.user-avatar'), fa = document.querySelector('.footer-user-avatar');
    const imgTag = s => `<img src="${u.profilePicture}" alt="${u.name}" style="width:${s};height:${s};border-radius:50%;object-fit:cover;">`;
    const fallback = '<i class="fa-regular fa-circle-user"></i>';
    if (pp) pp.innerHTML = exists ? imgTag('96px') : fallback;
    if (ua) ua.innerHTML = exists ? imgTag('100%') : fallback;
    if (fa) fa.innerHTML = exists ? imgTag('100%') : fallback;
}
function updateMetadata() {
    const el = document.getElementById('metadata');
    if (!el) return;
    const now = new Date();
    el.innerHTML = `<div style="margin-bottom:8px;">${now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})}</div><div>${now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>`;
}
function loadSavedWallpaper() { updateDesktopWallpaper(localStorage.getItem('desktop-wallpaper') || 'images/wallpaper.jpg'); }
function updateDesktopWallpaper(url) {
    const bg1 = document.querySelector('.desktop-background'), bg2 = document.getElementById('desktopBackground'), bg3 = document.querySelector('.desktop');
    if (bg1) bg1.style.backgroundImage = `url('${url}')`;
    if (bg2) bg2.style.backgroundImage = `url('${url}')`;
    if (!bg1 && !bg2 && bg3) bg3.style.backgroundImage = `url('${url}')`;
}
function setupEventListeners() {
    document.addEventListener('keydown', e => {
        if (isLoginMode) { if (e.key==='Enter') handleLogin(); if (e.key==='Escape') hideLoginScreen(); return; }
        if (e.key==='ArrowLeft') previousImage();
        else if (e.key==='ArrowRight') nextImage();
        else if (e.key===' '||e.key==='Spacebar') { e.preventDefault(); showLoginScreen(); }
    });
    document.getElementById('submitButton')?.addEventListener('click', handleLogin);
    document.getElementById('passwordInput')?.addEventListener('keydown', e => { if (e.key==='Enter') handleLogin(); });
}
function setupTaskbarPositionWatcher() {
    const tb = document.getElementById('taskbar');
    if (!tb) return;
    let lastPos = getCurrentTaskbarPosition();
    new MutationObserver(() => {
        const p = getCurrentTaskbarPosition();
        if (p !== lastPos) { lastPos = p; setTimeout(() => loadDesktopItems(), 100); }
    }).observe(tb, { attributes:true, attributeFilter:['class'] });
}
function getCurrentTaskbarPosition() {
    const tb = document.getElementById('taskbar');
    if (!tb) return 'bottom';
    const pc = Array.from(tb.classList).find(c => c.startsWith('position-'));
    return pc ? pc.replace('position-','') : 'bottom';
}
function logout() {
    const fade = document.getElementById('fadeOverlay'), sp = document.getElementById('settingsPanel');
    if (sp) sp.classList.remove('active');
    if (window.windowManager) for (const [id] of window.windowManager.windows) window.windowManager.closeWindow(id);
    sessionStorage.removeItem('authenticated');
    fade.className = 'fade-to-black';
    setTimeout(() => fade.classList.add('active'), 50);
    setTimeout(() => window.location.href = 'index.html', 1500);
}

const taskbarManager = new TaskbarManager();
window.taskbarManager = taskbarManager;

document.addEventListener('DOMContentLoaded', async () => {
    const isDesktop = !!document.getElementById('desktop');
    const isLogin = !!document.getElementById('loginScreen');
    if (isDesktop) {
        taskbarManager.loadSettings();
        taskbarManager.init();
        taskbarManager.enableZIndexProtection();
        await window.appLauncher.init();
        await loadApps();
        await loadUserProfile();
        updateUserInterface();
        updateDesktopTime();
        setInterval(updateDesktopTime, 1000);
        await loadDesktopItems();
        setTimeout(() => loadSavedWallpaper(), 500);
    } else if (isLogin) {
        const imgs = await loadImages();
        if (imgs.length > 0) { createIndicators(); changeToImage(0); startAutoChange(); setupEventListeners(); }
        else {
            const bg = document.getElementById('background');
            if (bg) { bg.style.backgroundColor='#1a1a1a'; bg.style.display='flex'; bg.style.alignItems='center'; bg.style.justifyContent='center'; bg.innerHTML='<div style="color:white;text-align:center;font-size:1.2em;"><h2>No Images Found</h2><p>Add images to Images/BG/</p></div>'; }
        }
    }
});

function handleWindowResize() {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        const g = calculateDesktopGrid();
        if (!currentGridConfig || currentGridConfig.rows !== g.rows || currentGridConfig.cols !== g.cols) loadDesktopItems();
    }, 250);
}
const ICON_POSITIONS_KEY = 'desktop-icon-positions';
function loadIconPositions() { try { const s = localStorage.getItem(ICON_POSITIONS_KEY); return s ? JSON.parse(s) : {}; } catch(e) { return {}; } }
function saveIconPositions(p) { try { localStorage.setItem(ICON_POSITIONS_KEY, JSON.stringify(p)); } catch(e) {} }
function getCurrentIconPositions() {
    const p = {};
    document.querySelectorAll('.desktop-item').forEach(icon => {
        const name = icon.querySelector('span')?.textContent;
        if (name) p[name] = { x:parseInt(icon.style.left), y:parseInt(icon.style.top), gridRow:parseInt(icon.dataset.gridRow), gridCol:parseInt(icon.dataset.gridCol) };
    });
    return p;
}
let draggedIcon = null, isDragging = false, dragStarted = false;
function makeIconDraggable(el, name) {
    el.draggable = false;
    el.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        dragStarted = false; draggedIcon = el;
        const rect = el.getBoundingClientRect(), ox = e.clientX-rect.left, oy = e.clientY-rect.top, sx = e.clientX, sy = e.clientY;
        const onMove = me => {
            if (!dragStarted && (Math.abs(me.clientX-sx) > 5 || Math.abs(me.clientY-sy) > 5)) { dragStarted = true; isDragging = true; el.style.zIndex='1000'; el.style.opacity='0.8'; }
            if (dragStarted) { el.style.left = (me.clientX-ox)+'px'; el.style.top = (me.clientY-oy)+'px'; }
        };
        const onUp = ue => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (dragStarted) {
                const tp = findBestGridPosition(ue.clientX-ox, ue.clientY-oy);
                el.style.left = tp.x+'px'; el.style.top = tp.y+'px'; el.dataset.gridRow = tp.row; el.dataset.gridCol = tp.col;
                saveIconPositions(getCurrentIconPositions());
            }
            el.style.zIndex = ''; el.style.opacity = ''; draggedIcon = null; isDragging = false; dragStarted = false;
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
    });
    el.addEventListener('click', e => { if (dragStarted) { e.preventDefault(); e.stopPropagation(); } });
}
function findBestGridPosition(x, y) {
    if (!currentGridConfig) return { x:20, y:20, row:0, col:0 };
    const tc = Math.max(0, Math.min(Math.round((x-currentGridConfig.padding)/currentGridConfig.cellWidth), currentGridConfig.cols-1));
    const tr = Math.max(0, Math.min(Math.round((y-currentGridConfig.paddingY)/currentGridConfig.cellHeight), currentGridConfig.rows-1));
    const occ = getIconAtPosition(tr, tc);
    if (occ && occ !== draggedIcon) swapIconPositions(draggedIcon, occ);
    return getGridCoordinates(tr, tc);
}
function getIconAtPosition(row, col) {
    for (const icon of document.querySelectorAll('.desktop-item')) {
        if (icon === draggedIcon) continue;
        if (parseInt(icon.dataset.gridRow)===row && parseInt(icon.dataset.gridCol)===col) return icon;
    }
    return null;
}
function swapIconPositions(i1, i2) {
    const r1 = parseInt(i1.dataset.gridRow), c1 = parseInt(i1.dataset.gridCol), co1 = getGridCoordinates(r1,c1);
    i2.style.left = co1.x+'px'; i2.style.top = co1.y+'px'; i2.dataset.gridRow = r1; i2.dataset.gridCol = c1;
}
function isPositionOccupied(row, col) {
    for (const icon of document.querySelectorAll('.desktop-item')) { if (icon !== draggedIcon && parseInt(icon.dataset.gridRow)===row && parseInt(icon.dataset.gridCol)===col) return true; }
    return false;
}
function getGridCoordinates(row, col) {
    return { x:currentGridConfig.padding+(col*currentGridConfig.cellWidth), y:currentGridConfig.paddingY+(row*currentGridConfig.cellHeight), row, col };
}
