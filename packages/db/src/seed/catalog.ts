import type { PrismaClient } from '@prisma/client';
import { slugify } from '@gk/utils';
import { bannerImageUrl } from './util';

export interface CategoryDef {
  name: string;
  slug?: string;
  icon?: string;
  description?: string;
  children?: CategoryDef[];
}

/** 8 top-level departments · 4 levels deep where it makes sense. */
export const CATEGORY_TREE: CategoryDef[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    icon: 'smartphone',
    description: 'Phones, laptops, audio and smart gadgets.',
    children: [
      {
        name: 'Mobiles & Accessories',
        slug: 'mobiles-accessories',
        children: [
          { name: 'Smartphones', slug: 'smartphones' },
          { name: 'Mobile Cases', slug: 'mobile-cases' },
          { name: 'Power Banks', slug: 'power-banks' },
        ],
      },
      { name: 'Computers', slug: 'computers', children: [{ name: 'Laptops', slug: 'laptops' }] },
      {
        name: 'Audio',
        slug: 'audio',
        children: [
          { name: 'Headphones', slug: 'headphones' },
          { name: 'Bluetooth Speakers', slug: 'bluetooth-speakers' },
        ],
      },
      {
        name: 'Wearables',
        slug: 'wearables',
        children: [{ name: 'Smartwatches', slug: 'smartwatches' }],
      },
      { name: 'Televisions', slug: 'televisions' },
    ],
  },
  {
    name: "Men's Fashion",
    slug: 'mens-fashion',
    icon: 'shirt',
    description: 'Everyday essentials and statement pieces for men.',
    children: [
      { name: 'T-Shirts', slug: 'mens-tshirts' },
      { name: 'Shirts', slug: 'mens-shirts' },
      { name: 'Jeans', slug: 'mens-jeans' },
      { name: 'Sports Shoes', slug: 'mens-sports-shoes' },
    ],
  },
  {
    name: "Women's Fashion",
    slug: 'womens-fashion',
    icon: 'sparkles',
    description: 'Ethnic and western wear, bags and more.',
    children: [
      { name: 'Sarees', slug: 'sarees' },
      { name: 'Kurtas & Kurtis', slug: 'kurtas' },
      { name: 'Dresses', slug: 'dresses' },
      { name: 'Handbags', slug: 'handbags' },
    ],
  },
  {
    name: 'Home & Kitchen',
    slug: 'home-kitchen',
    icon: 'home',
    description: 'Furnishing, cookware and kitchen appliances.',
    children: [
      { name: 'Furniture', slug: 'furniture', children: [{ name: 'Sofas', slug: 'sofas' }] },
      { name: 'Cookware', slug: 'cookware' },
      { name: 'Home Decor', slug: 'home-decor' },
      { name: 'Bedsheets', slug: 'bedsheets' },
      { name: 'Mixer Grinders', slug: 'mixer-grinders' },
    ],
  },
  {
    name: 'Beauty & Personal Care',
    slug: 'beauty-personal-care',
    icon: 'flower',
    description: 'Skincare, haircare and fragrances.',
    children: [
      { name: 'Skincare', slug: 'skincare' },
      { name: 'Haircare', slug: 'haircare' },
      { name: 'Fragrances', slug: 'fragrances' },
    ],
  },
  {
    name: 'Sports & Fitness',
    slug: 'sports-fitness',
    icon: 'dumbbell',
    description: 'Gear up for the gym, the mat or the pitch.',
    children: [
      { name: 'Gym Equipment', slug: 'gym-equipment' },
      { name: 'Yoga', slug: 'yoga' },
      { name: 'Cricket', slug: 'cricket' },
    ],
  },
  {
    name: 'Books & Stationery',
    slug: 'books-stationery',
    icon: 'book',
    description: 'Bestsellers, self-help and desk essentials.',
    children: [
      { name: 'Fiction', slug: 'fiction-books' },
      { name: 'Self-Help', slug: 'self-help-books' },
      { name: 'Notebooks', slug: 'notebooks' },
    ],
  },
  {
    name: 'Toys & Baby',
    slug: 'toys-baby',
    icon: 'baby',
    description: 'Play, learn and care for little ones.',
    children: [
      { name: 'Toys & Games', slug: 'toys' },
      { name: 'Baby Care', slug: 'baby-care' },
    ],
  },
];

export const BRANDS = [
  'Nova Mobiles',
  'Zenith Audio',
  'Orbit Tech',
  'Voltix',
  'Urban Weave',
  'Kaveri Looms',
  'Mehfil Ethnics',
  'Stride Labs',
  'Aarav Home',
  'Cedar & Co',
  'Glow Ritual',
  'Aura Naturals',
  'PeakFit',
  'Pageturner',
  'LittleLark',
  'Boltz Sports',
];

