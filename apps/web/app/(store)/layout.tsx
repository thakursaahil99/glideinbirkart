import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { revalidate, safe, serverApi } from '@/lib/server-api';

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [categories, pages] = await Promise.all([
    safe(() => serverApi.catalog.categories(revalidate.long)),
    safe(() => serverApi.cms.list()),
  ]);
  return (
    <div className="flex min-h-dvh flex-col">
      <Header categories={categories ?? []} />
      <main id="main" className="flex-1 pb-20 md:pb-0">
        {children}
      </main>
      <Footer categories={categories ?? []} pages={pages ?? []} />
      <MobileNav />
    </div>
  );
}
