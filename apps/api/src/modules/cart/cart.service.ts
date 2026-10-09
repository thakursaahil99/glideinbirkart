import { Injectable } from '@nestjs/common';
import type { CartDto, CartItemDto, PricingBreakdown } from '@gk/types';
import { computePricing, discountPercent, type PricingLine } from '@gk/utils';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { CouponsService } from '../coupons/coupons.service';
import { available, num } from '../products/products.mapper';
import { SettingsService } from '../settings/settings.service';
import {
  GuestCartStore,
  MAX_GUEST_LINES,
  UserCartStore,
  type CartLine,
  type CartStore,
} from './cart.store';

export const MAX_LINE_QUANTITY = 10;

export type CartPrincipal = { userId: string } | { guestId: string };

const variantInclude = {
  inventory: true,
  product: {
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      deletedAt: true,
      gstRate: true,
      seller: { select: { id: true, storeName: true, status: true } },
      category: { select: { isActive: true } },
      images: { orderBy: { position: 'asc' as const }, select: { url: true, variantId: true } },
    },
  },
  images: { orderBy: { position: 'asc' as const }, take: 1, select: { url: true } },
} as const;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly coupons: CouponsService,
    private readonly settings: SettingsService,
  ) {}

  store(principal: CartPrincipal): CartStore {
    return 'userId' in principal
      ? new UserCartStore(this.prisma, principal.userId)
      : new GuestCartStore(this.redis, principal.guestId);
  }

  private async purchasable(variantId: string) {
    const v = await this.prisma.productVariant.findFirst({
      where: { id: variantId, isActive: true, deletedAt: null },
      include: variantInclude,
    });
    if (
      !v ||
      v.product.deletedAt ||
      v.product.status !== 'ACTIVE' ||
      v.product.seller.status !== 'APPROVED' ||
      !v.product.category.isActive
    ) {
      throw notFound('Product');
    }
    return v;
  }

  // ───────────── mutations ─────────────

  async add(principal: CartPrincipal, variantId: string, quantity: number): Promise<CartDto> {
    const store = this.store(principal);
    const variant = await this.purchasable(variantId);
    const stock = available(variant.inventory);
    if (stock <= 0) throw conflict('OUT_OF_STOCK', 'This item is currently out of stock');

    const lines = await store.lines();
    if (
      'guestId' in principal &&
      lines.length >= MAX_GUEST_LINES &&
      !lines.some((l) => l.variantId === variantId)
    ) {
      throw badRequest('CART_FULL', 'Your cart is full. Sign in to add more items.');
    }
    const existing = lines.find((l) => l.variantId === variantId);
    const wanted = (existing && !existing.savedForLater ? existing.quantity : 0) + quantity;
    if (wanted > MAX_LINE_QUANTITY)
      throw conflict('MAX_QUANTITY', `You can buy at most ${MAX_LINE_QUANTITY} units of an item`);
    if (wanted > stock)
      throw conflict('INSUFFICIENT_STOCK', `Only ${stock} unit${stock === 1 ? '' : 's'} available`);

    await store.upsert({ variantId, quantity: wanted, savedForLater: false });
    return this.view(principal);
  }

  async setQuantity(
    principal: CartPrincipal,
    variantId: string,
    quantity: number,
  ): Promise<CartDto> {
    const store = this.store(principal);
    const line = (await store.lines()).find((l) => l.variantId === variantId);
    if (!line) throw notFound('Cart item');
    const variant = await this.purchasable(variantId);
    const stock = available(variant.inventory);
    if (quantity > stock)
      throw conflict(
        'INSUFFICIENT_STOCK',
        stock === 0
          ? 'This item is out of stock'
          : `Only ${stock} unit${stock === 1 ? '' : 's'} available`,
      );
    await store.upsert({ ...line, quantity });
    return this.view(principal);
  }

  async remove(principal: CartPrincipal, variantId: string): Promise<CartDto> {
    await this.store(principal).remove(variantId);
    return this.view(principal);
  }

  async saveForLater(principal: CartPrincipal, variantId: string): Promise<CartDto> {
    const store = this.store(principal);
    const line = (await store.lines()).find((l) => l.variantId === variantId);
    if (!line) throw notFound('Cart item');
    await store.upsert({ ...line, savedForLater: true });
    return this.view(principal);
  }

  async moveToCart(principal: CartPrincipal, variantId: string): Promise<CartDto> {
    const store = this.store(principal);
    const line = (await store.lines()).find((l) => l.variantId === variantId);
    if (!line) throw notFound('Cart item');
    const variant = await this.purchasable(variantId);
    const stock = available(variant.inventory);
    if (stock <= 0) throw conflict('OUT_OF_STOCK', 'This item is currently out of stock');
    await store.upsert({
      variantId,
      quantity: Math.min(line.quantity, stock, MAX_LINE_QUANTITY),
      savedForLater: false,
    });
    return this.view(principal);
  }

  async clear(principal: CartPrincipal): Promise<CartDto> {
    await this.store(principal).clear();
    return this.view(principal);
  }

  async applyCoupon(principal: CartPrincipal, code: string): Promise<CartDto> {
    if (!('userId' in principal)) throw badRequest('LOGIN_REQUIRED', 'Sign in to apply a coupon');
    const view = await this.view(principal, { skipCoupon: true });
    if (view.items.length === 0) throw badRequest('EMPTY_CART', 'Add items to your cart first');
    await this.coupons.validate(code, principal.userId, view.pricing.subtotal); // throws a precise reason
    await this.store(principal).setCoupon(code.toUpperCase());
    return this.view(principal);
  }

  async removeCoupon(principal: CartPrincipal): Promise<CartDto> {
    await this.store(principal).setCoupon(null);
    return this.view(principal);
  }

  /** On login: fold the guest cart (Redis) into the user's cart, respecting stock and per-line limits. */
  async mergeGuest(userId: string, guestId: string): Promise<CartDto> {
    const guest = new GuestCartStore(this.redis, guestId);
    const guestLines = await guest.lines();
    if (guestLines.length > 0) {
      const mine = this.store({ userId });
      const current = await mine.lines();
      for (const g of guestLines) {
        const variant = await this.prisma.productVariant
          .findFirst({
            where: { id: g.variantId, isActive: true, deletedAt: null },
            include: { inventory: true, product: { select: { status: true, deletedAt: true } } },
          })
          .catch(() => null);
        if (!variant || variant.product.status !== 'ACTIVE' || variant.product.deletedAt) continue;
        const stock = available(variant.inventory);
        const existing = current.find((c) => c.variantId === g.variantId);
        const quantity = Math.min(
          (existing?.quantity ?? 0) + g.quantity,
          MAX_LINE_QUANTITY,
          Math.max(stock, 1),
        );
        await mine.upsert({
          variantId: g.variantId,
          quantity,
          savedForLater: existing ? existing.savedForLater && g.savedForLater : g.savedForLater,
        });
      }
      const guestCoupon = await guest.couponCode();
      if (guestCoupon && !(await mine.couponCode())) await mine.setCoupon(guestCoupon);
      await guest.clear();
    }
    return this.view({ userId });
  }

  // ───────────── read model ─────────────

  private toItem(
    line: CartLine,
    v: NonNullable<Awaited<ReturnType<CartService['loadVariants']>>[number]>,
  ): CartItemDto {
    const stock = available(v.inventory);
    const p = v.product;
    const variantImage =
      v.images[0]?.url ??
      p.images.find((i) => i.variantId === v.id)?.url ??
      p.images.find((i) => !i.variantId)?.url ??
      p.images[0]?.url ??
      null;
    let issue: string | null = null;
    if (
      p.status !== 'ACTIVE' ||
      p.deletedAt ||
      p.seller.status !== 'APPROVED' ||
      !p.category.isActive ||
      !v.isActive
    )
      issue = 'No longer available';
    else if (stock === 0) issue = 'Out of stock';
    else if (line.quantity > stock) issue = `Only ${stock} left — reduce quantity`;
    return {
      id: v.id,
      variantId: v.id,
      productId: p.id,
      slug: p.slug,
      name: p.name,
      variantName: v.name,
      image: variantImage,
      quantity: line.quantity,
      mrp: num(v.mrp),
      price: num(v.price),
      discountPercent: discountPercent(num(v.mrp), num(v.price)),
      gstRate: num(p.gstRate),
      stock,
      maxQuantity: Math.max(Math.min(stock, MAX_LINE_QUANTITY), 0),
      seller: { id: p.seller.id, storeName: p.seller.storeName },
      savedForLater: line.savedForLater,
      issue,
    };
  }

  private loadVariants(ids: string[]) {
    return this.prisma.productVariant.findMany({
      where: { id: { in: ids } },
      include: variantInclude,
    });
  }

  /** Cart lines enriched with live price/stock + the full price breakdown (GST, delivery, coupon). */
  async view(principal: CartPrincipal, opts: { skipCoupon?: boolean } = {}): Promise<CartDto> {
    const store = this.store(principal);
    const lines = await store.lines();
    const variants = await this.loadVariants(lines.map((l) => l.variantId));
    const byId = new Map(variants.map((v) => [v.id, v]));

    const items: CartItemDto[] = [];
    const saved: CartItemDto[] = [];
    for (const line of lines) {
      const v = byId.get(line.variantId);
      if (!v) {
        await store.remove(line.variantId); // variant was hard-deleted
        continue;
      }
      (line.savedForLater ? saved : items).push(this.toItem(line, v));
    }

    const buyable = items.filter((i) => !i.issue);
    const settings = await this.settings.get();
    const pricingLines: PricingLine[] = buyable.map((i) => ({
      id: i.variantId,
      sellerId: i.seller.id,
      mrp: i.mrp,
      price: i.price,
      quantity: i.quantity,
      gstRate: i.gstRate,
    }));
    const delivery = {
      flatFee: settings.deliveryFee,
      freeThreshold: settings.freeDeliveryThreshold,
    };

    let coupon: CartDto['coupon'] = null;
    let couponMessage: string | null = null;
    let couponDiscount = 0;
    const code = opts.skipCoupon ? null : await store.couponCode();
    if (code && 'userId' in principal) {
      const subtotal = computePricing(pricingLines, { delivery }).subtotal;
      try {
        const res = await this.coupons.validate(code, principal.userId, subtotal);
        couponDiscount = res.discount;
        coupon = {
          code: res.coupon.code,
          discount: res.discount,
          description: res.coupon.description,
        };
      } catch (err) {
        couponMessage = (err as Error).message;
        await store.setCoupon(null);
      }
    }

    const priced = computePricing(pricingLines, { couponDiscount, delivery });
    const pricing: PricingBreakdown = {
      mrpTotal: priced.mrpTotal,
      productDiscount: priced.productDiscount,
      subtotal: priced.subtotal,
      couponDiscount: priced.couponDiscount,
      deliveryFee: priced.deliveryFee,
      gstTotal: priced.gstTotal,
      total: priced.total,
      savings: priced.savings,
      freeDeliveryThreshold: priced.freeDeliveryThreshold,
      amountForFreeDelivery: priced.amountForFreeDelivery,
    };
    return {
      items,
      saved,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      coupon,
      couponMessage,
      pricing,
    };
  }
}
