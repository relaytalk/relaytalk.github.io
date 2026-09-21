// utils/native-init.js
// Registers device for FCM push + shows incoming call banner with buttons.

(function () {
  'use strict';

  const isNative = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );

  if (!isNative) {
    console.log('[native-init] Not in a native shell - skipping');
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
      if (perm.receive !== 'granted') return;

      // Ask for local notification permission too (Android 13+)
      if (LocalNotifications) {
        try {
          let lp = await LocalNotifications.checkPermissions();
          if (lp.display === 'prompt' || lp.display === 'prompt-with-rationale') {
            await LocalNotifications.requestPermissions();
          }
        } catch (e) {}
      }

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

  // ---------- KEY: show notification with buttons ----------
  async function showIncomingCallNotification(data) {
    if (!LocalNotifications) {
      console.warn('[native-init] LocalNotifications plugin missing');
      return;
    }

    try {
      // Ensure our channel exists (Accept/Decline buttons need a channel)
      await LocalNotifications.createChannel({
        id: 'incoming_calls',
        name: 'Incoming Calls',
        description: 'RelayTalk incoming call alerts',
        importance: 5,          // HIGH — heads-up
        visibility: 1,          // public
        vibration: true,
        lights: true,
        lightColor: '#007acc',
        sound: 'default',
      });

      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2147483647),
            title: (data.callerName || 'Someone') + ' is calling',
            body: 'Tap to answer',
            channelId: 'incoming_calls',
            ongoing: true,             // sticky — user must act
            autoCancel: false,
            isExact: true,
            sound: 'default',
            smallIcon: 'ic_launcher',
            iconColor: '#007acc',
            actionTypeId: 'RELAY_CALL',
            extra: {
              type: 'incoming_call',
              callId: data.callId,
              room: data.room,
              callerId: data.callerId,
              callerName: data.callerName,
            },
          },
        ],
      });
      console.log('[native-init] Incoming call notification scheduled');
    } catch (e) {
      console.error('[native-init] Failed to schedule notification:', e);
    }
  }

  // Register the action type with Accept / Decline buttons
  if (LocalNotifications) {
    LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'RELAY_CALL',
          actions: [
            { id: 'accept', title: 'Accept', destructive: false },
            { id: 'decline', title: 'Decline', destructive: true },
          ],
        },
      ],
    }).catch((e) => console.warn('[native-init] registerActionTypes failed:', e));
  }

  // FCM data push arrived while app is background or closed
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const data = notification.data || {};
    console.log('[native-init] Push received:', data);

    if (data.type === 'incoming_call') {
      showIncomingCallNotification(data);
    }
  });

  // User tapped the push body directly
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = (action.notification && action.notification.data) || {};
    console.log('[native-init] Push action performed:', action.actionId, data);

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

  // ---------- Handlers for Accept / Decline buttons ----------
  if (LocalNotifications) {
    LocalNotifications.addListener('localNotificationActionPerformed', async (event) => {
      const data = (event.notification && event.notification.extra) || {};
      const action = event.actionId;

      console.log('[native-init] Local notification action:', action, data);

      if (data.type !== 'incoming_call') return;

      // Try to update the call row based on the action
      try {
        const supabase = await getSupabase();
        if (supabase && data.callId) {
          if (action === 'decline') {
            await supabase
              .from('calls')
              .update({ status: 'rejected', ended_at: new Date().toISOString(), seen: true })
              .eq('id', data.callId);
            console.log('[native-init] Call declined');
            return;
          }
          if (action === 'accept' || action === 'tap') {
            // Navigate to call page — the page itself will flip status to active
            const url =
              '/pages/call-app/call/?incoming=true' +
              '&room=' + encodeURIComponent(data.room) +
              '&callId=' + encodeURIComponent(data.callId) +
              '&callerId=' + encodeURIComponent(data.callerId || '') +
              '&returnTo=' + encodeURIComponent('/pages/home/friends/index.html');
            window.location.href = url;
          }
        }
      } catch (e) {
        console.error('[native-init] Action handling failed:', e);
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