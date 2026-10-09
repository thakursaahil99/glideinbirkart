import type { SellerStatus, UserDto } from '@gk/types';
import type { Role } from '@gk/types';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
  sellerProfile?: { status: SellerStatus } | null;
}

export const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  createdAt: true,
  sellerProfile: { select: { status: true } },
} as const;

export function toUserDto(u: UserRow): UserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    role: u.role,
    emailVerified: Boolean(u.emailVerifiedAt),
    phoneVerified: Boolean(u.phoneVerifiedAt),
    createdAt: u.createdAt.toISOString(),
    sellerStatus: u.sellerProfile?.status ?? null,
  };
}
