import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InternalServerErrorException } from '@nestjs/common';
import { AlertsService } from '../common/alerts/alerts.service';

// ── Mock AWS SNS ───────────────────────────────────────────────────────────────

const mockSnsSend = jest.fn().mockResolvedValue({ MessageId: 'msg-id-1' });

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient:      jest.fn().mockImplementation(() => ({ send: mockSnsSend })),
  PublishCommand: jest.fn().mockImplementation((input: any) => ({ input })),
}));

import { SmsProviderService } from './sms-provider.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockAxiosPost = jest.fn().mockResolvedValue({ data: { type: 'success' } });

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      'sms.provider':         'msg91',
      'sms.fallbackProvider': undefined,
      'sms.msg91.authKey':    'msg91-auth-key',
      'sms.msg91.templateId': 'template-123',
      'sms.msg91.senderId':   'RELGRM',
      'sms.msg91.timeout':    3000,
      'app.env':              'development',
      'sms.sns.region':       'ap-south-1',
      'sms.sns.senderId':     'RELGRM',
      'sms.sns.smsType':      'Transactional',
    };
    return map[key] ?? def;
  }),
};

const mockHttp = {
  axiosRef: { post: mockAxiosPost },
};

const mockAlerts = { fire: jest.fn().mockResolvedValue(undefined) };

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SmsProviderService', () => {
  let svc: SmsProviderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAxiosPost.mockResolvedValue({ data: { type: 'success' } });
    mockSnsSend.mockResolvedValue({ MessageId: 'msg-id-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsProviderService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: HttpService,   useValue: mockHttp },
        { provide: AlertsService, useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<SmsProviderService>(SmsProviderService);
    svc.onModuleInit(); // would be called by NestJS lifecycle
  });

  // ── sendOtp via MSG91 ──────────────────────────────────────────────────────

  describe('sendOtp() via MSG91', () => {
    it('calls MSG91 API with the correct phone and template', async () => {
      await svc.sendOtp('9876543210', '482931');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.msg91.com/api/v5/otp',
        expect.objectContaining({
          mobile:      '919876543210',
          otp:         '482931',
          template_id: 'template-123',
          sender:      'RELGRM',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ authkey: 'msg91-auth-key' }),
        }),
      );
    });

    it('resolves without throwing on success', async () => {
      await expect(svc.sendOtp('9876543210', '111111')).resolves.not.toThrow();
    });

    it('prepends country code 91 to the mobile number', async () => {
      await svc.sendOtp('9012345678', '999999');
      const [, body] = mockAxiosPost.mock.calls[0];
      expect(body.mobile).toBe('919012345678');
    });

    it('skips MSG91 call (dev mode no-op) when authKey is empty', async () => {
      mockConfig.get.mockImplementation((key: string, def?: any) => {
        if (key === 'sms.msg91.authKey') return '';
        if (key === 'sms.provider') return 'msg91';
        return def ?? null;
      });

      // Re-create service with empty authKey
      const module = await Test.createTestingModule({
        providers: [
          SmsProviderService,
          { provide: ConfigService, useValue: mockConfig },
          { provide: HttpService,   useValue: mockHttp },
          { provide: AlertsService, useValue: mockAlerts },
        ],
      }).compile();
      const devSvc = module.get<SmsProviderService>(SmsProviderService);
      devSvc.onModuleInit();

      await devSvc.sendOtp('9876543210', '123456');
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });
  });

  // ── MSG91 fallback to SNS ──────────────────────────────────────────────────

  describe('MSG91 → SNS fallback', () => {
    beforeEach(() => {
      // Re-configure mock to simulate SNS fallback
      mockConfig.get.mockImplementation((key: string, def?: any) => {
        const map: Record<string, any> = {
          'sms.provider':         'msg91',
          'sms.fallbackProvider': 'sns',
          'sms.msg91.authKey':    'msg91-auth-key',
          'sms.msg91.templateId': 'template-123',
          'sms.msg91.senderId':   'RELGRM',
          'sms.msg91.timeout':    3000,
          'app.env':              'development',
          'sms.sns.region':       'ap-south-1',
          'sms.sns.senderId':     'RELGRM',
          'sms.sns.smsType':      'Transactional',
        };
        return map[key] ?? def;
      });
    });

    it('falls through to SNS when MSG91 throws and fallback=sns', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('MSG91 timeout'));

      await expect(svc.sendOtp('9876543210', '482931')).resolves.not.toThrow();
      expect(mockSnsSend).toHaveBeenCalled();
    });
  });

  // ── sendOtp via SNS ────────────────────────────────────────────────────────

  describe('sendOtp() via SNS', () => {
    beforeEach(() => {
      mockConfig.get.mockImplementation((key: string, def?: any) => {
        const map: Record<string, any> = {
          'sms.provider':     'sns',
          'app.env':          'development',
          'sms.sns.region':   'ap-south-1',
          'sms.sns.senderId': 'RELGRM',
          'sms.sns.smsType':  'Transactional',
        };
        return map[key] ?? def;
      });
    });

    it('calls SNS.send with E.164 phone number', async () => {
      await svc.sendOtp('9876543210', '482931');
      expect(mockSnsSend).toHaveBeenCalled();
      const [command] = mockSnsSend.mock.calls[0];
      expect(command.input.PhoneNumber).toBe('+919876543210');
    });

    it('does not prepend +91 when phone already starts with +', async () => {
      await svc.sendOtp('+919876543210', '482931');
      const [command] = mockSnsSend.mock.calls[0];
      expect(command.input.PhoneNumber).toBe('+919876543210');
    });

    it('includes OTP in message body', async () => {
      await svc.sendOtp('9876543210', '482931');
      const [command] = mockSnsSend.mock.calls[0];
      expect(command.input.Message).toContain('482931');
    });

    it('throws InternalServerErrorException when SNS.send fails', async () => {
      mockSnsSend.mockRejectedValueOnce(new Error('SNS failure'));
      await expect(svc.sendOtp('9876543210', '482931')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── onModuleInit validation ────────────────────────────────────────────────

  describe('onModuleInit() production validation', () => {
    it('does not throw in development mode with incomplete MSG91 config', () => {
      mockConfig.get.mockImplementation((key: string, def?: any) => {
        if (key === 'app.env') return 'development';
        if (key === 'sms.provider') return 'msg91';
        return def ?? null; // authKey/templateId/senderId all null
      });

      // Should not throw in dev
      expect(() => svc.onModuleInit()).not.toThrow();
    });

    it('throws in production when MSG91 DLT config is incomplete', () => {
      const prodModule = Test.createTestingModule({
        providers: [
          SmsProviderService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string, def?: any) => {
                if (key === 'app.env') return 'production';
                if (key === 'sms.provider') return 'msg91';
                if (key === 'sms.msg91.authKey') return '';    // missing
                if (key === 'sms.msg91.templateId') return ''; // missing
                return def ?? null;
              },
            },
          },
          { provide: HttpService,   useValue: mockHttp },
          { provide: AlertsService, useValue: mockAlerts },
        ],
      });

      // onModuleInit is called at compile time via NestJS lifecycle;
      // we call it directly on a constructed instance
      const svcInstance = new SmsProviderService(
        {
          get: (key: string, def?: any) => {
            if (key === 'app.env') return 'production';
            if (key === 'sms.provider') return 'msg91';
            if (key === 'sms.msg91.authKey') return '';
            if (key === 'sms.msg91.templateId') return '';
            if (key === 'sms.msg91.senderId') return '';
            return def ?? null;
          },
        } as any,
        mockHttp as any,
        mockAlerts as any,
      );
      expect(() => svcInstance.onModuleInit()).toThrow(/DLT config is incomplete/);
    });
  });
});
