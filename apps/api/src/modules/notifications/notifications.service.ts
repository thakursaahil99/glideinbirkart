import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { NotificationDto, NotificationType } from '@gk/types';
import { PrismaService } from '../../infra/prisma.service';
import { QueueNames, QueueService, type NotificationJob } from '../../infra/queue.service';
import { notFound } from '../../common/errors';
import { pageArgs, paged } from '../../common/types';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const toDto = (n: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  data: (n.data as Record<string, unknown> | null) ?? null,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  /** Persist an in-app notification and fan out a mobile push (best effort). */
  async notify(userId: string, input: NotifyInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      await this.queue.add(QueueNames.notifications, {
        userId,
        title: input.title,
        body: input.body,
        data: input.data,
      });
    } catch (err) {
      this.log.error(`notify(${userId}) failed: ${(err as Error).message}`);
    }
  }

  async notifyAdmins(input: NotifyInput): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    await Promise.all(admins.map((a) => this.notify(a.id, input)));
  }

  private audienceWhere(audience: 'CUSTOMERS' | 'ALL'): Prisma.UserWhereInput {
    return {
      status: 'ACTIVE',
      deletedAt: null,
      ...(audience === 'CUSTOMERS' ? { role: 'CUSTOMER' } : {}),
    };
  }

  async audienceSize() {
    const [customers, allUsers, pushDevices] = await Promise.all([
      this.prisma.user.count({ where: this.audienceWhere('CUSTOMERS') }),
      this.prisma.user.count({ where: this.audienceWhere('ALL') }),
      this.prisma.pushToken.groupBy({ by: ['userId'] }).then((g) => g.length),
    ]);
    return { customers, allUsers, pushDevices };
  }

  /**
   * Admin announcement: one in-app notification per user (bulk insert in chunks), plus a push job for
   * the users who have a registered device. Delivery happens in the notifications queue worker.
   */
  async broadcast(input: {
    title: string;
    body: string;
    audience: 'CUSTOMERS' | 'ALL';
    data?: Record<string, unknown>;
  }): Promise<{ recipients: number; pushUsers: number }> {
    const users = await this.prisma.user.findMany({
      where: this.audienceWhere(input.audience),
      select: { id: true },
    });
    const withPush = new Set(
      (
        await this.prisma.pushToken.findMany({
          where: { userId: { in: users.map((u) => u.id) } },
          select: { userId: true },
          distinct: ['userId'],
        })
      ).map((t) => t.userId),
    );
    const CHUNK = 500;
    for (let i = 0; i < users.length; i += CHUNK) {
      await this.prisma.notification.createMany({
        data: users.slice(i, i + CHUNK).map((u) => ({
          userId: u.id,
          type: 'PROMO' as const,
          title: input.title,
          body: input.body,
          data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      });
    }
    for (const userId of withPush) {
      await this.queue.add(QueueNames.notifications, {
        userId,
        title: input.title,
        body: input.body,
        data: input.data,
      });
    }
    return { recipients: users.length, pushUsers: withPush.size };
  }

  async list(userId: string, page: number, limit: number, unreadOnly?: boolean) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const [rows, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return paged(rows.map(toDto), page, limit, total, { unread });
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) throw notFound('Notification');
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  async registerPushToken(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
  }

  async removePushToken(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
  }

  /** Worker entrypoint — delivers through Expo's push service. */
  async deliverPush(job: NotificationJob): Promise<void> {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId: job.userId } });
    if (tokens.length === 0) return;
    const messages = tokens.map((t) => ({
      to: t.token,
      title: job.title,
      body: job.body,
      data: job.data ?? {},
      sound: 'default',
      channelId: 'default',
    }));
    // typed by hand: Vercel's separate TypeScript pass resolves the global fetch Response without its members
    const res = (await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    })) as unknown as { ok: boolean; status: number; json(): Promise<unknown> };
    if (!res.ok) throw new Error(`Expo push failed with HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{ status: string; details?: { error?: string } }>;
    };
    const stale: string[] = [];
    json.data?.forEach((ticket, i) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        const t = tokens[i];
        if (t) stale.push(t.token);
      }
    });
    if (stale.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: stale } } });
  }
}
