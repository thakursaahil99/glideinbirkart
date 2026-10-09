import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, DEMO, bearer, createApp, login } from './helpers';

describe('Admin controls shared by the website and the app (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('only admins can broadcast notifications', async () => {
    const customer = await login(app, DEMO.customer);
    await http()
      .post(`${API}/admin/notifications/broadcast`)
      .set(bearer(customer.accessToken))
      .send({ title: 'Hello', body: 'World' })
      .expect(403);
    await http().get(`${API}/admin/notifications/audience`).expect(401);
  });

  it('validates the broadcast message', async () => {
    const admin = await login(app, DEMO.admin);
    const res = await http()
      .post(`${API}/admin/notifications/broadcast`)
      .set(bearer(admin.accessToken))
      .send({ title: 'x', body: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('delivers a broadcast to customers (inbox on web and app) but not to sellers', async () => {
    const admin = await login(app, DEMO.admin);
    const customer = await login(app, DEMO.customer);
    const seller = await login(app, DEMO.seller);

    const audience = await http()
      .get(`${API}/admin/notifications/audience`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(audience.body.data.customers).toBeGreaterThan(0);
    expect(audience.body.data.allUsers).toBeGreaterThanOrEqual(audience.body.data.customers);

    const unread = async (token: string) =>
      (await http().get(`${API}/notifications/unread-count`).set(bearer(token)).expect(200)).body
        .data.count as number;
    const customerBefore = await unread(customer.accessToken);
    const sellerBefore = await unread(seller.accessToken);

    const title = `E2E offer ${Date.now()}`;
    const sent = await http()
      .post(`${API}/admin/notifications/broadcast`)
      .set(bearer(admin.accessToken))
      .send({
        title,
        body: 'Extra 20% off this weekend',
        audience: 'CUSTOMERS',
        productSlug: 'some-product',
      })
      .expect(200);
    expect(sent.body.data.recipients).toBe(audience.body.data.customers);

    expect(await unread(customer.accessToken)).toBe(customerBefore + 1);
    expect(await unread(seller.accessToken)).toBe(sellerBefore);

    const inbox = await http()
      .get(`${API}/notifications?limit=5`)
      .set(bearer(customer.accessToken))
      .expect(200);
    const mine = inbox.body.data.find((n: { title: string }) => n.title === title);
    expect(mine).toMatchObject({ type: 'PROMO', data: { productSlug: 'some-product' } });

    // it is recorded in the audit log
    const logs = await http()
      .get(`${API}/admin/audit-logs?limit=5`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(
      logs.body.data.some((l: { action: string }) => l.action === 'notification.broadcast'),
    ).toBe(true);
  });

  it('serves CMS pages that the app and website both render', async () => {
    const list = await http().get(`${API}/cms`).expect(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    const page = await http().get(`${API}/cms/${list.body.data[0].slug}`).expect(200);
    expect(page.body.data.content.length).toBeGreaterThan(10);
  });
});
