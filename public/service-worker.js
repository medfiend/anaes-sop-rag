// AnaesSOP Service Worker — v1.0.0
const CACHE_NAME = 'anaessop-v1';
const STATIC_CACHE = 'anaessop-static-v1';
const API_CACHE = 'anaessop-api-v1';

// App shell files to pre-cache on install
const APP_SHELL = [
  '/',
  '/manifest.json',
];

// Install event — pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  const CURRENT_CACHES = [CACHE_NAME, STATIC_CACHE, API_CACHE, 'anaessop-pdf-v1'];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event — network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Clerk auth endpoints
  if (url.pathname.startsWith('/clerk') || url.hostname.includes('clerk')) return;

  // API requests: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    // Intercept PDF requests with Cache-First strategy for rapid local offline performance
    if (url.pathname === '/api/pdf') {
      event.respondWith(
        caches.match(request).then((cached) => {
          return cached || fetch(request);
        })
      );
      return;
    }

    // Only cache the guidelines list endpoint
    if (url.pathname === '/api/guidelines') {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(API_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => {
            return caches.match(request).then((cached) => {
              return cached || new Response(
                JSON.stringify({ success: false, error: 'You are offline. Cached guidelines may be available.' }),
                { headers: { 'Content-Type': 'application/json' } }
              );
            });
          })
      );
    }
    // Don't cache other API routes
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match('/') || new Response(
            '<html><body style="background:#020617;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><h1 style="color:#0d9488">AnaesSOP</h1><p>You are currently offline.</p><p>Please check your connection and try again.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }
});
