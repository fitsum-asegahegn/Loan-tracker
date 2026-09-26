// Bump this on every deploy that changes app.js/index.html/i18n.js/etc.
// Changing this string is also what makes the browser notice sw.js itself
// changed, so it installs the new worker and evicts the old cache.
const CACHE_NAME = 'debt-tracker-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './auth.js',
  './config.js',
  './db.js',
  './i18n.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: always try to get the freshest app.js/index.html/etc, and
// only fall back to the cached copy if the network request fails (offline).
// This is what makes new deploys actually show up instead of getting stuck
// on whatever was cached the first time someone opened the app.
self.addEventListener('fetch', (event) => {
  // Never cache Supabase API calls — those must always hit the network
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
