import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  configureApp(app);
  await app.init();
  return app;
}

export const API = '/api/v1';

export const DEMO = {
  customer: { email: 'customer@glideinbirkart.in', password: 'Customer@123', phone: '9876543210' },
  admin: { email: 'admin@glideinbirkart.in', password: 'Admin@12345' },
  seller: { email: 'seller1@glideinbirkart.in', password: 'Seller@12345' },
};

/** Mobile-style login (tokens in the body), which avoids cookie/CSRF handling in tests. */
export async function login(app: INestApplication, creds: { email: string; password: string }) {
  const res = await request(app.getHttpServer())
    .post(`${API}/auth/login`)
    .set('X-Client-Type', 'mobile')
    .send(creds)
    .expect(200);
  return res.body.data as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; role: string };
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
