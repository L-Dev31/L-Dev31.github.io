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

let currentGridConfig = null;
let currentGridPositions = [];
let dragState = {
    isDragging: false,
    element: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
};

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

function calculateDesktopGrid() {
    const cellWidth = 100;
    const cellHeight = 120;
    const padding = 20;
    const taskbarHeight = 50;
    const availableWidth = window.innerWidth - (padding * 2);
    const availableHeight = window.innerHeight - taskbarHeight - (padding * 2);
    
    return {
        cellWidth,
        cellHeight,
        padding,
        rows: Math.floor(availableHeight / cellHeight),
        cols: Math.floor(availableWidth / cellWidth)
    };
}

function createGridPositions(gridConfig) {
    const positions = [];
    for (let row = 0; row < gridConfig.rows; row++) {
        for (let col = 0; col < gridConfig.cols; col++) {
            positions.push({
                x: gridConfig.padding + (col * gridConfig.cellWidth),
                y: gridConfig.padding + (row * gridConfig.cellHeight),
                row,
                col
            });
        }
    }
    return positions;
}

function findClosestGridPosition(x, y) {
    if (!currentGridPositions.length) return null;
    
    let closest = currentGridPositions[0];
    let minDistance = Infinity;
    
    currentGridPositions.forEach(pos => {
        const distance = Math.sqrt(Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2));
        if (distance < minDistance) {
            minDistance = distance;
            closest = pos;
        }
    });
    
    return closest;
}

function loadIconPositions() {
    try {
        const saved = localStorage.getItem('desktop-icon-positions');
        return saved ? JSON.parse(saved) : {};
    } catch (error) {
        return {};
    }
}

function saveIconPositions() {
    const positions = {};
    const icons = document.querySelectorAll('.desktop-item');
    
    icons.forEach(icon => {
        const name = icon.querySelector('span')?.textContent;
        if (name) {
            positions[name] = {
                x: parseInt(icon.style.left),
                y: parseInt(icon.style.top),
                gridRow: parseInt(icon.dataset.gridRow),
                gridCol: parseInt(icon.dataset.gridCol)
            };
        }
    });
    
    try {
        localStorage.setItem('desktop-icon-positions', JSON.stringify(positions));
    } catch (error) {
        console.error('Failed to save icon positions:', error);
    }
}

