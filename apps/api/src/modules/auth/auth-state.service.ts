import { Injectable } from '@nestjs/common';
import type { Role } from '@gk/types';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';

export interface AuthState {
  id: string;
  role: Role;
  status: 'ACTIVE' | 'BLOCKED';
  ver: number;
  name: string;
  email: string | null;
}

const TTL_SECONDS = 60;

/**
 * Lightweight per-request lookup of the authoritative user state (role, blocked, token version).
 * Cached in Redis for 60 s and invalidated whenever any of those fields change, so blocking a user
 * or "log out of all devices" takes effect immediately instead of when the access token expires.
 */
@Injectable()
export class AuthStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private key(id: string) {
    return `gk:auth:state:${id}`;
  }

  async get(userId: string): Promise<AuthState | null> {
    try {
      const raw = await this.redis.client.get(this.key(userId));
      if (raw) return JSON.parse(raw) as AuthState;
    } catch {
      /* fall through to DB */
    }
    const u = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, role: true, status: true, tokenVersion: true, name: true, email: true },
    });
    if (!u) return null;
    const state: AuthState = {
      id: u.id,
      role: u.role,
      status: u.status,
      ver: u.tokenVersion,
      name: u.name,
      email: u.email,
    };
    try {
      await this.redis.client.set(this.key(userId), JSON.stringify(state), 'EX', TTL_SECONDS);
    } catch {
      /* cache is best-effort */
    }
    return state;
  }

  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.client.del(this.key(userId));
    } catch {
      /* ignore */
    }
  }
}
