import { routes, resolveRoute } from './routes.js';
import { loadRoute } from './loader.js';
import {
  rememberCurrentView,
  activateView,
  getActivePath
} from './lifecycle.js';

let navigationId = 0;

function showLoading(value) {
  const element = document.getElementById('spa-loading');
  if (element) element.hidden = !value;
}

function showError(value) {
  const element = document.getElementById('spa-error');
  if (element) element.hidden = !value;
}

function scrollToHash(hash) {
  if (!hash) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }

  requestAnimationFrame(() => {
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export async function navigate(target, options = {}) {
  const url = new URL(target, location.origin);

  if (url.origin !== location.origin) {
    location.assign(url.href);
    return;
  }

  const route = resolveRoute(url.pathname);

  if (!route) {
    location.assign(url.href);
    return;
  }

  const id = ++navigationId;
  const oldPath = getActivePath();

  showError(false);

  if (oldPath && oldPath !== route.path) {
    rememberCurrentView(oldPath);
  }

  if (!options.popstate && !options.replace) {
    history.pushState({ relayTalk: true }, '', url.pathname + url.search + url.hash);
  } else if (options.replace) {
    history.replaceState({ relayTalk: true }, '', url.pathname + url.search + url.hash);
  }

  if (oldPath === route.path) {
    activateView(route.path);
    scrollToHash(url.hash);
    return;
  }

  showLoading(true);

  try {
    await loadRoute(route, url);
    if (id !== navigationId) return;

    document.title = route.title;
    document.body.dataset.route = route.name;

    if (route.path === '/') {
      document.body.dataset.route = 'landing';
    }

    scrollToHash(url.hash);

    window.dispatchEvent(new CustomEvent('relay:route-changed', {
      detail: { route: route.name, path: route.path, url }
    }));
  } catch (error) {
    console.error('[RelayTalk SPA] Navigation failed:', error);
    showError(true);
  } finally {
    if (id === navigationId) showLoading(false);
  }
}

export function startRouter() {
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target === '_blank' ||
      link.hasAttribute('download')
    ) return;

    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    if (!resolveRoute(url.pathname)) return;

    event.preventDefault();
    navigate(url.href);
  });

  window.addEventListener('popstate', () => {
    navigate(location.href, { popstate: true });
  });

  const retry = document.getElementById('spa-retry');
  if (retry) {
    retry.addEventListener('click', () => navigate(location.href, { replace: true }));
  }

  const initialRoute = resolveRoute(location.pathname);
  if (initialRoute && initialRoute.path !== '/') {
    navigate(location.href, { replace: true });
  } else {
    activateView('/');
  }

  window.RelayRouter = {
    navigate,
    routes,
    get currentPath() {
      return getActivePath();
    }
  };
}
