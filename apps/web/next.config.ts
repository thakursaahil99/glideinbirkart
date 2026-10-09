import path from 'node:path';
import type { NextConfig } from 'next';

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const apiHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_ORIGIN ?? API_URL);
  } catch {
    return new URL('http://localhost:4000');
  }
})();

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: path.join(__dirname, '../..') },
  images: {
    formats: ['image/avif', 'image/webp'],
    // product placeholders are SVG; real uploads are Cloudinary rasters
    dangerouslyAllowSVG: true,
    contentDispositionType: 'inline',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: apiHost.protocol.replace(':', '') as 'http' | 'https',
        hostname: apiHost.hostname,
        port: apiHost.port,
        pathname: '/**',
      },
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.pexels.com', pathname: '/**' },
      { protocol: 'http', hostname: 'localhost', port: '4000', pathname: '/**' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion', '@radix-ui/react-dialog'],
  },
  async rewrites() {
    // Same-origin API proxy: cookies stay first-party (no third-party-cookie issues) and CORS is not needed in the browser.
    return [
      { source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` },
      { source: '/uploads/:path*', destination: `${API_URL}/uploads/:path*` },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
