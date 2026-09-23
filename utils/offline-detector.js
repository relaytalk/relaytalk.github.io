// utils/offline-detector.js
// When offline: redirect to the bundled offline page.
// The bundled page is served from the APK (Capacitor's local server),
// so it works even without any network.
//
// In the browser: uses /offline/ from the site.
// In the Capacitor app: uses /offline.html from the APK bundle.

(function () {
  'use strict';

  const isNative = !!(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );

  // Where to go when offline
  const OFFLINE_URL = isNative ? '/offline.html' : '/offline/';

  // Remember where we were so we can return after coming back online
  function currentUrl() {
    try {
      return window.location.href;
    } catch (e) {
      return 'https://relaytalk.vercel.app';
    }
  }

  function isOfflinePage() {
    const p = window.location.pathname || '';
    return p.endsWith('offline.html') || p.startsWith('/offline');
  }

  function goOffline() {
    if (isOfflinePage()) return;
    try {
      sessionStorage.setItem('relay:returnTo', currentUrl());
    } catch (e) {}
    console.log('[offline] Redirecting to:', OFFLINE_URL);
    window.location.replace(OFFLINE_URL);
  }

  function cameBackOnline() {
    if (!isOfflinePage()) return;
    let back = 'https://relaytalk.vercel.app';
    try {
      back = sessionStorage.getItem('relay:returnTo') || back;
      sessionStorage.removeItem('relay:returnTo');
    } catch (e) {}
    console.log('[offline] Back online, returning to:', back);
    window.location.replace(back);
  }

  window.addEventListener('offline', goOffline);
  window.addEventListener('online', cameBackOnline);

  // Initial check
  if (!navigator.onLine) {
    goOffline();
  }
})();