import { useState } from 'react';
import { ImageOff } from 'lucide-react';

export function CardImage({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (failedSrc === src) return <div className="image-fallback" role="img" aria-label={alt + '（圖片暫缺）'}>
    <ImageOff size={32} strokeWidth={1} /><span>圖片暫缺</span>
  </div>;
  return <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} width="480" height="360"
    onError={() => setFailedSrc(src)} />;
}
