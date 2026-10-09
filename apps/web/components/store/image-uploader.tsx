'use client';

import { useRef, useState } from 'react';
import { FileText, ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { Img } from '@/components/ui/img';

interface Props {
  folder:
    | 'products'
    | 'reviews'
    | 'returns'
    | 'kyc'
    | 'banners'
    | 'avatars'
    | 'categories'
    | 'brands'
    | 'misc';
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  accept?: string;
  label?: string;
  className?: string;
  /** Show thumbnails for PDFs as file chips (KYC) */
  allowPdf?: boolean;
}

const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url);

/** Multi-image uploader backed by POST /uploads (Cloudinary when configured, local disk otherwise). */
export function ImageUploader({
  folder,
  value,
  onChange,
  max = 5,
  accept,
  label = 'Add image',
  className,
  allowPdf,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = max - value.length;
    if (room <= 0) return toast.error(`You can upload up to ${max} files`);
    setBusy(true);
    const urls: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, room)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 5 MB`);
          continue;
        }
        urls.push((await api.uploads.upload(file, folder)).url);
      }
      if (urls.length) onChange([...value, ...urls]);
    } catch (e) {
      toast.error(errMsg(e, 'Upload failed'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {value.map((url, i) => (
        <div
          key={url}
          className="group relative size-20 overflow-hidden rounded-xl border bg-muted"
        >
          {isPdf(url) ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="grid size-full place-content-center text-primary"
            >
              <FileText className="size-7" />
            </a>
          ) : (
            <Img src={url} alt={`Uploaded ${i + 1}`} fill sizes="80px" className="object-cover" />
          )}
          <button
            type="button"
            aria-label="Remove file"
            onClick={() => onChange(value.filter((u) => u !== url))}
            className="absolute right-1 top-1 grid size-5 place-content-center rounded-full bg-foreground/80 text-background opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="grid size-20 place-content-center rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
          aria-label={label}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-[10px] font-semibold">
              <ImagePlus className="size-5" />
              {label}
            </span>
          )}
        </button>
      )}
      <input
        ref={input}
        type="file"
        hidden
        multiple={max - value.length > 1}
        accept={
          accept ??
          (allowPdf
            ? 'image/jpeg,image/png,image/webp,application/pdf'
            : 'image/jpeg,image/png,image/webp,image/gif')
        }
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  );
}
