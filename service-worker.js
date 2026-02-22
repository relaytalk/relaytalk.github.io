// RelayTalk Combined Service Worker - v5.0 (Caching + Push Notifications)
const CACHE_NAME = 'relaytalk-cache-v5-0';
const OFFLINE_URL = '/offline/index.html';
const APP_VERSION = '5.0.0';

// ====== ACTUAL GAME FILES (FROM YOUR FOLDER) ======
const CAR_GAME_FILES = [
  '/cargame/index.html',
  '/cargame/style.css',
  '/cargame/script.js',
  '/cargame/manifest.json',
  '/cargame/service-worker.js',
  '/cargame/cargame192.png',
  '/cargame/cargame512.png',
  '/cargame/cargamebg.mp3',
  '/cargame/shieldcargame.mp3'
];

// ====== ALL FILES TO CACHE ======
const FILES_TO_CACHE = [
  // Essential app files
  '/',
  '/index.html',
  '/offline/index.html',
  '/relay.png',
  // Car Game Files
  '/cargame',
  ...CAR_GAME_FILES
];

// Track caching progress
let cacheProgress = {
  total: FILES_TO_CACHE.length,
  completed: 0,
  currentFile: '',
  isCaching: false
};

let isOnline = true;

// ====== INSTALL EVENT ======
self.addEventListener('install', event => {
  console.log('⚡ Installing Combined Service Worker v' + APP_VERSION);
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache essential files immediately
        const essentialFiles = [
          '/',
          '/index.html',
          '/offline/index.html',
          '/relay.png'
        ];

        return cache.addAll(essentialFiles)
          .then(() => {
            console.log('✅ Essential files cached');
            // Start auto-caching game in background
            setTimeout(() => {
              autoCacheGameFiles();
            }, 1000);
          });
      })
  );
});

// ====== ACTIVATE EVENT ======
self.addEventListener('activate', event => {
  console.log('🔄 Activating Combined Service Worker v' + APP_VERSION);

  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME) {
              console.log('🗑️ Deleting old cache:', cache);
              return caches.delete(cache);
            }
          })
        );
      }),
      self.clients.claim(),
      // Auto-cache game after activation
      new Promise(resolve => {
        setTimeout(() => {
          if (isOnline) {
            autoCacheGameFiles();
          }
          resolve();
        }, 3000);
      })
    ]).then(() => {
      console.log('✅ Combined Service Worker ready');
      // Notify all clients
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ 
            type: 'SW_READY', 
            version: APP_VERSION 
          });
        });
      });
    })
  );
});

// ====== PUSH NOTIFICATION EVENT ======
self.addEventListener('push', event => {
  console.log('📨 Push received:', event);
  
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
      console.log('📨 Push data:', data);
    } catch (e) {
      data = {
        title: 'RelayTalk',
        body: event.data.text()
      };
    }
  }

  const options = {
    body: data.body || 'New message',
    icon: data.icon || '/relay.png',
    badge: data.badge || '/favicon.ico',
    vibrate: data.vibrate || [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [
      { action: 'open', title: 'Open Chat' }
    ],
    requireInteraction: true,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'RelayTalk',
      options
    )
  );
});

// ====== NOTIFICATION CLICK EVENT ======
self.addEventListener('notificationclick', event => {
  console.log('📨 Notification clicked:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || 'https://relaytalk.github.io/pages/chats/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientList => {
      // Check if there's already a window open
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url.includes('relaytalk.github.io') && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ====== AUTO-CACHE GAME FUNCTION ======
async function autoCacheGameFiles() {
  if (!isOnline) {
    console.log('⚠️ Cannot cache - offline');
    return { success: false, message: 'Offline' };
  }

  if (cacheProgress.isCaching) {
    console.log('⚠️ Already caching');
    return { success: false, message: 'Already in progress' };
  }

  cacheProgress.isCaching = true;
  cacheProgress.currentFile = 'Starting...';
  cacheProgress.completed = 0;
  cacheProgress.total = CAR_GAME_FILES.length;

  console.log('🚗 Starting auto-cache of car game...');
  console.log('Game files to cache:', CAR_GAME_FILES);

  broadcastProgress();

  try {
    const cache = await caches.open(CACHE_NAME);
    let cachedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < CAR_GAME_FILES.length; i++) {
      const fileUrl = CAR_GAME_FILES[i];
      cacheProgress.currentFile = fileUrl;
      cacheProgress.completed = i + 1;

      broadcastProgress();

      try {
        const alreadyCached = await cache.match(fileUrl);
        if (alreadyCached) {
          console.log(`✅ Already cached: ${fileUrl}`);
          cachedCount++;
          continue;
        }

        const response = await fetch(fileUrl, {
          headers: { 'Accept': '*/*' }
        });

        if (response.ok) {
          await cache.put(fileUrl, response);
          console.log(`✅ Cached: ${fileUrl}`);
          cachedCount++;
        } else {
          console.warn(`⚠️ Failed to fetch: ${fileUrl} (${response.status})`);
          failedCount++;
        }
      } catch (error) {
        console.warn(`⚠️ Error caching ${fileUrl}:`, error.message);
        failedCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    cacheProgress.isCaching = false;
    cacheProgress.currentFile = 'Complete!';
    cacheProgress.completed = CAR_GAME_FILES.length;

    console.log(`🎮 Game caching complete: ${cachedCount} files cached, ${failedCount} failed`);

    broadcastProgress();

    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'GAME_CACHED',
          success: true,
          cachedCount: cachedCount,
          totalCount: CAR_GAME_FILES.length
        });
      });
    });

    return {
      success: true,
      message: `Cached ${cachedCount}/${CAR_GAME_FILES.length} game files`,
      cachedCount: cachedCount,
      failedCount: failedCount
    };

  } catch (error) {
    cacheProgress.isCaching = false;
    console.error('❌ Game caching failed:', error);

    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'GAME_CACHE_ERROR',
          error: error.message
        });
      });
    });

    return { success: false, message: error.message };
  }
}

