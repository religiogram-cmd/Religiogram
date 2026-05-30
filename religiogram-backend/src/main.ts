// MUST be the very first import — OTel patches http/https/pg/ioredis before
// NestJS requires them, ensuring outbound spans carry W3C traceparent headers.
import './tracing';

// reflect-metadata second so decorators still work correctly.
import 'reflect-metadata';

import * as Sentry from '@sentry/nestjs';

/**
 * P3-5: Sentry per-route tracesSampler.
 *
 * Money-path routes (/payments/, /wallet/, /bookings/) are sampled at 100 %
 * in production so every slow or failed transaction is captured.
 * All other routes use a 10 % sample rate to stay well inside Sentry's free
 * tier (100K transactions/month) while preserving full money-path visibility.
 * Dev/test keeps 100 % for local debugging.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampler(ctx) {
      if (process.env.NODE_ENV !== 'production') return 1.0;

      // ctx.name is the transaction name, e.g. "POST /v1/payments/webhook"
      const name: string = (ctx.name ?? '') as string;
      const moneyPath = /\/(payments|wallet|bookings|payouts)\//i;
      if (moneyPath.test(name)) {
        return 1.0; // 100 % — never miss a money-path trace
      }
      return 0.1;   // 10 % default
    },
    ignoreErrors: ['TooManyRequestsException', 'UnauthorizedException', 'NotFoundException'],
    // PR7: Scrub PII and secrets from every Sentry event before sending.
    // Patterns cover Aadhaar (12 digits), PAN (AAAAA0000A format), IFSC,
    // e-mail addresses, JWT/Bearer tokens, and phone numbers.
    beforeSend(event) {
      const PII_PATTERNS: [RegExp, string][] = [
        [/[2-9]{1}[0-9]{11}/g,                 '[AADHAAR]'],    // 12-digit Aadhaar
        [/[A-Z]{5}[0-9]{4}[A-Z]{1}/g,          '[PAN]'],        // PAN card
        [/[A-Z]{4}0[A-Z0-9]{6}/g,              '[IFSC]'],       // IFSC code
        [/[^\s@]+@[^\s@]+\.[^\s@]+/g,           '[EMAIL]'],      // e-mail
        [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[JWT]'], // JWT
        [/Bearer\s+[A-Za-z0-9_\-\.]+/gi,            '[BEARER]'],     // Bearer token
        [/[6-9]\d{9}/g,                         '[PHONE]'],      // Indian mobile
        [/pan[_\s]*card[:\s]*[A-Z0-9]{10}/gi,  '[PAN]'],        // pan: XXXXX
        [/ifsc[:\s]*[A-Z]{4}0[A-Z0-9]{6}/gi,   '[IFSC]'],       // ifsc: XXXX
      ];

      function scrubString(s: string): string {
        let result = s;
        for (const [pattern, replacement] of PII_PATTERNS) {
          result = result.replace(pattern, replacement);
        }
        return result;
      }

      function scrubValue(v: unknown): unknown {
        if (typeof v === 'string') return scrubString(v);
        if (Array.isArray(v)) return v.map(scrubValue);
        if (v && typeof v === 'object') {
          const out: Record<string, unknown> = {};
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            out[k] = scrubValue(val);
          }
          return out;
        }
        return v;
      }

      // Scrub exception messages + values
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = scrubString(ex.value);
          if (ex.stacktrace?.frames) {
            for (const frame of ex.stacktrace.frames ?? []) {
              if (frame.vars) frame.vars = scrubValue(frame.vars) as Record<string, unknown>;
            }
          }
        }
      }

      // Scrub breadcrumbs (Sentry v8: breadcrumbs is Breadcrumb[], not { values?: Breadcrumb[] })
      if (event.breadcrumbs?.length) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.message) crumb.message = scrubString(crumb.message);
          if (crumb.data)    crumb.data    = scrubValue(crumb.data) as Record<string, unknown>;
        }
      }

      // Scrub request body / URL
      if (event.request) {
        if (event.request.url)  event.request.url  = scrubString(event.request.url);
        if (event.request.data) event.request.data = scrubValue(event.request.data) as string;
        if (event.request.query_string) {
          event.request.query_string = scrubString(
            typeof event.request.query_string === 'string'
              ? event.request.query_string
              : JSON.stringify(event.request.query_string),
          );
        }
      }

      // Scrub extra / contexts
      if (event.extra)    event.extra    = scrubValue(event.extra)    as Record<string, unknown>;
      if (event.contexts) event.contexts = scrubValue(event.contexts) as Record<string, Record<string, unknown>>;
      if (event.tags)     event.tags     = scrubValue(event.tags)     as Record<string, string | number | boolean | null | bigint | symbol>;

      return event;
    },
  });
}

import cluster from 'node:cluster';
import os from 'node:os';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import compression from 'compression';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');  // P1-10 (v5)
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { attachPoolObserver } from './config/pool-observer';
import { AlertsService } from './common/alerts/alerts.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { LoadSheddingMiddleware } from './common/middleware/load-shedding.middleware';

const logger = new Logger('Bootstrap');

/* ─── Process-level safety net ────────────────────────────────────────────
 *  These catch async errors that escape all try/catch blocks and would
 *  otherwise silently swallow exceptions or crash the pod without a trace.
 * ─────────────────────────────────────────────────────────────────────── */
