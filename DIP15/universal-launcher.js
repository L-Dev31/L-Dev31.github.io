// ======================================
// UNIVERSAL LAUNCH MANAGER
// Unified system for launching apps and files from desktop, taskbar, and Files app
// ======================================

class UniversalLauncher {
    constructor() {
        this.appLauncher = null;
        this.fileHandlers = new Map();
        this.initFileHandlers();
    }

    init(appLauncher) {
        this.appLauncher = appLauncher;
        console.log('✅ Universal Launcher initialized');
    }

    initFileHandlers() {
        // Define file type handlers
        this.fileHandlers.set('text', {
            extensions: ['txt', 'md', 'markdown', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log'],
            appId: 'app3', // Notes app
            handler: this.handleTextFile.bind(this)
        });

        this.fileHandlers.set('image', {
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'],
            appId: null, // No specific app yet
            handler: this.handleImageFile.bind(this)
        });

        this.fileHandlers.set('audio', {
            extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'],
            appId: null, // No specific app yet
            handler: this.handleAudioFile.bind(this)
        });
    }

    /**
     * Universal launch method - handles apps, folders, and files
     * @param {Object} item - The item to launch
     * @param {Object} options - Additional launch options
     */
    async launch(item, options = {}) {
        try {
            console.log(`🚀 Universal launch requested:`, item);

            // Validate inputs
            if (!item) {
                console.error('❌ No item provided to launch');
                return false;
            }

            // Handle different item types
            if (item.type === 'app' || item.appId) {
                return await this.launchApp(item, options);
            } else if (item.type === 'folder' || item.isDirectory) {
                return await this.launchFolder(item, options);
            } else if (item.type === 'file' || item.name) {
                return await this.launchFile(item, options);
            } else {
                console.error('❌ Unknown item type:', item);
                return false;
            }
        } catch (error) {
            console.error('❌ Universal launch failed:', error);
            return false;
        }
    }

    /**
     * Launch an application
     */
    async launchApp(item, options = {}) {
        if (!this.appLauncher) {
            console.error('❌ App launcher not initialized');
            return false;
        }

        const appId = item.appId || item.id;
        if (!appId) {
            console.error('❌ No app ID provided');
            return false;
        }

        console.log(`📱 Launching app: ${appId}`);
        await this.appLauncher.launchApp(appId, options);
        return true;
    }

    /**
     * Launch/open a folder (opens Files app with that path)
     */
    async launchFolder(item, options = {}) {
        if (!this.appLauncher) {
            console.error('❌ App launcher not initialized');
            return false;
        }

        const folderName = item.name || item.path || '';
        console.log(`📁 Opening folder: ${folderName}`);
        
        // Open Files app with the specific folder path
        await this.appLauncher.launchApp('app1', { path: folderName });
        return true;
    }

    /**
     * Launch/open a file (determines the appropriate app based on file type)
     */
    async launchFile(item, options = {}) {
        if (!this.appLauncher) {
            console.error('❌ App launcher not initialized');
            return false;
        }

        const fileName = item.name;
        if (!fileName) {
            console.error('❌ No file name provided');
            return false;
        }

        console.log(`📄 Opening file: ${fileName}`);

        // Get file extension
        const extension = this.getFileExtension(fileName);
        const handler = this.getFileHandler(extension);

        if (handler) {
            return await handler.handler(item, options);
        } else {
            console.warn(`⚠️ No handler for file type: .${extension}`);
            return false;
        }
    }

    /**
     * Handle text files - open in Notes app
     */
    async handleTextFile(item, options = {}) {
        try {
            const fileName = item.name;
            let content = '';

            // Try to load file content
            try {
                const filePath = this.buildFilePath(item, options);
                const response = await fetch(filePath);
                if (response.ok) {
                    content = await response.text();
                } else {
                    console.warn('Could not fetch file content, opening empty');
                }
            } catch (error) {
                console.warn('Could not read file content:', error);
                content = `# ${fileName}\n\nFile content could not be loaded.`;
            }

            // Launch Notes app with file content
            await this.appLauncher.launchApp('app3', { 
                fileName: fileName,
                content: content 
            });
            return true;
        } catch (error) {
            console.error('❌ Failed to handle text file:', error);
            return false;
        }
    }

    /**
     * Handle image files - placeholder for future image viewer
     */
    async handleImageFile(item, options = {}) {
        console.log('🖼️ Image file handler - not implemented yet');
        return false;
    }

    /**
     * Handle audio files - placeholder for future audio player
     */
    async handleAudioFile(item, options = {}) {
        console.log('🎵 Audio file handler - not implemented yet');
        return false;
    }

    /**
     * Build file path based on context
     */
    buildFilePath(item, options = {}) {
        const fileName = item.name;
        const basePath = options.basePath || 'home';
        const currentPath = options.currentPath || '';
        
        if (currentPath && currentPath !== 'Home') {
            return `${basePath}/${currentPath}/${fileName}`.replace('//', '/');
        } else {
            return `${basePath}/${fileName}`;
        }
    }

    /**
     * Get file extension from filename
     */
    getFileExtension(fileName) {
        return fileName.split('.').pop().toLowerCase();
    }

    /**
     * Get appropriate file handler for extension
     */
    getFileHandler(extension) {
        for (const [type, handler] of this.fileHandlers) {
            if (handler.extensions.includes(extension)) {
                return handler;
            }
        }
        return null;
    }

    /**
     * Register a new file type handler
     */
    registerFileHandler(type, extensions, appId, handler) {
        this.fileHandlers.set(type, {
            extensions,
            appId,
            handler
        });
    }

    /**
     * Create launch item from various sources
     */
    createLaunchItem(data) {
        // Normalize different data formats into a standard launch item
        if (typeof data === 'string') {
            // Simple string - treat as app ID
            return { type: 'app', appId: data };
        }

        // Handle desktop items
        if (data.isDirectory === true || data.type === 'folder') {
            return { type: 'folder', name: data.name, ...data };
        }

        // Handle app items
        if (data.type === 'app' || data.appId) {
            return { type: 'app', appId: data.appId || data.id, ...data };
        }

        // Handle file items
        if (data.type === 'file' || data.name) {
            return { type: 'file', name: data.name, ...data };
        }

        return data;
    }
}

// Create global instance
window.universalLauncher = new UniversalLauncher();

console.log('✅ Universal Launcher loaded');
