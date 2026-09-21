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
  const LocalNotifications = Plugins.LocalNotifications;
  const App = Plugins.App;

  // ============================================================
  // NOTIFICATION CHANNELS
  // ============================================================
  // Android requires each channel to exist before the OS will show
  // a notification with that channel_id. If the channel is missing,
  // the notification is silently dropped. We register two channels:
  //   - incoming_calls  (high importance, for calls)
  //   - messages        (default importance, for messages + reactions)
  async function registerChannels() {
    if (!LocalNotifications) {
      console.warn('[native-init] LocalNotifications plugin missing — skipping channels');
      return;
    }

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
  async function requestMediaPermissions() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user' },
      });
      stream.getTracks().forEach(t => t.stop());
      console.log('[native-init] Media permissions granted');
    } catch (e) {
      console.warn('[native-init] Media permission request failed:', e.message);
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
  // PUSH REGISTRATION
  // ============================================================
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
  // NAVIGATION — chat (messages + reactions)
  // ============================================================
  function navigateToChat(data) {
    // Prefer explicit url from the payload if present
    let url = data.url || '';

    // If no url, build from senderId / reactorId
    if (!url) {
      const friendId = data.senderId || data.reactorId || '';
      if (!friendId) {
        console.warn('[native-init] No url or friendId for chat navigation');
        return;
      }
      url = `/pages/chats/index.html?friendId=${friendId}`;
    }

    console.log('[native-init] Navigating to chat:', url);

    // If already on the chats page, dispatch an event so the page can react
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
    // User tapped the notification (background, foreground, or cold start)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action.notification && action.notification.data) || {};
      console.log('[native-init] Notification tapped:', action.actionId, data);

      const type = data.type || '';
      if (type === 'incoming_call' && data.room && data.callId) {
        try {
          sessionStorage.setItem('pending_incoming_call', JSON.stringify(data));
        } catch (e) {}
        navigateToCall(data);
        return;
      }

      if (type === 'message' || type === 'reaction' || data.url) {
        try {
          sessionStorage.setItem('pending_chat_open', JSON.stringify(data));
        } catch (e) {}
        navigateToChat(data);
        return;
      }
    });

    // Foreground push received (app already open)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = notification.data || {};
      console.log('[native-init] Push received (foreground):', data);

      const type = data.type || '';
      if (type === 'incoming_call' && data.room && data.callId) {
        if (window.location.pathname.includes('/call-app/call/')) {
          window.dispatchEvent(new CustomEvent('relay:incoming-call', { detail: data }));
          return;
        }
        try {
          sessionStorage.setItem('pending_incoming_call', JSON.stringify(data));
        } catch (e) {}
        navigateToCall(data);
        return;
      }

      // For messages, don't auto-navigate while app is open — the app already
      // shows the message in the current chat if the user is on that page.
      // Optionally we could show a toast, but that's up to the app.
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
          console.log('[native-init] Cold-start pending call found');
          navigateToCall(data);
          return;
        }
      }

      const chatPending = sessionStorage.getItem('pending_chat_open');
      if (chatPending) {
        const data = JSON.parse(chatPending);
        sessionStorage.removeItem('pending_chat_open');
        if (data && (data.type === 'message' || data.type === 'reaction' || data.url)) {
          console.log('[native-init] Cold-start pending chat found');
          navigateToChat(data);
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

  // ============================================================
  // START
  // ============================================================
  registerChannels();
  registerDevice();

  // Prompt for mic/camera shortly after launch
  setTimeout(() => {
    requestMediaPermissions();
  }, 1500);

  // Retry pending FCM token save after login
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const pending = sessionStorage.getItem('pending_fcm_token');
    if (!pending) return;
    const ok = await saveToken(pending);
    if (ok) sessionStorage.removeItem('pending_fcm_token');
  });
})();