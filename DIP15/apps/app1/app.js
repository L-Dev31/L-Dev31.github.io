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
                this.directoryFetcher = new DirectoryFetcher();
                
                if (options.appsData) {
                    this.directoryFetcher.setAppsData(options.appsData);
                }
                
                window.filesAppInstance = this;
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
                await this.navigate(path);
                return;
            }

            const content = await this.createFileManagerContent();
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

            this.setupEventListeners();
            await this.updateContent();
            console.log('✅ Files app opened successfully');
        }

        async createFileManagerContent() {
            return `
                <div class="files-container">
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
                            <button id="filesRefreshBtn" class="files-nav-btn" title="Refresh">
                                <i class="fas fa-sync-alt"></i>
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

            element.querySelector('#filesBackBtn')?.addEventListener('click', () => this.goBack());
            element.querySelector('#filesForwardBtn')?.addEventListener('click', () => this.goForward());
            element.querySelector('#filesUpBtn')?.addEventListener('click', () => this.goUp());
            element.querySelector('#filesRefreshBtn')?.addEventListener('click', () => this.refreshContent());
            element.querySelector('#filesGridViewBtn')?.addEventListener('click', () => this.setView('grid'));
            element.querySelector('#filesListViewBtn')?.addEventListener('click', () => this.setView('list'));

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

            element.querySelector('#filesGrid')?.addEventListener('dblclick', async (e) => {
                const fileItem = e.target.closest('.files-item');
                if (fileItem) {
                    const itemName = fileItem.dataset.name;
                    const itemType = fileItem.dataset.type;
                    
                    if (itemType === 'file') {
                        await this.openFile(itemName);
                    } else if (itemType === 'app') {
                        const items = await this.getFolderContent(this.currentPath);
                        const appItem = items.find(i => i.name === itemName);
                        if (appItem && window.appLauncher) {
                            window.appLauncher.launchApp(appItem.appId || appItem.id);
                        }
                    }
                }
            });

            element.querySelector('.files-address-bar')?.addEventListener('click', async (e) => {
                const pathSegment = e.target.closest('.files-path-segment');
                if (pathSegment && pathSegment.dataset.path) {
                    await this.navigate(pathSegment.dataset.path);
                }
            });
        }

        async navigate(path) {
            this.currentPath = path;
            
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            this.history.push(path);
            this.historyIndex = this.history.length - 1;
            
            await this.updateContent();
            this.updateNavigation();
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
                await this.navigate('Home');
            }
        }

        async refreshContent() {
            const refreshBtn = document.querySelector('#filesRefreshBtn');
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                refreshBtn.disabled = true;
            }
            
            await this.updateContent();
            
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                refreshBtn.disabled = false;
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
                listBtn.classList.add('active');
                gridBtn.classList.remove('active');
            } else {
                filesGrid.classList.remove('list-view');
                gridBtn.classList.add('active');
                listBtn.classList.remove('active');
            }
        }

        async updateContent() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;
            
            const filesGrid = window.element.querySelector('#filesGrid');
            if (!filesGrid) return;
            
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
                
                if (this.windowManager) {
                    this.windowManager.updateFooter(this.windowId, this.getFooterText());
                }
                
            } catch (error) {
                console.error('Error loading folder content:', error);
                filesGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: rgba(255,0,0,0.6);"><i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i><br>Error loading folder contents</div>';
            }
            
            if (this.windowManager) {
                const windowObj = this.windowManager.getWindow(this.windowId);
                if (windowObj) {
                    const titleEl = windowObj.element.querySelector('.window-title');
                    if (titleEl) {
                        titleEl.textContent = `Files - ${this.currentPath}`;
                    }
                }
            }
        }

        async getFolderContent(folderName) {
            if (folderName === 'Home') {
                return this.getHomeContent();
            }
            
            try {
                const items = await this.directoryFetcher.fetchDirectoryContents(folderName);
                return items;
            } catch (error) {
                console.warn(`Could not fetch contents for ${folderName}:`, error);
                return [];
            }
        }

        getHomeContent() {
            const homeContent = [];
            
            const realFolders = ['Documents', 'Pictures', 'Downloads', 'Projects', 'Music', 'Videos'];
            realFolders.forEach(folderName => {
                homeContent.push({
                    name: folderName,
                    type: 'folder',
                    icon: 'images/folder.png'
                });
            });
            
            if (window.desktopData && window.desktopData.desktopItems) {
                window.desktopData.desktopItems.forEach(item => {
                    if (item.type === 'app') {
                        homeContent.push({
                            name: item.name,
                            type: item.type,
                            icon: item.icon,
                            appId: item.appId || item.id
                        });
                    }
                });
            } else {
                homeContent.push(
                    { name: 'Prism', type: 'app', icon: 'images/app5.png', appId: 'app5' },
                    { name: 'Scaffold', type: 'app', icon: 'images/app7.png', appId: 'app7' },
                    { name: 'Schedule', type: 'app', icon: 'images/app9.png', appId: 'app9' },
                    { name: 'Avokadoo', type: 'app', icon: 'images/app10.png', appId: 'app10' }
                );
            }

            return homeContent;
        }

        getFooterText() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return '';
            
            const container = window.element.querySelector('.files-grid');
            if (!container) return '';
            
            const items = container.querySelectorAll('.files-item');
            const itemCount = items.length;
            
            if (itemCount === 0) {
                return 'Empty folder';
            } else if (itemCount === 1) {
                return '1 item';
            } else {
                return `${itemCount} items`;
            }
        }

        updateNavigation() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const backBtn = window.element.querySelector('#filesBackBtn');
            const forwardBtn = window.element.querySelector('#filesForwardBtn');
            const upBtn = window.element.querySelector('#filesUpBtn');
            
            if (backBtn) backBtn.disabled = this.historyIndex <= 0;
            if (forwardBtn) forwardBtn.disabled = this.historyIndex >= this.history.length - 1;
            if (upBtn) upBtn.disabled = this.currentPath === 'Home';
            
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
            const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];
            const textExtensions = ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'log'];
            
            if (audioExtensions.includes(fileExtension)) {
                // Open with Prism music player
                if (window.appLauncher) {
                    await window.appLauncher.launchApp('app5', { 
                        fileName: fileName,
                        filePath: `home/${this.currentPath}/${fileName}`.replace('//', '/')
                    });
                }
            } else if (textExtensions.includes(fileExtension)) {
                // Open with Notes app
                if (window.appLauncher) {
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
            } else {
                console.log(`File type .${fileExtension} not supported for opening`);
            }
        }

        close() {
            if (this.windowId && this.windowManager) {
                this.windowManager.closeWindow(this.windowId);
            }
            
            if (window.filesAppInstance === this) {
                window.filesAppInstance = null;
            }
            
            console.log('📁 Files app closed');
        }
    }

    window.FilesApp = FilesApp;
}

