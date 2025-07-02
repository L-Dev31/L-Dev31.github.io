// ======================================
// SIMPLIFIED DESKTOP APPLICATION
// ======================================

// Global Configuration
const CONFIG = {
    imageFolder: 'images/BG/',
    slideInterval: 30000, // 30 seconds
    password: '312007'
};

// Global State
let currentImageIndex = 0;
let localImages = [];
let autoChangeInterval = null;
let isLoginMode = false;
let userProfile = null;

// Known image filenames (fallback list)
const knownImages = [
    '1029604.jpg', '1146709.jpg', '15989756.jpg', '210186.jpg',
    '2187662.jpg', '219692.jpg', '247599.jpg', '3386540.jpg',
    '3647545.jpg', '393773.jpg', '402028.jpg', '417173.jpg',
    '7704801.jpg', '8957663.jpg'
];

// ======================================
// IMAGE SLIDESHOW FUNCTIONS
// ======================================

async function loadImages() {
    console.log('🔍 Loading images...');
    const foundImages = [];
    
    for (const imageName of knownImages) {
        if (await imageExists(`${CONFIG.imageFolder}${imageName}`)) {
            foundImages.push(imageName);
        }
    }
    
    localImages = foundImages;
    console.log(`✅ Found ${foundImages.length} images`);
    return foundImages;
}

function imageExists(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
        setTimeout(() => resolve(false), 2000);
    });
}

function createIndicators() {
    const indicators = document.getElementById('imageIndicators');
    indicators.innerHTML = '';
    
    localImages.forEach((_, index) => {
        const dot = document.createElement('div');
        dot.className = 'indicator-dot';
        dot.addEventListener('click', () => changeToImage(index));
        indicators.appendChild(dot);
    });
    
    updateIndicators();
}

function updateIndicators() {
    const dots = document.querySelectorAll('.indicator-dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentImageIndex);
    });
}

function changeToImage(index) {
    if (index < 0 || index >= localImages.length) return;
    
    currentImageIndex = index;
    const background = document.getElementById('background');
    
    background.style.opacity = '0';
    setTimeout(() => {
        background.style.backgroundImage = `url(${CONFIG.imageFolder}${localImages[index]})`;
        background.style.opacity = '1';
        updateIndicators();
    }, 500);
    
    resetAutoChange();
}

function nextImage() {
    const newIndex = currentImageIndex === localImages.length - 1 ? 0 : currentImageIndex + 1;
    changeToImage(newIndex);
}

function previousImage() {
    const newIndex = currentImageIndex === 0 ? localImages.length - 1 : currentImageIndex - 1;
    changeToImage(newIndex);
}

function startAutoChange() {
    clearInterval(autoChangeInterval);
    autoChangeInterval = setInterval(nextImage, CONFIG.slideInterval);
}

function resetAutoChange() {
    startAutoChange();
}

// ======================================
// LOGIN FUNCTIONS
// ======================================

function showLoginScreen() {
    isLoginMode = true;
    document.body.classList.add('blur-mode');
    
    setTimeout(() => {
        document.getElementById('loginScreen').classList.add('active');
        setTimeout(() => {
            document.getElementById('passwordInput')?.focus();
        }, 300);
    }, 100);
}

function hideLoginScreen() {
    isLoginMode = false;
    document.getElementById('loginScreen').classList.remove('active');
    
    setTimeout(() => {
        document.body.classList.remove('blur-mode');
    }, 200);
    
    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) {
        passwordInput.value = '';
        passwordInput.blur();
    }
}

function handleLogin() {
    const password = document.getElementById('passwordInput')?.value || '';
    
    if (password.trim() === '') {
        shakeElement(document.getElementById('passwordInput'));
        return;
    }
    
    if (password === CONFIG.password) {
        console.log('✅ Login successful');
        showDesktop();
    } else {
        console.log('❌ Invalid password');
        const input = document.getElementById('passwordInput');
        shakeElement(input);
        input.style.borderColor = 'rgba(255, 100, 100, 0.8)';
        setTimeout(() => {
            input.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            input.value = '';
        }, 500);
    }
}

function shakeElement(element) {
    if (element) {
        element.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }
}

// ======================================
// DESKTOP FUNCTIONS
// ======================================

