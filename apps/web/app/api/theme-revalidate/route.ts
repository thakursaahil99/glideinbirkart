import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

const API_ORIGIN = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * Called by Admin → Appearance right after saving, so the storefront shows the new theme immediately
 * instead of after the 60 s cache window. Only a signed-in admin (verified against the API) may call it.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });
  const check = await fetch(`${API_ORIGIN}/api/v1/admin/theme`, {
    headers: { authorization: auth },
    cache: 'no-store',
  }).catch(() => null);
  if (!check?.ok) return NextResponse.json({ ok: false }, { status: 403 });
  revalidateTag('theme', { expire: 0 });
  return NextResponse.json({ ok: true });
}
