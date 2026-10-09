import Link from 'next/link';
import { SiteName } from '@/components/site-theme';
import { Headphones, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import type { CategoryDto } from '@gk/types';
import { Logo } from './logo';

const PERKS = [
  { icon: Truck, title: 'Free delivery', text: 'On orders above ₹499' },
  { icon: RotateCcw, title: 'Easy returns', text: '7-day hassle-free returns' },
  { icon: ShieldCheck, title: 'Secure payments', text: 'UPI, cards, netbanking & COD' },
  { icon: Headphones, title: 'Real support', text: 'Mon–Sat, 9am–7pm IST' },
];

export function TrustStrip() {
  return (
    <section aria-label="Why shop with us" className="border-y bg-card/60">
      <ul className="container-page grid grid-cols-2 gap-4 py-6 lg:grid-cols-4">
        {PERKS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-content-center rounded-2xl bg-secondary text-primary">
              <Icon className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold">{title}</p>
              <p className="text-xs text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Footer({
  categories,
  pages,
}: {
  categories: CategoryDto[];
  pages: Array<{ slug: string; title: string }>;
}) {
  return (
    <footer className="mt-16 bg-foreground text-background/80">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo className="[&_span]:text-background" />
          <p className="max-w-xs text-sm leading-relaxed text-background/60">
            India’s multi-vendor marketplace — verified sellers, GST-inclusive prices, easy returns
            and delivery you can count on.
          </p>
          <p className="text-xs text-background/45">
            Registered office: 4th Floor, Prestige Tech Park, Outer Ring Road, Bengaluru 560103,
            Karnataka.
          </p>
        </div>
        <nav aria-label="Shop">
          <h2 className="mb-3 font-display text-sm font-bold text-background">Shop</h2>
          <ul className="space-y-2 text-sm">
            {categories.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.slug}`}
                  className="text-background/65 transition-colors hover:text-accent"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Help">
          <h2 className="mb-3 font-display text-sm font-bold text-background">Help & policies</h2>
          <ul className="space-y-2 text-sm">
            {pages.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/p/${p.slug}`}
                  className="text-background/65 transition-colors hover:text-accent"
                >
                  {p.title}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/account/orders"
                className="text-background/65 transition-colors hover:text-accent"
              >
                Track your order
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Sell">
          <h2 className="mb-3 font-display text-sm font-bold text-background">Sell with us</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/seller/onboarding"
                className="text-background/65 transition-colors hover:text-accent"
              >
                Become a seller
              </Link>
            </li>
            <li>
              <Link
                href="/seller"
                className="text-background/65 transition-colors hover:text-accent"
              >
                Seller dashboard
              </Link>
            </li>
            <li>
              <a
                href="mailto:support@glideinbirkart.in"
                className="text-background/65 transition-colors hover:text-accent"
              >
                support@glideinbirkart.in
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-background/10">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-background/50 sm:flex-row">
          <p>
            © {new Date().getFullYear()} <SiteName />. All prices in INR, inclusive of GST.
          </p>
          <p>Made with care in India 🇮🇳</p>
        </div>
      </div>
    </footer>
  );
}
