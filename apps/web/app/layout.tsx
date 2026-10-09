import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import '@gk/ui/theme.css';
import './globals.css';
import { themeFontsHref, themeToCss } from '@gk/ui/theme-utils';
import { Providers } from '@/components/providers';
import { safe, serverApi } from '@/lib/server-api';
import { SITE_NAME, SITE_URL } from '@/lib/utils';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Shop online in India`, template: `%s | ${SITE_NAME}` },
  description:
    'Glideinbir Kart is India’s multi-vendor marketplace: verified sellers, GST-inclusive prices, easy returns and fast delivery.',
  applicationName: SITE_NAME,
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_IN', url: SITE_URL },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f4' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e16' },
  ],
};

const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  sameAs: [],
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+91-80-4000-1234',
    contactType: 'customer service',
    areaServed: 'IN',
    availableLanguage: ['en', 'hi'],
  },
};
const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  url: SITE_URL,
  name: SITE_NAME,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/search?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // admin-controlled look & feel (Admin → Appearance); falls back to the built-in theme if the API is unreachable
  const theme = await safe(() =>
    serverApi.theme.get({ next: { revalidate: 60, tags: ['theme'] } }),
  );
  const fontsHref = theme ? themeFontsHref(theme) : null;
  return (
    <html
      lang="en-IN"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable}`}
    >
      <head>
        {theme && <style id="gk-theme" dangerouslySetInnerHTML={{ __html: themeToCss(theme) }} />}
        {fontsHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={fontsHref} />
          </>
        )}
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers brand={theme}>{children}</Providers>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([organizationLd, websiteLd]).replace(/</g, '\\u003c'),
          }}
        />
      </body>
    </html>
  );
}
