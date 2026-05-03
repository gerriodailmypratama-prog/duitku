/* Duitku Service Worker - offline first */
const VERSION = 'duitku-v1.0.0';
const PRECACHE = VERSION + '-precache';
const RUNTIME = VERSION + '-runtime';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './ui.js',
  './charts.js',
  './app.js',
  './manifest.json',
  './offline.html',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-origin: cache-first with network fallback
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        if (req.mode === 'navigate') {
          return (await caches.match('./offline.html')) || (await caches.match('./index.html')) || Response.error();
        }
        return Response.error();
      }
    })());
    return;
  }

  // Cross-origin (CDNs): stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || fetchPromise;
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Background sync placeholder (for future cloud backup)
self.addEventListener('sync', (event) => {
  if (event.tag === 'duitku-sync') {
    // future: push pending changes
  }
});

// Notification handling for budget alerts and recurring reminders
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
    if (clients.length) return clients[0].focus();
    return self.clients.openWindow('./');
  }));
});
