import { HeroCarousel } from '@/components/store/hero-carousel';
import {
  CategoryTiles,
  DealsBand,
  PromoBanners,
  RecentlyViewedRail,
  RecommendedRail,
} from '@/components/store/home-sections';
import { ProductRail } from '@/components/store/product-rail';
import { TrustStrip } from '@/components/layout/footer';
import { EmptyState } from '@/components/ui/data';
import { revalidate as rv, safe, serverApi } from '@/lib/server-api';

// ISR: the home page is rebuilt at most every 2 minutes; personalised rails are client-side.
export const revalidate = 120;

export default async function HomePage() {
  const home = await safe(() => serverApi.home(rv.medium));
  if (!home) {
    return (
      <div className="container-page py-20">
        <EmptyState
          title="We’re warming up"
          description="The catalogue is temporarily unavailable. Please refresh in a moment."
        />
      </div>
    );
  }
  return (
    <div className="bg-paper">
      <div className="container-page space-y-12 pb-4 pt-5 sm:space-y-16 sm:pt-6">
        <HeroCarousel banners={home.banners} />
      </div>
      <TrustStrip />
      <div className="container-page space-y-12 py-10 sm:space-y-16 sm:py-14">
        <CategoryTiles categories={home.categories} />
        <DealsBand endsAt={home.deals.endsAt} products={home.deals.products} />
        <PromoBanners banners={home.secondaryBanners} />
        <ProductRail
          title="Trending now"
          eyebrow="What everyone’s looking at"
          products={home.trending}
          href="/search?sort=popularity"
        />
        <RecentlyViewedRail />
        <ProductRail
          title="Best sellers"
          eyebrow="Loved by thousands"
          products={home.bestSellers}
          href="/search?sort=popularity"
        />
        <RecommendedRail />
        {home.featured.map((f) => (
          <ProductRail
            key={f.category.id}
            title={f.category.name}
            eyebrow="Featured department"
            products={f.products}
            href={`/c/${f.category.slug}`}
          />
        ))}
        <ProductRail
          title="New arrivals"
          eyebrow="Just landed"
          products={home.newArrivals}
          href="/search?sort=newest"
        />
        <ProductRail
          title="Top rated"
          eyebrow="Highly reviewed by customers"
          products={home.topRated}
          href="/search?sort=rating"
        />
      </div>
    </div>
  );
}
