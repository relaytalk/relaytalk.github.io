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
      console.log('[native-init] Token saved to Supabase');
      return true;
    } catch (e) {
      console.error('[native-init] Token save error:', e);
      return false;
    }
  }

  // ============================================================
  // PRESENCE — set to 'online' when app foreground, 'background' when bg
  // ============================================================
  async function setPresence(status) {
    try {
      const supabase = await getSupabase();
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await supabase
        .from('profiles')
        .update({
          status: status,
          last_seen: new Date().toISOString(),
        })
        .eq('id', session.user.id);

      console.log('[native-init] Presence set to:', status);
    } catch (e) {
      console.warn('[native-init] Presence update failed:', e);
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

      // Because FCM delivers a `notification` block, Android has ALREADY
      // shown the OS banner by the time this fires. To prevent the user
      // from seeing a duplicate OS banner while the app is open, we
      // remove any delivered notifications immediately.
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
  // APP STATE — presence + cold-start recovery
  // ============================================================
  if (App && App.addListener) {
    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        // App came to foreground → mark online + recover cold-start
        await setPresence('online');
        checkColdStart();
      } else {
        // App went to background → mark background
        // (Server will now allow push notifications to go through.)
        await setPresence('background');
      }
    });

    // Also mark on app pause/resume (in case appStateChange doesn't fire)
    App.addListener('pause', () => setPresence('background'));
    App.addListener('resume', () => setPresence('online'));
  }

  // ============================================================
  // BOOT SEQUENCE
  // ============================================================
  async function bootPermissions() {
    await registerChannels();

    const pushOk = await registerDevice();
    console.log('[native-init] Push registration complete:', pushOk);

    setTimeout(() => {
      requestMediaPermissions('after-push-prompt');
    }, 400);

    // Mark this session as 'online' now that the app is active
    // (Supabase session may not be ready instantly — retry shortly)
    setTimeout(() => setPresence('online'), 1500);
  }

  bootPermissions();

  // Fallback: if for any reason the mic/camera prompt didn't fire,
  // fire it again on the first user tap anywhere.
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

    // Set presence on visibility change too — belt and suspenders
    setPresence('online');

    const pending = sessionStorage.getItem('pending_fcm_token');
    if (!pending) return;
    const ok = await saveToken(pending);
    if (ok) sessionStorage.removeItem('pending_fcm_token');
  });
})();