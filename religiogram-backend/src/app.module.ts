import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { buildTypeOrmOptions } from './config/typeorm.factory';
import { AuthModule } from './auth/auth.module';
import { OtpModule } from './otp/otp.module';
import { UsersModule } from './users/users.module';
import { ProfileModule } from './profile/profile.module';
import { UploadsModule } from './uploads/uploads.module';
import { TemplesModule } from './temples/temples.module';
import { PlacesModule } from './places/places.module';
import { PriestsModule } from './priests/priests.module';
import { OpenSearchModule } from './opensearch/opensearch.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FavoritesModule } from './favorites/favorites.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { AlertsModule } from './common/alerts/alerts.module';
import { EmailModule } from './email/email.module';
import { AppCacheModule } from './common/cache/cache.module';
import { CircuitBreakerModule } from './common/circuit-breaker/circuit-breaker.module';
import { FeatureFlagsModule } from './common/feature-flags/feature-flags.module';
import { DlqModule } from './common/queues/dlq.module';
import { ServiceProvidersModule } from './service-providers/service-providers.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ConsultationModule } from './consultation/consultation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { SocialModule } from './social/social.module';
import { DisputeModule } from './dispute/dispute.module';
import { FraudModule } from './fraud/fraud.module';
import { CatalogModule } from './catalog/catalog.module';
import { WalletModule } from './wallet/wallet.module';
import { VerificationModule } from './verification/verification.module';
import { PricingModule } from './pricing/pricing.module';
import { PayoutModule } from './payout/payout.module';
import { AvailabilityModule } from './availability/availability.module';
import { RefundModule } from './refund/refund.module';
import { CacheInvalidationModule } from './cache-invalidation/cache-invalidation.module';
import { EventsModule } from './events/events.module';
import { PartmanModule } from './common/partman/partman.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AstrologyModule } from './astrology/astrology.module';
import { SupportModule } from './support/support.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';
import { CostLockModule } from './common/cost-lock/cost-lock.module';
import { EncryptionModule } from './common/encryption/encryption.module';
import { KafkaDlqModule } from './kafka/kafka-dlq.module';
import { ReadAffinityMiddleware } from './common/middleware/read-affinity.middleware';
import { CsrfMiddleware } from './common/middleware/csrf.middleware'; // v9 (P1-3)

import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AdminPrefixGuard } from './common/guards/admin-prefix.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { MemoryMonitor } from './common/health/memory-monitor.service';

