import { routes, resolveRoute } from './routes.js';
import { loadRoute } from './loader.js';
import { rememberCurrentView, restoreView } from './lifecycle.js';

let currentPath = null;
let navigationSequence = 0;

function setLoading(active) {
  const element = document.getElementById('spa-loading');
  if (element) element.hidden = !active;
}

function showError(show) {
  const element = document.getElementById('spa-error');
  if (element) element.hidden = !show;
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

export async function navigate(target, options = {}) {
  const url = new URL(target, window.location.origin);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }

  const route = resolveRoute(url.pathname);
  if (!route) {
    window.location.assign(url.href);
    return;
  }

  const sequence = ++navigationSequence;
  showError(false);

  if (currentPath && currentPath !== route.path) {
    rememberCurrentView(currentPath);
  }

  if (!options.popstate) {
    history.pushState({ relayTalk: true }, '', url.pathname + url.search + url.hash);
  }

  if (currentPath === route.path && !options.force) {
    restoreView(route.path);
    return;
  }

  setLoading(true);

  try {
    await loadRoute(route, url);
    if (sequence !== navigationSequence) return;

    currentPath = route.path;
    document.title = route.title || 'RelayTalk';
    document.body.dataset.route = route.name;
    scrollToTop();

    if (route.onEnter) await route.onEnter(url);
  } catch (error) {
    console.error('[RelayTalk SPA] Route failed:', error);
    showError(true);
  } finally {
    if (sequence === navigationSequence) setLoading(false);
  }
}

export function startRouter() {
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target === '_blank' || link.hasAttribute('download')) return;

    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    if (!resolveRoute(url.pathname)) return;

    event.preventDefault();
    navigate(url.href);
  });

  window.addEventListener('popstate', () => {
    navigate(location.href, { popstate: true, force: true });
  });

  const retry = document.getElementById('spa-retry');
  if (retry) retry.addEventListener('click', () => navigate(location.href, { force: true }));

  const initial = resolveRoute(location.pathname);
  if (initial && initial.name !== 'landing') {
    const outlet = document.getElementById('spa-outlet');
    const app = document.getElementById('app');
    if (app) app.hidden = true;
    if (outlet) outlet.hidden = false;
    navigate(location.href, { popstate: true, force: true });
  } else {
    currentPath = '/';
  }

  window.RelayRouter = {
    navigate,
    get currentPath() { return currentPath; },
    routes
  };
}
