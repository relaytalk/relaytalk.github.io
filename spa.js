
import { RelayRouter } from "./spa/router.js";

const router = new RelayRouter({
    outlet: document.getElementById("spaOutlet")
});

window.RelayRouter = router;

window.relayNavigate = (path, options = {}) =>
    router.navigate(path, options);

window.goToLogin = () =>
    router.navigate("/pages/login/index.html");

window.goToSignup = () =>
    router.navigate("/pages/auth/index.html");

window.goToHome = () =>
    router.navigate("/pages/home/index.html");

window.goToFriends = () =>
    router.navigate("/pages/home/friends/index.html");

window.goToProfile = () =>
    router.navigate("/pages/home/profile/index.html");

window.addEventListener("DOMContentLoaded", () => {
    const opening = document.getElementById("openingScreen");

    if (opening) {
        setTimeout(() => {
            opening.classList.add("is-hidden");
            setTimeout(() => opening.remove(), 450);
        }, 450);
    }
});

router.start().catch(error => {
    console.error("[RelayTalk] SPA startup failed:", error);
});
