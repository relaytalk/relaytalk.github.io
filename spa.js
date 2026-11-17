import { createRouter } from "./spa/router.js";
import { routes } from "./spa/routes.js";
import { initialiseLifecycle } from "./spa/lifecycle.js";

const router = createRouter({ routes });

window.RelayRouter = router;
window.RelayTalk = Object.freeze({
    navigate: router.navigate,
    currentRoute: () => router.currentRoute,
    version: "2.0.0"
});

initialiseLifecycle(router);

router.start().catch(error => {
    console.error("[RelayTalk SPA] Startup failed:", error);
});
