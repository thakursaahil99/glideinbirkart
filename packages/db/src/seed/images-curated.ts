/* eslint-disable no-console */
/**
 * Keyless alternative to images.ts: a hand-picked list of Pexels photo IDs per leaf category.
 * Every ID is checked against the Pexels CDN before use, then product and department images are swapped in.
 * Pexels licence: free for commercial use, no attribution required (we still credit Pexels in the alt text).
 *
 *   pnpm db:images:curated
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();

const CURATED: Record<string, number[]> = {
  smartphones: [47261, 3945672, 24181865, 13844013, 21854468, 14486282, 36680543],
  'mobile-cases': [12359130, 18403793, 374140, 1670768, 8156983, 13706809, 4574587],
  'power-banks': [3921704, 10104285, 38649063, 38649173, 14706040, 6296911],
  laptops: [11129922, 8569471, 3747070, 6611936],
  headphones: [210927, 7772548, 5650531, 8356854, 5269699, 210926, 2919003],
  'bluetooth-speakers': [4917455, 14017595, 9767551, 12021852, 374110, 29617989],
  smartwatches: [5081914, 5083218, 31406903, 18662969, 11700618, 31406910, 30707908, 51011],
  televisions: [5202925, 13806260, 7546648, 6580225],
  'mens-tshirts': [4646580, 2451200, 32963962, 8791990, 9225880, 9985771],
  'mens-shirts': [11100293, 10952730, 19852754, 10618446, 6616673],
  'mens-jeans': [10133274, 6764142, 1082526, 10133275, 2129970, 17265364],
  'mens-sports-shoes': [260044, 4065509, 15659357, 7880182, 3763869],
  sarees: [7920188, 17113983, 11629757, 28943474, 14928074, 37054322],
  kurtas: [8489652, 34741232, 37045884, 8217656, 10322690, 31371016, 36697919],
  dresses: [8619007, 8386647, 33539926, 31410216, 8386664],
  handbags: [5352628, 7953286, 22432991, 9327162, 22434759, 35666033, 8335273],
  sofas: [6758245, 6580416, 1239298, 4857775, 7018400, 6480707, 4846097],
  cookware: [12586814, 12156176, 15245005, 2868977, 29462835],
  'home-decor': [5793645, 7359595, 5793657, 16411135, 9566051],
  bedsheets: [11621057, 6758069, 12553184, 7765000, 13245210],
  'mixer-grinders': [3094227, 17890636, 17890637, 6803737, 7936983],
  skincare: [8131568, 7020247, 9253769, 5468646],
  haircare: [4408447, 17307533, 31401742, 30595022, 28223044, 31401739],
  fragrances: [15096784, 13875783, 1666405, 36389336],
  'gym-equipment': [7743320, 35567437, 29224210, 4753994, 3931367, 3999606],
  yoga: [4325462, 6339731, 8539005, 8038623],
  cricket: [20652481, 35825595, 35981347, 35801177],
  'fiction-books': [694740, 1637455, 3847617, 31881618],
  'self-help-books': [5009160, 433333, 1383379, 9291615, 8263076],
  notebooks: [8230968, 7657382, 10024578, 5717492, 8850766],
  toys: [3663060, 311268, 15250000, 7269700],
  'baby-care': [16579295, 14937142, 7282769],
};

const DEPARTMENT: Record<string, number> = {
  electronics: 13844013,
  'mens-fashion': 11100293,
  'womens-fashion': 17113983,
  'home-kitchen': 6758245,
  'beauty-personal-care': 8131568,
  'sports-fitness': 7743320,
  'books-stationery': 433333,
  'toys-baby': 3663060,
};

/** banner title → Pexels photo ID (cropped for desktop and mobile); the web app overlays the title / subtitle / CTA on top */
const BANNERS: Record<string, number> = {
  'Big Savings on Electronics': 3619918,
  'Festive Ethnic Edit': 28943601,
  'Make Home Yours': 29012619,
  'Move More, Spend Less': 32610333,
  'Free delivery over ₹499': 6969947,
  'Use WELCOME10': 5624984,
};

