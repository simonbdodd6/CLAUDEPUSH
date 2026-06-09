const CACHE = 'coach-eye-mission-control-v1';
const ASSETS = [
  '/mission-control',
  '/mission-control/',
  '/mission-control/index.html',
  '/mission-control/styles.css',
  '/mission-control/app.js',
  '/mission-control/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/mission-control')) return;
  if (url.pathname === '/api/mission-control') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
