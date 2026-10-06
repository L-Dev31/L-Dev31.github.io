if (typeof SettingsApp === 'undefined') {
    class SettingsApp {
        constructor() {
            this.windowId = null;
            this.windowManager = null;
            this.appConfig = null;
            this.currentCategory = 'taskbar';
    }

    async init(options = {}) {
        try {
            this.windowManager = options.windowManager;
            this.appConfig = options.appConfig;
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Settings app:', error);
            return false;
        }
    }

    async open() {
        
        if (this.windowId && this.windowManager) {
            const windowObj = this.windowManager.getWindow(this.windowId);
            if (windowObj) {
                if (windowObj.isMinimized) {
                    this.windowManager.restoreWindow(this.windowId);
                } else {
                    this.windowManager.focusWindow(this.windowId);
                }
                return;
            }
        }

        try {
            const content = this.createSettingsContent();
            
            const windowObj = this.windowManager.createWindow({
                id: `settings-${Date.now()}`,
                title: 'Settings',
                width: 800,
                height: 600,
                x: (window.innerWidth - 800) / 2,
                y: (window.innerHeight - 600) / 2,
                icon: this.appConfig?.icon || 'images/app2.png',
                appId: 'app2',
                content: content,
                footerText: 'Settings • Taskbar Configuration'
            });

            this.windowId = windowObj.id;
            
            this.setupEventListeners();
            this.loadCurrentSettings();
            
        } catch (error) {
            console.error('Failed to open Settings app:', error);
        }
    }

    createSettingsContent() {
        return `
            <div class="settings-app">
                <div class="settings-sidebar">
                    <div class="settings-category active" data-category="taskbar">
                        <i class="fas fa-tasks"></i>
                        <span>Taskbar</span>
                    </div>
                    <div class="settings-category" data-category="wallpaper">
                        <i class="fas fa-image"></i>
                        <span>Wallpaper</span>
                    </div>
                    <div class="settings-category" data-category="about">
                        <i class="fas fa-info-circle"></i>
                        <span>About</span>
                    </div>
                </div>
                
                <div class="settings-content">
                    <!-- Taskbar Settings -->
                    <div class="settings-section active" id="taskbar-panel">
                        <h2>Taskbar Settings</h2>
                        
                        <div class="settings-group">
                            <h3>Position</h3>
                            <div class="settings-item">
                                <div class="radio-group">
                                    <label><input type="radio" name="taskbarPosition" value="bottom" checked> Bottom</label>
                                    <label><input type="radio" name="taskbarPosition" value="top"> Top</label>
                                    <label><input type="radio" name="taskbarPosition" value="left"> Left</label>
                                    <label><input type="radio" name="taskbarPosition" value="right"> Right</label>
                                </div>
                            </div>
                        </div>
                        
                        <div class="settings-group">
                            <h3>Alignment</h3>
                            <div class="settings-item">
                                <div class="radio-group">
                                    <label><input type="radio" name="taskbarAlignment" value="start"> Start</label>
                                    <label><input type="radio" name="taskbarAlignment" value="center" checked> Center</label>
                                    <label><input type="radio" name="taskbarAlignment" value="end"> End</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Wallpaper Settings -->
                    <div class="settings-section" id="wallpaper-panel">
                        <h2>Wallpaper Settings</h2>
                        
                        <div class="settings-group">
                            <h3>Current Background</h3>
                            <div class="settings-item">
                                <div class="wallpaper-preview">
                                    <img id="currentWallpaper" src="images/BG/1.jpg" alt="Current wallpaper">
                                </div>
                            </div>
                        </div>
                        
                        <div class="settings-group">
                            <h3>Change Background</h3>
                            <div class="settings-item">
                                <label>Upload custom wallpaper:</label>
                                <div class="file-input-container">
                                    <input type="file" id="wallpaperInput" accept="image/*" class="hidden-file-input">
                                    <button type="button" class="btn-file-upload" onclick="document.getElementById('wallpaperInput').click()">
                                        <i class="fas fa-upload"></i>
                                        Choose Wallpaper File
                                    </button>
                                    <span class="file-name" id="wallpaperFileName">No file selected</span>
                                </div>
                                <small>Supported formats: JPG, PNG, GIF, WebP</small>
                            </div>
                            
                            <div class="settings-item">
                                <button id="resetWallpaper" class="btn-secondary">
                                    <i class="fas fa-undo"></i>
                                    Reset to Default
                                </button>
                                <small>Restore the original wallpaper.jpg</small>
                            </div>
                        </div>
                    </div>
                    
                    <!-- About Panel -->
                    <div class="settings-section" id="about-panel">
                        <h2>System Information</h2>
                        
                        <div class="settings-group">
                            <h3>Operating System</h3>
                            <div class="system-info-card">
                                <div class="os-info">
                                    <div class="os-header">
                                        <img src="images/icon.png" alt="DIP15 Icon" class="os-icon-img">
                                        <div class="os-details">
                                            <div class="os-name">The Idyll Desktop Environment</div>
                                            <div class="os-version">Death in Paradise Season 15</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-item">
                                    <strong>Screen Resolution:</strong> <span id="screenResolution">-</span>
                                </div>
                                <div class="settings-item">
                                    <strong>Browser Engine:</strong> <span id="browserInfo">-</span>
                                </div>
                                <div class="settings-item">
                                    <strong>Platform:</strong> <span id="platformInfo">-</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="settings-group">
                            <h3>Copyright</h3>
                            <div class="system-info-card">
                                <div class="dev-info">
                                    <div class="spec-item">
                                        <strong>&copy; 2025 Red Planet Pictures, BBC Studios. All rights reserved.</strong>
                                    </div>
                                    <div class="spec-item">
                                        <strong>Fictional OS for:</strong> "The Idyll - Couples Therapy Retreat"
                                    </div>
                                    <div class="spec-item">
                                        <strong>Developer:</strong> Léo TOSKU
                                    </div>
                                    <div class="spec-item">
                                        <strong>Build Date:</strong> July 2025
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;

        element.querySelectorAll('.settings-category').forEach(category => {
            category.addEventListener('click', () => {
                this.switchCategory(category.dataset.category);
            });
        });

        element.querySelectorAll('input[name="taskbarPosition"]').forEach(input => {
            input.addEventListener('change', (e) => {
                this.updateTaskbarPosition(e.target.value);
            });
        });

        element.querySelectorAll('input[name="taskbarAlignment"]').forEach(input => {
            input.addEventListener('change', (e) => {
                this.updateTaskbarAlignment(e.target.value);
            });
        });

        const wallpaperInput = element.querySelector('#wallpaperInput');
        if (wallpaperInput) {
            wallpaperInput.addEventListener('change', (e) => {
                this.updateWallpaper(e.target.files[0]);
                this.updateFileName('wallpaperFileName', e.target.files[0]);
            });
        }

        const resetWallpaper = element.querySelector('#resetWallpaper');
        if (resetWallpaper) {
            resetWallpaper.addEventListener('click', () => {
                this.resetWallpaper();
                const wallpaperInput = element.querySelector('#wallpaperInput');
                if (wallpaperInput) {
                    wallpaperInput.value = '';
                    this.updateFileName('wallpaperFileName', null);
                }
            });
        }
    }

    switchCategory(categoryName) {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;
        
        element.querySelectorAll('.settings-category').forEach(item => {
            item.classList.remove('active');
        });
        element.querySelector(`[data-category="${categoryName}"]`).classList.add('active');

        element.querySelectorAll('.settings-section').forEach(panel => {
            panel.classList.remove('active');
        });
        element.querySelector(`#${categoryName}-panel`).classList.add('active');

        this.currentCategory = categoryName;

        this.windowManager.setWindowFooter(this.windowId, `Settings • ${this.getCategoryTitle(categoryName)}`);

        if (categoryName === 'about') {
            this.loadSystemInfo();
        } else if (categoryName === 'wallpaper') {
            this.updateWallpaperPreview();
        }
    }

    getCategoryTitle(category) {
        const titles = {
            taskbar: 'Taskbar Configuration',
            wallpaper: 'Wallpaper Settings',
            about: 'System Information'
        };
        return titles[category] || 'Settings';
    }

    loadCurrentSettings() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;

        try {
            let currentPosition = 'bottom';
            let currentAlignment = 'center';
            
            if (window.taskbarManager && window.taskbarManager.settings) {
                currentPosition = window.taskbarManager.settings.taskbarPosition || 'bottom';
                currentAlignment = window.taskbarManager.settings.taskbarAlignment || 'center';
            } else {
                // Fallback to localStorage
                const settings = JSON.parse(localStorage.getItem('desktop-settings')) || {};
                currentPosition = settings.taskbarPosition || 'bottom';
                currentAlignment = settings.taskbarAlignment || 'center';
            }
            
            const positionInput = element.querySelector(`input[name="taskbarPosition"][value="${currentPosition}"]`);
            const alignmentInput = element.querySelector(`input[name="taskbarAlignment"][value="${currentAlignment}"]`);
            
            if (positionInput) {
                positionInput.checked = true;
            }
            if (alignmentInput) {
                alignmentInput.checked = true;
            }
        } catch (error) {
            console.warn('Could not load taskbar settings:', error);
        }
    }

    getCurrentTaskbarPosition() {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) return 'bottom';
        
        const positionClass = Array.from(taskbar.classList).find(cls => cls.startsWith('position-'));
        return positionClass ? positionClass.replace('position-', '') : 'bottom';
    }

    getCurrentTaskbarAlignment() {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) return 'center';
        
        const alignmentClass = Array.from(taskbar.classList).find(cls => cls.startsWith('align-'));
        return alignmentClass ? alignmentClass.replace('align-', '') : 'center';
    }

    updateTaskbarPosition(position) {
        if (window.taskbarManager) {
            window.taskbarManager.updateTaskbarPosition(position);
        } else {
            console.warn('TaskbarManager not available');
        }
    }

    updateTaskbarAlignment(alignment) {
        if (window.taskbarManager) {
            window.taskbarManager.updateTaskbarAlignment(alignment);
        } else {
            console.warn('TaskbarManager not available');
        }
    }

    updateWallpaper(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            
            try {
                const desktopBackground = document.querySelector('.desktop-background');
                const desktopBackgroundById = document.getElementById('desktopBackground');
                
                if (desktopBackground) {
                    desktopBackground.style.backgroundImage = `url(${imageUrl})`;
                }
                
                if (desktopBackgroundById) {
                    desktopBackgroundById.style.backgroundImage = `url(${imageUrl})`;
                }
                
                // Fallback: also try to update the desktop element itself
                const desktop = document.querySelector('.desktop');
                if (desktop && !desktopBackground && !desktopBackgroundById) {
                    desktop.style.backgroundImage = `url(${imageUrl})`;
                }
                
                const window = this.windowManager.getWindow(this.windowId);
                if (window) {
                    const preview = window.element.querySelector('#currentWallpaper');
                    if (preview) {
                        preview.src = imageUrl;
                    }
                }

                localStorage.setItem('desktop-wallpaper', imageUrl);
                
                
                this.showWallpaperFeedback('Wallpaper updated successfully!', 'success');
            } catch (error) {
                console.error('Error updating wallpaper:', error);
                this.showWallpaperFeedback('Error updating wallpaper', 'error');
            }
        };
        
        reader.onerror = () => {
            console.error('Error reading wallpaper file');
            this.showWallpaperFeedback('Error reading file', 'error');
        };
        
        reader.readAsDataURL(file);
    }

    resetWallpaper() {
        try {
            const desktopBackground = document.querySelector('.desktop-background');
            const desktopBackgroundById = document.getElementById('desktopBackground');
            
            if (desktopBackground) {
                desktopBackground.style.backgroundImage = `url(images/wallpaper.jpg)`;
            }
            
            if (desktopBackgroundById) {
                desktopBackgroundById.style.backgroundImage = `url(images/wallpaper.jpg)`;
            }
            
            // Fallback: reset desktop style if not found
            const desktop = document.querySelector('.desktop');
            if (desktop && !desktopBackground && !desktopBackgroundById) {
                desktop.style.backgroundImage = `url(images/wallpaper.jpg)`;
            }
            
            const window = this.windowManager.getWindow(this.windowId);
            if (window) {
                const preview = window.element.querySelector('#currentWallpaper');
                if (preview) {
                    preview.src = 'images/wallpaper.jpg';
                }
            }

            localStorage.removeItem('desktop-wallpaper');
            
            
            this.showWallpaperFeedback('Wallpaper reset to default', 'success');
        } catch (error) {
            console.error('Error resetting wallpaper:', error);
            this.showWallpaperFeedback('Error resetting wallpaper', 'error');
        }
    }

    updateWallpaperPreview() {
        const preview = document.querySelector('#currentWallpaper');
        if (!preview) return;
        
        try {
            const customWallpaper = localStorage.getItem('desktop-wallpaper');
            if (customWallpaper) {
                preview.src = customWallpaper;
                return;
            }
            
            const desktopBackground = document.querySelector('.desktop-background');
            const desktop = document.querySelector('.desktop');
            
            let currentBg = null;
            
            if (desktopBackground) {
                const backgroundStyle = window.getComputedStyle(desktopBackground);
                if (backgroundStyle.backgroundImage !== 'none') {
                    currentBg = backgroundStyle.backgroundImage;
                }
            } else if (desktop) {
                const desktopStyle = window.getComputedStyle(desktop);
                if (desktopStyle.backgroundImage !== 'none') {
                    currentBg = desktopStyle.backgroundImage;
                }
            }
            
            if (currentBg) {
                const urlMatch = currentBg.match(/url\(["']?([^"']*)["']?\)/);
                if (urlMatch && urlMatch[1]) {
                    preview.src = urlMatch[1];
                    return;
                }
            }
            
            // Final fallback to default wallpaper
            preview.src = 'images/wallpaper.jpg';
        } catch (error) {
            console.warn('Error updating wallpaper preview:', error);
            preview.src = 'images/wallpaper.jpg';
        }
    }

    showMessage(message, type = 'info') {
        return;
    }

    loadSystemInfo() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;
        
        const screenRes = element.querySelector('#screenResolution');
        if (screenRes) {
            screenRes.textContent = `${screen.width} × ${screen.height}`;
        }

        const browserInfo = element.querySelector('#browserInfo');
        if (browserInfo) {
            const userAgent = navigator.userAgent;
            let browser = 'Unknown';
            
            if (userAgent.includes('Chrome')) browser = 'Chromium-based';
            else if (userAgent.includes('Firefox')) browser = 'Gecko';
            else if (userAgent.includes('Safari')) browser = 'WebKit';
            else if (userAgent.includes('Edge')) browser = 'EdgeHTML/Chromium';
            
            browserInfo.textContent = browser;
        }
        
        const platformInfo = element.querySelector('#platformInfo');
        if (platformInfo) {
            const platform = navigator.platform || navigator.userAgentData?.platform || 'Unknown';
            const arch = navigator.userAgentData?.brands?.[0]?.brand || 'Unknown Architecture';
            platformInfo.textContent = `${platform} (${arch})`;
        }
    }

    close() {
        if (this.windowId && this.windowManager) {
            this.windowManager.closeWindow(this.windowId);
            this.windowId = null;
        }
    }

    updateFileName(elementId, file) {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;
        const fileNameElement = element.querySelector(`#${elementId}`);
        
        if (fileNameElement) {
            if (file) {
                const isValidImage = file.type.startsWith('image/');
                const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
                const fileExtension = file.name.split('.').pop().toLowerCase();
                const isValidExtension = validExtensions.includes(fileExtension);
                
                if (isValidImage && isValidExtension) {
                    fileNameElement.textContent = file.name;
                    fileNameElement.classList.add('has-file');
                    fileNameElement.classList.remove('invalid-file');
                } else {
                    fileNameElement.textContent = `❌ Invalid file: ${file.name}`;
                    fileNameElement.classList.remove('has-file');
                    fileNameElement.classList.add('invalid-file');
                    console.warn('Invalid file type:', file.type);
                }
            } else {
                fileNameElement.textContent = 'No file selected';
                fileNameElement.classList.remove('has-file', 'invalid-file');
            }
        }
    }

    showWallpaperFeedback(message, type = 'info') {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;
        
        const existingFeedback = element.querySelector('.wallpaper-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        const feedback = document.createElement('div');
        feedback.className = `wallpaper-feedback ${type}`;
        feedback.textContent = message;
        
        const fileContainer = element.querySelector('.file-input-container');
        if (fileContainer) {
            fileContainer.parentNode.insertBefore(feedback, fileContainer.nextSibling);
            
            // Auto remove after 3 seconds
            setTimeout(() => {
                if (feedback && feedback.parentNode) {
                    feedback.remove();
                }
            }, 3000);
        }
    }
}

window.SettingsApp = SettingsApp;

}
