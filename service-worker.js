/**
 * TravelMate — service-worker.js
 *
 * Strategy: NETWORK-FIRST for app shell files.
 * Always fetches fresh files from the server.
 * Falls back to cache ONLY when the user is offline.
 *
 * This means updates go live immediately for all users
 * including those who installed the PWA — no manual
 * cache clearing needed.
 */

const CACHE_NAME = 'travelmate-cache-v3';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/apple-touch-icon.png',
];

/* Install — pre-cache app shell for offline fallback */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    })
  );
  // Take control immediately without waiting for old SW to die
  self.skipWaiting();
});

/* Activate — delete ALL old caches so stale files are gone */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          // Delete every cache — including same-name old entries
          return caches.delete(key);
        })
      );
    }).then(function () {
      // Re-cache fresh files after clearing old ones
      return caches.open(CACHE_NAME).then(function (cache) {
        return cache.addAll(CORE_ASSETS);
      });
    })
  );
  // Claim all open tabs immediately
  self.clients.claim();
});

/* Fetch — NETWORK FIRST strategy
   1. Try to get the file from the network (always fresh)
   2. Update the cache with the fresh response
   3. If network fails (offline), serve from cache
   4. External resources (map tiles, OSM, OSRM) pass through untouched */
self.addEventListener('fetch', function (event) {
  // Only handle same-origin GET requests for app shell files
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);
  var isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return; // let external requests pass through normally

  event.respondWith(
    fetch(event.request)
      .then(function (networkResponse) {
        // Got a fresh response — update the cache in the background
        if (networkResponse && networkResponse.status === 200) {
          var responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(function () {
        // Network failed (offline) — serve from cache
        return caches.match(event.request).then(function (cached) {
          return cached || new Response(
            '<h2 style="font-family:sans-serif;text-align:center;padding:40px">You are offline. Please reconnect to use TravelMate.</h2>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });
      })
  );
});

/* Listen for SKIP_WAITING message from the page so we can
   update immediately when a new service worker is waiting */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
