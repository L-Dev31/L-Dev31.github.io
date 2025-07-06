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
        console.log('🔧 Opening Settings app...');
        
        if (this.windowId && this.windowManager) {
            // Window already exists, just focus it
            const windowObj = this.windowManager.getWindow(this.windowId);
            if (windowObj) {
                console.log('✅ Settings window already exists, focusing...');
                if (windowObj.isMinimized) {
                    this.windowManager.restoreWindow(this.windowId);
                } else {
                    this.windowManager.focusWindow(this.windowId);
                }
                return;
            }
        }

        try {
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
            console.log('✅ Settings window created with ID:', this.windowId);
            
            this.setupEventListeners();
            this.loadCurrentSettings();
            
            console.log('✅ Settings app opened successfully');
        } catch (error) {
            console.error('❌ Failed to open Settings app:', error);
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
                                <button id="changePasswordBtn" class="btn-primary">
                                    <i class="fas fa-key"></i>
                                    Change Password
                                </button>
                                <small>Password is only used for screen lock simulation</small>
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
                                            <div class="os-name">DIP15 Desktop Environment</div>
                                            <div class="os-version">Professional Virtual Desktop v1.0</div>
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
                            <h3>Technical Specifications</h3>
                            <div class="system-info-card">
                                <div class="tech-specs">
                                    <div class="spec-item">
                                        <strong>Architecture:</strong> Modern Web Technologies
                                    </div>
                                    <div class="spec-item">
                                        <strong>Rendering Engine:</strong> Hardware-Accelerated Graphics
                                    </div>
                                    <div class="spec-item">
                                        <strong>Window Management:</strong> Advanced Multi-Window System
                                    </div>
                                    <div class="spec-item">
                                        <strong>Memory Management:</strong> Optimized Resource Allocation
                                    </div>
                                    <div class="spec-item">
                                        <strong>File System:</strong> Virtual File System with Real-time Access
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="settings-group">
                            <h3>Development Information</h3>
                            <div class="system-info-card">
                                <div class="dev-info">
                                    <div class="spec-item">
                                        <strong>Version:</strong> 1.0.0 Professional
                                    </div>
                                    <div class="spec-item">
                                        <strong>Build Date:</strong> July 2025
                                    </div>
                                    <div class="spec-item">
                                        <strong>License:</strong> Professional Desktop Environment
                                    </div>
                                    <div class="spec-item">
                                        <strong>Developer:</strong> L-Dev31 Technologies
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

        // Load current taskbar settings - try from taskbarManager first, then localStorage
        try {
            let currentPosition = 'bottom';
            let currentAlignment = 'center';
            
            // Get current settings from taskbarManager if available
            if (window.taskbarManager && window.taskbarManager.settings) {
                currentPosition = window.taskbarManager.settings.taskbarPosition || 'bottom';
                currentAlignment = window.taskbarManager.settings.taskbarAlignment || 'center';
            } else {
                // Fallback to localStorage
                const settings = JSON.parse(localStorage.getItem('desktop-settings')) || {};
                currentPosition = settings.taskbarPosition || 'bottom';
                currentAlignment = settings.taskbarAlignment || 'center';
            }
            
            // Update radio buttons
            const positionInput = element.querySelector(`input[name="taskbarPosition"][value="${currentPosition}"]`);
            const alignmentInput = element.querySelector(`input[name="taskbarAlignment"][value="${currentAlignment}"]`);
            
            if (positionInput) {
                positionInput.checked = true;
                console.log('✅ Loaded taskbar position:', currentPosition);
            }
            if (alignmentInput) {
                alignmentInput.checked = true;
                console.log('✅ Loaded taskbar alignment:', currentAlignment);
            }
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
        // Use the global taskbarManager
        if (window.taskbarManager) {
            window.taskbarManager.updateTaskbarPosition(position);
            console.log('✅ Taskbar position updated to:', position);
        } else {
            console.warn('⚠️ TaskbarManager not available');
        }
    }

    updateTaskbarAlignment(alignment) {
        // Use the global taskbarManager
        if (window.taskbarManager) {
            window.taskbarManager.updateTaskbarAlignment(alignment);
            console.log('✅ Taskbar alignment updated to:', alignment);
        } else {
            console.warn('⚠️ TaskbarManager not available');
        }
    }

    updateWallpaper(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            
            try {
                // Update desktop background - try background element first, then body
                const backgroundElement = document.querySelector('.background');
                if (backgroundElement) {
                    backgroundElement.style.backgroundImage = `url(${imageUrl})`;
                    console.log('✅ Updated background element');
                } else {
                    document.body.style.backgroundImage = `url(${imageUrl})`;
                    console.log('✅ Updated body background');
                }
                
                // Update wallpaper preview in Settings
                const preview = document.querySelector('#currentWallpaper');
                if (preview) {
                    preview.src = imageUrl;
                }

                // Save to localStorage
                localStorage.setItem('customWallpaper', imageUrl);
                
                console.log('✅ Wallpaper updated and saved successfully');
            } catch (error) {
                console.error('❌ Error updating wallpaper:', error);
            }
        };
        
        reader.onerror = () => {
            console.error('❌ Error reading wallpaper file');
        };
        
        reader.readAsDataURL(file);
    }

    resetWallpaper() {
        try {
            // Reset to default wallpaper - try background element first, then body
            const backgroundElement = document.querySelector('.background');
            if (backgroundElement) {
                backgroundElement.style.backgroundImage = `url(images/wallpaper.jpg)`;
                console.log('✅ Reset background element to default');
            } else {
                document.body.style.backgroundImage = `url(images/wallpaper.jpg)`;
                console.log('✅ Reset body background to default');
            }
            
            // Update preview in Settings
            const preview = document.querySelector('#currentWallpaper');
            if (preview) {
                preview.src = 'images/wallpaper.jpg';
            }

            // Remove custom wallpaper from localStorage
            localStorage.removeItem('customWallpaper');
            
            console.log('✅ Wallpaper reset to default successfully');
        } catch (error) {
            console.error('❌ Error resetting wallpaper:', error);
        }
    }

    updateWallpaperPreview() {
        const preview = document.querySelector('#currentWallpaper');
        if (!preview) return;
        
        try {
            // First check if there's a custom wallpaper in localStorage
            const customWallpaper = localStorage.getItem('customWallpaper');
            if (customWallpaper) {
                preview.src = customWallpaper;
                console.log('✅ Using custom wallpaper from localStorage');
                return;
            }
            
            // Get actual computed background image from the body or background element
            const backgroundElement = document.querySelector('.background');
            const bodyStyle = window.getComputedStyle(document.body);
            const backgroundStyle = backgroundElement ? window.getComputedStyle(backgroundElement) : null;
            
            let currentBg = null;
            
            // Check background element first, then body
            if (backgroundStyle && backgroundStyle.backgroundImage !== 'none') {
                currentBg = backgroundStyle.backgroundImage;
            } else if (bodyStyle.backgroundImage !== 'none') {
                currentBg = bodyStyle.backgroundImage;
            }
            
            if (currentBg) {
                // Extract URL from CSS background-image property
                const urlMatch = currentBg.match(/url\(["']?([^"']*)["']?\)/);
                if (urlMatch && urlMatch[1]) {
                    preview.src = urlMatch[1];
                    console.log('✅ Using current background:', urlMatch[1]);
                    return;
                }
            }
            
            // Final fallback to default wallpaper
            preview.src = 'images/wallpaper.jpg';
            console.log('✅ Using default wallpaper fallback');
        } catch (error) {
            console.warn('Error updating wallpaper preview:', error);
            preview.src = 'images/wallpaper.jpg';
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
                console.log('✅ Updated global userProfile');
                
                // Update UI interface - check if function exists
                if (typeof window.updateUserInterface === 'function') {
                    window.updateUserInterface();
                    console.log('✅ Called updateUserInterface');
                }
            }
            
            // Update taskbar user info if it exists
            const taskbarUser = document.querySelector('#userProfile');
            if (taskbarUser) {
                const userImg = taskbarUser.querySelector('img');
                const userName = taskbarUser.querySelector('.user-name');
                
                if (userImg) userImg.src = userData.profilePicture;
                if (userName) userName.textContent = userData.name;
                console.log('✅ Updated taskbar user info');
            }
            
            console.log('✅ User data saved successfully');
        } catch (error) {
            console.error('❌ Could not save user data:', error);
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
            
            if (userAgent.includes('Chrome')) browser = 'Chromium-based';
            else if (userAgent.includes('Firefox')) browser = 'Gecko';
            else if (userAgent.includes('Safari')) browser = 'WebKit';
            else if (userAgent.includes('Edge')) browser = 'EdgeHTML/Chromium';
            
            browserInfo.textContent = browser;
        }
        
        // Update platform info
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
            console.log('✅ Settings window closed');
        }
    }
}

// Export for global use
window.SettingsApp = SettingsApp;

// Close the conditional block
}
