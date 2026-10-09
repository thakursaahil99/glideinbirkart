import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({
    summary:
      'Liveness + dependency checks (PostgreSQL, Redis). Returns 503 when a dependency is down.',
  })
  async check(@Res({ passthrough: true }) res: Response) {
    const started = Date.now();
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping(),
    ]);
    const ok = db && redis;
    if (!ok) res.status(503);
    return {
      status: ok ? 'ok' : 'degraded',
      checks: { database: db ? 'up' : 'down', redis: redis ? 'up' : 'down' },
      uptimeSeconds: Math.round(process.uptime()),
      responseMs: Date.now() - started,
      version: process.env.npm_package_version ?? '1.0.0',
    };
  }
}
