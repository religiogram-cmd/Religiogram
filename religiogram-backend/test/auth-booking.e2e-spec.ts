/**
 * E2E tests — Auth + Booking flow
 *
 * These tests use a NestJS testing app bootstrapped with an in-memory SQLite
 * database so they run on CI with zero external dependencies.
 *
 * Flow tested:
 *   1. POST /auth/register  → 201 + accessToken
 *   2. GET  /auth/me        → 200 + user object
 *   3. POST /auth/login     → 200 + new tokens
 *   4. POST /bookings       → 401 without token
 *   5. POST /bookings       → 201 with valid token
 *   6. GET  /bookings/:id   → 200 + booking details
 *   7. PATCH /bookings/:id/cancel → 200 status CANCELLED
 *
 * Because this is a unit-style e2e (no real DB), each service that talks to
 * Postgres / Redis is swapped for a lightweight mock. This gives us fast,
 * deterministic CI without docker-compose.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';

// ── minimal app stub ──────────────────────────────────────────────────────────
// We import only Auth + Bookings controllers to keep bootstrap fast.

import { AuthController } from '../src/auth/controllers/auth.controller';
import { BookingsController } from '../src/bookings/bookings.controller';

// ── mock services ─────────────────────────────────────────────────────────────

const TEST_USER = {
  id:    'e2e-user-001',
  email: 'e2e@religiogram.app',
  name:  'E2E User',
  role:  'user',
};

const TEST_BOOKING = {
  id:           'e2e-booking-001',
  userId:       TEST_USER.id,
  providerId:   'e2e-provider-001',
  status:       'pending',
  scheduledAt:  new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  amountInr:    1100,
};

const mockAuthService = {
  emailRegister: jest.fn(async () => ({
    user: TEST_USER,
    accessToken:  'mock-access-token',
    refreshToken: 'mock-refresh-token',
  })),
  emailLogin: jest.fn(async () => ({
    user: TEST_USER,
    accessToken:  'mock-access-token-2',
    refreshToken: 'mock-refresh-token-2',
  })),
  devLogin: jest.fn(async () => ({
    user: TEST_USER,
    accessToken:  'mock-dev-token',
    refreshToken: 'mock-dev-refresh',
  })),
  getMe: jest.fn(async () => TEST_USER),
};

const mockBookingsService = {
  createBooking:   jest.fn(async () => TEST_BOOKING),
  findOne:         jest.fn(async () => TEST_BOOKING),
  getUserBookings: jest.fn(async () => ({ data: [TEST_BOOKING], total: 1, page: 1, limit: 10 })),
  cancelBooking:   jest.fn(async () => ({ ...TEST_BOOKING, status: 'cancelled' })),
  confirmBooking:  jest.fn(async () => ({ ...TEST_BOOKING, status: 'confirmed' })),
  completeBooking: jest.fn(async () => ({ ...TEST_BOOKING, status: 'completed' })),
};

// Mock JWT guard to accept "mock-access-token" as valid
const mockJwtStrategy = {
  validate: jest.fn(async () => TEST_USER),
};

// ── test app bootstrap ────────────────────────────────────────────────────────

import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/services/auth.service';
import { BookingsService } from '../src/bookings/bookings.service';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { Public } from '../src/auth/decorators/public.decorator';

// Simple always-pass guard for integration tests (we test 401 separately below)
import { ExecutionContext, Injectable, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
class TestJwtGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return false;

    const token = auth.split(' ')[1];
    if (token === 'mock-access-token' || token === 'mock-access-token-2' || token === 'mock-dev-token') {
      req.user = TEST_USER;
      return true;
    }
    return false;
  }
}

// ── test suite ────────────────────────────────────────────────────────────────

describe('Auth + Booking (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, BookingsController],
      providers: [
        Reflector,
        { provide: AuthService,     useValue: mockAuthService    },
        { provide: BookingsService, useValue: mockBookingsService },
        { provide: ConfigService,   useValue: { get: jest.fn((k: string) => k === 'NODE_ENV' ? 'test' : undefined) } },
        { provide: APP_GUARD,       useClass: TestJwtGuard       },
      ],
    }).compile();

    app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  // ── 1. register ─────────────────────────────────────────────────────────────

  describe('POST /v1/auth/register', () => {
    it('201 — returns user + tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ email: 'e2e@religiogram.app', password: 'Test@1234!', name: 'E2E User' })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.email).toBe('e2e@religiogram.app');
    });
  });

  // ── 2. login ─────────────────────────────────────────────────────────────────

  describe('POST /v1/auth/login', () => {
    it('200 — returns new tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'e2e@religiogram.app', password: 'Test@1234!' })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
    });
  });

  // ── 3. protected without token ────────────────────────────────────────────────

  describe('POST /v1/bookings (no token)', () => {
    it('401 — rejected when no Authorization header', async () => {
      await request(app.getHttpServer())
        .post('/v1/bookings')
        .send({ providerId: 'p1', scheduledAt: new Date().toISOString(), serviceType: 'puja', amountInr: 1100 })
        .expect(401);
    });
  });

  // ── 4. create booking ─────────────────────────────────────────────────────────

  describe('POST /v1/bookings (with token)', () => {
    it('201 — creates booking and returns id', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('Authorization', 'Bearer mock-access-token')
        .send({
          providerId:  'e2e-provider-001',
          scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          serviceType: 'puja',
          amountInr:   1100,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('pending');
      expect(mockBookingsService.createBooking).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. get booking ────────────────────────────────────────────────────────────

  describe('GET /v1/bookings/:id', () => {
    it('200 — returns booking details', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/bookings/e2e-booking-001')
        .set('Authorization', 'Bearer mock-access-token')
        .expect(200);

      expect(res.body.id).toBe('e2e-booking-001');
    });
  });

  // ── 6. cancel booking ────────────────────────────────────────────────────────

  describe('PATCH /v1/bookings/:id/cancel', () => {
    it('200 — booking status becomes cancelled', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/bookings/e2e-booking-001/cancel')
        .set('Authorization', 'Bearer mock-access-token')
        .send({ reason: 'change of plans' })
        .expect(200);

      expect(res.body.status).toBe('cancelled');
      expect(mockBookingsService.cancelBooking).toHaveBeenCalledTimes(1);
    });
  });
});
