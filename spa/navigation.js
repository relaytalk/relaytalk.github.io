export function navigate(path, options = {}) {
    const router = window.RelayRouter;

    if (router && typeof router.navigate === "function") {
        return router.navigate(path, options);
    }

    window.location.assign(path);
}

export function replace(path) {
    return navigate(path, { replace: true });
}

export function back(fallback = "/pages/home/index.html") {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        navigate(fallback, { replace: true });
    }
}

window.relayNavigate = navigate;
window.relayBack = back;