/**
 * Root module.
 *
 * Global providers registered via APP_* tokens:
 *   JwtAuthGuard          -- every route protected by default (@Public() to opt out)
 *   RolesGuard            -- enforces @Roles('admin') etc.
 *   AdminPrefixGuard      -- defense-in-depth: blocks /v1/admin/* without admin role
 *   ThrottlerGuard        -- 100 req/min/IP baseline (Redis-backed, multi-pod)
 *   HttpExceptionFilter   -- uniform { success:false, error, meta } envelope
 *   TransformInterceptor  -- uniform { success:true, data, meta } envelope
 *   LoggingInterceptor    -- structured JSON request logs
 *   CacheControlInterceptor -- sets Cache-Control header; falls back to 'no-store'
 *                              for routes without the @CacheControl() decorator
 *   MemoryMonitor         -- heap pressure alerts (auto-start via lifecycle hooks)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
      validate: validateEnv,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: config.get<number>('rateLimit.globalPerMinute', 100),
          },
        ],
        storage: new ThrottlerStorageRedisService({
          host: config.getOrThrow<string>('redis.host'),
          port: config.get<number>('redis.port', 6379),
          password: config.get<string>('redis.password'),
          tls: config.get<boolean>('redis.tls', false) ? {} : undefined,
          keyPrefix: 'rg:throttle:',
        }),
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('redis.host'),
          port: config.get<number>('redis.port', 6379),
          password: config.get<string>('redis.password'),
          tls: config.get<boolean>('redis.tls', false) ? {} : undefined,
        },
        prefix: 'rg:bull',
        defaultJobOptions: {
          attempts: 4,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { count: 1_000 },
          removeOnFail: { age: 7 * 24 * 3_600 },
        },
      }),
    }),

    // -- Structured JSON logging (nestjs-pino)
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('app.env') === 'production';
        return {
          pinoHttp: {
            level: isProd ? 'info' : 'debug',
            // In production: pure JSON; in dev: pino-pretty for humans
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
            // Redact PII and secrets from every log line.
            // Pino supports deep wildcard paths (*.token matches any depth).
            redact: {
              paths: [
                // Auth headers
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                // Request body â€” direct fields
                'req.body.password',
                'req.body.otp',
                'req.body.pin',
                'req.body.token',
                'req.body.refreshToken',
                'req.body.accessToken',
                'req.body.secret',
                // Nested wildcards â€” catch any serialised object that holds tokens
                '*.token',
                '*.refreshToken',
                '*.accessToken',
                '*.otp',
                '*.password',
                '*.secret',
                '*.apiKey',
                '*.api_key',
                // Phone / Aadhaar / PAN / Banking PII (PR7)
                'req.body.phone',
                'req.body.aadhaar',
                'req.body.pan',
                'req.body.email',
                'req.body.dob',
                'req.body.address',
                'req.body.birthPlace',
                'req.body.lat',
                'req.body.lng',
                'req.body.latitude',
                'req.body.longitude',
                'req.body.panCard',
                'req.body.bankAccount',
                'req.body.accountNumber',
                'req.body.ifsc',
                'req.body.upi',
                // Wildcard PII â€” catch nested serialised objects
                '*.email',
                '*.dob',
                '*.address',
                '*.birthPlace',
                '*.panCard',
                '*.pan',
                '*.aadhaar',
                '*.bankAccount',
                '*.accountNumber',
                '*.ifsc',
                '*.upi',
                '*.lat',
                '*.lng',
                '*.latitude',
                '*.longitude',
              ],
              censor: '[REDACTED]',  // replace value instead of removing key
            },
            // Attach request-id to every log line
            customProps: (req: import('http').IncomingMessage) => ({
              requestId: (req as any).headers['x-request-id'] ?? 'unknown',
            }),
            // Don't log noisy health-check / metrics traffic
            autoLogging: {
              ignore: (req: import('http').IncomingMessage) =>
                ['/health', '/metrics', '/favicon.ico'].includes(req.url ?? ''),
            },
            serializers: {
              req(req: any) {
                return {
                  id: req.id,
                  method: req.method,
                  url: req.url,
                  // Never log raw query strings â€” may contain tokens
                  query: req.query ? Object.keys(req.query) : undefined,
                };
              },
              res(res: any) {
                return { statusCode: res.statusCode };
              },
            },
          },
        };
      },
    }),

    // -- Infrastructure
    ScheduleModule.forRoot(),
    EventsModule,
    PartmanModule,
    RedisModule,
    OpenSearchModule,
    AlertsModule,
    EmailModule,
    AppCacheModule,
    CacheInvalidationModule,
    CircuitBreakerModule,
    FeatureFlagsModule,
    DlqModule,
    HealthModule,

    // -- Auth & identity
    AuthModule,
    OtpModule,
    UsersModule,
    ProfileModule,

    // -- Content
    TemplesModule,
    PlacesModule,
    PriestsModule,
    UploadsModule,
    FavoritesModule,
    ReportsModule,

    // -- Service providers & marketplace
    ServiceProvidersModule,
    BookingsModule,
    PaymentsModule,
    ReviewsModule,
    ConsultationModule,

    // -- Notifications & search
    NotificationsModule,
    SearchModule,

    // -- Social
    SocialModule,

    // -- Admin & analytics
    AdminModule,
    AnalyticsModule,

    // -- Catalog & marketplace config
    CatalogModule,

    // -- Wallet & payments
    WalletModule,

    // -- Provider onboarding
    VerificationModule,
    AvailabilityModule,

    // -- Financials
    PricingModule,
    PayoutModule,

    // -- Trust & safety
    DisputeModule,
    FraudModule,

    // -- Financial correctness
    RefundModule,

    // -- Astrology & support
    AstrologyModule,
    SupportModule,

    // -- RG AI assistant
    AiAssistantModule,

    // -- P0-5: Global daily cost-lock (AI + OTP spend hard caps)
    CostLockModule,
    EncryptionModule,     // @Global â€” provides EncryptionService to all modules
    KafkaDlqModule,
  ],
  providers: [
    { provide: APP_GUARD,       useClass: JwtAuthGuard },
    { provide: APP_GUARD,       useClass: RolesGuard },
    // Defense-in-depth: rejects any /v1/admin/* request that slips past
    // controller-level @UseGuards / @Roles decorators.
    { provide: APP_GUARD,       useClass: AdminPrefixGuard },
    { provide: APP_GUARD,       useClass: ThrottlerGuard },
    { provide: APP_FILTER,      useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    // Sets Cache-Control header on every response.
    // Routes decorated with @CacheControl('public, max-age=30 ...') get that
    // directive; all others get 'no-store' by default, which is safe.
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
    // Memory pressure monitor -- starts on module init, no explicit injection needed
    MemoryMonitor,
    // v9 (P1-3): registered so configure(consumer.apply(CsrfMiddleware)) can resolve it via DI.
    CsrfMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // v9 (P1-3 fix): CSRF middleware runs globally; self-exempts safe methods +
    // bootstrap auth endpoints + Razorpay webhook.
    consumer.apply(CsrfMiddleware).forRoutes('*');
    consumer.apply(ReadAffinityMiddleware).forRoutes('*');
  }
}

