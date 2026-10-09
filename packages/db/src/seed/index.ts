/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { seedActivity } from './activity';
import { seedCatalog } from './catalog';
import { seedCommerce } from './commerce';
import { seedProducts } from './products';
import { CREDENTIALS, seedUsers } from './users';

const prisma = new PrismaClient();

const TABLES = [
  'AuditLog',
  'Notification',
  'PushToken',
  'ReviewImage',
  'Review',
  'Answer',
  'Question',
  'CouponUsage',
  'Refund',
  'ReturnRequest',
  'OrderStatusHistory',
  'OrderItem',
  'Payment',
  'WebhookEvent',
  'SubOrder',
  'Payout',
  'Order',
  'CartItem',
  'Cart',
  'WishlistItem',
  'RecentlyViewed',
  'Coupon',
  'Banner',
  'CommissionRule',
  'ProductImage',
  'Inventory',
  'ProductVariant',
  'Product',
  'CategoryAttribute',
  'AttributeValue',
  'Attribute',
  'Brand',
  'Category',
  'SellerKyc',
  'SellerProfile',
  'Address',
  'OtpCode',
  'RefreshToken',
  'User',
  'ServiceablePincode',
  'CmsPage',
  'SiteSetting',
];

async function reset() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

async function main() {
  const started = Date.now();
  console.log('🌱 Seeding Glideinbir Kart…');
  await reset();

  const catalog = await seedCatalog(prisma);
  console.log(
    `  ✓ catalogue: ${catalog.categoryIds.size} categories, ${catalog.brandIds.size} brands, ${catalog.attrIds.size} attributes`,
  );

  const users = await seedUsers(prisma);
  console.log(
    `  ✓ users: admin, super admin, demo customer + ${users.customers.length} customers, 3 approved sellers, 1 pending seller`,
  );

  const products = await seedProducts(prisma, {
    categoryIds: catalog.categoryIds,
    categoryPaths: catalog.categoryPaths,
    brandIds: catalog.brandIds,
    sellerIds: users.sellerIds,
  });
  const live = products.filter((p) => p.status === 'ACTIVE');
  console.log(
    `  ✓ products: ${live.length} live (${live.reduce((n, p) => n + p.variants.length, 0)} SKUs) + ${products.length - live.length} in moderation/draft/rejected`,
  );

  await seedCommerce(prisma, { categoryIds: catalog.categoryIds, sellerIds: users.sellerIds });
  console.log('  ✓ coupons, banners, CMS pages, commission rules, settings, PIN codes');

  const activity = await seedActivity(prisma, {
    demo: users.demo,
    customers: users.customers,
    sellerIds: users.sellerIds,
    sellerUserIds: users.sellerUserIds,
    adminId: users.adminId,
    products,
    categoryIds: catalog.categoryIds,
  });
  console.log(
    `  ✓ activity: ${activity.orders} orders, ${activity.reviews} reviews, Q&A, returns, payouts`,
  );

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  const line = '─'.repeat(78);
  console.log(line);
  console.log(' DEMO LOGIN CREDENTIALS');
  console.log(line);
  const row = (role: string, email: string, password: string, extra = '') =>
    console.log(` ${role.padEnd(16)} ${email.padEnd(36)} ${password.padEnd(14)} ${extra}`);
  row('Super admin', CREDENTIALS.superAdmin.email, CREDENTIALS.superAdmin.password, '/admin');
  row('Admin', CREDENTIALS.admin.email, CREDENTIALS.admin.password, '/admin');
  row(
    'Customer',
    CREDENTIALS.customer.email,
    CREDENTIALS.customer.password,
    `or phone OTP ${CREDENTIALS.customer.phone}`,
  );
  CREDENTIALS.sellers.forEach((s, i) =>
    row(`Seller ${i + 1}`, s.email, s.password, `${s.store} (approved) /seller`),
  );
  row(
    'Seller (pending)',
    CREDENTIALS.pendingSeller.email,
    CREDENTIALS.pendingSeller.password,
    `${CREDENTIALS.pendingSeller.store} — awaiting approval`,
  );
  row('Other customers', 'e.g. ananya.iyer@example.com', CREDENTIALS.customer.password);
  row(
    'Blocked user',
    CREDENTIALS.blocked.email,
    CREDENTIALS.blocked.password,
    '(account is blocked)',
  );
  console.log(line);
  console.log(
    ' Coupons: WELCOME10 · FLAT100 · FESTIVE20 · FREESHIP   |   Demo PIN codes: 560038, 400001, 110001',
  );
  console.log(line);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
