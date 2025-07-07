if (typeof FilesApp === 'undefined') {
    class FilesApp {
        constructor() {
            this.windowId = null;
            this.currentPath = 'Home';
            this.history = ['Home'];
            this.historyIndex = 0;
        this.directoryFetcher = null;
        this.windowManager = null;
        this.appConfig = null;
    }

    async init(options = {}) {
        try {
            this.windowManager = options.windowManager;
            this.appConfig = options.appConfig;
            
            // Initialize DirectoryFetcher
            this.directoryFetcher = new DirectoryFetcher();
            
            // Set apps data if provided
            if (options.appsData) {
                this.directoryFetcher.setAppsData(options.appsData);
            }
            
            // Store global reference for window manager
            window.filesAppInstance = this;
            
            // Open the window
            await this.open(options.path || 'Home');
            
            console.log('✅ Files app initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Files app:', error);
            return false;
        }
    }

    async open(path = 'Home') {
        if (this.windowId && this.windowManager) {
            // Window already exists, just navigate
            await this.navigate(path);
            return;
        }

        // Create the main content
        const content = await this.createFileManagerContent();
        
        // Create window
        const windowObj = this.windowManager.createWindow({
            id: `files-${Date.now()}`,
            title: 'Files',
            width: 900,
            height: 600,
            icon: this.appConfig?.icon || 'images/app1.png',
            appId: this.appConfig?.id || 'app1',
            content: content,
            footerText: this.getFooterText(),
            className: 'files-app-window'
        });

        this.windowId = windowObj.id;
        this.currentPath = path;
        this.history = [path];
        this.historyIndex = 0;

        // Setup app-specific event listeners
        this.setupEventListeners();
        
        // Add refresh button
        await this.toggleDetectionMode();
        
        // Load initial content
        await this.updateContent();
    }

    async createFileManagerContent() {
        return `
            <div class="files-container">
                <!-- Toolbar -->
                <div class="files-toolbar">
                    <div class="files-nav-buttons">
                        <button id="filesBackBtn" class="files-nav-btn" title="Back">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <button id="filesForwardBtn" class="files-nav-btn" title="Forward">
                            <i class="fas fa-arrow-right"></i>
                        </button>
                        <button id="filesUpBtn" class="files-nav-btn" title="Up">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                    </div>
                    
                    <div class="files-address-bar">
                        <span class="files-path-segment" data-path="Home">Home</span>
                    </div>
                    
                    <div class="files-view-buttons">
                        <button id="filesGridViewBtn" class="files-view-btn active" title="Grid View">
                            <i class="fas fa-th-large"></i>
                        </button>
                        <button id="filesListViewBtn" class="files-view-btn" title="List View">
                            <i class="fas fa-list"></i>
                        </button>
                    </div>
                </div>

                <!-- Content Area -->
                <div class="files-content">
                    <div id="filesGrid" class="files-grid">
                        <!-- Files will be loaded here -->
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;

        // Toolbar buttons
        element.querySelector('#filesBackBtn')?.addEventListener('click', () => this.goBack());
        element.querySelector('#filesForwardBtn')?.addEventListener('click', () => this.goForward());
        element.querySelector('#filesUpBtn')?.addEventListener('click', () => this.goUp());
        element.querySelector('#filesGridViewBtn')?.addEventListener('click', () => this.setView('grid'));
        element.querySelector('#filesListViewBtn')?.addEventListener('click', () => this.setView('list'));

        // File item clicks
        element.querySelector('#filesGrid')?.addEventListener('click', async (e) => {
            const fileItem = e.target.closest('.files-item');
            if (fileItem) {
                const itemName = fileItem.dataset.name;
                const itemType = fileItem.dataset.type;
                
                if (itemType === 'folder') {
                    await this.navigate(itemName);
                }
            }
        });

        // File item double-clicks
        element.querySelector('#filesGrid')?.addEventListener('dblclick', async (e) => {
            const fileItem = e.target.closest('.files-item');
            if (fileItem) {
                const itemName = fileItem.dataset.name;
                const itemType = fileItem.dataset.type;
                
                console.log(`🔍 Double-click on item: ${itemName} (type: ${itemType})`);
                
                if (itemType === 'file') {
                    // Use Universal Launcher for file opening
                    if (window.universalLauncher) {
                        const item = { name: itemName, type: 'file' };
                        const launchItem = window.universalLauncher.createLaunchItem(item);
                        console.log('🚀 Launching file with Universal Launcher:', launchItem);
                        await window.universalLauncher.launch(launchItem, { 
                            basePath: 'home',
                            currentPath: this.currentPath === 'Home' ? '' : this.currentPath
                        });
                    } else {
                        // Fallback to old system
                        console.log('🔧 Using fallback file opening system');
                        await this.openFile(itemName);
                    }
                } else if (itemType === 'app') {
                    // Use Universal Launcher for app opening
                    if (window.universalLauncher) {
                        // Find the app data from the current items
                        const items = await this.getFolderContent(this.currentPath);
                        const appItem = items.find(i => i.name === itemName);
                        console.log('🔍 Found app item:', appItem);
                        if (appItem) {
                            const launchItem = window.universalLauncher.createLaunchItem(appItem);
                            console.log('🚀 Launching app with Universal Launcher:', launchItem);
                            await window.universalLauncher.launch(launchItem);
                        } else {
                            console.warn('❌ App item not found in current folder content');
                        }
                    } else {
                        // Fallback - need to find app ID
                        console.log('🔧 Using fallback app opening system');
                        const items = await this.getFolderContent(this.currentPath);
                        const appItem = items.find(i => i.name === itemName);
                        if (appItem && (appItem.appId || appItem.id)) {
                            console.log('🚀 Launching app with fallback:', appItem.appId || appItem.id);
                            window.appLauncher.launchApp(appItem.appId || appItem.id);
                        } else {
                            console.warn('❌ App item not found or missing ID');
                        }
                    }
                } else {
                    console.log(`ℹ️ Unknown item type: ${itemType}, attempting to handle as generic item`);
                    // Try to handle as generic item
                    if (window.universalLauncher) {
                        const items = await this.getFolderContent(this.currentPath);
                        const item = items.find(i => i.name === itemName);
                        if (item) {
                            const launchItem = window.universalLauncher.createLaunchItem(item);
                            console.log('🚀 Launching generic item with Universal Launcher:', launchItem);
                            await window.universalLauncher.launch(launchItem);
                        }
                    }
                }
            }
        });

        // Path navigation
        element.querySelector('.files-address-bar')?.addEventListener('click', async (e) => {
            const pathSegment = e.target.closest('.files-path-segment');
            if (pathSegment && pathSegment.dataset.path) {
                await this.navigate(pathSegment.dataset.path);
            }
        });
    }

    async navigate(path) {
        this.currentPath = path;
        
        // Add to history if navigating forward
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(path);
        this.historyIndex = this.history.length - 1;
        
        // Update content and navigation
        await this.updateContent();
        this.updateNavigation();
    }

    close() {
        if (this.windowId && this.windowManager) {
            this.windowManager.closeWindow(this.windowId);
        }
        
        // Clean up global reference
        if (window.filesAppInstance === this) {
            window.filesAppInstance = null;
        }
        
        console.log('📁 Files app closed');
    }

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
    }

    async goBack() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.currentPath = this.history[this.historyIndex];
            await this.updateContent();
            this.updateNavigation();
        }
    }

    async goForward() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.currentPath = this.history[this.historyIndex];
            await this.updateContent();
            this.updateNavigation();
        }
    }

    async goUp() {
        if (this.currentPath !== 'Home') {
            await this.navigateTo('Home');
        }
    }

    setView(viewType) {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;
        
        const filesGrid = window.element.querySelector('#filesGrid');
        const gridBtn = window.element.querySelector('#filesGridViewBtn');
        const listBtn = window.element.querySelector('#filesListViewBtn');
        
        if (!filesGrid || !gridBtn || !listBtn) return;
        
        if (viewType === 'list') {
            filesGrid.classList.add('list-view');
            listBtn.style.background = 'rgba(0, 120, 212, 0.2)';
            gridBtn.style.background = 'rgba(0, 0, 0, 0.05)';
        } else {
            filesGrid.classList.remove('list-view');
            gridBtn.style.background = 'rgba(0, 120, 212, 0.2)';
            listBtn.style.background = 'rgba(0, 0, 0, 0.05)';
        }
    }

    async updateContent() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;
        
        const filesGrid = window.element.querySelector('#filesGrid');
        if (!filesGrid) return;
        
        // Show loading state
        filesGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(0,0,0,0.6);">Loading...</div>';
        
        try {
            const items = await this.getFolderContent(this.currentPath);
            
            filesGrid.innerHTML = '';
            
            if (items.length === 0) {
                filesGrid.innerHTML = '<div class="files-grid-empty-message"><i class="fas fa-folder-open"></i><div>This folder is empty</div></div>';
            } else {
                items.forEach(item => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'files-item';
                    fileItem.dataset.name = item.name;
                    fileItem.dataset.type = item.type;
                    
                    const iconHtml = item.icon.includes('images/') 
                        ? `<img src="${item.icon}" alt="${item.name}">`
                        : `<i class="${item.icon}"></i>`;
                    
                    fileItem.innerHTML = `
                        <div class="files-item-icon">${iconHtml}</div>
                        <div class="files-item-name">${item.name}</div>
                    `;
                    
                    filesGrid.appendChild(fileItem);
                });
            }
            
            // Update footer with item count
            if (this.windowManager) {
                this.windowManager.updateFooter(this.windowId, this.getFooterText());
            }
            
        } catch (error) {
            console.error('Error loading folder content:', error);
            filesGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: rgba(255,0,0,0.6);"><i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i><br>Error loading folder contents</div>';
            if (this.windowManager) {
                this.windowManager.updateFooter(this.windowId, this.getFooterText());
            }
        }
        
        // Update window title
        if (this.windowManager) {
            const windowObj = this.windowManager.getWindow(this.windowId);
            if (windowObj) {
                const titleEl = windowObj.element.querySelector('.window-title');
                if (titleEl) {
                    titleEl.textContent = `Files - ${this.currentPath}`;
                }
            }
        }
        
        // Force layout recalculation to prevent visual glitches
        setTimeout(() => this.forceLayoutRecalc(), 50);
    }

    forceLayoutRecalc() {
        console.log("Files app: Forcing layout recalc.");
        const windowObj = this.windowManager.getWindow(this.windowId);
        if (!windowObj || !windowObj.element) {
            console.warn("Cannot force layout recalc, window element not found.");
            return;
        }

        const filesContent = windowObj.element.querySelector('.files-content');
        if (!filesContent) {
            console.warn("Cannot force layout recalc, .files-content not found.");
            return;
        }

        // DRASTIC MEASURES: Force absolute layout stability
        try {
            // Store current dimensions
            const currentHeight = filesContent.offsetHeight;
            const currentWidth = filesContent.offsetWidth;
            
            // Force reflow with absolutely stable dimensions
            filesContent.style.minHeight = `${Math.max(currentHeight, 300)}px`;
            filesContent.style.width = `${currentWidth}px`;
            
            // Force layout recalculation
            filesContent.style.display = 'none';
            void filesContent.offsetHeight; // Force synchronous reflow
            filesContent.style.display = '';
            
            // Reset to flexible dimensions after forced reflow
            setTimeout(() => {
                filesContent.style.minHeight = '300px';
                filesContent.style.width = '';
            }, 50);
            
            // Dispatch resize event to ensure all components update
            setTimeout(() => {
                if (window.top && window.top.dispatchEvent) {
                    window.top.dispatchEvent(new Event('resize'));
                } else if (window.dispatchEvent) {
                    window.dispatchEvent(new Event('resize'));
                }
            }, 100);
            
        } catch (error) {
            console.warn("Error during layout recalc:", error);
        }
    }

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
    }

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
    }

    // Method to get footer text (required by WindowManager)
    getFooterText() {
        return this.updateFooterText();
    }

    // Method to update footer text with current directory info
    updateFooterText() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return '';
        
        const container = window.element.querySelector('.files-grid');
        if (!container) return '';
        
        const items = container.querySelectorAll('.files-item');
        const itemCount = items.length;
        
        let footerText = '';
        if (itemCount === 0) {
            footerText = 'Empty folder';
        } else if (itemCount === 1) {
            footerText = '1 item';
        } else {
            footerText = `${itemCount} items`;
        }
        
        // Add detection mode indicator
        footerText += ' • Auto-detection enabled';
        
        return footerText;
    }

    updateNavigation() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        // Update toolbar buttons
        const backBtn = window.element.querySelector('#filesBackBtn');
        const forwardBtn = window.element.querySelector('#filesForwardBtn');
        const upBtn = window.element.querySelector('#filesUpBtn');
        
        if (backBtn) backBtn.disabled = this.historyIndex <= 0;
        if (forwardBtn) forwardBtn.disabled = this.historyIndex >= this.history.length - 1;
        if (upBtn) upBtn.disabled = this.currentPath === 'Home';
        
        // Update address bar
        const addressBar = window.element.querySelector('.files-address-bar');
        if (addressBar) {
            if (this.currentPath === 'Home') {
                addressBar.innerHTML = '<span class="files-path-segment active" data-path="Home">Home</span>';
            } else {
                addressBar.innerHTML = `
                    <span class="files-path-segment" data-path="Home">Home</span>
                    <span class="files-path-separator">/</span>
                    <span class="files-path-segment active" data-path="${this.currentPath}">${this.currentPath}</span>
                `;
            }
        }
    }

    async openFile(fileName) {
        const fileExtension = fileName.split('.').pop().toLowerCase();
        const textExtensions = ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'log'];
        
        if (textExtensions.includes(fileExtension)) {
            try {
                // Launch Notes app with the file content
                if (window.appLauncher) {
                    // Read file content if it's a real file
                    let content = '';
                    try {
                        const filePath = `home/${this.currentPath}/${fileName}`.replace('//', '/');
                        const response = await fetch(filePath);
                        if (response.ok) {
                            content = await response.text();
                        }
                    } catch (error) {
                        console.warn('Could not read file content:', error);
                        content = `# ${fileName}\n\nFile content could not be loaded.`;
                    }
                    
                    await window.appLauncher.launchApp('app3', { 
                        fileName: fileName,
                        content: content 
                    });
                }
            } catch (error) {
                console.error('Error opening file:', error);
            }
        } else {
            console.log(`File type .${fileExtension} not supported for opening`);
        }
    }

    // Method to refresh directory content with automatic detection
    async refreshContent() {
        console.log('🔄 Refreshing directory content...');
        
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;
        
        const refreshBtn = window.element.querySelector('#refreshBtn');
        const filesGrid = window.element.querySelector('#filesGrid');
        
        // Show loading state
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        
        if (filesGrid) {
            filesGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(0,0,0,0.6);"><i class="fas fa-spinner fa-spin"></i><br>Auto-detecting files...</div>';
        }
        
        try {
            await this.updateContent();
            this.forceLayoutRecalc();
            
            // Success feedback
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                    refreshBtn.disabled = false;
                }, 1000);
            }
        } catch (error) {
            console.error('Error refreshing content:', error);
            
            // Error feedback
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                setTimeout(() => {
                    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                    refreshBtn.disabled = false;
                }, 2000);
            }
        }
    }

    // Method to toggle between automatic detection and fallback
    async toggleDetectionMode() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;
        
        // Add a refresh button to the toolbar if it doesn't exist
        const toolbar = window.element.querySelector('.files-toolbar');
        if (toolbar && !toolbar.querySelector('#refreshBtn')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'refreshBtn';
            refreshBtn.className = 'files-nav-btn';
            refreshBtn.title = 'Refresh (Auto-detect files)';
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            refreshBtn.addEventListener('click', () => this.refreshContent());
            
            const navButtons = toolbar.querySelector('.files-nav-buttons');
            if (navButtons) {
                navButtons.appendChild(refreshBtn);
            }
        }
    }
}

// Export for global use
window.FilesApp = FilesApp;

// Close the conditional block
}
