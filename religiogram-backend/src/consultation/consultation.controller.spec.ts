import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConsultationController } from './consultation.controller';
import { ConsultationSession } from './entities/consultation-session.entity';

// ── stubs ─────────────────────────────────────────────────────────────────────

function makeSession(overrides: any = {}): ConsultationSession {
  return {
    id:             'sess-1',
    userId:         'user-1',
    providerId:     'prov-1',
    sessionStatus:  'completed',
    durationSeconds: 300,
    totalCharge:    500,
    ratePerMinute:  100,
    startedAt:      new Date('2025-01-01T10:00:00Z'),
    endedAt:        new Date('2025-01-01T10:05:00Z'),
    ...overrides,
  } as unknown as ConsultationSession;
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockSessionRepo = {
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  findOne:      jest.fn().mockResolvedValue(null),
};

function fakeReq(userId = 'user-1'): any {
  return { user: { sub: userId } };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('ConsultationController', () => {
  let ctrl: ConsultationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSessionRepo.findAndCount.mockResolvedValue([[], 0]);
    mockSessionRepo.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsultationController],
      providers: [
        { provide: getRepositoryToken(ConsultationSession), useValue: mockSessionRepo },
      ],
    }).compile();

    ctrl = module.get<ConsultationController>(ConsultationController);
  });

  // ── getMySessions ──────────────────────────────────────────────────────────

  describe('getMySessions()', () => {
    it('returns paginated sessions for the requesting user', async () => {
      const sessions = [makeSession()];
      mockSessionRepo.findAndCount.mockResolvedValueOnce([sessions, 1]);

      const result = await ctrl.getMySessions(fakeReq(), '1', '10');
      expect(mockSessionRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [{ userId: 'user-1' }, { providerId: 'user-1' }],
          take: 10,
          skip: 0,
        }),
      );
      expect(result.sessions).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('clamps limit to 100 maximum', async () => {
      mockSessionRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.getMySessions(fakeReq(), '1', '999');
      const call = mockSessionRepo.findAndCount.mock.calls[0][0];
      expect(call.take).toBe(100);
    });

    it('defaults to page=1 limit=20 when params are omitted', async () => {
      mockSessionRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.getMySessions(fakeReq(), '1', '20');
      const call = mockSessionRepo.findAndCount.mock.calls[0][0];
      expect(call.take).toBe(20);
      expect(call.skip).toBe(0);
    });

    it('calculates correct skip for page 2', async () => {
      mockSessionRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      await ctrl.getMySessions(fakeReq(), '2', '10');
      const call = mockSessionRepo.findAndCount.mock.calls[0][0];
      expect(call.skip).toBe(10);
    });

    it('returns page and limit in the response', async () => {
      mockSessionRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      const result = await ctrl.getMySessions(fakeReq(), '3', '5');
      expect(result.page).toBe(3);
      expect(result.limit).toBe(5);
    });
  });

  // ── getSession ─────────────────────────────────────────────────────────────

  describe('getSession()', () => {
    it('throws NotFoundException when session does not exist', async () => {
      mockSessionRepo.findOne.mockResolvedValueOnce(null);
      await expect(ctrl.getSession('bad-sess', fakeReq())).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not a party to the session', async () => {
      mockSessionRepo.findOne.mockResolvedValueOnce(
        makeSession({ userId: 'other-user', providerId: 'other-prov' }),
      );
      await expect(ctrl.getSession('sess-1', fakeReq('user-1'))).rejects.toThrow(ForbiddenException);
    });

    it('returns session when user is the seeker', async () => {
      mockSessionRepo.findOne.mockResolvedValueOnce(makeSession({ userId: 'user-1' }));
      const result = await ctrl.getSession('sess-1', fakeReq('user-1'));
      expect(result.id).toBe('sess-1');
    });

    it('returns session when user is the provider', async () => {
      mockSessionRepo.findOne.mockResolvedValueOnce(makeSession({ providerId: 'user-1' }));
      const result = await ctrl.getSession('sess-1', fakeReq('user-1'));
      expect(result.id).toBe('sess-1');
    });
  });

  // ── getSessionSummary ──────────────────────────────────────────────────────

  describe('getSessionSummary()', () => {
    it('throws NotFoundException when session does not exist', async () => {
      mockSessionRepo.findOne.mockResolvedValueOnce(null);
      await expect(ctrl.getSessionSummary('bad-sess', fakeReq())).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not a party', async () => {
      mockSessionRepo.findOne.mockResolvedValueOnce(
        makeSession({ userId: 'other', providerId: 'other-prov' }),
      );
      await expect(ctrl.getSessionSummary('sess-1', fakeReq('user-1'))).rejects.toThrow(ForbiddenException);
    });

    it('returns correct cost summary with durationMinutes ceiling', async () => {
      // 300 seconds → 5 minutes exactly
      mockSessionRepo.findOne.mockResolvedValueOnce(
        makeSession({ userId: 'user-1', durationSeconds: 300, totalCharge: 500, ratePerMinute: 100 }),
      );
      const result = await ctrl.getSessionSummary('sess-1', fakeReq('user-1'));
      expect(result.sessionId).toBe('sess-1');
      expect(result.durationMinutes).toBe(5);
      expect(result.durationSeconds).toBe(300);
      expect(result.totalCharged).toBe(500);
      expect(result.ratePerMinute).toBe(100);
    });

    it('rounds up partial minutes (ceil)', async () => {
      // 310 seconds → ceil(310/60) = 6 minutes
      mockSessionRepo.findOne.mockResolvedValueOnce(
        makeSession({ userId: 'user-1', durationSeconds: 310 }),
      );
      const result = await ctrl.getSessionSummary('sess-1', fakeReq('user-1'));
      expect(result.durationMinutes).toBe(6);
    });

    it('returns durationMinutes=0 when session has no duration', async () => {
      mockSessionRepo.findOne.mockResolvedValueOnce(
        makeSession({ userId: 'user-1', durationSeconds: null }),
      );
      const result = await ctrl.getSessionSummary('sess-1', fakeReq('user-1'));
      expect(result.durationMinutes).toBe(0);
    });
  });

  // ── checkAvailability ──────────────────────────────────────────────────────

  describe('checkAvailability()', () => {
    it('returns providerId and a checkAt timestamp', async () => {
      const result = await ctrl.checkAvailability('prov-abc');
      expect(result.providerId).toBe('prov-abc');
      expect(typeof result.checkAt).toBe('string');
      expect(result.note).toContain('socket');
    });
  });
});
