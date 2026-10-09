import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from '../../config/config.types';
import { PrismaService } from '../../infra/prisma.service';
import { unauthorized } from '../../common/errors';
import { AuthStateService } from './auth-state.service';
import type { AccessTokenPayload } from './guards';

export type ClientType = 'web' | 'mobile';

export interface SessionMeta {
  clientType: ClientType;
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');

/** A just-rotated refresh token may be replayed for this long (parallel tabs / flaky networks) without it counting as theft. */
const ROTATION_GRACE_MS = 10_000;

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly state: AuthStateService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  get accessTtl(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }

  get refreshTtlMs(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 3600 * 1000;
  }

  signAccess(user: { id: string; role: string; tokenVersion: number }): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role as AccessTokenPayload['role'],
      ver: user.tokenVersion,
    };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.accessTtl,
    });
  }

  /** Short-lived signed cookie read by the Next.js middleware to mirror RBAC on routes. */
  signSession(user: { id: string; role: string }): string {
    return this.jwt.sign(
      { sub: user.id, role: user.role },
      {
        secret: this.config.get('SESSION_SECRET', { infer: true }),
        expiresIn: Math.floor(this.refreshTtlMs / 1000),
      },
    );
  }

  async issue(
    user: { id: string; role: string; tokenVersion: number },
    meta: SessionMeta,
    familyId?: string,
  ): Promise<IssuedTokens & { recordId: string }> {
    const refreshToken = randomToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    const record = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId: familyId ?? randomToken(12),
        clientType: meta.clientType,
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip,
        expiresAt,
      },
    });
    return {
      accessToken: this.signAccess(user),
      expiresIn: this.accessTtl,
      refreshToken,
      refreshExpiresAt: expiresAt,
      recordId: record.id,
    };
  }

  /**
   * Rotate a refresh token. Reuse of an already-rotated token (outside the grace window)
   * is treated as theft and revokes the whole token family.
   */
  async rotate(rawToken: string, meta: SessionMeta) {
    const now = new Date();
    const rec = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!rec) throw unauthorized('Invalid session. Please sign in again.', 'INVALID_REFRESH');
    if (rec.expiresAt <= now)
      throw unauthorized('Your session expired. Please sign in again.', 'SESSION_EXPIRED');

    if (rec.revokedAt) {
      const withinGrace =
        rec.replacedById && now.getTime() - rec.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (!withinGrace) {
        await this.revokeFamily(rec.familyId);
        throw unauthorized(
          'Session revoked for your security. Please sign in again.',
          'TOKEN_REUSE',
        );
      }
    }

    const user = rec.user;
    if (user.deletedAt || user.status === 'BLOCKED')
      throw unauthorized('Account unavailable', 'ACCOUNT_BLOCKED');

    const issued = await this.issue(user, meta, rec.familyId);
    if (!rec.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: rec.id },
        data: { revokedAt: now, replacedById: issued.recordId },
      });
    }
    return { user, issued };
  }

  async revokeToken(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Log out everywhere: revoke refresh tokens and bump the version so live access tokens die too. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
    ]);
    await this.state.invalidate(userId);
  }
}
