// ======================================
// MODULAR APP LAUNCHER SYSTEM
// ======================================

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
            console.log('✅ App launcher initialized');
        } catch (error) {
            console.error('❌ Failed to load apps configuration:', error);
        }
    }

    async launchApp(appId, options = {}) {
        try {
            // Check if app is already loaded and has a window
            if (this.loadedApps.has(appId)) {
                const app = this.loadedApps.get(appId);
                
                // If the app has a window, focus it or restore if minimized
                if (app.windowId && window.windowManager) {
                    const windowObj = window.windowManager.getWindow(app.windowId);
                    if (windowObj) {
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
                    }
                }
                
                // If no window but app exists, open it
                if (app.open) {
                    if (options.path && appId === 'app1') {
                        app.open(options.path);
                    } else {
                        app.open();
                    }
                }
                return;
            }

            // Find app configuration
            const appConfig = this.appsData?.apps?.find(app => app.id === appId);
            if (!appConfig) {
                console.error(`App ${appId} not found in configuration`);
                return;
            }

            // Load app dynamically
            const appModule = await this.loadAppModule(appId);
            if (appModule) {
                // Initialize the app with window manager integration
                const appInstance = new appModule();
                const success = await appInstance.init({ 
                    windowManager: window.windowManager, 
                    appConfig: appConfig,
                    ...options 
                });
                
                if (success) {
                    this.loadedApps.set(appId, appInstance);
                    // Pass options to the open method (especially useful for Files app)
                    if (options.path && appId === 'app1') {
                        appInstance.open(options.path);
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
            'app10': 'AvokadooApp'
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
}

// Global app launcher instance
window.appLauncher = new AppLauncher();
