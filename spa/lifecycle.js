export function initialiseLifecycle(router) {
    document.addEventListener("visibilitychange", () => {
        document.dispatchEvent(new CustomEvent(
            document.hidden ? "relaytalk:app-hidden" : "relaytalk:app-visible"
        ));
    });

    window.addEventListener("online", () => {
        document.dispatchEvent(new CustomEvent("relaytalk:online"));
    });

    window.addEventListener("offline", () => {
        document.dispatchEvent(new CustomEvent("relaytalk:offline"));
    });

    window.addEventListener("pageshow", event => {
        if (event.persisted && router.currentRoute) {
            document.dispatchEvent(new CustomEvent("relaytalk:pageshow", {
                detail: { route: router.currentRoute }
            }));
        }
    });

    document.addEventListener("relaytalk:route-changed", event => {
        const route = event.detail?.route;
        if (!route) return;

        document.body.dataset.route = route.id;
        document.body.classList.toggle("is-auth-page",
            route.id === "login" || route.id === "signup");
        document.body.classList.toggle("is-chat-page", route.id === "chat");
    });
}
