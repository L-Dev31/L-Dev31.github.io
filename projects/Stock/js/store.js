/**
 * Nemeris Storage Engine
 * IndexedDB wrapper and Import/Export capabilities.
 */
const DB_NAME = 'NemerisDB';
const STORE_NAME = 'marketCache';
const DB_VERSION = 1;

export const Store = {
    db: null,
    initPromise: null,

    async init() {
        if (this.db) return this.db;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            
            request.onerror = (e) => {
                this.initPromise = null;
                reject(e.target.error);
            };
        });

        return this.initPromise;
    },

    async set(key, data) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const record = { 
                id: key, 
                data: data, 
                timestamp: Date.now() 
            };
            
            const request = store.put(record);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async get(key) {
        await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(key);
            
            request.onsuccess = (e) => {
                const result = e.target.result;
                resolve(result ? result.data : null);
            };
            request.onerror = () => resolve(null);
        });
    },

    exportData(data, filename) {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
                        reject(new Error("Invalid portfolio format: expected an object"));
                        return;
                    }
                    // Strip any non-portfolio keys — each value must be a position object
                    const sanitized = {};
                    for (const [sym, pos] of Object.entries(json)) {
                        if (typeof pos === 'object' && pos !== null && !Array.isArray(pos)) {
                            sanitized[sym] = pos;
                        }
                    }
                    resolve(sanitized);
                } catch (err) {
                    reject(new Error("Invalid JSON file"));
                }
            };
            reader.onerror = () => reject(new Error("Error reading file"));
            reader.readAsText(file);
        });
    }
};
