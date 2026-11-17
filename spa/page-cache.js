const views = new Map();

export function getCachedView(routeId) {
    return views.get(routeId) || null;
}

export function cacheView(routeId, element) {
    if (!routeId || !element) return;
    views.set(routeId, element);
}

export function hasCachedView(routeId) {
    return views.has(routeId);
}

export function removeCachedView(routeId) {
    const element = views.get(routeId);
    if (element?.isConnected) element.remove();
    views.delete(routeId);
}

export function clearPageCache() {
    for (const element of views.values()) {
        if (element?.isConnected) element.remove();
    }
    views.clear();
}
