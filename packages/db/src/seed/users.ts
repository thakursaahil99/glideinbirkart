import * as argon2 from 'argon2';
import type { PrismaClient } from '@prisma/client';
import { slugify } from '@gk/utils';
import { bannerImageUrl, cities, daysAgo, indianNames } from './util';

export const CREDENTIALS = {
  superAdmin: { email: 'superadmin@glideinbirkart.in', password: 'Super@12345' },
  admin: { email: 'admin@glideinbirkart.in', password: 'Admin@12345' },
  customer: { email: 'customer@glideinbirkart.in', password: 'Customer@123', phone: '9876543210' },
  sellers: [
    { email: 'seller1@glideinbirkart.in', password: 'Seller@12345', store: 'TechNest Retail' },
    { email: 'seller2@glideinbirkart.in', password: 'Seller@12345', store: 'Fashion Bazaar' },
    { email: 'seller3@glideinbirkart.in', password: 'Seller@12345', store: 'HomeCraft India' },
  ],
  pendingSeller: {
    email: 'seller.pending@glideinbirkart.in',
    password: 'Seller@12345',
    store: 'Spice Route Organics',
  },
  blocked: { email: 'blocked.user@example.com', password: 'Customer@123' },
};

interface SellerDef {
  email: string;
  name: string;
  store: string;
  business: string;
  type: string;
  gstin: string;
  pan: string;
  city: (typeof cities)[number];
  phone: string;
  description: string;
}

const SELLERS: SellerDef[] = [
  {
    email: CREDENTIALS.sellers[0]!.email,
    name: 'Rahul Menon',
    store: 'TechNest Retail',
    business: 'TechNest Retail Pvt Ltd',
    type: 'PRIVATE_LIMITED',
    gstin: '29AABCT1234F1Z5',
    pan: 'AABCT1234F',
    city: cities[0]!,
    phone: '9845012345',
    description:
      'Authorised electronics retailer: phones, laptops, audio and wearables with full manufacturer warranty.',
  },
  {
    email: CREDENTIALS.sellers[1]!.email,
    name: 'Neha Kulkarni',
    store: 'Fashion Bazaar',
    business: 'Fashion Bazaar Enterprises',
    type: 'PARTNERSHIP',
    gstin: '27AAFFB5678K1Z2',
    pan: 'AAFFB5678K',
    city: cities[1]!,
    phone: '9820098200',
    description:
      'Curated everyday fashion and handloom ethnic wear from India’s best weavers and labels.',
  },
  {
    email: CREDENTIALS.sellers[2]!.email,
    name: 'Vikram Patel',
    store: 'HomeCraft India',
    business: 'HomeCraft India LLP',
    type: 'LLP',
    gstin: '24AAHHL9012M1Z8',
    pan: 'AAHHL9012M',
    city: cities[7]!,
    phone: '9898012345',
    description:
      'Home, kitchen, beauty, sports, books and toys — everything for a well-lived-in home.',
  },
];

