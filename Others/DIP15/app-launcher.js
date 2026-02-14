class AppLauncher {
    constructor() {
        this.loadedApps = new Map();
        this.appsData = null;
    }

    async init() {
        try {
            const response = await fetch('apps.json');
            this.appsData = await response.json();
            
            if (window.universalLauncher) {
                window.universalLauncher.init(this);
            }
            
            console.log('✅ App launcher initialized');
        } catch (error) {
            console.error('❌ Failed to load apps configuration:', error);
        }
    }

    async launchApp(appId, options = {}) {
        try {
            if (this.loadedApps.has(appId)) {
                const app = this.loadedApps.get(appId);
                let resolvedWindowId = app?.windowId;

                if (!resolvedWindowId && window.windowManager?.windows) {
                    for (const [id, windowObj] of window.windowManager.windows.entries()) {
                        if (windowObj?.config?.appId === appId) {
                            resolvedWindowId = id;
                            app.windowId = id;
                            break;
                        }
                    }
                }
                
                if (resolvedWindowId && window.windowManager) {
                    const windowObj = window.windowManager.getWindow(resolvedWindowId);
                    if (windowObj) {
                        console.log(`🔍 App ${appId} already open, focusing existing window`);
                        if (windowObj.isMinimized) {
                            window.windowManager.restoreWindow(resolvedWindowId);
                        } else {
                            window.windowManager.focusWindow(resolvedWindowId);
                        }
                        
                        if (options.path && appId === 'app1' && app.navigate) {
                            app.navigate(options.path);
                        } else if ((options.fileName || options.content) && appId === 'app3' && app.open) {
                            await app.open(options);
                        }
                        return;
                    } else {
                        console.log(`🧹 Cleaning up stale app ${appId} (window no longer exists)`);
                        this.loadedApps.delete(appId);
                    }
                } else {
                    console.log(`🧹 Cleaning up stale app ${appId} (no valid window reference)`);
                    this.loadedApps.delete(appId);
                }
            }

            const appConfig = this.appsData?.apps?.find(app => app.id === appId);
            if (!appConfig) {
                console.error(`App ${appId} not found in configuration`);
                return;
            }

            if (appConfig.available === false) {
                this.showUnavailableAppDialog(appConfig);
                return;
            }

            const appModule = await this.loadAppModule(appId);
            if (appModule) {
                let appInstance;
                if (appModule.getInstance && typeof appModule.getInstance === 'function') {
                    appInstance = appModule.getInstance();
                } else {
                    appInstance = new appModule();
                }
                
                let initOptions = { 
                    windowManager: window.windowManager, 
                    appConfig: appConfig,
                    ...options 
                };
                
                if (appId === 'app1' && this.appsData) {
                    initOptions.appsData = this.appsData;
                }
                
                const success = await appInstance.init(initOptions);
                
                if (success) {
                    this.loadedApps.set(appId, appInstance);
                    if (options.path && appId === 'app1') {
                        await appInstance.open(options.path);
                    } else if ((options.fileName || options.content) && appId === 'app3') {
                        await appInstance.open(options);
                    } else if (appId === 'app5' && (options.fileName || options.filePath)) {
                        await appInstance.open(options.fileName, options.filePath);
                    } else {
                        await appInstance.open();
                    }
                    console.log(`✅ App ${appConfig.name} launched successfully`);
                } else {
                    console.error(`❌ Failed to initialize app ${appConfig.name}`);
                }
            }
        } catch (error) {
            console.error(`❌ Failed to launch app ${appId}:`, error);
        }
    }

    async loadAppModule(appId) {
        const name = this.getAppClassName(appId);
        if (window[name]) return window[name];
        return await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = `apps/${appId}/app.js`;
            s.onload = () => resolve(window[name] || null);
            s.onerror = () => resolve(null);
            document.head.appendChild(s);
        });
    }

    getAppClassName(appId) {
        const appNames = {
            'app1': 'FilesApp',
            'app2': 'SettingsApp',
            'app3': 'NotesApp',
            'app4': 'WeatherApp',
            'app5': 'PrismApp',
            'app6': 'CalculatorApp',
            'app8': 'ClockApp',
            'app9': 'ScheduleApp'
        };
        
        return appNames[appId] || `${appId.charAt(0).toUpperCase() + appId.slice(1)}App`;
    }

    getAppConfig(appId) {
        return this.appsData?.apps?.find(app => app.id === appId);
    }

    isAppLoaded(appId) {
        return this.loadedApps.has(appId);
    }

    getLoadedApp(appId) {
        return this.loadedApps.get(appId);
    }

    onWindowClosed(windowId) {
        for (const [id, app] of this.loadedApps.entries()) {
            const appWinId = app.windowId || app.window?.id;
            if (appWinId === windowId) {
                if (app.constructor?.instance) app.constructor.instance = null;
                this.loadedApps.delete(id);
                console.log(`🗑️ Cleaned up app ${id}`);
                return;
            }
        }
    }

    showUnavailableAppDialog(appConfig) {
        const overlay = document.createElement('div');
        overlay.className = 'unavailable-app-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(2px);
        `;

        const dialog = document.createElement('div');
        dialog.className = 'unavailable-app-dialog';
        dialog.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 90%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;

        dialog.innerHTML = `
            <div style="margin-bottom: 20px;">
                <img src="${appConfig.icon}" alt="${appConfig.name}" style="width: 64px; height: 64px; border-radius: 12px;">
            </div>
            <h2 style="margin: 16px 0 8px 0; color: #333; font-size: 24px; font-weight: 600;">${appConfig.name}</h2>
            <p style="margin: 8px 0 24px 0; color: #666; font-size: 16px; line-height: 1.5;">
                This app isn't available yet. It's coming soon!
            </p>
            <button onclick="this.closest('.unavailable-app-overlay').remove()" 
                    style="
                        background: #007AFF;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        padding: 12px 24px;
                        font-size: 16px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: background 0.2s;
                    "
                    onmouseover="this.style.background='#0056CC'"
                    onmouseout="this.style.background='#007AFF'">
                OK
            </button>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }
}

window.appLauncher = new AppLauncher();
