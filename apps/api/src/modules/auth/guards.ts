import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Role } from '@gk/types';
import type { AppConfig } from '../../config/config.types';
import { ALLOW_UNAPPROVED_SELLER_KEY, IS_PUBLIC_KEY, ROLES_KEY } from '../../common/decorators';
import { forbidden, unauthorized } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { AuthStateService } from './auth-state.service';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  ver: number;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Global guard: authenticates every route except those marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly state: AuthStateService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = bearerToken(req);

    if (!token) {
      if (isPublic) return true;
      throw unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      // A bad/expired token is always a 401 — even on public routes — so clients refresh instead of silently acting as guests.
      throw unauthorized('Access token expired or invalid', 'TOKEN_EXPIRED');
    }

    const s = await this.state.get(payload.sub);
    if (!s || s.ver !== payload.ver)
      throw unauthorized('Your session has ended. Please sign in again.', 'SESSION_ENDED');
    if (s.status === 'BLOCKED')
      throw forbidden('Your account has been blocked. Contact support.', 'ACCOUNT_BLOCKED');

    req.user = { id: s.id, role: s.role, name: s.name, email: s.email };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) throw unauthorized();
    const ok =
      roles.includes(user.role) || (user.role === 'SUPER_ADMIN' && roles.includes('ADMIN'));
    if (!ok) throw forbidden();
    return true;
  }
}

/** Loads the caller's SellerProfile onto the request; blocks unapproved sellers unless allowed. */
@Injectable()
export class SellerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) throw unauthorized();
    if (user.role !== 'SELLER') throw forbidden('Seller account required', 'SELLER_REQUIRED');

    const profile = await this.prisma.sellerProfile.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, status: true, storeName: true },
    });
    if (!profile) throw forbidden('Complete seller registration first', 'SELLER_PROFILE_MISSING');
    req.seller = { id: profile.id, status: profile.status, storeName: profile.storeName };

    const allowUnapproved = this.reflector.getAllAndOverride<boolean>(ALLOW_UNAPPROVED_SELLER_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!allowUnapproved && profile.status !== 'APPROVED') {
      throw forbidden(
        profile.status === 'SUSPENDED'
          ? 'Your seller account is suspended'
          : 'Your seller account is not approved yet',
        'SELLER_NOT_APPROVED',
      );
    }
    return true;
  }
}

/**
 * Double-submit-cookie CSRF protection for endpoints that authenticate with the refresh cookie.
 * Requests that carry their own refresh token in the body (mobile) are not cookie-authenticated and skip it.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const bodyToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (!cookies['gk_rt'] || bodyToken) return true;

    const origin = req.headers.origin;
    if (origin) {
      const allowed = this.config
        .get('CORS_ORIGINS', { infer: true })
        .split(',')
        .map((o) => o.trim());
      if (!allowed.includes(origin)) throw forbidden('Origin not allowed', 'CSRF_ORIGIN');
    }

    const header = req.headers['x-csrf-token'];
    const cookie = cookies['gk_csrf'];
    if (typeof header !== 'string' || !cookie)
      throw forbidden('Missing CSRF token', 'CSRF_MISSING');
    const a = Buffer.from(header);
    const b = Buffer.from(cookie);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw forbidden('Invalid CSRF token', 'CSRF_INVALID');
    return true;
  }
}
