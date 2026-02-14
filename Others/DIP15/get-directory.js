// ======================================
// DIRECTORY CONTENT FETCHER (Client-side)
// ======================================

class DirectoryFetcher {
    constructor() {
        this.knownExtensions = {
            // Documents
            '.txt': 'fas fa-file-alt',
            '.doc': 'fas fa-file-word',
            '.docx': 'fas fa-file-word',
            '.pdf': 'fas fa-file-pdf',
            '.rtf': 'fas fa-file-alt',
            '.odt': 'fas fa-file-alt',
            '.xlsx': 'fas fa-file-excel',
            '.xls': 'fas fa-file-excel',
            '.pptx': 'fas fa-file-powerpoint',
            '.ppt': 'fas fa-file-powerpoint',
            
            // Images
            '.jpg': 'fas fa-image',
            '.jpeg': 'fas fa-image',
            '.png': 'fas fa-image',
            '.gif': 'fas fa-image',
            '.bmp': 'fas fa-image',
            '.webp': 'fas fa-image',
            '.svg': 'fas fa-image',
            '.ico': 'fas fa-image',
            
            // Videos
            '.mp4': 'fas fa-video',
            '.avi': 'fas fa-video',
            '.mkv': 'fas fa-video',
            '.mov': 'fas fa-video',
            '.wmv': 'fas fa-video',
            '.flv': 'fas fa-video',
            '.webm': 'fas fa-video',
            '.m4v': 'fas fa-video',
            
            // Audio
            '.mp3': 'fas fa-music',
            '.wav': 'fas fa-music',
            '.flac': 'fas fa-music',
            '.aac': 'fas fa-music',
            '.ogg': 'fas fa-music',
            '.m4a': 'fas fa-music',
            '.wma': 'fas fa-music',
            
            // Archives
            '.zip': 'fas fa-file-archive',
            '.rar': 'fas fa-file-archive',
            '.7z': 'fas fa-file-archive',
            '.tar': 'fas fa-file-archive',
            '.gz': 'fas fa-file-archive',
            
            // Code
            '.js': 'fas fa-file-code',
            '.html': 'fas fa-file-code',
            '.htm': 'fas fa-file-code',
            '.css': 'fas fa-file-code',
            '.json': 'fas fa-file-code',
            '.xml': 'fas fa-file-code',
            '.py': 'fas fa-file-code',
            '.java': 'fas fa-file-code',
            '.cpp': 'fas fa-file-code',
            '.c': 'fas fa-file-code',
            '.h': 'fas fa-file-code',
            '.php': 'fas fa-file-code',
            '.md': 'fas fa-file-code',
            
            // Executables
            '.exe': 'fas fa-cog',
            '.msi': 'fas fa-cog',
            '.deb': 'fas fa-cog',
            '.dmg': 'fas fa-cog',
            '.app': 'fas fa-cog',
            '.apk': 'fas fa-cog'
        };
        
        // Real file structure based on actual files that exist
        this.fileStructure = {
            'Home': {
                folders: ['Documents', 'Projects', 'Music'],
                apps: ['app5', 'app9']
            },
            'Documents': {
                files: ['credit.txt']
            },
            'Music': {
                files: []
            },
            'Projects': {
                files: ['README.md']
            }
        };

        // Load apps data for app ID mapping
        this.appsData = null;
    }

    setAppsData(appsData) {
        this.appsData = appsData;
    }

    getAppByFileName(fileName) {
        if (!this.appsData) return null;
        const matchingApp = this.appsData.find(app => app.id === fileName);
        return matchingApp;
    }

    async fetchDirectoryContents(path = '') {
        try {
            // For GitHub Pages, we need to check which files exist
            return await this.detectRealDirectoryContents(path);
        } catch (error) {
            console.error('Error fetching directory contents:', error);
            // Fallback to known structure
            return this.getKnownDirectoryContents(path);
        }
    }

