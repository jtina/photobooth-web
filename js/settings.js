// Booth settings (behind the PIN on the start screen), saved on this device.

import { createCanvas } from './render.js';
import { DEFAULT_SETTINGS } from './config.js';
import { loadFileImage, run } from './db.js';

export const SETTINGS_PIN = '2468';

const DEFAULTS = { ...DEFAULT_SETTINGS, startImage: null }; // startImage: Blob or null
const BACKUP_KEY = 'miki-booth-settings';

export const settings = { ...DEFAULTS };
let startImageURL = null;

// Settings are saved in IndexedDB, with a second copy of the simple ones in
// localStorage, so they survive app updates and restarts on this device.
function readBackup() {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeBackup() {
  try {
    const { startImage, ...simple } = settings;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(simple));
  } catch {
    // Storage unavailable (e.g. private browsing): IndexedDB copy only.
  }
}

export async function loadSettings() {
  const apply = (values) => {
    for (const [key, value] of Object.entries(values)) if (key in DEFAULTS && value !== undefined) settings[key] = value;
  };
  apply(readBackup());
  try {
    const records = await run('settings', 'readonly', (store) => store.getAll());
    apply(Object.fromEntries(records.map(({ id, value }) => [id, value])));
  } catch {
    // IndexedDB unavailable: keep the localStorage copy / defaults.
  }
}

export async function setSetting(key, value) {
  settings[key] = value;
  if (key === 'startImage' && startImageURL) {
    URL.revokeObjectURL(startImageURL);
    startImageURL = null;
  }
  writeBackup();
  try {
    await run('settings', 'readwrite', (store) => store.put({ id: key, value }));
  } catch {
    if (key === 'startImage') throw new Error('The start screen photo could not be saved on this device.');
  }
}

/** Milliseconds per number in the 10 → 1 countdown. */
export const countdownTickMs = () => Math.round(settings.countdownSeconds * 100);

export function startScreenImage() {
  if (!settings.startImage) return 'assets/start-screen.png';
  if (!startImageURL) startImageURL = URL.createObjectURL(settings.startImage);
  return startImageURL;
}

/** Resizes a picked or pasted image for use as the start screen. */
export async function prepareStartImage(file) {
  const img = await loadFileImage(file);
  const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = createCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not save the image.'))),
      file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      0.92,
    ),
  );
}
