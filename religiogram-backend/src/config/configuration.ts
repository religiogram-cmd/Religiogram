/**
 * Typed environment configuration.
 * In production, sensitive values (JWT keys, DB password, Google secret)
 * must come from AWS Secrets Manager -- never from .env files on the server.
 */
export default () => ({
  refreshTokenHmacSecret: process.env.REFRESH_TOKEN_HMAC_SECRET,
  app: {
    name: process.env.APP_NAME ?? 'religiogram-api',
    port: parseInt(process.env.PORT ?? '3000', 10),
    env: process.env.NODE_ENV ?? 'development',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((s: string) => s.trim()),
  },

  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DATABASE_DIRECT_URL,
    replicaUrl: process.env.DATABASE_REPLICA_URL,
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE ?? '20', 10),
    viaProxy: process.env.DATABASE_VIA_PROXY === 'true',
    ssl: process.env.DATABASE_SSL === 'true',
    statementTimeoutMs: parseInt(
      process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? '5000',
      10,
    ),
    slowAcquireMs: parseInt(
      process.env.DATABASE_SLOW_ACQUIRE_MS ?? '500',
      10,
    ),
  },

  redis: {
    host:             process.env.REDIS_HOST ?? 'localhost',
    port:             parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password:         process.env.REDIS_PASSWORD,
    tls:              process.env.REDIS_TLS === 'true',
    keyPrefix:        process.env.REDIS_KEY_PREFIX ?? 'rg:',
    sentinelHosts:    process.env.REDIS_SENTINEL_HOSTS,
    sentinelName:     process.env.REDIS_SENTINEL_NAME ?? 'mymaster',
    sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,
  },

  redisCluster: {
    nodes: process.env.REDIS_CLUSTER_NODES ?? '',
    natMap: process.env.REDIS_CLUSTER_NAT_MAP ?? '',
    password: process.env.REDIS_CLUSTER_PASSWORD ?? process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_CLUSTER_TLS === 'true',
  },

  redisCache: {
    host: process.env.REDIS_CACHE_HOST ?? process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_CACHE_PORT ?? process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_CACHE_PASSWORD ?? process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_CACHE_TLS === 'true',
  },

  jwt: {
    privateKey: (process.env.JWT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    publicKey: (process.env.JWT_PUBLIC_KEY ?? '').replace(/\\n/g, '\n'),
    issuer: process.env.JWT_ISSUER ?? 'https://auth.religiogram.com',
    audience: process.env.JWT_AUDIENCE ?? 'religiogram-api',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '604800', 10),
  },

  otp: {
    length: parseInt(process.env.OTP_LENGTH ?? '6', 10),
    ttl: parseInt(process.env.OTP_TTL ?? '300', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
    resendCooldown: parseInt(process.env.OTP_RESEND_COOLDOWN ?? '30', 10),
    secret: process.env.OTP_SECRET,
    smsDailyCeiling: parseInt(process.env.OTP_SMS_DAILY_CEILING ?? '5', 10),
    smsHourlyCeiling: parseInt(process.env.OTP_SMS_HOURLY_CEILING ?? '5', 10),
  },

  rateLimit: {
    sendOtpPhone: parseInt(process.env.RL_SEND_OTP_PHONE ?? '3', 10),
    sendOtpIp: parseInt(process.env.RL_SEND_OTP_IP ?? '10', 10),
    globalPerMinute: parseInt(process.env.RL_GLOBAL_PER_MIN ?? '100', 10),
  },

  sms: {
    provider: (process.env.SMS_PROVIDER ?? 'msg91') as 'msg91' | 'sns',
    processorConcurrency: parseInt(
      process.env.SMS_PROCESSOR_CONCURRENCY ?? '100',
      10,
    ),
    msg91Timeout: parseInt(process.env.MSG91_TIMEOUT_MS ?? '3000', 10),
    fallbackProvider: process.env.SMS_FALLBACK_PROVIDER as 'sns' | undefined,
    msg91: {
      authKey: process.env.MSG91_AUTH_KEY,
      senderId: process.env.MSG91_SENDER_ID ?? 'RELGRM',
      templateId: process.env.MSG91_TEMPLATE_ID,
      timeout: parseInt(process.env.MSG91_TIMEOUT_MS ?? '3000', 10),
    },
    sns: {
      region: process.env.AWS_SNS_REGION ?? process.env.AWS_REGION ?? 'ap-south-1',
      senderId: process.env.AWS_SNS_SENDER_ID ?? 'RELGRM',
      smsType: (process.env.AWS_SNS_SMS_TYPE ?? 'Transactional') as
        | 'Transactional'
        | 'Promotional',
    },
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    xAccountNumber: process.env.RAZORPAY_X_ACCOUNT_NUMBER ?? '',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
  },

  opensearch: {
    url: process.env.OPENSEARCH_URL ?? 'http://localhost:9200',
    username: process.env.OPENSEARCH_USERNAME ?? 'admin',
    password: process.env.OPENSEARCH_PASSWORD ?? 'admin',
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID ?? 'religiogram-api',
    groupId: process.env.KAFKA_GROUP_ID ?? 'religiogram-consumers',
    ssl: process.env.KAFKA_SSL === 'true',
  },

  storage: {
    bucket: process.env.S3_BUCKET ?? process.env.AWS_S3_BUCKET ?? 'religiogram-uploads',
    region: process.env.AWS_REGION ?? process.env.AWS_S3_REGION ?? 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    cdnBase: process.env.CDN_BASE_URL ?? process.env.STORAGE_PUBLIC_BASE_URL,
    /**
     * R2_ENDPOINT — Cloudflare R2 S3-compatible endpoint.
     *
     * When set, UploadsService routes all object storage through R2 instead
     * of AWS S3.  R2 has zero egress fees, which saves ~Rs 6,000/month on
     * user media at 1 lakh users (plan §4 variable cost).
     *
     * Format: https://<account_id>.r2.cloudflarestorage.com
     * Leave unset to use standard AWS S3 (existing behaviour).
     */
    r2Endpoint: process.env.R2_ENDPOINT,
  },

  /** ClamAV daemon connection (P1-3 virus scanning). */
  clamd: {
    // CLAMD_HOST — hostname/IP of the clamd sidecar. Leave unset to skip scanning.
    host: process.env.CLAMD_HOST,
    // CLAMD_PORT — default 3310 matches clamd's default TCP port.
    port: parseInt(process.env.CLAMD_PORT ?? '3310', 10),
  },

  thumbnails: {
    enabled:     process.env.THUMBNAIL_ENABLED !== 'false',
    functionArn: process.env.THUMBNAIL_FUNCTION_ARN ?? '',
    sizes: [80, 200, 400] as const,
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY ?? 'disabled',
    from: process.env.EMAIL_FROM ?? 'ReligioGram <noreply@religiogram.app>',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ??
      'http://localhost:3000/auth/google/callback',
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
  },

  featureFlags: {
    growthbookClientKey: process.env.GROWTHBOOK_CLIENT_KEY,
    growthbookApiHost:   process.env.GROWTHBOOK_API_HOST ?? 'https://cdn.growthbook.io',
    ENABLE_CHAT:          process.env.FF_ENABLE_CHAT          ?? 'true',
    ENABLE_BOOKING:       process.env.FF_ENABLE_BOOKING       ?? 'true',
    ENABLE_CONSULTATION:  process.env.FF_ENABLE_CONSULTATION  ?? 'true',
    ENABLE_DONATIONS:     process.env.FF_ENABLE_DONATIONS     ?? 'true',
    ENABLE_WALLET_TOPUP:  process.env.FF_ENABLE_WALLET_TOPUP  ?? 'true',
    ENABLE_ASYNC_FANOUT:  process.env.FF_ENABLE_ASYNC_FANOUT  ?? 'false',
  },

  // v9 (P0-3 fix): WebRTC + voice/video gating.
  consultation: {
    // Default OFF. Operator must explicitly enable after provisioning TURN
    // credentials and rolling out the matching frontend WebRTC build.
    voiceVideoEnabled: process.env.VOICE_VIDEO_ENABLED ?? 'false',
    // While voice/video is OFF the billing engine caps the per-minute rate
    // at this value (0 = free text chat).
    textOnlyPerMinPaise: parseInt(process.env.CONSULTATION_TEXT_ONLY_PER_MIN_PAISE ?? '0', 10),
    // Billing tick interval in milliseconds.  Production: 60000 (1 min).
    // Staging/test: set to 10000 or lower for faster billing integration tests.
    tickIntervalMs: parseInt(process.env.BILLING_TICK_INTERVAL_MS ?? '60000', 10),
  },

  // v9 (P0-3 fix): TURN credentials (coturn `use-auth-secret` pattern).
  turn: {
    host: process.env.TURN_HOST ?? '',
    sharedSecret: process.env.TURN_SHARED_SECRET ?? '',
    ttlSeconds: parseInt(process.env.TURN_TTL_SECONDS ?? '3600', 10),
  },

  // v9 (B-NEW-1 fix): refresh cookie path; tied to a single tight scope.
  auth: {
    refreshCookiePath: process.env.REFRESH_COOKIE_PATH ?? '/v1/auth/refresh',
    refreshTransport: process.env.REFRESH_TOKEN_TRANSPORT ?? 'cookie',
    devLoginPassword: process.env.DEV_LOGIN_PASSWORD ?? 'dev123',
  },

  // v9 (P1-3 fix): CSRF middleware ON by default.
  security: {
    csrfEnabled: process.env.CSRF_ENABLED ?? 'true',
  },

  encryption: {
    birthProfileKey: process.env.BIRTH_PROFILE_ENCRYPTION_KEY ?? '',
    payoutKey: process.env.PAYOUT_ENCRYPTION_KEY ?? '',
  },

  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL ?? '',
  },

  bullmq: {
    pushConcurrency: parseInt(process.env.PUSH_PROCESSOR_CONCURRENCY ?? '10', 10),
    smsConcurrency:  parseInt(process.env.SMS_PROCESSOR_CONCURRENCY  ?? '100', 10),
  },
});
