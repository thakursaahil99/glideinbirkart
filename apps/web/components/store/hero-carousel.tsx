'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { BannerDto } from '@gk/types';
import { Img } from '@/components/ui/img';
import { cn } from '@/lib/utils';

/** The API's generated SVG artwork already has its headline drawn in; real photos need the text overlaid. */
export const hasBakedText = (imageUrl: string) => imageUrl.includes('/media/banner/');

/** Auto-playing, swipeable hero. Pauses on hover/focus and when the user prefers reduced motion. */
export function HeroCarousel({ banners }: { banners: BannerDto[] }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const reduced = useRef(false);
  const count = banners.length;

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced.current) setManualPause(true);
  }, []);

  const go = useCallback(
    (next: number, direction?: number) => {
      setDir(direction ?? (next > index ? 1 : -1));
      setIndex((next + count) % count);
    },
    [count, index],
  );

  useEffect(() => {
    if (count < 2 || paused || manualPause) return;
    const t = setTimeout(() => go(index + 1, 1), 6000);
    return () => clearTimeout(t);
  }, [index, paused, manualPause, count, go]);

  if (count === 0) return null;
  const banner = banners[index] as BannerDto;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) go(index + 1, 1);
    else if (info.offset.x > 60) go(index - 1, -1);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured offers"
      className="group relative overflow-hidden rounded-3xl bg-muted shadow-lift"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        className="relative aspect-[10/7] sm:aspect-[16/6]"
        aria-live={paused || manualPause ? 'polite' : 'off'}
      >
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={banner.id}
            custom={dir}
            initial={{ opacity: 0, x: dir * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -60 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={onDragEnd}
            className="absolute inset-0"
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
          >
            <Link
              href={banner.linkUrl ?? '/search'}
              className="relative block size-full"
              draggable={false}
            >
              {/* mobile art is portrait-ish; desktop art is wide */}
              <Img
                src={banner.mobileImageUrl ?? banner.imageUrl}
                alt={`${banner.title}. ${banner.subtitle ?? ''}`}
                fill
                priority
                sizes="100vw"
                className="object-cover sm:hidden"
                draggable={false}
              />
              <Img
                src={banner.imageUrl}
                alt=""
                aria-hidden
                fill
                priority
                sizes="(min-width:1400px) 1400px, 100vw"
                className="hidden object-cover sm:block"
                draggable={false}
              />
              {!hasBakedText(banner.imageUrl) && (
                <>
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-transparent"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 flex w-full max-w-xl flex-col justify-center gap-2 px-6 text-white sm:gap-3 sm:px-12"
                  >
                    <span className="text-2xl font-bold leading-tight sm:text-5xl">
                      {banner.title}
                    </span>
                    {banner.subtitle && (
                      <span className="line-clamp-2 text-sm text-white/90 sm:text-lg">
                        {banner.subtitle}
                      </span>
                    )}
                    <span className="mt-1 inline-flex w-fit rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground shadow-lift">
                      {banner.ctaText ?? 'Shop now'}
                    </span>
                  </span>
                </>
              )}
              <span className="sr-only">{banner.ctaText ?? 'Shop now'}</span>
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <>
          {(['prev', 'next'] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-label={side === 'prev' ? 'Previous slide' : 'Next slide'}
              onClick={() => go(index + (side === 'prev' ? -1 : 1), side === 'prev' ? -1 : 1)}
              className={cn(
                'absolute top-1/2 hidden size-11 -translate-y-1/2 place-content-center rounded-full bg-card/90 text-foreground opacity-0 shadow-lift backdrop-blur transition-opacity hover:bg-card focus-visible:opacity-100 group-hover:opacity-100 sm:grid',
                side === 'prev' ? 'left-4' : 'right-4',
              )}
            >
              {side === 'prev' ? (
                <ChevronLeft className="size-5" />
              ) : (
                <ChevronRight className="size-5" />
              )}
            </button>
          ))}
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-foreground/30 px-3 py-1.5 backdrop-blur">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => go(i)}
                  className={cn(
                    'h-2 rounded-full transition-all',
                    i === index ? 'w-6 bg-accent' : 'w-2 bg-white/70 hover:bg-white',
                  )}
                />
              ))}
              <button
                type="button"
                aria-label={manualPause ? 'Play slideshow' : 'Pause slideshow'}
                onClick={() => setManualPause((p) => !p)}
                className="ml-1 text-white/90 hover:text-white"
              >
                {manualPause ? (
                  <Play className="size-3.5" fill="currentColor" />
                ) : (
                  <Pause className="size-3.5" fill="currentColor" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
