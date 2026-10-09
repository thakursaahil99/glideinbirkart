# Glideinbir Kart

A multi-vendor e-commerce platform for India (think Amazon / Flipkart): customer storefront, seller dashboard, admin console, REST API and a React Native app. Prices are GST-inclusive, money is INR, delivery is PIN-code based, and payments run through Razorpay (test mode) or Cash on Delivery.

Everything runs on free tools. No Docker is needed.

| App                                                              | Stack                                                                                                  | Dev port |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| `apps/web`                                                       | Next.js 16 (App Router), Tailwind, Radix, TanStack Query. Hosts the storefront, `/seller` and `/admin` | 3000     |
| `apps/api`                                                       | NestJS 11, Prisma, PostgreSQL 17, Redis, BullMQ. REST under `/api/v1`, Swagger at `/api/docs`          | 4000     |
| `apps/mobile`                                                    | Expo SDK 57, expo-router, NativeWind (customer app)                                                    | Expo     |
| `packages/db`                                                    | Prisma schema, migrations, seed script                                                                 |          |
| `packages/types` `validators` `utils` `api-client` `ui` `config` | Shared contracts, Zod schemas, GST/pricing engine, typed API client, design tokens, tooling presets    |          |

See [ARCHITECTURE.md](ARCHITECTURE.md) for diagrams and design decisions.

## Prerequisites

