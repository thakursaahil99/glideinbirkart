import type { PrismaClient } from '@prisma/client';
import { bannerImageUrl } from './util';

export async function seedCommerce(
  prisma: PrismaClient,
  ctx: { categoryIds: Map<string, string>; sellerIds: string[] },
) {
  // ── coupons ──
  const now = Date.now();
  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME10',
        description: '10% off your order (up to ₹150) — welcome gift',
        type: 'PERCENTAGE',
        value: 10,
        minOrderAmount: 499,
        maxDiscount: 150,
        perUserLimit: 1,
        expiresAt: new Date(now + 180 * 86_400_000),
      },
      {
        code: 'FLAT100',
        description: 'Flat ₹100 off on orders above ₹999',
        type: 'FLAT',
        value: 100,
        minOrderAmount: 999,
        perUserLimit: 3,
        expiresAt: new Date(now + 90 * 86_400_000),
      },
      {
        code: 'FESTIVE20',
        description: '20% off up to ₹500 on orders above ₹1,999',
        type: 'PERCENTAGE',
        value: 20,
        minOrderAmount: 1999,
        maxDiscount: 500,
        usageLimit: 500,
        perUserLimit: 2,
        expiresAt: new Date(now + 45 * 86_400_000),
      },
      {
        code: 'FREESHIP',
        description: 'Flat ₹49 off — free delivery on orders above ₹299',
        type: 'FLAT',
        value: 49,
        minOrderAmount: 299,
        perUserLimit: 5,
        expiresAt: new Date(now + 365 * 86_400_000),
      },
      {
        code: 'EXPIRED5',
        description: 'An expired coupon (used for testing)',
        type: 'PERCENTAGE',
        value: 5,
        minOrderAmount: 0,
        perUserLimit: 1,
        expiresAt: new Date(now - 10 * 86_400_000),
        startsAt: new Date(now - 60 * 86_400_000),
      },
    ],
  });

  // ── banners ──
  await prisma.banner.createMany({
    data: [
      {
        title: 'Big Savings on Electronics',
        subtitle: 'Up to 70% off on audio, wearables and laptops. Limited-time deals.',
        imageUrl: bannerImageUrl(
          'hero-electronics',
          'Big Savings on Electronics',
          'Up to 70% off on audio, wearables and laptops',
          'Shop electronics',
          'headphones',
        ),
        mobileImageUrl: bannerImageUrl(
          'hero-electronics-m',
          'Big Savings on Electronics',
          'Up to 70% off',
          'Shop now',
          'headphones',
          1000,
          700,
        ),
        linkUrl: '/c/electronics',
        ctaText: 'Shop electronics',
        placement: 'HERO' as const,
        sortOrder: 0,
      },
      {
        title: 'Festive Ethnic Edit',
        subtitle: 'Handloom sarees, kurtas and statement festive wear.',
        imageUrl: bannerImageUrl(
          'hero-ethnic',
          'Festive Ethnic Edit',
          'Handloom sarees, kurtas and festive wear',
          'Explore the edit',
          'saree',
        ),
        mobileImageUrl: bannerImageUrl(
          'hero-ethnic-m',
          'Festive Ethnic Edit',
          'Handloom sarees & kurtas',
          'Explore',
          'saree',
          1000,
          700,
        ),
        linkUrl: '/c/womens-fashion',
        ctaText: 'Explore the edit',
        placement: 'HERO' as const,
        sortOrder: 1,
      },
      {
        title: 'Make Home Yours',
        subtitle: 'Sofas, cookware and décor — up to 60% off.',
        imageUrl: bannerImageUrl(
          'hero-home',
          'Make Home Yours',
          'Sofas, cookware and décor — up to 60% off',
          'Shop home',
          'sofa',
        ),
        mobileImageUrl: bannerImageUrl(
          'hero-home-m',
          'Make Home Yours',
          'Up to 60% off',
          'Shop home',
          'sofa',
          1000,
          700,
        ),
        linkUrl: '/c/home-kitchen',
        ctaText: 'Shop home',
        placement: 'HERO' as const,
        sortOrder: 2,
      },
      {
        title: 'Move More, Spend Less',
        subtitle: 'Gym gear, yoga and cricket essentials from PeakFit & Boltz.',
        imageUrl: bannerImageUrl(
          'hero-sports',
          'Move More, Spend Less',
          'Gym gear, yoga and cricket essentials',
          'Gear up',
          'dumbbell',
        ),
        mobileImageUrl: bannerImageUrl(
          'hero-sports-m',
          'Move More, Spend Less',
          'Gym, yoga & cricket',
          'Gear up',
          'dumbbell',
          1000,
          700,
        ),
        linkUrl: '/c/sports-fitness',
        ctaText: 'Gear up',
        placement: 'HERO' as const,
        sortOrder: 3,
      },
      {
        title: 'Free delivery over ₹499',
        subtitle: 'Pay online or Cash on Delivery',
        imageUrl: bannerImageUrl(
          'sec-delivery',
          'Free delivery over ₹499',
          'Pay online or Cash on Delivery',
          '',
          'generic',
          800,
          360,
        ),
        linkUrl: '/search',
        placement: 'SECONDARY' as const,
        sortOrder: 0,
      },
      {
        title: 'Use WELCOME10',
        subtitle: 'Extra 10% off your first order',
        imageUrl: bannerImageUrl(
          'sec-welcome',
          'Use code WELCOME10',
          'Extra 10% off your first order',
          '',
          'case',
          800,
          360,
        ),
        linkUrl: '/search',
        placement: 'SECONDARY' as const,
        sortOrder: 1,
      },
    ],
  });

  // ── commission rules ──
  const cat = (slug: string) => ctx.categoryIds.get(slug) as string;
  await prisma.commissionRule.createMany({
    data: [
      { scope: 'GLOBAL', rate: 10 },
      { scope: 'CATEGORY', categoryId: cat('electronics'), rate: 6 },
      { scope: 'CATEGORY', categoryId: cat('mens-fashion'), rate: 14 },
      { scope: 'CATEGORY', categoryId: cat('womens-fashion'), rate: 14 },
      { scope: 'CATEGORY', categoryId: cat('books-stationery'), rate: 9 },
      { scope: 'CATEGORY', categoryId: cat('beauty-personal-care'), rate: 12 },
      { scope: 'SELLER', sellerId: ctx.sellerIds[1], rate: 12.5 },
    ],
  });

  // ── CMS ──
  const pages: Array<[string, string, string]> = [
    [
      'about',
      'About Glideinbir Kart',
      `# About Glideinbir Kart\n\nGlideinbir Kart is a multi-vendor marketplace built for India. We connect verified local sellers with customers across the country, with transparent GST pricing, easy returns and delivery you can count on.\n\n## What we believe\n\n- **Fair prices, clear taxes** — every price you see is the price you pay, GST included.\n- **Verified sellers** — every seller completes KYC (PAN, GSTIN, bank proof) before listing.\n- **Easy returns** — a hassle-free return window on eligible products.\n- **Support that answers** — real people, reachable by email and phone.\n`,
    ],
    [
      'contact',
      'Contact Us',
      `# Contact Us\n\nWe are here to help.\n\n- **Email:** support@glideinbirkart.in\n- **Phone:** +91 80 4000 1234 (Mon–Sat, 9am–7pm IST)\n- **Registered office:** 4th Floor, Prestige Tech Park, Outer Ring Road, Bengaluru 560103, Karnataka\n\nFor order issues, please keep your order number handy (it starts with **GK**).\n`,
    ],
    [
      'privacy-policy',
      'Privacy Policy',
      `# Privacy Policy\n\n_Last updated: 1 January 2026_\n\nWe collect only the information needed to run the marketplace: your name, contact details, delivery addresses, order history and device information for security.\n\n## How we use data\n\n- To process and deliver your orders and provide support.\n- To prevent fraud and keep accounts secure.\n- To personalise recommendations (you can clear your viewing history anytime).\n\n## Sharing\n\nWe share the details a seller or courier needs to fulfil your order. We never sell your personal data.\n\n## Your rights\n\nYou may access, correct or delete your data by writing to privacy@glideinbirkart.in.\n`,
    ],
    [
      'terms',
      'Terms & Conditions',
      `# Terms & Conditions\n\nBy using Glideinbir Kart you agree to these terms.\n\n## Marketplace\n\nGlideinbir Kart provides a platform where independent sellers list products. Contracts of sale are between you and the seller; we facilitate payment, support and returns.\n\n## Pricing & taxes\n\nAll prices are in Indian Rupees and inclusive of applicable GST unless stated.\n\n## Accounts\n\nYou are responsible for keeping your credentials confidential and for activity on your account.\n\n## Disputes\n\nThese terms are governed by Indian law; courts at Bengaluru have exclusive jurisdiction.\n`,
    ],
    [
      'return-policy',
      'Return & Refund Policy',
      `# Return & Refund Policy\n\n## Eligibility\n\nMost products can be returned within the return window shown on the product page (typically **7 days from delivery**). Items must be unused, in original packaging, with tags and accessories.\n\n## Not returnable\n\nOpened personal-care items, perfumes, innerwear and products marked "non-returnable".\n\n## Refunds\n\n- **Prepaid orders:** refunded to the original payment method within 5–7 business days of the item being received.\n- **Cash on Delivery:** refunded by bank transfer after verification.\n\n## Disputes\n\nIf a seller rejects your return, you can escalate it to our team from the Returns page.\n`,
    ],
    [
      'shipping-policy',
      'Shipping Policy',
      `# Shipping Policy\n\n## Delivery fee\n\nOrders above the free-delivery threshold ship free; otherwise a flat fee applies.\n\n## Delivery time\n\nMost orders arrive in **3–7 business days** depending on your PIN code. Enter your PIN code on any product page to see the estimated delivery date.\n\n## Tracking\n\nOnce your order ships you will receive the courier name and tracking number on the order page.\n\n## Serviceability\n\nWe deliver to thousands of PIN codes across India and are expanding every month.\n`,
    ],
  ];
  await prisma.cmsPage.createMany({
    data: pages.map(([slug, title, content]) => ({ slug, title, content })),
  });

  // ── site settings ──
  await prisma.siteSetting.create({
    data: {
      key: 'site',
      value: {
        deliveryFee: 49,
        freeDeliveryThreshold: 499,
        codEnabled: true,
        onlinePaymentsEnabled: true,
        codMaxAmount: 50000,
        supportEmail: 'support@glideinbirkart.in',
        supportPhone: '+91 80 4000 1234',
        defaultCommissionRate: 10,
        payoutHoldDays: 7,
        lowStockThreshold: 5,
      },
    },
  });

  // ── serviceable PIN codes (metro + tier-1 ranges) ──
  const ranges: Array<[string, string, number, number, number, boolean]> = [
    ['Bengaluru', 'Karnataka', 560001, 560103, 2, true],
    ['Mumbai', 'Maharashtra', 400001, 400104, 2, true],
    ['New Delhi', 'Delhi', 110001, 110096, 2, true],
    ['Chennai', 'Tamil Nadu', 600001, 600119, 3, true],
    ['Hyderabad', 'Telangana', 500001, 500100, 3, true],
    ['Pune', 'Maharashtra', 411001, 411062, 3, true],
    ['Kolkata', 'West Bengal', 700001, 700110, 4, true],
    ['Ahmedabad', 'Gujarat', 380001, 380063, 3, true],
    ['Jaipur', 'Rajasthan', 302001, 302039, 4, true],
    ['Lucknow', 'Uttar Pradesh', 226001, 226031, 5, true],
    ['Kochi', 'Kerala', 682001, 682042, 4, true],
    ['Chandigarh', 'Chandigarh', 160001, 160036, 4, false],
  ];
  const pins = ranges.flatMap(([city, state, from, to, days, cod]) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      pincode: String(from + i),
      city,
      state,
      deliveryDays: days,
      codAvailable: cod,
    })),
  );
  await prisma.serviceablePincode.createMany({ data: pins, skipDuplicates: true });
}
