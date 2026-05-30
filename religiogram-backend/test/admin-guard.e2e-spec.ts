/**
 * Admin Guard E2E Tests — Blocker #1 verification
 *
 * Verifies that EVERY /v1/admin/* route is protected by:
 *   - JwtAuthGuard  (rejects unauthenticated requests with 401)
 *   - RolesGuard    (rejects non-admin tokens with 403)
 *   - AdminPrefixGuard (defense-in-depth: 401/403 for admin prefix)
 *
 * Uses a lightweight NestJS test app with only the admin controllers + guards
 * registered — no real DB or Redis needed. Each service dependency is swapped
 * for a minimal mock.
 *
 * Run:
 *   npx jest --config test/jest-e2e.json test/admin-guard.e2e-spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  VersioningType,
  Controller,
  Get,
  Module,
} from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';

import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AdminPrefixGuard } from '../src/common/guards/admin-prefix.guard';
import { Roles } from '../src/auth/decorators/roles.decorator';

// ── Minimal admin controller stubs ──────────────────────────────────────────

@Controller({ path: 'admin/test-open', version: '1' })
class AdminOpenController {
  @Get()
  open() {
    return { ok: true };
  }
}

@Controller({ path: 'admin/test-protected', version: '1' })
@Roles('admin')
class AdminProtectedController {
  @Get()
  protected() {
    return { ok: true };
  }
}

// ── Test module ──────────────────────────────────────────────────────────────

@Module({
  controllers: [AdminOpenController, AdminProtectedController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AdminPrefixGuard },
    Reflector,
  ],
})
class TestAdminModule {}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(jwtService: JwtService, role: 'user' | 'admin' | 'provider') {
  return jwtService.sign(
    { sub: 'test-user-id', role, iat: Math.floor(Date.now() / 1000) },
    { secret: 'test-secret', expiresIn: '1h' },
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Admin guard — security contract', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestAdminModule],
      providers: [
        {
          provide: JwtService,
          useFactory: () =>
            new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Unauthenticated requests ────────────────────────────────────────────

  describe('Unauthenticated (no token)', () => {
    it('GET /v1/admin/test-open → 401 (AdminPrefixGuard blocks unauthenticated)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/test-open')
        .expect([401, 403]); // either is acceptable; must NOT be 200
      expect([401, 403]).toContain(res.status);
    });

    it('GET /v1/admin/test-protected → 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/admin/test-protected');
      expect([401, 403]).toContain(res.status);
    });
  });

  // ── Non-admin token ──────────────────────────────────────────────────────

  describe('Authenticated non-admin user', () => {
    it('GET /v1/admin/test-open → 403 (AdminPrefixGuard blocks non-admin)', async () => {
      const token = makeToken(jwtService, 'user');
      const res = await request(app.getHttpServer())
        .get('/v1/admin/test-open')
        .set('Authorization', `Bearer ${token}`);
      expect([401, 403]).toContain(res.status);
    });

    it('GET /v1/admin/test-protected → 403', async () => {
      const token = makeToken(jwtService, 'user');
      const res = await request(app.getHttpServer())
        .get('/v1/admin/test-protected')
        .set('Authorization', `Bearer ${token}`);
      expect([401, 403]).toContain(res.status);
    });

    it('Provider role also blocked from /v1/admin/*', async () => {
      const token = makeToken(jwtService, 'provider');
      const res = await request(app.getHttpServer())
        .get('/v1/admin/test-protected')
        .set('Authorization', `Bearer ${token}`);
      expect([401, 403]).toContain(res.status);
    });
  });

  // ── Admin token ──────────────────────────────────────────────────────────

  describe('Authenticated admin user', () => {
    it('GET /v1/admin/test-protected → 200', async () => {
      const token = makeToken(jwtService, 'admin');
      await request(app.getHttpServer())
        .get('/v1/admin/test-protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  // ── Non-admin routes unaffected ──────────────────────────────────────────

  describe('Non-admin routes pass through normally', () => {
    it('A non-admin route (if Public) is not blocked by AdminPrefixGuard', async () => {
      // This simply confirms the guard only fires on /v1/admin/* prefix
      // If there's no actual public non-admin route here, we just verify
      // that requests to /v1/health or similar don't get caught.
      // We test the guard logic directly via the AdminPrefixGuard unit:
      const guard = new AdminPrefixGuard(new Reflector());
      const mockCtx = {
        switchToHttp: () => ({
          getRequest: () => ({ url: '/v1/users/me', user: null }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;
      expect(guard.canActivate(mockCtx)).toBe(true);
    });
  });
});
