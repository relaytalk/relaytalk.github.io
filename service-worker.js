// Service Worker for RelayTalk - Caches Everything
const CACHE_NAME = 'relaytalk-cache-v20';
const APP_VERSION = '1.0.0';

// Cache ALL files from these folder
const FOLDERS_TO_CACHE = [
  // Root files
  '/app/',
  '/app/index.html',
  '/app/style.css',
  '/app/opening.css',
  '/app/utils/auth.js',
  '/app/utils/supabase.js',
  '/app/relay.png',
  '/app/manifest.json',
  '/app/service-worker.js',
  
  // Auth folder
  '/app/pages/auth/',
  '/app/pages/auth/index.html',
  '/app/pages/auth/style.css',
  '/app/pages/auth/script.js',
  
  // Login folder
  '/app/pages/login/',
  '/app/pages/login/index.html',
  '/app/pages/login/style.css',
  '/app/pages/login/script.js',
  
  // Home folder
  '/app/pages/home/',
  '/app/pages/home/index.html',
  '/app/pages/home/style.css',
  '/app/pages/home/script.js',
  
  // Chats folder
  '/app/pages/chats/',
  '/app/pages/chats/index.html',
  '/app/pages/chats/style.css',
  '/app/pages/chats/script.js',
];

// Install - Cache everything
self.addEventListener('install', event => {
  console.log('📦 Installing Service Worker, caching all files...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Opening cache:', CACHE_NAME);
        return cache.addAll(FOLDERS_TO_CACHE);
      })
      .then(() => {
        console.log('✅ All files cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ Cache failed:', error);
      })
  );
});

// Activate - Clean old caches
self.addEventListener('activate', event => {
  console.log('⚡ Service Worker activated');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - Serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip Supabase API calls
  if (event.request.url.includes('supabase.co')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached version if available
        if (cachedResponse) {
          console.log('📂 Serving from cache:', event.request.url);
          return cachedResponse;
        }
        
        // Otherwise fetch from network
        console.log('🌐 Fetching from network:', event.request.url);
        return fetch(event.request)
          .then(networkResponse => {
            // Cache the new response for future
            return caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
              });
          })
          .catch(() => {
            // If offline and HTML request, show offline page
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/app/index.html');
            }
          });
      })
  );
});

// Listen for messages from the app
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});