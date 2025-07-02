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
        
        this.folderStructure = {
            'Documents': [],
            'Pictures': [],
            'Downloads': [],
            'Projects': [],
            'Music': [],
            'Videos': []
        };

        // Load apps data for app ID mapping
        this.appsData = null;
        this.loadAppsData();
    }

    async loadAppsData() {
        try {
            const response = await fetch('apps.json');
            const data = await response.json();
            this.appsData = data.apps;
        } catch (error) {
            console.warn('Could not load apps.json:', error);
        }
    }

    getAppByFileName(fileName) {
        if (!this.appsData) return null;
        
        // Check if filename matches an app ID (e.g., "app5" -> id: "app5")
        const matchingApp = this.appsData.find(app => app.id === fileName);
        return matchingApp;
    }

    async fetchDirectoryContents(path = '') {
        try {
            console.log(`🔍 Fetching directory contents for: "${path}"`);
            const response = await fetch(`home/${path}`);
            const html = await response.text();
            
            // Parse the directory listing HTML
            const items = this.parseDirectoryListing(html, path);
            console.log(`📁 Found ${items.length} items in ${path}:`, items);
            return items;
        } catch (error) {
            console.warn(`Could not fetch directory contents for ${path}:`, error);
            return [];
        }
    }

    parseDirectoryListing(html, currentPath) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Only select links that are inside the list (ul), not from other parts of the page
        const listItems = doc.querySelectorAll('ul li a[href]');
        const items = [];

        listItems.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            
            console.log(`🔍 Parsing link: href="${href}", text="${text}"`);
            
            // Skip parent directory links, current directory, empty links, and "home" entries
            if (href === '../' || href === './' || text === 'Parent Directory' || text === '' || href === '' || 
                text.toLowerCase() === 'home' || href.toLowerCase() === 'home' || href.toLowerCase() === 'home/') {
                console.log(`⏭️ Skipping: ${href} (parent/current/empty/home)`);
                return;
            }

            // Skip links that are just whitespace or don't have meaningful content
            if (!text || text.length === 0) {
                console.log(`⏭️ Skipping: empty text`);
                return;
            }

            // Determine if it's a folder or file
            const isFolder = href.endsWith('/');
            let name = isFolder ? href.slice(0, -1) : href;
            
            // Extract just the filename in case href contains a path
            name = name.split('/').pop() || name;
            
            // Decode any URL encoding
            try {
                name = decodeURIComponent(name);
            } catch (e) {
                // If decoding fails, use the original name
            }
            
            console.log(`📝 Processed name: "${name}"`);
            
            // Skip hidden files, system files, empty names, and navigation breadcrumbs
            if (!name || name.startsWith('.') || name.startsWith('_') || 
                (name.toLowerCase() === 'home' && !name.includes('.'))) {
                console.log(`⏭️ Skipping: ${name} (hidden/system/empty/navigation)`);
                return;
            }

            if (isFolder) {
                items.push({
                    name: name,
                    type: 'folder',
                    icon: 'images/folder.png',
                    path: currentPath + '/' + name
                });
                console.log(`📁 Added folder: ${name}`);
            } else {
                // Check if this is an app file (no extension, matches app ID)
                const appData = this.getAppByFileName(name);
                
                if (appData) {
                    // This is an app file - display it as an app
                    items.push({
                        name: appData.name, // Use the app name from apps.json
                        type: 'app',
                        icon: appData.icon, // Use the app icon from apps.json
                        path: currentPath + '/' + name,
                        appId: appData.id
                    });
                    console.log(`🚀 Added app: ${appData.name}`);
                } else {
                    // Regular file - make sure it has a valid extension
                    if (name.includes('.')) {
                        const extension = '.' + name.split('.').pop().toLowerCase();
                        const icon = this.knownExtensions[extension] || 'fas fa-file';
                        
                        items.push({
                            name: name,
                            type: 'file',
                            icon: icon,
                            path: currentPath + '/' + name
                        });
                        console.log(`📄 Added file: ${name}`);
                    } else {
                        // File without extension - could be an unknown app or system file
                        // Only include if it's not empty and looks like a valid filename
                        if (name.length > 0 && /^[a-zA-Z0-9_-]+$/.test(name)) {
                            items.push({
                                name: name,
                                type: 'file',
                                icon: 'fas fa-file',
                                path: currentPath + '/' + name
                            });
                            console.log(`📄 Added file (no ext): ${name}`);
                        } else {
                            console.log(`⏭️ Skipping: ${name} (invalid filename pattern)`);
                        }
                    }
                }
            }
        });

        console.log(`✅ Final items for ${currentPath}:`, items);
        return items;
    }

    async checkFileExists(filePath) {
        try {
            const response = await fetch(filePath, { method: 'HEAD' });
            return response.ok;
        } catch {
            return false;
        }
    }

    getIconForFile(filename) {
        const extension = '.' + filename.split('.').pop().toLowerCase();
        return this.knownExtensions[extension] || 'fas fa-file';
    }
}

// Export for use in file manager
window.DirectoryFetcher = DirectoryFetcher;
