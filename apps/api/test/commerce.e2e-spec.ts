import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PaymentGateway } from '../src/modules/payments/gateway';
import { API, DEMO, bearer, createApp, login } from './helpers';

describe('Catalogue, cart and checkout (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let addressId: string;
  let variantId: string;
  let productSlug: string;
  const http = () => request(app.getHttpServer());
  const auth = () => bearer(token);

  beforeAll(async () => {
    app = await createApp();
    token = (await login(app, DEMO.customer)).accessToken;
    const addresses = await http().get(`${API}/addresses`).set(auth()).expect(200);
    addressId = addresses.body.data[0].id;
    // start every run from an empty cart
    await http().delete(`${API}/cart`).set(auth()).expect(200);
  });
  afterAll(async () => {
    await http().delete(`${API}/cart`).set(auth());
    await app.close();
  });

  describe('catalogue and search', () => {
    it('lists products with pagination meta', async () => {
      const res = await http().get(`${API}/products?limit=5`).expect(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 5, hasNext: true });
      const p = res.body.data.find(
        (x: { inStock: boolean; defaultVariantId: string | null }) =>
          x.inStock && x.defaultVariantId,
      );
      variantId = p.defaultVariantId;
      productSlug = p.slug;
    });

    it('returns a product detail with variants and breadcrumbs', async () => {
      const res = await http().get(`${API}/products/${productSlug}`).expect(200);
      expect(res.body.data.variants.length).toBeGreaterThan(0);
      expect(res.body.data.breadcrumbs.length).toBeGreaterThan(0);
      await http().get(`${API}/products/does-not-exist`).expect(404);
    });

    it('finds products by full-text search and tolerates typos', async () => {
      const exact = await http().get(`${API}/search?q=headphones`).expect(200);
      expect(exact.body.data.length).toBeGreaterThan(0);
      const typo = await http().get(`${API}/search?q=headfones`).expect(200);
      expect(typo.body.data.length).toBeGreaterThan(0);
    });

    it('filters by price and sorts ascending', async () => {
      const res = await http()
        .get(`${API}/products?maxPrice=1000&sort=price_asc&limit=20`)
        .expect(200);
      const prices: number[] = res.body.data.map((p: { price: number }) => p.price);
      expect(prices.every((p) => p <= 1000)).toBe(true);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    });

    it('suggests queries, categories and products while typing', async () => {
      const res = await http().get(`${API}/search/suggest?q=sam`).expect(200);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          products: expect.any(Array),
          categories: expect.any(Array),
          queries: expect.any(Array),
        }),
      );
    });
  });

  describe('cart and coupons', () => {
    it('adds an item and computes GST-inclusive totals', async () => {
      const res = await http()
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId, quantity: 2 })
        .expect(200);
      expect(res.body.data.itemCount).toBe(2);
      const { pricing } = res.body.data;
      expect(pricing.subtotal).toBeGreaterThan(0);
      expect(pricing.total).toBeCloseTo(
        pricing.subtotal - pricing.couponDiscount + pricing.deliveryFee,
        2,
      );
    });

    it('refuses to exceed available stock', async () => {
      const res = await http()
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId, quantity: 100000 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown and expired coupons', async () => {
      await http().post(`${API}/cart/coupon`).set(auth()).send({ code: 'NOPE' }).expect(400);
      const expired = await http()
        .post(`${API}/cart/coupon`)
        .set(auth())
        .send({ code: 'EXPIRED5' })
        .expect(400);
      expect(expired.body.error.code).toBe('COUPON_EXPIRED');
    });

    it('keeps guest carts separate and merges them on login', async () => {
      const guestId = `g-e2e-${Date.now()}`;
      const added = await http()
        .post(`${API}/cart/items`)
        .set('X-Guest-Cart-Id', guestId)
        .send({ variantId, quantity: 1 })
        .expect(200);
      expect(added.body.data.itemCount).toBe(1);
      const merged = await http()
        .post(`${API}/cart/merge`)
        .set(auth())
        .send({ guestCartId: guestId })
        .expect(200);
      expect(merged.body.data.itemCount).toBe(3);
      // the guest cart is consumed
      const again = await http().get(`${API}/cart`).set('X-Guest-Cart-Id', guestId).expect(200);
      expect(again.body.data.itemCount).toBe(0);
    });

    it('removes items and returns to an empty cart', async () => {
      const res = await http().delete(`${API}/cart/items/${variantId}`).set(auth()).expect(200);
      expect(res.body.data.itemCount).toBe(0);
    });
  });

  describe('checkout', () => {
    const fillCart = (quantity = 1) =>
      http().post(`${API}/cart/items`).set(auth()).send({ variantId, quantity }).expect(200);

    it('requires authentication and a valid address', async () => {
      await http().post(`${API}/checkout`).send({ addressId, paymentMethod: 'COD' }).expect(401);
      await fillCart();
      await http()
        .post(`${API}/checkout`)
        .set(auth())
        .send({ addressId: 'missing', paymentMethod: 'COD' })
        .expect(400);
      await http().delete(`${API}/cart`).set(auth());
    });

    it('places a COD order, empties the cart and reserves stock', async () => {
      await fillCart(1);
      const res = await http()
        .post(`${API}/checkout`)
        .set(auth())
        .send({ addressId, paymentMethod: 'COD' })
        .expect(201);
      const { order } = res.body.data;
      expect(order.paymentMethod).toBe('COD');
      expect(order.status).toBe('PLACED');
      expect(order.orderNumber).toEqual(expect.any(String));
      expect(order.subOrders.length).toBeGreaterThan(0);
      const cart = await http().get(`${API}/cart`).set(auth()).expect(200);
      expect(cart.body.data.itemCount).toBe(0);

      const detail = await http().get(`${API}/orders/${order.id}`).set(auth()).expect(200);
      expect(detail.body.data.id).toBe(order.id);
      const list = await http().get(`${API}/orders?limit=5`).set(auth()).expect(200);
      expect(list.body.data.map((o: { id: string }) => o.id)).toContain(order.id);

      // cancel gives the stock back and records the status
      const cancelled = await http()
        .post(`${API}/orders/${order.id}/cancel`)
        .set(auth())
        .send({ reason: 'Ordered by mistake' })
        .expect(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');
    });

    it("hides other customers' orders", async () => {
      await fillCart(1);
      const res = await http()
        .post(`${API}/checkout`)
        .set(auth())
        .send({ addressId, paymentMethod: 'COD' })
        .expect(201);
      const other = await login(app, {
        email: 'ananya.iyer@example.com',
        password: 'Customer@123',
      });
      await http()
        .get(`${API}/orders/${res.body.data.order.id}`)
        .set(bearer(other.accessToken))
        .expect(404);
      await http()
        .post(`${API}/orders/${res.body.data.order.id}/cancel`)
        .set(auth())
        .send({ reason: 'cleanup test' });
    });

    it('creates a pending online order, then verifies the payment signature', async () => {
      await fillCart(1);
      const res = await http()
        .post(`${API}/checkout`)
        .set(auth())
        .send({ addressId, paymentMethod: 'RAZORPAY' })
        .expect(201);
      const { order, razorpay } = res.body.data;
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(razorpay).toMatchObject({ mock: true, currency: 'INR' });
      expect(razorpay.amount).toBe(Math.round(order.pricing.total * 100));

      // a forged signature must not confirm the order
      await http()
        .post(`${API}/payments/verify`)
        .set(auth())
        .send({
          orderId: order.id,
          razorpayOrderId: razorpay.orderId,
          razorpayPaymentId: 'pay_fake',
          razorpaySignature: 'f'.repeat(64),
        })
        .expect(400);

      const sim = await http()
        .post(`${API}/payments/mock/complete`)
        .set(auth())
        .send({ orderId: order.id, success: true })
        .expect(200);
      const paid = await http()
        .post(`${API}/payments/verify`)
        .set(auth())
        .send({
          orderId: order.id,
          razorpayOrderId: sim.body.data.razorpayOrderId,
          razorpayPaymentId: sim.body.data.razorpayPaymentId,
          razorpaySignature: sim.body.data.razorpaySignature,
        })
        .expect(200);
      expect(paid.body.data.status).toBe('PLACED');
      expect(paid.body.data.paymentStatus).toBe('PAID');

      // verifying twice is idempotent
      const again = await http()
        .post(`${API}/payments/verify`)
        .set(auth())
        .send({
          orderId: order.id,
          razorpayOrderId: sim.body.data.razorpayOrderId,
          razorpayPaymentId: sim.body.data.razorpayPaymentId,
          razorpaySignature: sim.body.data.razorpaySignature,
        })
        .expect(200);
      expect(again.body.data.paymentStatus).toBe('PAID');

      await http()
        .post(`${API}/orders/${order.id}/cancel`)
        .set(auth())
        .send({ reason: 'cleanup test' })
        .expect(200);
    });

    it('rejects online payment when the store is switched to cash-only, and still takes COD', async () => {
      const admin = await login(app, DEMO.admin);
      const current = (
        await http().get(`${API}/admin/settings`).set(bearer(admin.accessToken)).expect(200)
      ).body.data;
      const put = (onlinePaymentsEnabled: boolean) =>
        http()
          .put(`${API}/admin/settings`)
          .set(bearer(admin.accessToken))
          .send({ ...current, onlinePaymentsEnabled });
      try {
        await put(false).expect(200);
        const pub = await http().get(`${API}/settings/public`).expect(200);
        expect(pub.body.data.onlinePaymentsEnabled).toBe(false);

        await fillCart();
        const online = await http()
          .post(`${API}/checkout`)
          .set(auth())
          .send({ addressId, paymentMethod: 'RAZORPAY' })
          .expect(400);
        expect(online.body.error.code).toBe('ONLINE_PAYMENT_DISABLED');

        const cod = await http()
          .post(`${API}/checkout`)
          .set(auth())
          .send({ addressId, paymentMethod: 'COD' })
          .expect(201);
        expect(cod.body.data.order.paymentMethod).toBe('COD');
        await http()
          .post(`${API}/orders/${cod.body.data.order.id}/cancel`)
          .set(auth())
          .send({ reason: 'cleanup test' })
          .expect(200);
      } finally {
        await put(true).expect(200);
      }
    });

    it('confirms an order from a signed webhook exactly once and rejects bad signatures', async () => {
      await fillCart(1);
      const res = await http()
        .post(`${API}/checkout`)
        .set(auth())
        .send({ addressId, paymentMethod: 'RAZORPAY' })
        .expect(201);
      const { order, razorpay } = res.body.data;
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: `pay_wh_${Date.now()}`, order_id: razorpay.orderId } },
        },
      });
      const gateway = app.get(PaymentGateway);
      const eventId = `evt_${Date.now()}`;

      await http()
        .post(`${API}/payments/webhook`)
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'bad')
        .send(body)
        .expect(403);

      const sig = gateway.signMockWebhook(body);
      const first = await http()
        .post(`${API}/payments/webhook`)
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', sig)
        .set('x-razorpay-event-id', eventId)
        .send(body)
        .expect(200);
      expect(first.body.data.status).toBe('processed');
      const dup = await http()
        .post(`${API}/payments/webhook`)
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', sig)
        .set('x-razorpay-event-id', eventId)
        .send(body)
        .expect(200);
      expect(dup.body.data.status).toBe('duplicate');

      const detail = await http().get(`${API}/orders/${order.id}`).set(auth()).expect(200);
      expect(detail.body.data.paymentStatus).toBe('PAID');
      await http()
        .post(`${API}/orders/${order.id}/cancel`)
        .set(auth())
        .send({ reason: 'cleanup test' });
    });

    it('does not oversell: concurrent checkouts of the last unit leave exactly one winner', async () => {
      const seller = await login(app, DEMO.seller);
      const inv = await http()
        .get(`${API}/seller/inventory?limit=1`)
        .set(bearer(seller.accessToken))
        .expect(200);
      const row = inv.body.data[0] as { variantId: string; quantity: number };
      await http()
        .patch(`${API}/seller/inventory/${row.variantId}`)
        .set(bearer(seller.accessToken))
        .send({ quantity: 1 })
        .expect(200);

      const shoppers = [
        DEMO.customer,
        { email: 'ananya.iyer@example.com', password: 'Customer@123' },
      ];
      const sessions = await Promise.all(shoppers.map((s) => login(app, s)));
      const addrs = await Promise.all(
        sessions.map((s) =>
          http()
            .get(`${API}/addresses`)
            .set(bearer(s.accessToken))
            .then((r) => r.body.data[0].id as string),
        ),
      );
      await Promise.all(
        sessions.map((s) => http().delete(`${API}/cart`).set(bearer(s.accessToken))),
      );
      await Promise.all(
        sessions.map((s) =>
          http()
            .post(`${API}/cart/items`)
            .set(bearer(s.accessToken))
            .send({ variantId: row.variantId, quantity: 1 }),
        ),
      );

      const results = await Promise.all(
        sessions.map((s, i) =>
          http()
            .post(`${API}/checkout`)
            .set(bearer(s.accessToken))
            .send({ addressId: addrs[i], paymentMethod: 'COD' }),
        ),
      );
      const wins = results.filter((r) => r.status === 201);
      expect(wins).toHaveLength(1);
      expect(results.filter((r) => r.status >= 400 && r.status < 500)).toHaveLength(1);

      // restore: cancel the winning order and the stock level
      for (const w of wins) {
        const owner = sessions[results.indexOf(w)]!;
        await http()
          .post(`${API}/orders/${w.body.data.order.id}/cancel`)
          .set(bearer(owner.accessToken))
          .send({ reason: 'cleanup test' });
      }
      await http()
        .patch(`${API}/seller/inventory/${row.variantId}`)
        .set(bearer(seller.accessToken))
        .send({ quantity: row.quantity });
      await Promise.all(
        sessions.map((s) => http().delete(`${API}/cart`).set(bearer(s.accessToken))),
      );
    });
  });
});
