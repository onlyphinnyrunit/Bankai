// Thin IndexedDB wrapper. Two stores:
//   kv    — the app state (one JSON-able object)
//   blobs — uploaded photos/videos, keyed by media id
// Falls back to localStorage for state when IndexedDB is unavailable
// (media uploads are then disabled).

const DB_NAME = 'bankai';
const DB_VERSION = 1;
let dbPromise = null;
export let idbAvailable = true;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database blocked by another tab'));
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  }));
}

export async function initDb() {
  try { await openDb(); idbAvailable = true; }
  catch (e) { idbAvailable = false; console.warn('IndexedDB unavailable, using localStorage', e); }
  return idbAvailable;
}

export async function kvGet(key) {
  if (!idbAvailable) {
    const raw = localStorage.getItem('bankai-kv-' + key);
    return raw ? JSON.parse(raw) : undefined;
  }
  return run('kv', 'readonly', (s) => s.get(key));
}

export async function kvSet(key, value) {
  if (!idbAvailable) { localStorage.setItem('bankai-kv-' + key, JSON.stringify(value)); return; }
  return run('kv', 'readwrite', (s) => s.put(value, key));
}

export async function blobGet(id) {
  if (!idbAvailable) return undefined;
  return run('blobs', 'readonly', (s) => s.get(id));
}

export async function blobPut(id, record) {
  if (!idbAvailable) throw new Error('This browser does not allow storing files.');
  return run('blobs', 'readwrite', (s) => s.put(record, id));
}

export async function blobDelete(id) {
  if (!idbAvailable) return;
  return run('blobs', 'readwrite', (s) => s.delete(id));
}

export async function blobKeys() {
  if (!idbAvailable) return [];
  return run('blobs', 'readonly', (s) => s.getAllKeys());
}

export async function blobClear() {
  if (!idbAvailable) return;
  return run('blobs', 'readwrite', (s) => s.clear());
}