process.on('unhandledRejection', (reason: unknown) => {
  logger.error(
    `Unhandled promise rejection: ${reason instanceof Error ? reason.stack : String(reason)}`,
  );
  // Do NOT exit — NestJS + Express will handle the in-flight request
  // through the global exception filter. Exiting here would drop live traffic.
});

process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught exception: ${err.stack}`);
  // Uncaught exceptions leave the process in an undefined state.
  // Schedule a clean exit after flushing logs. The cluster master (or the
  // container orchestrator) will start a replacement worker immediately.
  setTimeout(() => process.exit(1), 500);
});

async function bootstrap(): Promise<void> {
  /* ── §4.3 Hard env-var enforcement ─────────────────────────────────────────
   *  Refuse to boot in production if any required secret is absent.
   *  Better to crash at startup with a clear message than to serve partial
   *  requests and discover the gap at 2 AM under live traffic.
   * ────────────────────────────────────────────────────────────────────────*/
  if (process.env.NODE_ENV === 'production') {
    const required = [
      'DATABASE_URL', 'REDIS_URL', 'JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY',
      'OTP_SECRET', 'REFRESH_TOKEN_HMAC_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET', 'GEMINI_API_KEY',
      'CORS_ORIGINS', 'COST_LOCK_OTP_DAILY_RUPEES',
      'COST_LOCK_AI_DAILY_RUPEES', 'WHATSAPP_API_TOKEN',
      'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET',
      'FIREBASE_SERVICE_ACCOUNT', 'SENTRY_DSN',
      // P1-6 / P3: encryption keys required for PII protection.
      // Without these, the AI orchestrator will refuse to decrypt birth profiles
      // and the payout service will refuse to encrypt bank account details.
      'BIRTH_PROFILE_ENCRYPTION_KEY', 'PAYOUT_ENCRYPTION_KEY',
      // TURN credentials required for WebRTC voice/video consultations.
      'TURN_HOST', 'TURN_SHARED_SECRET',
      // OpenSearch credentials required for search functionality.
      'OPENSEARCH_USERNAME', 'OPENSEARCH_PASSWORD',
      // Google OAuth callback URL required for social login.
      'GOOGLE_CALLBACK_URL',
      // ClamAV daemon host required for virus scanning uploaded files.
      // Set CLAMD_HOST='' only if intentionally disabling AV (documented security downgrade).
      'CLAMD_HOST',
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      console.error('FATAL: missing required env vars:', missing.join(', '));
      process.exit(1);
    }
    if (process.env.OTP_SECRET === process.env.JWT_PRIVATE_KEY) {
      console.error('FATAL: OTP_SECRET must differ from JWT_PRIVATE_KEY');
      process.exit(1);
    }
    if (process.env.REFRESH_TOKEN_HMAC_SECRET === process.env.OTP_SECRET) {
      console.error('FATAL: REFRESH_TOKEN_HMAC_SECRET must differ from OTP_SECRET (P0-4)');
      process.exit(1);
    }
    if ((process.env.REFRESH_TOKEN_HMAC_SECRET ?? '').length < 64) {
      console.error('FATAL: REFRESH_TOKEN_HMAC_SECRET must be >=64 chars (P0-4)');
      process.exit(1);
    }
    // P3-v36: Validate encryption key lengths at main.ts pre-flight for cleaner error messages.
    // (EncryptionService.onModuleInit also checks, but a main.ts check produces FATAL: lines.)
    if ((process.env.BIRTH_PROFILE_ENCRYPTION_KEY ?? '').length < 64) {
      console.error('FATAL: BIRTH_PROFILE_ENCRYPTION_KEY must be >=64 hex chars');
      process.exit(1);
    }
    if ((process.env.PAYOUT_ENCRYPTION_KEY ?? '').length < 64) {
      console.error('FATAL: PAYOUT_ENCRYPTION_KEY must be >=64 hex chars');
      process.exit(1);
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Razorpay webhook HMAC verification needs raw bytes
    bufferLogs: true,
  });

  // Replace NestJS default logger with pino (structured JSON)
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);

  // ── Trust proxy hops (v6 P3): env-tunable for CloudFront -> ALB topologies ──
  // Default 1 = ALB / nginx only. Set TRUST_PROXY_HOPS=2 if you're behind
  // CloudFront -> ALB (or any 2-hop chain) so req.ip resolves correctly past
  // both hops. Higher than 3 is almost never correct.
  app.set('trust proxy', Math.max(1, Math.min(3, parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10))));

  // ── Request-ID middleware — must be FIRST so all subsequent layers see it ──
  app.use(RequestIdMiddleware.middleware);

  // ── Load shedding — before security headers so it runs early ──
  const loadShedder = new LoadSheddingMiddleware();
  app.use(loadShedder.use.bind(loadShedder));

  // ── Security headers (HSTS, CSP, X-Frame, etc.) ──
  const secHeaders = new SecurityHeadersMiddleware(config);
  app.use(secHeaders.use.bind(secHeaders));

  // ── Security ──
  app.use(helmet({
    contentSecurityPolicy: false,      // custom SecurityHeadersMiddleware owns this
    crossOriginEmbedderPolicy: false,  // custom SecurityHeadersMiddleware owns this
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,    // custom SecurityHeadersMiddleware owns this
    hsts: false,                       // custom SecurityHeadersMiddleware owns this
    frameguard: false,                 // custom SecurityHeadersMiddleware owns this
  }));
  app.use(compression());
  app.use(cookieParser());  // P1-10 (v5)
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));

  // ── Validation ──
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,   // reject extra body fields with HTTP 400
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,      // collect all errors before returning
    }),
  );

  // ── URI versioning (/v1/…) ──
  app.enableVersioning({ type: VersioningType.URI });

  // ── CORS ──
  // P0-4: In production, CORS_ORIGINS MUST be explicitly set — never use wildcard.
  // Failing to set this in production means all origins are allowed, which is a
  // security risk for a financial-transaction app. Fail fast at startup instead.
  const allowedOrigins = config.get<string[]>('app.corsOrigins', []);
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && allowedOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS must be set in production. ' +
      'Example: CORS_ORIGINS=https://religiogram.in,https://app.religiogram.in',
    );
  }
  app.enableCors({
    // In dev/staging allow all origins for easy local development.
    // In production allowedOrigins is guaranteed non-empty by the guard above.
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    exposedHeaders: ['X-Request-Id'],
  });

  // ── Swagger (non-production only) ──
  if (process.env.NODE_ENV !== 'production') {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ReligioGram API')
      .setDescription('Spiritual services platform API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('auth').addTag('users').addTag('temples')
      .addTag('service-providers').addTag('bookings').addTag('payments')
      .addTag('reviews').addTag('consultation').addTag('notifications')
      .addTag('search').addTag('admin').addTag('social')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);

    // P3: Basic-auth gate for Swagger UI in staging.
    // Set SWAGGER_USER and SWAGGER_PASS in your staging .env.
    // If either is absent the UI is unprotected (safe only in local dev).
    const swaggerUser = process.env.SWAGGER_USER;
    const swaggerPass = process.env.SWAGGER_PASS;
    if ((swaggerUser && !swaggerPass) || (!swaggerUser && swaggerPass)) {
      logger.warn(
        'Swagger UI will be unprotected — both SWAGGER_USER and SWAGGER_PASS must be set to enable basic auth',
      );
    }
    if (swaggerUser && swaggerPass) {
      const expressApp = app.getHttpAdapter().getInstance();
      expressApp.use('/api/docs', (req: any, res: any, next: any) => {
        const authHeader: string | undefined = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Basic ')) {
          const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
          const [u, p] = decoded.split(':');
          if (
            u.length === swaggerUser.length &&
            p.length === swaggerPass.length &&
            crypto.timingSafeEqual(Buffer.from(u), Buffer.from(swaggerUser)) &&
            crypto.timingSafeEqual(Buffer.from(p), Buffer.from(swaggerPass))
          ) return next();
        }
        res.set('WWW-Authenticate', 'Basic realm="ReligioGram Swagger"');
        res.status(401).send('Unauthorised');
      });
    }

    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Swagger UI → /api/docs');
  }

  // ── DB pool observer ──
  const dataSource = app.get(DataSource);
  const alerts = app.get(AlertsService);
  attachPoolObserver(dataSource, alerts);

  // ── Enable shutdown hooks — NestJS calls onModuleDestroy() on SIGTERM ──
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3000);
  await app.listen(port);
  logger.log(
    `[Worker ${process.pid}] Listening on :${port} [${process.env.NODE_ENV ?? 'development'}]`,
  );

  /* ── Graceful shutdown ──────────────────────────────────────────────────
   *  When the container orchestrator sends SIGTERM:
   *    1. Stop accepting new connections
   *    2. Wait up to SHUTDOWN_TIMEOUT_MS for in-flight requests to finish
   *    3. Close DB pool + Redis connections (via NestJS lifecycle hooks)
   *    4. Exit cleanly
   *
   *  Without this, a rolling deploy kills pods mid-request, causing
   *  client-visible 502 / 504 errors.
   * ─────────────────────────────────────────────────────────────────────*/
  const shutdownTimeoutMs = config.get<number>('app.shutdownTimeoutMs', 15_000);

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received — starting graceful shutdown (${shutdownTimeoutMs}ms window)`);
    // Give the load balancer time to de-register this target before we
    // stop accepting connections. 2 s is enough for most ALB configs.
    await new Promise((r) => setTimeout(r, 2_000));
    await app.close();
    logger.log('Shutdown complete');
    process.exit(0);
  };

  // Force-exit if graceful shutdown hangs (e.g. a runaway connection).
  const forceExit = (signal: string) => {
    logger.error(`Force-exit after ${shutdownTimeoutMs}ms (${signal})`);
    process.exit(1);
  };

  process.once('SIGTERM', () => {
    (setTimeout(() => forceExit('SIGTERM'), shutdownTimeoutMs) as unknown as { unref(): void }).unref();
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    (setTimeout(() => forceExit('SIGINT'), shutdownTimeoutMs) as unknown as { unref(): void }).unref();
    void shutdown('SIGINT');
  });
}

