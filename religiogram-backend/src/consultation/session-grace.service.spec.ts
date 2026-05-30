import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SessionGraceService, GraceState } from './session-grace.service';
import { RedisService } from '../redis/redis.service';
import { AlertsService } from '../common/alerts/alerts.service';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockDs = { query: jest.fn() };

const mockRedis = {
  get:            jest.fn().mockResolvedValue(null),
  setEx:          jest.fn().mockResolvedValue('OK'),
  del:            jest.fn().mockResolvedValue(1),
  setIfNotExists: jest.fn().mockResolvedValue(true),
  scan:           jest.fn().mockResolvedValue(['0', []]),
};

const mockAlerts = { fire: jest.fn().mockResolvedValue(undefined) };

// ── helpers ───────────────────────────────────────────────────────────────────

const SESSION_ID = 'sess-uuid-1';
const USER_ID    = 'user-uuid-1';

function makeGraceState(overrides: Partial<GraceState> = {}): GraceState {
  return {
    sessionId:        SESSION_ID,
    disconnectedSide: 'user',
    disconnectedAt:   Date.now() - 10_000,
    graceExpiresAt:   Date.now() - 1,   // already expired
    billedSeconds:    120,
    ...overrides,
  };
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('SessionGraceService', () => {
  let svc: SessionGraceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setEx.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.setIfNotExists.mockResolvedValue(true);
    mockRedis.scan.mockResolvedValue(['0', []]);
    mockDs.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionGraceService,
        { provide: getDataSourceToken(), useValue: mockDs },
        { provide: RedisService,          useValue: mockRedis },
        { provide: AlertsService,         useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<SessionGraceService>(SessionGraceService);
  });

  // ── startGrace ─────────────────────────────────────────────────────────────

  describe('startGrace()', () => {
    it('writes grace state to Redis with 90-second TTL', async () => {
      await svc.startGrace({
        sessionId: SESSION_ID, userId: USER_ID,
        side: 'user', billedSeconds: 180,
      });

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        `session:grace:${SESSION_ID}:${USER_ID}`,
        90,
        expect.any(String),
      );
    });

    it('stored JSON contains all required fields', async () => {
      await svc.startGrace({
        sessionId: SESSION_ID, userId: USER_ID,
        side: 'provider', billedSeconds: 60,
      });

      const [, , json] = mockRedis.setEx.mock.calls[0];
      const state = JSON.parse(json) as GraceState;
      expect(state.sessionId).toBe(SESSION_ID);
      expect(state.disconnectedSide).toBe('provider');
      expect(state.billedSeconds).toBe(60);
      expect(state.graceExpiresAt).toBeGreaterThan(Date.now() - 1000);
    });
  });

  // ── cancelGrace ────────────────────────────────────────────────────────────

  describe('cancelGrace()', () => {
    it('returns true when the grace key exists and is deleted', async () => {
      mockRedis.del.mockResolvedValueOnce(1);
      const result = await svc.cancelGrace(SESSION_ID, USER_ID);
      expect(result).toBe(true);
    });

    it('returns false when no grace key was present', async () => {
      mockRedis.del.mockResolvedValueOnce(0);
      const result = await svc.cancelGrace(SESSION_ID, USER_ID);
      expect(result).toBe(false);
    });

    it('calls del with the correct key', async () => {
      await svc.cancelGrace(SESSION_ID, USER_ID);
      expect(mockRedis.del).toHaveBeenCalledWith(`session:grace:${SESSION_ID}:${USER_ID}`);
    });
  });

  // ── getGraceState ──────────────────────────────────────────────────────────

  describe('getGraceState()', () => {
    it('returns null when no grace key exists', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const result = await svc.getGraceState(SESSION_ID, USER_ID);
      expect(result).toBeNull();
    });

    it('returns parsed GraceState when key exists', async () => {
      const state = makeGraceState({ disconnectedSide: 'provider' });
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(state));

      const result = await svc.getGraceState(SESSION_ID, USER_ID);
      expect(result).not.toBeNull();
      expect(result!.disconnectedSide).toBe('provider');
      expect(result!.billedSeconds).toBe(120);
    });
  });

  // ── handleGraceExpiry ──────────────────────────────────────────────────────

  describe('handleGraceExpiry()', () => {
    it('issues an UPDATE to end the consultation_sessions row', async () => {
      mockDs.query.mockResolvedValue(undefined);
      await svc.handleGraceExpiry(SESSION_ID, 240, 'user');

      const [updateSql, updateArgs] = mockDs.query.mock.calls[0];
      expect(updateSql).toContain('consultation_sessions');
      expect(updateSql).toContain("status = 'ended'");
      expect(updateArgs[2]).toBe(SESSION_ID);
    });

    it('inserts a billing_finalise event into consultation_events', async () => {
      mockDs.query.mockResolvedValue(undefined);
      await svc.handleGraceExpiry(SESSION_ID, 300, 'provider');

      const insertCall = mockDs.query.mock.calls.find(([sql]) =>
        String(sql).includes('consultation_events'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][1]).toContain('billing_finalise');
    });

    it('fires critical alert and does not throw when DB UPDATE fails', async () => {
      mockDs.query.mockRejectedValueOnce(new Error('DB timeout'));
      await expect(
        svc.handleGraceExpiry(SESSION_ID, 180, 'user'),
      ).resolves.not.toThrow();

      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical', channel: 'session_billing' }),
      );
    });
  });

  // ── acquireSessionLock / releaseSessionLock ────────────────────────────────

  describe('session lock', () => {
    it('acquireSessionLock returns true when lock is obtained', async () => {
      mockRedis.setIfNotExists.mockResolvedValueOnce(true);
      const result = await svc.acquireSessionLock(SESSION_ID);
      expect(result).toBe(true);
    });

    it('acquireSessionLock returns false when lock already held', async () => {
      mockRedis.setIfNotExists.mockResolvedValueOnce(false);
      const result = await svc.acquireSessionLock(SESSION_ID);
      expect(result).toBe(false);
    });

    it('releaseSessionLock deletes the lock key', async () => {
      await svc.releaseSessionLock(SESSION_ID);
      expect(mockRedis.del).toHaveBeenCalledWith(`session:active:${SESSION_ID}`);
    });
  });

  // ── checkSessionBalance ────────────────────────────────────────────────────

  describe('checkSessionBalance()', () => {
    it('returns canContinue=false when session is not found', async () => {
      mockDs.query.mockResolvedValueOnce([]); // no session row
      const result = await svc.checkSessionBalance(SESSION_ID, USER_ID);
      expect(result.canContinue).toBe(false);
    });

    it('returns canContinue=false when wallet is not found', async () => {
      mockDs.query
        .mockResolvedValueOnce([{ rate_per_minute: 100 }]) // session
        .mockResolvedValueOnce([]);                         // no wallet
      const result = await svc.checkSessionBalance(SESSION_ID, USER_ID);
      expect(result.canContinue).toBe(false);
    });

    it('returns canContinue=true and correct remainingSeconds when balance is positive', async () => {
      // rate=60 per minute = 1 per second; balance=300 → 300 seconds remaining
      mockDs.query
        .mockResolvedValueOnce([{ rate_per_minute: 60 }])
        .mockResolvedValueOnce([{ available: 300 }]);

      const result = await svc.checkSessionBalance(SESSION_ID, USER_ID);
      expect(result.canContinue).toBe(true);
      expect(result.remainingSeconds).toBe(300);
    });

    it('sets warning=true when remainingSeconds < 120', async () => {
      mockDs.query
        .mockResolvedValueOnce([{ rate_per_minute: 60 }])
        .mockResolvedValueOnce([{ available: 60 }]); // 60 seconds remaining

      const result = await svc.checkSessionBalance(SESSION_ID, USER_ID);
      expect(result.warning).toBe(true);
    });

    it('sets warning=false when remainingSeconds >= 120', async () => {
      mockDs.query
        .mockResolvedValueOnce([{ rate_per_minute: 60 }])
        .mockResolvedValueOnce([{ available: 600 }]); // 600 seconds

      const result = await svc.checkSessionBalance(SESSION_ID, USER_ID);
      expect(result.warning).toBe(false);
    });
  });

  // ── sweepExpiredGraces ─────────────────────────────────────────────────────

  describe('sweepExpiredGraces()', () => {
    it('exits early when distributed lease is not obtained', async () => {
      mockRedis.setIfNotExists.mockResolvedValueOnce(false);
      await svc.sweepExpiredGraces();
      expect(mockRedis.scan).not.toHaveBeenCalled();
    });

    it('skips keys whose grace has not yet expired', async () => {
      const futureState = makeGraceState({ graceExpiresAt: Date.now() + 100_000 });
      mockRedis.setIfNotExists.mockResolvedValueOnce(true);
      mockRedis.scan.mockResolvedValueOnce(['0', ['rg:session:grace:sess-1:user-1']]);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(futureState));

      await svc.sweepExpiredGraces();
      // del should not be called for a non-expired key
      expect(mockRedis.del).not.toHaveBeenCalledWith(
        expect.stringContaining('session:grace:sess-1:user-1'),
      );
    });

    it('calls handleGraceExpiry for an expired key', async () => {
      const expiredState = makeGraceState();
      mockRedis.setIfNotExists.mockResolvedValueOnce(true);
      mockRedis.scan.mockResolvedValueOnce(['0', ['rg:session:grace:sess-1:user-1']]);
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(expiredState));
      mockRedis.del.mockResolvedValueOnce(1);
      mockDs.query.mockResolvedValue(undefined);

      await svc.sweepExpiredGraces();

      // UPDATE to consultation_sessions should have been called
      const updateCall = mockDs.query.mock.calls.find(([sql]) =>
        String(sql).includes('consultation_sessions'),
      );
      expect(updateCall).toBeDefined();
    });

    it('skips keys with corrupt JSON', async () => {
      mockRedis.setIfNotExists.mockResolvedValueOnce(true);
      mockRedis.scan.mockResolvedValueOnce(['0', ['rg:session:grace:bad-key']]);
      mockRedis.get.mockResolvedValueOnce('not-valid-json{{{');

      await expect(svc.sweepExpiredGraces()).resolves.not.toThrow();
    });
  });
});
