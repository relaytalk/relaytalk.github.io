export const routes = [
    {
        id: "landing",
        paths: ["/", "/index.html"],
        title: "RelayTalk — Conversations, connected.",
        public: true,
        landing: true
    },
    {
        id: "signup",
        paths: ["/pages/auth/", "/pages/auth/index.html"],
        title: "Create account — RelayTalk",
        public: true,
        file: "/pages/auth/index.html"
    },
    {
        id: "login",
        paths: ["/pages/login/", "/pages/login/index.html"],
        title: "Log in — RelayTalk",
        public: true,
        file: "/pages/login/index.html"
    },
    {
        id: "home",
        paths: ["/pages/home/", "/pages/home/index.html"],
        title: "Home — RelayTalk",
        public: false,
        file: "/pages/home/index.html"
    },
    {
        id: "friends",
        paths: ["/pages/home/friends/", "/pages/home/friends/index.html"],
        title: "Friends — RelayTalk",
        public: false,
        file: "/pages/home/friends/index.html"
    },
    {
        id: "profile",
        paths: ["/pages/home/profile/", "/pages/home/profile/index.html"],
        title: "Profile — RelayTalk",
        public: false,
        file: "/pages/home/profile/index.html"
    },
    {
        id: "profile-view",
        paths: ["/pages/home/profile/view.html"],
        title: "Profile — RelayTalk",
        public: false,
        file: "/pages/home/profile/view.html"
    },
    {
        id: "chat",
        paths: ["/pages/chats/", "/pages/chats/index.html"],
        title: "Chat — RelayTalk",
        public: false,
        file: "/pages/chats/index.html"
    },
    {
        id: "calls",
        paths: ["/pages/call-app/", "/pages/call-app/index.html"],
        title: "Calls — RelayTalk",
        public: false,
        file: "/pages/call-app/index.html"
    },
    {
        id: "call",
        paths: ["/pages/call-app/call/", "/pages/call-app/call/index.html"],
        title: "Call — RelayTalk",
        public: false,
        file: "/pages/call-app/call/index.html"
    },
    {
        id: "call-history",
        paths: ["/pages/call-app/pages/history/", "/pages/call-app/pages/history/index.html"],
        title: "Call history — RelayTalk",
        public: false,
        file: "/pages/call-app/pages/history/index.html"
    },
    {
        id: "about",
        paths: ["/about/", "/about/index.html"],
        title: "About RelayTalk",
        public: true,
        file: "/about/index.html"
    }
];

export function normalisePath(pathname) {
    if (!pathname) return "/";
    const path = pathname.replace(/\/+/g, "/");
    return path.length > 1 ? path.replace(/\/$/, "") : "/";
}

export function findRoute(pathname, routeList = routes) {
    const path = normalisePath(pathname);

    return routeList.find(route =>
        route.paths.some(candidate => normalisePath(candidate) === path)
    ) || null;
}
