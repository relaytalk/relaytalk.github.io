const imageFallbacks = new WeakMap();

export function resolveAsset(path) {
  if (!path) return '';
  return new URL(path, window.location.origin).href;
}

export function preloadImage(path) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = resolveAsset(path);
  });
}

export function setImageFallback(image, fallback) {
  if (!(image instanceof HTMLImageElement)) return;

  const original = image.src;
  imageFallbacks.set(image, original);

  image.addEventListener('error', () => {
    if (fallback && image.src !== fallback) {
      image.src = fallback;
    }
  }, { once: true });
}
