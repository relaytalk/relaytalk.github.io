// utils/native-init.js
// Registers the device for FCM push and stores its token in Supabase.
// Runs only inside the Capacitor Android shell.

(function () {
  'use strict';

  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) {
    console.log('[native-init] Not running in a native shell - skipping push setup');
    return;
  }

  console.log('[native-init] Native platform detected:', window.Capacitor.getPlatform());

  const Plugins = window.Capacitor.Plugins || {};
  const PushNotifications = Plugins.PushNotifications;

  if (!PushNotifications) {
    console.warn('[native-init] PushNotifications plugin missing');
    return;
  }

  async function getSupabase() {
    try {
      const mod = await import('/utils/supabase.js');
      if (mod.initializeSupabase) return await mod.initializeSupabase();
    } catch (e) {
      console.warn('[native-init] Could not init Supabase from utils:', e);
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
      console.log('[native-init] Token saved to Supabase');
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
      if (perm.receive !== 'granted') {
        console.log('[native-init] Push permission not granted');
        return;
      }
      await PushNotifications.register();
      console.log('[native-init] Registered with FCM');
    } catch (e) {
      console.error('[native-init] Register error:', e);
    }
  }

  PushNotifications.addListener('registration', async (token) => {
    console.log('[native-init] Got FCM token');
    await saveToken(token.value);
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[native-init] Registration error:', err);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification?.data || {};
    console.log('[native-init] Notification tapped:', data);

    if (data.type === 'incoming_call' && data.room && data.callId) {
      const url =
        '/pages/call-app/call/?incoming=true' +
        '&room=' + encodeURIComponent(data.room) +
        '&callId=' + encodeURIComponent(data.callId) +
        '&callerId=' + encodeURIComponent(data.callerId || '') +
        '&returnTo=' + encodeURIComponent('/pages/home/friends/index.html');
      window.location.href = url;
    }
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[native-init] Push received in foreground:', notification);
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