    async detectRealDirectoryContents(path = '') {
        const items = [];
        
        // Handle Home directory
        if (path === '' || path === 'Home') {
            // Check for known folders
            const knownFolders = this.fileStructure.Home.folders || [];
            
            for (const folderName of knownFolders) {
                try {
                    const folderPath = `home/${folderName}/`;
                    const response = await fetch(folderPath, { method: 'HEAD' });
                    if (response.ok || response.status === 403) { // 403 often means directory exists but listing is disabled
                        items.push({
                            name: folderName,
                            type: 'folder',
                            isDirectory: true,
                            icon: 'images/folder.png',
                            path: folderPath
                        });
                    }
                } catch (e) {
                    // If HEAD request fails, try to access index or a known file
                    try {
                        const testResponse = await fetch(`home/${folderName}/index.html`, { method: 'HEAD' });
                        if (testResponse.ok || testResponse.status === 403) {
                            items.push({
                                name: folderName,
                                type: 'folder',
                                isDirectory: true,
                                icon: 'images/folder.png',
                                path: `home/${folderName}/`
                            });
                        }
                    } catch (e2) {
                        // Folder doesn't exist, skip it
                    }
                }
            }
            
            // Check for apps in home folder
            const knownApps = this.fileStructure.Home.apps || [];
            for (const appName of knownApps) {
                try {
                    const response = await fetch(`home/${appName}`, { method: 'HEAD' });
                    if (response.ok) {
                        const appData = this.getAppByFileName(appName);
                        if (appData) {
                            items.push({
                                name: appData.name,
                                type: 'app',
                                isDirectory: false,
                                icon: appData.icon,
                                path: `home/${appName}`,
                                appId: appData.id
                            });
                        }
                    }
                } catch (e) {
                    // App doesn't exist, skip it
                }
            }
            
            return items;
        }
        
        // Handle specific directories - try to detect files automatically
        const commonFiles = await this.detectFilesInDirectory(path);
        return commonFiles;
    }