export const COLORS: Record<string, string> = {
  Black: '#111827',
  White: '#f9fafb',
  Blue: '#2563eb',
  Navy: '#1e3a8a',
  Red: '#dc2626',
  Green: '#16a34a',
  Olive: '#65732a',
  Grey: '#6b7280',
  Maroon: '#7f1d1d',
  Pink: '#ec4899',
  Yellow: '#eab308',
  Beige: '#d6c3a0',
  Silver: '#cbd5e1',
  Gold: '#d4a017',
  Teal: '#0d9488',
  Purple: '#7c3aed',
  Orange: '#ea580c',
  Brown: '#7c4a2d',
  Midnight: '#1e1b4b',
  Starlight: '#f1e9d8',
};

export const ATTRIBUTES: Array<{
  slug: string;
  name: string;
  type: 'TEXT' | 'NUMBER' | 'SELECT' | 'COLOR';
  unit?: string;
  values?: string[];
}> = [
  { slug: 'color', name: 'Colour', type: 'COLOR', values: Object.keys(COLORS) },
  { slug: 'size', name: 'Size', type: 'SELECT', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  {
    slug: 'shoe-size',
    name: 'Shoe Size (UK)',
    type: 'SELECT',
    values: ['6', '7', '8', '9', '10', '11'],
  },
  {
    slug: 'storage',
    name: 'Storage',
    type: 'SELECT',
    values: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'],
  },
  {
    slug: 'ram',
    name: 'RAM',
    type: 'SELECT',
    values: ['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '32 GB'],
  },
  {
    slug: 'screen-size',
    name: 'Screen Size',
    type: 'SELECT',
    values: ['32 inch', '43 inch', '50 inch', '55 inch', '65 inch'],
  },
  {
    slug: 'material',
    name: 'Material',
    type: 'SELECT',
    values: [
      'Cotton',
      'Linen',
      'Silk',
      'Polyester',
      'Denim',
      'Leather',
      'Stainless Steel',
      'Wood',
      'Ceramic',
      'Non-stick',
    ],
  },
  {
    slug: 'bed-size',
    name: 'Bed Size',
    type: 'SELECT',
    values: ['Single', 'Double', 'Queen', 'King'],
  },
  { slug: 'pack-of', name: 'Pack Of', type: 'SELECT', values: ['1', '2', '3', '5'] },
  {
    slug: 'skin-type',
    name: 'Skin Type',
    type: 'SELECT',
    values: ['All Skin Types', 'Oily', 'Dry', 'Sensitive'],
  },
  {
    slug: 'capacity',
    name: 'Capacity',
    type: 'SELECT',
    values: ['500 W', '750 W', '1000 W', '10000 mAh', '20000 mAh'],
  },
  {
    slug: 'connectivity',
    name: 'Connectivity',
    type: 'SELECT',
    values: ['Bluetooth 5.3', 'Wired', 'Bluetooth + Wired'],
  },
];

/** leaf-category slug → attribute rules */
export const CATEGORY_ATTRIBUTES: Record<
  string,
  Array<{ attr: string; required?: boolean; axis?: boolean }>
> = {
  smartphones: [
    { attr: 'color', required: true, axis: true },
    { attr: 'storage', required: true, axis: true },
    { attr: 'ram' },
  ],
  laptops: [
    { attr: 'ram', required: true, axis: true },
    { attr: 'storage', required: true, axis: true },
    { attr: 'color', axis: true },
  ],
  headphones: [{ attr: 'color', required: true, axis: true }, { attr: 'connectivity' }],
  'bluetooth-speakers': [{ attr: 'color', required: true, axis: true }, { attr: 'connectivity' }],
  smartwatches: [{ attr: 'color', required: true, axis: true }],
  televisions: [{ attr: 'screen-size', required: true, axis: true }],
  'power-banks': [
    { attr: 'capacity', required: true, axis: true },
    { attr: 'color', axis: true },
  ],
  'mobile-cases': [{ attr: 'color', axis: true }, { attr: 'material' }],
  'mens-tshirts': [
    { attr: 'size', required: true, axis: true },
    { attr: 'color', required: true, axis: true },
    { attr: 'material' },
  ],
  'mens-shirts': [
    { attr: 'size', required: true, axis: true },
    { attr: 'color', required: true, axis: true },
    { attr: 'material' },
  ],
  'mens-jeans': [
    { attr: 'size', required: true, axis: true },
    { attr: 'color', axis: true },
    { attr: 'material' },
  ],
  'mens-sports-shoes': [
    { attr: 'shoe-size', required: true, axis: true },
    { attr: 'color', required: true, axis: true },
  ],
  sarees: [{ attr: 'color', required: true, axis: true }, { attr: 'material' }],
  kurtas: [
    { attr: 'size', required: true, axis: true },
    { attr: 'color', required: true, axis: true },
    { attr: 'material' },
  ],
  dresses: [
    { attr: 'size', required: true, axis: true },
    { attr: 'color', axis: true },
  ],
  handbags: [{ attr: 'color', required: true, axis: true }, { attr: 'material' }],
  sofas: [{ attr: 'color', required: true, axis: true }, { attr: 'material' }],
  cookware: [{ attr: 'material' }, { attr: 'pack-of', axis: true }],
  bedsheets: [
    { attr: 'bed-size', required: true, axis: true },
    { attr: 'color', axis: true },
    { attr: 'material' },
  ],
  'mixer-grinders': [{ attr: 'capacity', required: true, axis: true }],
  'home-decor': [{ attr: 'color', axis: true }],
  skincare: [{ attr: 'skin-type' }, { attr: 'pack-of', axis: true }],
  haircare: [{ attr: 'pack-of', axis: true }],
  yoga: [{ attr: 'color', axis: true }],
  'gym-equipment': [{ attr: 'color', axis: true }],
};

export async function seedCatalog(prisma: PrismaClient) {
  const categoryIds = new Map<string, string>(); // slug → id
  const categoryPaths = new Map<string, string>();

  const walk = async (
    nodes: CategoryDef[],
    parent: { id: string; path: string; depth: number } | null,
  ) => {
    for (const [i, n] of nodes.entries()) {
      const slug = n.slug ?? slugify(n.name);
      const path = parent ? `${parent.path}/${slug}` : slug;
      const depth = parent ? parent.depth + 1 : 0;
      const row = await prisma.category.create({
        data: {
          name: n.name,
          slug,
          parentId: parent?.id ?? null,
          path,
          depth,
          description: n.description,
          icon: n.icon,
          sortOrder: i,
          imageUrl:
            depth === 0
              ? bannerImageUrl(
                  `cat-${slug}`,
                  n.name,
                  n.description ?? '',
                  '',
                  iconFor(slug),
                  800,
                  600,
                )
              : null,
        },
      });
      categoryIds.set(slug, row.id);
      categoryPaths.set(slug, path);
      if (n.children) await walk(n.children, { id: row.id, path, depth });
    }
  };
  await walk(CATEGORY_TREE, null);

  const brandIds = new Map<string, string>();
  for (const name of BRANDS) {
    const slug = slugify(name);
    const b = await prisma.brand.create({
      data: {
        name,
        slug,
        description: `${name} — quality you can trust.`,
        logoUrl: bannerImageUrl(`brand-${slug}`, name, '', '', 'generic', 400, 400),
      },
    });
    brandIds.set(name, b.id);
  }

  const attrIds = new Map<string, string>();
  for (const a of ATTRIBUTES) {
    const row = await prisma.attribute.create({
      data: {
        slug: a.slug,
        name: a.name,
        type: a.type,
        unit: a.unit,
        values: {
          create: (a.values ?? []).map((v, i) => ({
            value: v,
            hex: a.slug === 'color' ? COLORS[v] : null,
            sortOrder: i,
          })),
        },
      },
    });
    attrIds.set(a.slug, row.id);
  }
  for (const [catSlug, rules] of Object.entries(CATEGORY_ATTRIBUTES)) {
    const categoryId = categoryIds.get(catSlug);
    if (!categoryId) continue;
    await prisma.categoryAttribute.createMany({
      data: rules.map((r, i) => ({
        categoryId,
        attributeId: attrIds.get(r.attr) as string,
        isRequired: r.required ?? false,
        isVariantAxis: r.axis ?? false,
        sortOrder: i,
      })),
    });
  }

  return { categoryIds, categoryPaths, brandIds, attrIds };
}

export function iconFor(slug: string): string {
  const map: Record<string, string> = {
    smartphones: 'phone',
    'mobile-cases': 'case',
    'power-banks': 'powerbank',
    laptops: 'laptop',
    headphones: 'headphones',
    'bluetooth-speakers': 'speaker',
    smartwatches: 'watch',
    televisions: 'tv',
    'mens-tshirts': 'shirt',
    'mens-shirts': 'shirt',
    'mens-jeans': 'jeans',
    'mens-sports-shoes': 'shoe',
    sarees: 'saree',
    kurtas: 'dress',
    dresses: 'dress',
    handbags: 'bag',
    sofas: 'sofa',
    cookware: 'pan',
    'home-decor': 'lamp',
    bedsheets: 'bed',
    'mixer-grinders': 'mixer',
    skincare: 'jar',
    haircare: 'bottle',
    fragrances: 'perfume',
    'gym-equipment': 'dumbbell',
    yoga: 'mat',
    cricket: 'bat',
    'fiction-books': 'book',
    'self-help-books': 'book',
    notebooks: 'notebook',
    toys: 'toy',
    'baby-care': 'baby',
    electronics: 'phone',
    'mens-fashion': 'shirt',
    'womens-fashion': 'dress',
    'home-kitchen': 'sofa',
    'beauty-personal-care': 'perfume',
    'sports-fitness': 'dumbbell',
    'books-stationery': 'book',
    'toys-baby': 'toy',
  };
  return map[slug] ?? 'generic';
}
