import Image, { type ImageProps } from 'next/image';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const isSvg = (src: string) => /\.svg(\?|$)/i.test(src) || src.includes('/media/');

/** Hosts allow-listed in next.config (remotePatterns). Any other host is loaded directly instead of via the optimiser. */
const OPTIMISED_HOSTS = ['res.cloudinary.com', 'images.pexels.com'];
const optimisable = (src: string) => {
  try {
    return OPTIMISED_HOSTS.includes(new URL(src).hostname);
  } catch {
    return src.startsWith('/');
  }
};

/**
 * next/image wrapper: raster images (Cloudinary uploads) are optimised; the API's generated SVG
 * artwork is served as-is (vector images can't be resized, so optimisation would only add latency).
 */
export function Img({
  src,
  alt,
  className,
  ...props
}: Omit<ImageProps, 'src'> & { src?: string | null }) {
  if (!src) {
    return (
      <div
        className={cn('grid place-content-center bg-muted text-muted-foreground', className)}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="size-6 opacity-50" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      unoptimized={isSvg(src) || !optimisable(src)}
      {...props}
    />
  );
}
