// ======================================
// UNIVERSAL WINDOW MANAGER
// ======================================

class WindowManager {
    constructor() {
        this.windows = new Map();
        this.activeWindow = null;
        this.zIndexCounter = 1000;
        this.maxWindowZIndex = 9000; // Keep windows below start menu (9999)
        this.taskbarApps = new Map();
        this.snapZones = null;
        this.isDragging = false;
        this.draggedWindow = null;
        this.setupGlobalEvents();
        this.createSnapZones();
    }

    createWindow(options = {}) {
        const windowId = options.id || `window-${Date.now()}`;
        
        const defaultOptions = {
            title: 'Untitled Window',
            x: 100,
            y: 100,
            resizable: true,
            minimizable: true,
            maximizable: true,
            closable: true,
            icon: 'images/icon.png',
            appId: null,
            content: '',
            footerText: '',
            className: ''
        };

        const config = { ...defaultOptions, ...options, id: windowId };
        
        // Create window container
        const windowEl = document.createElement('div');
        windowEl.className = `app-window ${config.className}`;
        windowEl.id = windowId;
        windowEl.style.cssText = `
            position: absolute;
            left: ${config.x}px;
            top: ${config.y}px;
            z-index: ${++this.zIndexCounter};
        `;

        // Create window structure
        windowEl.innerHTML = `
            <div class="window-header">
                <div class="window-title-area">
                    <img src="${config.icon}" alt="${config.title}" class="window-icon">
                    <span class="window-title">${config.title}</span>
                </div>
                <div class="window-controls">
                    ${config.minimizable ? '<button class="window-btn minimize-btn" title="Minimize"><i class="fas fa-window-minimize"></i></button>' : ''}
                    ${config.maximizable ? '<button class="window-btn maximize-btn" title="Maximize"><i class="fas fa-window-maximize"></i></button>' : ''}
                    ${config.closable ? '<button class="window-btn close-btn" title="Close"><i class="fas fa-times"></i></button>' : ''}
                </div>
            </div>
            <div class="window-content">
                ${config.content}
            </div>
            <div class="window-footer">
                <div class="window-footer-info">${config.footerText}</div>
                <div class="window-resize-handle"></div>
            </div>
        `;

        // Add to DOM
        document.body.appendChild(windowEl);

        // Create window object
        const windowObj = {
            id: windowId,
            element: windowEl,
            config: config,
            isMinimized: false,
            isMaximized: false,
            savedState: null
        };

        this.windows.set(windowId, windowObj);
        this.setupWindowEvents(windowObj);
        this.focusWindow(windowId);
        this.addToTaskbar(windowObj);

        return windowObj;
    }

