import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { AdminDashboard, OrderStatus, SellerAnalytics, SubOrderStatus } from '@gk/types';
import { daysIn, resolveRange, type DateRange } from '../../common/utils/date-range';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';

const VALID_ORDER = Prisma.sql`o.status NOT IN ('PENDING_PAYMENT', 'PAYMENT_FAILED')`;
const IST = Prisma.sql`'Asia/Kolkata'`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ───────────── seller ─────────────

  async seller(sellerId: string, fromQ?: Date, toQ?: Date): Promise<SellerAnalytics> {
    const range = resolveRange(fromQ, toQ);
    const inRange = Prisma.sql`o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to}`;

    const [series, totals, top, statuses, returns, views] = await Promise.all([
      this.prisma.$queryRaw<Array<{ date: string; revenue: number; orders: number }>>`
        SELECT to_char(o."createdAt" AT TIME ZONE ${IST}, 'YYYY-MM-DD') AS date,
               COALESCE(SUM(so.total), 0)::float8 AS revenue, COUNT(*)::int AS orders
        FROM "SubOrder" so JOIN "Order" o ON o.id = so."orderId"
        WHERE so."sellerId" = ${sellerId} AND so.status <> 'CANCELLED' AND ${VALID_ORDER} AND ${inRange}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ units: number }>>`
        SELECT COALESCE(SUM(oi.quantity), 0)::int AS units
        FROM "OrderItem" oi JOIN "SubOrder" so ON so.id = oi."subOrderId" JOIN "Order" o ON o.id = so."orderId"
        WHERE so."sellerId" = ${sellerId} AND so.status <> 'CANCELLED' AND ${VALID_ORDER} AND ${inRange}`,
      this.prisma.$queryRaw<
        Array<{
          productId: string;
          name: string;
          image: string | null;
          units: number;
          revenue: number;
        }>
      >`
        SELECT p.id AS "productId", p.name,
               (SELECT url FROM "ProductImage" i WHERE i."productId" = p.id AND i."variantId" IS NULL ORDER BY i.position LIMIT 1) AS image,
               SUM(oi.quantity)::int AS units, SUM(oi."lineTotal" - oi.discount)::float8 AS revenue
        FROM "OrderItem" oi JOIN "SubOrder" so ON so.id = oi."subOrderId" JOIN "Order" o ON o.id = so."orderId" JOIN "Product" p ON p.id = oi."productId"
        WHERE so."sellerId" = ${sellerId} AND so.status <> 'CANCELLED' AND ${VALID_ORDER} AND ${inRange}
        GROUP BY p.id ORDER BY revenue DESC LIMIT 5`,
      this.prisma.$queryRaw<Array<{ status: SubOrderStatus; count: number }>>`
        SELECT so.status, COUNT(*)::int AS count
        FROM "SubOrder" so JOIN "Order" o ON o.id = so."orderId"
        WHERE so."sellerId" = ${sellerId} AND ${VALID_ORDER} AND ${inRange}
        GROUP BY so.status ORDER BY count DESC`,
      this.prisma.returnRequest.count({
        where: { subOrder: { sellerId }, createdAt: { gte: range.from, lt: range.to } },
      }),
      this.sellerViews(sellerId, range),
    ]);

    const byDate = new Map(series.map((s) => [s.date, s]));
    const filled = daysIn(range).map((date) => ({
      date,
      revenue: round2(byDate.get(date)?.revenue ?? 0),
      orders: byDate.get(date)?.orders ?? 0,
    }));
    const revenue = round2(filled.reduce((n, p) => n + p.revenue, 0));
    const orders = filled.reduce((n, p) => n + p.orders, 0);
    return {
      range: { from: range.from.toISOString(), to: new Date(range.to.getTime() - 1).toISOString() },
      totals: {
        revenue,
        orders,
        unitsSold: totals[0]?.units ?? 0,
        averageOrderValue: orders ? round2(revenue / orders) : 0,
        views,
        conversionRate: views > 0 ? round2(Math.min((orders / views) * 100, 100)) : 0,
        returns,
      },
      series: filled,
      topProducts: top.map((t) => ({ ...t, revenue: round2(t.revenue) })),
      statusBreakdown: statuses,
    };
  }

  private async sellerViews(sellerId: string, range: DateRange): Promise<number> {
    const keys = daysIn(range).map((d) => `gk:views:${sellerId}:${d}`);
    if (keys.length === 0) return 0;
    try {
      const vals = await this.redis.client.mget(keys);
      return vals.reduce((n, v) => n + (v ? Number(v) : 0), 0);
    } catch {
      return 0;
    }
  }

  // ───────────── admin ─────────────

  async admin(fromQ?: Date, toQ?: Date): Promise<AdminDashboard> {
    const range = resolveRange(fromQ, toQ);
    const inRange = Prisma.sql`o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to}`;
    const sold = Prisma.sql`o.status NOT IN ('PENDING_PAYMENT', 'PAYMENT_FAILED', 'CANCELLED')`;

    const [
      orderSeries,
      userSeries,
      kpiRow,
      categories,
      sellers,
      statuses,
      users,
      activeSellers,
      pendingSellers,
      pendingProducts,
      openReturns,
      commission,
    ] = await Promise.all([
      this.prisma.$queryRaw<Array<{ date: string; gmv: number; orders: number }>>`
        SELECT to_char(o."createdAt" AT TIME ZONE ${IST}, 'YYYY-MM-DD') AS date, COALESCE(SUM(o.total), 0)::float8 AS gmv, COUNT(*)::int AS orders
        FROM "Order" o WHERE ${sold} AND ${inRange} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ date: string; users: number }>>`
        SELECT to_char(u."createdAt" AT TIME ZONE ${IST}, 'YYYY-MM-DD') AS date, COUNT(*)::int AS users
        FROM "User" u WHERE u.role = 'CUSTOMER' AND u."createdAt" >= ${range.from} AND u."createdAt" < ${range.to} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ gmv: number; orders: number }>>`
        SELECT COALESCE(SUM(o.total), 0)::float8 AS gmv, COUNT(*)::int AS orders FROM "Order" o WHERE ${sold} AND ${inRange}`,
      this.prisma.$queryRaw<Array<{ name: string; revenue: number }>>`
        SELECT c.name, SUM(oi."lineTotal" - oi.discount)::float8 AS revenue
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        JOIN "Product" p ON p.id = oi."productId"
        JOIN "Category" c ON c.slug = split_part((SELECT path FROM "Category" WHERE id = p."categoryId"), '/', 1)
        WHERE ${sold} AND ${inRange}
        GROUP BY c.name ORDER BY revenue DESC LIMIT 6`,
      this.prisma.$queryRaw<
        Array<{ sellerId: string; storeName: string; revenue: number; orders: number }>
      >`
        SELECT s.id AS "sellerId", s."storeName", SUM(so.total)::float8 AS revenue, COUNT(*)::int AS orders
        FROM "SubOrder" so JOIN "Order" o ON o.id = so."orderId" JOIN "SellerProfile" s ON s.id = so."sellerId"
        WHERE so.status <> 'CANCELLED' AND ${VALID_ORDER} AND ${inRange}
        GROUP BY s.id ORDER BY revenue DESC LIMIT 5`,
      this.prisma.$queryRaw<Array<{ status: OrderStatus; count: number }>>`
        SELECT o.status, COUNT(*)::int AS count FROM "Order" o WHERE ${inRange} GROUP BY o.status ORDER BY count DESC`,
      this.prisma.user.count({
        where: { role: 'CUSTOMER', createdAt: { gte: range.from, lt: range.to } },
      }),
      this.prisma.sellerProfile.count({ where: { status: 'APPROVED', deletedAt: null } }),
      this.prisma.sellerProfile.count({ where: { status: 'PENDING', deletedAt: null } }),
      this.prisma.product.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
      this.prisma.returnRequest.count({
        where: { status: { in: ['REQUESTED', 'ESCALATED', 'APPROVED', 'RECEIVED'] } },
      }),
      this.prisma.$queryRaw<Array<{ commission: number }>>`
        SELECT COALESCE(SUM(so."commissionAmount"), 0)::float8 AS commission
        FROM "SubOrder" so JOIN "Order" o ON o.id = so."orderId"
        WHERE so.status <> 'CANCELLED' AND ${VALID_ORDER} AND ${inRange}`,
    ]);

    const gmvByDate = new Map(orderSeries.map((s) => [s.date, s]));
    const usersByDate = new Map(userSeries.map((s) => [s.date, s.users]));
    const gmv = round2(kpiRow[0]?.gmv ?? 0);
    const orders = kpiRow[0]?.orders ?? 0;
    return {
      range: { from: range.from.toISOString(), to: new Date(range.to.getTime() - 1).toISOString() },
      kpis: {
        gmv,
        orders,
        averageOrderValue: orders ? round2(gmv / orders) : 0,
        newUsers: users,
        activeSellers,
        pendingSellers,
        pendingProducts,
        openReturns,
        commissionEarned: round2(commission[0]?.commission ?? 0),
      },
      series: daysIn(range).map((date) => ({
        date,
        gmv: round2(gmvByDate.get(date)?.gmv ?? 0),
        orders: gmvByDate.get(date)?.orders ?? 0,
        users: usersByDate.get(date) ?? 0,
      })),
      topCategories: categories.map((c) => ({ name: c.name, revenue: round2(c.revenue) })),
      topSellers: sellers.map((s) => ({ ...s, revenue: round2(s.revenue) })),
      orderStatus: statuses,
    };
  }
}
