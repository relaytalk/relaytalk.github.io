// utils/native-init.js
// FCM push + incoming call handling + runtime permissions + presence.

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
      console.log('[native-init] Channel registered: incoming_calls');
    } catch (e) {
      console.warn('[native-init] incoming_calls channel failed:', e);
    }

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
      console.log('[native-init] Channel registered: messages');
    } catch (e) {
      console.warn('[native-init] messages channel failed:', e);
    }
  }

  // ============================================================
  // RUNTIME PERMISSIONS (mic + camera)
  // ============================================================
  let mediaPermissionsRequested = false;

  async function requestMediaPermissions(reason) {
    if (mediaPermissionsRequested) return;
    mediaPermissionsRequested = true;

    console.log('[native-init] Requesting media permissions (' + reason + ')');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user' },
      });
      stream.getTracks().forEach(t => t.stop());
      console.log('[native-init] Media permissions GRANTED');
    } catch (e) {
      console.warn('[native-init] Media permission DENIED or failed:', e.name, e.message);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        mediaPermissionsRequested = false;
      }
    }
  }

  // ============================================================
  // SUPABASE
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
      console.log('[native-init] Token saved to Supabase');
      return true;
    } catch (e) {
      console.error('[native-init] Token save error:', e);
      return false;
    }
  }

  // ============================================================
  // PRESENCE — single source of truth
  // ============================================================
  // Rules:
  //   • Foreground  → status = 'online'      + last_seen refreshed every 30s
  //   • Background  → status = 'offline'     + last_seen set once
  //   • Cold start  → status = 'online'      (fresh launch)
  //
  // Debounce consecutive writes so we don't hammer the DB on
  // rapid foreground/background toggles.
  // ============================================================
  let lastPresenceWrite = 0;
  let lastPresenceValue = null;
  let presenceHeartbeat = null;
  const HEARTBEAT_MS = 30000;   // refresh last_seen every 30s while foreground
  const MIN_WRITE_GAP_MS = 5000; // don't write twice within 5s
  const HEARTBEAT_FRESH_WINDOW_MS = 45000; // server considers fresh within 45s

  async function writePresence(status, force) {
    try {
      const now = Date.now();
      // Debounce rapid calls with the same value
      if (
        !force &&
        status === lastPresenceValue &&
        now - lastPresenceWrite < MIN_WRITE_GAP_MS
      ) {
        return;
      }

      const supabase = await getSupabase();
      if (!supabase) return;
      const session = await getSession();
      if (!session?.user) {
        console.log('[native-init] No session yet — presence write skipped');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          status: status,
          last_seen: new Date().toISOString(),
        })
        .eq('id', session.user.id);

      if (error) {
        console.warn('[native-init] Presence write error:', error.message);
        return;
      }

      lastPresenceWrite = now;
      lastPresenceValue = status;
      console.log('[native-init] Presence →', status);
    } catch (e) {
      console.warn('[native-init] Presence update failed:', e);
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    presenceHeartbeat = setInterval(() => {
      // Only heartbeat if the app is visible
      if (document.visibilityState === 'visible') {
        writePresence('online', true);
      }
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (presenceHeartbeat) {
      clearInterval(presenceHeartbeat);
      presenceHeartbeat = null;
    }
  }

  // ============================================================
  // PUSH REGISTRATION
  // ============================================================
  async function registerDevice() {
    if (!PushNotifications) {
      console.warn('[native-init] PushNotifications plugin missing');
      return false;
    }
    try {
      let perm = await PushNotifications.checkPermissions();
      console.log('[native-init] Push perm before:', perm.receive);

      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
        perm = await PushNotifications.requestPermissions();
        console.log('[native-init] Push perm after:', perm.receive);
      }

      if (perm.receive !== 'granted') {
        console.log('[native-init] Push permission not granted');
        return false;
      }

      await PushNotifications.register();
      console.log('[native-init] Registered with FCM');
      return true;
    } catch (e) {
      console.error('[native-init] Register error:', e);
      return false;
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

  // ============================================================
  // NAVIGATION — calls
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
    console.log('[native-init] Navigating to call:', url);
    if (window.location.pathname.includes('/call-app/call/')) {
      window.dispatchEvent(new CustomEvent('relay:incoming-call', { detail: data }));
      return;
    }
    window.location.replace(url);
  }

  // ============================================================
  // NAVIGATION — chat
  // ============================================================
  function navigateToChat(data) {
    let url = data.url || '';
    if (!url) {
      const friendId = data.senderId || data.reactorId || '';
      if (!friendId) return;
      url = `/pages/chats/index.html?friendId=${friendId}`;
    }
    console.log('[native-init] Navigating to chat:', url);
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
      console.log('[native-init] Notification tapped:', action.actionId, data);

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
      console.log('[native-init] Push received (foreground):', data);

      // If somehow we're foreground but a push still arrived (server
      // race condition), remove the OS banner immediately so the user
      // doesn't see a duplicate.
      try {
        if (LocalNotifications && LocalNotifications.removeAllDeliveredNotifications) {
          await LocalNotifications.removeAllDeliveredNotifications();
        }
      } catch (e) {
        console.warn('[native-init] Could not clear delivered notifications:', e);
      }

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
    } catch (e) {
      console.warn('[native-init] Cold-start check failed:', e);
    }
  }

  checkColdStart();

  // ============================================================
  // APP STATE
  // ============================================================
  // Capacitor App plugin only fires `appStateChange`. Use it as the
  // single source of truth for foreground/background transitions.
  // ============================================================
  if (App && App.addListener) {
    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        console.log('[native-init] App → foreground');
        writePresence('online', true);
        startHeartbeat();
        checkColdStart();
      } else {
        console.log('[native-init] App → background');
        stopHeartbeat();
        writePresence('offline', true);
      }
    });
  }

  // ============================================================
  // BROWSER VISIBILITY (belt & suspenders — for WebView quirks)
  // ============================================================
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      writePresence('online', false);
      startHeartbeat();
    } else {
      writePresence('offline', false);
      stopHeartbeat();
    }
  });

  // ============================================================
  // BOOT SEQUENCE
  // ============================================================
  async function bootPermissions() {
    await registerChannels();

    const pushOk = await registerDevice();
    console.log('[native-init] Push registration complete:', pushOk);

    // Ask mic/camera perms after the push dialog has a moment to settle.
    setTimeout(() => {
      requestMediaPermissions('after-push-prompt');
    }, 400);

    // Wait for the Supabase session to be ready, then mark online.
    // We retry a few times because on cold start the auth module
    // may not have hydrated the session yet.
    let attempts = 0;
    const tryPresence = async () => {
      attempts++;
      const session = await getSession();
      if (session?.user) {
        writePresence('online', true);
        startHeartbeat();
        console.log('[native-init] Presence started after', attempts, 'attempt(s)');
        return;
      }
      if (attempts < 10) {
        setTimeout(tryPresence, 500);
      } else {
        console.warn('[native-init] Could not establish presence — no session');
      }
    };
    tryPresence();
  }

  bootPermissions();

  // Fallback media permissions on first user interaction
  const firstTap = () => {
    requestMediaPermissions('first-user-tap');
    document.removeEventListener('click', firstTap);
    document.removeEventListener('touchstart', firstTap);
  };
  document.addEventListener('click', firstTap, { once: true });
  document.addEventListener('touchstart', firstTap, { once: true });

  // Retry pending FCM token save after login
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const pending = sessionStorage.getItem('pending_fcm_token');
    if (!pending) return;
    const ok = await saveToken(pending);
    if (ok) sessionStorage.removeItem('pending_fcm_token');
  });
})();