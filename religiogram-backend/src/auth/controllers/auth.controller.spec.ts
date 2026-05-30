import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockAuthService = {
  sendOtp:       jest.fn().mockResolvedValue(undefined),
  verifyOtp:     jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  loginWithGoogle: jest.fn().mockResolvedValue({
    tokens: { accessToken: 'at', refreshToken: 'rt' },
    isNewUser: false,
  }),
  refresh:    jest.fn().mockResolvedValue({ accessToken: 'at2', refreshToken: 'rt2' }),
  logout:     jest.fn().mockResolvedValue(undefined),
  logoutAll:  jest.fn().mockResolvedValue(undefined),
  emailRegister: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  emailLogin:    jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  devLogin:      jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
};

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    if (key === 'google.appRedirectScheme') return 'religiogram://auth';
    return def ?? null;
  }),
};

// ── helpers ───────────────────────────────────────────────────────────────────

function fakeReq(overrides: any = {}): any {
  return {
    headers: { 'user-agent': 'jest-agent', ...overrides.headers },
    ...overrides,
  };
}

const fakeUser = { id: 'user-1', jti: 'jti-1', role: 'seeker', deviceId: 'dev-1' };

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AuthController', () => {
  let ctrl: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService,    useValue: mockAuthService },
        { provide: ConfigService,  useValue: mockConfig },
      ],
    }).compile();

    ctrl = module.get<AuthController>(AuthController);
  });

  // ── sendOtp ───────────────────────────────────────────────────────────────

  describe('sendOtp()', () => {
    it('calls authService.sendOtp with phone + context', async () => {
      const dto  = { phone: '9876543210', deviceId: 'dev-abc' };
      const req  = fakeReq();
      const result = await ctrl.sendOtp(dto as any, '1.2.3.4', req);
      expect(mockAuthService.sendOtp).toHaveBeenCalledWith('9876543210', {
        ip: '1.2.3.4',
        userAgent: 'jest-agent',
        deviceId: 'dev-abc',
      });
      expect(result).toMatchObject({ message: 'OTP sent successfully', expiresIn: 300 });
    });

    it('always returns expiresIn=300 and resendAfter=30', async () => {
      const result = await ctrl.sendOtp({ phone: '9' } as any, '0.0.0.0', fakeReq());
      expect(result.expiresIn).toBe(300);
      expect(result.resendAfter).toBe(30);
    });
  });

  // ── verifyOtp ─────────────────────────────────────────────────────────────

  describe('verifyOtp()', () => {
    it('delegates to authService.verifyOtp and returns tokens', async () => {
      const dto = { phone: '9876543210', otp: '123456', deviceId: 'dev-1' };
      const result = await ctrl.verifyOtp(dto as any, '1.2.3.4', fakeReq());
      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith('9876543210', '123456', {
        ip: '1.2.3.4',
        userAgent: 'jest-agent',
        deviceId: 'dev-1',
      });
      expect(result).toHaveProperty('accessToken');
    });
  });

  // ── googleCallback ────────────────────────────────────────────────────────

  describe('googleCallback()', () => {
    it('returns a Redirect object with the app deep-link URL', async () => {
      const req = fakeReq({ user: { email: 'u@g.com', name: 'U' } });
      const result = await ctrl.googleCallback(req, '1.2.3.4', '');
      expect(result.statusCode).toBe(302);
      expect(result.url).toContain('religiogram://auth');
      expect(result.url).toContain('accessToken=');
      expect(result.url).toContain('refreshToken=');
      expect(result.url).toContain('isNewUser=');
    });

    it('encodes tokens in URL fragment (not query string)', async () => {
      const req = fakeReq({ user: { email: 'u@g.com' } });
      const result = await ctrl.googleCallback(req, '0.0.0.0', '');
      expect(result.url).toContain('#accessToken=');
    });
  });

  // ── refresh ───────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('delegates to authService.refresh with user + token + context', async () => {
      const dto = { refreshToken: 'rt-old', deviceId: 'dev-1' };
      await ctrl.refresh(fakeUser as any, dto as any, '1.2.3.4', fakeReq());
      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        fakeUser,
        'rt-old',
        expect.objectContaining({ ip: '1.2.3.4' }),
      );
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('calls authService.logout with userId and jti', async () => {
      await ctrl.logout(fakeUser as any);
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1', 'jti-1');
    });
  });

  describe('logoutAll()', () => {
    it('calls authService.logoutAll with userId', async () => {
      await ctrl.logoutAll(fakeUser as any);
      expect(mockAuthService.logoutAll).toHaveBeenCalledWith('user-1');
    });
  });

  // ── emailRegister ─────────────────────────────────────────────────────────

  describe('emailRegister()', () => {
    it('delegates to authService.emailRegister', async () => {
      const dto = { email: 'a@b.com', password: 'pass123', name: 'Alice' };
      const result = await ctrl.emailRegister(dto as any, '1.2.3.4', fakeReq());
      expect(mockAuthService.emailRegister).toHaveBeenCalledWith(
        'a@b.com', 'pass123', 'Alice',
        expect.objectContaining({ ip: '1.2.3.4' }),
      );
      expect(result).toHaveProperty('accessToken');
    });
  });

  // ── emailLogin ────────────────────────────────────────────────────────────

  describe('emailLogin()', () => {
    it('delegates to authService.emailLogin', async () => {
      const dto = { email: 'a@b.com', password: 'pass123' };
      const result = await ctrl.emailLogin(dto as any, '1.2.3.4', fakeReq());
      expect(mockAuthService.emailLogin).toHaveBeenCalledWith(
        'a@b.com', 'pass123',
        expect.objectContaining({ ip: '1.2.3.4' }),
      );
      expect(result).toHaveProperty('accessToken');
    });
  });

  // ── devLogin ──────────────────────────────────────────────────────────────

  describe('devLogin()', () => {
    it('delegates to authService.devLogin with default role=seeker', async () => {
      const dto = { email: 'dev@test.com', password: 'dev123' };
      await ctrl.devLogin(dto as any, '127.0.0.1', fakeReq());
      expect(mockAuthService.devLogin).toHaveBeenCalledWith(
        'dev@test.com', 'dev123', 'seeker',
        expect.any(Object),
      );
    });

    it('passes explicit role when provided', async () => {
      const dto = { email: 'admin@test.com', password: 'dev123', role: 'admin' };
      await ctrl.devLogin(dto as any, '127.0.0.1', fakeReq());
      expect(mockAuthService.devLogin).toHaveBeenCalledWith(
        'admin@test.com', 'dev123', 'admin',
        expect.any(Object),
      );
    });
  });
});
