import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListingPage, toListParams, type RawSearchParams } from '@/components/store/listing-page';
import { revalidate, safe, serverApi } from '@/lib/server-api';
import { absoluteUrl, SITE_NAME } from '@/lib/utils';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await safe(() => serverApi.catalog.category(slug, revalidate.long));
  if (!category) return { title: 'Category not found' };
  const description =
    category.description ??
    `Shop ${category.name} online at ${SITE_NAME} — verified sellers, GST-inclusive prices and easy returns.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: `/c/${slug}` },
    openGraph: {
      title: `${category.name} | ${SITE_NAME}`,
      description,
      url: absoluteUrl(`/c/${slug}`),
      images: category.imageUrl ? [{ url: category.imageUrl }] : undefined,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const [category, result] = await Promise.all([
    safe(() => serverApi.catalog.category(slug, revalidate.long)),
    safe(() => serverApi.products.list(toListParams(sp, { category: slug }), revalidate.short)),
  ]);
  if (!category || !result) notFound();

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', slug: '' },
      ...category.breadcrumbs.map((b) => ({ name: b.name, slug: `c/${b.slug}` })),
    ].map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: absoluteUrl(`/${b.slug}`),
    })),
  };
  return (
    <>
      <ListingPage
        title={category.name}
        description={category.description}
        breadcrumbs={[
          { name: 'Home', href: '/' },
          ...category.breadcrumbs.map((b, i, arr) => ({
            name: b.name,
            href: i < arr.length - 1 ? `/c/${b.slug}` : undefined,
          })),
        ]}
        items={result.items}
        meta={result.meta}
        total={result.meta.total}
        page={result.meta.page}
        totalPages={result.meta.totalPages}
        basePath={`/c/${slug}`}
        rawParams={sp}
        categoryBase={{ slug, name: category.name }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\u003c') }}
      />
    </>
  );
}