async function showDesktop() {
    const fadeOverlay = document.getElementById('fadeOverlay');
    const loginScreen = document.getElementById('loginScreen');
    const desktop = document.getElementById('desktop');
    
    // Reset any previous classes and start login transition with white background and zoom effect
    fadeOverlay.className = 'login-transition';
    
    // Add zoom-in class after a brief delay
    setTimeout(() => {
        fadeOverlay.classList.add('zoom-in');
    }, 50);
    
    setTimeout(() => {
        loginScreen.classList.remove('active');
        document.body.classList.remove('blur-mode');
    }, 600);
    
    setTimeout(async () => {
        await loadDesktopItems();
        await loadApps(); // Load apps from JSON
        
        // Ensure user profile is loaded and interface is updated
        if (!userProfile) {
            await loadUserProfile();
        }
        updateUserInterface();
        
        updateDesktopTime();
        setInterval(updateDesktopTime, 1000);
        
        settingsManager.init();
        desktop.classList.add('active');
        
        // Fade out the login transition smoothly
        setTimeout(() => {
            fadeOverlay.classList.add('fade-out');
        }, 100);
        
        // Clean up after fade-out is complete
        setTimeout(() => {
            fadeOverlay.className = '';
            fadeOverlay.style.cssText = '';
        }, 800);
    }, 1000);
}

async function loadDesktopItems() {
    try {
        console.log('🖥️ Loading desktop items from home folder...');
        
        // Create a DirectoryFetcher to get real home contents
        const directoryFetcher = new DirectoryFetcher();
        
        // Get all items from the home directory
        const homeItems = await directoryFetcher.fetchDirectoryContents('');
        
        console.log('🔍 Raw home items from DirectoryFetcher:', homeItems);
        
        // Only add Files app if we specifically want it on desktop
        // (comment this out if Files app shouldn't appear)
        // homeItems.push({
        //     name: 'Files',
        //     type: 'app',
        //     icon: 'images/app1.png'
        // });
        
        const desktopIcons = document.getElementById('desktopIcons');
        desktopIcons.innerHTML = '';
        
        // Position items in a grid layout
        let x = 30;
        let y = 30;
        const itemWidth = 100;
        const itemHeight = 100;
        const maxItemsPerRow = Math.floor((window.innerWidth - 60) / itemWidth);
        
        homeItems.forEach((item, index) => {
            const desktopItem = document.createElement('div');
            desktopItem.className = 'desktop-item';
            
            // Calculate grid position
            const row = Math.floor(index / maxItemsPerRow);
            const col = index % maxItemsPerRow;
            
            desktopItem.style.left = `${x + (col * itemWidth)}px`;
            desktopItem.style.top = `${y + (row * itemHeight)}px`;
            
            // Force correct icon paths based on item type
            let iconSrc;
            
            console.log(`🎨 Processing icon for ${item.name}: type=${item.type}, original_icon=${item.icon}`);
            
            if (item.type === 'folder') {
                iconSrc = 'images/folder.png';  // Force folder icon
                console.log(`📁 Folder icon set to: ${iconSrc}`);
            } else if (item.type === 'app') {
                iconSrc = item.icon;
                console.log(`🚀 App icon assigned: ${iconSrc}`);
            } else if (item.type === 'file') {
                // For files, check if it's a FontAwesome class or image path
                if (typeof item.icon === 'string' && item.icon.startsWith('fas ')) {
                    iconSrc = null; // Will use FontAwesome
                    console.log(`📄 File with FA icon: ${item.icon}`);
                } else {
                    iconSrc = item.icon;
                    console.log(`📄 File with image icon: ${iconSrc}`);
                }
            } else {
                iconSrc = 'images/folder.png'; // Default to folder icon
                console.log(`❓ Unknown type, using folder icon: ${iconSrc}`);
            }
            
            // Create the desktop item HTML - always use img tag for folders
            let iconHtml;
            if (item.type === 'folder') {
                iconHtml = `<img src="images/folder.png" alt="${item.name}">`;
            } else if (iconSrc) {
                iconHtml = `<img src="${iconSrc}" alt="${item.name}" onerror="this.style.display='none'">`;
            } else if (item.type === 'file' && item.icon && item.icon.startsWith('fas ')) {
                iconHtml = `<div class="file-icon-fa"><i class="${item.icon}"></i></div>`;
            } else {
                iconHtml = `<img src="images/folder.png" alt="${item.name}">`;
            }
            
            desktopItem.innerHTML = `
                ${iconHtml}
                <span>${item.name}</span>
            `;
            
            desktopItem.addEventListener('click', () => {
                console.log(`📁 Clicked on ${item.name}`);
                
                // Open file manager for folders and Files app
                if (item.type === 'folder' || item.name === 'Files') {
                    if (typeof fileManager !== 'undefined' && fileManager.open) {
                        if (item.name === 'Files') {
                            fileManager.open('Home');
                        } else {
                            fileManager.open(item.name);
                        }
                    }
                }
            });
            
            desktopIcons.appendChild(desktopItem);
        });
        
        // Store the data globally for file manager use
        window.desktopData = { desktopItems: homeItems };
        
        console.log(`✅ Desktop items loaded: ${homeItems.length} items`);
    } catch (error) {
        console.warn('⚠️ Could not load desktop items from home folder:', error);
        
        // Fallback to static desktop items if dynamic loading fails
        try {
            const response = await fetch('desktop-items.json');
            const data = await response.json();
            const desktopIcons = document.getElementById('desktopIcons');
            
            desktopIcons.innerHTML = '';
            
            data.desktopItems.forEach(item => {
                const desktopItem = document.createElement('div');
                desktopItem.className = 'desktop-item';
                desktopItem.style.left = `${item.position.x}px`;
                desktopItem.style.top = `${item.position.y}px`;
                
                desktopItem.innerHTML = `
                    <img src="${item.icon}" alt="${item.name}" onerror="this.style.display='none'">
                    <span>${item.name}</span>
                `;
                
                desktopItem.addEventListener('click', () => {
                    console.log(`📁 Clicked on ${item.name}`);
                });
                
                desktopIcons.appendChild(desktopItem);
            });
            
            window.desktopData = data;
            console.log('✅ Fallback desktop items loaded');
        } catch (fallbackError) {
            console.error('❌ Could not load fallback desktop items:', fallbackError);
        }
    }
}

