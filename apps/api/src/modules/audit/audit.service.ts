import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@gk/db';
import { PrismaService } from '../../infra/prisma.service';
import type { RequestContext } from '../../common/types';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Writes an append-only audit trail for sensitive admin / seller actions. Never throws. */
@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(ctx: RequestContext, entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId ?? null,
          actorRole: ctx.role ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent?.slice(0, 300) ?? null,
          requestId: ctx.requestId ?? null,
        },
      });
    } catch (err) {
      this.log.error(`audit write failed (${entry.action}): ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
