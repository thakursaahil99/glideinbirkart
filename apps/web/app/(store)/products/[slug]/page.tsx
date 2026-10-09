import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { ProductDetail } from '@gk/types';
import { ProductView } from '@/components/store/product-view';
import { FrequentlyBought, SimilarProducts } from '@/components/store/product-extras';
import { QnaSection } from '@/components/store/qna';
import { ReviewsSection } from '@/components/store/reviews';
import { revalidate as rv, safe, serverApi } from '@/lib/server-api';
import { absoluteUrl, SITE_NAME, truncateText } from '@/lib/utils';

// ISR: product pages are generated on first request, then refreshed at most every 2 minutes.
export const revalidate = 120;

type Props = { params: Promise<{ slug: string }> };

const getProduct = (slug: string) => safe(() => serverApi.products.detail(slug, rv.medium));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p) return { title: 'Product not found', robots: { index: false } };
  const title = p.seoTitle || `${p.name}${p.brand ? ` by ${p.brand.name}` : ''}`;
  const description = p.seoDescription || truncateText(p.description.replace(/\s+/g, ' '), 155);
  return {
    title,
    description,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: {
      type: 'website',
      title: `${title} | ${SITE_NAME}`,
      description,
      url: absoluteUrl(`/products/${p.slug}`),
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

function productJsonLd(p: ProductDetail) {
  const url = absoluteUrl(`/products/${p.slug}`);
  const variant = p.variants.find((v) => v.id === p.defaultVariantId) ?? p.variants[0];
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: truncateText(p.description.replace(/\s+/g, ' '), 300),
    image: p.images.slice(0, 5).map((i) => i.url),
    sku: variant?.sku,
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand.name } } : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: p.price,
      highPrice: Math.max(...p.variants.map((v) => v.price), p.price),
      offerCount: p.variants.length,
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url,
      seller: { '@type': 'Organization', name: p.sellerInfo.storeName },
    },
    ...(p.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: p.ratingAvg,
            reviewCount: p.ratingCount,
          },
        }
      : {}),
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const breadcrumbs: Array<{ name: string; href?: string }> = [
    { name: 'Home', href: '/' },
    ...product.breadcrumbs.map((b) => ({ name: b.name, href: `/c/${b.slug}` })),
    { name: product.name },
  ];
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: absoluteUrl(b.href ?? `/products/${product.slug}`),
    })),
  };
  const ld = JSON.stringify([productJsonLd(product), breadcrumbLd]).replace(/</g, '\\u003c');

  return (
    <div className="container-page space-y-12 py-5 sm:space-y-14 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          {breadcrumbs.map((b, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
              {b.href ? (
                <Link href={b.href} className="hover:text-primary hover:underline">
                  {b.name}
                </Link>
              ) : (
                <span aria-current="page" className="line-clamp-1 font-semibold text-foreground">
                  {b.name}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <ProductView product={product} />
      <FrequentlyBought product={product} />

      <nav
        aria-label="Product sections"
        className="sticky top-[7.5rem] z-20 -mx-4 hidden overflow-x-auto border-b bg-background/90 px-4 backdrop-blur sm:block"
      >
        <ul className="flex gap-6 text-sm font-semibold">
          {[
            ['#overview', 'Overview'],
            ['#specifications', 'Specifications'],
            ['#reviews', `Reviews (${product.ratingCount})`],
            ['#questions', 'Q&A'],
          ].map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="inline-block border-b-2 border-transparent py-3 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section
        id="overview"
        aria-labelledby="overview-h"
        className="grid scroll-mt-40 gap-8 lg:grid-cols-[1.2fr_1fr]"
      >
        <div>
          <h2 id="overview-h" className="section-title mb-4">
            About this item
          </h2>
          {product.highlights.length > 0 && (
            <ul className="mb-5 grid gap-2.5">
              {product.highlights.map((h) => (
                <li key={h} className="flex gap-3 text-[15px]">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          )}
          <p className="whitespace-pre-line text-[15px] leading-7 text-foreground/80">
            {product.description}
          </p>
        </div>
        <div id="specifications" className="scroll-mt-40">
          <h2 className="section-title mb-4">Specifications</h2>
          <dl className="overflow-hidden rounded-2xl border bg-card text-sm">
            {[
              ...product.specifications,
              ...(product.hsnCode ? [{ key: 'HSN code', value: product.hsnCode }] : []),
              { key: 'GST rate', value: `${product.gstRate}% (included in price)` },
              {
                key: 'Return policy',
                value: product.isReturnable
                  ? `${product.returnWindowDays}-day returns`
                  : 'Not returnable',
              },
            ].map((s, i) => (
              <div
                key={s.key}
                className={`grid grid-cols-[9rem_1fr] gap-3 px-4 py-3 ${i % 2 ? 'bg-muted/40' : ''}`}
              >
                <dt className="font-semibold text-muted-foreground">{s.key}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <ReviewsSection product={product} />
      <QnaSection productId={product.id} />
      <SimilarProducts productId={product.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
    </div>
  );
}
