import { ImageResponse } from 'next/og';
import { revalidate as rv, safe, serverApi } from '@/lib/server-api';

export const alt = 'Product preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Branded 1200x630 social card generated per product (crawlers don't support the SVG placeholders). */
export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await safe(() => serverApi.products.detail(slug, rv.long));
  const price = p ? `Rs. ${p.price.toLocaleString('en-IN')}` : '';
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        background: 'linear-gradient(135deg,#4338ca,#7c3aed)',
        color: '#fff',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, fontWeight: 800 }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: '#fff',
            color: '#4338ca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 36,
          }}
        >
          G
        </div>
        Glideinbir Kart
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {p?.brand && (
          <div
            style={{
              fontSize: 28,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#fbbf24',
              fontWeight: 700,
            }}
          >
            {p.brand.name}
          </div>
        )}
        <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.08, maxWidth: 1000 }}>
          {p?.name ?? 'Product'}
        </div>
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 44, fontWeight: 800 }}
      >
        <span>{price}</span>
        {p && p.discountPercent > 0 && (
          <span
            style={{
              background: '#fbbf24',
              color: '#1c1917',
              padding: '6px 20px',
              borderRadius: 999,
              fontSize: 30,
            }}
          >
            {p.discountPercent}% off
          </span>
        )}
        {p && p.ratingCount > 0 && (
          <span
            style={{ fontSize: 30, opacity: 0.9 }}
          >{`★ ${p.ratingAvg.toFixed(1)} (${p.ratingCount})`}</span>
        )}
      </div>
    </div>,
    size,
  );
}
