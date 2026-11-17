import { startRouter } from './spa/router.js';
import { installDomReadyBridge } from './spa/dom-ready-bridge.js';

function initializeRelayTalkSPA() {
  const year = document.getElementById('footer-year');

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  installDomReadyBridge();
  startRouter();

  console.log('[RelayTalk] SPA router initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRelayTalkSPA, {
    once: true
  });
} else {
  initializeRelayTalkSPA();
}
