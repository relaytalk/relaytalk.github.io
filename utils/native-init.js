// utils/native-init.js
// FCM push registration + incoming-call notification handling.

(function () {
  'use strict';

  const isNative = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );

  if (!isNative) {
    console.log('[native-init] Not in native shell — skipping');
    return;
  }

  console.log('[native-init] Native platform:', window.Capacitor.getPlatform());

  const Plugins = window.Capacitor.Plugins || {};
  const PushNotifications = Plugins.PushNotifications;
  const LocalNotifications = Plugins.LocalNotifications;

  if (!PushNotifications) {
    console.warn('[native-init] PushNotifications plugin not available');
    return;
  }

  async function getSupabase() {
    try {
      const mod = await import('/utils/supabase.js');
      if (mod.initializeSupabase) return await mod.initializeSupabase();
    } catch (e) {
      console.warn('[native-init] Supabase import failed:', e);
    }
    return null;
  }

  async function saveToken(token) {
    try {
      const supabase = await getSupabase();
      if (!supabase) return false;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        sessionStorage.setItem('pending_fcm_token', token);
        return false;
      }
      await supabase.from('device_tokens').upsert(
        { user_id: session.user.id, token, platform: 'android' },
        { onConflict: 'user_id,token' }
      );
      console.log('[native-init] Token saved');
      return true;
    } catch (e) {
      console.error('[native-init] Token save error:', e);
      return false;
    }
  }

  async function registerDevice() {
    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== 'granted') return;
      await PushNotifications.register();
      console.log('[native-init] Registered with FCM');
    } catch (e) {
      console.error('[native-init] Register error:', e);
    }
  }

  PushNotifications.addListener('registration', async (token) => {
    console.log('[native-init] FCM token received');
    await saveToken(token.value);
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[native-init] Registration error:', err);
  });

  // Build the deep-link URL to the call page in "incoming" mode.
  // The call page itself will show the in-app Accept/Decline screen.
  function buildIncomingCallUrl(data) {
    const params = new URLSearchParams({
      incoming: 'true',
      room: data.room || '',
      callId: data.callId || '',
      callerId: data.callerId || '',
      callerName: data.callerName || '',
      callerAvatar: data.callerAvatar || '',
      returnTo: '/pages/home/friends/index.html',
    });
    return '/pages/call-app/call/?' + params.toString();
  }

  // User tapped the notification (from background, foreground, or cold start)
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = (action.notification && action.notification.data) || {};
    console.log('[native-init] Push tapped:', action.actionId, data);

    if (data.type === 'incoming_call' && data.room && data.callId) {
      const url = buildIncomingCallUrl(data);
      console.log('[native-init] Navigating to:', url);
      // Use location.replace so back button doesn't return to notification
      window.location.replace(url);
    }
  });

  // Foreground push received — app already showing. Show in-app banner via callHub.
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const data = notification.data || {};
    console.log('[native-init] Push received (foreground):', data);

    if (data.type === 'incoming_call' && data.room && data.callId) {
      // If callHub is already on this page, let it handle. Otherwise navigate.
      // For safety, we still navigate — the call page has its own guard.
      if (!document.querySelector('.incoming-call-screen') &&
          !window.__callPageActive) {
        const url = buildIncomingCallUrl(data);
        window.location.href = url;
      }
    }
  });

  registerDevice();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const pending = sessionStorage.getItem('pending_fcm_token');
    if (!pending) return;
    const ok = await saveToken(pending);
    if (ok) sessionStorage.removeItem('pending_fcm_token');
  });
})();