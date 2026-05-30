import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AlertsService, AlertPayload } from './alerts.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockConfig = {
  get: jest.fn((key: string, def?: any) => def ?? null),
};

const mockHttp = {
  post: jest.fn().mockReturnValue(of({ data: 'ok', status: 200 })),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AlertsService', () => {
  let svc: AlertsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockImplementation((key: string, def?: any) => def ?? null);
    mockHttp.post.mockReturnValue(of({ data: 'ok', status: 200 }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: HttpService,   useValue: mockHttp },
      ],
    }).compile();

    svc = module.get<AlertsService>(AlertsService);
    // No Slack or Sentry configured by default
    (svc as any).slackWebhook       = undefined;
    (svc as any).sentryInitialized  = false;
    (svc as any).env                = 'test';
  });

  // ── fire — core ────────────────────────────────────────────────────────────

  describe('fire()', () => {
    const base: AlertPayload = {
      channel:  'generic',
      severity: 'info',
      message:  'Test alert',
    };

    it('resolves without throwing for info severity', async () => {
      await expect(svc.fire(base)).resolves.not.toThrow();
    });

    it('resolves without throwing for warn severity', async () => {
      await expect(svc.fire({ ...base, severity: 'warn' })).resolves.not.toThrow();
    });

    it('resolves without throwing for error severity', async () => {
      await expect(svc.fire({ ...base, severity: 'error' })).resolves.not.toThrow();
    });

    it('resolves without throwing for critical severity', async () => {
      await expect(svc.fire({ ...base, severity: 'critical' })).resolves.not.toThrow();
    });

    it('never throws even when Slack webhook throws (fire-and-forget)', async () => {
      (svc as any).slackWebhook = 'https://hooks.slack.com/services/test';
      mockHttp.post.mockReturnValue(throwError(() => new Error('Slack down')));

      await expect(
        svc.fire({ ...base, severity: 'critical' }),
      ).resolves.not.toThrow();
    });
  });

  // ── Slack integration ──────────────────────────────────────────────────────

  describe('Slack', () => {
    beforeEach(() => {
      (svc as any).slackWebhook = 'https://hooks.slack.com/services/test';
    });

    it('posts to Slack for critical severity when webhook is configured', async () => {
      await svc.fire({
        channel:  'fraud_critical',
        severity: 'critical',
        message:  'Critical fraud alert',
        context:  { userId: 'user-1', score: 95 },
      });

      expect(mockHttp.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test',
        expect.objectContaining({
          text: expect.stringContaining('fraud_critical'),
        }),
      );
    });

    it('does NOT post to Slack for non-critical severity', async () => {
      await svc.fire({
        channel:  'generic',
        severity: 'error', // not critical
        message:  'Some error',
      });

      expect(mockHttp.post).not.toHaveBeenCalled();
    });

    it('includes channel + message in Slack text', async () => {
      await svc.fire({
        channel:  'wallet_reconciliation',
        severity: 'critical',
        message:  '5 wallets frozen',
      });

      const [, body] = mockHttp.post.mock.calls[0];
      expect(body.text).toContain('wallet_reconciliation');
      expect(body.text).toContain('5 wallets frozen');
    });

    it('limits context fields to 10 in Slack attachment', async () => {
      const context: Record<string, string> = {};
      for (let i = 0; i < 15; i++) context[`key${i}`] = `val${i}`;

      await svc.fire({
        channel: 'generic', severity: 'critical', message: 'big context', context,
      });

      const [, body] = mockHttp.post.mock.calls[0];
      expect(body.attachments[0].fields.length).toBe(10);
    });
  });

  // ── payload shape ──────────────────────────────────────────────────────────

  describe('payload shape', () => {
    it('includes error name and message when Error is provided', async () => {
      // Spy on logger to capture the JSON entry
      const logSpy = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => {});
      const err = new Error('DB connection failed');

      await svc.fire({
        channel:  'generic',
        severity: 'error',
        message:  'Database error',
        error:    err,
      });

      const logged = logSpy.mock.calls[0][0] as string;
      const entry = JSON.parse(logged);
      expect(entry.error.name).toBe('Error');
      expect(entry.error.message).toBe('DB connection failed');
      expect(Array.isArray(entry.error.stack) || typeof entry.error.stack === 'string' || entry.error.stack === undefined).toBe(true);
    });

    it('includes correlationId in the log entry when provided', async () => {
      const logSpy = jest.spyOn((svc as any).logger, 'log').mockImplementation(() => {});

      await svc.fire({
        channel:       'generic',
        severity:      'info',
        message:       'Test',
        correlationId: 'req-abc-123',
      });

      const logged = logSpy.mock.calls[0][0] as string;
      const entry = JSON.parse(logged);
      expect(entry.correlationId).toBe('req-abc-123');
    });
  });
});