// ======================================
// APP MANAGEMENT
// ======================================

async function loadApps() {
    try {
        const response = await fetch('apps.json');
        const data = await response.json();
        
        // Load taskbar apps
        loadTaskbarApps(data.apps.filter(app => app.showInTaskbar));
        
        // Load settings panel apps
        loadSettingsApps(data.apps);
        
        console.log('✅ Apps loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load apps:', error);
    }
}

function loadTaskbarApps(apps) {
    const taskbarApps = document.getElementById('taskbarApps');
    taskbarApps.innerHTML = '';
    
    apps.forEach(app => {
        const appElement = document.createElement('img');
        appElement.src = app.icon;
        appElement.alt = app.name;
        appElement.className = 'taskbar-app';
        appElement.title = app.name;
        
        appElement.addEventListener('click', () => {
            console.log(`🚀 Launched ${app.name}`);
        });
        
        taskbarApps.appendChild(appElement);
    });
}

function loadSettingsApps(apps) {
    const appGrid = document.getElementById('appGrid');
    appGrid.innerHTML = '';
    
    apps.forEach(app => {
        const appItem = document.createElement('div');
        appItem.className = 'app-item';
        
        appItem.innerHTML = `
            <img src="${app.icon}" alt="${app.name}">
            <span>${app.name}</span>
        `;
        
        appItem.addEventListener('click', () => {
            console.log(`🚀 Launched ${app.name} from settings`);
            settingsManager.hideSettingsPanel();
        });
        
        appGrid.appendChild(appItem);
    });
}

// ======================================
// TIME AND DATE
// ======================================

function updateDesktopTime() {
    const timeElement = document.getElementById('desktopTime');
    const dateElement = document.getElementById('desktopDate');
    
    if (timeElement && dateElement) {
        const now = new Date();
        
        const timeStr = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).format(now);
        
        const dateStr = new Intl.DateTimeFormat('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric'
        }).format(now);
        
        timeElement.textContent = timeStr;
        dateElement.textContent = dateStr;
    }
}

// ======================================
// SETTINGS MANAGER
// ======================================

