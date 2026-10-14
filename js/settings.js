// Booth settings (behind the PIN on the start screen), saved on this device.

import { createCanvas } from './render.js';
import { loadFileImage, run } from './db.js';

export const SETTINGS_PIN = '2468';

const DEFAULTS = {
  restartCountdown: true, // auto-restart 30 s after a session finishes
  showPrintPage: true, // the print options page and the "Printing...." message
  countdownSeconds: 7, // how long the 10 → 1 countdown takes
  startImage: null, // Blob for a custom start screen, or null for the default
};

export const settings = { ...DEFAULTS };
let startImageURL = null;

export async function loadSettings() {
  try {
    const records = await run('settings', 'readonly', (store) => store.getAll());
    for (const { id, value } of records) if (id in DEFAULTS) settings[id] = value;
  } catch {
    // Storage unavailable: keep the defaults.
  }
}

export async function setSetting(key, value) {
  settings[key] = value;
  if (key === 'startImage' && startImageURL) {
    URL.revokeObjectURL(startImageURL);
    startImageURL = null;
  }
  await run('settings', 'readwrite', (store) => store.put({ id: key, value }));
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
