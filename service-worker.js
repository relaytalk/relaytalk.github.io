// Service Worker for RelayTalk - Caches Everything
const CACHE_NAME = 'relaytalk-cache-v21'; // Bumped version
const APP_VERSION = '1.0.1';

// Cache ALL files from the root now
const FOLDERS_TO_CACHE = [
  // Root files
  '/',
  '/index.html',
  '/style.css',
  '/opening.css',
  '/utils/auth.js',
  '/utils/supabase.js',
  '/relay.png',
  '/manifest.json',
  '/service-worker.js',
  
  // Auth folder
  '/pages/auth/',
  '/pages/auth/index.html',
  '/pages/auth/style.css',
  '/pages/auth/script.js',
  
  // Login folder
  '/pages/login/',
  '/pages/login/index.html',
  '/pages/login/style.css',
  '/pages/login/script.js',
  
  // Home folder
  '/pages/home/',
  '/pages/home/index.html',
  '/pages/home/style.css',
  '/pages/home/script.js',
  
  // Chats folder
  '/pages/chats/',
  '/pages/chats/index.html',
  '/pages/chats/style.css',
  '/pages/chats/script.js',
];

// Install - Cache everything
self.addEventListener('install', event => {
  console.log('📦 Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(FOLDERS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate - Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Serve from cache, fallback to network
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(event.request).then(networkResponse => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }).catch(() => {
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/');
          }
        });
      })
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
