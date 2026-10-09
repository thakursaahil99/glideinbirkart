'use client';

import { Heart } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export function WishlistButton({
  productId,
  className,
  label = false,
}: {
  productId: string;
  className?: string;
  label?: boolean;
}) {
  const status = useAuth((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();
  const { data: ids } = hooks.useWishlistIds({ enabled: status === 'authed' });
  const toggle = hooks.useToggleWishlist();
  const active = Boolean(ids?.includes(productId));

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? 'Remove from wishlist' : 'Add to wishlist'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (status !== 'authed') {
          toast.info('Sign in to save items to your wishlist');
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        toggle.mutate(
          { productId, active },
          {
            onSuccess: () => toast.success(active ? 'Removed from wishlist' : 'Saved to wishlist'),
            onError: () => toast.error('Could not update wishlist'),
          },
        );
      }}
      className={cn(
        'grid place-content-center rounded-full bg-card/90 text-foreground/70 shadow-soft backdrop-blur transition-all hover:scale-110 hover:text-deal',
        label ? 'h-11 gap-2 px-5 text-sm font-semibold' : 'size-9',
        active && 'text-deal',
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <Heart
          className={cn('size-[18px] transition-transform', active && 'scale-110')}
          fill={active ? 'currentColor' : 'none'}
        />
        {label && (active ? 'Wishlisted' : 'Add to wishlist')}
      </span>
    </button>
  );
}
