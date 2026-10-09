'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgeCheck, MessageSquareText, Star, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { reviewInputSchema } from '@gk/validators';
import type { ProductDetail, ReviewDto } from '@gk/types';
import { api, hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { errMsg, useZodForm } from '@/lib/forms';
import { cn, formatDate } from '@/lib/utils';
import { Avatar, EmptyState, Progress, Skeleton } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { CheckRow, Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';
import { Img } from '@/components/ui/img';
import { ImageUploader } from './image-uploader';
import { Stars } from './price';

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div
      role="radiogroup"
      aria-label="Rating"
      className="flex gap-1"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              'size-8 transition-colors',
              (hover || value) >= n ? 'text-accent' : 'text-border',
            )}
            fill="currentColor"
            strokeWidth={0}
          />
        </button>
      ))}
    </div>
  );
}

export function WriteReview({
  productId,
  orderItemId,
  open,
  onOpenChange,
}: {
  productId: string;
  orderItemId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = hooks.useCreateReview();
  const form = useZodForm(reviewInputSchema, {
    defaultValues: {
      productId,
      orderItemId: orderItemId ?? undefined,
      rating: 0,
      title: '',
      body: '',
      images: [],
    },
  });
  const rating = form.watch('rating');
  const images = form.watch('images') ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write a review</DialogTitle>
          <DialogDescription>Share your experience to help other shoppers.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((v) =>
            create.mutate(v, {
              onSuccess: () => {
                toast.success('Thanks for your review!');
                onOpenChange(false);
              },
              onError: (e) => toast.error(errMsg(e, 'Could not post your review')),
            }),
          )}
        >
          <Field label="Your rating" error={form.formState.errors.rating?.message} required>
            <StarInput
              value={rating}
              onChange={(n) => form.setValue('rating', n, { shouldValidate: true })}
            />
          </Field>
          <Field label="Headline" htmlFor="r-title">
            <Input
              id="r-title"
              maxLength={100}
              placeholder="What’s most important to know?"
              {...form.register('title')}
            />
          </Field>
          <Field label="Review" htmlFor="r-body" error={form.formState.errors.body?.message}>
            <Textarea
              id="r-body"
              maxLength={2000}
              placeholder="What did you like or dislike? How is the quality?"
              {...form.register('body')}
            />
          </Field>
          <Field label="Add photos (optional)" hint="Up to 3 images, 5 MB each">
            <ImageUploader
              folder="reviews"
              max={3}
              value={images}
              onChange={(urls) => form.setValue('images', urls)}
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={create.isPending}>
            Submit review
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewItem({ review }: { review: ReviewDto }) {
  const status = useAuth((s) => s.status);
  const qc = useQueryClient();
  const [helpful, setHelpful] = useState(review.helpfulCount);
  const [voted, setVoted] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  return (
    <li className="space-y-3 border-b py-5 last:border-0">
      <div className="flex items-start gap-3">
        <Avatar name={review.user.name} src={review.user.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold">{review.user.name}</span>
            {review.isVerifiedPurchase && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                <BadgeCheck className="size-3.5" /> Verified purchase
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Stars value={review.rating} size={13} />
            <span>{formatDate(review.createdAt)}</span>
          </div>
        </div>
      </div>
      {review.title && <h4 className="font-sans text-[15px] font-bold">{review.title}</h4>}
      {review.body && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
          {review.body}
        </p>
      )}
      {review.images.length > 0 && (
        <ul className="flex gap-2">
          {review.images.map((src) => (
            <li key={src}>
              <button
                type="button"
                onClick={() => setZoom(src)}
                className="relative block size-16 overflow-hidden rounded-lg border"
                aria-label="View review photo"
              >
                <Img src={src} alt="Customer photo" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {review.sellerReply && (
        <div className="rounded-xl bg-secondary/60 p-3 text-sm">
          <p className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-primary">
            <MessageSquareText className="size-3.5" /> Seller response
          </p>
          <p className="text-foreground/85">{review.sellerReply}</p>
        </div>
      )}
      <button
        type="button"
        disabled={voted || status !== 'authed'}
        title={status === 'authed' ? undefined : 'Sign in to vote'}
        onClick={() =>
          api.reviews
            .helpful(review.id)
            .then((r) => {
              setHelpful(r.helpfulCount);
              setVoted(true);
              void qc.invalidateQueries({ queryKey: ['reviews'] });
            })
            .catch((e) => toast.error(errMsg(e)))
        }
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60',
          voted && 'border-primary text-primary',
        )}
      >
        <ThumbsUp className="size-3.5" /> Helpful ({helpful})
      </button>
      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent size="lg" className="p-2">
          <DialogTitle className="sr-only">Review photo</DialogTitle>
          <div className="relative aspect-square max-h-[80dvh] w-full">
            {zoom && (
              <Img
                src={zoom}
                alt="Customer photo"
                fill
                sizes="80vw"
                className="rounded-lg object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function ReviewsSection({ product }: { product: ProductDetail }) {
  const status = useAuth((s) => s.status);
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState<number | undefined>();
  const [sort, setSort] = useState('recent');
  const [withImages, setWithImages] = useState(false);
  const [writing, setWriting] = useState(false);
  const { data, isLoading, isFetching } = hooks.useReviews(product.id, {
    page,
    limit: 6,
    rating,
    sort,
    withImages: withImages || undefined,
  });
  const { data: elig } = hooks.useReviewEligibility(product.id, { enabled: status === 'authed' });
  const breakdown = data?.meta.breakdown ?? product.ratingBreakdown;
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return (
    <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-32">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 id="reviews-h" className="section-title">
          Ratings & reviews
        </h2>
        {status === 'authed' ? (
          elig?.canReview ? (
            <Button onClick={() => setWriting(true)}>Write a review</Button>
          ) : elig?.hasReviewed ? (
            <span className="text-sm text-muted-foreground">You reviewed this product</span>
          ) : null
        ) : (
          <Button asChild variant="outline">
            <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in to review</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-end gap-3">
            <span className="font-display text-5xl font-extrabold leading-none">
              {product.ratingAvg ? product.ratingAvg.toFixed(1) : '–'}
            </span>
            <div className="pb-1">
              <Stars value={product.ratingAvg} size={16} />
              <p className="mt-0.5 text-xs text-muted-foreground">
                {total.toLocaleString('en-IN')} {total === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>
          <ul className="space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => {
                    setRating(rating === n ? undefined : n);
                    setPage(1);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-xs hover:bg-muted',
                    rating === n && 'bg-primary/10 font-bold',
                  )}
                  aria-pressed={rating === n}
                >
                  <span className="w-3 text-right font-semibold">{n}</span>
                  <Star className="size-3 text-accent" fill="currentColor" strokeWidth={0} />
                  <Progress
                    value={total ? (breakdown[n] / total) * 100 : 0}
                    className="h-2 flex-1"
                    indicatorClassName="bg-accent"
                  />
                  <span className="w-6 text-right text-muted-foreground">{breakdown[n]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <CheckRow
              id="with-photos"
              checked={withImages}
              onCheckedChange={(v) => {
                setWithImages(v);
                setPage(1);
              }}
            >
              With photos only
            </CheckRow>
            <Select
              aria-label="Sort reviews"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              wrapperClassName="w-44"
              className="h-9 rounded-full text-[13px]"
            >
              <option value="recent">Most recent</option>
              <option value="helpful">Most helpful</option>
              <option value="high">Highest rated</option>
              <option value="low">Lowest rated</option>
            </Select>
          </div>
          {isLoading ? (
            <div className="space-y-4 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <ul className={cn('transition-opacity', isFetching && 'opacity-60')}>
                {data.items.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
              </ul>
              {data.meta.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-muted-foreground">
                    Page {data.meta.page} of {data.meta.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!data.meta.hasNext}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              className="mt-3"
              icon={<MessageSquareText />}
              title="No reviews yet"
              description={
                rating || withImages
                  ? 'No reviews match these filters.'
                  : 'Be the first to share what you think about this product.'
              }
            />
          )}
        </div>
      </div>
      {writing && (
        <WriteReview
          productId={product.id}
          orderItemId={elig?.orderItemId ?? null}
          open={writing}
          onOpenChange={setWriting}
        />
      )}
    </section>
  );
}
