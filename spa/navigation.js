export function goTo(path, options = {}) {
  if (window.RelayRouter?.navigate) {
    window.RelayRouter.navigate(path, options);
    return;
  }

  window.location.href = path;
}

export function goBack(fallback = '/pages/home/') {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    goTo(fallback);
  }
}

export function currentQuery() {
  return new URLSearchParams(window.location.search);
}

export function currentPath() {
  return window.location.pathname;
}
