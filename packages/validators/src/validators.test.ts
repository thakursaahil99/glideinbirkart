import { describe, expect, it } from 'vitest';
import {
  addressSchema,
  checkoutSchema,
  emailSchema,
  loginSchema,
  passwordSchema,
  phoneSchema,
  productInputSchema,
  registerSchema,
  returnRequestSchema,
  reviewInputSchema,
  variantInputSchema,
} from './index';

const issues = (r: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}) => (r.success ? [] : (r.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`));

describe('credentials', () => {
  it('normalises email casing and whitespace', () => {
    expect(emailSchema.parse('  Sahil@Example.COM ')).toBe('sahil@example.com');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('normalises Indian mobiles to 10 digits', () => {
    expect(phoneSchema.parse('+91 98765-43210')).toBe('9876543210');
    expect(phoneSchema.safeParse('1234567890').success).toBe(false);
  });

  it('requires a letter and a number in passwords', () => {
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('Passw0rdOK').success).toBe(true);
  });

  it('validates registration and login payloads', () => {
    expect(
      registerSchema.parse({ name: 'Asha Rao', email: 'ASHA@x.in', password: 'Secret123' }).email,
    ).toBe('asha@x.in');
    expect(
      registerSchema.safeParse({ name: 'A', email: 'a@x.in', password: 'Secret123' }).success,
    ).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@x.in', password: '' }).success).toBe(false);
  });
});

describe('address', () => {
  const base = {
    fullName: 'Asha Rao',
    phone: '9876543210',
    line1: '12 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
  };

  it('accepts a valid address and applies defaults', () => {
    const a = addressSchema.parse(base);
    expect(a.type).toBe('HOME');
    expect(a.isDefault).toBe(false);
  });

  it('rejects bad PIN code, phone and state', () => {
    expect(issues(addressSchema.safeParse({ ...base, pincode: '12345' }))).toContain(
      'pincode: Enter a valid 6-digit PIN code',
    );
    expect(addressSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, state: 'Narnia' }).success).toBe(false);
  });
});

describe('checkout and returns', () => {
  it('accepts only the supported payment methods', () => {
    expect(checkoutSchema.safeParse({ addressId: 'a1', paymentMethod: 'COD' }).success).toBe(true);
    expect(checkoutSchema.safeParse({ addressId: 'a1', paymentMethod: 'RAZORPAY' }).success).toBe(
      true,
    );
    expect(checkoutSchema.safeParse({ addressId: 'a1', paymentMethod: 'CRYPTO' }).success).toBe(
      false,
    );
    expect(checkoutSchema.safeParse({ addressId: '', paymentMethod: 'COD' }).success).toBe(false);
  });

  it('restricts return reasons and quantity', () => {
    const ok = { orderItemId: 'oi1', quantity: 1, reason: 'Wrong item received' };
    expect(returnRequestSchema.parse(ok).images).toEqual([]);
    expect(returnRequestSchema.safeParse({ ...ok, reason: 'Bored' }).success).toBe(false);
    expect(returnRequestSchema.safeParse({ ...ok, quantity: 0 }).success).toBe(false);
  });

  it('requires a 1-5 rating for reviews', () => {
    expect(reviewInputSchema.safeParse({ productId: 'p1', rating: 5 }).success).toBe(true);
    expect(reviewInputSchema.safeParse({ productId: 'p1', rating: 6 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ productId: 'p1', rating: 0 }).success).toBe(false);
  });
});

describe('product input', () => {
  const variant = { sku: 'TSH-RED-M', mrp: 999, price: 699, stock: 10 };
  const product = {
    name: 'Cotton Crew Neck T-Shirt',
    categoryId: 'cat1',
    description: 'A soft everyday t-shirt made from combed cotton.',
    gstRate: 5,
    images: [{ url: 'https://example.com/a.jpg' }],
    variants: [variant],
  };

  it('rejects a selling price above the MRP', () => {
    expect(issues(variantInputSchema.safeParse({ ...variant, price: 1200 }))).toContain(
      'price: Selling price cannot exceed MRP',
    );
  });

  it('accepts a minimal product and fills defaults', () => {
    const p = productInputSchema.parse(product);
    expect(p.isReturnable).toBe(true);
    expect(p.returnWindowDays).toBe(7);
    expect(p.submit).toBe(true);
    expect(p.variants[0]?.isActive).toBe(true);
  });

  it('enforces valid GST slabs, images and variants', () => {
    expect(productInputSchema.safeParse({ ...product, gstRate: 7 }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...product, images: [] }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...product, variants: [] }).success).toBe(false);
  });

  it('validates SKU characters', () => {
    expect(variantInputSchema.safeParse({ ...variant, sku: 'bad sku!' }).success).toBe(false);
  });
});
