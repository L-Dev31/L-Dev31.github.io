const CONFIG = {
    imageFolder: 'images/BG/',
    slideInterval: 30000,
    password: '312007'
};
let currentImageIndex = 0;
let localImages = [];
let autoChangeInterval = null;
let isLoginMode = false;
let userProfile = null;
let currentGridConfig = null;
let currentGridPositions = [];
const knownImages = [
    '1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg',
    '219692.jpg', '7704801.jpg', '8957663.jpg'
];
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
    if (!indicators) {
        console.warn('imageIndicators element not found');
        return;
    }
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
        // Ensure apps are loaded before loading desktop items
        if (!window.appLauncher.appsData) {
            await loadApps();
        }
        
        await loadDesktopItems();
        
        if (!userProfile) {
            await loadUserProfile();
        }
        updateUserInterface();
        loadSavedWallpaper();
        updateDesktopTime();
        setInterval(updateDesktopTime, 1000);
        // Initialize TaskbarManager
        // (already initialized globally)
        setupTaskbarPositionWatcher();
        // Load and apply taskbar settings
        loadTaskbarSettings();
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
    const taskbar = document.getElementById('taskbar');
    const taskbarRect = taskbar.getBoundingClientRect();
    const taskbarPosition = getCurrentTaskbarPosition();
    const cellWidth = 110; // Icon width + padding
    const cellHeight = 110; // Icon height + padding
    let availableWidth = window.innerWidth;
    let availableHeight = window.innerHeight;
    let startX = 20; // Default padding
    let startY = 20; // Default padding
    switch (taskbarPosition) {
        case 'bottom':
            availableHeight -= taskbarRect.height;
            break;
        case 'top':
            availableHeight -= taskbarRect.height;
            startY = taskbarRect.height + 20;
            break;
        case 'left':
            availableWidth -= taskbarRect.width;
            startX = taskbarRect.width + 20;
            break;
        case 'right':
            availableWidth -= taskbarRect.width;
            break;
    }
    // The grid area starts after the padding.
    const gridAreaWidth = availableWidth - startX;
    const gridAreaHeight = availableHeight - startY;
    const result = {
        cellWidth,
        cellHeight,
        padding: startX,
        paddingY: startY,
        rows: Math.floor(gridAreaHeight / cellHeight),
        cols: Math.floor(gridAreaWidth / cellWidth),
        taskbarPosition
    };
    return result;
}
function createGridPositions(gridConfig) {
    const positions = [];
    for (let row = 0; row < gridConfig.rows; row++) {
        for (let col = 0; col < gridConfig.cols; col++) {
            positions.push({
                x: gridConfig.padding + (col * gridConfig.cellWidth),
                y: gridConfig.paddingY + (row * gridConfig.cellHeight),
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
async function loadDesktopItems() {
    try {
        const homeItems = await fetchHomeItemsFromServer();
        if (!Array.isArray(homeItems) || !homeItems.length) {
            throw new Error('No desktop items returned from server.');
        }
        const desktopIcons = document.getElementById('desktopIcons');
        if (!desktopIcons) {
            console.error('desktopIcons element not found');
            return;
        }
        desktopIcons.innerHTML = '';
        const gridConfig = calculateDesktopGrid();
        currentGridConfig = gridConfig;
        const gridPositions = createGridPositions(gridConfig);
        currentGridPositions = gridPositions;
        const savedPositions = loadIconPositions();
        // Track used grid slots
        const usedSlots = new Set();
        // Helper to get grid slot key
        const slotKey = (row, col) => `${row},${col}`;
        // Validate all saved positions against current grid
        const validatedItems = homeItems.map((item, index) => {
            let pos = null;
            let assigned = false;
            if (savedPositions[item.name]) {
                const savedPos = savedPositions[item.name];
                // Check if saved position is within current grid bounds
                if (savedPos.gridRow !== undefined && savedPos.gridCol !== undefined) {
                    const savedRow = parseInt(savedPos.gridRow);
                    const savedCol = parseInt(savedPos.gridCol);
                    if (savedRow >= 0 && savedRow < gridConfig.rows && 
                        savedCol >= 0 && savedCol < gridConfig.cols &&
                        !usedSlots.has(slotKey(savedRow, savedCol))) {
                        // Saved position is valid in current grid
                        const gridPos = gridPositions.find(p => p.row === savedRow && p.col === savedCol);
                        if (gridPos) {
                            usedSlots.add(slotKey(savedRow, savedCol));
                            pos = gridPos;
                            assigned = true;
                        }
                    }
                }
                // If grid position invalid, try to find closest available position
                if (!assigned) {
                    let closest = null;
                    let minDist = Infinity;
                    for (const gridPos of gridPositions) {
                        const dist = Math.hypot(gridPos.x - savedPos.x, gridPos.y - savedPos.y);
                        if (dist < minDist && !usedSlots.has(slotKey(gridPos.row, gridPos.col))) {
                            minDist = dist;
                            closest = gridPos;
                        }
                    }
                    if (closest) {
                        usedSlots.add(slotKey(closest.row, closest.col));
                        pos = closest;
                        assigned = true;
                    }
                }
            }
            // If still not assigned, use next available slot
            if (!assigned) {
                for (const gridPos of gridPositions) {
                    if (!usedSlots.has(slotKey(gridPos.row, gridPos.col))) {
                        usedSlots.add(slotKey(gridPos.row, gridPos.col));
                        pos = gridPos;
                        break;
                    }
                }
            }
            return { item, pos };
        });
        // Render icons with validated positions
        validatedItems.forEach(({ item, pos }) => {
            const desktopItem = document.createElement('div');
            desktopItem.className = 'desktop-item';
            if (pos) {
                desktopItem.style.position = 'absolute';
                desktopItem.style.left = `${pos.x}px`;
                desktopItem.style.top = `${pos.y}px`;
                desktopItem.dataset.gridRow = pos.row;
                desktopItem.dataset.gridCol = pos.col;
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
                if (typeof isDragging !== 'undefined' && isDragging) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                    // Use Universal Launcher for all desktop items
                    if (window.universalLauncher) {
                        const launchItem = window.universalLauncher.createLaunchItem(item);
                        window.universalLauncher.launch(launchItem, { basePath: 'home' });
                    } else {
                        // Fallback to old system
                        if (item.isDirectory || item.type === 'folder') {
                            window.appLauncher.launchApp('app1', { path: item.name });
                        } else if (item.type === 'app') {
                            window.appLauncher.launchApp(item.appId);
                        } else if (item.name === 'Files') {
                            window.appLauncher.launchApp('app1');
                        } else if (item.type === 'file') {
                            // Handle file opening based on extension
                            const extension = item.name.split('.').pop().toLowerCase();
                            if (['txt', 'md', 'markdown', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log'].includes(extension)) {
                                // Open text files in Notes app
                                fetch(`home/${item.name}`)
                                    .then(response => response.text())
                                    .then(content => {
                                        window.appLauncher.launchApp('app3', { fileName: item.name, content: content });
                                    })
                                    .catch(error => {
                                        console.error('Failed to load file:', error);
                                        window.appLauncher.launchApp('app3', { fileName: item.name, content: '' });
                                    });
                            }
                        }
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
        const fetcher = new DirectoryFetcher();
        
        // Pass apps data from app launcher instead of loading separately
        if (window.appLauncher && window.appLauncher.appsData) {
            fetcher.setAppsData(window.appLauncher.appsData.apps);
        }
        
        return await fetcher.fetchDirectoryContents('');
    } catch (error) {
        console.error('❌ Failed to fetch or parse items:', error);
        return [];
    }
}
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
        appElement.dataset.appId = app.id; // Add app ID for window manager
        appElement.dataset.pinned = 'true'; // Mark as pinned
        appElement.addEventListener('click', () => {
            console.log(`🚀 Launched ${app.name} (${app.id})`);
            // Use Universal Launcher for taskbar apps
            if (window.universalLauncher && window.universalLauncher.appLauncher) {
                const launchItem = window.universalLauncher.createLaunchItem(app);
                window.universalLauncher.launch(launchItem);
            } else {
                // Fallback to old system
                console.warn('⚠️ Universal Launcher not ready, using fallback');
                window.appLauncher.launchApp(app.id);
            }
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
            // Use Universal Launcher for settings apps
            if (window.universalLauncher && window.universalLauncher.appLauncher) {
                const launchItem = window.universalLauncher.createLaunchItem(app);
                window.universalLauncher.launch(launchItem);
            } else {
                // Fallback to old system
                console.warn('⚠️ Universal Launcher not ready, using fallback');
                window.appLauncher.launchApp(app.id);
            }
            if (taskbarManager) {
                taskbarManager.hideStartMenu();
            }
        });
        appGrid.appendChild(appItem);
    });
}
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
// TASKBAR MANAGER - REBUILT FROM SCRATCH
class TaskbarManager {
    constructor() {
        this.settings = {
            taskbarPosition: 'bottom',
            taskbarAlignment: 'center'
        };
        this.taskbarElement = null;
        this.zIndexProtectionInterval = null;
    }
    loadSettings() {
        try {
            const saved = localStorage.getItem('desktop-settings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn('Failed to load taskbar settings:', error);
        }
    }
    saveSettings() {
        try {
            localStorage.setItem('desktop-settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Failed to save taskbar settings:', error);
        }
    }
    init() {
        this.setupEventListeners();
        this.applyTaskbarSettings();
    }
    setupEventListeners() {
        const startButton = document.getElementById('startButton');
        const closeButton = document.getElementById('closeSettings');
        const logoutButton = document.getElementById('logoutButton');
        // Start button click
        if (startButton) {
            startButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleStartMenu();
            });
        }
        // Close button click
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                this.hideStartMenu();
            });
        }
        // Logout button click
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                logout();
            });
        }
        // Click outside to close
        document.addEventListener('click', (e) => {
            const settingsPanel = document.getElementById('settingsPanel');
            const startButton = document.getElementById('startButton');
            if (this.isStartMenuOpen && 
                settingsPanel && 
                !settingsPanel.contains(e.target) && 
                !startButton?.contains(e.target)) {
                this.hideStartMenu();
            }
        });
    }
    toggleStartMenu() {
        if (this.isStartMenuOpen) {
            this.hideStartMenu();
        } else {
            this.showStartMenu();
        }
    }
    showStartMenu() {
        const settingsPanel = document.getElementById('settingsPanel');
        const startButton = document.getElementById('startButton');
        if (!settingsPanel) return;
        this.isStartMenuOpen = true;
        // Remove any existing position classes
        settingsPanel.classList.remove('position-bottom', 'position-top', 'position-left', 'position-right');
        // Add position class based on taskbar position
        settingsPanel.classList.add(`position-${this.settings.taskbarPosition}`);
        // Position the start menu
        this.positionStartMenu();
        // Show with animation
        requestAnimationFrame(() => {
            settingsPanel.classList.add('active');
            startButton?.classList.add('active');
        });
    }
    hideStartMenu() {
        const settingsPanel = document.getElementById('settingsPanel');
        const startButton = document.getElementById('startButton');
        if (!settingsPanel) return;
        this.isStartMenuOpen = false;
        settingsPanel.classList.remove('active');
        startButton?.classList.remove('active');
    }
    positionStartMenu() {
        const startButton = document.getElementById('startButton');
        const taskbar = document.getElementById('taskbar');
        const settingsPanel = document.getElementById('settingsPanel');
        if (!startButton || !taskbar || !settingsPanel) return;
        const startRect = startButton.getBoundingClientRect();
        const taskbarRect = taskbar.getBoundingClientRect();
        const spacing = 12;
        // Reset positioning
        settingsPanel.style.left = '';
        settingsPanel.style.right = '';
        settingsPanel.style.top = '';
        settingsPanel.style.bottom = '';
        switch (this.settings.taskbarPosition) {
            case 'bottom':
                settingsPanel.style.bottom = `${window.innerHeight - taskbarRect.top + spacing}px`;
                settingsPanel.style.left = `${Math.max(20, startRect.left)}px`;
                break;
            case 'top':
                settingsPanel.style.top = `${taskbarRect.bottom + spacing}px`;
                settingsPanel.style.left = `${Math.max(20, startRect.left)}px`;
                break;
            case 'left':
                settingsPanel.style.left = `${taskbarRect.right + spacing}px`;
                // Delay vertical alignment to ensure panel dimensions are available
                requestAnimationFrame(() => {
                    this.alignVerticalMenu(settingsPanel, startRect);
                });
                break;
            case 'right':
                settingsPanel.style.right = `${window.innerWidth - taskbarRect.left + spacing}px`;
                // Delay vertical alignment to ensure panel dimensions are available
                requestAnimationFrame(() => {
                    this.alignVerticalMenu(settingsPanel, startRect);
                });
                break;
        }
    }
    alignVerticalMenu(panel, startRect) {
        const alignment = this.settings.taskbarAlignment;
        const panelRect = panel.getBoundingClientRect();
        let topPosition;
        switch (alignment) {
            case 'center':
                topPosition = startRect.top + (startRect.height / 2) - (panelRect.height / 2);
                break;
            case 'end':
                topPosition = startRect.bottom - panelRect.height;
                break;
            case 'start':
            default:
                topPosition = startRect.top;
                break;
        }
        // Ensure the menu doesn't go off-screen
        const margin = 20;
        topPosition = Math.max(margin, topPosition);
        topPosition = Math.min(topPosition, window.innerHeight - panelRect.height - margin);
        panel.style.top = `${topPosition}px`;
    }
    applyTaskbarSettings() {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) return;
        // Reset taskbar classes
        taskbar.className = 'taskbar';
        taskbar.classList.add(`position-${this.settings.taskbarPosition}`);
        taskbar.classList.add(`align-${this.settings.taskbarAlignment}`);
        // Recalculate desktop grid
        setTimeout(() => {
            if (typeof loadDesktopItems === 'function') {
                loadDesktopItems();
            }
        }, 50);
        // Reposition start menu if open
        if (this.isStartMenuOpen) {
            setTimeout(() => this.positionStartMenu(), 100);
        }
        // Adjust maximized windows
        if (window.windowManager) {
            setTimeout(() => {
                window.windowManager.adjustMaximizedWindowsForTaskbar();
            }, 150);
        }
        // Save settings
        this.saveSettings();
    }
    updateTaskbarPosition(position) {
        this.settings.taskbarPosition = position;
        this.applyTaskbarSettings();
    }
    updateTaskbarAlignment(alignment) {
        this.settings.taskbarAlignment = alignment;
        this.applyTaskbarSettings();
    }
    // Protection pour maintenir la taskbar au premier plan
    enableZIndexProtection() {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) return;
        
        this.taskbarElement = taskbar;
        
        // Vérification périodique du z-index de la taskbar
        this.zIndexProtectionInterval = setInterval(() => {
            this.enforceTaskbarZIndex();
        }, 5000);
        
        // Observer des mutations pour détecter les changements de style
        if (window.MutationObserver) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && 
                        (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                        // Vérifier si le z-index de la taskbar a été modifié
                        setTimeout(() => this.enforceTaskbarZIndex(), 10);
                    }
                });
            });
            
            observer.observe(taskbar, {
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        }
        
        // Événement de focus pour s'assurer que la taskbar reste visible
        document.addEventListener('focusin', () => {
            this.enforceTaskbarZIndex();
        });
        
        console.log('✅ Z-index protection enabled for taskbar');
    }
    enforceTaskbarZIndex() {
        if (!this.taskbarElement) return;
        const computedStyle = window.getComputedStyle(this.taskbarElement);
        const currentZIndex = parseInt(computedStyle.zIndex) || 0;
        if (currentZIndex < 999999) {
            this.taskbarElement.style.zIndex = '999999';
        }
    }
    disableZIndexProtection() {
        if (this.zIndexProtectionInterval) {
            clearInterval(this.zIndexProtectionInterval);
            this.zIndexProtectionInterval = null;
            console.log('✅ Z-index protection disabled');
        }
    }
}
function loadTaskbarSettings() {
    if (window.taskbarManager && typeof window.taskbarManager.loadSettings === 'function') {
        window.taskbarManager.loadSettings();
    }
}
async function loadUserProfile() {
    try {
        // Try to load from localStorage first (saved user data)
        let userData = JSON.parse(localStorage.getItem('user-data'));
        if (userData) {
            userProfile = {
                user: {
                    name: userData.name,
                    profilePicture: userData.profilePicture
                }
            };
            console.log('✅ User profile loaded from localStorage:', userProfile.user.name);
            return userProfile;
        }
        // Fallback to JSON file
        const response = await fetch('user-profile.json');
        userProfile = await response.json();
        // Save to localStorage for future use
        const userDataToSave = {
            name: userProfile.user.name,
            profilePicture: userProfile.user.profilePicture,
            password: '312007'
        };
        localStorage.setItem('user-data', JSON.stringify(userDataToSave));
        console.log('✅ User profile loaded from JSON and saved to localStorage:', userProfile.user.name);
        return userProfile;
    } catch (error) {
        console.warn('⚠️ Could not load user profile:', error);
        // Fallback profile
        userProfile = {
            user: {
                name: 'Keira Mayhew',
                profilePicture: 'images/profile.png'
            }
        };
        // Save fallback to localStorage
        const fallbackData = {
            name: 'Keira Mayhew',
            profilePicture: 'images/profile.png',
            password: '312007'
        };
        localStorage.setItem('user-data', JSON.stringify(fallbackData));
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
function loadSavedWallpaper() {
    const savedWallpaper = localStorage.getItem('desktop-wallpaper');
    if (savedWallpaper) {
        updateDesktopWallpaper(savedWallpaper);
    } else {
        // Use default wallpaper.jpg
        updateDesktopWallpaper('images/wallpaper.jpg');
    }
}
function updateDesktopWallpaper(wallpaperUrl) {
    console.log('🖼️ Updating desktop wallpaper to:', wallpaperUrl);
    
    // Update the desktop background only (not the screensaver)
    const desktopBackground = document.querySelector('.desktop-background');
    const desktopBackgroundById = document.getElementById('desktopBackground');
    
    if (desktopBackground) {
        desktopBackground.style.backgroundImage = `url('${wallpaperUrl}')`;
        console.log('✅ Updated .desktop-background element');
    }
    
    if (desktopBackgroundById) {
        desktopBackgroundById.style.backgroundImage = `url('${wallpaperUrl}')`;
        console.log('✅ Updated #desktopBackground element');
    }
    
    // Fallback: also try to update the desktop element itself
    const desktop = document.querySelector('.desktop');
    if (desktop && !desktopBackground && !desktopBackgroundById) {
        desktop.style.backgroundImage = `url('${wallpaperUrl}')`;
        console.log('✅ Updated .desktop element as fallback');
    }
    
    if (!desktopBackground && !desktopBackgroundById && !desktop) {
        console.warn('⚠️ No desktop background element found to update');
    }
}
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
    // Logout is handled by TaskbarManager; no global handler here.
}
function setupTaskbarPositionWatcher() {
    const taskbar = document.getElementById('taskbar');
    if (!taskbar) return;
    let lastTaskbarPosition = getCurrentTaskbarPosition();
    // Utiliser MutationObserver pour détecter les changements de classe
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const newPosition = getCurrentTaskbarPosition();
                if (newPosition !== lastTaskbarPosition) {
                    console.log(`🔄 Taskbar moved from ${lastTaskbarPosition} to ${newPosition}`);
                    lastTaskbarPosition = newPosition;
                    // Recalculer la grille et repositionner les icônes
                    setTimeout(() => {
                        loadDesktopItems();
                    }, 100);
                }
            }
        });
    });
    observer.observe(taskbar, {
        attributes: true,
        attributeFilter: ['class']
    });
}
function getCurrentTaskbarPosition() {
    const taskbar = document.getElementById('taskbar');
    if (!taskbar) return 'bottom';
    const classList = Array.from(taskbar.classList);
    const positionClass = classList.find(cls => cls.startsWith('position-'));
    return positionClass ? positionClass.replace('position-', '') : 'bottom';
}
function logout() {
    console.log('🚪 Logging out...');
    const fadeOverlay = document.getElementById('fadeOverlay');
    const settingsPanel = document.getElementById('settingsPanel');

    // Close start menu
    if (settingsPanel) settingsPanel.classList.remove('active');

    // Close all open windows
    if (window.windowManager) {
        for (const [id] of window.windowManager.windows) {
            window.windowManager.closeWindow(id);
        }
    }

    // Mark session as logged-out so index.html knows to show login
    sessionStorage.removeItem('authenticated');

    // Fade to black then redirect
    fadeOverlay.className = 'fade-to-black';
    setTimeout(() => fadeOverlay.classList.add('active'), 50);
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1500);
}
const taskbarManager = new TaskbarManager();
window.taskbarManager = taskbarManager; // Make it globally accessible

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Starting application...');
    
    // Check if we're in desktop mode (has desktop element) or login mode (has login screen)
    const isDesktopMode = document.getElementById('desktop') !== null;
    const isLoginMode = document.getElementById('loginScreen') !== null;
    
    if (isDesktopMode) {
        // Desktop mode initialization
        console.log('🖥️ Initializing desktop mode...');
        
        // Initialize taskbar manager properly
        taskbarManager.loadSettings();
        taskbarManager.init();
        taskbarManager.enableZIndexProtection();
        
        // Initialize app launcher
        await window.appLauncher.init();
        // Load apps for taskbar and start menu AFTER app launcher is initialized
        await loadApps();
        // Load user profile first
        await loadUserProfile();
        
        // Update user interface elements
        updateUserInterface();
        // Start time updates
        updateDesktopTime();
        setInterval(updateDesktopTime, 1000);
        
        // Load desktop items
        await loadDesktopItems();
        
        // FORCE wallpaper loading after everything is ready
        setTimeout(() => {
            loadSavedWallpaper();
            console.log('🖼️ Forced wallpaper reload after desktop initialization');
        }, 500);
        
        console.log('✅ Desktop mode initialized successfully');
        
    } else if (isLoginMode) {
        // Login mode initialization
        console.log('🔐 Initializing login mode...');
        
        const images = await loadImages();
        if (images.length > 0) {
            createIndicators();
            changeToImage(0);
            startAutoChange();
            setupEventListeners();
            console.log('✅ Login mode initialized successfully');
        } else {
            console.error('❌ No images found!');
            const background = document.getElementById('background');
            if (background) {
                background.style.backgroundColor = '#1a1a1a';
                background.style.display = 'flex';
                background.style.alignItems = 'center';
                background.style.justifyContent = 'center';
                background.innerHTML = '<div style="color: white; text-align: center; font-size: 1.2em;"><h2>No Images Found</h2><p>Please add images to the <strong>Images/BG/</strong> folder</p></div>';
            }
        }
    } else {
        console.warn('⚠️ Unknown page context - neither desktop nor login mode detected');
    }
});
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
    const targetRow = Math.round((y - currentGridConfig.paddingY) / currentGridConfig.cellHeight);
    const clampedCol = Math.max(0, Math.min(targetCol, currentGridConfig.cols - 1));
    const clampedRow = Math.max(0, Math.min(targetRow, currentGridConfig.rows - 1));
    console.log(`🔧 Target: (${x},${y}) -> Grid(${targetRow},${targetCol}) -> Clamped(${clampedRow},${clampedCol}) | MaxRows: ${currentGridConfig.rows}, TaskbarPos: ${currentGridConfig.taskbarPosition}`);
    // Vérifier s'il y a une icône à cette position
    const occupyingIcon = getIconAtPosition(clampedRow, clampedCol);
    if (occupyingIcon && occupyingIcon !== draggedIcon) {
        // Échanger les positions
        swapIconPositions(draggedIcon, occupyingIcon);
        return getGridCoordinates(clampedRow, clampedCol);
    } else if (!occupyingIcon) {
        // Position libre, placer normalement
        return getGridCoordinates(clampedRow, clampedCol);
    }
    // Si c'est la même position, ne rien changer
    return getGridCoordinates(clampedRow, clampedCol);
}
function getIconAtPosition(row, col) {
    const icons = document.querySelectorAll('.desktop-item');
    for (const icon of icons) {
        if (icon === draggedIcon) continue;
        if (parseInt(icon.dataset.gridRow) === row && parseInt(icon.dataset.gridCol) === col) {
            return icon;
        }
    }
    return null;
}
function swapIconPositions(icon1, icon2) {
    // Sauvegarder les positions actuelles
    const icon1Row = parseInt(icon1.dataset.gridRow);
    const icon1Col = parseInt(icon1.dataset.gridCol);
    const icon1Coords = getGridCoordinates(icon1Row, icon1Col);
    const icon2Row = parseInt(icon2.dataset.gridRow);
    const icon2Col = parseInt(icon2.dataset.gridCol);
    const icon2Coords = getGridCoordinates(icon2Row, icon2Col);
    // Déplacer icon2 vers la position d'icon1
    icon2.style.left = `${icon1Coords.x}px`;
    icon2.style.top = `${icon1Coords.y}px`;
    icon2.dataset.gridRow = icon1Row;
    icon2.dataset.gridCol = icon1Col;
    // icon1 sera déplacé vers la position d'icon2 par l'appelant
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
        y: currentGridConfig.paddingY + (row * currentGridConfig.cellHeight),
        row: row,
        col: col
    };
}