class SettingsManager {
    constructor() {
        this.settings = {
            taskbarPosition: 'bottom',
            taskbarAlignment: 'center'
        };
        this.loadSettings();
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('desktopSettings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn('Failed to load settings:', error);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('desktopSettings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    init() {
        const startButton = document.getElementById('startButton');
        const closeButton = document.getElementById('closeSettings');
        const logoutButton = document.getElementById('logoutButton');

        if (startButton) {
            startButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSettingsPanel();
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hideSettingsPanel();
            });
        }
        
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                logout();
            });
        }

        // Close settings when clicking outside
        document.addEventListener('click', (e) => {
            const settingsPanel = document.getElementById('settingsPanel');
            if (settingsPanel?.classList.contains('active') && 
                !settingsPanel.contains(e.target) && 
                !startButton?.contains(e.target)) {
                setTimeout(() => {
                    if (settingsPanel?.classList.contains('active')) {
                        this.hideSettingsPanel();
                    }
                }, 100);
            }
        });

        this.setupSettingControls();
        this.applySettings();
    }

    setupSettingControls() {
        // Position settings
        document.querySelectorAll('input[name="taskbarPosition"]').forEach(input => {
            input.addEventListener('change', (e) => {
                this.settings.taskbarPosition = e.target.value;
                this.saveSettings();
                this.applySettings();
            });
        });

        // Alignment settings
        document.querySelectorAll('input[name="taskbarAlignment"]').forEach(input => {
            input.addEventListener('change', (e) => {
                this.settings.taskbarAlignment = e.target.value;
                this.saveSettings();
                this.applySettings();
            });
        });
    }

    applySettings() {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) return;

        // Reset classes
        taskbar.className = 'taskbar';
        taskbar.classList.add(`position-${this.settings.taskbarPosition}`);
        taskbar.classList.add(`align-${this.settings.taskbarAlignment}`);

        // Update desktop padding
        const desktopIcons = document.getElementById('desktopIcons');
        if (desktopIcons) {
            const padding = this.settings.taskbarPosition === 'top' || this.settings.taskbarPosition === 'bottom' ? '68px' : '80px';
            desktopIcons.style.paddingTop = this.settings.taskbarPosition === 'top' ? padding : '20px';
            desktopIcons.style.paddingBottom = this.settings.taskbarPosition === 'bottom' ? padding : '20px';
            desktopIcons.style.paddingLeft = this.settings.taskbarPosition === 'left' ? padding : '20px';
            desktopIcons.style.paddingRight = this.settings.taskbarPosition === 'right' ? padding : '20px';
        }

        // Update form inputs
        const positionInput = document.querySelector(`input[name="taskbarPosition"][value="${this.settings.taskbarPosition}"]`);
        const alignmentInput = document.querySelector(`input[name="taskbarAlignment"][value="${this.settings.taskbarAlignment}"]`);
        
        if (positionInput) positionInput.checked = true;
        if (alignmentInput) alignmentInput.checked = true;

        // Reposition settings panel if open
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel?.classList.contains('active')) {
            setTimeout(() => this.positionSettingsPanel(), 50);
        }
    }

    toggleSettingsPanel() {
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel.classList.contains('active')) {
            this.hideSettingsPanel();
        } else {
            this.showSettingsPanel();
        }
    }

    showSettingsPanel() {
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            this.positionSettingsPanel();
            requestAnimationFrame(() => {
                settingsPanel.classList.add('active');
            });
        }
    }

    positionSettingsPanel() {
        const startButton = document.getElementById('startButton');
        const taskbar = document.getElementById('taskbar');
        const systemTray = document.getElementById('taskbarRight');
        const settingsPanel = document.getElementById('settingsPanel');
        
        if (!startButton || !taskbar || !settingsPanel) return;
        
        const startRect = startButton.getBoundingClientRect();
        const taskbarRect = taskbar.getBoundingClientRect();
        const systemTrayRect = systemTray?.getBoundingClientRect();
        const panelWidth = 480;
        const panelHeight = 600;
        const spacing = 12;
        
        // Reset positioning
        ['left', 'right', 'top', 'bottom'].forEach(prop => {
            settingsPanel.style[prop] = '';
        });
        
        switch (this.settings.taskbarPosition) {
            case 'bottom':
                settingsPanel.style.bottom = (window.innerHeight - taskbarRect.top + spacing) + 'px';
                let leftPos = startRect.left;
                
                // Avoid system tray overlap
                if (this.settings.taskbarAlignment === 'end' && systemTrayRect) {
                    const maxRight = systemTrayRect.left - spacing - 20;
                    if (leftPos + panelWidth > maxRight) {
                        leftPos = Math.max(20, maxRight - panelWidth);
                    }
                }
                
                settingsPanel.style.left = Math.max(20, Math.min(leftPos, window.innerWidth - panelWidth - 20)) + 'px';
                break;
                
            case 'top':
                settingsPanel.style.top = (taskbarRect.bottom + spacing) + 'px';
                let leftPosTop = startRect.left;
                
                if (this.settings.taskbarAlignment === 'end' && systemTrayRect) {
                    const maxRight = systemTrayRect.left - spacing - 20;
                    if (leftPosTop + panelWidth > maxRight) {
                        leftPosTop = Math.max(20, maxRight - panelWidth);
                    }
                }
                
                settingsPanel.style.left = Math.max(20, Math.min(leftPosTop, window.innerWidth - panelWidth - 20)) + 'px';
                break;
                
            case 'left':
                settingsPanel.style.left = (taskbarRect.right + spacing) + 'px';
                settingsPanel.style.top = Math.max(20, Math.min(startRect.top, window.innerHeight - panelHeight - 20)) + 'px';
                break;
                
            case 'right':
                settingsPanel.style.right = (window.innerWidth - taskbarRect.left + spacing) + 'px';
                settingsPanel.style.top = Math.max(20, Math.min(startRect.top, window.innerHeight - panelHeight - 20)) + 'px';
                break;
        }
    }

    hideSettingsPanel() {
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            settingsPanel.classList.remove('active');
        }
    }
}

