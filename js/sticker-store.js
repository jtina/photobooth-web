// Stickers chosen from the iPad's photos, saved on this device in IndexedDB so
// they are still there the next time the app is opened.

import { createCanvas } from './render.js';
import { loadFileImage, newID, run as runIn } from './db.js';

const STORE = 'stickers';
const MAX_SIDE = 1200; // matches the recommended sticker size in the iOS app
const run = (mode, fn) => runIn(STORE, mode, fn);

// Object URLs stay valid for the whole app session so stickers already placed
// on a strip keep rendering even if they are deleted from the library.
const urls = new Map();
const urlFor = (record) => {
  if (!urls.has(record.id)) urls.set(record.id, URL.createObjectURL(record.blob));
  return urls.get(record.id);
};

/** All saved stickers, oldest first: [{ id, name, src, custom: true }]. */
export async function listCustomStickers() {
  try {
    const records = await run('readonly', (store) => store.getAll());
    return records
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ id: r.id, name: r.name, src: urlFor(r), custom: true }));
  } catch {
    return [];
  }
}

/** Shrinks big photos so the library stays small. Keeps transparency for PNGs. */
async function prepare(file) {
  const img = await loadFileImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = createCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not save the sticker.'))), type, 0.92),
  );
}

/** Saves the chosen files as stickers. Returns how many failed. */
export async function addCustomStickers(files) {
  let failed = 0;
  for (const file of files) {
    try {
      const blob = await prepare(file);
      const record = {
        id: newID(),
        name: file.name.replace(/\.[^.]+$/, '') || 'Sticker',
        blob,
        createdAt: Date.now(),
      };
      await run('readwrite', (store) => store.put(record));
    } catch {
      failed += 1;
    }
  }
  return failed;
}

export async function deleteCustomSticker(id) {
  await run('readwrite', (store) => store.delete(id));
}