export async function seedUsers(prisma: PrismaClient) {
  const hashes = new Map<string, string>();
  const hash = async (pw: string) => {
    if (!hashes.has(pw)) hashes.set(pw, await argon2.hash(pw));
    return hashes.get(pw) as string;
  };
  const verified = { emailVerifiedAt: daysAgo(60) };

  const superAdmin = await prisma.user.create({
    data: {
      id: 'usr_superadmin',
      name: 'Platform Owner',
      email: CREDENTIALS.superAdmin.email,
      passwordHash: await hash(CREDENTIALS.superAdmin.password),
      role: 'SUPER_ADMIN',
      ...verified,
    },
  });
  const admin = await prisma.user.create({
    data: {
      id: 'usr_admin',
      name: 'Anita Desai (Admin)',
      email: CREDENTIALS.admin.email,
      passwordHash: await hash(CREDENTIALS.admin.password),
      role: 'ADMIN',
      ...verified,
    },
  });

  // demo customer with two addresses
  const demo = await prisma.user.create({
    data: {
      id: 'usr_customer',
      name: 'Aarav Sharma',
      email: CREDENTIALS.customer.email,
      phone: CREDENTIALS.customer.phone,
      passwordHash: await hash(CREDENTIALS.customer.password),
      ...verified,
      phoneVerifiedAt: daysAgo(60),
      lastLoginAt: daysAgo(1),
    },
  });
  const demoHome = await prisma.address.create({
    data: {
      userId: demo.id,
      fullName: 'Aarav Sharma',
      phone: CREDENTIALS.customer.phone,
      line1: '12, 4th Cross, Indiranagar',
      line2: 'Near 100 Feet Road',
      landmark: 'Opp. Metro station',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      type: 'HOME',
      isDefault: true,
    },
  });
  const demoWork = await prisma.address.create({
    data: {
      userId: demo.id,
      fullName: 'Aarav Sharma',
      phone: CREDENTIALS.customer.phone,
      line1: 'WeWork Galaxy, 43 Residency Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560025',
      type: 'WORK',
    },
  });

  // 13 more customers (reviewers & order history)
  const customers: Array<{
    id: string;
    name: string;
    addressId: string;
    city: string;
    state: string;
  }> = [];
  for (const [i, name] of indianNames.filter((n) => n !== 'Aarav Sharma').entries()) {
    const c = cities[i % cities.length]!;
    const user = await prisma.user.create({
      data: {
        id: `usr_cust_${i + 1}`,
        name,
        email: `${slugify(name).replace(/-/g, '.')}@example.com`,
        passwordHash: await hash(CREDENTIALS.customer.password),
        ...verified,
        createdAt: daysAgo(120 - i * 6),
      },
    });
    const addr = await prisma.address.create({
      data: {
        userId: user.id,
        fullName: name,
        phone: `98${String(10000000 + i * 937211).slice(0, 8)}`,
        line1: `${10 + i}, MG Road`,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        isDefault: true,
      },
    });
    customers.push({ id: user.id, name, addressId: addr.id, city: c.city, state: c.state });
  }
  await prisma.user.create({
    data: {
      id: 'usr_blocked',
      name: 'Blocked Example',
      email: CREDENTIALS.blocked.email,
      passwordHash: await hash(CREDENTIALS.blocked.password),
      status: 'BLOCKED',
      blockedReason: 'Repeated chargebacks (demo)',
      ...verified,
    },
  });

  // approved sellers
  const sellerIds: string[] = [];
  for (const [i, s] of SELLERS.entries()) {
    const user = await prisma.user.create({
      data: {
        id: `usr_seller_${i + 1}`,
        name: s.name,
        email: s.email,
        phone: s.phone,
        passwordHash: await hash(CREDENTIALS.sellers[i]!.password),
        role: 'SELLER',
        ...verified,
        createdAt: daysAgo(150),
      },
    });
    const profile = await prisma.sellerProfile.create({
      data: {
        id: `slr_${i + 1}`,
        userId: user.id,
        storeName: s.store,
        slug: slugify(s.store),
        description: s.description,
        logoUrl: bannerImageUrl(`store-${slugify(s.store)}`, s.store, '', '', 'generic', 400, 400),
        businessName: s.business,
        businessType: s.type,
        gstin: s.gstin,
        pan: s.pan,
        contactEmail: s.email,
        contactPhone: s.phone,
        bankAccountName: s.business,
        bankAccountNumber: `5010023456${7890 + i}`,
        bankIfsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
        pickupLine1: `${20 + i}, Industrial Estate, Phase ${i + 1}`,
        pickupCity: s.city.city,
        pickupState: s.city.state,
        pickupPincode: s.city.pincode,
        status: 'APPROVED',
        onboardingStep: 5,
        submittedAt: daysAgo(148),
        approvedAt: daysAgo(145),
        createdAt: daysAgo(150),
      },
    });
    await prisma.sellerKyc.createMany({
      data: (['PAN', 'GSTIN_CERTIFICATE', 'BANK_PROOF'] as const).map((docType) => ({
        sellerId: profile.id,
        docType,
        fileUrl: bannerImageUrl(
          `kyc-${profile.id}-${docType}`,
          docType.replace('_', ' '),
          `${s.business} — sample document`,
          '',
          'generic',
          900,
          600,
        ),
        fileName: `${docType.toLowerCase()}.pdf`,
        status: 'APPROVED' as const,
        reviewedAt: daysAgo(146),
      })),
    });
    sellerIds.push(profile.id);
  }

  // one seller waiting for approval
  const ps = CREDENTIALS.pendingSeller;
  const pendingUser = await prisma.user.create({
    data: {
      id: 'usr_seller_pending',
      name: 'Lakshmi Pillai',
      email: ps.email,
      phone: '9447012345',
      passwordHash: await hash(ps.password),
      role: 'SELLER',
      ...verified,
    },
  });
  const pending = await prisma.sellerProfile.create({
    data: {
      id: 'slr_pending',
      userId: pendingUser.id,
      storeName: ps.store,
      slug: slugify(ps.store),
      description: 'Farm-direct spices, teas and organic pantry staples from Kerala.',
      businessName: 'Spice Route Organics',
      businessType: 'PROPRIETORSHIP',
      gstin: '32AAGPS3456N1Z3',
      pan: 'AAGPS3456N',
      contactEmail: ps.email,
      contactPhone: '9447012345',
      bankAccountName: 'Lakshmi Pillai',
      bankAccountNumber: '60210456789012',
      bankIfsc: 'SBIN0004321',
      bankName: 'State Bank of India',
      pickupLine1: '5, Spice Market Road',
      pickupCity: 'Kochi',
      pickupState: 'Kerala',
      pickupPincode: '682001',
      status: 'PENDING',
      onboardingStep: 5,
      submittedAt: daysAgo(1, 5),
    },
  });
  await prisma.sellerKyc.createMany({
    data: (['PAN', 'GSTIN_CERTIFICATE', 'BANK_PROOF', 'ID_PROOF'] as const).map((docType) => ({
      sellerId: pending.id,
      docType,
      fileUrl: bannerImageUrl(
        `kyc-pending-${docType}`,
        docType.replace('_', ' '),
        'Spice Route Organics — sample document',
        '',
        'generic',
        900,
        600,
      ),
      fileName: `${docType.toLowerCase()}.jpg`,
    })),
  });

  return {
    superAdminId: superAdmin.id,
    adminId: admin.id,
    demo: { id: demo.id, name: demo.name, homeAddressId: demoHome.id, workAddressId: demoWork.id },
    customers,
    sellerIds: sellerIds as [string, string, string],
    sellerUserIds: ['usr_seller_1', 'usr_seller_2', 'usr_seller_3'],
    pendingSellerId: pending.id,
  };
}