// ======================================
// USER PROFILE FUNCTIONS
// ======================================

async function loadUserProfile() {
    try {
        const response = await fetch('user-profile.json');
        userProfile = await response.json();
        console.log('✅ User profile loaded:', userProfile.user.name);
        return userProfile;
    } catch (error) {
        console.warn('⚠️ Could not load user profile:', error);
        // Fallback profile
        userProfile = {
            user: {
                name: 'User',
                profilePicture: 'Images/profile.png'
            }
        };
        return userProfile;
    }
}

function updateUserInterface() {
    if (!userProfile) return;
    
    const user = userProfile.user;
    
    // Check if profile picture exists, then update UI accordingly
    if (user.profilePicture) {
        imageExists(user.profilePicture).then(exists => {
            updateProfilePictures(user, exists);
        });
    } else {
        updateProfilePictures(user, false);
    }
    
    // Update usernames
    const userName = document.querySelector('.user-name');
    const userNameSmall = document.querySelector('.user-name-small');
    const footerUserName = document.querySelector('.footer-user-name');
    
    if (userName) userName.textContent = user.name;
    if (userNameSmall) userNameSmall.textContent = user.name;
    if (footerUserName) footerUserName.textContent = user.name;
    
    // Update metadata on screensaver
    updateMetadata();
}

function updateProfilePictures(user, imageExists) {
    const profilePicture = document.querySelector('.profile-picture');
    const userAvatar = document.querySelector('.user-avatar');
    const footerUserAvatar = document.querySelector('.footer-user-avatar');
    
    if (profilePicture) {
        if (imageExists && user.profilePicture) {
            profilePicture.innerHTML = `<img src="${user.profilePicture}" alt="${user.name}" style="width: 96px; height: 96px; border-radius: 50%; object-fit: cover;">`;
        } else {
            profilePicture.innerHTML = '<i class="fa-regular fa-circle-user"></i>';
        }
    }
    
    if (userAvatar) {
        if (imageExists && user.profilePicture) {
            userAvatar.innerHTML = `<img src="${user.profilePicture}" alt="${user.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            userAvatar.innerHTML = '<i class="fa-regular fa-circle-user"></i>';
        }
    }
    
    if (footerUserAvatar) {
        if (imageExists && user.profilePicture) {
            footerUserAvatar.innerHTML = `<img src="${user.profilePicture}" alt="${user.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            footerUserAvatar.innerHTML = '<i class="fa-regular fa-circle-user"></i>';
        }
    }
}

function updateMetadata() {
    const metadata = document.getElementById('metadata');
    if (metadata) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        const dateStr = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        metadata.innerHTML = `
            <div style="margin-bottom: 8px;">${timeStr}</div>
            <div>${dateStr}</div>
        `;
    }
}

// ======================================
// EVENT LISTENERS
// ======================================

function setupEventListeners() {
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (isLoginMode) {
            if (e.key === 'Enter') handleLogin();
            if (e.key === 'Escape') hideLoginScreen();
            return;
        }
        
        switch (e.key) {
            case 'ArrowLeft':
                previousImage();
                break;
            case 'ArrowRight':
                nextImage();
                break;
            case ' ':
            case 'Spacebar':
                e.preventDefault();
                showLoginScreen();
                break;
        }
    });
    
    // Login form
    const submitButton = document.getElementById('submitButton');
    const passwordInput = document.getElementById('passwordInput');
    
    if (submitButton) {
        submitButton.addEventListener('click', handleLogin);
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    }

    // Logout button
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent any default action
            e.stopPropagation(); // Stop event bubbling
            logout();
        });
    }
}