async function loadDesktopItems() {
    try {
        const homeItems = await fetchHomeItemsFromServer();
        if (!Array.isArray(homeItems) || !homeItems.length) {
            throw new Error('No desktop items returned from server.');
        }
        
        const desktopIcons = document.getElementById('desktopIcons');
        desktopIcons.innerHTML = '';
        
        const gridConfig = calculateDesktopGrid();
        currentGridConfig = gridConfig;
        const gridPositions = createGridPositions(gridConfig);
        currentGridPositions = gridPositions;
        
        const savedPositions = loadIconPositions();
        
        homeItems.forEach((item, index) => {
            const desktopItem = document.createElement('div');
            desktopItem.className = 'desktop-item';
            
            let positioned = false;
            if (savedPositions[item.name]) {
                const savedPos = savedPositions[item.name];
                if (savedPos.x >= 0 && savedPos.y >= 0 && 
                    savedPos.x < window.innerWidth && savedPos.y < window.innerHeight) {
                    
                    desktopItem.style.position = 'absolute';
                    desktopItem.style.left = `${savedPos.x}px`;
                    desktopItem.style.top = `${savedPos.y}px`;
                    desktopItem.dataset.gridRow = savedPos.gridRow || 0;
                    desktopItem.dataset.gridCol = savedPos.gridCol || 0;
                    
                    positioned = true;
                }
            }
            
            if (!positioned) {
                const gridPos = gridPositions[index];
                if (gridPos) {
                    desktopItem.style.position = 'absolute';
                    desktopItem.style.left = `${gridPos.x}px`;
                    desktopItem.style.top = `${gridPos.y}px`;
                    desktopItem.dataset.gridRow = gridPos.row;
                    desktopItem.dataset.gridCol = gridPos.col;
                }
            }
            
            let iconHtml;
            if (item.isDirectory === true || item.type === 'folder') {
                iconHtml = `<img src="images/folder.png" alt="${item.name}" class="folder-icon">`;
            } else if (item.type === 'app') {
                iconHtml = `<img src="${item.icon}" alt="${item.name}" class="app-icon">`;
            } else if (item.type === 'file') {
                if (typeof item.icon === 'string' && item.icon.startsWith('fas ')) {
                    iconHtml = `<div class="file-icon-fa"><i class="${item.icon}"></i></div>`;
                } else if (item.icon) {
                    iconHtml = `<img src="${item.icon}" alt="${item.name}" class="file-icon">`;
                } else {
                    iconHtml = `<div class="file-icon-fa"><i class="fas fa-file"></i></div>`;
                }
            } else {
                iconHtml = `<div class="file-icon-fa"><i class="fas fa-question-circle"></i></div>`;
            }
            
            desktopItem.innerHTML = `${iconHtml}<span>${item.name}</span>`;
            
            let clickTimeout = null;
            desktopItem.addEventListener('click', (e) => {
                if (dragState.isDragging) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                    
                    if (item.isDirectory || item.type === 'folder') {
                        window.appLauncher.launchApp('app1', { path: item.name });
                    } else if (item.type === 'app') {
                        window.appLauncher.launchApp(item.appId);
                    } else if (item.name === 'Files') {
                        window.appLauncher.launchApp('app1');
                    }
                } else {
                    clickTimeout = setTimeout(() => {
                        clickTimeout = null;
                    }, 300);
                }
            });
            
            makeIconDraggable(desktopItem, item.name);
            desktopIcons.appendChild(desktopItem);
        });
        
        window.desktopData = { desktopItems: homeItems };
    } catch (error) {
        console.error('Could not load desktop items from server:', error);
    }
}

