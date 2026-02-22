// utils/sw-manager.js - COMPLETE FINAL VERSION WITH COMBINED SERVICE WORKER
console.log('⚡ SW Manager loaded');

// Catch all errors
window.addEventListener('error', function(e) {
  console.log('🔥 Caught error:', e.error);
});

// Simple network detection
let isOnline = navigator.onLine;

// Network status events
window.addEventListener('online', () => {
    isOnline = true;
    console.log('🌐 Online');
    showNotification('Back online', 'success');
});

window.addEventListener('offline', () => {
    isOnline = false;
    console.log('📴 Offline');
    showNotification('You are offline', 'warning');
});

// Register combined service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Determine correct SW path based on current page
        let swPath = 'service-worker.js'; // Now this is the combined file

        if (window.location.pathname.includes('/pages/')) {
            swPath = '../../service-worker.js';
        } else if (window.location.pathname.includes('/utils/')) {
            swPath = '../service-worker.js';
        }

        console.log('Registering Combined SW from:', swPath);

        navigator.serviceWorker.register(swPath)
            .then(function(registration) {
                console.log('✅ Combined Service Worker registered with scope:', registration.scope);
                
                registration.addEventListener('updatefound', () => {
                    console.log('🔄 New Service Worker found');
                });

                if (registration.active) {
                    registration.active.postMessage({ type: 'CLIENT_READY' });
                }
            })
            .catch(function(error) {
                console.log('❌ Service Worker registration failed:', error);
            });
    });
}

// Message Service Worker
function messageSW(message) {
    return new Promise((resolve, reject) => {
        if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
            reject('No Service Worker');
            return;
        }

        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
            resolve(event.data);
            channel.port1.close();
        };

        navigator.serviceWorker.controller.postMessage(message, [channel.port2]);
        setTimeout(() => reject('Timeout'), 5000);
    });
}

// Check game cache status
async function checkGameCache() {
    try {
        const result = await messageSW({ type: 'GET_GAME_STATUS' });
        return result;
    } catch (error) {
        console.log('Game cache check failed:', error);
        return { gameCached: false };
    }
}

// Start game caching
async function cacheGame() {
    try {
        const result = await messageSW({ type: 'AUTO_CACHE_GAME' });
        return result;
    } catch (error) {
        console.log('Game cache start failed:', error);
        return { success: false };
    }
}

// Show notification
function showNotification(message, type = 'info', duration = 3000) {
    try {
        const existing = document.querySelector('.sw-notification');
        if (existing) existing.remove();

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            info: '#3b82f6',
            warning: '#f59e0b'
        };

        const notification = document.createElement('div');
        notification.className = 'sw-notification';
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${colors[type]};
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 9999;
                animation: slideIn 0.3s ease;
                font-family: 'Segoe UI', sans-serif;
                max-width: 300px;
                word-wrap: break-word;
            ">
                ${message}
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, duration);

        if (!document.querySelector('#sw-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'sw-notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    } catch (error) {
        console.log('Error showing notification:', error);
    }
}

// Public API
window.SWManager = {
    isOnline: () => isOnline,
    checkGameCache,
    cacheGame,
    showNotification,
    messageSW
};

// Auto-check game cache on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (isOnline) {
            checkGameCache().then(status => {
                if (!status.gameCached || status.gameFilesCount < status.totalGameFiles) {
                    console.log('🎮 Game not fully cached, starting auto-cache...');
                    cacheGame();
                }
            }).catch(err => {
                console.log('Game cache check error:', err);
            });
        }
    }, 3000);
});

console.log('✅ SW Manager ready');

// ============================================
// WEB PUSH NOTIFICATIONS - USING COMBINED SW
// ============================================

function urlBase64ToUint8Array(base64String) {
    try {
        const base64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        console.log('✅ Key converted, length:', outputArray.length);
        return outputArray;
    } catch (error) {
        console.log('❌ Error converting VAPID key:', error);
        return null;
    }
}

// VAPID Public Key
const VAPID_PUBLIC_KEY = 'BGXg4PCPp477Kc0VYePQf5_DPN2PhwXgpJAItJPHoj8Pq2v2DRyaDpBypuX9MfADIWGuV4EOfw-SC4eP9weFZNc';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJseHRsZGduc3N2YXN1aW5weWl0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzA4MjE4MiwiZXhwIjoyMDgyNjU4MTgyfQ.z5xjJzr47A1qP0uYnBWzRKwQEwG_clgF1VujOfL4r4A';

// Subscribe to push notifications
async function subscribeToPush() {
    try {
        console.log('🔔 Setting up push notifications...');

        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.log('Push not supported');
            return null;
        }

        if (Notification.permission !== 'granted') {
            console.log('Permission not granted yet');
            return null;
        }

        // Get the combined service worker
        const registration = await navigator.serviceWorker.ready;
        console.log('✅ Combined SW ready');

        // Convert VAPID key
        const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        if (!convertedKey) return null;

        // Check existing subscription
        let subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            console.log('✅ Already subscribed');
            return subscription;
        }

        // Subscribe
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
        });

        console.log('✅ New push subscription created');
        return subscription;
    } catch (error) {
        console.log('❌ Push subscription error:', error);
        return null;
    }
}

// Save subscription to database
async function saveSubscription(subscription) {
    try {
        const { data: { user } } = await window.supabase.auth.getUser();
        if (!user) return false;

        const pushId = 'push_' + Date.now() + '_' + Math.random().toString(36).substring(2);

        const response = await fetch('https://blxtldgnssvasuinpyit.supabase.co/functions/v1/register-push-token', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                onesignal_player_id: pushId,
                device_type: 'web-push',
                browser_info: JSON.stringify(subscription),
                user_id: user.id
            })
        });

        const result = await response.json();
        console.log('✅ Push subscription saved:', result);
        showNotification('Notifications enabled!', 'success');
        return true;
    } catch (error) {
        console.log('❌ Error saving subscription:', error);
        return false;
    }
}

// Enable notifications
async function enableNotifications() {
    try {
        const permission = await Notification.requestPermission();
        console.log('Permission result:', permission);

        if (permission === 'granted') {
            const subscription = await subscribeToPush();
            if (subscription) {
                return await saveSubscription(subscription);
            }
            return false;
        } else {
            showNotification('Notification permission denied', 'error');
            return false;
        }
    } catch (error) {
        console.log('❌ Error enabling notifications:', error);
        return false;
    }
}

// Check if already subscribed
async function checkPushStatus() {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        return !!subscription;
    } catch (error) {
        console.log('Error checking push status:', error);
        return false;
    }
}

window.NotificationManager = {
    enable: enableNotifications,
    checkStatus: checkPushStatus
};

console.log('✅ Web Push ready');

// Check status on load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        let attempts = 0;
        const checkSupabase = setInterval(async () => {
            attempts++;
            if (window.supabase?.auth) {
                clearInterval(checkSupabase);
                const { data: { user } } = await window.supabase.auth.getUser();
                if (user) {
                    console.log('User logged in, checking push status...');
                    const hasPush = await checkPushStatus();
                    if (hasPush) console.log('Already has push subscription');
                }
            } else if (attempts > 20) {
                clearInterval(checkSupabase);
                console.log('Supabase not ready after 20 attempts');
            }
        }, 500);
    } catch (error) {
        console.log('Error checking initial status:', error);
    }
});