// ======================================
// LOGOUT FUNCTION
// ======================================

function logout() {
    console.log('🚪 Logging out...');

    const fadeOverlay = document.getElementById('fadeOverlay');
    const settingsPanel = document.getElementById('settingsPanel');

    // 1. Hide the settings panel if it's open
    if (settingsPanel) {
        settingsPanel.classList.remove('active');
    }

    // 2. Start the fade to black animation
    fadeOverlay.className = 'fade-to-black';
    
    // 3. Trigger the fade animation
    setTimeout(() => {
        fadeOverlay.classList.add('active');
    }, 50);

    // 4. Refresh the page after 2 seconds
    setTimeout(() => {
        location.reload();
    }, 2000);
}

// ======================================
// FILE MANAGER
// ======================================

const fileManager = {
    isOpen: false,
    currentPath: 'Home',
    history: ['Home'],
    historyIndex: 0,
    isMaximized: false,
    originalBounds: { top: 100, left: 200, width: 800, height: 600 },
    directoryFetcher: null,
    
    // Fallback fileSystem for legacy methods
    fileSystem: {
        'Home': [],
        'Documents': [],
        'Pictures': [],
        'Downloads': [],
        'Projects': [],
        'Music': [],
        'Videos': []
    },

    init() {
        this.directoryFetcher = new DirectoryFetcher();
        this.setupEventListeners();
        this.makeWindowDraggable();
        this.makeWindowResizable();
    },

    setupEventListeners() {
        // Desktop app clicks
        document.addEventListener('click', (e) => {
            const desktopItem = e.target.closest('.desktop-item');
            if (desktopItem) {
                const itemName = desktopItem.querySelector('span').textContent;
                if (itemName === 'Files' || desktopItem.querySelector('img')?.src?.includes('app1.png')) {
                    this.open('Home');
                } else {
                    // For any other desktop item (folders, apps), open the file manager with that path
                    this.open(itemName);
                }
            }
        });

        // Taskbar app clicks
        document.addEventListener('click', (e) => {
            const taskbarApp = e.target.closest('.taskbar-app');
            if (taskbarApp && taskbarApp.title === 'Files') {
                this.open('Home');
            }
        });

        // Window controls
        document.getElementById('closeFileManager').addEventListener('click', () => this.close());
        document.getElementById('minimizeFileManager').addEventListener('click', () => this.minimize());
        document.getElementById('maximizeFileManager').addEventListener('click', () => this.toggleMaximize());

        // Toolbar buttons
        document.getElementById('backBtn').addEventListener('click', () => this.goBack());
        document.getElementById('forwardBtn').addEventListener('click', () => this.goForward());
        document.getElementById('upBtn').addEventListener('click', () => this.goUp());
        document.getElementById('gridViewBtn').addEventListener('click', () => this.setView('grid'));
        document.getElementById('listViewBtn').addEventListener('click', () => this.setView('list'));

        // File item clicks
        document.getElementById('fileGrid').addEventListener('click', async (e) => {
            const fileItem = e.target.closest('.file-item');
            if (fileItem) {
                const itemName = fileItem.dataset.name;
                const itemType = fileItem.dataset.type;
                
                if (itemType === 'folder') {
                    await this.navigateTo(itemName);
                }
            }
        });

        // Path navigation
        document.querySelector('.address-bar').addEventListener('click', async (e) => {
            const pathSegment = e.target.closest('.path-segment');
            if (pathSegment && pathSegment.dataset.path) {
                await this.navigateTo(pathSegment.dataset.path);
            }
        });
    },

    async open(path = 'Home') {
        if (this.isOpen) {
            await this.navigateTo(path);
            return;
        }

        this.isOpen = true;
        this.currentPath = path;
        this.history = [path];
        this.historyIndex = 0;

        const fileManagerEl = document.getElementById('fileManager');
        fileManagerEl.classList.add('active');
        
        await this.updateContent();
        this.updateNavigation();
    },

    close() {
        this.isOpen = false;
        const fileManagerEl = document.getElementById('fileManager');
        fileManagerEl.classList.remove('active');
    },

    minimize() {
        const fileManagerEl = document.getElementById('fileManager');
        fileManagerEl.style.transform = 'scale(0.1)';
        fileManagerEl.style.opacity = '0';
        
        setTimeout(() => {
            fileManagerEl.style.display = 'none';
        }, 300);
    },

    toggleMaximize() {
        const fileManagerEl = document.getElementById('fileManager');
        
        if (!this.isMaximized) {
            // Store original bounds
            const rect = fileManagerEl.getBoundingClientRect();
            this.originalBounds = {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height
            };
            
            // Maximize
            fileManagerEl.style.top = '0';
            fileManagerEl.style.left = '0';
            fileManagerEl.style.width = '100vw';
            fileManagerEl.style.height = '100vh';
            fileManagerEl.style.borderRadius = '0';
            
            this.isMaximized = true;
            document.getElementById('maximizeFileManager').innerHTML = '<i class="fas fa-clone"></i>';
        } else {
            // Restore
            fileManagerEl.style.top = this.originalBounds.top + 'px';
            fileManagerEl.style.left = this.originalBounds.left + 'px';
            fileManagerEl.style.width = this.originalBounds.width + 'px';
            fileManagerEl.style.height = this.originalBounds.height + 'px';
            fileManagerEl.style.borderRadius = '12px';
            
            this.isMaximized = false;
            document.getElementById('maximizeFileManager').innerHTML = '<i class="fas fa-square"></i>';
        }
    },

    async navigateTo(path) {
        if (this.currentPath !== path) {
            // Add to history if navigating forward
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            this.history.push(path);
            this.historyIndex = this.history.length - 1;
            
            this.currentPath = path;
            await this.updateContent();
            this.updateNavigation();
        }
    },

    async goBack() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.currentPath = this.history[this.historyIndex];
            await this.updateContent();
            this.updateNavigation();
        }
    },

    async goForward() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.currentPath = this.history[this.historyIndex];
            await this.updateContent();
            this.updateNavigation();
        }
    },

    async goUp() {
        if (this.currentPath !== 'Home') {
            await this.navigateTo('Home');
        }
    },

    setView(viewType) {
        const fileGrid = document.getElementById('fileGrid');
        const gridBtn = document.getElementById('gridViewBtn');
        const listBtn = document.getElementById('listViewBtn');
        
        if (viewType === 'list') {
            fileGrid.classList.add('list-view');
            listBtn.style.background = 'rgba(0, 120, 212, 0.2)';
            gridBtn.style.background = 'rgba(0, 0, 0, 0.05)';
        } else {
            fileGrid.classList.remove('list-view');
            gridBtn.style.background = 'rgba(0, 120, 212, 0.2)';
            listBtn.style.background = 'rgba(0, 0, 0, 0.05)';
        }
    },

    async updateContent() {
        const fileGrid = document.getElementById('fileGrid');
        
        // Show loading state
        fileGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(0,0,0,0.6);">Loading...</div>';
        
        try {
            const items = await this.getFolderContent(this.currentPath);
            
            fileGrid.innerHTML = '';
            
            if (items.length === 0) {
                fileGrid.innerHTML = '<div class="file-grid-empty-message"><i class="fas fa-folder-open"></i><div>This folder is empty</div></div>';
            } else {
                items.forEach(item => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    fileItem.dataset.name = item.name;
                    fileItem.dataset.type = item.type;
                    
                    const iconHtml = item.icon.includes('images/') 
                        ? `<img src="${item.icon}" alt="${item.name}">`
                        : `<i class="${item.icon}"></i>`;
                    
                    fileItem.innerHTML = `
                        <div class="file-item-icon">${iconHtml}</div>
                        <div class="file-item-name">${item.name}</div>
                    `;
                    
                    fileGrid.appendChild(fileItem);
                });
            }
            
            // Update item count
            document.getElementById('itemCount').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
            
        } catch (error) {
            console.error('Error loading folder content:', error);
            fileGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: rgba(255,0,0,0.6);"><i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i><br>Error loading folder contents</div>';
        }
        
        // Update window title
        document.getElementById('fileManagerTitle').textContent = this.currentPath;
    },

    async getFolderContent(folderName) {
        if (folderName === 'Home') {
            return this.getHomeContent();
        }
        
        // Fetch real directory contents
        try {
            const items = await this.directoryFetcher.fetchDirectoryContents(folderName);
            return items;
        } catch (error) {
            console.warn(`Could not fetch contents for ${folderName}:`, error);
            return [];
        }
    },

    getHomeContent() {
        // Get desktop items from the loaded data and combine with real folders
        const homeContent = [];
        
        // Add real folders that exist in the home directory
        const realFolders = ['Documents', 'Pictures', 'Downloads', 'Projects', 'Music', 'Videos'];
        realFolders.forEach(folderName => {
            homeContent.push({
                name: folderName,
                type: 'folder',
                icon: 'images/folder.png'
            });
        });
        
        // Add apps from desktop items (if any)
        if (window.desktopData && window.desktopData.desktopItems) {
            window.desktopData.desktopItems.forEach(item => {
                if (item.type === 'app') {
                    homeContent.push({
                        name: item.name,
                        type: item.type,
                        icon: item.icon
                    });
                }
            });
        } else {
            // Fallback apps
            homeContent.push(
                { name: 'Prism', type: 'app', icon: 'images/app5.png' },
                { name: 'Scaffold', type: 'app', icon: 'images/app7.png' },
                { name: 'Mango', type: 'app', icon: 'images/app9.png' },
                { name: 'Avokadoo', type: 'app', icon: 'images/app10.png' }
            );
        }

        return homeContent;
    },

    updateNavigation() {
        // Update toolbar buttons
        document.getElementById('backBtn').disabled = this.historyIndex <= 0;
        document.getElementById('forwardBtn').disabled = this.historyIndex >= this.history.length - 1;
        document.getElementById('upBtn').disabled = this.currentPath === 'Home';
        
        // Update address bar
        const currentPathSpan = document.getElementById('currentPath');
        if (this.currentPath === 'Home') {
            currentPathSpan.textContent = '';
            currentPathSpan.style.display = 'none';
            document.querySelector('.path-separator').style.display = 'none';
        } else {
            currentPathSpan.textContent = this.currentPath;
            currentPathSpan.style.display = 'inline';
            document.querySelector('.path-separator').style.display = 'inline';
        }
    },

    makeWindowDraggable() {
        const header = document.getElementById('fileManagerHeader');
        const fileManagerEl = document.getElementById('fileManager');
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        header.addEventListener('mousedown', (e) => {
            if (this.isMaximized) return;
            
            isDragging = true;
            const rect = fileManagerEl.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', stopDrag);
            e.preventDefault();
        });

        const handleDrag = (e) => {
            if (!isDragging) return;
            
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;
            
            fileManagerEl.style.left = Math.max(0, Math.min(newX, window.innerWidth - 200)) + 'px';
            fileManagerEl.style.top = Math.max(0, Math.min(newY, window.innerHeight - 100)) + 'px';
        };

        const stopDrag = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleDrag);
            document.removeEventListener('mouseup', stopDrag);
        };
    },

    makeWindowResizable() {
        const resizeHandle = document.getElementById('resizeHandle');
        const fileManagerEl = document.getElementById('fileManager');
        let isResizing = false;

        resizeHandle.addEventListener('mousedown', (e) => {
            if (this.isMaximized) return;
            
            isResizing = true;
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        });

        const handleResize = (e) => {
            if (!isResizing) return;
            
            const rect = fileManagerEl.getBoundingClientRect();
            const newWidth = e.clientX - rect.left;
            const newHeight = e.clientY - rect.top;
            
            fileManagerEl.style.width = Math.max(400, newWidth) + 'px';
            fileManagerEl.style.height = Math.max(300, newHeight) + 'px';
        };

        const stopResize = () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        };
    }
};

// ======================================
// INITIALIZATION
// ======================================

const settingsManager = new SettingsManager();

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Starting application...');
    
    // Load user profile first
    await loadUserProfile();
    
    const images = await loadImages();
    
    if (images.length > 0) {
        createIndicators();
        changeToImage(0);
        startAutoChange();
        setupEventListeners();
        
        // Initialize file manager
        fileManager.init();
        
        // Update user interface elements
        updateUserInterface();
        
        // Start metadata updates
        updateMetadata();
        setInterval(updateMetadata, 1000);
        
        console.log('✅ Application started successfully');
    } else {
        console.error('❌ No images found!');
        const background = document.getElementById('background');
        background.style.backgroundColor = '#1a1a1a';
        background.style.display = 'flex';
        background.style.alignItems = 'center';
        background.style.justifyContent = 'center';
        background.innerHTML = '<div style="color: white; text-align: center; font-size: 1.2em;"><h2>No Images Found</h2><p>Please add images to the <strong>Images/BG/</strong> folder</p></div>';
    }
});