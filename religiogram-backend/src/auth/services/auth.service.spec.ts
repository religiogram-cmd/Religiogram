import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { OtpService } from '../../otp/otp.service';
import { UsersService } from '../../users/users.service';
import { TokenService } from './token.service';
import { RedisService } from '../../redis/redis.service';
import { EmailService } from '../../email/email.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthEvent } from '../entities/auth-event.entity';
import { UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';

const USER_ID   = 'user-uuid-001';
const PHONE     = '+919876543210';
const EMAIL     = 'test@example.com';
const CTX       = { ip: '127.0.0.1', userAgent: 'Jest', deviceId: 'dev1' };
const MOCK_USER = { id: USER_ID, phone: PHONE, email: EMAIL, name: 'Test User', isActive: true, passwordHash: null };
const MOCK_TOKENS = { accessToken: 'acc.tok', refreshToken: 'ref.tok' };

const mockOtpService      = { generateAndSend: jest.fn(), verify: jest.fn() };
const mockUsersService    = {
  isBlocked: jest.fn().mockResolvedValue(false),
  findOrCreateByPhone: jest.fn().mockResolvedValue({ user: MOCK_USER, isNewUser: false }),
  findByEmail: jest.fn(),
  setPasswordHash: jest.fn(),
  updateProfile: jest.fn(),
  createEmailUser: jest.fn(),
};
const mockTokenService    = { issueTokenPair: jest.fn().mockResolvedValue(MOCK_TOKENS) };
const mockRedis           = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
const mockEmailService    = { sendWelcome: jest.fn().mockResolvedValue(undefined) };
const mockAuthEventRepo   = { save: jest.fn().mockResolvedValue({}), create: jest.fn().mockImplementation(d => d) };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: OtpService,                           useValue: mockOtpService },
        { provide: UsersService,                         useValue: mockUsersService },
        { provide: TokenService,                         useValue: mockTokenService },
        { provide: RedisService,                         useValue: mockRedis },
        { provide: EmailService,                         useValue: mockEmailService },
        { provide: getRepositoryToken(AuthEvent),        useValue: mockAuthEventRepo },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  // ── sendOtp ────────────────────────────────────────────────────────────────

  describe('sendOtp', () => {
    it('generates and sends OTP for a non-blocked user', async () => {
      mockUsersService.isBlocked.mockResolvedValue(false);
      await service.sendOtp(PHONE, CTX);
      expect(mockOtpService.generateAndSend).toHaveBeenCalledWith(PHONE);
      expect(mockAuthEventRepo.save).toHaveBeenCalled();
    });

    it('silently skips blocked users', async () => {
      mockUsersService.isBlocked.mockResolvedValue(true);
      await service.sendOtp(PHONE, CTX);
      expect(mockOtpService.generateAndSend).not.toHaveBeenCalled();
    });
  });

  // ── verifyOtp ──────────────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    it('returns auth response with tokens on valid OTP', async () => {
      mockOtpService.verify.mockResolvedValue(undefined);
      mockUsersService.findOrCreateByPhone.mockResolvedValue({ user: MOCK_USER, isNewUser: false });
      const result = await service.verifyOtp(PHONE, '123456', CTX);
      expect(result.tokens).toEqual(MOCK_TOKENS);
      expect(result.user.id).toBe(USER_ID);
    });

    it('propagates OTP verification errors', async () => {
      mockOtpService.verify.mockRejectedValue(new UnauthorizedException('Invalid OTP'));
      await expect(service.verifyOtp(PHONE, '000000', CTX)).rejects.toThrow(UnauthorizedException);
    });

    it('marks new users in the response', async () => {
      mockOtpService.verify.mockResolvedValue(undefined);
      mockUsersService.findOrCreateByPhone.mockResolvedValue({ user: MOCK_USER, isNewUser: true });
      const result = await service.verifyOtp(PHONE, '123456', CTX);
      expect(result.isNewUser).toBe(true);
    });
  });

  // ── emailRegister ──────────────────────────────────────────────────────────

  describe('emailRegister', () => {
    it('creates a new user and returns isNewUser=true', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.createEmailUser.mockResolvedValue({ ...MOCK_USER, email: EMAIL });
      const result = await service.emailRegister(EMAIL, 'Passw0rd!', 'Test User', CTX);
      expect(result.isNewUser).toBe(true);
      expect(mockUsersService.createEmailUser).toHaveBeenCalled();
    });

    it('throws ConflictException when email already has a password', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...MOCK_USER, passwordHash: 'existing-hash' });
      await expect(service.emailRegister(EMAIL, 'Passw0rd!', 'Test', CTX)).rejects.toThrow(ConflictException);
    });

    it('adds password to an existing Google-only account', async () => {
      const googleUser = { ...MOCK_USER, googleId: 'gid', passwordHash: null };
      mockUsersService.findByEmail.mockResolvedValue(googleUser);
      mockUsersService.setPasswordHash.mockResolvedValue({ ...googleUser, name: 'Test' });
      await service.emailRegister(EMAIL, 'Passw0rd!', 'Test', CTX);
      expect(mockUsersService.setPasswordHash).toHaveBeenCalledWith(googleUser.id, expect.any(String));
    });

    it('fires welcome email on new registration', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      const newUser = { ...MOCK_USER, email: EMAIL };
      mockUsersService.createEmailUser.mockResolvedValue(newUser);
      await service.emailRegister(EMAIL, 'Passw0rd!', 'Test User', CTX);
      // Allow async fire-and-forget to settle
      await new Promise(r => setImmediate(r));
      expect(mockEmailService.sendWelcome).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ role: 'seeker' }));
    });
  });

  // ── emailLogin ─────────────────────────────────────────────────────────────

  describe('emailLogin', () => {
    it('returns tokens on valid credentials', async () => {
      const userWithHash = { ...MOCK_USER, passwordHash: await import('bcryptjs').then(b => b.hash('Passw0rd!', 4)) };
      mockUsersService.findByEmail.mockResolvedValue(userWithHash);
      const result = await service.emailLogin(EMAIL, 'Passw0rd!', CTX);
      expect(result.tokens).toEqual(MOCK_TOKENS);
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      await expect(service.emailLogin(EMAIL, 'Passw0rd!', CTX)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const userWithHash = { ...MOCK_USER, passwordHash: await import('bcryptjs').then(b => b.hash('correct', 4)) };
      mockUsersService.findByEmail.mockResolvedValue(userWithHash);
      await expect(service.emailLogin(EMAIL, 'wrong', CTX)).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException for deactivated account', async () => {
      const userWithHash = { ...MOCK_USER, isActive: false, passwordHash: await import('bcryptjs').then(b => b.hash('Passw0rd!', 4)) };
      mockUsersService.findByEmail.mockResolvedValue(userWithHash);
      await expect(service.emailLogin(EMAIL, 'Passw0rd!', CTX)).rejects.toThrow(ForbiddenException);
    });
  });
});