// ====== FETCH EVENT ======
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // ====== OFFLINE REDIRECT ======
  if ((path === '/' || path === '/index.html') && !isOnline) {
    console.log('📴 Offline - redirecting to car game...');
    event.respondWith(
      caches.match('/cargame/index.html')
        .then(cachedGame => cachedGame || caches.match(OFFLINE_URL))
    );
    return;
  }

  // ====== CAR GAME FILES ======
  if (path.includes('/cargame')) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;

          return fetch(event.request)
            .then(response => {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
              return response;
            })
            .catch(() => caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // ====== DEFAULT: NETWORK FIRST ======
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ====== MESSAGE HANDLING ======
self.addEventListener('message', event => {
  const { type } = event.data;

  switch (type) {
    case 'AUTO_CACHE_GAME':
      autoCacheGameFiles().then(result => {
        if (event.ports?.[0]) event.ports[0].postMessage(result);
      });
      break;

    case 'GET_GAME_STATUS':
      caches.open(CACHE_NAME)
        .then(cache => cache.keys())
        .then(keys => {
          const gameFiles = keys.filter(k => k.url.includes('/cargame')).length;
          if (event.ports?.[0]) {
            event.ports[0].postMessage({
              gameCached: gameFiles > 0,
              gameFilesCount: gameFiles,
              totalGameFiles: CAR_GAME_FILES.length,
              version: APP_VERSION
            });
          }
        });
      break;

    case 'GET_PROGRESS':
      if (event.ports?.[0]) {
        event.ports[0].postMessage({
          type: 'PROGRESS_UPDATE',
          progress: {
            total: cacheProgress.total,
            completed: cacheProgress.completed,
            percentage: Math.round((cacheProgress.completed / cacheProgress.total) * 100),
            currentFile: cacheProgress.currentFile,
            isCaching: cacheProgress.isCaching
          }
        });
      }
      break;

    case 'GET_STATUS':
      caches.open(CACHE_NAME)
        .then(cache => cache.keys())
        .then(keys => {
          const gameFiles = keys.filter(k => k.url.includes('/cargame')).length;
          if (event.ports?.[0]) {
            event.ports[0].postMessage({
              version: APP_VERSION,
              online: isOnline,
              totalCached: keys.length,
              gameCached: gameFiles,
              totalGameFiles: CAR_GAME_FILES.length,
              isCaching: cacheProgress.isCaching
            });
          }
        });
      break;

    case 'PING':
      if (event.ports?.[0]) {
        event.ports[0].postMessage({ pong: true, version: APP_VERSION });
      }
      break;
  }
});

// ====== BROADCAST PROGRESS ======
function broadcastProgress() {
  const percentage = Math.round((cacheProgress.completed / cacheProgress.total) * 100);

  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      try {
        client.postMessage({
          type: 'CACHE_PROGRESS',
          progress: {
            total: cacheProgress.total,
            completed: cacheProgress.completed,
            percentage: percentage,
            currentFile: cacheProgress.currentFile,
            isCaching: cacheProgress.isCaching
          }
        });
      } catch (error) {}
    });
  });
}

// ====== ONLINE/OFFLINE EVENTS ======
self.addEventListener('online', () => {
  isOnline = true;
  console.log('🌐 Online - checking game cache...');

  setTimeout(() => {
    caches.open(CACHE_NAME)
      .then(cache => cache.keys())
      .then(keys => {
        const gameFiles = keys.filter(k => k.url.includes('/cargame')).length;
        if (gameFiles < CAR_GAME_FILES.length) {
          console.log(`🔄 Game incomplete (${gameFiles}/${CAR_GAME_FILES.length}), auto-caching...`);
          autoCacheGameFiles();
        }
      });
  }, 2000);
});

self.addEventListener('offline', () => {
  isOnline = false;
  console.log('📴 Offline - game will be served if cached');
});

console.log('🚀 Combined RelayTalk Service Worker v' + APP_VERSION + ' loaded');
console.log(`🎮 Will auto-cache ${CAR_GAME_FILES.length} game files`);
console.log('🔔 Push notifications enabled');