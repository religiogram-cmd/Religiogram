/**
 * P0-8 (v4): production-mode boot test.
 *
 * Boots the app with NODE_ENV=production and asserts that POST /v1/auth/dev-login
 * returns 404 — i.e. AuthDevModule was NOT registered. Without this gate a
 * single typo (NODE_ENV=PRODUCTION vs production) re-opens the route.
 *
 * Run with: NODE_ENV=production npm run test:e2e -- --testPathPattern=dev-login-prod
 */
import { Test } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Production mode (e2e): dev-login is hidden', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    // Provide minimum env vars main.ts requires.
    process.env.JWT_PRIVATE_KEY ??= 'test';
    process.env.JWT_PUBLIC_KEY ??= 'test';
    process.env.OTP_SECRET ??= 'a'.repeat(64);
    process.env.REFRESH_TOKEN_HMAC_SECRET ??= 'b'.repeat(64);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('POST /v1/auth/dev-login returns 404 in production', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/dev-login')
      .send({ email: 'x@test.com', password: 'whatever', role: 'admin' });
    expect(res.status).toBe(404);
  });
});
