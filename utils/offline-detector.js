// utils/offline-detector.js
// Detects when the user is offline and shows a full-screen overlay.
// Hides automatically when the connection comes back.
// No caching, no service worker, no dependency on /offline/ page.

(function () {
  'use strict';

  const OVERLAY_ID = 'relay-offline-overlay';
  let overlay = null;
  let hideTimer = null;

  // -------- Build the overlay DOM once --------
  function buildOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 24px;
      text-align: center;
    `;

    el.innerHTML = `
      <style>
        #${OVERLAY_ID} .offline-card {
          max-width: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        #${OVERLAY_ID} .offline-icon {
          width: 84px;
          height: 84px;
          border-radius: 22px;
          background: rgba(0, 122, 204, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 6px;
        }
        #${OVERLAY_ID} .offline-icon svg {
          width: 42px;
          height: 42px;
          stroke: #007acc;
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        #${OVERLAY_ID} h2 {
          font-size: 1.35rem;
          font-weight: 500;
          color: #0a2540;
          letter-spacing: -0.02em;
          margin: 0;
        }
        #${OVERLAY_ID} p {
          font-size: 0.94rem;
          color: #5f6368;
          line-height: 1.55;
          margin: 0;
          max-width: 300px;
        }
        #${OVERLAY_ID} .offline-retry {
          margin-top: 10px;
          padding: 12px 22px;
          border-radius: 12px;
          background: #007acc;
          color: #fff;
          border: none;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          min-height: 46px;
          transition: background 0.2s ease, transform 0.2s ease;
          font-family: inherit;
        }
        #${OVERLAY_ID} .offline-retry:hover {
          background: #0066a8;
          transform: translateY(-1px);
        }
        #${OVERLAY_ID} .offline-retry:active {
          transform: translateY(0) scale(0.98);
        }
        #${OVERLAY_ID}.visible {
          display: flex;
          animation: relayOfflineFadeIn 0.22s ease-out;
        }
        @keyframes relayOfflineFadeIn {
          from { opacity: 0 }
          to { opacity: 1 }
        }
      </style>

      <div class="offline-card">
        <div class="offline-icon">
          <svg viewBox="0 0 24 24">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
        </div>
        <h2>No Internet Connection</h2>
        <p>Check your Wi-Fi or mobile data and try again.</p>
        <button class="offline-retry" id="relay-offline-retry">Retry</button>
      </div>
    `;

    document.body.appendChild(el);
    overlay = el;

    const retry = el.querySelector('#relay-offline-retry');
    if (retry) {
      retry.addEventListener('click', () => {
        // Try fetching a tiny resource to check connectivity
        fetch('/manifest.json', { method: 'HEAD', cache: 'no-store' })
          .then(() => {
            setOnline();
          })
          .catch(() => {
            // Still offline
            setOffline();
          });
      });
    }
  }

  // -------- Show / hide --------
  function setOffline() {
    buildOverlay();
    if (!overlay) return;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    overlay.classList.add('visible');
  }

  function setOnline() {
    if (!overlay) return;
    overlay.classList.remove('visible');
    // Small delay before hiding fully so the transition isn't jarring
    hideTimer = setTimeout(() => {
      if (overlay) overlay.style.display = '';
    }, 50);
  }

  function check() {
    if (navigator.onLine) setOnline();
    else setOffline();
  }

  // -------- Wire up events --------
  window.addEventListener('online', () => {
    console.log('[offline] Browser reports: online');
    check();
  });

  window.addEventListener('offline', () => {
    console.log('[offline] Browser reports: offline');
    setOffline();
  });

  // Initial check as soon as DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }

  // Expose a manual hook so other code can force the check
  window.relayCheckConnection = check;
  window.relayShowOffline = setOffline;
  window.relayHideOffline = setOnline;
})();