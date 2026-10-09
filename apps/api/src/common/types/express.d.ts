import type { Role } from '@gk/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface AuthUser {
      id: string;
      role: Role;
      name: string;
      email: string | null;
    }
    interface SellerContext {
      id: string;
      status: string;
      storeName: string;
    }
    interface Request {
      user?: AuthUser;
      seller?: SellerContext;
      requestId?: string;
      rawBody?: Buffer;
    }
  }
}

export {};