    async detectFilesInDirectory(dirPath) {
        const items = [];
        const basePath = `home/${dirPath}/`;
        
        // Get common files based on directory type
        const normalizedPath = dirPath.toLowerCase();
        const directoryKey = Object.keys(this.fileStructure).find(
            key => key.toLowerCase() === normalizedPath
        );
        const commonFiles = directoryKey ? (this.fileStructure[directoryKey].files || []) : [];

        if (!commonFiles.length) {
            return items;
        }
        
        // Check files in batches to avoid overwhelming the server
        const batchSize = 5;
        for (let i = 0; i < commonFiles.length; i += batchSize) {
            const batch = commonFiles.slice(i, i + batchSize);
            const promises = batch.map(async (fileName) => {
                try {
                    const response = await fetch(basePath + fileName, { method: 'HEAD' });
                    if (response.ok) {
                        return {
                            name: fileName,
                            type: 'file',
                            isDirectory: false,
                            icon: this.getIconForFile(fileName),
                            path: basePath + fileName
                        };
                    }
                } catch (e) {
                    // File doesn't exist or network error
                    return null;
                }
                return null;
            });
            
            const results = await Promise.all(promises);
            results.forEach(item => {
                if (item) items.push(item);
            });
            
            if (i + batchSize < commonFiles.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Sort items: folders first, then files alphabetically
        items.sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
        
        return items;
    }

    getKnownDirectoryContents(path) {
        const items = [];
        
        // Handle Home directory
        if (path === '' || path === 'Home') {
            const homeData = this.fileStructure['Home'];
            
            // Add folders
            if (homeData.folders) {
                homeData.folders.forEach(folderName => {
                    items.push({
                        name: folderName,
                        type: 'folder',
                        isDirectory: true,
                        icon: 'images/folder.png',
                        path: `home/${folderName}/`
                    });
                });
            }
            
            // Add apps
            if (homeData.apps) {
                homeData.apps.forEach(appName => {
                    const appData = this.getAppByFileName(appName);
                    if (appData) {
                        items.push({
                            name: appData.name,
                            type: 'app',
                            isDirectory: false,
                            icon: appData.icon,
                            path: `home/${appName}`,
                            appId: appData.id
                        });
                    } else {
                        items.push({
                            name: appName,
                            type: 'app',
                            isDirectory: false,
                            icon: 'fas fa-cog',
                            path: `home/${appName}`,
                            appId: appName
                        });
                    }
                });
            }
            
            return items;
        }
        
        // Handle specific directories
        const directoryData = this.fileStructure[path];
        if (!directoryData) {
            // If no known data, return empty but log for debugging
            console.log(`No known directory data for: ${path}`);
            return items;
        }
        
        // Add files from known structure
        if (directoryData.files) {
            directoryData.files.forEach(fileName => {
                items.push({
                    name: fileName,
                    type: 'file',
                    isDirectory: false,
                    icon: this.getIconForFile(fileName),
                    path: `home/${path}/${fileName}`
                });
            });
        }
        
        // Add folders if any
        if (directoryData.folders) {
            directoryData.folders.forEach(folderName => {
                items.push({
                    name: folderName,
                    type: 'folder',
                    isDirectory: true,
                    icon: 'images/folder.png',
                    path: `home/${path}/${folderName}/`
                });
            });
        }
        
        return items;
    }

    parseDirectoryListing(html, currentPath) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const listItems = doc.querySelectorAll('ul li a[href]');
        const items = [];

        listItems.forEach(link => {
            const href = link.getAttribute('href');
            let text = link.textContent.trim();
            
            if (href === '../' || href === './' || text === 'Parent Directory' || text === '' || href === '' || 
                text.toLowerCase() === 'home' || href.toLowerCase() === 'home' || href.toLowerCase() === 'home/') {
                return;
            }

            if (!text || text.length === 0) {
                return;
            }

            let name = href.endsWith('/') ? href.slice(0, -1) : href;
            name = name.split('/').pop() || name;
            try {
                name = decodeURIComponent(name);
            } catch (e) {}

            if (!name && text) name = text;

            const knownFolders = ['Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'Projects'];
            let isFolder = href.endsWith('/') || knownFolders.includes(name);

            if (!name || name.startsWith('.') || name.startsWith('_') || 
                (name.toLowerCase() === 'home' && !name.includes('.'))) {
                return;
            }

            if (isFolder) {
                items.push({
                    name: name,
                    type: 'folder',
                    isDirectory: true,
                    icon: 'images/folder.png',
                    path: currentPath + '/' + name
                });
            } else {
                const appData = this.getAppByFileName(name);
                if (appData) {
                    items.push({
                        name: appData.name,
                        type: 'app',
                        isDirectory: false,
                        icon: appData.icon,
                        path: currentPath + '/' + name,
                        appId: appData.id
                    });
                } else {
                    if (name.includes('.')) {
                        const extension = '.' + name.split('.').pop().toLowerCase();
                        const icon = this.knownExtensions[extension] || 'fas fa-file';
                        items.push({
                            name: name,
                            type: 'file',
                            isDirectory: false,
                            icon: icon,
                            path: currentPath + '/' + name
                        });
                    } else {
                        if (name.length > 0 && /^[a-zA-Z0-9_-]+$/.test(name)) {
                            items.push({
                                name: name,
                                type: 'file',
                                isDirectory: false,
                                icon: 'fas fa-file',
                                path: currentPath + '/' + name
                            });
                        }
                    }
                }
            }
        });

        return items;
    }

    getIconForFile(filename) {
        const extension = '.' + filename.split('.').pop().toLowerCase();
        return this.knownExtensions[extension] || 'fas fa-file';
    }

    // Utility function to add new files to the structure
    addFileToStructure(directory, filename) {
        if (!this.fileStructure[directory]) {
            this.fileStructure[directory] = { files: [] };
        }
        if (!this.fileStructure[directory].files) {
            this.fileStructure[directory].files = [];
        }
        if (!this.fileStructure[directory].files.includes(filename)) {
            this.fileStructure[directory].files.push(filename);
        }
    }

    // Utility function to add new folders to the structure
    addFolderToStructure(directory, foldername) {
        if (!this.fileStructure[directory]) {
            this.fileStructure[directory] = { folders: [] };
        }
        if (!this.fileStructure[directory].folders) {
            this.fileStructure[directory].folders = [];
        }
        if (!this.fileStructure[directory].folders.includes(foldername)) {
            this.fileStructure[directory].folders.push(foldername);
        }
    }
}

// Export for use in file manager
window.DirectoryFetcher = DirectoryFetcher;
