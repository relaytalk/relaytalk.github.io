// RelayTalk Service Worker - v5.1.0 (Caching + Push Notifications)
const CACHE_NAME = 'relaytalk-cache-v5-1';
const OFFLINE_URL = '/offline/index.html';
const APP_VERSION = '5.1.0';

// ====== GAME FILES TO CACHE ======
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

// ====== PUSH — THE ONLY HANDLER ======
self.addEventListener('push', function (event) {
    console.log('📬 [SW] Push received');

    let data = {
        title: 'RelayTalk',
        body: 'You have a new notification',
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

    console.log('📬 [SW] Showing:', data.title, '-', data.body);

    const options = {
        body: data.body,
        icon: '/relay.png',
        badge: '/relay.png',
        tag: data.tag,
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        data: { url: data.url || '/pages/home/index.html' }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ====== NOTIFICATION CLICK — THE ONLY HANDLER ======
self.addEventListener('notificationclick', function (event) {
    console.log('📬 [SW] Notification clicked');
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/pages/home/index.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Focus any existing window from our origin
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

// ====== FETCH — network first, cache fallback ======
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Don't interfere with Supabase or external APIs
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

// ====== MESSAGE HANDLER ======
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
    }
});

self.addEventListener('online', () => { isOnline = true; });
self.addEventListener('offline', () => { isOnline = false; });

self.addEventListener('pushsubscriptionchange', () => {
    console.log('📬 [SW] Subscription expired');
});

console.log('🚀 RelayTalk SW v' + APP_VERSION + ' loaded');
console.log('🔔 Push notifications ready');
