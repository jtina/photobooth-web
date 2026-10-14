// Small IndexedDB wrapper for things saved on this device (stickers, themes).

const DB_NAME = 'miki-booth';
const STORES = ['stickers', 'themes'];

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        for (const name of STORES) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Ask the browser not to clear saved items when storage is low.
    navigator.storage?.persist?.().catch(() => {});
  }
  return dbPromise;
}

export async function run(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const newID = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

/** Loads an image File/Blob into an <img>. */
export function loadFileImage(file) {
  const src = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`"${file.name ?? 'This file'}" is not an image this browser can open.`));
    image.src = src;
  }).finally(() => setTimeout(() => URL.revokeObjectURL(src), 0));
}
