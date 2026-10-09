import {
  Global,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@gk/db';

/**
 * Neon's pooled endpoint (host contains '-pooler') is PgBouncer in transaction mode: Prisma needs
 * `pgbouncer=true`, and a small per-instance pool keeps serverless functions from exhausting connections.
 * Direct connections (local Postgres, migrations) are used untouched.
 */
function pooledDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw?.includes('-pooler')) return undefined;
  const url = new URL(raw);
  if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
  return url.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ datasourceUrl: pooledDatasourceUrl() });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
