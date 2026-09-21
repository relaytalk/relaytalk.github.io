// utils/native-init.js
// FCM push + incoming call handling + runtime permission request.

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

  // ---------- Runtime permission for mic + camera ----------
  // Capacitor's WebView on Android will request the OS permission when the
  // WebView asks for mic/camera IF the AndroidManifest declares them AND
  // the user has already granted them. So we prompt up-front on launch.
  async function requestMediaPermissions() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        // On some Capacitor setups these go through the WebView prompt.
        // We trigger it by opening a tiny getUserMedia request.
      }

      // Best-effort: attempt to access getUserMedia so Android shows the prompt.
      // If permissions were already granted this is a silent no-op.
      const wantsAudio = true;
      const wantsVideo = true;

      const constraints = {};
      if (wantsAudio) constraints.audio = true;
      if (wantsVideo) constraints.video = { facingMode: 'user' };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Immediately release — we only wanted the prompt/grants
      stream.getTracks().forEach(t => t.stop());
      console.log('[native-init] Media permissions granted');
    } catch (e) {
      console.warn('[native-init] Media permission request failed:', e.message);
      // Not fatal — Jitsi will prompt again if needed
    }
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
    if (!PushNotifications) {
      console.warn('[native-init] PushNotifications plugin missing');
      return;
    }
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

  if (PushNotifications) {
    PushNotifications.addListener('registration', async (token) => {
      console.log('[native-init] FCM token received');
      await saveToken(token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[native-init] Registration error:', err);
    });
  }

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

  let navigatingTo = null;
  function navigateToCall(data) {
    const url = buildIncomingCallUrl(data);
    if (navigatingTo === url) return;
    navigatingTo = url;
    console.log('[native-init] Navigating to:', url);
    if (window.location.pathname.includes('/call-app/call/')) {
      window.dispatchEvent(new CustomEvent('relay:incoming-call', { detail: data }));
      return;
    }
    window.location.replace(url);
  }

  if (PushNotifications) {
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action.notification && action.notification.data) || {};
      console.log('[native-init] Push tapped:', action.actionId, data);

      if (data.type === 'incoming_call' && data.room && data.callId) {
        try {
          sessionStorage.setItem('pending_incoming_call', JSON.stringify(data));
        } catch (e) {}
        navigateToCall(data);
      }
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = notification.data || {};
      console.log('[native-init] Push received (foreground):', data);

      if (data.type === 'incoming_call' && data.room && data.callId) {
        if (window.location.pathname.includes('/call-app/call/')) {
          window.dispatchEvent(new CustomEvent('relay:incoming-call', { detail: data }));
          return;
        }
        try {
          sessionStorage.setItem('pending_incoming_call', JSON.stringify(data));
        } catch (e) {}
        navigateToCall(data);
      }
    });
  }

  function checkColdStart() {
    try {
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
    } catch (e) {
      console.warn('[native-init] Cold-start check failed:', e);
    }
  }

  checkColdStart();

  if (App && App.addListener) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) checkColdStart();
    });
  }

  // Kick off registration + permission prompt
  registerDevice();

  // Prompt for mic/camera on first launch (after a short delay so UI is up)
  setTimeout(() => {
    requestMediaPermissions();
  }, 1500);

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const pending = sessionStorage.getItem('pending_fcm_token');
    if (!pending) return;
    const ok = await saveToken(pending);
    if (ok) sessionStorage.removeItem('pending_fcm_token');
  });
})();