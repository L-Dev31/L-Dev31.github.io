/** Small IndexedDB key/value store (market data cache, AI lab state). */
const STORE = 'marketCache';
let opening = null;

const open = () => opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('NemerisDB', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error); };
});

const run = async (mode, action) => {
    const db = await open();
    return new Promise((resolve, reject) => {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const Store = {
    set: async (key, data) => { await run('readwrite', s => s.put({ id: key, data })); return true; },
    get: async key => (await run('readonly', s => s.get(key)).catch(() => null))?.data ?? null,
};
