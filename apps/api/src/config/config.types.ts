import type { ConfigService } from '@nestjs/config';
import type { Env } from './env';

/** Strongly-typed ConfigService — `config.get('PORT', { infer: true })` returns number. */
export type AppConfig = ConfigService<Env, true>;

export const isProd = (config: AppConfig) =>
  config.get('NODE_ENV', { infer: true }) === 'production';
