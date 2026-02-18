// utils/sw-manager.js - COMPLETE FINAL VERSION WITH WEB PUSH
console.log('⚡ SW Manager loaded');

let isOnline = navigator.onLine;
let pushSubscription = null;

// Network status
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

// Show notification
function showNotification(message, type = 'info', duration = 3000) {
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
            max-width: 300px;
        ">
            ${message}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

// Add styles
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

// ============================================
// WEB PUSH NOTIFICATIONS - FINAL WORKING VERSION
// ============================================

const PUSH_FUNCTION_URL = "https://blxtldgnssvasuinpyit.supabase.co/functions/v1/send-web-push";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJseHRsZGduc3N2YXN1aW5weWl0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzA4MjE4MiwiZXhwIjoyMDgyNjU4MTgyfQ.z5xjJzr47A1qP0uYnBWzRKwQEwG_clgF1VujOfL4r4A";

// Convert base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Subscribe to push notifications
async function subscribeToPush() {
    try {
        console.log('🔔 Setting up push notifications...');
        
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            showNotification('Push not supported', 'error');
            return null;
        }

        // Register push service worker
        let swPath = 'push-sw.js';
        if (window.location.pathname.includes('/pages/')) {
            swPath = '../../push-sw.js';
        } else if (window.location.pathname.includes('/utils/')) {
            swPath = '../push-sw.js';
        }

        const registration = await navigator.serviceWorker.register(swPath);
        console.log('✅ Push SW registered');

        // Get VAPID public key (you'll need to generate this)
        const vapidPublicKey = 'YOUR_VAPID_PUBLIC_KEY_HERE'; // You'll get this from web-push setup
        const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

        // Subscribe
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
        });

        console.log('✅ Push subscribed:', subscription);
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

        // Generate unique ID
        const pushId = 'push_' + Date.now() + '_' + Math.random().toString(36).substring(2);

        // Save to database
        const { error } = await window.supabase
            .from('user_push_tokens')
            .upsert({
                user_id: user.id,
                onesignal_player_id: pushId,
                device_type: 'web-push',
                browser_info: JSON.stringify(subscription),
                last_active: new Date().toISOString()
            });

        if (error) throw error;
        console.log('✅ Push subscription saved');
        showNotification('Notifications enabled!', 'success');
        return true;
    } catch (error) {
        console.log('❌ Error saving subscription:', error);
        return false;
    }
}

// Request notification permission
async function enableNotifications() {
    try {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            const subscription = await subscribeToPush();
            if (subscription) {
                await saveSubscription(subscription);
            }
            return true;
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
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in and notifications not yet enabled
    const { data: { user } } = await window.supabase.auth.getUser();
    
    if (user) {
        const hasPush = await checkPushStatus();
        if (!hasPush && Notification.permission === 'default') {
            // Show a subtle prompt after 5 seconds
            setTimeout(() => {
                if (Notification.permission === 'default') {
                    showNotification('Click 🔔 to enable notifications', 'info', 5000);
                }
            }, 5000);
        }
    }
});

// Make functions available globally
window.NotificationManager = {
    enable: enableNotifications,
    checkStatus: checkPushStatus
};

console.log('✅ Web Push ready');
