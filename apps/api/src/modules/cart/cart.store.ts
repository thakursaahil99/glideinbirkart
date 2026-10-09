import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';

export interface CartLine {
  variantId: string;
  quantity: number;
  savedForLater: boolean;
}

/** Persistence abstraction so the cart logic is identical for guests (Redis) and users (PostgreSQL). */
export interface CartStore {
  lines(): Promise<CartLine[]>;
  upsert(line: CartLine): Promise<void>;
  remove(variantId: string): Promise<void>;
  clear(): Promise<void>;
  couponCode(): Promise<string | null>;
  setCoupon(code: string | null): Promise<void>;
}

const GUEST_TTL_SECONDS = 30 * 24 * 3600;
const COUPON_FIELD = '__coupon';
export const MAX_GUEST_LINES = 50;

export class GuestCartStore implements CartStore {
  private readonly key: string;

  constructor(
    private readonly redis: RedisService,
    guestId: string,
  ) {
    this.key = `gk:cart:guest:${guestId}`;
  }

  async lines(): Promise<CartLine[]> {
    const all = await this.redis.client.hgetall(this.key);
    return Object.entries(all)
      .filter(([k]) => k !== COUPON_FIELD)
      .map(([variantId, raw]) => {
        const v = JSON.parse(raw) as { q: number; s: boolean };
        return { variantId, quantity: v.q, savedForLater: v.s };
      });
  }

  async upsert(line: CartLine): Promise<void> {
    await this.redis.client
      .multi()
      .hset(this.key, line.variantId, JSON.stringify({ q: line.quantity, s: line.savedForLater }))
      .expire(this.key, GUEST_TTL_SECONDS)
      .exec();
  }

  async remove(variantId: string): Promise<void> {
    await this.redis.client.hdel(this.key, variantId);
  }

  async clear(): Promise<void> {
    await this.redis.client.del(this.key);
  }

  async couponCode(): Promise<string | null> {
    return this.redis.client.hget(this.key, COUPON_FIELD);
  }

  async setCoupon(code: string | null): Promise<void> {
    if (code)
      await this.redis.client
        .multi()
        .hset(this.key, COUPON_FIELD, code)
        .expire(this.key, GUEST_TTL_SECONDS)
        .exec();
    else await this.redis.client.hdel(this.key, COUPON_FIELD);
  }
}

export class UserCartStore implements CartStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userId: string,
  ) {}

  private async cartId(): Promise<string> {
    const cart = await this.prisma.cart.upsert({
      where: { userId: this.userId },
      create: { userId: this.userId },
      update: {},
      select: { id: true },
    });
    return cart.id;
  }

  async lines(): Promise<CartLine[]> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId: this.userId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    return (cart?.items ?? []).map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      savedForLater: i.savedForLater,
    }));
  }

  async upsert(line: CartLine): Promise<void> {
    const cartId = await this.cartId();
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId: line.variantId } },
      create: {
        cartId,
        variantId: line.variantId,
        quantity: line.quantity,
        savedForLater: line.savedForLater,
      },
      update: { quantity: line.quantity, savedForLater: line.savedForLater },
    });
    await this.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }

  async remove(variantId: string): Promise<void> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId: this.userId },
      select: { id: true },
    });
    if (cart) await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
  }

  async clear(): Promise<void> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId: this.userId },
      select: { id: true },
    });
    if (cart)
      await this.prisma.$transaction([
        this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
        this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } }),
      ]);
  }

  async couponCode(): Promise<string | null> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId: this.userId },
      select: { couponCode: true },
    });
    return cart?.couponCode ?? null;
  }

  async setCoupon(code: string | null): Promise<void> {
    const cartId = await this.cartId();
    await this.prisma.cart.update({ where: { id: cartId }, data: { couponCode: code } });
  }
}
