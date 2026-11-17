export const routes = [
  { name: 'landing', path: '/', source: null, title: 'RelayTalk — Conversations, connected.' },
  { name: 'login', path: '/pages/login/', source: '/pages/login/index.html', title: 'Log in — RelayTalk' },
  { name: 'signup', path: '/pages/auth/', source: '/pages/auth/index.html', title: 'Create account — RelayTalk' },
  { name: 'home', path: '/pages/home/', source: '/pages/home/index.html', title: 'Home — RelayTalk' },
  { name: 'friends', path: '/pages/home/friends/', source: '/pages/home/friends/index.html', title: 'Friends — RelayTalk' },
  { name: 'profile', path: '/pages/home/profile/', source: '/pages/home/profile/index.html', title: 'My profile — RelayTalk' },
  { name: 'public-profile', path: '/pages/home/profile/view/', source: '/pages/home/profile/view.html', title: 'Profile — RelayTalk' },
  { name: 'chat', path: '/pages/chats/', source: '/pages/chats/index.html', title: 'Chat — RelayTalk' },
  { name: 'calls', path: '/pages/call-app/', source: '/pages/call-app/index.html', title: 'Calls — RelayTalk' },
  { name: 'call', path: '/pages/call-app/call/', source: '/pages/call-app/call/index.html', title: 'Call — RelayTalk' },
  { name: 'call-history', path: '/pages/call-app/pages/history/', source: '/pages/call-app/pages/history/index.html', title: 'Call history — RelayTalk' },
  { name: 'about', path: '/about/', source: '/about/index.html', title: 'About — RelayTalk' }
];

const aliases = {
  '/index.html': '/',
  '/pages/login/index.html': '/pages/login/',
  '/pages/auth/index.html': '/pages/auth/',
  '/pages/home/index.html': '/pages/home/',
  '/pages/home/friends/index.html': '/pages/home/friends/',
  '/pages/home/profile/index.html': '/pages/home/profile/',
  '/pages/home/profile/view.html': '/pages/home/profile/view/',
  '/pages/chats/index.html': '/pages/chats/',
  '/pages/call-app/index.html': '/pages/call-app/',
  '/pages/call-app/call/index.html': '/pages/call-app/call/',
  '/pages/call-app/pages/history/index.html': '/pages/call-app/pages/history/',
  '/about/index.html': '/about/'
};

export function normalizePath(pathname = '/') {
  const aliased = aliases[pathname] || pathname;
  if (aliased === '/') return '/';

  let path = aliased.replace(/\/{2,}/g, '/');
  if (!path.endsWith('/') && !path.split('/').pop().includes('.')) {
    path += '/';
  }
  return path;
}

export function resolveRoute(pathname = '/') {
  const path = normalizePath(pathname);
  return routes.find(route => route.path === path) || null;
}
