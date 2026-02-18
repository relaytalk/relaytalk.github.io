// push-sw.js - Service worker for push notifications
self.addEventListener('push', function(event) {
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

self.addEventListener('notificationclick', function(event) {
  console.log('📨 Notification clicked:', event);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || 'https://relaytalk.github.io/pages/chats/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(clientList) {
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

// Log when service worker is installed/activated
self.addEventListener('install', function(event) {
  console.log('✅ Push SW installed');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('✅ Push SW activated');
  event.waitUntil(clients.claim());
});
