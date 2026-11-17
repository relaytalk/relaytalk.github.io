let installed = false;
const listeners = new WeakMap();

export function installDomReadyBridge() {
  if (installed) return;
  installed = true;

  const originalAdd = document.addEventListener.bind(document);

  document.addEventListener = function (type, callback, options) {
    if (type !== 'DOMContentLoaded' || !callback) {
      return originalAdd(type, callback, options);
    }

    const routeAtRegistration = document.body.dataset.route || 'landing';

    const wrapped = function (event) {
      const activeRoute = document.body.dataset.route || 'landing';
      if (activeRoute !== routeAtRegistration) return;

      if (typeof callback === 'function') {
        callback.call(document, event);
      } else if (callback && typeof callback.handleEvent === 'function') {
        callback.handleEvent(event);
      }
    };

    listeners.set(callback, wrapped);
    return originalAdd(type, wrapped, options);
  };
}

export function notifyRouteDomReady() {
  document.dispatchEvent(new Event('DOMContentLoaded', {
    bubbles: true
  }));
}
