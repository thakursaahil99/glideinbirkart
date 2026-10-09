import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from './redis.service';

/** Cache namespaces. Bumping a namespace version invalidates every key built from it in O(1). */
export const CacheNs = {
  catalog: 'catalog', // categories, brands, attributes
  products: 'products', // listings, search, home, recommendations
  settings: 'settings',
  cms: 'cms',
} as const;
export type CacheNamespace = (typeof CacheNs)[keyof typeof CacheNs];

@Injectable()
export class CacheService {
  private readonly log = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  private k(key: string): string {
    return `gk:cache:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.client.get(this.k(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.log.warn(`cache get failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.client.set(this.k(key), JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.log.warn(`cache set failed for ${key}: ${(err as Error).message}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.client.del(...keys.map((k) => this.k(k)));
    } catch (err) {
      this.log.warn(`cache del failed: ${(err as Error).message}`);
    }
  }

  /** Cache-aside helper: returns cached value or computes, stores and returns it. */
  async wrap<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await factory();
    if (value !== undefined && value !== null) await this.set(key, value, ttlSeconds);
    return value;
  }

  async version(ns: CacheNamespace): Promise<number> {
    try {
      const v = await this.redis.client.get(`gk:cache:ver:${ns}`);
      return v ? Number(v) : 0;
    } catch {
      return 0;
    }
  }

  /** Invalidate everything stored under a namespace. */
  async bump(...namespaces: CacheNamespace[]): Promise<void> {
    try {
      await Promise.all(namespaces.map((ns) => this.redis.client.incr(`gk:cache:ver:${ns}`)));
    } catch (err) {
      this.log.warn(`cache bump failed: ${(err as Error).message}`);
    }
  }

  /** Versioned cache-aside: key is automatically scoped to the current namespace version. */
  async wrapNs<T>(
    ns: CacheNamespace,
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const v = await this.version(ns);
    return this.wrap(`${ns}:v${v}:${key}`, ttlSeconds, factory);
  }

  hash(input: unknown): string {
    return createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 24);
  }
}

@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
