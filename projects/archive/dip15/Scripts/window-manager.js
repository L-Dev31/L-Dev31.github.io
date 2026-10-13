class WindowManager {
    constructor() {
        this.windows = new Map();
        this.activeWindow = null;
        this.zIndexCounter = 1000;
        this.maxWindowZIndex = 5000;
        this.taskbarApps = new Map();
        this.snapZones = null;
        this.isDragging = false;
        this.draggedWindow = null;
        this.setupGlobalEvents();
        this.createSnapZones();
    }
    createWindow(options = {}) {
        const windowId = options.id || 'window-'+Date.now();
        if (options.appId) {
            for (const [id, w] of this.windows) {
                if (w.appId === options.appId) { this.focusWindow(id); return w; }
            }
        }
        const cfg = { title:'Untitled Window', x:100, y:100, resizable:true, minimizable:true, maximizable:true, closable:true, icon:'images/icon.png', appId:null, content:'', footerText:'', className:'', ...options, id:windowId };
        const el = document.createElement('div');
        el.className = 'app-window '+cfg.className;
        el.id = windowId;
        el.style.cssText = `position:absolute;left:${cfg.x}px;top:${cfg.y}px;z-index:${++this.zIndexCounter};`;
        el.innerHTML = `<div class="window-header"><div class="window-title-area"><img src="${cfg.icon}" alt="${cfg.title}" class="window-icon"><span class="window-title">${cfg.title}</span></div><div class="window-controls">${cfg.minimizable?'<button class="window-btn minimize-btn" title="Minimize"><i class="fas fa-window-minimize"></i></button>':''}${cfg.maximizable?'<button class="window-btn maximize-btn" title="Maximize"><i class="fas fa-window-maximize"></i></button>':''}${cfg.closable?'<button class="window-btn close-btn" title="Close"><i class="fas fa-times"></i></button>':''}</div></div><div class="window-content">${cfg.content}</div><div class="window-footer"><div class="window-footer-info">${cfg.footerText}</div><div class="window-resize-handle"></div></div>`;
        document.body.appendChild(el);
        const obj = { id:windowId, element:el, config:cfg, isMinimized:false, isMaximized:false, savedState:null };
        this.windows.set(windowId, obj);
        this.setupWindowEvents(obj);
        this.focusWindow(windowId);
        this.addToTaskbar(obj);
        return obj;
    }
    setupWindowEvents(obj) {
        const {element, config, id} = obj;
        const header = element.querySelector('.window-header');
        element.addEventListener('mousedown', e => { if (!e.target.closest('.window-controls')) this.focusWindow(id); });
        if (header) {
            this.makeDraggable(element, header);
            header.addEventListener('dblclick', e => { if (!e.target.closest('.window-controls')) this.toggleMaximizeWindow(id); });
        }
        element.querySelector('.minimize-btn')?.addEventListener('click', e => { e.stopPropagation(); this.minimizeWindow(id); });
        element.querySelector('.maximize-btn')?.addEventListener('click', e => { e.stopPropagation(); this.toggleMaximizeWindow(id); });
        element.querySelector('.close-btn')?.addEventListener('click', e => { e.stopPropagation(); this.closeWindow(id); });
        const rh = element.querySelector('.window-resize-handle');
        if (rh && config.resizable) this.makeResizable(element, rh);
    }
    makeDraggable(element, handle) {
        let dragging = false, startX, startY, startLeft, startTop;
        handle.addEventListener('mousedown', e => {
            if (e.target.closest('.window-controls')) return;
            dragging = true; this.isDragging = true; this.draggedWindow = element;
            const obj = this.windows.get(element.id);
            if (obj && !obj.isSnapped && !obj.isMaximized) this.saveWindowState(obj);
            startX = e.clientX; startY = e.clientY;
            startLeft = parseInt(element.style.left)||element.offsetLeft;
            startTop = parseInt(element.style.top)||element.offsetTop;
            handle.style.cursor = 'grabbing'; e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const obj = this.windows.get(element.id);
            if (obj && (obj.isSnapped||obj.isMaximized)) {
                if (obj.savedState) {
                    element.style.width = obj.savedState.width+'px'; element.style.height = obj.savedState.height+'px';
                    startLeft = e.clientX - obj.savedState.width/2; startTop = e.clientY - 30; startX = e.clientX; startY = e.clientY;
                }
                obj.isSnapped = false; obj.isMaximized = false; obj.snapType = null;
                element.classList.remove('maximized','snapped'); element.removeAttribute('data-snap-type');
                this.updateMaximizeButtonIcon(obj, null);
            }
            element.style.left = (startLeft+(e.clientX-startX))+'px';
            const tb = document.querySelector('.taskbar'), tr = tb?.getBoundingClientRect(), tp = this.getTaskbarPosition();
            let at = tp==='top' && tr ? tr.height : 0;
            element.style.top = Math.max(at, startTop+(e.clientY-startY))+'px';
            this.showSnapPreview(e.clientX, e.clientY);
        });
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false; this.isDragging = false; handle.style.cursor = '';
            if (this.snapPreview) {
                const st = this.snapPreview.dataset.snapType;
                if (st) this.applySnap(element.id, st);
                this.hideSnapPreview();
            }
            this.draggedWindow = null;
        });
    }
    makeResizable(element, handle) {
        let resizing = false, startX, startY, startW, startH;
        handle.addEventListener('mousedown', e => {
            resizing = true; startX = e.clientX; startY = e.clientY;
            const r = element.getBoundingClientRect(); startW = r.width; startH = r.height;
            element.classList.add('resizing'); handle.style.cursor = 'se-resize';
            const obj = this.windows.get(element.id);
            if (obj && (obj.isSnapped||obj.isMaximized)) {
                obj.isSnapped = false; obj.isMaximized = false; obj.snapType = null;
                element.classList.remove('maximized','snapped'); element.removeAttribute('data-snap-type');
                this.updateMaximizeButtonIcon(obj, null);
            }
            e.preventDefault(); e.stopPropagation();
        });
        document.addEventListener('mousemove', e => {
            if (!resizing) return;
            const cs = window.getComputedStyle(element);
            const minW = parseInt(cs.minWidth)||200, minH = parseInt(cs.minHeight)||150;
            element.style.transition = 'none';
            element.style.width = Math.min(Math.max(startW+(e.clientX-startX),minW), parseInt(cs.maxWidth)||window.innerWidth)+'px';
            element.style.height = Math.min(Math.max(startH+(e.clientY-startY),minH), parseInt(cs.maxHeight)||window.innerHeight)+'px';
        });
        document.addEventListener('mouseup', () => {
            if (!resizing) return;
            resizing = false; element.classList.remove('resizing'); handle.style.cursor = '';
            setTimeout(() => element.style.transition = '', 50);
        });
    }
    focusWindow(id) {
        const obj = this.windows.get(id);
        if (!obj) return;
        this.zIndexCounter = Math.min(++this.zIndexCounter, this.maxWindowZIndex);
        obj.element.style.zIndex = this.zIndexCounter;
        this.windows.forEach(w => w.element.classList.remove('active'));
        obj.element.classList.add('active');
        this.activeWindow = id;
        this.closeStartMenuIfOpen();
    }
    minimizeWindow(id) {
        const obj = this.windows.get(id);
        if (!obj) return;
        obj.element.style.transition = 'all 0.25s cubic-bezier(0.4,0,0.2,1)';
        obj.element.style.transformOrigin = 'center bottom';
        obj.element.style.transform = 'scale(0.8) translateY(20px)';
        obj.element.style.opacity = '0';
        setTimeout(() => {
            obj.isMinimized = true; obj.element.style.display = 'none';
            obj.element.style.transition = ''; obj.element.style.transform = ''; obj.element.style.transformOrigin = ''; obj.element.style.opacity = '';
            this.updateTaskbarState(obj);
            if (this.activeWindow === id) this.activeWindow = null;
        }, 250);
    }
    restoreWindow(id) {
        const obj = this.windows.get(id);
        if (!obj) return;
        obj.isMinimized = false;
        obj.element.style.display = 'block'; obj.element.style.opacity = '0';
        obj.element.style.transform = 'scale(0.8) translateY(20px)'; obj.element.style.transformOrigin = 'center bottom';
        obj.element.offsetHeight;
        obj.element.style.transition = 'all 0.25s cubic-bezier(0.4,0,0.2,1)';
        obj.element.style.opacity = '1'; obj.element.style.transform = 'scale(1) translateY(0)';
        setTimeout(() => { obj.element.style.transition = ''; obj.element.style.transformOrigin = ''; }, 250);
        if (obj.config.appId === 'app1' && window.filesAppInstance) {
            setTimeout(() => {
                try {
                    const fc = obj.element.querySelector('.files-container'), fco = obj.element.querySelector('.files-content'), fg = obj.element.querySelector('#filesGrid');
                    if (fc) { fc.style.display='flex'; fc.style.visibility='visible'; fc.style.opacity='1'; }
                    if (fco) { fco.style.display='flex'; fco.style.flexDirection='column'; fco.style.visibility='visible'; fco.style.opacity='1'; }
                    if (fg) { fg.style.display='grid'; fg.style.visibility='visible'; fg.style.opacity='1'; }
                    window.filesAppInstance.forceLayoutRecalc();
                    if (fco) {
                        fco.style.minHeight = Math.max(fco.offsetHeight,300)+'px'; fco.style.width = fco.offsetWidth+'px';
                        void fco.offsetHeight;
                        setTimeout(() => { fco.style.minHeight='300px'; fco.style.width=''; }, 150);
                    }
                    setTimeout(() => { if (window.top?.dispatchEvent) window.top.dispatchEvent(new Event('resize')); }, 200);
                } catch(e) {}
            }, 260);
        }
        this.updateTaskbarState(obj);
    }
    toggleMaximizeWindow(id) {
        const obj = this.windows.get(id);
        if (!obj) return;
        if (obj.isSnapped) {
            if (obj.savedState) {
                this.restoreWindowState(obj); obj.isSnapped = false; obj.snapType = null;
                obj.element.classList.remove('snapped'); obj.element.removeAttribute('data-snap-type');
                this.updateMaximizeButtonIcon(obj, null);
            }
            return;
        }
        if (obj.isMaximized) {
            if (obj.savedState) {
                this.restoreWindowState(obj); obj.isMaximized = false; obj.element.classList.remove('maximized');
                const mb = obj.element.querySelector('.maximize-btn i'); if (mb) mb.className = 'fas fa-window-maximize';
            }
        } else {
            this.saveWindowState(obj);
            const {top:at, bottom:ab, left:al, right:ar} = this.getAvailableArea();
            obj.element.style.transition = 'all 0.3s cubic-bezier(0.4,0,0.2,1)';
            obj.element.style.left = al+'px'; obj.element.style.top = at+'px';
            obj.element.style.width = (ar-al)+'px'; obj.element.style.height = (ab-at)+'px';
            obj.isMaximized = true; obj.isSnapped = false;
            obj.element.classList.add('maximized'); obj.element.classList.remove('snapped');
            const mb = obj.element.querySelector('.maximize-btn i'); if (mb) mb.className = 'fas fa-window-restore';
            setTimeout(() => obj.element.style.transition = '', 300);
        }
    }
    getTaskbarPosition() {
        const tb = document.getElementById('taskbar');
        if (!tb) return 'bottom';
        const pc = Array.from(tb.classList).find(c => c.startsWith('position-'));
        return pc ? pc.replace('position-','') : 'bottom';
    }
    getAvailableArea() {
        const tb = document.querySelector('.taskbar'), tr = tb?.getBoundingClientRect(), tp = this.getTaskbarPosition();
        let top = 0, bottom = window.innerHeight, left = 0, right = window.innerWidth;
        if (tr) {
            if (tp==='top') top = tr.height;
            else if (tp==='bottom') bottom -= tr.height;
            else if (tp==='left') left = tr.width;
            else if (tp==='right') right -= tr.width;
        }
        return {top, bottom, left, right};
    }
    adjustMaximizedWindowsForTaskbar() {
        this.windows.forEach(obj => {
            if (!obj.isMaximized) return;
            const {top,bottom,left,right} = this.getAvailableArea();
            obj.element.style.transition = 'all 0.3s cubic-bezier(0.4,0,0.2,1)';
            obj.element.style.left = left+'px'; obj.element.style.top = top+'px';
            obj.element.style.width = (right-left)+'px'; obj.element.style.height = (bottom-top)+'px';
            setTimeout(() => obj.element.style.transition = '', 300);
        });
    }
    closeWindow(id) {
        const obj = this.windows.get(id);
        if (!obj) return;
        obj.element.remove();
        this.removeFromTaskbar(obj);
        if (window.appLauncher?.onWindowClosed) window.appLauncher.onWindowClosed(id);
        this.windows.delete(id);
        if (this.activeWindow === id) {
            const rem = Array.from(this.windows.values());
            this.activeWindow = rem.length ? (this.focusWindow(rem[rem.length-1].id), rem[rem.length-1].id) : null;
        }
    }
    addToTaskbar(obj) {
        const container = document.getElementById('taskbarApps');
        if (!container) return;
        let icon = container.querySelector(`[data-app-id="${obj.config.appId}"]`);
        if (!icon) {
            icon = document.createElement('img');
            icon.src = obj.config.icon; icon.alt = obj.config.title; icon.className = 'taskbar-app';
            icon.title = obj.config.title; icon.dataset.appId = obj.config.appId; icon.dataset.windowId = obj.id;
            icon.addEventListener('click', () => this.handleTaskbarClick(obj.id));
            container.appendChild(icon);
        } else {
            icon.dataset.windowId = obj.id;
            const ni = icon.cloneNode(true);
            icon.parentNode?.replaceChild(ni, icon); icon = ni;
            icon.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.handleTaskbarClick(obj.id); });
        }
        this.taskbarApps.set(obj.id, icon);
        this.updateTaskbarState(obj);
    }
    updateTaskbarState(obj) {
        const icon = this.taskbarApps.get(obj.id);
        if (!icon) return;
        icon.classList.remove('minimized','active');
        if (obj.isMinimized) icon.classList.add('minimized');
        else if (this.activeWindow === obj.id) icon.classList.add('active');
        icon.title = obj.isMinimized ? obj.config.title+' (Minimized)' : obj.config.title;
    }
    removeFromTaskbar(obj) {
        const icon = this.taskbarApps.get(obj.id);
        if (!icon) return;
        if (icon.dataset.pinned !== 'true') { icon.remove(); }
        else {
            icon.classList.remove('active','minimized'); icon.removeAttribute('data-window-id'); icon.title = icon.alt;
            const ni = icon.cloneNode(true);
            icon.parentNode?.replaceChild(ni, icon);
            ni.addEventListener('click', () => {
                const aid = ni.dataset.appId;
                if (window.universalLauncher) window.universalLauncher.launch(window.universalLauncher.createLaunchItem({id:aid,appId:aid}));
                else window.appLauncher.launchApp(aid);
            });
        }
        this.taskbarApps.delete(obj.id);
    }
    handleTaskbarClick(id) {
        const obj = this.windows.get(id);
        if (!obj) return;
        if (obj.isMinimized) this.restoreWindow(id);
        else if (this.activeWindow === id) this.minimizeWindow(id);
        else this.focusWindow(id);
    }
    setupGlobalEvents() {
        document.addEventListener('click', () => this.windows.forEach(o => this.updateTaskbarState(o)));
    }
    closeStartMenuIfOpen() {
        const sp = document.getElementById('settingsPanel'), sb = document.getElementById('startButton');
        if (sp?.classList.contains('active')) { sp.classList.remove('active'); sb?.classList.remove('active'); }
    }
    setWindowContent(id, content) {
        const el = this.windows.get(id)?.element.querySelector('.window-content');
        if (el) el.innerHTML = content;
    }
    setWindowFooter(id, text) {
        const el = this.windows.get(id)?.element.querySelector('.window-footer-info');
        if (el) el.textContent = text;
    }
    updateFooter(id, text) { this.setWindowFooter(id, text); }
    getWindow(id) { return this.windows.get(id); }
    showSnapPreview(mx, my) {
        const sz = this.getSnapZone(mx, my);
        if (!sz) { this.hideSnapPreview(); return; }
        if (!this.snapPreview) { this.snapPreview = document.createElement('div'); this.snapPreview.className = 'snap-preview'; document.body.appendChild(this.snapPreview); }
        this.snapPreview.dataset.snapType = sz.type;
        this.snapPreview.style.cssText = `position:fixed;left:${sz.x}px;top:${sz.y}px;width:${sz.width}px;height:${sz.height}px;background:rgba(0,120,212,0.2);border:2px solid rgba(0,120,212,0.6);border-radius:8px;pointer-events:none;z-index:8000;opacity:1;transition:all 0.15s ease-in-out;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);`;
        this.snapPreview.classList.add('active');
    }
    hideSnapPreview() {
        if (!this.snapPreview) return;
        this.snapPreview.classList.remove('active');
        setTimeout(() => { if (this.snapPreview) { this.snapPreview.remove(); this.snapPreview = null; } }, 150);
    }
    getSnapZone(mx, my) {
        const th = 10, {top:at,bottom:ab,left:al,right:ar} = this.getAvailableArea();
        if (my <= at+th) return {type:'fullscreen',x:al,y:at,width:ar-al,height:ab-at};
        if (mx <= al+th) return {type:'left',x:al,y:at,width:(ar-al)/2,height:ab-at};
        if (mx >= ar-th) return {type:'right',x:al+(ar-al)/2,y:at,width:(ar-al)/2,height:ab-at};
        return null;
    }
    applySnap(id, type) {
        const obj = this.windows.get(id);
        if (!obj) return;
        if (!obj.isSnapped && !obj.isMaximized) this.saveWindowState(obj);
        const {top:at,bottom:ab,left:al,right:ar} = this.getAvailableArea();
        let sc;
        if (type==='fullscreen') sc = {left:al,top:at,width:ar-al,height:ab-at};
        else if (type==='left') sc = {left:al,top:at,width:(ar-al)/2,height:ab-at};
        else sc = {left:al+(ar-al)/2,top:at,width:(ar-al)/2,height:ab-at};
        obj.element.style.transition = 'all 0.3s cubic-bezier(0.4,0,0.2,1)';
        obj.element.style.left = sc.left+'px'; obj.element.style.top = sc.top+'px';
        obj.element.style.width = sc.width+'px'; obj.element.style.height = sc.height+'px';
        obj.isSnapped = true; obj.snapType = type;
        obj.element.classList.add('snapped'); obj.element.setAttribute('data-snap-type', type);
        this.updateMaximizeButtonIcon(obj, type);
        setTimeout(() => obj.element.style.transition = '', 300);
    }
    saveWindowState(obj) {
        if (obj.isSnapped || obj.isMaximized) return;
        const r = obj.element.getBoundingClientRect();
        obj.savedState = {left:r.left,top:r.top,width:r.width,height:r.height};
    }
    restoreWindowState(obj) {
        if (!obj.savedState) return;
        if (obj.isMaximized || obj.isSnapped) {
            const {width,height} = obj.savedState;
            const cx = (window.innerWidth-width)/2, cy = (window.innerHeight-height)/2;
            obj.element.style.transition = 'all 0.4s cubic-bezier(0.4,0,0.2,1)';
            obj.element.style.left = cx+'px'; obj.element.style.top = cy+'px';
            obj.element.style.width = width+'px'; obj.element.style.height = height+'px';
            setTimeout(() => obj.element.style.transition = '', 400);
        } else {
            const {left,top,width,height} = obj.savedState;
            obj.element.style.left = left+'px'; obj.element.style.top = top+'px';
            obj.element.style.width = width+'px'; obj.element.style.height = height+'px';
        }
    }
    createSnapZones() {
        this.snapZones = document.createElement('div');
        this.snapZones.className = 'snap-zones';
        this.snapZones.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:8000;display:none;';
        document.body.appendChild(this.snapZones);
    }
    updateMaximizeButtonIcon(obj, type) {
        const mb = obj.element.querySelector('.maximize-btn i');
        if (!mb) return;
        if (type==='fullscreen') mb.className = 'fas fa-window-restore';
        else if (type==='left') mb.className = 'fas fa-chevron-right';
        else if (type==='right') mb.className = 'fas fa-chevron-left';
        else mb.className = 'fas fa-window-maximize';
    }
}
window.windowManager = new WindowManager();
