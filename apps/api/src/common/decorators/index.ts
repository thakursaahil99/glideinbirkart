import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '@gk/types';
import type { AuthUser, RequestContext, SellerContext } from '../types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const SKIP_ENVELOPE_KEY = 'skipEnvelope';
export const ALLOW_UNAPPROVED_SELLER_KEY = 'allowUnapprovedSeller';

/** Route is reachable without a token (a valid token, when sent, still authenticates). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
/** Restrict a route to specific roles. SUPER_ADMIN always satisfies ADMIN. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** Return the raw handler result (PDFs, streams, redirects) instead of the JSON envelope. */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
/** Seller routes usable before admin approval (onboarding, KYC, profile). */
export const AllowUnapprovedSeller = () => SetMetadata(ALLOW_UNAPPROVED_SELLER_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.user as AuthUser;
});

/** Present on public routes only when the caller is authenticated. */
export const OptionalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    return ctx.switchToHttp().getRequest<Request>().user;
  },
);

export const CurrentSeller = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SellerContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.seller as SellerContext;
  },
);

export const ReqCtx = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return {
    userId: req.user?.id,
    role: req.user?.role,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.requestId,
  };
});
