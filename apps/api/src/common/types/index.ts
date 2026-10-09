import type { Role } from '@gk/types';

export type AuthUser = Express.AuthUser;
export type SellerContext = Express.SellerContext;

export interface RequestContext {
  userId?: string;
  role?: Role;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export class PagedResult<T> {
  constructor(
    readonly items: T[],
    readonly meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
    } & Record<string, unknown>,
  ) {}
}

export function paged<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
  extra: Record<string, unknown> = {},
): PagedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return new PagedResult(items, {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    ...extra,
  });
}

export const pageArgs = (page: number, limit: number) => ({
  skip: (page - 1) * limit,
  take: limit,
});
