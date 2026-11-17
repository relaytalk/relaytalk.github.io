const PUBLIC_PATHS = new Set([
    "/",
    "/index.html",
    "/pages/auth",
    "/pages/auth/index.html",
    "/pages/login",
    "/pages/login/index.html",
    "/about",
    "/about/index.html"
]);

export function hasStoredSession() {
    try {
        const keys = [
            "supabase.auth.token",
            "sb-kponqaktavkrchebmiwr-auth-token"
        ];

        return keys.some(key => {
            const local = localStorage.getItem(key);
            const session = sessionStorage.getItem(key);
            return Boolean(local || session);
        });
    } catch (error) {
        console.warn("[RelayTalk] Session storage unavailable:", error);
        return false;
    }
}

export function isPublicPath(pathname) {
    const path = pathname.replace(/\/$/, "") || "/";
    return PUBLIC_PATHS.has(path);
}

export function getLoginPath() {
    return "/pages/login/index.html";
}

export function getHomePath() {
    return "/pages/home/index.html";
}