async function fetchHomeItemsFromServer() {
    try {
        // Use the DirectoryFetcher class from get-directory.js
        const fetcher = new DirectoryFetcher();
        // We need to wait for the apps data to be loaded by the fetcher
        await fetcher.loadAppsData();
        // Fetch contents of the root of the home directory
        return await fetcher.fetchDirectoryContents('');
    } catch (error) {
        console.error('❌ Failed to fetch or parse items:', error);
        return [];
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
            console.log(`🚀 Launched ${app.name} (${app.id})`);
            window.appLauncher.launchApp(app.id);
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
            console.log(`🚀 Launched ${app.name} (${app.id}) from settings`);
            window.appLauncher.launchApp(app.id);
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

// Visual grid snap indicator
let snapIndicator = null;

// Create snap indicator element
function createSnapIndicator() {
    if (snapIndicator) return snapIndicator;
    
    snapIndicator = document.createElement('div');
    snapIndicator.style.cssText = `
        position: absolute;
        border: 2px dashed rgba(0, 150, 255, 0.8);
        background-color: rgba(0, 150, 255, 0.1);
        border-radius: 8px;
        pointer-events: none;
        z-index: 999;
        display: none;
        width: 80px;
        height: 100px;
        transition: all 0.1s ease;
    `;
    document.body.appendChild(snapIndicator);
    return snapIndicator;
}

// Show snap indicator at grid position
function showSnapIndicator(gridPos) {
    const indicator = createSnapIndicator();
    if (!indicator || !gridPos) return;
    
    indicator.style.left = `${gridPos.x}px`;
    indicator.style.top = `${gridPos.y}px`;
    indicator.style.display = 'block';
}

// Hide snap indicator
function hideSnapIndicator() {
    if (snapIndicator) {
        snapIndicator.style.display = 'none';
    }
}

// ======================================
// DRAG-AND-DROP FOR DESKTOP ICONS
// ======================================

function makeIconDraggable(element, itemName) {
    element.addEventListener('mousedown', (e) => {
        e.preventDefault();
        
        dragState.element = element;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        dragState.offsetX = e.clientX - element.offsetLeft;
        dragState.offsetY = e.clientY - element.offsetTop;
        dragState.isDragging = false;
        
        element.style.zIndex = '1000';
        element.style.transition = 'none';
    });
}

document.addEventListener('mousemove', (e) => {
    if (!dragState.element) return;
    
    const deltaX = Math.abs(e.clientX - dragState.startX);
    const deltaY = Math.abs(e.clientY - dragState.startY);
    
    if (!dragState.isDragging && (deltaX > 5 || deltaY > 5)) {
        dragState.isDragging = true;
        dragState.element.style.opacity = '0.8';
    }
    
    if (dragState.isDragging) {
        const x = e.clientX - dragState.offsetX;
        const y = e.clientY - dragState.offsetY;
        dragState.element.style.left = `${x}px`;
        dragState.element.style.top = `${y}px`;
    }
});

document.addEventListener('mouseup', (e) => {
    if (!dragState.element) return;
    
    if (dragState.isDragging) {
        e.preventDefault();
        e.stopPropagation();
        
        const x = e.clientX - dragState.offsetX;
        const y = e.clientY - dragState.offsetY;
        const closestPos = findClosestGridPosition(x, y);
        
        if (closestPos) {
            dragState.element.style.left = `${closestPos.x}px`;
            dragState.element.style.top = `${closestPos.y}px`;
            dragState.element.dataset.gridRow = closestPos.row;
            dragState.element.dataset.gridCol = closestPos.col;
            
            saveIconPositions();
        }
    }
    
    if (dragState.element) {
        dragState.element.style.zIndex = '';
        dragState.element.style.opacity = '';
        dragState.element.style.transition = '';
    }
    
    dragState = {
        isDragging: false,
        element: null,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0
    };
});


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
// INITIALIZATION
// ======================================

const settingsManager = new SettingsManager();

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Starting application...');
    
    // Initialize app launcher
    await window.appLauncher.init();
    
    // Load user profile first
    await loadUserProfile();
    
    const images = await loadImages();
    
    if (images.length > 0) {
        createIndicators();
        changeToImage(0);
        startAutoChange();
        setupEventListeners();
        
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

// Window resize handler to recalculate grid
function handleWindowResize() {
    // Debounce resize events
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        const newGridConfig = calculateDesktopGrid();
        
        // Only recalculate if grid dimensions changed significantly
        if (!currentGridConfig || 
            currentGridConfig.rows !== newGridConfig.rows || 
            currentGridConfig.cols !== newGridConfig.cols) {
            
            console.log('🔄 Window resized, recalculating desktop grid...');
            loadDesktopItems(); // Reload desktop with new grid
        }
    }, 250);
}

// Helper function to snap position to nearest grid cell
function snapToGrid(x, y, gridConfig) {
    // Calculate which grid cell the position falls into
    const col = Math.max(0, Math.min(
        Math.round((x - gridConfig.padding) / gridConfig.cellWidth),
        gridConfig.cols - 1
    ));
    
    const row = Math.max(0, Math.min(
        Math.round((y - gridConfig.padding) / gridConfig.cellHeight),
        gridConfig.rows - 1
    ));
    
    return {
        col: col,
        row: row,
        x: gridConfig.padding + (col * gridConfig.cellWidth),
        y: gridConfig.padding + (row * gridConfig.cellHeight)
    };
}

const ICON_POSITIONS_KEY = 'desktop-icon-positions';

function loadIconPositions() {
    try {
        const saved = localStorage.getItem(ICON_POSITIONS_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch (error) {
        return {};
    }
}

function saveIconPositions(positions) {
    try {
        localStorage.setItem(ICON_POSITIONS_KEY, JSON.stringify(positions));
    } catch (error) {
        console.error('Failed to save icon positions:', error);
    }
}

function getCurrentIconPositions() {
    const positions = {};
    const icons = document.querySelectorAll('.desktop-item');
    
    icons.forEach(icon => {
        const name = icon.querySelector('span')?.textContent;
        if (name) {
            positions[name] = {
                x: parseInt(icon.style.left),
                y: parseInt(icon.style.top),
                gridRow: parseInt(icon.dataset.gridRow),
                gridCol: parseInt(icon.dataset.gridCol)
            };
        }
    });
    
    return positions;
}

let draggedIcon = null;
let isDragging = false;
let dragStarted = false;

function makeIconDraggable(desktopItem, itemName) {
    desktopItem.draggable = false;
    
    desktopItem.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        
        dragStarted = false;
        draggedIcon = desktopItem;
        
        const rect = desktopItem.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        
        const startX = e.clientX;
        const startY = e.clientY;
        
        const handleMouseMove = (moveEvent) => {
            const deltaX = Math.abs(moveEvent.clientX - startX);
            const deltaY = Math.abs(moveEvent.clientY - startY);
            
            if (!dragStarted && (deltaX > 5 || deltaY > 5)) {
                dragStarted = true;
                isDragging = true;
                desktopItem.style.zIndex = '1000';
                desktopItem.style.opacity = '0.8';
            }
            
            if (dragStarted) {
                const newX = moveEvent.clientX - offsetX;
                const newY = moveEvent.clientY - offsetY;
                desktopItem.style.left = `${newX}px`;
                desktopItem.style.top = `${newY}px`;
            }
        };
        
        const handleMouseUp = (upEvent) => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            if (dragStarted) {
                const newX = upEvent.clientX - offsetX;
                const newY = upEvent.clientY - offsetY;
                
                const targetPos = findBestGridPosition(newX, newY);
                
                desktopItem.style.left = `${targetPos.x}px`;
                desktopItem.style.top = `${targetPos.y}px`;
                desktopItem.dataset.gridRow = targetPos.row;
                desktopItem.dataset.gridCol = targetPos.col;
                
                saveIconPositions(getCurrentIconPositions());
            }
            
            desktopItem.style.zIndex = '';
            desktopItem.style.opacity = '';
            draggedIcon = null;
            isDragging = false;
            dragStarted = false;
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    });
    
    desktopItem.addEventListener('click', (e) => {
        if (dragStarted) {
            e.preventDefault();
            e.stopPropagation();
        }
    });
}

function findBestGridPosition(x, y) {
    if (!currentGridConfig) return { x: 20, y: 20, row: 0, col: 0 };
    
    const targetCol = Math.round((x - currentGridConfig.padding) / currentGridConfig.cellWidth);
    const targetRow = Math.round((y - currentGridConfig.padding) / currentGridConfig.cellHeight);
    
    const clampedCol = Math.max(0, Math.min(targetCol, currentGridConfig.cols - 1));
    const clampedRow = Math.max(0, Math.min(targetRow, currentGridConfig.rows - 1));
    
    if (!isPositionOccupied(clampedRow, clampedCol)) {
        return getGridCoordinates(clampedRow, clampedCol);
    }
    
    for (let radius = 1; radius <= Math.max(currentGridConfig.rows, currentGridConfig.cols); radius++) {
        for (let row = Math.max(0, clampedRow - radius); row <= Math.min(currentGridConfig.rows - 1, clampedRow + radius); row++) {
            for (let col = Math.max(0, clampedCol - radius); col <= Math.min(currentGridConfig.cols - 1, clampedCol + radius); col++) {
                if (!isPositionOccupied(row, col)) {
                    return getGridCoordinates(row, col);
                }
            }
        }
    }
    
    return getGridCoordinates(0, 0);
}

function isPositionOccupied(row, col) {
    const icons = document.querySelectorAll('.desktop-item');
    for (const icon of icons) {
        if (icon === draggedIcon) continue;
        if (parseInt(icon.dataset.gridRow) === row && parseInt(icon.dataset.gridCol) === col) {
            return true;
        }
    }
    return false;
}

function getGridCoordinates(row, col) {
    return {
        x: currentGridConfig.padding + (col * currentGridConfig.cellWidth),
        y: currentGridConfig.padding + (row * currentGridConfig.cellHeight),
        row: row,
        col: col
    };
}