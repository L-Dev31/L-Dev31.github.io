class AppLauncher {
    constructor() {
        this.loadedApps = new Map();
        this.appsData = null;
    }

    async init() {
        try {
            // Load apps configuration
            const response = await fetch('apps.json');
            this.appsData = await response.json();
            
            // Initialize Universal Launcher
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
            // STRICT: Check if app is already loaded - prevent any double opening
            if (this.loadedApps.has(appId)) {
                const app = this.loadedApps.get(appId);
                
                // If the app has a window, focus it or restore if minimized
                if (app.windowId && window.windowManager) {
                    const windowObj = window.windowManager.getWindow(app.windowId);
                    if (windowObj) {
                        console.log(`🔍 App ${appId} already open, focusing existing window`);
                        if (windowObj.isMinimized) {
                            window.windowManager.restoreWindow(app.windowId);
                        } else {
                            window.windowManager.focusWindow(app.windowId);
                        }
                        
                        // Pass options to the app if needed
                        if (options.path && appId === 'app1' && app.navigate) {
                            app.navigate(options.path);
                        }
                        return;
                    } else {
                        // Window doesn't exist anymore, cleanup the app
                        console.log(`🧹 Cleaning up stale app ${appId} (window no longer exists)`);
                        this.loadedApps.delete(appId);
                    }
                } else {
                    // App exists but no window, prevent re-opening
                    console.log(`⛔ App ${appId} already loaded, preventing duplicate launch`);
                    return;
                }
            }

            // Find app configuration
            const appConfig = this.appsData?.apps?.find(app => app.id === appId);
            if (!appConfig) {
                console.error(`App ${appId} not found in configuration`);
                return;
            }

            // Check if app is available
            if (appConfig.available === false) {
                this.showUnavailableAppDialog(appConfig);
                return;
            }

            // Load app dynamically
            const appModule = await this.loadAppModule(appId);
            if (appModule) {
                // Initialize the app with window manager integration
                // Check if app uses singleton pattern
                let appInstance;
                if (appModule.getInstance && typeof appModule.getInstance === 'function') {
                    // Use singleton instance for apps that support it
                    appInstance = appModule.getInstance();
                } else {
                    // Create new instance for other apps
                    appInstance = new appModule();
                }
                
                // Special handling for Files app - pass apps data
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
                    // Pass options to the open method
                    if (options.path && appId === 'app1') {
                        appInstance.open(options.path);
                    } else if ((options.fileName || options.content) && appId === 'app3') {
                        // Pass file options to Notes app
                        appInstance.open(options);
                    } else {
                        appInstance.open();
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
        try {
            // Load the app's JavaScript module
            const script = document.createElement('script');
            script.src = `apps/${appId}/app.js`;
            
            return new Promise((resolve, reject) => {
                script.onload = () => {
                    // Get the app class from window
                    const appClassName = this.getAppClassName(appId);
                    const AppClass = window[appClassName];
                    
                    if (AppClass) {
                        resolve(AppClass);
                    } else {
                        reject(new Error(`App class ${appClassName} not found`));
                    }
                };
                
                script.onerror = () => {
                    reject(new Error(`Failed to load app script: apps/${appId}/app.js`));
                };
                
                document.head.appendChild(script);
            });
        } catch (error) {
            console.error(`Failed to load app module ${appId}:`, error);
            return null;
        }
    }

    getAppClassName(appId) {
        // Convert app ID to class name (e.g., app1 -> FilesApp, app2 -> SettingsApp)
        const appNames = {
            'app1': 'FilesApp',
            'app2': 'SettingsApp',
            'app3': 'NotesApp',
            'app4': 'WeatherApp',
            'app5': 'PrismApp',
            'app6': 'CalculatorApp',
            'app7': 'ScaffoldApp',
            'app8': 'ClockApp',
            'app9': 'ScheduleApp',
            'app10': 'AvokaDoApp'
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

    // Cleanup method called when a window is closed
    onWindowClosed(windowId) {
        // Remove app from loaded apps if its window was closed
        for (const [appId, app] of this.loadedApps.entries()) {
            if (app.windowId === windowId) {
                this.loadedApps.delete(appId);
                console.log(`🗑️ Cleaned up app ${appId} after window close`);
                break;
            }
        }
    }

    showUnavailableAppDialog(appConfig) {
        // Create overlay
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

        // Create dialog
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

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }
}

// Global app launcher instance
window.appLauncher = new AppLauncher();
