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
        this.fileHandlers.set('text', {
            extensions: ['txt', 'md', 'markdown', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log'],
            appId: 'app3',
            handler: this.handleTextFile.bind(this)
        });

        this.fileHandlers.set('image', {
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'],
            appId: null,
            handler: this.handleImageFile.bind(this)
        });

        this.fileHandlers.set('audio', {
            extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'],
            appId: null,
            handler: this.handleAudioFile.bind(this)
        });
    }

    async launch(item, options = {}) {
        try {
            console.log(`🚀 Universal launch requested:`, item);

            if (!item) {
                console.error('❌ No item provided to launch');
                return false;
            }

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

    async launchFolder(item, options = {}) {
        if (!this.appLauncher) {
            console.error('❌ App launcher not initialized');
            return false;
        }

        const folderName = item.name || item.path || '';
        console.log(`📁 Opening folder: ${folderName}`);

        await this.appLauncher.launchApp('app1', { path: folderName });
        return true;
    }

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

        const extension = this.getFileExtension(fileName);
        const handler = this.getFileHandler(extension);

        if (handler) {
            return await handler.handler(item, options);
        } else {
            console.warn(`⚠️ No handler for file type: .${extension}`);
            return false;
        }
    }

    async handleTextFile(item, options = {}) {
        try {
            const fileName = item.name;
            let content = '';

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

    async handleImageFile(item, options = {}) {
        console.log('🖼️ Image file handler - not implemented yet');
        return false;
    }

    async handleAudioFile(item, options = {}) {
        try {
            const filePath = this.buildFilePath(item, options);
            await this.appLauncher.launchApp('app5', {
                fileName: item.name,
                filePath: filePath
            });
            return true;
        } catch (error) {
            console.error('❌ Failed to handle audio file:', error);
            return false;
        }
    }

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

    getFileExtension(fileName) {
        return fileName.split('.').pop().toLowerCase();
    }

    getFileHandler(extension) {
        for (const [type, handler] of this.fileHandlers) {
            if (handler.extensions.includes(extension)) {
                return handler;
            }
        }
        return null;
    }

    registerFileHandler(type, extensions, appId, handler) {
        this.fileHandlers.set(type, {
            extensions,
            appId,
            handler
        });
    }

    createLaunchItem(data) {
        if (typeof data === 'string') {
            return { type: 'app', appId: data };
        }

        if (data.isDirectory === true || data.type === 'folder') {
            return { type: 'folder', name: data.name, ...data };
        }

        if (data.appId || data.id || data.type === 'app') {
            return { type: 'app', appId: data.appId || data.id, ...data };
        }

        if (data.type === 'file') {
            return { type: 'file', name: data.name, ...data };
        }

        if (data.name && !data.id && !data.appId) {
            return { type: 'file', name: data.name, ...data };
        }

        return data;
    }
}

window.universalLauncher = new UniversalLauncher();

console.log('✅ Universal Launcher loaded');
