const viewCache = new Map();
let activePath = null;

export function cacheView(path, element) {
  viewCache.set(path, element);
}

export function getCachedView(path) {
  return viewCache.get(path) || null;
}

export function rememberCurrentView(path) {
  const element = viewCache.get(path);
  if (!element) return;

  element.dataset.lastActiveAt = String(Date.now());
  element.dispatchEvent(new CustomEvent('relay:page-hidden', { bubbles: true }));
}

export function activateView(path) {
  const outlet = document.getElementById('spa-outlet');
  if (!outlet) return;

  for (const [cachedPath, element] of viewCache.entries()) {
    const active = cachedPath === path;
    element.hidden = !active;
    element.setAttribute('aria-hidden', String(!active));

    if (active) {
      element.dispatchEvent(new CustomEvent('relay:page-visible', { bubbles: true }));
    }
  }

  activePath = path;
  outlet.hidden = false;

  const app = document.getElementById('app');
  if (app) app.hidden = true;
}

export function getActivePath() {
  return activePath;
}
