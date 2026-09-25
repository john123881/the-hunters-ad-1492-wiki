import { useState } from 'react';
import { ImageOff } from 'lucide-react';

export function webpImageUrl(src: string) {
  return src.replace(/\.png$/i, '.webp');
}

export function CardImage({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (failedSrc === src) return <div className="image-fallback" role="img" aria-label={alt + '（圖片暫缺）'}>
    <ImageOff size={32} strokeWidth={1} /><span>圖片暫缺</span>
  </div>;

  const webpSrc = webpImageUrl(src);
  return <picture className="optimized-picture">
    {webpSrc !== src && <source srcSet={webpSrc} type="image/webp" />}
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      width="480"
      height="360"
      onError={() => setFailedSrc(src)}
    />
  </picture>;
}
