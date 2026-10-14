// Offline cache for the app shell and assets. The deploy workflow replaces
// BUILD_ID with the commit SHA so each deploy gets a fresh cache.
const CACHE = 'miki-booth-BUILD_ID';

const CORE = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'stickers.json',
  'js/app.js',
  'js/clipboard.js',
  'js/config.js',
  'js/media.js',
  'js/render.js',
  'js/settings.js',
  'js/db.js',
  'js/sticker-store.js',
  'js/theme-store.js',
  'js/upload.js',
  'vendor/supabase.js',
  'vendor/qrcode.js',
  'assets/start-screen.png',
  'assets/format-photostrip.png',
  'assets/format-multiframe.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first (so new deploys show up right away), falling back to the
// cache when offline. Only same-origin GET requests are handled; Supabase
// uploads go straight to the network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r ?? Response.error())),
  );
});
