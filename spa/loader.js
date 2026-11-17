import {
  getCachedView,
  cacheView,
  activateView
} from './lifecycle.js';

const loadedStyles = new Set();
const loadedModules = new Set();
const loadedClassicScripts = new Set();

function resolveUrl(value, baseUrl) {
  return new URL(value, baseUrl).href;
}

function loadStylesheet(href, baseUrl) {
  const url = resolveUrl(href, baseUrl);
  if (loadedStyles.has(url)) return Promise.resolve();

  loadedStyles.add(url);

  return new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.relayStyle = 'true';

    link.onload = resolve;
    link.onerror = () => {
      console.warn('[RelayTalk SPA] Stylesheet failed:', url);
      resolve();
    };

    document.head.appendChild(link);
  });
}

async function loadExternalScript(script, baseUrl) {
  const src = script.getAttribute('src');
  if (!src || src.includes('sw-manager.js')) return;

  const url = resolveUrl(src, baseUrl);
  const type = (script.getAttribute('type') || '').toLowerCase();

  if (type === 'module') {
    if (loadedModules.has(url)) return;

    // Mark before import to prevent circular/repeated loading.
    loadedModules.add(url);
    await import(url);
    return;
  }

  if (loadedClassicScripts.has(url)) return;
  loadedClassicScripts.add(url);

  await new Promise(resolve => {
    const element = document.createElement('script');
    element.src = url;
    element.async = false;

    element.onload = resolve;
    element.onerror = () => {
      console.warn('[RelayTalk SPA] Script failed:', url);
      resolve();
    };

    document.body.appendChild(element);
  });
}

function runInlineScript(script) {
  const code = script.textContent || '';
  if (!code.trim()) return;

  const element = document.createElement('script');

  for (const attribute of script.attributes) {
    if (attribute.name !== 'src') {
      element.setAttribute(attribute.name, attribute.value);
    }
  }

  element.textContent = code;
  document.body.appendChild(element);

  if (element.type !== 'module') element.remove();
}

function parsePage(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function mountBody(parsed, route) {
  const outlet = document.getElementById('spa-outlet');
  if (!outlet) throw new Error('Missing #spa-outlet');

  const page = document.createElement('section');
  page.className = `spa-page spa-page-${route.name}`;
  page.dataset.spaPath = route.path;
  page.hidden = true;

  const sourceBody = parsed.body.cloneNode(true);
  sourceBody.querySelectorAll('script').forEach(script => script.remove());

  while (sourceBody.firstChild) {
    page.appendChild(sourceBody.firstChild);
  }

  outlet.appendChild(page);
  cacheView(route.path, page);

  return page;
}

export async function loadRoute(route, requestedUrl) {
  if (route.path === '/') {
    activateView('/');
    return;
  }

  const existing = getCachedView(route.path);

  if (existing) {
    activateView(route.path);
    return;
  }

  const response = await fetch(route.source, {
    credentials: 'same-origin',
    cache: 'no-cache',
    headers: { 'X-RelayTalk-Navigation': '1' }
  });

  if (!response.ok) {
    throw new Error(`Could not load ${route.source}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const parsed = parsePage(html);
  const baseUrl = new URL(route.source, location.origin).href;

  // Mount the page before loading its controllers.
  const page = mountBody(parsed, route);
  activateView(route.path);

  // Resolve page CSS against the page's actual URL.
  const stylesheetTasks = [...parsed.head.querySelectorAll('link[rel="stylesheet"]')]
    .map(link => link.getAttribute('href'))
    .filter(Boolean)
    .map(href => loadStylesheet(href, baseUrl));

  await Promise.all(stylesheetTasks);

  // Keep original script order.
  for (const script of [...parsed.body.querySelectorAll('script')]) {
    if (script.src) {
      await loadExternalScript(script, baseUrl);
    } else {
      runInlineScript(script);
    }
  }

  // Some original modules register DOMContentLoaded listeners.
  // Dispatch a scoped compatibility event only after the new view is mounted.
  document.dispatchEvent(new Event('relay:dom-ready'));

  window.dispatchEvent(new CustomEvent('relay:route-mounted', {
    detail: {
      route: route.name,
      path: route.path,
      query: requestedUrl.searchParams,
      element: page
    }
  }));
}
