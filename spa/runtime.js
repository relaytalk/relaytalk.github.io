
const loadedStyles = new Set();
const loadedScripts = new Set();

function absolute(value, base) {
    return new URL(value, base).href;
}

function isExternal(url) {
    return new URL(url).origin !== window.location.origin;
}

function addStylesheet(href, base) {
    const url = absolute(href, base);

    if (loadedStyles.has(url)) return Promise.resolve();

    loadedStyles.add(url);

    return new Promise((resolve, reject) => {
        const link = document.createElement("link");

        link.rel = "stylesheet";
        link.href = url;
        link.dataset.relaytalkPageStyle = "true";

        link.onload = resolve;
        link.onerror = () => {
            loadedStyles.delete(url);
            reject(new Error(`Stylesheet failed: ${url}`));
        };

        document.head.appendChild(link);
    });
}

function addInlineStyle(style) {
    const node = document.createElement("style");
    node.dataset.relaytalkPageStyle = "true";
    node.textContent = style.textContent;
    document.head.appendChild(node);
}

async function loadStyles(parsed, base) {
    const links = [
        ...parsed.querySelectorAll('link[rel="stylesheet"]')
    ];

    const styles = [
        ...parsed.querySelectorAll("style")
    ];

    for (const link of links) {
        const href = link.getAttribute("href");

        if (!href) continue;

        await addStylesheet(href, base);
    }

    for (const style of styles) {
        addInlineStyle(style);
    }
}

function createPageContainer() {
    const container = document.createElement("div");

    container.className = "spa-page";
    container.dataset.relaytalkPage = "true";

    return container;
}

function cleanOldPage(outlet) {
    const oldPage = outlet.querySelector(
        ":scope > .spa-page"
    );

    if (oldPage) oldPage.remove();
}

function moveBodyContent(parsed, container) {
    const body = parsed.body;

    for (const child of [...body.children]) {
        if (child.tagName === "SCRIPT") continue;

        if (
            child.id === "openingScreen" ||
            child.id === "spaLoading" ||
            child.id === "spaError"
        ) continue;

        container.appendChild(child);
    }
}

async function loadExternalScript(src, module, base) {
    const url = absolute(src, base);

    if (loadedScripts.has(url)) return;

    loadedScripts.add(url);

    try {
        if (module) {
            await import(url);
            return;
        }

        await new Promise((resolve, reject) => {
            const script = document.createElement("script");

            script.src = url;
            script.async = false;

            script.onload = resolve;

            script.onerror = () => {
                loadedScripts.delete(url);
                reject(new Error(`Script failed: ${url}`));
            };

            document.body.appendChild(script);
        });
    } catch (error) {
        loadedScripts.delete(url);
        throw error;
    }
}

async function executeScripts(parsed, base) {
    const scripts = [
        ...parsed.querySelectorAll("script")
    ];

    for (const original of scripts) {
        const type = (
            original.getAttribute("type") || ""
        ).toLowerCase();

        const isModule = type === "module";

        if (
            type === "application/ld+json" ||
            type === "application/json"
        ) continue;

        const src = original.getAttribute("src");

        if (src) {
            await loadExternalScript(src, isModule, base);
            continue;
        }

        const script = document.createElement("script");

        if (isModule) {
            script.type = "module";
        }

        if (original.noModule) {
            script.noModule = true;
        }

        script.textContent = original.textContent;

        document.body.appendChild(script);

        if (!isModule) {
            script.remove();
        }
    }
}

export async function mountPage({
    html,
    file,
    outlet,
    route
}) {
    if (!outlet) {
        throw new Error("Missing SPA outlet.");
    }

    if (!html) {
        const originalLanding =
            document.getElementById("mainContent");

        if (!originalLanding) {
            throw new Error("Original landing content is missing.");
        }

        cleanOldPage(outlet);

        const container = createPageContainer();
        container.appendChild(originalLanding);

        outlet.appendChild(container);

        return container;
    }

    const parsed = new DOMParser().parseFromString(
        html,
        "text/html"
    );

    const base = new URL(file, window.location.origin);

    await loadStyles(parsed, base);

    const container = createPageContainer();

    moveBodyContent(parsed, container);

    cleanOldPage(outlet);
    outlet.appendChild(container);

    document.dispatchEvent(
        new CustomEvent("relaytalk:page-dom-mounted", {
            detail: {
                route,
                container
            }
        })
    );

    await executeScripts(parsed, base);

    return container;
}
s
