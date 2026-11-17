const views = new Map();
let activePath = null;

export function cacheView(path, element) {
  if (!path || !element) return;
  views.set(path, element);
}

export function getCachedView(path) {
  return views.get(path) || null;
}

export function getActivePath() {
  return activePath;
}

export function rememberCurrentView(path = activePath) {
  if (!path) return;

  const element = views.get(path);
  if (!element) return;

  element.dispatchEvent(new CustomEvent('relay:page-hidden', {
    bubbles: true,
    detail: { path }
  }));
}

export function activateView(path) {
  const outlet = document.getElementById('spa-outlet');
  const app = document.getElementById('app');

  if (path === '/') {
    for (const element of views.values()) {
      element.hidden = true;
      element.setAttribute('aria-hidden', 'true');
    }

    if (outlet) outlet.hidden = true;
    if (app) app.hidden = false;

    activePath = '/';
    return;
  }

  const target = views.get(path);
  if (!target) throw new Error(`SPA view not mounted: ${path}`);

  for (const [viewPath, element] of views.entries()) {
    const isActive = viewPath === path;
    element.hidden = !isActive;
    element.setAttribute('aria-hidden', String(!isActive));
  }

  if (outlet) outlet.hidden = false;
  if (app) app.hidden = true;

  activePath = path;

  target.dispatchEvent(new CustomEvent('relay:page-visible', {
    bubbles: true,
    detail: { path }
  }));
}
