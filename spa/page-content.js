export function getPageContext() {
  return {
    route: document.body.dataset.route || 'landing',
    path: location.pathname,
    query: new URLSearchParams(location.search),
    isMobile: window.matchMedia('(max-width: 720px)').matches,
    isNative: Boolean(
      window.Capacitor?.isNativePlatform?.()
    )
  };
}

export function onPageEvent(eventName, callback) {
  if (typeof callback !== 'function') return () => {};

  const handler = event => {
    callback(event.detail || {});
  };

  window.addEventListener(eventName, handler);

  return () => {
    window.removeEventListener(eventName, handler);
  };
}

export function onRouteMounted(callback) {
  return onPageEvent('relay:route-mounted', callback);
}

export function onRouteChanged(callback) {
  return onPageEvent('relay:route-changed', callback);
}
