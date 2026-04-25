class UniversalLauncher {
    constructor() {
        this.appLauncher = null;
        this.fileHandlers = new Map();
        this.initFileHandlers();
    }
    init(appLauncher) { this.appLauncher = appLauncher; }
    initFileHandlers() {
        this.fileHandlers.set('text', {
            extensions:['txt','md','markdown','json','js','css','html','xml','csv','log'], appId:'app3',
            handler: this.handleTextFile.bind(this)
        });
        this.fileHandlers.set('image', { extensions:['jpg','jpeg','png','gif','bmp','svg','webp'], appId:null, handler: this.handleImageFile.bind(this) });
        this.fileHandlers.set('audio', { extensions:['mp3','wav','ogg','m4a','flac'], appId:null, handler: this.handleAudioFile.bind(this) });
    }
    async launch(item, options = {}) {
        try {
            if (!item) return false;
            if (item.type==='app'||item.appId) return await this.launchApp(item, options);
            if (item.type==='folder'||item.isDirectory) return await this.launchFolder(item, options);
            if (item.type==='file'||item.name) return await this.launchFile(item, options);
            return false;
        } catch(e) { return false; }
    }
    async launchApp(item, options = {}) {
        if (!this.appLauncher) return false;
        const id = item.appId || item.id;
        if (!id) return false;
        await this.appLauncher.launchApp(id, options);
        return true;
    }
    async launchFolder(item, options = {}) {
        if (!this.appLauncher) return false;
        await this.appLauncher.launchApp('app1', { path: item.name || item.path || '' });
        return true;
    }
    async launchFile(item, options = {}) {
        if (!this.appLauncher || !item.name) return false;
        const ext = this.getFileExtension(item.name);
        const handler = this.getFileHandler(ext);
        return handler ? await handler.handler(item, options) : false;
    }
    async handleTextFile(item, options = {}) {
        try {
            let content = '';
            try {
                const r = await fetch(this.buildFilePath(item, options));
                if (r.ok) content = await r.text();
            } catch(e) { content = `# ${item.name}\n\nFile content could not be loaded.`; }
            await this.appLauncher.launchApp('app3', { fileName:item.name, content });
            return true;
        } catch(e) { return false; }
    }
    async handleImageFile() { return false; }
    async handleAudioFile(item, options = {}) {
        try {
            await this.appLauncher.launchApp('app5', { fileName:item.name, filePath:this.buildFilePath(item, options) });
            return true;
        } catch(e) { return false; }
    }
    buildFilePath(item, options = {}) {
        const base = options.basePath || 'home', cur = options.currentPath || '';
        return cur && cur !== 'Home' ? `${base}/${cur}/${item.name}`.replace('//','/')  : `${base}/${item.name}`;
    }
    getFileExtension(n) { return n.split('.').pop().toLowerCase(); }
    getFileHandler(ext) {
        for (const [,h] of this.fileHandlers) if (h.extensions.includes(ext)) return h;
        return null;
    }
    registerFileHandler(type, extensions, appId, handler) { this.fileHandlers.set(type, { extensions, appId, handler }); }
    createLaunchItem(data) {
        if (typeof data === 'string') return { type:'app', appId:data };
        if (data.isDirectory || data.type==='folder') return { type:'folder', name:data.name, ...data };
        if (data.appId || data.id || data.type==='app') return { type:'app', appId:data.appId||data.id, ...data };
        if (data.type==='file') return { type:'file', name:data.name, ...data };
        if (data.name && !data.id && !data.appId) return { type:'file', name:data.name, ...data };
        return data;
    }
}
window.universalLauncher = new UniversalLauncher();
