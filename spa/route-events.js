const handlers = new Map();

export function subscribeRoute(name, callback) {
  if (!handlers.has(name)) handlers.set(name, new Set());

  handlers.get(name).add(callback);

  return () => {
    handlers.get(name)?.delete(callback);
  };
}

export function emitRoute(name, detail = {}) {
  const callbacks = handlers.get(name);
  if (!callbacks) return;

  for (const callback of callbacks) {
    try {
      callback(detail);
    } catch (error) {
      console.error(`[RelayTalk] Route event "${name}" failed:`, error);
    }
  }
}

export function clearRoute(name) {
  handlers.delete(name);
}
