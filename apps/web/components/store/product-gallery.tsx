'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import type { ImageDto } from '@gk/types';
import { Img } from '@/components/ui/img';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/overlay';
import { cn } from '@/lib/utils';

/** Thumbnail rail + hover-zoom main image (desktop) + full-screen lightbox. */
export function ProductGallery({ images, name }: { images: ImageDto[]; name: string }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const safeIdx = Math.min(active, Math.max(images.length - 1, 0));
  const current = images[safeIdx];
  const step = (d: number) => setActive((i) => (i + d + images.length) % images.length);

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row" aria-label="Product images">
      {images.length > 1 && (
        <ul
          className="no-scrollbar flex gap-2 overflow-x-auto lg:max-h-[34rem] lg:flex-col lg:overflow-y-auto"
          role="tablist"
          aria-label="Image thumbnails"
        >
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                role="tab"
                aria-selected={i === safeIdx}
                aria-label={`View image ${i + 1}`}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'relative block size-16 overflow-hidden rounded-xl border-2 bg-muted transition-all sm:size-[4.5rem]',
                  i === safeIdx
                    ? 'border-primary shadow-soft'
                    : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <Img src={img.url} alt="" fill sizes="72px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative flex-1">
        <div
          className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-3xl border bg-muted shadow-soft"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setZoom({
              x: ((e.clientX - r.left) / r.width) * 100,
              y: ((e.clientY - r.top) / r.height) * 100,
            });
          }}
          onMouseLeave={() => setZoom(null)}
          onClick={() => setOpen(true)}
        >
          {current && (
            <Img
              src={current.url}
              alt={current.alt ?? name}
              fill
              priority
              sizes="(min-width:1024px) 45vw, 100vw"
              className="object-cover transition-transform duration-200"
              style={
                zoom
                  ? { transform: 'scale(1.9)', transformOrigin: `${zoom.x}% ${zoom.y}%` }
                  : undefined
              }
            />
          )}
          <span className="absolute bottom-3 right-3 grid size-9 place-content-center rounded-full bg-card/90 opacity-0 shadow transition-opacity group-hover:opacity-100">
            <Expand className="size-4" />
          </span>
        </div>
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => step(-1)}
              className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-content-center rounded-full bg-card/90 shadow lg:hidden"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => step(1)}
              className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-content-center rounded-full bg-card/90 shadow lg:hidden"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="p-2 sm:p-3">
          <DialogTitle className="sr-only">
            {name} — image {safeIdx + 1} of {images.length}
          </DialogTitle>
          <div className="relative aspect-square max-h-[80dvh] w-full overflow-hidden rounded-xl bg-muted">
            {current && (
              <Img
                src={current.url}
                alt={current.alt ?? name}
                fill
                sizes="90vw"
                className="object-contain"
              />
            )}
          </div>
          {images.length > 1 && (
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous image"
                className="grid size-10 place-content-center rounded-full border hover:bg-muted"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next image"
                className="grid size-10 place-content-center rounded-full border hover:bg-muted"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
