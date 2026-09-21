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
  const App = Plugins.App;

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

  // Centralized navigation — dedupes if the call page is already loading.
  let navigatingTo = null;
  function navigateToCall(data) {
    const url = buildIncomingCallUrl(data);
    if (navigatingTo === url) {
      console.log('[native-init] Already navigating to this call, skipping');
      return;
    }
    navigatingTo = url;
    console.log('[native-init] Navigating to:', url);
    // If already on the call page, just let the page handle it (avoid reload)
    if (window.location.pathname.includes('/call-app/call/')) {
      console.log('[native-init] Already on call page — dispatching event');
      window.dispatchEvent(new CustomEvent('relay:incoming-call', { detail: data }));
      return;
    }
    window.location.replace(url);
  }

  // 1. TAP HANDLER — fires when user taps the notification while app is
  //    backgrounded, foregrounded, or cold-started.
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = (action.notification && action.notification.data) || {};
    console.log('[native-init] Push tapped:', action.actionId, data);

    if (data.type === 'incoming_call' && data.room && data.callId) {
      // Persist so a page reload also picks it up
      try {
        sessionStorage.setItem('pending_incoming_call', JSON.stringify(data));
      } catch (e) {}
      navigateToCall(data);
    }
  });

  // 2. FOREGROUND PUSH HANDLER — app already showing.
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const data = notification.data || {};
    console.log('[native-init] Push received (foreground):', data);

    if (data.type === 'incoming_call' && data.room && data.callId) {
      // If already on the call page, just dispatch and let it render
      if (window.location.pathname.includes('/call-app/call/')) {
        window.dispatchEvent(new CustomEvent('relay:incoming-call', { detail: data }));
        return;
      }
      // Otherwise, save and navigate
      try {
        sessionStorage.setItem('pending_incoming_call', JSON.stringify(data));
      } catch (e) {}
      navigateToCall(data);
    }
  });

  // 3. COLD-START RECOVERY — when the app is launched *by* the notification,
  //    Android delivers the intent to MainActivity, but the JS listener may
  //    not be attached in time. Capacitor buffers it briefly, but we also
  //    check the app's launch URL and sessionStorage as a fallback.
  function checkColdStart() {
    try {
      // Check for a pending call saved by a previous tap
      const pending = sessionStorage.getItem('pending_incoming_call');
      if (pending) {
        const data = JSON.parse(pending);
        sessionStorage.removeItem('pending_incoming_call');
        if (data && data.type === 'incoming_call' && data.room && data.callId) {
          console.log('[native-init] Cold-start pending call found');
          navigateToCall(data);
          return;
        }
      }

      // Also check the URL — Capacitor sometimes rewrites location with the intent extras
      const url = new URL(window.location.href);
      const isCall = url.searchParams.get('incoming') === 'true';
      if (isCall && url.searchParams.get('callId')) {
        console.log('[native-init] URL already has incoming call params');
        // Nothing to do — call.js will handle it
        return;
      }
    } catch (e) {
      console.warn('[native-init] Cold-start check failed:', e);
    }
  }

  // Run cold-start check as soon as possible
  checkColdStart();

  // Also run it again whenever the app resumes
  if (App && App.addListener) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('[native-init] App resumed');
        checkColdStart();
      }
    });
  }

  registerDevice();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const pending = sessionStorage.getItem('pending_fcm_token');
    if (!pending) return;
    const ok = await saveToken(pending);
    if (ok) sessionStorage.removeItem('pending_fcm_token');
  });
})();