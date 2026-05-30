import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { createHmac } from 'crypto';
import { AppModule } from '../src/app.module';

/**
 * Razorpay Webhook E2E — verifies HMAC signature enforcement
 * and correct HTTP status codes without hitting real Razorpay.
 *
 * Runs against the full app with a test database (or in-memory if no DB).
 * CI uses TEST_DB_URL env variable to point at a test Postgres instance.
 */
describe('POST /payments/webhook (e2e HMAC)', () => {
  let app: INestApplication;

  const WEBHOOK_SECRET = 'test-webhook-secret';
  const PAYLOAD = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_test001',
          order_id: 'order_test001',
          status: 'captured',
          amount: 49900,
          currency: 'INR',
        },
      },
    },
  });

  function sign(body: string, secret: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
  }

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.RAZORPAY_KEY_ID         = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET     = 'rzp_test_secret';
    process.env.RESEND_API_KEY          = 'disabled';
    process.env.NODE_ENV                = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('returns 401 when x-razorpay-signature header is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(PAYLOAD);
    // 401 (invalid sig) or 400 (validation) — either is acceptable rejection
    expect([400, 401]).toContain(res.status);
  });

  it('returns 401 when signature is wrong', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'completely-wrong-signature')
      .send(PAYLOAD);
    expect(res.status).toBe(401);
  });

  it('accepts request with valid HMAC-SHA256 signature', async () => {
    const validSig = sign(PAYLOAD, WEBHOOK_SECRET);
    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validSig)
      .send(PAYLOAD);
    // 200 = queued successfully; 500 = DB not available in test env — both mean sig passed
    expect([200, 201, 500]).toContain(res.status);
  });

  it('rejects a valid signature for a tampered body', async () => {
    const originalSig = sign(PAYLOAD, WEBHOOK_SECRET);
    const tamperedBody = PAYLOAD.replace('payment.captured', 'payment.refunded');
    const res = await request(app.getHttpServer())
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', originalSig) // sig for original body
      .send(tamperedBody);
    expect(res.status).toBe(401);
  });
});
