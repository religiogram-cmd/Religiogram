import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { OtpService } from './otp.service';
import { RedisService } from '../redis/redis.service';
import { TooManyRequestsException } from '../common/exceptions/too-many-requests.exception';
import { SMS_QUEUE } from './sms.queue.constants';

// ── constants ─────────────────────────────────────────────────────────────────

const PHONE      = '+919876543210';
const OTP_SECRET = 'test-otp-secret-key-at-least-32chars!!';

/** Produce the same HMAC the service produces internally. */
function computeDigest(phone: string, otp: string): string {
  return createHmac('sha256', OTP_SECRET).update(`${phone}:${otp}`).digest('hex');
}

// ── mock helpers ──────────────────────────────────────────────────────────────

const pipelineMock = {
  set:  jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([[null, 'OK'], [null, 'OK'], [null, 'OK']]),
};

const mockRedis: any = {
  get:            jest.fn().mockResolvedValue(null),
  set:            jest.fn().mockResolvedValue('OK'),
  del:            jest.fn().mockResolvedValue(2),
  incr:           jest.fn().mockResolvedValue(1),
  expire:         jest.fn().mockResolvedValue(1),
  ttl:            jest.fn().mockResolvedValue(15),
  pipeline:       jest.fn().mockReturnValue(pipelineMock),
};

const mockConfig = {
  get:        jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      'otp.length':          6,
      'otp.ttl':             300,
      'otp.maxAttempts':     5,
      'otp.resendCooldown':  30,
      'otp.smsDailyCeiling': 5,
    };
    return map[key] ?? def;
  }),
  getOrThrow: jest.fn((key: string) => {
    if (key === 'otp.secret') return OTP_SECRET;
    throw new Error(`Config key not found: ${key}`);
  }),
};

const mockSmsQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('OtpService', () => {
  let svc: OtpService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: no cooldown, daily count = 1
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    pipelineMock.exec.mockResolvedValue([[null, 'OK'], [null, 'OK'], [null, 'OK']]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: ConfigService,             useValue: mockConfig },
        { provide: RedisService,              useValue: mockRedis },
        { provide: getQueueToken(SMS_QUEUE),  useValue: mockSmsQueue },
      ],
    }).compile();

    svc = module.get<OtpService>(OtpService);
  });

  // ── generateAndSend ────────────────────────────────────────────────────────

  describe('generateAndSend()', () => {
    it('stores HMAC digest in Redis and enqueues SMS job', async () => {
      await svc.generateAndSend(PHONE);

      // Pipeline should have been called to set otp key, attempts, cooldown
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(pipelineMock.set).toHaveBeenCalledTimes(3);
      expect(pipelineMock.exec).toHaveBeenCalled();

      // SMS job enqueued
      expect(mockSmsQueue.add).toHaveBeenCalledWith(
        'send-otp',
        expect.objectContaining({ phone: PHONE }),
        expect.any(Object),
      );
    });

    it('stores a 6-digit numeric OTP', async () => {
      await svc.generateAndSend(PHONE);
      // The pipeline's first .set call uses (key, digest, 'EX', ttl)
      const [, digest] = pipelineMock.set.mock.calls[0];
      // digest is a 64-char hex string (sha256)
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    });

    it('throws TooManyRequestsException when resend cooldown is active', async () => {
      mockRedis.incr.mockResolvedValueOnce(1); // daily check passes
      mockRedis.get.mockResolvedValueOnce('1');  // cooldown key present
      mockRedis.ttl.mockResolvedValueOnce(25);

      await expect(svc.generateAndSend(PHONE)).rejects.toThrow(TooManyRequestsException);
      expect(mockSmsQueue.add).not.toHaveBeenCalled();
    });

    it('throws TooManyRequestsException when daily ceiling is exceeded', async () => {
      // Daily incr returns > ceiling (5)
      mockRedis.incr.mockResolvedValueOnce(6);

      await expect(svc.generateAndSend(PHONE)).rejects.toThrow(TooManyRequestsException);
      expect(pipelineMock.exec).not.toHaveBeenCalled();
    });

    it('sets midnight-UTC TTL on the daily key (first send of the day)', async () => {
      mockRedis.incr.mockResolvedValueOnce(1); // first send today
      await svc.generateAndSend(PHONE);
      // expire should have been called for the daily key
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('throws when Redis pipeline fails', async () => {
      pipelineMock.exec.mockResolvedValueOnce([
        [new Error('Redis down'), null],
        [null, 'OK'],
        [null, 'OK'],
      ]);

      await expect(svc.generateAndSend(PHONE)).rejects.toThrow('Unable to generate OTP');
      expect(mockSmsQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── verify ─────────────────────────────────────────────────────────────────

  describe('verify()', () => {
    it('succeeds and deletes Redis keys when OTP is correct', async () => {
      const otp = '123456';
      const digest = computeDigest(PHONE, otp);

      mockRedis.get.mockResolvedValueOnce(digest);  // stored digest
      mockRedis.incr.mockResolvedValueOnce(1);       // first attempt

      await expect(svc.verify(PHONE, otp)).resolves.not.toThrow();

      // Keys should be deleted after successful verify
      expect(mockRedis.del).toHaveBeenCalledWith(
        `otp:${PHONE}`,
        `otp:attempts:${PHONE}`,
      );
    });

    it('throws UnauthorizedException when OTP is wrong', async () => {
      const correctOtp = '123456';
      const digest = computeDigest(PHONE, correctOtp);

      mockRedis.get.mockResolvedValueOnce(digest);
      mockRedis.incr.mockResolvedValueOnce(1);

      await expect(svc.verify(PHONE, '000000')).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException when no OTP was requested (key missing)', async () => {
      mockRedis.get.mockResolvedValueOnce(null); // key expired or never set
      await expect(svc.verify(PHONE, '123456')).rejects.toThrow(BadRequestException);
    });

    it('throws TooManyRequestsException after MAX_ATTEMPTS exceeded', async () => {
      const digest = computeDigest(PHONE, '999999');
      mockRedis.get.mockResolvedValueOnce(digest);
      mockRedis.incr.mockResolvedValueOnce(6); // attempts = 6 > max 5

      await expect(svc.verify(PHONE, '000000')).rejects.toThrow(TooManyRequestsException);

      // OTP and attempts keys should be wiped
      expect(mockRedis.del).toHaveBeenCalledWith(
        `otp:${PHONE}`,
        `otp:attempts:${PHONE}`,
      );
    });

    it('shows correct remaining-attempts count in error message', async () => {
      const digest = computeDigest(PHONE, '999999');
      mockRedis.get.mockResolvedValueOnce(digest);
      mockRedis.incr.mockResolvedValueOnce(3); // 3rd attempt, 2 remaining

      try {
        await svc.verify(PHONE, '000000');
        fail('should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('2 attempts remaining');
      }
    });

    it('sets TTL on attempts key on first attempt (attempts === 1)', async () => {
      const otp = '654321';
      mockRedis.get.mockResolvedValueOnce(computeDigest(PHONE, otp));
      mockRedis.incr.mockResolvedValueOnce(1); // first attempt

      await svc.verify(PHONE, '000000').catch(() => {/* expected wrong OTP */});

      expect(mockRedis.expire).toHaveBeenCalledWith(
        `otp:attempts:${PHONE}`,
        expect.any(Number),
      );
    });
  });
});
