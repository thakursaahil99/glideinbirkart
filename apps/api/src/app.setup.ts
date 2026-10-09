import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppConfig } from './config/config.types';

/**
 * HTTP-level configuration shared by the real server (main.ts) and the e2e tests,
 * so tests exercise the same prefix, versioning, cookies and CORS rules as production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AppConfig>(ConfigService);

  // Behind Render / a reverse proxy: trust the first hop so req.ip and secure cookies are right.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      // JSON API: CSP adds nothing and would break the Swagger UI's inline scripts.
      contentSecurityPolicy: false,
      // The web/mobile apps load uploaded images from this origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });

  const allowedOrigins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Client-Type',
      'X-Guest-Cart-Id',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
}
