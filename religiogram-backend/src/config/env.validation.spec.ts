import { validateEnv } from './env.validation';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Minimum valid env for development mode */
const VALID_DEV_ENV: Record<string, unknown> = {
  NODE_ENV:                 'development',
  PORT:                     '3000',
  DATABASE_URL:             'postgres://user:pass@localhost:5432/religiogram_dev',
  REDIS_HOST:               'localhost',
  REDIS_PORT:               '6379',
  JWT_PRIVATE_KEY:          '-----BEGIN RSA PRIVATE KEY-----\n' + 'A'.repeat(200) + '\n-----END RSA PRIVATE KEY-----',
  JWT_PUBLIC_KEY:           '-----BEGIN PUBLIC KEY-----\n' + 'B'.repeat(200) + '\n-----END PUBLIC KEY-----',
  OTP_SECRET:               'a'.repeat(48),  // ≥ 32 chars
  RAZORPAY_KEY_ID:          'rzp_test_abc123',
  RAZORPAY_KEY_SECRET:      'rzp_secret_abc',
  RAZORPAY_WEBHOOK_SECRET:  'webhook_secret',
  CORS_ORIGINS:             'http://localhost:8081',
  SMS_PROVIDER:             'msg91',
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('validateEnv()', () => {
  describe('valid development config', () => {
    it('returns validated object without throwing', () => {
      expect(() => validateEnv(VALID_DEV_ENV)).not.toThrow();
    });

    it('defaults PORT to 3000 when not provided', () => {
      const env = { ...VALID_DEV_ENV };
      delete env['PORT'];
      const result = validateEnv(env);
      expect(result.PORT).toBe(3000);
    });

    it('coerces PORT string to number', () => {
      const result = validateEnv({ ...VALID_DEV_ENV, PORT: '4000' });
      expect(result.PORT).toBe(4000);
    });

    it('defaults NODE_ENV to development', () => {
      const env = { ...VALID_DEV_ENV };
      delete env['NODE_ENV'];
      const result = validateEnv(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('defaults DATABASE_POOL_SIZE to 20 when absent', () => {
      const result = validateEnv(VALID_DEV_ENV);
      expect(result.DATABASE_POOL_SIZE).toBe(20);
    });

    it('defaults REDIS_PORT to 6379 when absent', () => {
      const env = { ...VALID_DEV_ENV };
      delete env['REDIS_PORT'];
      const result = validateEnv(env);
      expect(result.REDIS_PORT).toBe(6379);
    });

    it('defaults SMS_PROVIDER to "msg91"', () => {
      const env = { ...VALID_DEV_ENV };
      delete env['SMS_PROVIDER'];
      const result = validateEnv(env);
      expect(result.SMS_PROVIDER).toBe('msg91');
    });
  });

  describe('invalid configs — throws', () => {
    it('throws when DATABASE_URL is missing', () => {
      const env = { ...VALID_DEV_ENV };
      delete env['DATABASE_URL'];
      expect(() => validateEnv(env)).toThrow();
    });

    it('throws when DATABASE_URL is too short (< 10 chars)', () => {
      expect(() => validateEnv({ ...VALID_DEV_ENV, DATABASE_URL: 'short' })).toThrow();
    });

    it('throws when REDIS_HOST is missing', () => {
      const env = { ...VALID_DEV_ENV };
      delete env['REDIS_HOST'];
      expect(() => validateEnv(env)).toThrow();
    });

    it('throws when JWT_PRIVATE_KEY is too short', () => {
      expect(() => validateEnv({ ...VALID_DEV_ENV, JWT_PRIVATE_KEY: 'short' })).toThrow();
    });

    it('throws when JWT_PUBLIC_KEY is too short', () => {
      expect(() => validateEnv({ ...VALID_DEV_ENV, JWT_PUBLIC_KEY: 'short' })).toThrow();
    });

    it('throws when OTP_SECRET is shorter than 32 chars', () => {
      expect(() => validateEnv({ ...VALID_DEV_ENV, OTP_SECRET: 'tooshort' })).toThrow();
    });

    it('throws when NODE_ENV is an invalid value', () => {
      expect(() => validateEnv({ ...VALID_DEV_ENV, NODE_ENV: 'prod' })).toThrow();
    });

    it('throws when SMS_PROVIDER is an invalid value', () => {
      expect(() => validateEnv({ ...VALID_DEV_ENV, SMS_PROVIDER: 'twilio' })).toThrow();
    });

    it('throws when RAZORPAY_KEY_ID is too short', () => {
      expect(() => validateEnv({ ...VALID_DEV_ENV, RAZORPAY_KEY_ID: 'short' })).toThrow();
    });

    it('throws when CORS_ORIGINS is missing', () => {
      const env = { ...VALID_DEV_ENV };
      delete env['CORS_ORIGINS'];
      expect(() => validateEnv(env)).toThrow();
    });

    it('error message contains validation details', () => {
      const env = { ...VALID_DEV_ENV };
      delete env['DATABASE_URL'];
      let caught: Error | undefined;
      try { validateEnv(env); } catch (e) { caught = e as Error; }
      expect(caught).toBeDefined();
      expect(caught!.message).toContain('DATABASE_URL');
    });
  });

  describe('accepted NODE_ENV values', () => {
    for (const env of ['development', 'test', 'staging', 'production']) {
      it(`accepts NODE_ENV="${env}"`, () => {
        // production requires extra fields — skip deep validation for production in this test
        if (env === 'production') {
          // Just verify it doesn't throw for NODE_ENV itself (it will throw on missing prod secrets)
          const prodEnv = {
            ...VALID_DEV_ENV,
            NODE_ENV: env,
            MSG91_AUTH_KEY: 'msg91-auth-key-value',
            MSG91_TEMPLATE_ID: 'template-id-value',
            MSG91_SENDER_ID: 'RELGRM',
            GOOGLE_CLIENT_ID: 'gclient-id',
            GOOGLE_CLIENT_SECRET: 'gclient-secret',
            AWS_S3_BUCKET: 'my-s3-bucket',
          };
          expect(() => validateEnv(prodEnv)).not.toThrow();
        } else {
          expect(() => validateEnv({ ...VALID_DEV_ENV, NODE_ENV: env })).not.toThrow();
        }
      });
    }
  });
});
