import { navigate } from "./spa/navigation.js";

const $ = (selector, root = document) => root.querySelector(selector);

function initialiseLandingPage() {
    const year = $("#copyrightYear");
    if (year) year.textContent = new Date().getFullYear();

    const opening = $("#openingScreen");
    if (opening && !opening.dataset.finished) {
        opening.dataset.finished = "true";
        window.setTimeout(() => opening.classList.add("is-hidden"), 850);
    }

    document.querySelectorAll('a[href^="#"]').forEach(link => {
        if (link.dataset.anchorReady) return;
        link.dataset.anchorReady = "true";

        link.addEventListener("click", event => {
            const id = link.getAttribute("href");
            const target = id && document.querySelector(id);
            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });
}

window.goToLogin = () => navigate("/pages/login/index.html");
window.goToSignup = () => navigate("/pages/auth/index.html");

document.addEventListener("DOMContentLoaded", initialiseLandingPage);
initialiseLandingPage();

window.addEventListener("pageshow", initialiseLandingPage);
