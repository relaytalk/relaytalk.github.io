// utils/offline-guard.js
// Renders a full-screen offline overlay when the WebView loses connection.
// Works inside Capacitor Android + iOS, and in the browser too.
//
// How it works:
//   1. Listens to `navigator.onLine` and the `online`/`offline` events.
//   2. Every few seconds, does a lightweight HEAD ping to /manifest.json.
//   3. On failure, injects a full-screen overlay covering the WebView
//      default error page with RelayTalk-branded UI.
//   4. On recovery, removes the overlay and (optionally) reloads.

(function () {
  'use strict';

  if (window.__relayOfflineGuardInstalled) return;
  window.__relayOfflineGuardInstalled = true;

  var OVERLAY_ID = 'relayOfflineOverlay';
  var STYLE_ID = 'relayOfflineGuardStyle';
  var PING_URL = 'https://relaytalk.vercel.app/manifest.json';
  var PING_INTERVAL_MS = 4000;
  var HOME_URL = 'https://relaytalk.github.io/';

  var overlayEl = null;
  var pingTimer = null;
  var checkInFlight = false;
  var wasOffline = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + OVERLAY_ID + ' {',
      '  position: fixed; inset: 0; z-index: 2147483647;',
      '  background: #ffffff;',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 24px; text-align: center;',
      '  font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  color: #0a2540;',
      '  opacity: 0; transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);',
      '  -webkit-font-smoothing: antialiased;',
      '}',
      '#' + OVERLAY_ID + '.visible { opacity: 1; }',
      '#' + OVERLAY_ID + ' .rg-card {',
      '  max-width: 360px; width: 100%;',
      '  display: flex; flex-direction: column; align-items: center; gap: 14px;',
      '  transform: translateY(12px);',
      '  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);',
      '}',
      '#' + OVERLAY_ID + '.visible .rg-card { transform: translateY(0); }',
      '#' + OVERLAY_ID + ' .rg-icon {',
      '  width: 88px; height: 88px; border-radius: 24px;',
      '  background: rgba(0, 122, 204, 0.08);',
      '  display: flex; align-items: center; justify-content: center;',
      '  margin-bottom: 6px; position: relative;',
      '}',
      '#' + OVERLAY_ID + ' .rg-icon::after {',
      '  content: ""; position: absolute; inset: -6px; border-radius: 28px;',
      '  background: radial-gradient(circle, rgba(0, 122, 204, 0.12), transparent 70%);',
      '  animation: rgIconPulse 2.4s ease-in-out infinite; z-index: -1;',
      '}',
      '@keyframes rgIconPulse {',
      '  0%, 100% { transform: scale(0.94); opacity: 0.6; }',
      '  50%      { transform: scale(1.08); opacity: 1; }',
      '}',
      '#' + OVERLAY_ID + ' .rg-icon svg {',
      '  width: 42px; height: 42px; stroke: #007acc; fill: none;',
      '  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;',
      '}',
      '#' + OVERLAY_ID + ' h2 {',
      '  font-size: 1.35rem; font-weight: 500; letter-spacing: -0.02em;',
      '}',
      '#' + OVERLAY_ID + ' p {',
      '  font-size: 0.94rem; color: #5f6368; line-height: 1.55; max-width: 300px;',
      '}',
      '#' + OVERLAY_ID + ' button {',
      '  margin-top: 10px; padding: 12px 22px; border-radius: 12px;',
      '  background: #007acc; color: #fff; border: none;',
      '  font-size: 0.95rem; font-weight: 500; cursor: pointer;',
      '  min-height: 46px; font-family: inherit;',
      '  transition: background 0.2s, transform 0.2s, box-shadow 0.2s;',
      '  box-shadow: 0 6px 18px rgba(0, 122, 204, 0.22);',
      '}',
      '#' + OVERLAY_ID + ' button:hover {',
      '  background: #0066a8; transform: translateY(-1px);',
      '  box-shadow: 0 8px 22px rgba(0, 122, 204, 0.32);',
      '}',
      '#' + OVERLAY_ID + ' button:active { transform: translateY(0) scale(0.98); }',
      '#' + OVERLAY_ID + ' button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }',
      '#' + OVERLAY_ID + ' .rg-status {',
      '  font-size: 0.8rem; color: #80868b; min-height: 18px; margin-top: 4px;',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  #' + OVERLAY_ID + ', #' + OVERLAY_ID + ' .rg-card,',
      '  #' + OVERLAY_ID + ' .rg-icon::after {',
      '    animation-duration: 0.01ms !important;',
      '    transition-duration: 0.01ms !important;',
      '  }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function buildOverlay() {
    injectStyles();

    var el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.innerHTML = [
      '<div class="rg-card">',
      '  <div class="rg-icon">',
      '    <svg viewBox="0 0 24 24">',
      '      <line x1="1" y1="1" x2="23" y2="23"></line>',
      '      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>',
      '      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>',
      '      <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>',
      '      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>',
      '      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>',
      '      <line x1="12" y1="20" x2="12.01" y2="20"></line>',
      '    </svg>',
      '  </div>',
      '  <h2>No Internet Connection</h2>',
      '  <p>Check your Wi-Fi or mobile data and try again.</p>',
      '  <button type="button" id="rgRetryBtn">Retry</button>',
      '  <div class="rg-status" id="rgStatus"></div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(el);

    var btn = el.querySelector('#rgRetryBtn');
    var status = el.querySelector('#rgStatus');

    btn.addEventListener('click', async function () {
      status.textContent = 'Checking connection…';
      btn.disabled = true;
      var ok = await ping();
      if (ok) {
        status.textContent = 'Connected — reloading…';
        setTimeout(function () { window.location.reload(); }, 350);
      } else {
        status.textContent = 'Still offline. Please check your connection.';
        btn.disabled = false;
      }
    });

    return el;
  }

  function showOverlay() {
    if (overlayEl) return;
    overlayEl = buildOverlay();
    // Force layout so the transition runs
    void overlayEl.offsetWidth;
    overlayEl.classList.add('visible');
    document.documentElement.style.overflow = 'hidden';
  }

  function hideOverlay() {
    if (!overlayEl) return;
    var el = overlayEl;
    overlayEl = null;
    el.classList.remove('visible');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
    document.documentElement.style.overflow = '';
  }

  async function ping() {
    if (checkInFlight) return null;
    checkInFlight = true;
    try {
      var ctrl = new AbortController();
      var to = setTimeout(function () { ctrl.abort(); }, 3500);
      var res = await fetch(PING_URL + '?t=' + Date.now(), {
        method: 'HEAD',
        cache: 'no-store',
        signal: ctrl.signal
      });
      clearTimeout(to);
      return res.ok || res.status < 500;
    } catch (e) {
      return false;
    } finally {
      checkInFlight = false;
    }
  }

  async function evaluate() {
    // Fast path: browser knows it's offline
    if (navigator.onLine === false) {
      if (!wasOffline) {
        wasOffline = true;
        showOverlay();
      }
      return;
    }

    // Slow path: navigator.onLine says online but network may be broken
    var ok = await ping();
    if (ok === null) return; // already checking, skip

    if (!ok) {
      if (!wasOffline) {
        wasOffline = true;
        showOverlay();
      }
    } else {
      if (wasOffline) {
        wasOffline = false;
        hideOverlay();
        // Optionally reload to recover from a broken state:
        // window.location.reload();
      }
    }
  }

  function startPolling() {
    if (pingTimer) return;
    pingTimer = setInterval(evaluate, PING_INTERVAL_MS);
  }

  function stopPolling() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  // Wire up events
  window.addEventListener('online', function () {
    // Confirm with a real ping before hiding
    evaluate();
  });

  window.addEventListener('offline', function () {
    wasOffline = true;
    showOverlay();
  });

  // Kick off: run once on load, then poll
  // Only start if the page is a real app page (not the plain splash)
  function boot() {
    evaluate();
    startPolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Cleanup
  window.addEventListener('beforeunload', stopPolling);
})();