import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import type { Logger } from 'pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { PINO_LOGGER } from './common/middleware/http-logger.middleware';
import { PinoNestLogger } from './common/logger';
import type { AppConfig } from './config/config.types';
import { StorageService } from './modules/uploads/storage.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true, // Razorpay webhooks need the exact bytes for signature verification
  });
  const config = app.get<AppConfig>(ConfigService);
  const logger = app.get<Logger>(PINO_LOGGER);
  app.useLogger(new PinoNestLogger(logger));

  const dsn = config.get('SENTRY_DSN', { infer: true });
  if (dsn)
    Sentry.init({
      dsn,
      environment: config.get('NODE_ENV', { infer: true }),
      tracesSampleRate: 0.1,
    });

  configureApp(app);

  // Local-disk uploads (used when Cloudinary isn't configured)
  const storage = app.get(StorageService);
  if (!storage.cloudinaryEnabled)
    app.useStaticAssets(storage.localDir, { prefix: '/uploads', maxAge: '7d' });

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Glideinbir Kart API')
      .setDescription(
        'Multi-vendor e-commerce REST API (India). All responses use the envelope `{ success, data, error, meta }`. ' +
          'Authenticate with `Authorization: Bearer <accessToken>`; web clients refresh via the httpOnly cookie.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  logger.info(`Glideinbir Kart API listening on :${port}  ·  docs at /api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
