// ======================================
// SETTINGS APP - MODULAR JAVASCRIPT
// ======================================

class SettingsApp {
    constructor() {
        this.isOpen = false;
        this.appElement = null;
    }

    async init() {
        try {
            // For now, just create a simple settings window
            this.appElement = document.createElement('div');
            this.appElement.className = 'settings-app';
            this.appElement.innerHTML = `
                <div style="
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 400px;
                    height: 300px;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(20px);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                    z-index: 1001;
                    display: flex;
                    flex-direction: column;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                ">
                    <div style="
                        padding: 16px;
                        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <h3 style="margin: 0; color: rgba(0, 0, 0, 0.8);">Settings</h3>
                        <button onclick="window.appLauncher.getLoadedApp('app2').close()" style="
                            width: 28px;
                            height: 28px;
                            border: none;
                            background: rgba(220, 53, 69, 0.2);
                            color: #dc3545;
                            border-radius: 6px;
                            cursor: pointer;
                        ">×</button>
                    </div>
                    <div style="
                        flex: 1;
                        padding: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: rgba(0, 0, 0, 0.6);
                    ">
                        <div style="text-align: center;">
                            <i class="fas fa-cog" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                            <div>Settings Panel</div>
                            <div style="font-size: 0.9rem; margin-top: 8px;">Configure your system preferences</div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(this.appElement);
            
            console.log('✅ Settings app initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Settings app:', error);
            return false;
        }
    }

    open() {
        this.isOpen = true;
        const settingsWindow = this.appElement.querySelector('div');
        settingsWindow.style.opacity = '1';
    }

    close() {
        this.isOpen = false;
        const settingsWindow = this.appElement.querySelector('div');
        settingsWindow.style.opacity = '0';
        setTimeout(() => {
            if (this.appElement && this.appElement.parentNode) {
                this.appElement.parentNode.removeChild(this.appElement);
            }
        }, 300);
    }
}

// Export for global use
window.SettingsApp = SettingsApp;
