/* eslint-disable no-console */
/**
 * Replaces the generated placeholder artwork with real, free-licensed photographs.
 *
 *   PEXELS_API_KEY=xxxx pnpm db:images   → Pexels (free key: https://www.pexels.com/api/ — recommended)
 *   pnpm db:images                       → Openverse fallback (no key, but its API often rate-limits / challenges anonymous clients)
 *
 * Photos are hot-linked from the provider's CDN and the photographer is credited in the image alt text.
 * (Amazon / Flipkart images are copyrighted and must not be copied — use these free sources, or upload
 * your own through the seller dashboard / Cloudinary.)
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const PEXELS_KEY = process.env.PEXELS_API_KEY;

/** leaf category slug → search phrase that returns product-like photos */
const QUERY: Record<string, string> = {
  smartphones: 'smartphone',
  'mobile-cases': 'phone case',
  'power-banks': 'power bank',
  laptops: 'laptop',
  headphones: 'headphones',
  'bluetooth-speakers': 'bluetooth speaker',
  smartwatches: 'smartwatch',
  televisions: 'television',
  'mens-tshirts': 't-shirt',
  'mens-shirts': 'men shirt',
  'mens-jeans': 'jeans',
  'mens-sports-shoes': 'running shoes',
  sarees: 'saree',
  kurtas: 'kurta indian',
  dresses: 'women dress',
  handbags: 'handbag',
  sofas: 'sofa',
  cookware: 'cookware pan',
  'home-decor': 'table lamp decor',
  bedsheets: 'bedsheet bedroom',
  'mixer-grinders': 'kitchen blender',
  skincare: 'skincare serum',
  haircare: 'hair oil bottle',
  fragrances: 'perfume bottle',
  'gym-equipment': 'dumbbell',
  yoga: 'yoga mat',
  cricket: 'cricket bat',
  'fiction-books': 'novel book',
  'self-help-books': 'books stack',
  notebooks: 'notebook journal',
  toys: 'wooden toys',
  'baby-care': 'baby care',
};
const DEPARTMENT_QUERY: Record<string, string> = {
  electronics: 'electronics gadgets',
  'mens-fashion': 'mens fashion',
  'womens-fashion': 'indian ethnic wear',
  'home-kitchen': 'home interior',
  'beauty-personal-care': 'beauty cosmetics',
  'sports-fitness': 'fitness gym',
  'books-stationery': 'books stationery',
  'toys-baby': 'toys',
};

interface Photo {
  url: string;
  alt: string;
}

async function pexels(query: string, count: number): Promise<Photo[]> {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(count, 80)}&orientation=square`,
    { headers: { Authorization: PEXELS_KEY as string } },
  );
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const json = (await res.json()) as {
    photos: Array<{ id: number; alt?: string; photographer: string; src: { original: string } }>;
  };
  return json.photos.map((p) => ({
    url: `https://images.pexels.com/photos/${p.id}/pexels-photo-${p.id}.jpeg?auto=compress&cs=tinysrgb&w=900&h=900&fit=crop`,
    alt: `${p.alt || query} — Photo by ${p.photographer} on Pexels`,
  }));
}

async function openverse(query: string, count: number): Promise<Photo[]> {
  const out: Photo[] = [];
  for (const license of ['cc0,pdm', 'by']) {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license=${license}&page_size=${Math.min(count, 40)}&category=photograph`,
      { headers: { 'User-Agent': 'glideinbir-kart-seed/1.0' } },
    );
    if (!res.ok) continue;
    const json = (await res.json()) as {
      results: Array<{
        url: string;
        title: string;
        creator?: string;
        width?: number;
        height?: number;
        license: string;
      }>;
    };
    for (const r of json.results) {
      if (
        (r.width ?? 0) < 600 ||
        !/^https:/.test(r.url) ||
        !/\.(jpe?g|png|webp)(\?|$)/i.test(r.url)
      )
        continue;
      out.push({
        url: r.url,
        alt: `${r.title || query}${r.creator ? ` by ${r.creator}` : ''} (${r.license.toUpperCase()}, via Openverse)`,
      });
    }
    if (out.length >= count) break;
  }
  return out;
}

const search = (q: string, n: number) => (PEXELS_KEY ? pexels(q, n) : openverse(q, n));

async function main() {
  console.log(
    `📷 Fetching free-licensed product photos via ${PEXELS_KEY ? 'Pexels' : 'Openverse (set PEXELS_API_KEY for better results)'}…`,
  );
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, category: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const pools = new Map<string, Photo[]>();
  const slugs = [...new Set(products.map((p) => p.category.slug))];
  for (const slug of slugs) {
    const q = QUERY[slug] ?? slug.replace(/-/g, ' ');
    try {
      pools.set(slug, await search(q, 40));
    } catch (e) {
      console.warn(`  ! ${slug}: ${(e as Error).message}`);
    }
    process.stdout.write(`  ${slug}: ${pools.get(slug)?.length ?? 0} photos\n`);
    await new Promise((r) => setTimeout(r, PEXELS_KEY ? 150 : 700));
  }

  const cursor = new Map<string, number>();
  let updated = 0;
  for (const p of products) {
    const pool = pools.get(p.category.slug) ?? [];
    if (pool.length < 2) continue; // keep the placeholder art for categories we couldn't fill
    const start = cursor.get(p.category.slug) ?? 0;
    const take = Math.min(4, pool.length);
    const photos = Array.from({ length: take }, (_, i) => pool[(start + i) % pool.length] as Photo);
    cursor.set(p.category.slug, (start + take) % pool.length);
    await prisma.$transaction([
      prisma.productImage.deleteMany({ where: { productId: p.id } }),
      prisma.productImage.createMany({
        data: photos.map((ph, i) => ({
          productId: p.id,
          url: ph.url,
          alt: `${p.name} — ${ph.alt}`.slice(0, 250),
          position: i,
        })),
      }),
    ]);
    updated++;
  }

  for (const [slug, q] of Object.entries(DEPARTMENT_QUERY)) {
    const [hit] = await search(q, 5).catch(() => []);
    if (hit) await prisma.category.updateMany({ where: { slug }, data: { imageUrl: hit.url } });
  }
  console.log(`✓ Updated photos for ${updated} of ${products.length} products`);
  if (updated === 0 && !PEXELS_KEY) {
    console.log(
      '\n! No photos could be fetched anonymously. Get a free key at https://www.pexels.com/api/ and run:',
    );
    console.log('    PEXELS_API_KEY=your_key pnpm db:images');
    console.log('  (PowerShell: $env:PEXELS_API_KEY="your_key"; pnpm db:images)');
  }

  if (process.env.REDIS_URL ?? 'redis://localhost:6379') {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await redis.connect();
      const keys = await redis.keys('gk:cache:*');
      if (keys.length) await redis.del(...keys);
      console.log(`✓ Cleared ${keys.length} cached API entries`);
    } catch {
      console.log('! Could not reach Redis — restart the API (or wait ~2 min) to see new photos');
    } finally {
      redis.disconnect();
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
