// ======================================
// FILES APP - MODULAR JAVASCRIPT
// ======================================

class FilesApp {
    constructor() {
        this.isOpen = false;
        this.currentPath = 'Home';
        this.history = ['Home'];
        this.historyIndex = 0;
        this.isMaximized = false;
        this.originalBounds = { top: 100, left: 200, width: 800, height: 600 };
        this.directoryFetcher = null;
        this.appElement = null;
    }

    async init() {
        try {
            // Load HTML template
            const templateResponse = await fetch('apps/app1/template.html');
            const templateHTML = await templateResponse.text();
            
            // Load CSS
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = 'apps/app1/style.css';
            document.head.appendChild(cssLink);
            
            // Add HTML to body
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = templateHTML;
            this.appElement = tempDiv.firstElementChild;
            document.body.appendChild(this.appElement);
            
            // Initialize DirectoryFetcher
            this.directoryFetcher = new DirectoryFetcher();
            
            // Setup event listeners
            this.setupEventListeners();
            this.makeWindowDraggable();
            this.makeWindowResizable();
            this.setupWindowResizeListener();
            
            console.log('✅ Files app initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Files app:', error);
            return false;
        }
    }

    setupEventListeners() {
        // Window controls
        document.getElementById('filesClose').addEventListener('click', () => this.close());
        document.getElementById('filesMinimize').addEventListener('click', () => this.minimize());
        document.getElementById('filesMaximize').addEventListener('click', () => this.toggleMaximize());

        // Toolbar buttons
        document.getElementById('filesBackBtn').addEventListener('click', () => this.goBack());
        document.getElementById('filesForwardBtn').addEventListener('click', () => this.goForward());
        document.getElementById('filesUpBtn').addEventListener('click', () => this.goUp());
        document.getElementById('filesGridViewBtn').addEventListener('click', () => this.setView('grid'));
        document.getElementById('filesListViewBtn').addEventListener('click', () => this.setView('list'));

        // File item clicks
        document.getElementById('filesGrid').addEventListener('click', async (e) => {
            const fileItem = e.target.closest('.files-item');
            if (fileItem) {
                const itemName = fileItem.dataset.name;
                const itemType = fileItem.dataset.type;
                
                if (itemType === 'folder') {
                    await this.navigateTo(itemName);
                }
            }
        });

        // Path navigation
        document.querySelector('.files-address-bar').addEventListener('click', async (e) => {
            const pathSegment = e.target.closest('.files-path-segment');
            if (pathSegment && pathSegment.dataset.path) {
                await this.navigateTo(pathSegment.dataset.path);
            }
        });
    }

    async open(path = 'Home') {
        if (this.isOpen) {
            await this.navigateTo(path);
            return;
        }

        this.isOpen = true;
        this.currentPath = path;
        this.history = [path];
        this.historyIndex = 0;

        this.appElement.classList.add('active');
        
        await this.updateContent();
        this.updateNavigation();
    }

    close() {
        this.isOpen = false;
        this.appElement.classList.remove('active');
    }

    minimize() {
        this.appElement.style.transform = 'scale(0.1)';
        this.appElement.style.opacity = '0';
        
        setTimeout(() => {
            this.appElement.style.display = 'none';
        }, 300);
    }

    toggleMaximize() {
        if (!this.isMaximized) {
            // Store original bounds
            const rect = this.appElement.getBoundingClientRect();
            this.originalBounds = {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height
            };
            
            // Get taskbar position and calculate available space
            const taskbar = document.getElementById('taskbar');
            const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : null;
            const taskbarPosition = taskbar ? Array.from(taskbar.classList).find(cls => cls.startsWith('position-')) : 'position-bottom';
            
            let top = 0, left = 0, width = window.innerWidth, height = window.innerHeight;
            
            if (taskbarRect) {
                switch (taskbarPosition) {
                    case 'position-top':
                        top = taskbarRect.height;
                        height = window.innerHeight - taskbarRect.height;
                        break;
                    case 'position-bottom':
                    case undefined: // default to bottom
                        height = window.innerHeight - taskbarRect.height;
                        break;
                    case 'position-left':
                        left = taskbarRect.width;
                        width = window.innerWidth - taskbarRect.width;
                        break;
                    case 'position-right':
                        width = window.innerWidth - taskbarRect.width;
                        break;
                }
            }
            
            // Maximize within available space
            this.appElement.style.top = top + 'px';
            this.appElement.style.left = left + 'px';
            this.appElement.style.width = width + 'px';
            this.appElement.style.height = height + 'px';
            this.appElement.style.borderRadius = '0';
            
            // Add maximized class to remove shadow
            this.appElement.classList.add('maximized');
            
            // Hide resize handle when maximized
            const resizeHandle = document.getElementById('filesResizeHandle');
            if (resizeHandle) {
                resizeHandle.style.display = 'none';
            }
            
            this.isMaximized = true;
            document.getElementById('filesMaximize').innerHTML = '<i class="fas fa-clone"></i>';
        } else {
            // Restore
            this.appElement.style.top = this.originalBounds.top + 'px';
            this.appElement.style.left = this.originalBounds.left + 'px';
            this.appElement.style.width = this.originalBounds.width + 'px';
            this.appElement.style.height = this.originalBounds.height + 'px';
            this.appElement.style.borderRadius = '12px';
            
            // Remove maximized class to restore shadow
            this.appElement.classList.remove('maximized');
            
            // Show resize handle when not maximized
            const resizeHandle = document.getElementById('filesResizeHandle');
            if (resizeHandle) {
                resizeHandle.style.display = 'block';
            }
            
            this.isMaximized = false;
            document.getElementById('filesMaximize').innerHTML = '<i class="fas fa-square"></i>';
        }
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
        const filesGrid = document.getElementById('filesGrid');
        const gridBtn = document.getElementById('filesGridViewBtn');
        const listBtn = document.getElementById('filesListViewBtn');
        
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
        const filesGrid = document.getElementById('filesGrid');
        
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
            
            // Update item count
            document.getElementById('filesItemCount').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
            
        } catch (error) {
            console.error('Error loading folder content:', error);
            filesGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: rgba(255,0,0,0.6);"><i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i><br>Error loading folder contents</div>';
        }
        
