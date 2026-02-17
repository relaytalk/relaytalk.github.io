// utils/sw-manager.js - COMPLETE FIXED VERSION WITH ONESIGNAL
console.log('⚡ SW Manager loaded');

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

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Determine correct SW path based on current page
        let swPath = 'service-worker.js';
        
        // If we're in pages folder, go up two levels
        if (window.location.pathname.includes('/pages/')) {
            swPath = '../../service-worker.js';
        }
        // If we're in utils folder
        else if (window.location.pathname.includes('/utils/')) {
            swPath = '../service-worker.js';
        }
        
        console.log('Registering SW from:', swPath);
        
        navigator.serviceWorker.register(swPath)
            .then(function(registration) {
                console.log('✅ Service Worker registered with scope:', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    console.log('🔄 New Service Worker found');
                });
                
                // Send ready message to SW
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
    // Remove existing notifications
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
    
    // Auto remove
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
    
    // Add styles if not present
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
            });
        }
    }, 3000);
});

console.log('✅ SW Manager ready');

// ============================================
// ONESIGNAL PUSH NOTIFICATION INTEGRATION
// ============================================

// OneSignal Configuration
const ONESIGNAL_APP_ID = "57235c48-d945-4cd6-9b7e-5e3823144539";
const REGISTER_FUNCTION_URL = "https://blxtldgnssvasuinpyit.supabase.co/functions/v1/register-push-token";

// Initialize OneSignal
function initOneSignal() {
    console.log('🔔 Initializing OneSignal...');
    
    // Load OneSignal SDK if not already loaded
    if (!document.querySelector('script[src*="onesignal"]')) {
        const script = document.createElement('script');
        script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
        script.defer = true;
        document.head.appendChild(script);
    }
    
    // Setup OneSignal initialization
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
        await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            safari_web_id: "web.onesignal.auto.445d0d2a-d94a-41a6-9db5-6271b7cfba3f",
            notifyButton: {
                enable: true,
            },
            serviceWorkerPath: "/OneSignalSDK.sw.js",
            serviceWorkerParam: { scope: "/" },
            allowLocalhostAsSecureOrigin: true,
        });
        
        console.log('✅ OneSignal initialized');
        
        // After OneSignal is ready, register push token if user is logged in
        setTimeout(checkAndRegisterPushToken, 2000);
    });
}

// Register push token with Supabase
async function registerPushToken() {
    try {
        console.log('📱 Attempting to register push token...');
        
        // Check if Supabase is available
        if (!window.supabase?.auth) {
            console.log('⏳ Supabase not ready');
            return false;
        }

        // Check if user is logged in
        const { data: { user }, error } = await window.supabase.auth.getUser();
        
        if (error || !user) {
            console.log('👤 No user logged in');
            return false;
        }

        console.log('👤 User:', user.email);

        // Check OneSignal
        if (!window.OneSignal) {
            console.log('⏳ OneSignal not ready');
            return false;
        }

        // Get OneSignal player ID
        let playerId;
        try {
            playerId = await window.OneSignal.User.PushSubscription.getId();
        } catch (e) {
            console.log('⏳ Getting OneSignal ID...');
            return false;
        }
        
        if (!playerId) {
            console.log('⏳ No OneSignal ID yet');
            return false;
        }

        console.log('📱 Player ID:', playerId);

        // Get access token
        const { data: sessionData } = await window.supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;

        if (!accessToken) {
            console.error('❌ No access token');
            return false;
        }

        // Register with edge function
        const response = await fetch(REGISTER_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                onesignal_player_id: playerId,
                device_type: 'web',
                browser_info: navigator.userAgent
            })
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Push token registered!');
            
            // Request notification permission
            const permission = await window.OneSignal.Notifications.getPermission();
            if (permission === 'default') {
                console.log('🔔 Requesting permission...');
                await window.OneSignal.Notifications.requestPermission();
                showNotification('Notifications enabled!', 'success');
            }
            
            return true;
        } else {
            console.error('❌ Registration failed:', result.error);
            return false;
        }

    } catch (error) {
        console.error('❌ Error:', error);
        return false;
    }
}

// Check and register push token
async function checkAndRegisterPushToken() {
    if (!window.OneSignal) {
        setTimeout(checkAndRegisterPushToken, 1000);
        return;
    }
    
    await registerPushToken();
}

// Listen for auth changes
function setupOneSignalAuthListener() {
    if (!window.supabase?.auth) {
        setTimeout(setupOneSignalAuthListener, 1000);
        return;
    }
    
    window.supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔐 Auth event:', event);
        if (event === 'SIGNED_IN' && session?.user) {
            console.log('👤 User signed in, registering push...');
            setTimeout(registerPushToken, 2000);
        }
    });
}

// Initialize OneSignal on page load
document.addEventListener('DOMContentLoaded', () => {
    // Don't initialize on auth pages (login/signup)
    if (window.location.pathname.includes('/auth/') || 
        window.location.pathname.includes('/login/')) {
        console.log('🔕 Skipping OneSignal on auth page');
        return;
    }
    
    initOneSignal();
    setupOneSignalAuthListener();
});

// Make functions globally available
window.OneSignalManager = {
    register: registerPushToken,
    checkAndRegister: checkAndRegisterPushToken
};

console.log('✅ OneSignal integration added');
