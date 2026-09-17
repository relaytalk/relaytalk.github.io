console.log('🚀 RelayTalk Chat Starting...');

import './chat-core.js';
import './img-handler.js';

window.chatModules = {
    coreLoaded: false,
    imgHandlerLoaded: false,
    ready: false
};

function isMobileChrome() {
    const ua = navigator.userAgent;
    return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg/i.test(ua);
}
function isIOSChrome() {
    return /CriOS/i.test(navigator.userAgent);
}
window.isMobileChrome = isMobileChrome;
window.isIOSChrome = isIOSChrome;

if (isMobileChrome() || isIOSChrome()) {
    document.body.classList.add('chrome-mobile');
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    window.addEventListener('resize', () => {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    });
    document.body.style.overscrollBehaviorY = 'none';
}

let moduleCheckInterval = setInterval(() => {
    if (window.chatModules.coreLoaded && window.chatModules.imgHandlerLoaded && !window.chatModules.ready) {
        window.chatModules.ready = true;
        clearInterval(moduleCheckInterval);
        initializeChatApp();
    }
}, 50);

function initializeChatApp() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupApplication);
    } else {
        setupApplication();
    }
}

function setupApplication() {
    // Auto-resize input on load
    const input = document.getElementById('messageInput');
    if (input) input.placeholder = 'Type a message...';

    // Only attach a single lightweight global error logger
    window.addEventListener('unhandledrejection', (e) => {
        // Only log, don't alert
        console.error('Unhandled rejection:', e.reason);
    });
}

console.log('✅ Main coordinator ready');