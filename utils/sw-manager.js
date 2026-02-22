// utils/sw-manager.js - COMPLETE FINAL VERSION WITH WORKING BUTTON
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
        let swPath = 'service-worker.js';

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
                padding: 10px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 9999;
                animation: slideIn 0.3s ease;
                max-width: 280px;
                word-wrap: break-word;
                font-size: 0.95rem;
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
// SIMPLE NOTIFICATION SYSTEM - WORKS PERFECTLY
// ============================================

// Create NotificationManager
window.NotificationManager = {
    enable: async function() {
        try {
            const permission = await Notification.requestPermission();
            console.log('Permission:', permission);
            
            if (permission === 'granted') {
                const btn = document.getElementById('notificationToggleBtn');
                if (btn) {
                    btn.classList.add('has-permission');
                    btn.innerHTML = '<i class="fas fa-bell"></i>';
                }
                showNotification('✅ Notifications enabled!', 'success');
                return true;
            } else if (permission === 'denied') {
                const btn = document.getElementById('notificationToggleBtn');
                if (btn) {
                    btn.classList.add('denied');
                    btn.innerHTML = '<i class="fas fa-bell-slash"></i>';
                }
                showNotification('❌ Notifications blocked', 'error');
                return false;
            }
            return false;
        } catch(err) {
            console.log('Error:', err);
            showNotification('Error enabling notifications', 'error');
            return false;
        }
    }
};

// Setup button when page loads
function setupNotificationButton() {
    const btn = document.getElementById('notificationToggleBtn');
    if (!btn) {
        console.log('⏳ Waiting for notification button...');
        setTimeout(setupNotificationButton, 500);
        return;
    }
    
    console.log('🔔 Setting up notification button');
    
    // SHOW THE BUTTON - THIS IS THE KEY FIX
    btn.style.display = 'flex';
    btn.style.pointerEvents = 'auto';
    
    // Check current permission
    if (Notification.permission === 'granted') {
        btn.classList.add('has-permission');
        btn.innerHTML = '<i class="fas fa-bell"></i>';
    } else if (Notification.permission === 'denied') {
        btn.classList.add('denied');
        btn.innerHTML = '<i class="fas fa-bell-slash"></i>';
    }
    
    // Remove any existing click handlers by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    // Add new click handler
    newBtn.addEventListener('click', async function(e) {
        e.stopPropagation();
        console.log('🔔 Notification button clicked');
        await window.NotificationManager.enable();
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupNotificationButton);
} else {
    setupNotificationButton();
}

// Multiple attempts to ensure button gets shown
setTimeout(setupNotificationButton, 500);
setTimeout(setupNotificationButton, 1000);
setTimeout(setupNotificationButton, 2000);
setTimeout(setupNotificationButton, 3000);

console.log('✅ Web Push ready - Blue button will appear and be clickable');
