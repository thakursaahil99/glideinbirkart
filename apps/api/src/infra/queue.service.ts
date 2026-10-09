import { Global, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import { RedisService } from './redis.service';

export const QueueNames = {
  emails: 'emails',
  invoices: 'invoices',
  notifications: 'notifications',
  stockExpiry: 'stock-expiry',
  searchIndex: 'search-index',
} as const;
export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  text?: string;
}
export interface InvoiceJob {
  orderId: string;
}
export interface NotificationJob {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
export type StockExpiryJob = { orderId: string } | { sweep: true };
export type SearchIndexJob =
  | { scope: 'product'; id: string }
  | { scope: 'brand'; id: string }
  | { scope: 'category'; id: string }
  | { scope: 'all' };

export interface JobPayloads {
  emails: EmailJob;
  invoices: InvoiceJob;
  notifications: NotificationJob;
  'stock-expiry': StockExpiryJob;
  'search-index': SearchIndexJob;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 500, age: 24 * 3600 },
  removeOnFail: { count: 2000 },
};

/** Thin producer facade over BullMQ queues (one connection per queue). */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly log = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {}

  queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.redis.createBullConnection(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      q.on('error', (err) => this.log.warn(`queue ${name}: ${err.message}`));
      this.queues.set(name, q);
    }
    return q;
  }

  /** Enqueue without ever failing the caller — queues are best-effort side effects. */
  async add<N extends QueueName>(
    name: N,
    data: JobPayloads[N],
    opts?: JobsOptions & { jobName?: string },
  ): Promise<void> {
    try {
      const { jobName, ...rest } = opts ?? {};
      await this.queue(name).add(jobName ?? name, data, rest);
    } catch (err) {
      this.log.error(`failed to enqueue ${name}: ${(err as Error).message}`);
    }
  }

  async remove(name: QueueName, jobId: string): Promise<void> {
    try {
      await this.queue(name).remove(jobId);
    } catch {
      /* job may already be running or gone */
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
  }
}

@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
