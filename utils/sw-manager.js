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
