// AIgent Rise Service Worker — offline caching
const CACHE = 'aigent-rise-v9';
const FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/aigent-icon.svg',
];

// Install: pre-cache core files
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(FILES).catch(function() {});
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network first, fallback to cache, fallback to offline page
self.addEventListener('fetch', function(e) {
  // Only handle GET requests
  if (e.request.method !== 'GET') return;
  // Skip non-http requests (chrome-extension:// etc.)
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request).then(function(response) {
      // Cache successful responses
      if (response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request).then(function(cached) {
        return cached || caches.match('/');
      });
    })
  );
});