/* Cluster mode ─────────────────────────────────────────────────────────────
 *  In production we fork one worker per CPU core via Node cluster so that
 *  all cores are utilised without running a separate PM2 config.
 *  Each worker calls bootstrap() independently — the OS load-balances
 *  incoming TCP connections across workers automatically (REUSEPORT).
 *  If a worker crashes, the primary forks a replacement immediately.
 * ─────────────────────────────────────────────────────────────────────── */
const useCluster =
  process.env.NODE_ENV === 'production' && process.env.CLUSTER !== 'false';

if (useCluster && cluster.isPrimary) {
  // Cap worker count to prevent DB connection pool exhaustion:
  // Each worker opens DATABASE_POOL_SIZE connections; PostgreSQL max_connections
  // is typically 100 (PgBouncer fronts it but the hard limit matters in tests).
  const poolSize  = parseInt(process.env.DATABASE_POOL_SIZE ?? '20', 10);
  const maxWorkers = Math.max(1, Math.floor(poolSize / 4)); // leave headroom for migrations, admin
  const cpus = Math.min(
    parseInt(process.env.WORKERS ?? String(os.cpus().length), 10),
    maxWorkers,
  );
  logger.log(`Primary ${process.pid} — forking ${cpus} workers (poolSize=${poolSize}, cap=${maxWorkers})`);
  for (let i = 0; i < cpus; i++) cluster.fork();
  cluster.on('exit', (_worker, code) => {
    if (code !== 0) process.nextTick(() => cluster.fork());
  });
} else {
  void bootstrap();
}
