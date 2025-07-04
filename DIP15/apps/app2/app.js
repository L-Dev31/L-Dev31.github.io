// ======================================
// SETTINGS APP - VIRTUAL DESKTOP CONFIGURATION
// ======================================

// Avoid redeclaration if already defined
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
            
            console.log('✅ Settings app initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Settings app:', error);
            return false;
        }
    }

    async open() {
        if (this.windowId && this.windowManager) {
            // Window already exists, just focus it
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

        // Create the main content
        const content = this.createSettingsContent();
        
        // Create window
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
    }

    createSettingsContent() {
        return `
            <div class="settings-app">
                <div class="settings-sidebar">
                    <div class="settings-category active" data-category="taskbar">
                        <i class="fas fa-tasks"></i>
                        <span>Taskbar</span>
                    </div>
                    <div class="settings-category" data-category="desktop">
                        <i class="fas fa-desktop"></i>
                        <span>Desktop</span>
                    </div>
                    <div class="settings-category" data-category="wallpaper">
                        <i class="fas fa-image"></i>
                        <span>Wallpaper</span>
                    </div>
                    <div class="settings-category" data-category="user">
                        <i class="fas fa-user"></i>
                        <span>User Profile</span>
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
                    
                    <!-- Desktop Settings -->
                    <div class="settings-section" id="desktop-panel">
                        <h2>Desktop Settings</h2>
                        
                        <div class="settings-group">
                            <h3>Desktop Layout</h3>
                            <div class="settings-item">
                                <label>
                                    <input type="checkbox" id="snapToGrid" checked>
                                    Snap icons to grid
                                </label>
                            </div>
                        </div>
                        
                        <div class="settings-group">
                            <h3>Desktop Background</h3>
                            <div class="settings-item">
                                <button id="autoChangeBtn" class="btn-primary">
                                    <i class="fas fa-magic"></i>
                                    Auto-change Background
                                </button>
                                <small>Cycle through available backgrounds every 30 seconds</small>
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
                                <input type="file" id="wallpaperInput" accept="image/*">
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
                    
                    <!-- User Profile Settings -->
                    <div class="settings-section" id="user-panel">
                        <h2>User Profile</h2>
                        
                        <div class="settings-group">
                            <h3>Account Information</h3>
                            <div class="settings-item">
                                <div class="user-profile-display">
                                    <div class="user-avatar-large">
                                        <img id="userProfileImage" src="images/profile.png" alt="Profile" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;">
                                    </div>
                                    <div class="user-info">
                                        <h4 id="displayUsername">Keira Mayhew</h4>
                                        <p>Administrator</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="settings-group">
                            <h3>Personalization</h3>
                            <div class="settings-item">
                                <label>Display name:</label>
                                <input type="text" id="usernameInput" placeholder="Enter your name" value="Keira Mayhew">
                            </div>
                            <div class="settings-item">
                                <label>Profile picture:</label>
                                <input type="file" id="profilePictureInput" accept="image/*">
                                <small>Upload a new profile picture (JPG, PNG)</small>
                            </div>
                        </div>
                        
                        <div class="settings-group">
                            <h3>Security</h3>
                            <div class="settings-item">
                                <label>New password:</label>
                                <input type="password" id="newPasswordInput" placeholder="Enter new password">
                                <button id="changePasswordBtn" class="btn-primary">Change Password</button>
                                <small>Password is only used for screen lock simulation</small>
                            </div>
                        </div>
                    </div>
                    
                    <!-- About Panel -->
                    <div class="settings-section" id="about-panel">
                        <h2>System Information</h2>
                        
                        <div class="settings-group">
                            <h3>Desktop Environment</h3>
                            <div class="system-info-card">
                                <div class="settings-item">
                                    <strong>Version:</strong> DIP15 Virtual Desktop v1.0
                                </div>
                                <div class="settings-item">
                                    <strong>Screen Resolution:</strong> <span id="screenResolution">-</span>
                                </div>
                                <div class="settings-item">
                                    <strong>Browser:</strong> <span id="browserInfo">-</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="settings-group">
                            <h3>Features</h3>
                            <div class="system-info-card">
                                <ul class="feature-list">
                                    <li>Universal window management system</li>
                                    <li>Advanced window snapping (Windows 11 style)</li>
                                    <li>Dynamic taskbar positioning</li>
                                    <li>Customizable desktop layout</li>
                                    <li>File management integration</li>
                                    <li>Built-in productivity apps</li>
                                </ul>
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

        // Category navigation
        element.querySelectorAll('.settings-category').forEach(category => {
            category.addEventListener('click', () => {
                this.switchCategory(category.dataset.category);
            });
        });

        // Taskbar settings
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

        // Desktop settings
        const snapToGrid = element.querySelector('#snapToGrid');
        if (snapToGrid) {
            snapToGrid.addEventListener('change', (e) => {
                this.updateSnapToGrid(e.target.checked);
            });
        }

        const autoChangeBtn = element.querySelector('#autoChangeBtn');
        if (autoChangeBtn) {
            autoChangeBtn.addEventListener('click', () => {
                if (window.startAutoChange) {
                    window.startAutoChange();
                    this.showMessage('Auto-change background started!');
                }
            });
        }

        const wallpaperInput = element.querySelector('#wallpaperInput');
        if (wallpaperInput) {
            wallpaperInput.addEventListener('change', (e) => {
                this.updateWallpaper(e.target.files[0]);
            });
        }

        const resetWallpaper = element.querySelector('#resetWallpaper');
        if (resetWallpaper) {
            resetWallpaper.addEventListener('click', () => {
                this.resetWallpaper();
            });
        }

        // User profile settings
        const usernameInput = element.querySelector('#usernameInput');
        if (usernameInput) {
            usernameInput.addEventListener('change', (e) => {
                this.updateUsername(e.target.value);
            });
        }

        const profilePictureInput = element.querySelector('#profilePictureInput');
        if (profilePictureInput) {
            profilePictureInput.addEventListener('change', (e) => {
                this.updateProfilePicture(e.target.files[0]);
            });
        }

        const changePasswordBtn = element.querySelector('#changePasswordBtn');
        if (changePasswordBtn) {
            changePasswordBtn.addEventListener('click', () => {
                this.changePassword();
            });
        }
    }

    switchCategory(categoryName) {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;
        
        // Update navigation
        element.querySelectorAll('.settings-category').forEach(item => {
            item.classList.remove('active');
        });
        element.querySelector(`[data-category="${categoryName}"]`).classList.add('active');

        // Update content
        element.querySelectorAll('.settings-section').forEach(panel => {
            panel.classList.remove('active');
        });
        element.querySelector(`#${categoryName}-panel`).classList.add('active');

        this.currentCategory = categoryName;

        // Update footer
        this.windowManager.setWindowFooter(this.windowId, `Settings • ${this.getCategoryTitle(categoryName)}`);

        // Load category-specific data
        if (categoryName === 'about') {
            this.loadSystemInfo();
        } else if (categoryName === 'wallpaper') {
            this.updateWallpaperPreview();
        } else if (categoryName === 'user') {
            this.loadUserProfile();
        }
    }

    getCategoryTitle(category) {
        const titles = {
            taskbar: 'Taskbar Configuration',
            desktop: 'Desktop Layout',
            wallpaper: 'Wallpaper Settings',
            user: 'User Profile',
            about: 'System Information'
        };
        return titles[category] || 'Settings';
    }

    loadCurrentSettings() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;

        // Load current taskbar settings from localStorage
        try {
            const settings = JSON.parse(localStorage.getItem('desktop-settings')) || {};
            
            const currentPosition = settings.taskbarPosition || 'bottom';
            const currentAlignment = settings.taskbarAlignment || 'center';
            
            const positionInput = element.querySelector(`input[name="taskbarPosition"][value="${currentPosition}"]`);
            const alignmentInput = element.querySelector(`input[name="taskbarAlignment"][value="${currentAlignment}"]`);
            
            if (positionInput) positionInput.checked = true;
            if (alignmentInput) alignmentInput.checked = true;
        } catch (error) {
            console.warn('Could not load taskbar settings:', error);
        }

        // Load user profile data
        this.loadUserProfile();
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
        // Apply taskbar position directly
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            // Reset classes and apply new position
            taskbar.className = 'taskbar';
            taskbar.classList.add(`position-${position}`);
            
            // Save to localStorage
            let settings = JSON.parse(localStorage.getItem('desktop-settings')) || {};
            settings.taskbarPosition = position;
            localStorage.setItem('desktop-settings', JSON.stringify(settings));
            
            // Adjust all maximized windows to new taskbar position
            if (this.windowManager) {
                this.windowManager.adjustMaximizedWindowsForTaskbar();
            }
            
            // Trigger recalculation of desktop layout
            setTimeout(() => {
                if (window.loadDesktopItems) {
                    window.loadDesktopItems();
                }
            }, 100);
        }
    }

    updateTaskbarAlignment(alignment) {
        // Apply taskbar alignment directly
        const taskbar = document.getElementById('taskbar');
        if (taskbar) {
            // Remove existing alignment classes
            taskbar.classList.remove('align-start', 'align-center', 'align-end');
            taskbar.classList.add(`align-${alignment}`);
            
            // Save to localStorage
            let settings = JSON.parse(localStorage.getItem('desktop-settings')) || {};
            settings.taskbarAlignment = alignment;
            localStorage.setItem('desktop-settings', JSON.stringify(settings));
        }
    }

    updateSnapToGrid(enabled) {
        if (window.settingsManager) {
            window.settingsManager.settings.snapToGrid = enabled;
            window.settingsManager.saveSettings();
            window.settingsManager.applySettings();
        }
    }

    updateWallpaper(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            
            // Update desktop background
            document.body.style.backgroundImage = `url(${imageUrl})`;
            
            // Update wallpaper preview
            const preview = document.querySelector('#currentWallpaper');
            if (preview) {
                preview.src = imageUrl;
            }

            // Save to localStorage
            localStorage.setItem('customWallpaper', imageUrl);
            
            this.showMessage('Wallpaper updated successfully!');
        };
        reader.readAsDataURL(file);
    }

    resetWallpaper() {
        // Reset to default wallpaper
        document.body.style.backgroundImage = `url(images/wallpaper.jpg)`;
        
        // Update preview
        const preview = document.querySelector('#currentWallpaper');
        if (preview) {
            preview.src = 'images/wallpaper.jpg';
        }

        // Remove from localStorage
        localStorage.removeItem('customWallpaper');
        
        this.showMessage('Wallpaper reset to default!');
    }

    updateWallpaperPreview() {
        const preview = document.querySelector('#currentWallpaper');
        if (preview) {
            const currentBg = document.body.style.backgroundImage;
            if (currentBg) {
                // Extract URL from CSS background-image property
                const url = currentBg.match(/url\(["']?([^"']*)["']?\)/);
                if (url && url[1]) {
                    preview.src = url[1];
                }
            }
        }
    }

    showMessage(message, type = 'info') {
        // Notifications désactivées
        return;
    }

    loadUserProfile() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;
        
        // Load user data from localStorage or defaults
        let userData = this.getUserData();
        
        // Update display elements
        const displayUsername = element.querySelector('#displayUsername');
        const usernameInput = element.querySelector('#usernameInput');
        const profileImage = element.querySelector('#userProfileImage');
        
        if (displayUsername) displayUsername.textContent = userData.name;
        if (usernameInput) usernameInput.value = userData.name;
        if (profileImage) profileImage.src = userData.profilePicture;
    }

    getUserData() {
        try {
            let userData = JSON.parse(localStorage.getItem('user-data'));
            if (!userData) {
                // Default user data from Keira Mayhew
                userData = {
                    name: 'Keira Mayhew',
                    profilePicture: 'images/profile.png',
                    password: '312007' // Default password
                };
                localStorage.setItem('user-data', JSON.stringify(userData));
            }
            return userData;
        } catch (error) {
            console.warn('Could not load user data:', error);
            return {
                name: 'Keira Mayhew',
                profilePicture: 'images/profile.png',
                password: '312007'
            };
        }
    }

    saveUserData(userData) {
        try {
            localStorage.setItem('user-data', JSON.stringify(userData));
            
            // Update global userProfile if it exists
            if (window.userProfile) {
                window.userProfile.user.name = userData.name;
                window.userProfile.user.profilePicture = userData.profilePicture;
                
                // Update UI interface
                if (window.updateUserInterface) {
                    window.updateUserInterface();
                }
            }
        } catch (error) {
            console.error('Could not save user data:', error);
        }
    }

    updateUsername(username) {
        if (!username || username.trim() === '') return;
        
        let userData = this.getUserData();
        userData.name = username.trim();
        this.saveUserData(userData);
        
        // Update display
        const window = this.windowManager.getWindow(this.windowId);
        if (window) {
            const displayUsername = window.element.querySelector('#displayUsername');
            if (displayUsername) displayUsername.textContent = username.trim();
        }
        
        console.log('✅ Username updated to:', username.trim());
    }

    updateProfilePicture(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            
            let userData = this.getUserData();
            userData.profilePicture = imageUrl;
            this.saveUserData(userData);
            
            // Update profile image display
            const window = this.windowManager.getWindow(this.windowId);
            if (window) {
                const profileImage = window.element.querySelector('#userProfileImage');
                if (profileImage) profileImage.src = imageUrl;
            }
            
            console.log('✅ Profile picture updated');
        };
        reader.readAsDataURL(file);
    }

    changePassword() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;
        const newPasswordInput = element.querySelector('#newPasswordInput');
        
        if (newPasswordInput && newPasswordInput.value.trim()) {
            let userData = this.getUserData();
            userData.password = newPasswordInput.value.trim();
            this.saveUserData(userData);
            
            // Also update global CONFIG if it exists
            if (window.CONFIG) {
                window.CONFIG.password = newPasswordInput.value.trim();
            }
            
            newPasswordInput.value = '';
            console.log('✅ Password changed successfully');
        }
    }

    loadSystemInfo() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;
        
        // Update screen resolution
        const screenRes = element.querySelector('#screenResolution');
        if (screenRes) {
            screenRes.textContent = `${screen.width} × ${screen.height}`;
        }

        // Update browser info
        const browserInfo = element.querySelector('#browserInfo');
        if (browserInfo) {
            const userAgent = navigator.userAgent;
            let browser = 'Unknown';
            
            if (userAgent.includes('Chrome')) browser = 'Chrome';
            else if (userAgent.includes('Firefox')) browser = 'Firefox';
            else if (userAgent.includes('Safari')) browser = 'Safari';
            else if (userAgent.includes('Edge')) browser = 'Edge';
            
            browserInfo.textContent = browser;
        }
    }

    close() {
        if (this.windowId && this.windowManager) {
            this.windowManager.closeWindow(this.windowId);
            this.windowId = null;
        }
    }
}

// Export for global use
window.SettingsApp = SettingsApp;

// Close the conditional block
}