        // Update window title
        document.getElementById('filesTitle').textContent = this.currentPath;
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

    updateNavigation() {
        // Update toolbar buttons
        document.getElementById('filesBackBtn').disabled = this.historyIndex <= 0;
        document.getElementById('filesForwardBtn').disabled = this.historyIndex >= this.history.length - 1;
        document.getElementById('filesUpBtn').disabled = this.currentPath === 'Home';
        
        // Update address bar
        const currentPathSpan = document.getElementById('filesCurrentPath');
        if (this.currentPath === 'Home') {
            currentPathSpan.textContent = '';
            currentPathSpan.style.display = 'none';
            document.querySelector('.files-path-separator').style.display = 'none';
        } else {
            currentPathSpan.textContent = this.currentPath;
            currentPathSpan.style.display = 'inline';
            document.querySelector('.files-path-separator').style.display = 'inline';
        }
    }

    makeWindowDraggable() {
        const header = document.getElementById('filesHeader');
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        let animationFrame = null;
        let currentPosition = { x: 0, y: 0 };

        header.addEventListener('mousedown', (e) => {
            if (this.isMaximized) return;
            
            isDragging = true;
            const rect = this.appElement.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            // Add cursor style for better UX
            document.body.style.cursor = 'move';
            header.style.cursor = 'move';
            
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', stopDrag);
            e.preventDefault();
        });

        const handleDrag = (e) => {
            if (!isDragging) return;
            
            currentPosition.x = e.clientX - dragOffset.x;
            currentPosition.y = e.clientY - dragOffset.y;
            
            // Cancel previous animation frame
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
            
            // Use requestAnimationFrame for smooth movement
            animationFrame = requestAnimationFrame(() => {
                const newX = Math.max(0, Math.min(currentPosition.x, window.innerWidth - 200));
                const newY = Math.max(0, Math.min(currentPosition.y, window.innerHeight - 100));
                
                this.appElement.style.left = newX + 'px';
                this.appElement.style.top = newY + 'px';
            });
        };

        const stopDrag = () => {
            isDragging = false;
            
            // Reset cursor
            document.body.style.cursor = '';
            header.style.cursor = '';
            
            // Cancel any pending animation frame
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            
            document.removeEventListener('mousemove', handleDrag);
            document.removeEventListener('mouseup', stopDrag);
        };
    }

    makeWindowResizable() {
        const resizeHandle = document.getElementById('filesResizeHandle');
        let isResizing = false;

        resizeHandle.addEventListener('mousedown', (e) => {
            // Resize handle should be invisible when maximized, but just in case
            if (this.isMaximized) return;
            
            isResizing = true;
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        });

        const handleResize = (e) => {
            if (!isResizing) return;
            
            const rect = this.appElement.getBoundingClientRect();
            const newWidth = e.clientX - rect.left;
            const newHeight = e.clientY - rect.top;
            
            this.appElement.style.width = Math.max(400, newWidth) + 'px';
            this.appElement.style.height = Math.max(300, newHeight) + 'px';
        };

        const stopResize = () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        };
    }

    setupWindowResizeListener() {
        // Listen for window resize to exit maximized state
        window.addEventListener('resize', () => {
            if (this.isMaximized) {
                // Get taskbar position and calculate new available space
                const taskbar = document.getElementById('taskbar');
                const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : null;
                const taskbarPosition = taskbar ? Array.from(taskbar.classList).find(cls => cls.startsWith('position-')) : 'position-bottom';
                
                let top = 0, left = 0, width = window.innerWidth, height = window.innerHeight;
                
                if (taskbarRect) {
                    switch (taskbarPosition) {
                        case 'position-top':
                            top = taskbarRect.height;
                            height = window.innerHeight - taskbarRect.height;
                            break;
                        case 'position-bottom':
                        case undefined: // default to bottom
                            height = window.innerHeight - taskbarRect.height;
                            break;
                        case 'position-left':
                            left = taskbarRect.width;
                            width = window.innerWidth - taskbarRect.width;
                            break;
                        case 'position-right':
                            width = window.innerWidth - taskbarRect.width;
                            break;
                    }
                }
                
                // Update maximized window size to new available space
                this.appElement.style.top = top + 'px';
                this.appElement.style.left = left + 'px';
                this.appElement.style.width = width + 'px';
                this.appElement.style.height = height + 'px';
            }
        });
    }
}

// Export for global use
window.FilesApp = FilesApp;
