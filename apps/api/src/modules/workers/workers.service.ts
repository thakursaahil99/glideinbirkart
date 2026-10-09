import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import type { AppConfig } from '../../config/config.types';
import { PrismaService } from '../../infra/prisma.service';
import {
  QueueNames,
  QueueService,
  type EmailJob,
  type InvoiceJob,
  type NotificationJob,
  type SearchIndexJob,
  type StockExpiryJob,
} from '../../infra/queue.service';
import { RedisService } from '../../infra/redis.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InvoiceService } from '../orders/invoice.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { SearchService } from '../search/search.service';

/**
 * BullMQ consumers. They run inside the API process by default (free-tier friendly);
 * set WORKERS_ENABLED=false on web-facing replicas and run a second instance with true to split them.
 */
@Injectable()
export class WorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(WorkersService.name);
  private readonly workers: Worker[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly queues: QueueService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly invoices: InvoiceService,
    private readonly notifications: NotificationsService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly search: SearchService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  private register<T>(
    name: string,
    processor: (data: T, job: Job<T>) => Promise<unknown>,
    concurrency = 5,
  ) {
    const worker = new Worker(name, async (job: Job<T>) => processor(job.data, job), {
      connection: this.redis.createBullConnection(),
      concurrency,
    });
    worker.on('failed', (job, err) =>
      this.log.warn(`${name} job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`),
    );
    worker.on('error', (err) => this.log.warn(`${name} worker error: ${err.message}`));
    this.workers.push(worker);
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.get('WORKERS_ENABLED', { infer: true })) {
      this.log.log('Workers disabled (WORKERS_ENABLED=false)');
      return;
    }

    this.register<EmailJob>(QueueNames.emails, (data) => this.mail.deliver(data), 5);
    this.register<InvoiceJob>(QueueNames.invoices, async (data) => {
      await this.invoices.ensureInvoice(data.orderId);
    });
    this.register<NotificationJob>(
      QueueNames.notifications,
      (data) => this.notifications.deliverPush(data),
      10,
    );
    this.register<SearchIndexJob>(
      QueueNames.searchIndex,
      async (data) => {
        const n = await this.search.refreshIndex(
          data.scope === 'all' ? { scope: 'all' } : { scope: data.scope, id: data.id },
        );
        this.log.log(
          `search index refreshed for ${data.scope}${'id' in data ? ` ${data.id}` : ''} (${n} products)`,
        );
      },
      2,
    );
    this.register<StockExpiryJob>(
      QueueNames.stockExpiry,
      async (data) => {
        if ('sweep' in data) return this.sweepExpired();
        const expired = await this.lifecycle.expireIfUnpaid(data.orderId);
        if (expired) this.log.log(`released reserved stock for unpaid order ${data.orderId}`);
        return expired;
      },
      5,
    );

    // Safety net: if a delayed job was lost (Redis flushed / restarted), a recurring sweep still releases stock.
    await this.queues.queue(QueueNames.stockExpiry).add(
      'sweep',
      { sweep: true },
      {
        repeat: { every: 60_000 },
        jobId: 'expiry-sweep',
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    this.log.log(`BullMQ workers started: ${this.workers.map((w) => w.name).join(', ')}`);
  }

  private async sweepExpired(): Promise<number> {
    const stale = await this.prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lte: new Date() } },
      select: { id: true },
      take: 100,
    });
    let n = 0;
    for (const o of stale) if (await this.lifecycle.expireIfUnpaid(o.id)) n += 1;
    if (n) this.log.log(`sweep released ${n} expired order(s)`);
    return n;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close().catch(() => undefined)));
  }
}
