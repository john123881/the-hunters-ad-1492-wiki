const imageLoadCache = new Map<string, Promise<void>>();

export function preloadImage(url: string): Promise<void> {
  if (!url) return Promise.resolve();

  const cached = imageLoadCache.get(url);
  if (cached) return cached;

  const pending = new Promise<void>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      if (typeof image.decode !== 'function') {
        resolve();
        return;
      }
      image.decode().then(resolve).catch(() => resolve());
    };
    image.onerror = () => reject(new Error('Image failed to load: ' + url));
    image.src = url;
  }).catch((error: unknown) => {
    imageLoadCache.delete(url);
    throw error;
  });

  imageLoadCache.set(url, pending);
  return pending;
}

export async function preloadImages(urls: Iterable<string>): Promise<void> {
  const uniqueUrls = [...new Set([...urls].filter(Boolean))];
  await Promise.all(uniqueUrls.map(preloadImage));
}

