import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { API, DEMO, bearer, createApp, login } from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const unique = `e2e_${Date.now()}`;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports database and redis up', async () => {
    const res = await http().get(`${API}/health`).expect(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok', checks: { database: 'up', redis: 'up' } },
    });
  });

  it('registers a new customer and returns a mobile refresh token', async () => {
    const res = await http()
      .post(`${API}/auth/register`)
      .set('X-Client-Type', 'mobile')
      .send({ name: 'E2E Shopper', email: `${unique}@example.com`, password: 'Shopper123' })
      .expect(201);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ role: 'CUSTOMER', email: `${unique}@example.com` });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });

  it('rejects a duplicate email', async () => {
    const res = await http()
      .post(`${API}/auth/register`)
      .send({ name: 'Dup', email: DEMO.customer.email, password: 'Shopper123' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns field-level validation errors for bad input', async () => {
    const res = await http()
      .post(`${API}/auth/register`)
      .send({ name: 'X', email: 'nope', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['name', 'email', 'password']),
    );
  });

  it('logs in with valid credentials and rejects wrong passwords without leaking which part was wrong', async () => {
    const ok = await login(app, DEMO.customer);
    expect(ok.user.role).toBe('CUSTOMER');
    const bad = await http()
      .post(`${API}/auth/login`)
      .send({ email: DEMO.customer.email, password: 'WrongPass1' })
      .expect(401);
    const unknown = await http()
      .post(`${API}/auth/login`)
      .send({ email: 'ghost@example.com', password: 'WrongPass1' })
      .expect(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('blocks suspended accounts', async () => {
    const res = await http()
      .post(`${API}/auth/login`)
      .send({ email: 'blocked.user@example.com', password: 'Customer@123' });
    expect(res.status).toBe(403);
  });

  it('protects /users/me and serves it with a valid token', async () => {
    await http().get(`${API}/users/me`).expect(401);
    const { accessToken } = await login(app, DEMO.customer);
    const res = await http().get(`${API}/users/me`).set(bearer(accessToken)).expect(200);
    expect(res.body.data.email).toBe(DEMO.customer.email);
  });

  it('enforces role-based access (customers cannot reach admin or seller APIs)', async () => {
    const { accessToken } = await login(app, DEMO.customer);
    await http().get(`${API}/admin/dashboard`).set(bearer(accessToken)).expect(403);
    await http().get(`${API}/seller/products`).set(bearer(accessToken)).expect(403);
    const admin = await login(app, DEMO.admin);
    await http().get(`${API}/admin/dashboard`).set(bearer(admin.accessToken)).expect(200);
  });

  it('rotates refresh tokens and rejects reuse of the old one', async () => {
    const first = await login(app, DEMO.customer);
    const rotated = await http()
      .post(`${API}/auth/refresh`)
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    expect(rotated.body.data.refreshToken).not.toBe(first.refreshToken);
    // wait out the short grace window so the reuse is treated as theft
    await new Promise((r) => setTimeout(r, 11_000));
    await http()
      .post(`${API}/auth/refresh`)
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: first.refreshToken })
      .expect(401);
    // reuse detection revokes the whole family
    await http()
      .post(`${API}/auth/refresh`)
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: rotated.body.data.refreshToken })
      .expect(401);
  });

  it('signs in with a phone OTP (fixed code in the test environment)', async () => {
    const req = await http()
      .post(`${API}/auth/otp/request`)
      .send({ phone: DEMO.customer.phone })
      .expect(200);
    expect(req.body.data.sent).toBe(true);
    const res = await http()
      .post(`${API}/auth/otp/verify`)
      .set('X-Client-Type', 'mobile')
      .send({ phone: DEMO.customer.phone, code: '123456' })
      .expect(200);
    expect(res.body.data.user.phone).toBe(DEMO.customer.phone);
    await http()
      .post(`${API}/auth/otp/verify`)
      .send({ phone: DEMO.customer.phone, code: '000000' })
      .expect(400);
  });
});