    setupWindowEvents(windowObj) {
        const { element, config, id } = windowObj;
        const header = element.querySelector('.window-header');
        const minimizeBtn = element.querySelector('.minimize-btn');
        const maximizeBtn = element.querySelector('.maximize-btn');
        const closeBtn = element.querySelector('.close-btn');
        const resizeHandle = element.querySelector('.window-resize-handle');

        // Window focus
        element.addEventListener('mousedown', (e) => {
            // Don't interfere with window controls
            if (e.target.closest('.window-controls')) return;
            this.focusWindow(id);
        });

        // Dragging
        if (header) {
            this.makeDraggable(element, header);
            
            // Double-click to maximize/restore
            header.addEventListener('dblclick', (e) => {
                if (e.target.closest('.window-controls')) return;
                this.toggleMaximizeWindow(id);
            });
        }

        // Window controls
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.minimizeWindow(id);
            });
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMaximizeWindow(id);
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeWindow(id);
            });
        }

        // Resizing
        if (resizeHandle && config.resizable) {
            this.makeResizable(element, resizeHandle);
        }
    }

    makeDraggable(element, handle) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-controls')) return;
            
            isDragging = true;
            this.isDragging = true;
            this.draggedWindow = element;
            
            const windowObj = this.windows.get(element.id);
            
            // Save state before dragging if window is not snapped/maximized
            if (windowObj && !windowObj.isSnapped && !windowObj.isMaximized) {
                this.saveWindowState(windowObj);
            }
            
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left) || element.offsetLeft;
            startTop = parseInt(element.style.top) || element.offsetTop;
            
            handle.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const windowObj = this.windows.get(element.id);
            
            // If window was snapped or maximized, restore its original size first
            if (windowObj && (windowObj.isSnapped || windowObj.isMaximized)) {
                if (windowObj.savedState) {
                    // Restore original size but keep current mouse position
                    const { width, height } = windowObj.savedState;
                    element.style.width = `${width}px`;
                    element.style.height = `${height}px`;
                    
                    // Adjust start position to center window under mouse
                    startLeft = e.clientX - width / 2;
                    startTop = e.clientY - 30; // 30px for header height
                    startX = e.clientX;
                    startY = e.clientY;
                }
                
                // Reset snap/maximize state
                windowObj.isSnapped = false;
                windowObj.isMaximized = false;
                windowObj.snapType = null;
                
                element.classList.remove('maximized', 'snapped');
                element.removeAttribute('data-snap-type');
                
                // Reset maximize button icon
                this.updateMaximizeButtonIcon(windowObj, null);
            }
            
            element.style.left = `${startLeft + (e.clientX - startX)}px`;
            
            // Constrain window position to not go above available area
            const taskbar = document.querySelector('.taskbar');
            const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : null;
            const taskbarPosition = this.getTaskbarPosition();
            
            let availableTop = 0;
            if (taskbarRect && taskbarPosition === 'top') {
                availableTop = taskbarRect.height;
            }
            
            const newTop = Math.max(availableTop, startTop + (e.clientY - startY));
            element.style.top = `${newTop}px`;

            // Show snap preview based on cursor position
            this.showSnapPreview(e.clientX, e.clientY);
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                this.isDragging = false;
                handle.style.cursor = '';
                
                // Apply snap if preview is shown
                if (this.snapPreview) {
                    const snapType = this.snapPreview.dataset.snapType;
                    if (snapType) {
                        this.applySnap(element.id, snapType);
                    }
                    this.hideSnapPreview();
                }
                
                this.draggedWindow = null;
            }
        });
    }

    makeResizable(element, handle) {
        let isResizing = false;
        let startX, startY, startWidth, startHeight;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            
            // Get actual computed dimensions instead of style
            const rect = element.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            
            // Add resizing class for visual feedback
            element.classList.add('resizing');
            handle.style.cursor = 'se-resize';
            
            // If resizing, exit snap/maximize state
            const windowObj = this.windows.get(element.id);
            if (windowObj && (windowObj.isSnapped || windowObj.isMaximized)) {
                windowObj.isSnapped = false;
                windowObj.isMaximized = false;
                windowObj.snapType = null;
                
                element.classList.remove('maximized', 'snapped');
                element.removeAttribute('data-snap-type');
                
                // Reset maximize button icon
                this.updateMaximizeButtonIcon(windowObj, null);
            }
            
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            // Get computed min-width and min-height from CSS
            const computedStyle = window.getComputedStyle(element);
            const minWidth = parseInt(computedStyle.minWidth) || 200;
            const minHeight = parseInt(computedStyle.minHeight) || 150;
            const maxWidth = parseInt(computedStyle.maxWidth) || window.innerWidth;
            const maxHeight = parseInt(computedStyle.maxHeight) || window.innerHeight;
            
            let newWidth = Math.max(startWidth + deltaX, minWidth);
            let newHeight = Math.max(startHeight + deltaY, minHeight);
            
            // Respect max constraints
            newWidth = Math.min(newWidth, maxWidth);
            newHeight = Math.min(newHeight, maxHeight);
            
            // Apply smooth resize with transition disabled
            element.style.transition = 'none';
            element.style.width = `${newWidth}px`;
            element.style.height = `${newHeight}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                element.classList.remove('resizing');
                handle.style.cursor = '';
                
                // Re-enable transitions
                setTimeout(() => {
                    element.style.transition = '';
                }, 50);
            }
        });
    }

    focusWindow(windowId) {
        const windowObj = this.windows.get(windowId);
        if (!windowObj) return;

        // Update z-index, but keep it below start menu
        this.zIndexCounter = Math.min(++this.zIndexCounter, this.maxWindowZIndex);
        windowObj.element.style.zIndex = this.zIndexCounter;
        
        // Remove active class from all windows
        this.windows.forEach(win => {
            win.element.classList.remove('active');
        });
        
        // Add active class to focused window
        windowObj.element.classList.add('active');
        this.activeWindow = windowId;
        
        // Close start menu if it's open
        this.closeStartMenuIfOpen();
    }

    minimizeWindow(windowId) {
        const windowObj = this.windows.get(windowId);
        if (!windowObj) return;

        // Prepare for animation
        windowObj.element.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        windowObj.element.style.transformOrigin = 'center bottom';
        
        // Start animation
        windowObj.element.style.transform = 'scale(0.8) translateY(20px)';
        windowObj.element.style.opacity = '0';
        
        setTimeout(() => {
            windowObj.isMinimized = true;
            windowObj.element.style.display = 'none';
            
            // Clean up animation styles
            windowObj.element.style.transition = '';
            windowObj.element.style.transform = '';
            windowObj.element.style.transformOrigin = '';
            windowObj.element.style.opacity = '';
            
            // Update taskbar
            this.updateTaskbarState(windowObj);
            
            // If this was the active window, deactivate it
            if (this.activeWindow === windowId) {
                this.activeWindow = null;
            }
        }, 250);
    }

    restoreWindow(windowId) {
        const windowObj = this.windows.get(windowId);
        if (!windowObj) return;

        // Restore display and prepare for animation
        windowObj.isMinimized = false;
        windowObj.element.style.display = 'block';
        windowObj.element.style.opacity = '0';
        windowObj.element.style.transform = 'scale(0.8) translateY(20px)';
        windowObj.element.style.transformOrigin = 'center bottom';
        
        // Force reflow to ensure styles are applied
        windowObj.element.offsetHeight;
        
        // Start restore animation
        windowObj.element.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        windowObj.element.style.opacity = '1';
        windowObj.element.style.transform = 'scale(1) translateY(0)';
        
        setTimeout(() => {
            // Clean up animation styles
            windowObj.element.style.transition = '';
            windowObj.element.style.transform = '';
            windowObj.element.style.transformOrigin = '';
            
            // Focus the window
            this.focusWindow(windowId);
        }, 250);
        
        // Update taskbar
        this.updateTaskbarState(windowObj);
    }

    toggleMaximizeWindow(windowId) {
        const windowObj = this.windows.get(windowId);
        if (!windowObj) return;

        // If window is snapped, restore it to normal state (not maximize)
        if (windowObj.isSnapped) {
            if (windowObj.savedState) {
                this.restoreWindowState(windowObj);
                windowObj.isSnapped = false;
                windowObj.snapType = null;
                
                windowObj.element.classList.remove('snapped');
                windowObj.element.removeAttribute('data-snap-type');
                
                // Reset maximize button icon
                this.updateMaximizeButtonIcon(windowObj, null);
            }
            return; // Important : sortir ici pour ne pas maximiser
        }

        if (windowObj.isMaximized) {
            // Restore window
            if (windowObj.savedState) {
                this.restoreWindowState(windowObj);
                windowObj.isMaximized = false;
                windowObj.element.classList.remove('maximized');
                
                // Update maximize button icon
                const maximizeBtn = windowObj.element.querySelector('.maximize-btn i');
                if (maximizeBtn) {
                    maximizeBtn.className = 'fas fa-window-maximize';
                }
            }
        } else {
            // Maximize window
            this.saveWindowState(windowObj);
            
            const taskbar = document.querySelector('.taskbar');
            const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : null;
            const taskbarPosition = this.getTaskbarPosition();
            
            let availableTop = 0;
            let availableBottom = window.innerHeight;
            let availableLeft = 0;
            let availableRight = window.innerWidth;

            // Adjust for taskbar
            if (taskbarRect) {
                switch (taskbarPosition) {
                    case 'top':
                        availableTop = taskbarRect.height;
                        break;
                    case 'bottom':
                        availableBottom = window.innerHeight - taskbarRect.height;
                        break;
                    case 'left':
                        availableLeft = taskbarRect.width;
                        break;
                    case 'right':
                        availableRight = window.innerWidth - taskbarRect.width;
                        break;
                }
            }

            windowObj.element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            windowObj.element.style.left = `${availableLeft}px`;
            windowObj.element.style.top = `${availableTop}px`;
            windowObj.element.style.width = `${availableRight - availableLeft}px`;
            windowObj.element.style.height = `${availableBottom - availableTop}px`;

            windowObj.isMaximized = true;
            windowObj.isSnapped = false; // Clear snap state
            windowObj.element.classList.add('maximized');
            windowObj.element.classList.remove('snapped');
            
            // Update maximize button icon
            const maximizeBtn = windowObj.element.querySelector('.maximize-btn i');
            if (maximizeBtn) {
                maximizeBtn.className = 'fas fa-window-restore';
            }

            // Remove transition after animation
            setTimeout(() => {
                windowObj.element.style.transition = '';
            }, 300);
        }
    }

    getTaskbarPosition() {
        const taskbar = document.getElementById('taskbar');
        if (!taskbar) return 'bottom';
        
        const classList = Array.from(taskbar.classList);
        const positionClass = classList.find(cls => cls.startsWith('position-'));
        return positionClass ? positionClass.replace('position-', '') : 'bottom';
    }

    adjustMaximizedWindowsForTaskbar() {
        // Find all maximized windows and re-calculate their dimensions
        this.windows.forEach(windowObj => {
            if (windowObj.isMaximized) {
                const taskbar = document.querySelector('.taskbar');
                const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : null;
                const taskbarPosition = this.getTaskbarPosition();
                
                let availableTop = 0;
                let availableBottom = window.innerHeight;
                let availableLeft = 0;
                let availableRight = window.innerWidth;

                // Adjust for taskbar
                if (taskbarRect) {
                    switch (taskbarPosition) {
                        case 'top':
                            availableTop = taskbarRect.height;
                            break;
                        case 'bottom':
                            availableBottom = window.innerHeight - taskbarRect.height;
                            break;
                        case 'left':
                            availableLeft = taskbarRect.width;
                            break;
                        case 'right':
                            availableRight = window.innerWidth - taskbarRect.width;
                            break;
                    }
                }

                // Apply smooth transition
                windowObj.element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                windowObj.element.style.left = `${availableLeft}px`;
                windowObj.element.style.top = `${availableTop}px`;
                windowObj.element.style.width = `${availableRight - availableLeft}px`;
                windowObj.element.style.height = `${availableBottom - availableTop}px`;

                // Remove transition after animation
                setTimeout(() => {
                    windowObj.element.style.transition = '';
                }, 300);
            }
        });
    }

    closeWindow(windowId) {
        const windowObj = this.windows.get(windowId);
        if (!windowObj) return;

        // Remove from DOM
        windowObj.element.remove();
        
        // Remove from taskbar
        this.removeFromTaskbar(windowObj);
        
        // Remove from windows map
        this.windows.delete(windowId);
        
        // Focus another window if this was active
        if (this.activeWindow === windowId) {
            const remainingWindows = Array.from(this.windows.values());
            if (remainingWindows.length > 0) {
                this.focusWindow(remainingWindows[remainingWindows.length - 1].id);
            } else {
                this.activeWindow = null;
            }
        }
    }

    addToTaskbar(windowObj) {
        const taskbarApps = document.getElementById('taskbarApps');
        if (!taskbarApps) return;

        // Check if app already has a taskbar icon (including pinned apps)
        let taskbarIcon = taskbarApps.querySelector(`[data-app-id="${windowObj.config.appId}"]`);
        
        if (!taskbarIcon) {
            // Create new taskbar icon only if not found
            taskbarIcon = document.createElement('img');
            taskbarIcon.src = windowObj.config.icon;
            taskbarIcon.alt = windowObj.config.title;
            taskbarIcon.className = 'taskbar-app';
            taskbarIcon.title = windowObj.config.title;
            taskbarIcon.dataset.appId = windowObj.config.appId;
            taskbarIcon.dataset.windowId = windowObj.id;
            
            taskbarIcon.addEventListener('click', () => {
                this.handleTaskbarClick(windowObj.id);
            });
            
            taskbarApps.appendChild(taskbarIcon);
        } else {
            // Use existing pinned icon and update it for the new window
            taskbarIcon.dataset.windowId = windowObj.id;
            
            // Update click handler to handle the new window
            const oldHandler = taskbarIcon.onclick;
            taskbarIcon.onclick = null;
            taskbarIcon.removeEventListener('click', oldHandler);
            
            taskbarIcon.addEventListener('click', () => {
                this.handleTaskbarClick(windowObj.id);
            });
        }

        this.taskbarApps.set(windowObj.id, taskbarIcon);
        this.updateTaskbarState(windowObj);
    }

    updateTaskbarState(windowObj) {
        const taskbarIcon = this.taskbarApps.get(windowObj.id);
        if (!taskbarIcon) return;

        // Remove all state classes
        taskbarIcon.classList.remove('minimized', 'active');

        if (windowObj.isMinimized) {
            taskbarIcon.classList.add('minimized');
        } else if (this.activeWindow === windowObj.id) {
            taskbarIcon.classList.add('active');
        }

        // Update tooltip to show current state
        if (windowObj.isMinimized) {
            taskbarIcon.title = `${windowObj.config.title} (Minimized)`;
        } else {
            taskbarIcon.title = windowObj.config.title;
        }
    }

    removeFromTaskbar(windowObj) {
        const taskbarIcon = this.taskbarApps.get(windowObj.id);
        if (taskbarIcon) {
            // Check if it's a pinned app by looking for data-app-id
            const isPinned = taskbarIcon.hasAttribute('data-app-id') && 
                            document.querySelector(`#taskbarApps [data-app-id="${windowObj.config.appId}"][data-pinned]`);
            
            if (!isPinned) {
                // Remove non-pinned app completely
                taskbarIcon.remove();
            } else {
                // Reset pinned app state but keep the icon
                taskbarIcon.classList.remove('active', 'minimized');
                taskbarIcon.removeAttribute('data-window-id');
                taskbarIcon.title = windowObj.config.title; // Reset tooltip
                
                // Remove the click handler for this specific window
                const newIcon = taskbarIcon.cloneNode(true);
                taskbarIcon.parentNode.replaceChild(newIcon, taskbarIcon);
            }
            this.taskbarApps.delete(windowObj.id);
        }
    }

    handleTaskbarClick(windowId) {
        const windowObj = this.windows.get(windowId);
        if (!windowObj) return;

        if (windowObj.isMinimized) {
            this.restoreWindow(windowId);
        } else if (this.activeWindow === windowId) {
            this.minimizeWindow(windowId);
        } else {
            this.focusWindow(windowId);
        }
    }

    setupGlobalEvents() {
        // Update taskbar states when windows change
        document.addEventListener('click', (e) => {
            this.windows.forEach(windowObj => {
                this.updateTaskbarState(windowObj);
            });
        });
    }

    closeStartMenuIfOpen() {
        // Close start menu if it's open
        const settingsPanel = document.getElementById('settingsPanel');
        const startButton = document.getElementById('startButton');
        
        if (settingsPanel && settingsPanel.classList.contains('active')) {
            settingsPanel.classList.remove('active');
            startButton?.classList.remove('active');
        }
    }

    // Utility methods for apps
    setWindowContent(windowId, content) {
        const windowObj = this.windows.get(windowId);
        if (windowObj) {
            const contentEl = windowObj.element.querySelector('.window-content');
            if (contentEl) {
                contentEl.innerHTML = content;
            }
        }
    }

    setWindowFooter(windowId, footerText) {
        const windowObj = this.windows.get(windowId);
        if (windowObj) {
            const footerEl = windowObj.element.querySelector('.window-footer-info');
            if (footerEl) {
                footerEl.textContent = footerText;
            }
        }
    }

    // Method to update footer for active window
    updateFooter(windowId, footerText) {
        this.setWindowFooter(windowId, footerText);
    }

    getWindow(windowId) {
        return this.windows.get(windowId);
    }

    showSnapPreview(mouseX, mouseY) {
        const snapZone = this.getSnapZone(mouseX, mouseY);
        
        if (!snapZone) {
            this.hideSnapPreview();
            return;
        }

        if (!this.snapPreview) {
            this.snapPreview = document.createElement('div');
            this.snapPreview.className = 'snap-preview';
            document.body.appendChild(this.snapPreview);
        }

        this.snapPreview.dataset.snapType = snapZone.type;
        this.snapPreview.style.cssText = `
            position: fixed;
            left: ${snapZone.x}px;
            top: ${snapZone.y}px;
            width: ${snapZone.width}px;
            height: ${snapZone.height}px;
            background: rgba(0, 120, 212, 0.2);
            border: 2px solid rgba(0, 120, 212, 0.6);
            border-radius: 8px;
            pointer-events: none;
            z-index: 10000;
            opacity: 1;
            transition: all 0.15s ease-in-out;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        `;
        
        // Add active class for better visual feedback
        this.snapPreview.classList.add('active');
    }

    hideSnapPreview() {
        if (this.snapPreview) {
            this.snapPreview.classList.remove('active');
            // Small delay to allow fade out animation
            setTimeout(() => {
                if (this.snapPreview) {
                    this.snapPreview.remove();
                    this.snapPreview = null;
                }
            }, 150);
        }
    }

    getSnapZone(mouseX, mouseY) {
        const threshold = 10;
        const taskbar = document.querySelector('.taskbar');
        const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : null;
        const taskbarPosition = this.getTaskbarPosition();
        
        let availableTop = 0;
        let availableBottom = window.innerHeight;
        let availableLeft = 0;
        let availableRight = window.innerWidth;

        // Adjust for taskbar
        if (taskbarRect) {
            switch (taskbarPosition) {
                case 'top':
                    availableTop = taskbarRect.height;
                    break;
                case 'bottom':
                    availableBottom = window.innerHeight - taskbarRect.height;
                    break;
                case 'left':
                    availableLeft = taskbarRect.width;
                    break;
                case 'right':
                    availableRight = window.innerWidth - taskbarRect.width;
                    break;
            }
        }

        // Check edges only (no corners)
        // Top edge - fullscreen (détection dans la zone disponible)
        if (mouseY <= availableTop + threshold) {
            return {
                type: 'fullscreen',
                x: availableLeft,
                y: availableTop,
                width: availableRight - availableLeft,
                height: availableBottom - availableTop
            };
        }

        // Left edge - left half (détection dans la zone disponible)
        if (mouseX <= availableLeft + threshold) {
            return {
                type: 'left',
                x: availableLeft,
                y: availableTop,
                width: (availableRight - availableLeft) / 2,
                height: availableBottom - availableTop
            };
        }

        // Right edge - right half (détection dans la zone disponible)
        if (mouseX >= availableRight - threshold) {
            return {
                type: 'right',
                x: availableLeft + (availableRight - availableLeft) / 2,
                y: availableTop,
                width: (availableRight - availableLeft) / 2,
                height: availableBottom - availableTop
            };
        }

        return null;
    }

    applySnap(windowId, snapType) {
        const windowObj = this.windows.get(windowId);
        if (!windowObj) return;

        // Save current state before snapping
        if (!windowObj.isSnapped && !windowObj.isMaximized) {
            this.saveWindowState(windowObj);
        }

        const taskbar = document.querySelector('.taskbar');
        const taskbarRect = taskbar ? taskbar.getBoundingClientRect() : null;
        const taskbarPosition = this.getTaskbarPosition();
        
        let availableTop = 0;
        let availableBottom = window.innerHeight;
        let availableLeft = 0;
        let availableRight = window.innerWidth;

        // Adjust for taskbar
        if (taskbarRect) {
            switch (taskbarPosition) {
                case 'top':
                    availableTop = taskbarRect.height;
                    break;
                case 'bottom':
                    availableBottom = window.innerHeight - taskbarRect.height;
                    break;
                case 'left':
                    availableLeft = taskbarRect.width;
                    break;
                case 'right':
                    availableRight = window.innerWidth - taskbarRect.width;
                    break;
            }
        }

        let snapConfig = {};

        switch (snapType) {
            case 'fullscreen':
                snapConfig = {
                    left: availableLeft,
                    top: availableTop,
                    width: availableRight - availableLeft,
                    height: availableBottom - availableTop
                };
                break;
            case 'left':
                snapConfig = {
                    left: availableLeft,
                    top: availableTop,
                    width: (availableRight - availableLeft) / 2,
                    height: availableBottom - availableTop
                };
                break;
            case 'right':
                snapConfig = {
                    left: availableLeft + (availableRight - availableLeft) / 2,
                    top: availableTop,
                    width: (availableRight - availableLeft) / 2,
                    height: availableBottom - availableTop
                };
                break;
        }

        // Apply smooth animation
        windowObj.element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        windowObj.element.style.left = `${snapConfig.left}px`;
        windowObj.element.style.top = `${snapConfig.top}px`;
        windowObj.element.style.width = `${snapConfig.width}px`;
        windowObj.element.style.height = `${snapConfig.height}px`;

        // Mark as snapped for proper restoration
        windowObj.isSnapped = true;
        windowObj.snapType = snapType;
        windowObj.element.classList.add('snapped');
        windowObj.element.setAttribute('data-snap-type', snapType);
        
        // Update maximize button icon based on snap type
        this.updateMaximizeButtonIcon(windowObj, snapType);

        // Remove transition after animation
        setTimeout(() => {
            windowObj.element.style.transition = '';
        }, 300);
    }

    saveWindowState(windowObj) {
        if (!windowObj.isSnapped && !windowObj.isMaximized) {
            const rect = windowObj.element.getBoundingClientRect();
            windowObj.savedState = {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            };
        }
    }

    restoreWindowState(windowObj) {
        if (windowObj.savedState) {
            // Si la fenêtre était maximisée ou snappée, on la centre avec animation
            const wasMaximizedOrSnapped = windowObj.isMaximized || windowObj.isSnapped;
            
            if (wasMaximizedOrSnapped) {
                // Calculer la position centrée
                const { width, height } = windowObj.savedState;
                const centerX = (window.innerWidth - width) / 2;
                const centerY = (window.innerHeight - height) / 2;
                
                // Appliquer l'animation fluide
                windowObj.element.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                windowObj.element.style.left = `${centerX}px`;
                windowObj.element.style.top = `${centerY}px`;
                windowObj.element.style.width = `${width}px`;
                windowObj.element.style.height = `${height}px`;
                
                // Supprimer la transition après l'animation
                setTimeout(() => {
                    windowObj.element.style.transition = '';
                }, 400);
            } else {
                // Restauration normale à la position sauvegardée
                const { left, top, width, height } = windowObj.savedState;
                windowObj.element.style.left = `${left}px`;
                windowObj.element.style.top = `${top}px`;
                windowObj.element.style.width = `${width}px`;
                windowObj.element.style.height = `${height}px`;
            }
        }
    }

    createSnapZones() {
        // Create snap preview overlay (not visible by default)
        this.snapZones = document.createElement('div');
        this.snapZones.className = 'snap-zones';
        this.snapZones.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9500;
            display: none;
        `;
        document.body.appendChild(this.snapZones);
    }

    updateMaximizeButtonIcon(windowObj, snapType) {
        const maximizeBtn = windowObj.element.querySelector('.maximize-btn i');
        if (!maximizeBtn) return;

        switch (snapType) {
            case 'fullscreen':
                maximizeBtn.className = 'fas fa-window-restore';
                break;
            case 'left':
                maximizeBtn.className = 'fas fa-chevron-right'; // Inverser : flèche droite pour snap gauche
                break;
            case 'right':
                maximizeBtn.className = 'fas fa-chevron-left'; // Inverser : flèche gauche pour snap droit
                break;
            default:
                maximizeBtn.className = 'fas fa-window-maximize';
        }
    }
}

// Global window manager instance
window.windowManager = new WindowManager();
