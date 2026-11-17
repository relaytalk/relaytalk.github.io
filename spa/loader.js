import { getCachedView, cacheView, activateView } from './lifecycle.js';

const loadedStyles = new Set();
const loadedModules = new Set();
const loadedClassicScripts = new Set();

function absoluteUrl(value, baseUrl) {
  return new URL(value, baseUrl).href;
}

function addStylesheet(href, baseUrl) {
  const url = absoluteUrl(href, baseUrl);
  if (loadedStyles.has(url)) return Promise.resolve();

  loadedStyles.add(url);

  return new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = resolve;
    link.onerror = () => {
      console.warn('[RelayTalk SPA] Stylesheet could not load:', url);
      resolve();
    };
    document.head.appendChild(link);
  });
}

async function runScript(script, baseUrl) {
  const source = script.getAttribute('src');
  const type = (script.getAttribute('type') || '').toLowerCase();

  if (source) {
    if (source.includes('sw-manager.js')) return;

    const url = absoluteUrl(source, baseUrl);

    if (type === 'module') {
      if (loadedModules.has(url)) return;
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
        console.warn('[RelayTalk SPA] Script could not load:', url);
        resolve();
      };
      document.body.appendChild(element);
    });

    return;
  }

  const code = script.textContent || '';
  if (!code.trim()) return;

  const element = document.createElement('script');
  for (const attribute of script.attributes) {
    if (attribute.name !== 'src') element.setAttribute(attribute.name, attribute.value);
  }
  element.textContent = code;
  document.body.appendChild(element);

  if (element.type !== 'module') element.remove();
}

function extractBody(documentText) {
  const parsed = new DOMParser().parseFromString(documentText, 'text/html');
  return {
    parsed,
    body: parsed.body,
    scripts: [...parsed.body.querySelectorAll('script')]
  };
}

export async function loadRoute(route, requestedUrl) {
  const outlet = document.getElementById('spa-outlet');
  if (!outlet) throw new Error('SPA outlet is missing from index.html');

  const cached = getCachedView(route.path);
  if (cached) {
    activateView(route.path);
    return;
  }

  const response = await fetch(route.source, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'X-RelayTalk-Navigation': '1' }
  });

  if (!response.ok) throw new Error(`Page request failed: ${response.status}`);

  const html = await response.text();
  const baseUrl = new URL(route.source, window.location.origin).href;
  const { parsed, body, scripts } = extractBody(html);

  const stylesheetPromises = [...parsed.head.querySelectorAll('link[rel="stylesheet"]')]
    .map(link => link.href)
    .filter(Boolean)
    .map(href => addStylesheet(href, baseUrl));

  const page = document.createElement('section');
  page.className = `spa-page spa-page-${route.name}`;
  page.dataset.spaPath = route.path;
  page.hidden = true;

  const content = body.cloneNode(true);
  content.querySelectorAll('script').forEach(script => script.remove());

  while (content.firstChild) page.appendChild(content.firstChild);

  outlet.appendChild(page);
  cacheView(route.path, page);
  activateView(route.path);

  await Promise.all(stylesheetPromises);

  for (const script of scripts) {
    await runScript(script, baseUrl);
  }

  page.dispatchEvent(new CustomEvent('relay:page-mounted', {
    bubbles: true,
    detail: {
      route: route.name,
      path: route.path,
      query: requestedUrl.searchParams
    }
  }));

  window.dispatchEvent(new CustomEvent('relay:route-mounted', {
    detail: { route: route.name, path: route.path }
  }));
}
