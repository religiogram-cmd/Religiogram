import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockAnalyticsService = {
  record: jest.fn().mockResolvedValue(undefined),
};

function fakeUser(id = 'user-1'): any { return { id }; }

function fakeReq(overrides: any = {}): any {
  return {
    ip: '1.2.3.4',
    socket: {},
    headers: { 'user-agent': 'test-agent' },
    ...overrides,
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('AnalyticsController', () => {
  let ctrl: AnalyticsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: mockAnalyticsService }],
    }).compile();

    ctrl = module.get<AnalyticsController>(AnalyticsController);
  });

  // ── event() ───────────────────────────────────────────────────────────────

  describe('event()', () => {
    it('returns { accepted: true }', async () => {
      const dto: any = { eventType: 'page_view' };
      const result = await ctrl.event(dto, fakeUser(), fakeReq());
      expect(result).toEqual({ accepted: true });
    });

    it('delegates to svc.record with userId and ip', async () => {
      const dto: any = { eventType: 'click' };
      await ctrl.event(dto, fakeUser('u-42'), fakeReq({ ip: '10.0.0.1' }));
      expect(mockAnalyticsService.record).toHaveBeenCalledWith(
        expect.objectContaining({ dto, userId: 'u-42', ip: '10.0.0.1' }),
      );
    });

    it('uses null for userId when user is null', async () => {
      const dto: any = { eventType: 'anonymous_view' };
      await ctrl.event(dto, null as any, fakeReq());
      const arg = mockAnalyticsService.record.mock.calls[0][0];
      expect(arg.userId).toBeNull();
    });

    it('extracts IP from X-Forwarded-For string header', async () => {
      const req = fakeReq({ headers: { 'x-forwarded-for': '5.5.5.5, 10.0.0.1' } });
      await ctrl.event({} as any, fakeUser(), req);
      const arg = mockAnalyticsService.record.mock.calls[0][0];
      expect(arg.ip).toBe('5.5.5.5');
    });

    it('extracts IP from X-Forwarded-For array header', async () => {
      const req = fakeReq({ headers: { 'x-forwarded-for': ['7.7.7.7', '8.8.8.8'] } });
      await ctrl.event({} as any, fakeUser(), req);
      const arg = mockAnalyticsService.record.mock.calls[0][0];
      expect(arg.ip).toBe('7.7.7.7');
    });

    it('falls back to req.ip when XFF absent', async () => {
      const req = fakeReq({ ip: '9.9.9.9', headers: {} });
      await ctrl.event({} as any, fakeUser(), req);
      const arg = mockAnalyticsService.record.mock.calls[0][0];
      expect(arg.ip).toBe('9.9.9.9');
    });

    it('passes userAgent from user-agent header', async () => {
      const req = fakeReq({ headers: { 'user-agent': 'Mozilla/5.0' } });
      await ctrl.event({} as any, fakeUser(), req);
      const arg = mockAnalyticsService.record.mock.calls[0][0];
      expect(arg.userAgent).toBe('Mozilla/5.0');
    });
  });
});
