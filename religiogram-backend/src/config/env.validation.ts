import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  validateSync,
  ValidateIf,
} from 'class-validator';
import { plainToInstance, Transform } from 'class-transformer';

/**
 * Env validator — runs on boot, fails fast if anything required is missing.
 *
 * Rules:
 *   - In `development` missing optional secrets just log a warning.
 *   - In `production` every required secret MUST be present — a missing
 *     JWT private key or OTP secret would burn users silently.
 *   - Uses class-validator so we get structured, specific error messages
 *     ("MSG91_TEMPLATE_ID must be a string") instead of "undefined".
 */

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Transform(({ value }: { value: any }) => parseInt(value ?? '3000', 10))
  PORT: number = 3000;

  // ── Database ─────────────────────────────────────────────────
  @IsString()
  @MinLength(10)
  DATABASE_URL!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }: { value: any }) => (value ? parseInt(value, 10) : 20))
  DATABASE_POOL_SIZE: number = 20;

  // ── Redis ─────────────────────────────────────────────────────
  @IsString()
  REDIS_HOST!: string;

  @IsInt()
  @Transform(({ value }: { value: any }) => parseInt(value ?? '6379', 10))
  REDIS_PORT: number = 6379;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  // ── JWT (required in all envs — the app is useless without it) ──
  @IsString()
  @MinLength(100, {
    message:
      'JWT_PRIVATE_KEY must be a full PEM RSA key (generate with: openssl genrsa -out private.pem 2048)',
  })
  JWT_PRIVATE_KEY!: string;

  @IsString()
  @MinLength(100)
  JWT_PUBLIC_KEY!: string;

  // ── OTP ───────────────────────────────────────────────────────
  @IsString()
  @MinLength(32, {
    message:
      'OTP_SECRET must be ≥ 32 chars — generate with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  })
  OTP_SECRET!: string;

  // ── SMS / MSG91 ───────────────────────────────────────────────
  // Required unless SMS_PROVIDER=sns is set explicitly.
  @IsEnum(['msg91', 'sns'])
  SMS_PROVIDER: 'msg91' | 'sns' = 'msg91';

  @ValidateIf(
    (o: EnvVars) =>
      o.SMS_PROVIDER === 'msg91' && o.NODE_ENV === NodeEnv.Production,
  )
  @IsString({
    message:
      'MSG91_AUTH_KEY is required in production when SMS_PROVIDER=msg91',
  })
  MSG91_AUTH_KEY?: string;

  @ValidateIf(
    (o: EnvVars) =>
      o.SMS_PROVIDER === 'msg91' && o.NODE_ENV === NodeEnv.Production,
  )
  @IsString({
    message:
      'MSG91_TEMPLATE_ID is required — register a DLT-approved template on the MSG91 dashboard',
  })
  MSG91_TEMPLATE_ID?: string;

  @ValidateIf((o: EnvVars) => o.NODE_ENV === NodeEnv.Production)
  @IsString({
    message:
      'MSG91_SENDER_ID is required in production (DLT-registered 6-char ID, e.g. RELGRM)',
  })
  MSG91_SENDER_ID?: string;

  @IsOptional()
  @IsEnum(['sns'])
  SMS_FALLBACK_PROVIDER?: 'sns';

  // ── SNS (only required if SNS is primary or fallback) ─────────
  @ValidateIf(
    (o: EnvVars) =>
      o.SMS_PROVIDER === 'sns' || o.SMS_FALLBACK_PROVIDER === 'sns',
  )
  @IsString()
  AWS_SNS_REGION?: string;

  @ValidateIf(
    (o: EnvVars) =>
      (o.SMS_PROVIDER === 'sns' || o.SMS_FALLBACK_PROVIDER === 'sns') &&
      o.NODE_ENV === NodeEnv.Production,
  )
  @IsString({
    message: 'AWS_SNS_SENDER_ID required when SNS is enabled in production',
  })
  AWS_SNS_SENDER_ID?: string;

  @IsOptional()
  @IsEnum(['Transactional', 'Promotional'])
  AWS_SNS_SMS_TYPE: 'Transactional' | 'Promotional' = 'Transactional';

  // ── Google OAuth (production only) ────────────────────────────
  @ValidateIf((o: EnvVars) => o.NODE_ENV === NodeEnv.Production)
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @ValidateIf((o: EnvVars) => o.NODE_ENV === NodeEnv.Production)
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsUrl({ require_tld: false }) // allow localhost in dev
  @IsOptional()
  GOOGLE_CALLBACK_URL: string = 'http://localhost:3000/auth/google/callback';

  // ── S3 (production only) ──────────────────────────────────────
  @ValidateIf((o: EnvVars) => o.NODE_ENV === NodeEnv.Production)
  @IsString()
  AWS_S3_BUCKET?: string;

  // ── Razorpay ──────────────────────────────────────────────────
  // KEY_ID is public (safe to expose to frontend via /payments/order);
  // KEY_SECRET and WEBHOOK_SECRET must never leave the server.
  @IsString()
  @MinLength(8)
  RAZORPAY_KEY_ID!: string;

  @IsString()
  @MinLength(8)
  RAZORPAY_KEY_SECRET!: string;

  @IsString()
  @MinLength(8)
  RAZORPAY_WEBHOOK_SECRET!: string;

  // ── OpenSearch ────────────────────────────────────────────────
  @IsString()
  @MinLength(8)
  @IsOptional() // optional in dev, enforced at runtime for prod
  OPENSEARCH_USERNAME: string = 'admin';

  @IsString()
  @MinLength(8)
  @IsOptional()
  OPENSEARCH_PASSWORD: string = 'admin';

    // ── CORS ──────────────────────────────────────────────────────
  @IsString()
  CORS_ORIGINS!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }: { value: any }) => parseInt(value ?? '5', 10))
  OTP_SMS_HOURLY_CEILING: number = 5;

  // ── COST_LOCK (P0-5) — global daily spend hard caps ──────────
  // When daily AI spend in rupees hits COST_LOCK_AI_DAILY_RUPEES the AI service
  // degrades gracefully to Swiss Ephemeris + canned templates and pages the founder.
  // When OTP spend hits COST_LOCK_OTP_DAILY_RUPEES OTP sending is blocked for the day.
  // Set both to 0 to disable capping (not recommended for production).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }: { value: any }) => parseInt(value ?? '2000', 10))
  COST_LOCK_AI_DAILY_RUPEES: number = 2000;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }: { value: any }) => parseInt(value ?? '500', 10))
  COST_LOCK_OTP_DAILY_RUPEES: number = 500;

  // ── Telegram alerting (optional — falls back to log-only) ─────
  @IsOptional()
  @IsString()
  TELEGRAM_ALERT_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_ALERT_CHAT_ID?: string;

  // ── Alerts (all optional — they degrade to log-only) ──────────
  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  SLACK_ALERT_WEBHOOK_URL?: string;

  // ── Redis Cache (separate instance for HTTP caching) ────────
  @IsString()
  REDIS_CACHE_HOST!: string;

  @IsOptional()
  @IsInt()
  @Transform(({ value }: { value: any }) => parseInt(value ?? '6379', 10))
  REDIS_CACHE_PORT?: number = 6379;

  // ── Kafka ────────────────────────────────────────────────────
  @IsString()
  KAFKA_BROKERS!: string;

  // ── CDN ──────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  CDN_BASE_URL?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated as object, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
