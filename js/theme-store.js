// Themed photo strips chosen from the iPad's photos. Each theme stores its
// artwork plus where the photos go, saved on this device in IndexedDB.

import { createCanvas } from './render.js';
import { loadFileImage, newID, run as runIn } from './db.js';

const STORE = 'themes';
const MAX_SIDE = 3600; // a 2 × 6 in strip at 600 DPI
const run = (mode, fn) => runIn(STORE, mode, fn);

export const MAX_THEME_PHOTOS = 8;

const urls = new Map();
const urlFor = (record) => {
  const key = `${record.id}:${record.updatedAt}`;
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(record.blob));
  return urls.get(key);
};

/** Size of the final image: strips at 3600 px tall, other shapes at 1800 px. */
function outputSize(w, h) {
  const long = Math.max(w, h);
  const target = long / Math.min(w, h) >= 2 ? 3600 : 1800;
  const scale = target / long;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** The theme object the rest of the app uses. */
function toTheme(record) {
  return {
    id: record.id,
    name: record.name,
    image: urlFor(record),
    photoRects: record.photoRects,
    photoCount: record.photoRects.length,
    photosBehind: record.photosBehind,
    ...outputSize(record.imageWidth, record.imageHeight),
    record,
  };
}

export async function listThemes() {
  try {
    const records = await run('readonly', (store) => store.getAll());
    return records.sort((a, b) => a.createdAt - b.createdAt).map(toTheme);
  } catch {
    return [];
  }
}

export async function saveTheme(draft) {
  const now = Date.now();
  const record = {
    id: draft.id ?? newID(),
    name: draft.name.trim() || 'My Theme',
    blob: draft.blob,
    imageWidth: draft.imageWidth,
    imageHeight: draft.imageHeight,
    photoRects: draft.photoRects.map((r) => ({ ...r })),
    photosBehind: draft.photosBehind,
    createdAt: draft.createdAt ?? now,
    updatedAt: now,
  };
  await run('readwrite', (store) => store.put(record));
  return toTheme(record);
}

export async function deleteTheme(id) {
  await run('readwrite', (store) => store.delete(id));
}

/** Editable copy of a saved theme. */
export function draftFromTheme(theme) {
  const { record } = theme;
  return {
    id: record.id,
    createdAt: record.createdAt,
    name: record.name,
    blob: record.blob,
    src: theme.image,
    imageWidth: record.imageWidth,
    imageHeight: record.imageHeight,
    photoRects: record.photoRects.map((r) => ({ ...r })),
    photosBehind: record.photosBehind,
    detected: null,
  };
}

/** New theme from a picked image: resized, with photo windows auto-detected. */
export async function draftFromFile(file) {
  const img = await loadFileImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = createCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

  const { detected, transparent } = detectWindows(canvas);
  const type = transparent ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the theme.'))), type, 0.95),
  );
  const count = Math.min(MAX_THEME_PHOTOS, detected.length || 4);
  const draft = {
    id: null,
    name: file.name.replace(/\.[^.]+$/, '') || 'My Theme',
    blob,
    src: URL.createObjectURL(blob),
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    photosBehind: transparent,
    detected,
    photoRects: [],
  };
  draft.photoRects = rectsForCount(draft, count);
  return draft;
}

/**
 * Photo windows for `count` photos: detected see-through windows first, then
 * an even layout for any extra photos.
 */
export function rectsForCount(draft, count, existing = []) {
  const even = defaultRects(count, draft.imageHeight / draft.imageWidth);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ ...(existing[i] ?? draft.detected?.[i] ?? even[i]) });
  }
  return out;
}

/** Evenly spaced windows: a vertical stack for strips, a grid otherwise. */
export function defaultRects(count, aspect) {
  if (aspect >= 1.6) {
    const top = 0.03;
    const usable = 0.78;
    const gap = 0.015;
    const h = (usable - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, i) => ({ x: 0.07, y: top + i * (h + gap), w: 0.86, h }));
  }
  const cols = count === 1 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const margin = 0.05;
  const gap = 0.03;
  const w = (1 - margin * 2 - gap * (cols - 1)) / cols;
  const h = (1 - margin * 2 - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => ({
    x: margin + (i % cols) * (w + gap),
    y: margin + Math.floor(i / cols) * (h + gap),
    w,
    h,
  }));
}

/**
 * Finds the see-through holes in a PNG frame (where photos show through),
 * ordered top-to-bottom, left-to-right. Coarse; the user fine-tunes after.
 */
function detectWindows(source) {
  const W = 180;
  const H = Math.max(1, Math.min(900, Math.round((W * source.height) / source.width)));
  const small = createCanvas(W, H);
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, W, H);
  const alpha = ctx.getImageData(0, 0, W, H).data;

  const clear = new Uint8Array(W * H);
  let clearCount = 0;
  for (let i = 0; i < W * H; i++) {
    if (alpha[i * 4 + 3] < 60) {
      clear[i] = 1;
      clearCount++;
    }
  }
  const transparent = clearCount > W * H * 0.01;
  if (!transparent) return { detected: [], transparent: false };

  const seen = new Uint8Array(W * H);
  const regions = [];
  const queue = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (!clear[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
    while (head < tail) {
      const p = queue[head++];
      const x = p % W;
      const y = (p / W) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const n of neighbors) {
        if (n >= 0 && clear[n] && !seen[n]) {
          seen[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    // Keep reasonably large, mostly rectangular holes.
    if (count >= W * H * 0.008 && count / boxArea > 0.6 && boxArea < W * H * 0.9) {
      regions.push({ count, x: minX / W, y: minY / H, w: (maxX - minX + 1) / W, h: (maxY - minY + 1) / H });
    }
  }

  const detected = regions
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_THEME_PHOTOS)
    .sort((a, b) => (Math.abs(a.y - b.y) > 0.02 ? a.y - b.y : a.x - b.x))
    .map(({ x, y, w, h }) => ({ x, y, w, h }));
  return { detected, transparent };
}