- Node.js 20.11+ (22 recommended) and pnpm 12 (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL 15+ running locally (17 recommended)
- Redis 5+ (Redis 6.2+ preferred). On Windows use [Memurai](https://www.memurai.com/) or a portable Redis build

Works on Windows, macOS and Linux.

## Quick start

```bash
pnpm install

# 1. Configure environment (defaults work for a stock local Postgres: postgres/postgres)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env      # DATABASE_URL for Prisma

# 2. Create the schema and load demo data
pnpm db:deploy
pnpm db:seed          # prints the demo credentials

# 3. Run API + web together
pnpm dev
```

Open http://localhost:3000 (storefront), http://localhost:4000/api/docs (Swagger).

If port 3000 is busy, run the web app elsewhere (`pnpm --filter @gk/web exec next dev --port 3100`) and add that origin to `CORS_ORIGINS` in `apps/api/.env`.

### Demo credentials

| Role                     | Email                            | Password       | Where                                |
| ------------------------ | -------------------------------- | -------------- | ------------------------------------ |
| Super admin              | superadmin@glideinbirkart.in     | `Super@12345`  | `/admin`                             |
| Admin                    | admin@glideinbirkart.in          | `Admin@12345`  | `/admin`                             |
| Customer                 | customer@glideinbirkart.in       | `Customer@123` | storefront (or phone OTP 9876543210) |
| Seller (TechNest Retail) | seller1@glideinbirkart.in        | `Seller@12345` | `/seller`                            |
| Seller (Fashion Bazaar)  | seller2@glideinbirkart.in        | `Seller@12345` | `/seller`                            |
| Seller (HomeCraft India) | seller3@glideinbirkart.in        | `Seller@12345` | `/seller`                            |
| Seller awaiting approval | seller.pending@glideinbirkart.in | `Seller@12345` | `/seller`                            |

Coupons: `WELCOME10`, `FLAT100`, `FESTIVE20`, `FREESHIP`. Deliverable PIN codes in the demo: 560038, 400001, 110001.

OTP codes are returned in the API response outside production (`devOtp`), so phone login works without an SMS gateway.

### Mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env     # set EXPO_PUBLIC_API_URL to your computer's LAN IP
pnpm dev:mobile                                   # scan the QR code with Expo Go
```

A phone cannot reach `localhost`: use your computer's LAN IP (Android emulator: `10.0.2.2`). In Expo Go the built-in mock gateway and COD both work. Real Razorpay needs a development build (`eas build --profile development`).

## Free services and their local fallbacks

| Concern   | Service                                   | Without credentials                                                       |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| Payments  | Razorpay (test mode)                      | Built-in mock gateway with the same order, payment and signature contract |
| Images    | Cloudinary                                | Files stored on local disk (`apps/api/uploads`), served at `/uploads`     |
| Email     | Resend, or SMTP (e.g. Gmail app password) | Emails are logged to the console                                          |
| SMS / OTP | none                                      | Code returned as `devOtp` in non-production                               |
| Errors    | Sentry                                    | Disabled                                                                  |

Add keys to `apps/api/.env` to switch a service on; nothing else changes.

### One admin for the website and the app

The web storefront and the mobile app read the same API and database, so everything in `/admin` shows up on both: products and moderation, categories, brands, banners (with a separate phone image), coupons, CMS pages (About, Terms, Privacy), site settings and cash-only mode. **Admin → App notifications** sends an offer to every customer's inbox (website and app) and as a push to phones with the app installed. Seller and admin consoles themselves are web-only.

### Cash-only mode

Admin → Settings → uncheck **Enable online payment** and the store becomes cash-only: web and mobile checkout offer only Cash on Delivery, the API rejects online payments (`ONLINE_PAYMENT_DISABLED`), and the COD order cap is not applied. Check it again to bring Razorpay back. The seed script leaves online payment on.

### Real product photos

The seed uses generated placeholder art. To replace it with free-licensed photos (Pexels, with Openverse as a keyless fallback; images are not copied from Amazon, Flipkart or any retailer):

```bash
PEXELS_API_KEY=your_free_key pnpm db:images
```

Get a free key at https://www.pexels.com/api/.

## Common commands

| Command                        | What it does                                                                |
| ------------------------------ | --------------------------------------------------------------------------- |
| `pnpm dev`                     | API + web in watch mode                                                     |
| `pnpm dev:mobile`              | Expo dev server                                                             |
| `pnpm build`                   | Build everything                                                            |
| `pnpm lint` / `pnpm typecheck` | ESLint and TypeScript across all workspaces                                 |
| `pnpm test`                    | Unit tests (Vitest for packages, Jest for the API)                          |
| `pnpm test:e2e`                | API end-to-end tests (Supertest, needs the `glideinbir_kart_test` database) |
| `pnpm test:web`                | Playwright browser tests                                                    |
| `pnpm db:migrate`              | Create a new migration in development                                       |
| `pnpm db:deploy`               | Apply migrations                                                            |
| `pnpm db:seed`                 | Reset and reload demo data                                                  |
| `pnpm db:reset`                | Drop and recreate the schema                                                |
| `pnpm db:studio`               | Prisma Studio                                                               |
| `pnpm format`                  | Prettier                                                                    |

Husky runs lint-staged on commit and commitlint (Conventional Commits) on the message.

## Testing

**Unit tests** cover the GST and pricing engine, validators, coupon rules, commission resolution, payment signature verification and utilities.

```bash
pnpm test
```

**API e2e** boots the real Nest app against a separate database and exercises auth (including refresh-token reuse detection and RBAC), search, cart and coupons, COD and online checkout, signed webhooks and a concurrent last-unit checkout.

```bash
# one-time: create and seed the test database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/glideinbir_kart_test?schema=public" \
  pnpm --filter @gk/db deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/glideinbir_kart_test?schema=public" \
  pnpm db:seed
pnpm test:e2e
```

On Windows PowerShell set the variable first: `$env:DATABASE_URL="..."`.

**Playwright** drives a real browser through sign-up, search, add to cart, COD and online (mock gateway) checkout, My Orders, role-based access and a phone-width layout check. It targets a running stack; production builds are the most reliable target:

```bash
pnpm --filter @gk/web build && pnpm --filter @gk/web start --port 3100   # plus the API on :4000
E2E_BASE_URL=http://localhost:3100 pnpm test:web
```

The browser tests create a throwaway customer and orders in whichever database the API points at. Run `pnpm db:seed` afterwards to restore a clean demo.

CI (`.github/workflows/ci.yml`) runs lint, typecheck and unit tests, API e2e with Postgres and Redis service containers, Playwright against production builds, and an Expo Android bundle export.

## Configuration

Each app has a documented `.env.example`: [api](apps/api/.env.example), [web](apps/web/.env.example), [mobile](apps/mobile/.env.example), [db](packages/db/.env.example). The API validates its environment with Zod on boot and prints every invalid variable.

## Deployment (free tiers)

- **Web**: Vercel. Set `API_URL` (your API origin), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_ORIGIN`, `SESSION_SECRET`.
- **API**: Render web service (`pnpm --filter @gk/api build`, start `node apps/api/dist/main.js`). Set `NODE_ENV=production`, `COOKIE_SECURE=true`, `CORS_ORIGINS` to the web origin and all secrets.
- **Database**: Neon or Supabase PostgreSQL; run `pnpm db:deploy` against it.
- **Redis**: Upstash (`rediss://` URL).
- **Mobile**: `eas build` and `eas submit` (set `EXPO_PUBLIC_API_URL` to the public API).

Always use the Next.js rewrite (`/api/v1/*` proxied to the API) in production so auth cookies stay first-party.

## Known limitations

- **No real payment, SMS, or email verification in dev**: the mock gateway and console mailer stand in. Razorpay test mode needs your own keys; live payments need KYC with Razorpay and have not been exercised.
- **Razorpay on mobile** needs a development build; Expo Go supports the mock gateway and COD only. Push notifications also need a physical device and an EAS project id.
- **The mobile app was verified by typecheck and an Android bundle export, not on a device or emulator.** Expect small visual or native issues on first run. Review and return photos (picked from the gallery and uploaded) and GST invoice download (opens the share sheet) are implemented but untested on a real device.
- **Shipping is manual**: sellers enter a courier and tracking id. There is no carrier API integration or live tracking.
- **Seller payouts are recorded, not transferred**: the admin marks a payout as settled with a bank reference.
- **Search** uses PostgreSQL full-text plus trigram similarity (typo tolerant), which is good for a demo-sized catalogue. A very large catalogue would want a dedicated engine.
- **Redis 5 works but is not ideal**: BullMQ recommends 6.2+.
- **Windows**: running the API holds Prisma's query engine DLL, so `prisma generate` (and `pnpm build`/`lint`) can fail with a permission error until the API is stopped.
- **Invoices are generated PDFs** with GST breakup; they are not submitted to any e-invoicing (IRP) portal.
- The CI workflow has been written but not run on GitHub yet.

## Project layout

```
apps/
  api/        NestJS REST API, workers, e2e tests (test/)
  web/        Next.js storefront + /seller + /admin, Playwright tests (e2e/)
  mobile/     Expo customer app
packages/
  db/         Prisma schema, migrations, seed
  types/      Shared DTOs and enums
  validators/ Zod schemas shared by API and clients
  utils/      Money, GST pricing engine, Indian validators
  api-client/ Typed endpoints + React Query hooks (web and mobile)
  ui/         Design tokens and Tailwind preset
  config/     ESLint, TypeScript and Prettier presets
```
