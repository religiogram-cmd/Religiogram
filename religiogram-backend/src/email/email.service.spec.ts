import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

// ── mock Resend ────────────────────────────────────────────────────────────────

const mockEmailsSend = jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockEmailsSend },
  })),
}));

// ── config helpers ─────────────────────────────────────────────────────────────

function makeConfig(apiKey = 're_test_key'): Partial<ConfigService> {
  return {
    get: jest.fn((key: string, def?: any) => {
      const map: Record<string, any> = {
        'email.resendApiKey': apiKey,
        'email.from':         'ReligioGram <noreply@religiogram.app>',
        'app.url':            'https://religiogram.app',
      };
      return map[key] ?? def;
    }),
  } as any;
}

// ── booking data stub ──────────────────────────────────────────────────────────

function makeBookingData() {
  return {
    userName:     'Test User',
    providerName: 'Pandit Sharma',
    serviceType:  'Griha Pravesh',
    scheduledAt:  new Date('2025-06-01T10:00:00Z'),
    amountInr:    2500,
    bookingId:    'bk-uuid-123',
    cancelUrl:    'https://religiogram.app/bookings/bk-uuid-123/cancel',
  };
}

// ── suite ──────────────────────────────────────────────────────────────────────

describe('EmailService', () => {
  let svc: EmailService;

  // ── enabled service ────────────────────────────────────────────────────────

  describe('when API key is configured (enabled)', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockEmailsSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: makeConfig('re_test_key') },
        ],
      }).compile();

      svc = module.get<EmailService>(EmailService);
    });

    // ── sendBookingConfirmation ──────────────────────────────────────────────

    describe('sendBookingConfirmation()', () => {
      it('resolves without throwing', async () => {
        await expect(
          svc.sendBookingConfirmation('user@example.com', makeBookingData()),
        ).resolves.not.toThrow();
      });

      it('calls resend.emails.send once', async () => {
        await svc.sendBookingConfirmation('user@example.com', makeBookingData());
        expect(mockEmailsSend).toHaveBeenCalledTimes(1);
      });

      it('subject contains serviceType and providerName', async () => {
        await svc.sendBookingConfirmation('user@example.com', makeBookingData());
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.subject).toContain('Griha Pravesh');
        expect(opts.subject).toContain('Pandit Sharma');
      });

      it('html body contains bookingId', async () => {
        await svc.sendBookingConfirmation('user@example.com', makeBookingData());
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.html).toContain('bk-uuid-123');
      });

      it('html body contains providerName', async () => {
        await svc.sendBookingConfirmation('user@example.com', makeBookingData());
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.html).toContain('Pandit Sharma');
      });

      it('sets category tag to "booking"', async () => {
        await svc.sendBookingConfirmation('user@example.com', makeBookingData());
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.tags).toEqual(
          expect.arrayContaining([{ name: 'category', value: 'booking' }]),
        );
      });
    });

    // ── sendOtpFallback ──────────────────────────────────────────────────────

    describe('sendOtpFallback()', () => {
      it('resolves without throwing', async () => {
        await expect(
          svc.sendOtpFallback('user@example.com', {
            userName: 'Test', otp: '482931', expiresMinutes: 10,
          }),
        ).resolves.not.toThrow();
      });

      it('subject contains OTP', async () => {
        await svc.sendOtpFallback('user@example.com', {
          userName: 'Test', otp: '482931', expiresMinutes: 10,
        });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.subject).toContain('482931');
      });

      it('html body contains OTP', async () => {
        await svc.sendOtpFallback('user@example.com', {
          userName: 'Test', otp: '482931', expiresMinutes: 10,
        });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.html).toContain('482931');
      });

      it('html body contains expiry minutes', async () => {
        await svc.sendOtpFallback('user@example.com', {
          userName: 'Test', otp: '482931', expiresMinutes: 10,
        });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.html).toContain('10');
      });

      it('sets category tag to "auth"', async () => {
        await svc.sendOtpFallback('user@example.com', {
          userName: 'Test', otp: '482931', expiresMinutes: 10,
        });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.tags).toEqual(
          expect.arrayContaining([{ name: 'category', value: 'auth' }]),
        );
      });
    });

    // ── sendWelcome ──────────────────────────────────────────────────────────

    describe('sendWelcome()', () => {
      it('uses provider-onboarding URL for provider role', async () => {
        await svc.sendWelcome('provider@example.com', { userName: 'Pandit Ji', role: 'provider' });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.html).toContain('provider-onboarding');
        expect(opts.html).toContain('Complete your profile');
      });

      it('uses /home URL for seeker role', async () => {
        await svc.sendWelcome('seeker@example.com', { userName: 'Ram', role: 'seeker' });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.html).toContain('/home');
        expect(opts.html).toContain('Explore ReligioGram');
      });

      it('subject includes userName', async () => {
        await svc.sendWelcome('user@example.com', { userName: 'Arjun', role: 'seeker' });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.subject).toContain('Arjun');
      });
    });

    // ── sendBookingCancellation ──────────────────────────────────────────────

    describe('sendBookingCancellation()', () => {
      it('resolves without throwing', async () => {
        await expect(
          svc.sendBookingCancellation('user@example.com', {
            userName: 'Test', providerName: 'Pandit', serviceType: 'Puja',
            scheduledAt: new Date(), refundInr: 1000, bookingId: 'bk-1',
          }),
        ).resolves.not.toThrow();
      });

      it('includes refund amount in body when refundInr > 0', async () => {
        await svc.sendBookingCancellation('user@example.com', {
          userName: 'Test', providerName: 'Pandit', serviceType: 'Puja',
          scheduledAt: new Date(), refundInr: 500, bookingId: 'bk-1',
        });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.html).toContain('refunded');
      });
    });

    // ── sendPayoutNotification ───────────────────────────────────────────────

    describe('sendPayoutNotification()', () => {
      it('resolves without throwing', async () => {
        await expect(
          svc.sendPayoutNotification('provider@example.com', {
            providerName: 'Pandit', amountInr: 5000,
            utrNumber: 'UTR123456', bankLast4: '4321',
            payoutDate: new Date(),
          }),
        ).resolves.not.toThrow();
      });

      it('subject contains amount', async () => {
        await svc.sendPayoutNotification('provider@example.com', {
          providerName: 'Pandit', amountInr: 5000,
          utrNumber: 'UTR123456', bankLast4: '4321',
          payoutDate: new Date(),
        });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.subject).toContain('5,000');
      });
    });

    // ── sendKycStatus ────────────────────────────────────────────────────────

    describe('sendKycStatus()', () => {
      it('approved: subject says approved', async () => {
        await svc.sendKycStatus('user@example.com', { userName: 'Test', status: 'approved' });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.subject.toLowerCase()).toContain('approved');
      });

      it('rejected: subject says needs attention', async () => {
        await svc.sendKycStatus('user@example.com', {
          userName: 'Test', status: 'rejected', rejectionReason: 'Blurry image',
        });
        const [opts] = mockEmailsSend.mock.calls[0];
        expect(opts.subject).toContain('needs attention');
      });
    });

    // ── send() is non-fatal ──────────────────────────────────────────────────

    describe('send() non-fatal behaviour', () => {
      it('does not throw when resend.emails.send rejects', async () => {
        mockEmailsSend.mockRejectedValueOnce(new Error('Resend API down'));

        await expect(
          svc.sendBookingConfirmation('user@example.com', makeBookingData()),
        ).resolves.not.toThrow();
      });

      it('does not throw when resend returns an error object', async () => {
        mockEmailsSend.mockResolvedValueOnce({
          data: null,
          error: { name: 'validation_error', message: 'Invalid email' },
        });

        await expect(
          svc.sendBookingConfirmation('user@example.com', makeBookingData()),
        ).resolves.not.toThrow();
      });
    });
  });

  // ── disabled service (no API key) ──────────────────────────────────────────

  describe('when API key is absent (disabled)', () => {
    beforeEach(async () => {
      jest.clearAllMocks();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: makeConfig('') },
        ],
      }).compile();

      svc = module.get<EmailService>(EmailService);
    });

    it('does not call resend.emails.send for booking confirmation', async () => {
      await svc.sendBookingConfirmation('user@example.com', makeBookingData());
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });

    it('does not call resend.emails.send for OTP', async () => {
      await svc.sendOtpFallback('user@example.com', {
        userName: 'Test', otp: '123456', expiresMinutes: 5,
      });
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });

    it('does not call resend.emails.send for welcome', async () => {
      await svc.sendWelcome('user@example.com', { userName: 'Test', role: 'seeker' });
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });
  });

  // ── disabled: "disabled" literal key ──────────────────────────────────────

  describe('when API key is the string "disabled"', () => {
    beforeEach(async () => {
      jest.clearAllMocks();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: makeConfig('disabled') },
        ],
      }).compile();

      svc = module.get<EmailService>(EmailService);
    });

    it('does not call resend.emails.send', async () => {
      await svc.sendBookingConfirmation('user@example.com', makeBookingData());
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });
  });
});
