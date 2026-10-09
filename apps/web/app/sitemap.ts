import type { MetadataRoute } from 'next';
import type { CategoryDto } from '@gk/types';
import { revalidate as rv, safe, serverApi } from '@/lib/server-api';
import { absoluteUrl } from '@/lib/utils';

export const revalidate = 3600;

function flat(nodes: CategoryDto[]): CategoryDto[] {
  return nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, pages] = await Promise.all([
    safe(() => serverApi.catalog.categories(rv.long)),
    safe(() => serverApi.cms.list()),
  ]);

  // page through the whole catalogue (100 per request)
  const products: Array<{ slug: string; createdAt: string }> = [];
  for (let page = 1; page <= 50; page++) {
    const res = await safe(() =>
      serverApi.products.list({ page, limit: 100, sort: 'newest' }, rv.long),
    );
    if (!res) break;
    products.push(...res.items.map((p) => ({ slug: p.slug, createdAt: p.createdAt })));
    if (!res.meta.hasNext) break;
  }

  return [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    ...flat(categories ?? []).map((c) => ({
      url: absoluteUrl(`/c/${c.slug}`),
      changeFrequency: 'daily' as const,
      priority: c.depth === 0 ? 0.9 : 0.7,
    })),
    ...products.map((p) => ({
      url: absoluteUrl(`/products/${p.slug}`),
      lastModified: new Date(p.createdAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...(pages ?? []).map((p) => ({
      url: absoluteUrl(`/p/${p.slug}`),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ];
}
