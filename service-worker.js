// RelayTalk Service Worker - v6.0.0
// Push notifications only. NO page caching.
// This ensures the browser/APK always tries the network,
// so when a user is offline, the offline page is shown
// instead of a stale cached version.

const CACHE_NAME = 'relaytalk-noop-v6'; // Kept only to clean up old caches
const APP_VERSION = '6.0.0';

let isOnline = true;

// ====== INSTALL ======
self.addEventListener('install', event => {
    console.log('⚡ Installing SW v' + APP_VERSION + ' (no caching)');
    self.skipWaiting();
});

// ====== ACTIVATE ======
self.addEventListener('activate', event => {
    console.log('🔄 Activating SW v' + APP_VERSION);
    event.waitUntil(
        // Delete every cache we previously created — nothing should be cached
        caches.keys().then(names => Promise.all(
            names.map(n => caches.delete(n))
        )).then(() => {
            console.log('✅ All caches cleared');
            return self.clients.claim();
        }).then(() => {
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SW_READY', version: APP_VERSION });
                });
            });
        })
    );
});

// ============================================================
// PUSH — unchanged, still supports title, body, icon, badge, image, url, tag
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

    console.log('📬 [SW] Rendering:', data.title, '/', data.body, '/ img:', data.image || 'none');

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
        }
    };

    if (data.image) {
        options.image = data.image;
    }

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ============================================================
// NOTIFICATION CLICK — unchanged
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
// FETCH — pass-through only, no caching
// ============================================================
// We deliberately do NOT call event.respondWith().
// That means the browser handles every request natively:
//   - online  → goes to network, gets fresh content
//   - offline → browser/WebView shows its own offline state,
//               which lets our offline-detector.js run on
//               the current page or our offline page take over.
//
// Anything we cached would fight the offline page and serve
// stale content instead. So we cache nothing.

// (No 'fetch' listener at all — the browser does the right thing.)

// ============================================================
// MESSAGE HANDLER — unchanged API for compatibility
// ============================================================
self.addEventListener('message', event => {
    const { type } = event.data || {};

    switch (type) {
        case 'PING':
            if (event.ports?.[0]) event.ports[0].postMessage({ pong: true, version: APP_VERSION });
            break;
        case 'GET_STATUS':
            // No caches now, so totalCached is always 0
            if (event.ports?.[0]) {
                event.ports[0].postMessage({
                    version: APP_VERSION,
                    online: isOnline,
                    totalCached: 0
                });
            }
            break;
    }
});

self.addEventListener('pushsubscriptionchange', () => {
    console.log('📬 [SW] Subscription expired');
});

self.addEventListener('online', () => { isOnline = true; });
self.addEventListener('offline', () => { isOnline = false; });

console.log('🚀 RelayTalk SW v' + APP_VERSION + ' loaded (no caching)');