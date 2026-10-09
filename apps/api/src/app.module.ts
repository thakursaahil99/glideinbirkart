import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { validateEnv } from './config/env';
import type { AppConfig } from './config/config.types';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import { HttpLoggerMiddleware, PINO_LOGGER } from './common/middleware/http-logger.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { createLogger } from './common/logger';
import { CacheModule } from './infra/cache.service';
import { PrismaModule } from './infra/prisma.service';
import { QueueModule } from './infra/queue.service';
import { RedisModule, RedisService } from './infra/redis.service';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CmsModule } from './modules/cms/cms.module';
import { ProductsModule } from './modules/products/products.module';
import { KycModule } from './modules/kyc/kyc.module';
import { SellersModule } from './modules/sellers/sellers.module';
import { CartModule } from './modules/cart/cart.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { QnaModule } from './modules/qna/qna.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { WorkersModule } from './modules/workers/workers.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRootAsync({
      inject: [RedisService, ConfigService],
      useFactory: (redis: RedisService, config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 240 }],
        storage: new ThrottlerStorageRedisService(redis.client),
        // e2e suites hammer auth endpoints; rate limits are exercised separately.
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    PrismaModule,
    RedisModule,
    CacheModule,
    QueueModule,
    AuditModule,
    SettingsModule,
    MailModule,
    NotificationsModule,
    UploadsModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    CatalogModule,
    ProductsModule,
    CmsModule,
    KycModule,
    CouponsModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    ReviewsModule,
    QnaModule,
    PayoutsModule,
    AnalyticsModule,
    AdminModule,
    WorkersModule,
    SellersModule,
    HealthModule,
  ],
  providers: [
    {
      provide: PINO_LOGGER,
      inject: [ConfigService],
      useFactory: (config: AppConfig) =>
        createLogger(
          config.get('LOG_LEVEL', { infer: true }),
          config.get('NODE_ENV', { infer: true }) === 'development',
        ),
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    RequestIdMiddleware,
    HttpLoggerMiddleware,
  ],
  exports: [PINO_LOGGER],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, HttpLoggerMiddleware).forRoutes('*');
  }
}
