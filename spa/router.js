import { findRoute, normalisePath } from "./routes.js";
import { loadRoute } from "./loader.js";

export function createRouter({ routes }) {
    const outlet = document.getElementById("spaOutlet");

    let currentRoute = null;
    let navigationId = 0;
    let started = false;

    async function render(pathname, options = {}) {
        const route = findRoute(pathname, routes);

        if (!route) {
            window.location.assign(pathname);
            return;
        }

        const requestId = ++navigationId;

        if (!options.popstate) {
            const method = options.replace ? "replaceState" : "pushState";
            history[method]({ relaytalk: true, route: route.id }, "", options.url || pathname);
        }

        if (!route.public && route.id !== "home") {
            // Authentication is checked by the original page controllers.
            // This router deliberately does not replace or recreate Supabase auth.
        }

        try {
            const { loadRoute } = await import("./loader.js");
            await loadRoute(route, outlet);

            if (requestId !== navigationId) return;

            currentRoute = route;
            document.body.dataset.route = route.id;
            document.title = route.title;

            document.dispatchEvent(new CustomEvent("relaytalk:route-changed", {
                detail: { route, previous: currentRoute }
            }));

            window.scrollTo({ top: 0, behavior: "instant" });
        } catch (error) {
            console.error("[RelayTalk SPA] Navigation error:", error);
        }
    }

    function navigate(path, options = {}) {
        const url = new URL(path, window.location.origin);

        if (url.origin !== window.location.origin) {
            window.location.assign(url.href);
            return Promise.resolve();
        }

        return render(url.pathname + url.search + url.hash, {
            ...options,
            url: url.pathname + url.search + url.hash
        });
    }

    function handleLinkClick(event) {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const anchor = event.target.closest("a[href]");
        if (!anchor) return;

        if (
            anchor.target === "_blank" ||
            anchor.hasAttribute("download") ||
            anchor.getAttribute("href")?.startsWith("#") ||
            anchor.getAttribute("href")?.startsWith("mailto:") ||
            anchor.getAttribute("href")?.startsWith("tel:")
        ) return;

        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;

        const route = findRoute(url.pathname, routes);
        if (!route) return;

        event.preventDefault();
        navigate(url.pathname + url.search + url.hash);
    }

    function handlePopState() {
        render(
            normalisePath(window.location.pathname) +
            window.location.search +
            window.location.hash,
            { popstate: true }
        );
    }

    async function start() {
        if (started) return;
        if (!outlet) throw new Error("SPA outlet #spaOutlet is missing.");

        started = true;
        document.addEventListener("click", handleLinkClick);
        window.addEventListener("popstate", handlePopState);

        await render(
            window.location.pathname +
            window.location.search +
            window.location.hash,
            { replace: true }
        );
    }

    return {
        start,
        navigate,
        get currentRoute() { return currentRoute; }
    };
}
