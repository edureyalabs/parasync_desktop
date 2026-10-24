// src/renderer/src/shims/nextImage.tsx
// Stands in for Next.js's <Image>: a plain image (the app has no image server to optimise for).
import type { CSSProperties, ImgHTMLAttributes } from 'react';

interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
  sizes?: string;
  placeholder?: string;
}

export default function Image({ src, alt, width, height, fill, priority: _p, quality: _q, unoptimized: _u, sizes: _s, placeholder: _ph, style, ...rest }: ImageProps) {
  const fillStyle: CSSProperties = fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : {};
  return <img {...rest} src={src} alt={alt} width={fill ? undefined : width} height={fill ? undefined : height} style={{ ...fillStyle, ...style }} draggable={false} />;
}
