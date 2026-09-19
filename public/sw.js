const APP_CACHE_NAME = 'totk-app-v1';
const TILES_CACHE_NAME = 'totk-tiles-v1';

const STATIC_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/markers.png',
  '/markers@2x.png',
  '/markers.json',
  '/markers@2x.json',
  '/totk_data.json',
  '/guides/armor_sets.json',
  '/guides/checklist_100.json',
  '/guides/dragons.json',
  '/guides/minibosses.json',
  '/guides/sages_will.json',
  '/guides/voice_memories.json',
];

// Install: pre-cache core application shell & static data
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_PRECACHE))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Pre-cache warning:', err))
  );
});

// Activate: cleanup obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== APP_CACHE_NAME && key !== TILES_CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch interceptor: Offline-first caching for both app assets and map tiles
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Map Tiles (Local /tiles/* or fallback to external)
  if (
    (url.origin === location.origin && url.pathname.startsWith('/tiles/')) ||
    url.hostname.includes('tiles.mapgenie.io')
  ) {
    event.respondWith(
      caches.open(TILES_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }

        try {
          const res = await fetch(request);
          if (res.ok) {
            cache.put(request, res.clone());
          }
          return res;
        } catch (err) {
          // Completely offline fallback: empty 404
          return new Response('', { status: 404, statusText: 'Tile Not Cached' });
        }
      })
    );
    return;
  }

  // 2. Same-origin assets (JS/CSS bundles, HTML, JSON data)
  if (url.origin === location.origin) {
    event.respondWith(
      caches.open(APP_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          // Revalidate in background when online
          fetch(request)
            .then((networkRes) => {
              if (networkRes.ok) cache.put(request, networkRes);
            })
            .catch(() => {});
          return cached;
        }

        try {
          const networkRes = await fetch(request);
          if (networkRes.ok) {
            cache.put(request, networkRes.clone());
          }
          return networkRes;
        } catch (err) {
          // Offline fallback for navigation requests
          if (request.mode === 'navigate') {
            const indexFallback = await cache.match('/index.html');
            if (indexFallback) return indexFallback;
          }
          throw err;
        }
      })
    );
  }
});

// Background tile batch downloader message listener
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'PRECACHE_TILES') {
    const urls = event.data.urls || [];
    const client = event.source;
    const cache = await caches.open(TILES_CACHE_NAME);
    let downloaded = 0;

    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      try {
        const match = await cache.match(u);
        if (!match) {
          const res = await fetch(u);
          if (res.ok) {
            await cache.put(u, res);
          }
        }
        downloaded++;
      } catch (e) {}

      // Report progress every 20 tiles or at end
      if (i % 20 === 0 || i === urls.length - 1) {
        if (client) {
          client.postMessage({
            type: 'PRECACHE_PROGRESS',
            current: downloaded,
            total: urls.length,
          });
        }
      }
    }
  }
});
