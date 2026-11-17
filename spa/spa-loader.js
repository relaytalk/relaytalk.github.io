import {
    getCachedView,
    cacheView
} from "./page-cache.js";

const loadedStyles = new Set();
const loadedModules = new Set();

function absoluteUrl(value, base) {
    return new URL(value, base).href;
}

function showLoading(show) {
    const loader = document.getElementById("spaLoading");
    if (loader) loader.classList.toggle("active", Boolean(show));
}

function showError(show) {
    const error = document.getElementById("spaError");
    if (error) error.hidden = !show;
}

async function loadStyles(documentFragment, baseUrl) {
    const links = [...documentFragment.querySelectorAll('link[rel="stylesheet"]')];

    for (const oldLink of links) {
        const href = oldLink.getAttribute("href");
        if (!href) continue;

        const url = absoluteUrl(href, baseUrl);
        if (loadedStyles.has(url)) continue;

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        link.dataset.spaStylesheet = "true";

        document.head.appendChild(link);
        loadedStyles.add(url);
    }
}

async function loadScripts(documentFragment, baseUrl) {
    const scripts = [...documentFragment.querySelectorAll('script[type="module"][src]')];

    for (const script of scripts) {
        const src = absoluteUrl(script.getAttribute("src"), baseUrl);
        if (loadedModules.has(src)) continue;

        loadedModules.add(src);

        try {
            await import(src);
        } catch (error) {
            loadedModules.delete(src);
            console.error("[RelayTalk SPA] Module failed:", src, error);
            throw error;
        }
    }
}

function collectBodyContent(parsedDocument) {
    const fragment = document.createDocumentFragment();

    [...parsedDocument.body.children].forEach(element => {
        if (element.tagName === "SCRIPT") return;
        if (element.id === "spaLoading" || element.id === "spaError") return;
        fragment.appendChild(element);
    });

    return fragment;
}

export async function loadRoute(route, outlet) {
    if (!route || !outlet) throw new Error("Invalid route or outlet.");

    const cached = getCachedView(route.id);
    if (cached) {
        outlet.replaceChildren(cached);
        return cached;
    }

    if (route.landing) {
        const landing = document.getElementById("landingPage");
        if (!landing) throw new Error("Landing page markup is missing.");

        const wrapper = document.createElement("section");
        wrapper.className = "spa-view";
        wrapper.dataset.routeId = route.id;
        wrapper.appendChild(landing);

        outlet.replaceChildren(wrapper);
        cacheView(route.id, wrapper);
        return wrapper;
    }

    showLoading(true);
    showError(false);

    try {
        const response = await fetch(route.file, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-cache",
            headers: { "X-RelayTalk-Navigation": "spa" }
        });

        if (!response.ok) {
            throw new Error(`Page request failed (${response.status}).`);
        }

        const html = await response.text();
        const parsed = new DOMParser().parseFromString(html, "text/html");
        const baseUrl = new URL(route.file, window.location.origin);

        await loadStyles(parsed, baseUrl);

        const wrapper = document.createElement("section");
        wrapper.className = "spa-view";
        wrapper.dataset.routeId = route.id;
        wrapper.appendChild(collectBodyContent(parsed));

        outlet.replaceChildren(wrapper);

        document.title = parsed.title || route.title;

        await loadScripts(parsed, baseUrl);

        cacheView(route.id, wrapper);

        document.dispatchEvent(new CustomEvent("relaytalk:route-mounted", {
            detail: { route, element: wrapper }
        }));

        return wrapper;
    } catch (error) {
        showError(true);
        throw error;
    } finally {
        showLoading(false);
    }
}
