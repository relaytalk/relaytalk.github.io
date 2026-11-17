
import { mountPage } from "./runtime.js";

const ROUTES = [
    { path: "/", file: null, title: "RelayTalk" },
    { path: "/index.html", file: null, title: "RelayTalk" },

    { path: "/pages/auth/index.html", title: "Create Account — RelayTalk" },
    { path: "/pages/login/index.html", title: "Login — RelayTalk" },

    { path: "/pages/home/index.html", title: "Home — RelayTalk" },
    { path: "/pages/home/friends/index.html", title: "Friends — RelayTalk" },
    { path: "/pages/home/profile/index.html", title: "Profile — RelayTalk" },
    { path: "/pages/home/profile/view.html", title: "Profile — RelayTalk" },

    { path: "/pages/chats/index.html", title: "Chat — RelayTalk" },

    { path: "/pages/call-app/index.html", title: "Calls — RelayTalk" },
    { path: "/pages/call-app/call/index.html", title: "Call — RelayTalk" },
    { path: "/pages/call-app/pages/history/index.html", title: "Call History — RelayTalk" },

    { path: "/about/index.html", title: "About RelayTalk" },
    { path: "/about/", title: "About RelayTalk" }
];

function normalise(path) {
    if (!path) return "/";

    const clean = path.split("?")[0].split("#")[0];

    if (clean === "/") return "/";
    return clean.replace(/\/+$/, "");
}

function findRoute(path) {
    const clean = normalise(path);

    return ROUTES.find(route =>
        normalise(route.path) === clean
    ) || null;
}

export class RelayRouter {
    constructor({ outlet }) {
        if (!outlet) {
            throw new Error("RelayTalk SPA outlet is missing.");
        }

        this.outlet = outlet;
        this.currentPath = window.location.pathname;
        this.currentRoute = null;
        this.busy = false;
        this.navigationSequence = 0;
    }

    async start() {
        document.addEventListener("click", event => {
            this.handleLink(event);
        });

        window.addEventListener("popstate", () => {
            this.render(
                window.location.pathname +
                window.location.search +
                window.location.hash,
                { history: false }
            );
        });

        await this.render(
            window.location.pathname +
            window.location.search +
            window.location.hash,
            { history: false, initial: true }
        );
    }

    async navigate(path, options = {}) {
        const url = new URL(path, window.location.origin);

        if (url.origin !== window.location.origin) {
            window.location.assign(url.href);
            return;
        }

        const destination =
            url.pathname + url.search + url.hash;

        return this.render(destination, {
            history: true,
            replace: Boolean(options.replace)
        });
    }

    handleLink(event) {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;

        if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) return;

        const anchor = event.target.closest("a[href]");
        if (!anchor) return;

        if (
            anchor.target === "_blank" ||
            anchor.hasAttribute("download")
        ) return;

        const href = anchor.getAttribute("href");

        if (
            !href ||
            href.startsWith("#") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:") ||
            href.startsWith("javascript:")
        ) return;

        const url = new URL(anchor.href, window.location.href);

        if (url.origin !== window.location.origin) return;

        const route = findRoute(url.pathname);
        if (!route) return;

        event.preventDefault();

        this.navigate(
            url.pathname + url.search + url.hash
        );
    }

    async render(path, options = {}) {
        const route = findRoute(path);

        if (!route) {
            window.location.assign(path);
            return;
        }

        const sequence = ++this.navigationSequence;

        if (options.history) {
            const method = options.replace
                ? "replaceState"
                : "pushState";

            window.history[method](
                { relaytalk: true, path },
                "",
                path
            );
        }

        if (this.busy) {
            this.navigationSequence++;
        }

        this.busy = true;

        const transition =
            document.getElementById("spaTransition");

        const loading =
            document.getElementById("spaLoading");

        if (loading) loading.classList.add("active");

        if (transition) {
            transition.classList.add("fade-out");
        }

        try {
            await new Promise(resolve =>
                setTimeout(resolve, 170)
            );

            if (sequence !== this.navigationSequence) return;

            if (route.file) {
                const response = await fetch(route.file, {
                    credentials: "same-origin",
                    cache: "no-cache",
                    headers: {
                        "X-RelayTalk-SPA": "true"
                    }
                });

                if (!response.ok) {
                    throw new Error(
                        `Could not load ${route.file}: ${response.status}`
                    );
                }

                const html = await response.text();

                await mountPage({
                    html,
                    file: route.file,
                    outlet: this.outlet,
                    route
                });
            } else {
                await mountPage({
                    html: null,
                    file: null,
                    outlet: this.outlet,
                    route
                });
            }

            if (sequence !== this.navigationSequence) return;

            this.currentPath = path;
            this.currentRoute = route;

            document.title = route.title;
            document.body.dataset.route =
                normalise(route.path).replaceAll("/", "-").replace(/^-/, "") || "landing";

            document.dispatchEvent(
                new CustomEvent("relaytalk:route-changed", {
                    detail: {
                        route,
                        path
                    }
                })
            );

            if (urlHasHash(path)) {
                const hash = path.split("#")[1];

                requestAnimationFrame(() => {
                    document.getElementById(hash)?.scrollIntoView();
                });
            } else {
                window.scrollTo(0, 0);
            }

            if (transition) {
                transition.classList.remove("fade-out");
                transition.classList.add("fade-in");

                setTimeout(() => {
                    transition.classList.remove("fade-in");
                }, 260);
            }
        } catch (error) {
            console.error("[RelayTalk SPA] Route error:", error);

            this.outlet.innerHTML = `
                <section class="spa-failure">
                    <div>
                        <h2>Unable to open this page</h2>
                        <p>${escapeHtml(error.message)}</p>
                        <button type="button" id="spaRetry">Try again</button>
                    </div>
                </section>
            `;

            document.getElementById("spaRetry")?.addEventListener(
                "click",
                () => this.render(path, { history: false })
            );
        } finally {
            this.busy = false;

            if (loading) {
                loading.classList.remove("active");
            }
        }
    }
}

function urlHasHash(path) {
    return path.includes("#");
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}
