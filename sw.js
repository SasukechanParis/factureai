const CACHE_NAME = 'pholio-v1.0.0';

const ASSETS_TO_CACHE = [
  '/factureai/',
  '/factureai/index.html',
  '/factureai/style.css',
  '/factureai/app.js',
  '/factureai/firebase-service.js',
  '/factureai/claude-service.js',
  '/factureai/pdf-service.js',
  '/factureai/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(() => {
      // Cache may fail on first install — ignore
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Don't intercept Firebase, Vercel API, or Anthropic requests
  const url = event.request.url;
  if (
    url.includes('firebase') ||
    url.includes('googleapis') ||
    url.includes('vercel.app') ||
    url.includes('anthropic') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, toCache);
        });
        return response;
      }).catch(() => {
        // Offline fallback — return cached index.html for navigation requests
        if (event.request.destination === 'document') {
          return caches.match('/factureai/index.html');
        }
      });
    })
  );
});
