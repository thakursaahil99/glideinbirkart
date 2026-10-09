import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListingPage, toListParams, type RawSearchParams } from '@/components/store/listing-page';
import { safe, serverApi } from '@/lib/server-api';

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  return {
    title: q ? `Search results for “${q}”` : 'All products',
    robots: { index: false, follow: true },
    alternates: { canonical: '/search' },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const params = toListParams(sp);
  const result = await safe(() => serverApi.search.list(params));
  if (!result) notFound();
  return (
    <ListingPage
      title={q ? `Results for “${q}”` : 'All products'}
      breadcrumbs={[{ name: 'Home', href: '/' }, { name: q ? 'Search' : 'All products' }]}
      items={result.items}
      meta={result.meta}
      total={result.meta.total}
      page={result.meta.page}
      totalPages={result.meta.totalPages}
      basePath="/search"
      rawParams={sp}
      query={q}
    />
  );
}
