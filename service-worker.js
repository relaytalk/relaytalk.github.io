// RelayTalk Service Worker - v5.2.0
// Caching + Rich Push Notifications

const CACHE_NAME = 'relaytalk-cache-v5-2';
const APP_VERSION = '5.2.0';
const OFFLINE_URL = '/offline/index.html';

// ====== STATIC FILES =====
const CAR_GAME_FILES = [
    '/cargame/index.html',
    '/cargame/style.css',
    '/cargame/script.js',
    '/cargame/manifest.json',
    '/cargame/cargame192.png',
    '/cargame/cargame512.png'
];

const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/offline/index.html',
    '/relay.png',
    ...CAR_GAME_FILES
];

let cacheProgress = {
    total: FILES_TO_CACHE.length,
    completed: 0,
    currentFile: '',
    isCaching: false
};

let isOnline = true;

// ====== INSTALL ======
self.addEventListener('install', event => {
    console.log('⚡ Installing SW v' + APP_VERSION);
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(['/', '/index.html', '/relay.png']).catch(() => {}))
    );
});

// ====== ACTIVATE ======
self.addEventListener('activate', event => {
    console.log('🔄 Activating SW v' + APP_VERSION);
    event.waitUntil(
        Promise.all([
            caches.keys().then(names => Promise.all(
                names.map(n => n !== CACHE_NAME ? caches.delete(n) : null)
            )),
            self.clients.claim()
        ]).then(() => {
            console.log('✅ SW ready');
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SW_READY', version: APP_VERSION });
                });
            });
        })
    );
});

// ============================================================
// PUSH — RICH RENDERING
// ============================================================
self.addEventListener('push', function (event) {
    console.log('📬 [SW] Push received');

    let data = {
        title: 'RelayTalk',
        body: 'You have a new notification',
        icon: '/relay.png',
        badge: '/relay.png',
        url: '/pages/home/index.html',
        tag: 'relaytalk-' + Date.now()
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        } catch (e) {
            try {
                const text = event.data.text();
                if (text) data.body = text;
            } catch (_) {}
        }
    }

    console.log('📬 [SW] Rendering:', data.title, '/', data.body);

    const options = {
        body: data.body,
        icon: data.icon || '/relay.png',
        badge: data.badge || '/relay.png',
        tag: data.tag,
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        silent: false,
        timestamp: data.timestamp || Date.now(),
        data: {
            url: data.url || '/pages/home/index.html',
            receivedAt: Date.now()
        },
        actions: [
            { action: 'open', title: 'Open' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ============================================================
// NOTIFICATION CLICK
// ============================================================
self.addEventListener('notificationclick', function (event) {
    console.log('📬 [SW] Click:', event.action);
    event.notification.close();

    if (event.action === 'dismiss') return;

    const targetUrl = event.notification.data?.url || '/pages/home/index.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// ============================================================
// FETCH — network first, cache fallback
// ============================================================
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Don't interfere with API calls
    if (url.pathname.startsWith('/api/') ||
        url.hostname.includes('supabase') ||
        url.hostname.includes('imgbb')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, clone))
                    .catch(() => {});
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ============================================================
// MESSAGE HANDLER
// ============================================================
self.addEventListener('message', event => {
    const { type } = event.data || {};

    switch (type) {
        case 'PING':
            if (event.ports?.[0]) {
                event.ports[0].postMessage({ pong: true, version: APP_VERSION });
            }
            break;

        case 'GET_STATUS':
            caches.open(CACHE_NAME).then(cache => cache.keys()).then(keys => {
                if (event.ports?.[0]) {
                    event.ports[0].postMessage({
                        version: APP_VERSION,
                        online: isOnline,
                        totalCached: keys.length
                    });
                }
            });
            break;

        case 'AUTO_CACHE_GAME':
            if (event.ports?.[0]) {
                event.ports[0].postMessage({ success: true, message: 'Disabled' });
            }
            break;

        case 'GET_GAME_STATUS':
            if (event.ports?.[0]) {
                event.ports[0].postMessage({
                    gameCached: false,
                    gameFilesCount: 0,
                    totalGameFiles: CAR_GAME_FILES.length,
                    version: APP_VERSION
                });
            }
            break;

        case 'GET_PROGRESS':
            if (event.ports?.[0]) {
                event.ports[0].postMessage({
                    type: 'PROGRESS_UPDATE',
                    progress: {
                        total: cacheProgress.total,
                        completed: cacheProgress.completed,
                        percentage: 0,
                        currentFile: '',
                        isCaching: false
                    }
                });
            }
            break;
    }
});

// ============================================================
// SUBSCRIPTION EXPIRED
// ============================================================
self.addEventListener('pushsubscriptionchange', () => {
    console.log('📬 [SW] Subscription expired');
});

self.addEventListener('online', () => { isOnline = true; });
self.addEventListener('offline', () => { isOnline = false; });

console.log('🚀 RelayTalk SW v' + APP_VERSION + ' loaded');
console.log('🔔 Push notifications ready');
