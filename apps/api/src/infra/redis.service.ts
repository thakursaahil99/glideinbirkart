import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../config/config.types';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly url: string;

  constructor(@Inject(ConfigService) config: AppConfig) {
    this.url = config.get('REDIS_URL', { infer: true });
    this.client = new Redis(this.url, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    this.client.on('error', () => {
      /* connection errors are surfaced by /health and command failures */
    });
  }

  /** BullMQ needs dedicated connections with `maxRetriesPerRequest: null`. */
  createBullConnection(): Redis {
    return new Redis(this.url, { maxRetriesPerRequest: null, enableReadyCheck: false });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
