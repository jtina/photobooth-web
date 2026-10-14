// Shared layout data, ported from MultiFrameView.swift
// and StickerLibrary.swift. All photo windows are normalized (0...1) so the
// on-screen previews and the final rendered image always stay in sync.

export const COLORS = {
  backgroundPink: '#ffdbe6',
  printPink: '#ffedf5',
  accentPink: '#e07891',
  borderPink: '#f2c2cf',
  pink: '#ff2d55',
};

export const CAPTURE_COUNT = 8;
export const COUNTDOWN_SECONDS = 10;

const norm = (x, y, w, h, cw, ch) => ({ x: x / cw, y: y / ch, w: w / cw, h: h / ch });

// The standard strip is rendered at 1200 × 3600 (2 × 6 in at 600 DPI).
export const STANDARD_STRIP = {
  width: 1200,
  height: 3600,
  photoRects: [0, 1, 2, 3].map((i) => norm(90, 120 + i * (728 + 90), 1020, 728, 1200, 3600)),
};

// Themes (artwork + photo windows) are added on the device; see theme-store.js.

const landscape = { width: 1800, height: 1200 };
const portrait = { width: 1200, height: 1800 };
const r = (canvas) => (x, y, w, h) => norm(x, y, w, h, canvas.width, canvas.height);
const L = r(landscape);
const P = r(portrait);

const sixRects = [
  P(46, 60, 508, 364), P(646, 60, 508, 364),
  P(46, 469, 508, 364), P(646, 469, 508, 364),
  P(46, 878, 508, 363), P(646, 878, 508, 363),
];

export const MULTI_FRAME_LAYOUTS = [
  {
    id: 'four',
    name: '4 Photos',
    ...landscape,
    photoRects: [L(57, 66, 704, 504), L(820, 66, 704, 504), L(57, 627, 704, 503), L(820, 627, 704, 503)],
  },
  { id: 'six', name: '6 Photos', ...portrait, photoRects: sixRects },
  {
    id: 'eight',
    name: '8 Photos',
    ...portrait,
    photoRects: [...sixRects, P(46, 1286, 508, 364), P(646, 1286, 508, 364)],
  },
  {
    id: 'staggeredFour',
    name: 'Staggered 4',
    ...landscape,
    photoRects: [L(57, 66, 704, 504), L(820, 66, 704, 504), L(266, 627, 704, 503), L(1028, 627, 704, 503)],
  },
];

export const FRAME_COLORS = [
  'rgb(217, 173, 245)',
  'rgb(179, 194, 242)',
  'rgb(245, 245, 184)',
  'rgb(179, 235, 194)',
  'rgb(245, 184, 204)',
  '#ffffff',
  '#8e8e93',
  '#000000',
];

export const FILTERS = [
  { id: 'normal', name: 'Normal' },
  { id: 'blackAndWhite', name: 'Black and White' },
  { id: 'dreamy', name: 'Dreamy' },
  { id: 'softLight', name: 'Soft Light' },
];

// Where finished photos and videos are uploaded for the QR codes.
// Fill these in from your Supabase project (see README → "Setting up Supabase").
// While they are empty the booth still works; it just skips the uploads and QR codes.
export const SUPABASE = {
  url: '', // e.g. 'https://abcdefghijklmnop.supabase.co'
  publishableKey: '', // e.g. 'sb_publishable_...'
  bucket: 'photobooth',
};

/**
 * Canvas size and photo windows for the current frame choice. A theme (strip
 * or multi-frame artwork) takes priority over the plain layout.
 */
export function frameGeometry({ layout, template }) {
  if (template) return { width: template.width, height: template.height, photoRects: template.photoRects };
  if (layout) return { width: layout.width, height: layout.height, photoRects: layout.photoRects };
  return STANDARD_STRIP;
}

export function photoCountFor({ layout, template }) {
  if (template) return template.photoCount;
  if (layout) return layout.photoRects.length;
  return 4;
}
