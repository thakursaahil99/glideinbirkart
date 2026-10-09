import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Route protection mirrored from the API's RBAC (the API remains the source of truth).
 * Reads the signed `gk_session` cookie the API sets at login; no network call is made here.
 */
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? '');

type Role = 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'SUPER_ADMIN';
const STAFF: Role[] = ['ADMIN', 'SUPER_ADMIN'];

function rule(pathname: string): { roles?: Role[] } | null {
  if (pathname.startsWith('/admin')) return { roles: STAFF };
  // seller onboarding is how a customer becomes a seller
  if (pathname === '/seller/onboarding' || pathname.startsWith('/seller/onboarding/'))
    return { roles: ['CUSTOMER', 'SELLER'] };
  if (pathname.startsWith('/seller')) return { roles: ['SELLER'] };
  if (pathname.startsWith('/account') || pathname.startsWith('/checkout')) return {};
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needed = rule(pathname);
  if (!needed) return NextResponse.next();

  let role: Role | undefined;
  const token = request.cookies.get('gk_session')?.value;
  if (token && secret.length > 0) {
    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      role = payload.role as Role;
    } catch {
      /* expired / tampered → treated as signed out */
    }
  }

  if (!role) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (needed.roles && !needed.roles.includes(role)) {
    const url = new URL('/', request.url);
    url.searchParams.set('denied', pathname.split('/')[1] ?? '');
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/seller/:path*', '/account/:path*', '/checkout/:path*'],
};
