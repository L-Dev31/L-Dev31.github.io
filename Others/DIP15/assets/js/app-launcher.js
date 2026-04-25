class AppLauncher {
    constructor() { this.loadedApps = new Map(); this.appsData = null; }
    async init() {
        try {
            const r = await fetch('../../data/apps.json');
            this.appsData = await r.json();
            if (window.universalLauncher) window.universalLauncher.init(this);
        } catch(e) { console.error('Failed to load apps configuration:', e); }
    }
    async launchApp(appId, options = {}) {
        try {
            if (this.loadedApps.has(appId)) {
                const app = this.loadedApps.get(appId);
                let wid = app?.windowId;
                if (!wid && window.windowManager?.windows) {
                    for (const [id, w] of window.windowManager.windows.entries()) {
                        if (w?.config?.appId === appId) { wid = id; app.windowId = id; break; }
                    }
                }
                if (wid && window.windowManager) {
                    const w = window.windowManager.getWindow(wid);
                    if (w) {
                        w.isMinimized ? window.windowManager.restoreWindow(wid) : window.windowManager.focusWindow(wid);
                        if (options.path && appId==='app1' && app.navigate) app.navigate(options.path);
                        else if ((options.fileName||options.content) && appId==='app3' && app.open) await app.open(options);
                        return;
                    }
                }
                this.loadedApps.delete(appId);
            }
            const cfg = this.appsData?.apps?.find(a => a.id === appId);
            if (!cfg) return;
            if (cfg.available === false) { this.showUnavailableAppDialog(cfg); return; }
            const mod = await this.loadAppModule(appId);
            if (!mod) return;
            const inst = mod.getInstance ? mod.getInstance() : new mod();
            let opts = { windowManager:window.windowManager, appConfig:cfg, ...options };
            if (appId === 'app1' && this.appsData) opts.appsData = this.appsData;
            const ok = await inst.init(opts);
            if (ok) {
                this.loadedApps.set(appId, inst);
                if (options.path && appId==='app1') await inst.open(options.path);
                else if ((options.fileName||options.content) && appId==='app3') await inst.open(options);
                else if (appId==='app5' && (options.fileName||options.filePath)) await inst.open(options.fileName, options.filePath);
                else await inst.open();
            }
        } catch(e) { console.error('Failed to launch app '+appId+':', e); }
    }
    async loadAppModule(appId) {
        const name = this.getAppClassName(appId);
        if (window[name]) return window[name];
        return new Promise(r => {
            const s = document.createElement('script');
            s.src = `apps/${appId}/app.js`;
            s.onload = () => r(window[name]||null);
            s.onerror = () => r(null);
            document.head.appendChild(s);
        });
    }
    getAppClassName(id) {
        return {'app1':'FilesApp','app2':'SettingsApp','app3':'NotesApp','app4':'WeatherApp','app5':'PrismApp','app6':'CalculatorApp','app8':'ClockApp','app9':'ScheduleApp'}[id] || id.charAt(0).toUpperCase()+id.slice(1)+'App';
    }
    getAppConfig(id) { return this.appsData?.apps?.find(a => a.id===id); }
    isAppLoaded(id) { return this.loadedApps.has(id); }
    getLoadedApp(id) { return this.loadedApps.get(id); }
    onWindowClosed(wid) {
        for (const [id, app] of this.loadedApps.entries()) {
            if ((app.windowId||app.window?.id) === wid) { if (app.constructor?.instance) app.constructor.instance = null; this.loadedApps.delete(id); return; }
        }
    }
    showUnavailableAppDialog(cfg) {
        const ov = document.createElement('div');
        ov.className = 'unavailable-app-overlay';
        ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:10000;backdrop-filter:blur(2px);';
        const d = document.createElement('div');
        d.style.cssText = 'background:white;border-radius:12px;padding:32px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.3);max-width:400px;width:90%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
        d.innerHTML = `<div style="margin-bottom:20px;"><img src="${cfg.icon}" alt="${cfg.name}" style="width:64px;height:64px;border-radius:12px;"></div><h2 style="margin:16px 0 8px;color:#333;font-size:24px;font-weight:600;">${cfg.name}</h2><p style="margin:8px 0 24px;color:#666;font-size:16px;line-height:1.5;">This app isn't available yet.</p><button onclick="this.closest('.unavailable-app-overlay').remove()" style="background:#007AFF;color:white;border:none;border-radius:8px;padding:12px 24px;font-size:16px;font-weight:500;cursor:pointer;">OK</button>`;
        ov.appendChild(d);
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target===ov) ov.remove(); });
        const esc = e => { if (e.key==='Escape') { ov.remove(); document.removeEventListener('keydown',esc); } };
        document.addEventListener('keydown', esc);
    }
}
window.appLauncher = new AppLauncher();
