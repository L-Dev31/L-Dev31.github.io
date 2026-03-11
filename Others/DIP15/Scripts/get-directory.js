class DirectoryFetcher {
    constructor() {
        this.knownExtensions = {
            '.txt':'fas fa-file-alt','.doc':'fas fa-file-word','.docx':'fas fa-file-word',
            '.pdf':'fas fa-file-pdf','.rtf':'fas fa-file-alt','.odt':'fas fa-file-alt',
            '.xlsx':'fas fa-file-excel','.xls':'fas fa-file-excel',
            '.pptx':'fas fa-file-powerpoint','.ppt':'fas fa-file-powerpoint',
            '.jpg':'fas fa-image','.jpeg':'fas fa-image','.png':'fas fa-image',
            '.gif':'fas fa-image','.bmp':'fas fa-image','.webp':'fas fa-image',
            '.svg':'fas fa-image','.ico':'fas fa-image',
            '.mp4':'fas fa-video','.avi':'fas fa-video','.mkv':'fas fa-video',
            '.mov':'fas fa-video','.wmv':'fas fa-video','.flv':'fas fa-video',
            '.webm':'fas fa-video','.m4v':'fas fa-video',
            '.mp3':'fas fa-music','.wav':'fas fa-music','.flac':'fas fa-music',
            '.aac':'fas fa-music','.ogg':'fas fa-music','.m4a':'fas fa-music','.wma':'fas fa-music',
            '.zip':'fas fa-file-archive','.rar':'fas fa-file-archive','.7z':'fas fa-file-archive',
            '.tar':'fas fa-file-archive','.gz':'fas fa-file-archive',
            '.js':'fas fa-file-code','.html':'fas fa-file-code','.htm':'fas fa-file-code',
            '.css':'fas fa-file-code','.json':'fas fa-file-code','.xml':'fas fa-file-code',
            '.py':'fas fa-file-code','.java':'fas fa-file-code','.cpp':'fas fa-file-code',
            '.c':'fas fa-file-code','.h':'fas fa-file-code','.php':'fas fa-file-code','.md':'fas fa-file-code',
            '.exe':'fas fa-cog','.msi':'fas fa-cog','.deb':'fas fa-cog',
            '.dmg':'fas fa-cog','.app':'fas fa-cog','.apk':'fas fa-cog'
        };
        this.fileStructure = {
            'Home': { folders: ['Documents', 'Music'], apps: ['app5', 'app9'] },
            'Documents': { files: ['credit.txt'] },
            'Music': { files: ['song.wav', 'sound-of-a-virtuose.mp3'] }
        };
        this.appsData = null;
    }
    setAppsData(d) { this.appsData = d; }
    getAppByFileName(n) { return this.appsData?.find(a => a.id === n) || null; }
    async fetchDirectoryContents(path = '') {
        return this.getKnownDirectoryContents(!path || path === '' ? 'Home' : path);
    }
    getKnownDirectoryContents(path) {
        const items = [], data = this.fileStructure[path];
        if (!data) return items;
        if (path === 'Home') {
            (data.folders||[]).forEach(f => items.push({
                name:f, type:'folder', isDirectory:true, icon:'images/folder.png', path:'home/'+f+'/'
            }));
            (data.apps||[]).forEach(a => {
                const app = this.getAppByFileName(a);
                items.push(app
                    ? {name:app.name, type:'app', isDirectory:false, icon:app.icon, path:'home/'+a, appId:app.id}
                    : {name:a, type:'app', isDirectory:false, icon:'fas fa-cog', path:'home/'+a, appId:a});
            });
            return items;
        }
        (data.files||[]).forEach(f => items.push({
            name:f, type:'file', isDirectory:false, icon:this.getIconForFile(f), path:'home/'+path+'/'+f
        }));
        (data.folders||[]).forEach(f => items.push({
            name:f, type:'folder', isDirectory:true, icon:'images/folder.png', path:'home/'+path+'/'+f+'/'
        }));
        return items;
    }
    getIconForFile(f) { return this.knownExtensions['.'+f.split('.').pop().toLowerCase()] || 'fas fa-file'; }
    addFileToStructure(dir, file) {
        if (!this.fileStructure[dir]) this.fileStructure[dir] = {files:[]};
        if (!this.fileStructure[dir].files) this.fileStructure[dir].files = [];
        if (!this.fileStructure[dir].files.includes(file)) this.fileStructure[dir].files.push(file);
    }
    addFolderToStructure(dir, folder) {
        if (!this.fileStructure[dir]) this.fileStructure[dir] = {folders:[]};
        if (!this.fileStructure[dir].folders) this.fileStructure[dir].folders = [];
        if (!this.fileStructure[dir].folders.includes(folder)) this.fileStructure[dir].folders.push(folder);
    }
}
window.DirectoryFetcher = DirectoryFetcher;
