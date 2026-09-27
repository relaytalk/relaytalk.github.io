// RelayTalk Service Worker - v6.1.0
// Push notifications + offline.html cache only.
// Everything else passes through to the network (no caching).

const OFFLINE_CACHE = 'relaytalk-offline-v1';
const APP_VERSION = '6.1.1';

// Paths to precache — only the offline fallback page.
// Adjust the path if your offline.html lives elsewhere.
const OFFLINE_URL = '/offline.html';
const OFFLINE_URL_ALT = '/www/offline.html';

let isOnline = true;

// ====== INSTALL ======
self.addEventListener('install', event => {
    console.log('⚡ Installing SW v' + APP_VERSION);
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(OFFLINE_CACHE);
                // Try the primary path first, then fall back to the /www/ path.
                try {
                    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
                    console.log('✅ Cached', OFFLINE_URL);
                } catch (e1) {
                    console.warn('⚠️ Could not cache', OFFLINE_URL, '— trying alt');
                    try {
                        await cache.add(new Request(OFFLINE_URL_ALT, { cache: 'reload' }));
                        console.log('✅ Cached', OFFLINE_URL_ALT);
                    } catch (e2) {
                        console.warn('⚠️ Could not cache offline.html at any known path');
                    }
                }
            } catch (e) {
                console.warn('⚠️ Install cache error:', e);
            }
            self.skipWaiting();
        })()
    );
});

// ====== ACTIVATE ======
self.addEventListener('activate', event => {
    console.log('🔄 Activating SW v' + APP_VERSION);
    event.waitUntil(
        (async () => {
            // Delete every cache EXCEPT the one that holds offline.html.
            const names = await caches.keys();
            await Promise.all(
                names.map(n => {
                    if (n !== OFFLINE_CACHE) {
                        return caches.delete(n);
                    }
                    return Promise.resolve();
                })
            );
            console.log('✅ Old caches cleared (kept:', OFFLINE_CACHE + ')');

            await self.clients.claim();

            // Let open pages know we're ready.
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({ type: 'SW_READY', version: APP_VERSION });
            });
        })()
    );
});

// ============================================================
// PUSH — unchanged behaviour
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
// NOTIFICATION CLICK — unchanged behaviour
// ============================================================
self.addEventListener('notificationclick', function (event) {
    console.log('📬 [SW] Click:', event.action);
    event.notification.close();

    if (event.action === 'dismiss') return;

    const targetUrl = (event.notification.data && event.notification.data.url) || '/pages/home/index.html';

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
// FETCH — pass-through, EXCEPT for navigations when offline.
// ============================================================
// Rule: never cache anything except offline.html.
// Behaviour:
//   • Non-navigation requests → untouched (browser handles).
//   • Navigation requests:
//       - Try network first.
//       - On failure (offline / ERR_INTERNET_DISCONNECTED),
//         serve cached offline.html.
// ============================================================
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Only intercept top-level navigations. Everything else (XHR, images,
    // scripts, CSS, fonts, API calls) passes straight through to the network.
    if (req.mode !== 'navigate') return;

    // Only handle GETs. POST/others fall through.
    if (req.method !== 'GET') return;

    // Don't intercept requests to our own offline.html (would recurse).
    try {
        const u = new URL(req.url);
        if (u.pathname.endsWith('/offline.html')) return;
    } catch (e) {
        // If URL parsing fails, just let it pass through.
        return;
    }

    event.respondWith(
        (async () => {
            try {
                // Network-first for navigations.
                const networkResp = await fetch(req);
                return networkResp;
            } catch (err) {
                // Network failed — serve the offline fallback.
                console.log('📴 [SW] Navigation failed, serving offline.html');
                const cache = await caches.open(OFFLINE_CACHE);

                let cached =
                    (await cache.match(OFFLINE_URL)) ||
                    (await cache.match(OFFLINE_URL_ALT));

                if (cached) {
                    return cached;
                }

                // Last resort: minimal inline HTML so the user never sees
                // the WebView's default "Web page not available" screen.
                return new Response(
                    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
                    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
                    '<title>Offline · RelayTalk</title>' +
                    '<style>html,body{height:100%;margin:0;display:flex;align-items:center;' +
                    'justify-content:center;font-family:sans-serif;color:#0a2540;background:#fff}' +
                    '.c{text-align:center;padding:24px}h2{margin:0 0 8px;font-weight:500}' +
                    'p{color:#5f6368;margin:0 0 20px;font-size:.95rem}' +
                    'button{padding:12px 22px;border-radius:12px;background:#007acc;color:#fff;' +
                    'border:none;font-size:.95rem;font-weight:500;cursor:pointer}</style>' +
                    '</head><body><div class="c"><h2>No Internet Connection</h2>' +
                    '<p>Check your Wi-Fi or mobile data and try again.</p>' +
                    '<button onclick="location.reload()">Retry</button></div></body></html>',
                    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                );
            }
        })()
    );
});

// ============================================================
// MESSAGE HANDLER — unchanged API
// ============================================================
self.addEventListener('message', event => {
    const { type } = event.data || {};

    switch (type) {
        case 'PING':
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({ pong: true, version: APP_VERSION });
            }
            break;

        case 'GET_STATUS':
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({
                    version: APP_VERSION,
                    online: isOnline,
                    totalCached: 1 // we always keep offline.html
                });
            }
            break;

        case 'CLEAR_CACHE_EXCEPT_OFFLINE':
            // Utility: keep only offline.html cached.
            event.waitUntil(
                (async () => {
                    const names = await caches.keys();
                    await Promise.all(
                        names.map(n => (n !== OFFLINE_CACHE ? caches.delete(n) : Promise.resolve()))
                    );
                })()
            );
            break;
    }
});

// ============================================================
// SUBSCRIPTION CHANGE
// ============================================================
self.addEventListener('pushsubscriptionchange', () => {
    console.log('📬 [SW] Subscription expired');
});

// ============================================================
// ONLINE / OFFLINE TRACKING
// ============================================================
self.addEventListener('online', () => {
    isOnline = true;
});

self.addEventListener('offline', () => {
    isOnline = false;
});

console.log('🚀 RelayTalk SW v' + APP_VERSION + ' loaded (offline.html cached only)');