const cdn = (id: number, w = 900, h = 900) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop`;

const okCache = new Map<number, boolean>();
async function exists(id: number): Promise<boolean> {
  const hit = okCache.get(id);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    const res = await fetch(cdn(id), { method: 'HEAD' });
    ok = res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    ok = false;
  }
  okCache.set(id, ok);
  return ok;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, category: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const pools = new Map<string, number[]>();
  for (const [slug, ids] of Object.entries(CURATED)) {
    const good: number[] = [];
    for (const id of ids) if (await exists(id)) good.push(id);
    pools.set(slug, good);
    console.log(`  ${slug}: ${good.length}/${ids.length} photos verified`);
  }

  const cursor = new Map<string, number>();
  let updated = 0;
  const skipped = new Set<string>();
  for (const p of products) {
    const pool = pools.get(p.category.slug) ?? [];
    if (pool.length < 2) {
      skipped.add(p.category.slug);
      continue;
    }
    const start = cursor.get(p.category.slug) ?? 0;
    const take = Math.min(4, pool.length);
    const ids = Array.from({ length: take }, (_, i) => pool[(start + i) % pool.length] as number);
    cursor.set(p.category.slug, (start + take) % pool.length);
    await prisma.$transaction([
      prisma.productImage.deleteMany({ where: { productId: p.id } }),
      prisma.productImage.createMany({
        data: ids.map((id, i) => ({
          productId: p.id,
          url: cdn(id),
          alt: `${p.name} — photo ${i + 1} (Pexels)`.slice(0, 250),
          position: i,
        })),
      }),
    ]);
    updated++;
  }

  for (const [slug, id] of Object.entries(DEPARTMENT)) {
    if (await exists(id))
      await prisma.category.updateMany({ where: { slug }, data: { imageUrl: cdn(id) } });
  }
  // sub-categories (mega-menu / category tiles) reuse the first verified photo of their own pool
  let subs = 0;
  for (const [slug, pool] of pools) {
    if (pool[0] === undefined) continue;
    const r = await prisma.category.updateMany({
      where: { slug },
      data: { imageUrl: cdn(pool[0], 800, 600) },
    });
    subs += r.count;
  }

  let banners = 0;
  for (const [title, id] of Object.entries(BANNERS)) {
    if (!(await exists(id))) continue;
    const r = await prisma.banner.updateMany({
      where: { title },
      data: { imageUrl: cdn(id, 1600, 600), mobileImageUrl: cdn(id, 1000, 700) },
    });
    banners += r.count;
  }
  console.log(`✓ Updated ${banners} banners and ${subs} sub-category images`);

  // everything that snapshots a product photo (orders, reviews, returns) follows the product's new first image
  const first = new Map<string, string>();
  for (const img of await prisma.productImage.findMany({
    where: { variantId: null },
    orderBy: { position: 'asc' },
    select: { productId: true, url: true },
  })) {
    if (!first.has(img.productId)) first.set(img.productId, img.url);
  }
  let orderItems = 0;
  for (const it of await prisma.orderItem.findMany({ select: { id: true, productId: true } })) {
    const url = first.get(it.productId);
    if (url) {
      await prisma.orderItem.update({ where: { id: it.id }, data: { image: url } });
      orderItems++;
    }
  }
  let reviewImgs = 0;
  for (const ri of await prisma.reviewImage.findMany({
    select: { id: true, review: { select: { productId: true } } },
  })) {
    const url = first.get(ri.review.productId);
    if (url) {
      await prisma.reviewImage.update({ where: { id: ri.id }, data: { url } });
      reviewImgs++;
    }
  }
  let returns = 0;
  for (const r of await prisma.returnRequest.findMany({
    where: { NOT: { images: { isEmpty: true } } },
    select: { id: true, orderItem: { select: { productId: true } } },
  })) {
    const url = first.get(r.orderItem.productId);
    if (url) {
      await prisma.returnRequest.update({ where: { id: r.id }, data: { images: [url] } });
      returns++;
    }
  }
  // categories still without a picture inherit their parent's
  let inherited = 0;
  for (let pass = 0; pass < 3; pass++) {
    for (const c of await prisma.category.findMany({
      where: { imageUrl: null, parentId: { not: null } },
      select: { id: true, parent: { select: { imageUrl: true } } },
    })) {
      if (!c.parent?.imageUrl) continue;
      await prisma.category.update({ where: { id: c.id }, data: { imageUrl: c.parent.imageUrl } });
      inherited++;
    }
  }
  console.log(
    `✓ Synced ${orderItems} order items, ${reviewImgs} review photos, ${returns} return photos, ${inherited} inherited category images`,
  );
  console.log(`✓ Updated photos for ${updated} of ${products.length} products`);
  if (skipped.size)
    console.log(`! No verified photos for: ${[...skipped].join(', ')} (kept existing art)`);

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
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

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
