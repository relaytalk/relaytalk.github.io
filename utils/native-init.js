// utils/native-init.js
// FCM registration + notification tap navigation.
// Presence is managed by callHub.js on every page.
// Media permissions (mic/camera) are NO LONGER requested here —
// they are requested by the call app and the voice recorder
// only when the user actually needs them.

(function () {
  'use strict';

  if (window.__relayNativeInitInstalled) {
    return;
  }
  window.__relayNativeInitInstalled = true;

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
  const App = Plugins.App;

  // ============================================================
  // NOTIFICATION CHANNELS
  // ============================================================
  async function registerChannels() {
    if (!LocalNotifications) return;

    try {
      await LocalNotifications.createChannel({
        id: 'incoming_calls',
        name: 'Incoming Calls',
        description: 'RelayTalk incoming call alerts',
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#007acc',
        sound: 'default',
      });
    } catch (e) {}

    try {
      await LocalNotifications.createChannel({
        id: 'messages',
        name: 'Messages',
        description: 'RelayTalk message notifications',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#007acc',
        sound: 'default',
      });
    } catch (e) {}
  }

  // ============================================================
  // SUPABASE (for saving token)
  // ============================================================
  let supabasePromise = null;

  async function getSupabase() {
    if (supabasePromise) return supabasePromise;
    supabasePromise = (async () => {
      try {
        const mod = await import('/utils/supabase.js');
        if (mod.initializeSupabase) return await mod.initializeSupabase();
      } catch (e) {
        console.warn('[native-init] Supabase import failed:', e);
      }
      return null;
    })();
    return supabasePromise;
  }

  async function getSession() {
    try {
      const supabase = await getSupabase();
      if (!supabase) return null;
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (e) {
      return null;
    }
  }

  async function saveToken(token) {
    try {
      const supabase = await getSupabase();
      if (!supabase) return false;
      const session = await getSession();
      if (!session?.user) {
        sessionStorage.setItem('pending_fcm_token', token);
        return false;
      }
      await supabase.from('device_tokens').upsert(
        { user_id: session.user.id, token, platform: 'android' },
        { onConflict: 'user_id,token' }
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  // ============================================================
  // PUSH REGISTRATION
  // Only called when we're on the home page AND user is logged in.
  // ============================================================
  async function registerDevice() {
    if (!PushNotifications) return false;
    try {
      let perm = await PushNotifications.checkPermissions();

      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
      }

      if (perm.receive !== 'granted') {
        return false;
      }

      await PushNotifications.register();
      return true;
    } catch (e) {
      console.error('[native-init] Register error:', e);
      return false;
    }
  }

  if (PushNotifications) {
    PushNotifications.addListener('registration', async (token) => {
      await saveToken(token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[native-init] Registration error:', err);
    });
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
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
    if (window.location.pathname.includes('/call-app/call/')) {
      window.dispatchEvent(new CustomEvent('relay:incoming-call', { detail: data }));
      return;
    }
    window.location.replace(url);
  }

  function navigateToChat(data) {
    let url = data.url || '';
    if (!url) {
      const friendId = data.senderId || data.reactorId || '';
      if (!friendId) return;
      url = `/pages/chats/index.html?friendId=${friendId}`;
    }
    if (window.location.pathname.includes('/pages/chats/')) {
      window.dispatchEvent(new CustomEvent('relay:open-chat', { detail: data }));
      return;
    }
    window.location.href = url;
  }

  // ============================================================
  // TAP HANDLERS
  // ============================================================
  if (PushNotifications) {
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action.notification && action.notification.data) || {};

      const type = data.type || '';
      if (type === 'incoming_call' && data.room && data.callId) {
        try { sessionStorage.setItem('pending_incoming_call', JSON.stringify(data)); } catch (e) {}
        navigateToCall(data);
        return;
      }

      if (type === 'message' || type === 'reaction' || data.url) {
        try { sessionStorage.setItem('pending_chat_open', JSON.stringify(data)); } catch (e) {}
        navigateToChat(data);
        return;
      }
    });

    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      const data = notification.data || {};

      try {
        if (LocalNotifications && LocalNotifications.removeAllDeliveredNotifications) {
          await LocalNotifications.removeAllDeliveredNotifications();
        }
      } catch (e) {}

      const type = data.type || '';

      if (type === 'incoming_call' && data.room && data.callId) {
        if (window.location.pathname.includes('/call-app/call/')) {
          window.dispatchEvent(new CustomEvent('relay:incoming-call', { detail: data }));
          return;
        }
        try { sessionStorage.setItem('pending_incoming_call', JSON.stringify(data)); } catch (e) {}
        navigateToCall(data);
        return;
      }

      if (type === 'message' || type === 'reaction') {
        window.dispatchEvent(new CustomEvent('relay:message-push', { detail: data }));
        return;
      }
    });
  }

  // ============================================================
  // COLD START RECOVERY
  // ============================================================
  function checkColdStart() {
    try {
      const callPending = sessionStorage.getItem('pending_incoming_call');
      if (callPending) {
        const data = JSON.parse(callPending);
        sessionStorage.removeItem('pending_incoming_call');
        if (data && data.type === 'incoming_call' && data.room && data.callId) {
          navigateToCall(data);
          return;
        }
      }

      const chatPending = sessionStorage.getItem('pending_chat_open');
      if (chatPending) {
        const data = JSON.parse(chatPending);
        sessionStorage.removeItem('pending_chat_open');
        if (data && (data.type === 'message' || data.type === 'reaction' || data.url)) {
          navigateToChat(data);
          return;
        }
      }
    } catch (e) {}
  }

  checkColdStart();

  if (App && App.addListener) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) checkColdStart();
    });
  }

  // ============================================================
  // BOOT
  // Channels are safe to register immediately (no prompt).
  // Push permission is only requested when on the home page.
  // ============================================================
  async function boot() {
    await registerChannels();

    // Only request push permission when user is on the home page.
    const path = window.location.pathname;
    const isHomePage = path === '/pages/home/' ||
                       path === '/pages/home/index.html' ||
                       path.endsWith('/pages/home/') ||
                       path.endsWith('/pages/home/index.html');

    if (isHomePage) {
      // Small delay so the page has time to render and the user
      // sees the app before the OS prompt appears.
      setTimeout(async () => {
        await registerDevice();
      }, 1200);
    }
  }

  boot();

  // ============================================================
  // RETRY PENDING FCM TOKEN SAVE
  // ============================================================
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const pending = sessionStorage.getItem('pending_fcm_token');
    if (!pending) return;
    const ok = await saveToken(pending);
    if (ok) sessionStorage.removeItem('pending_fcm_token');
  });
})();