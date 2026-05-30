import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { RiskScoringService, RiskAction } from './risk-scoring.service';
import { RedisService } from '../redis/redis.service';
import { AlertsService } from '../common/alerts/alerts.service';

// ── constants ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const IP      = '1.2.3.4';
const DEVICE  = 'device-abc';

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockRedis = {
  incr:   jest.fn().mockResolvedValue(1),   // default: 1st request
  expire: jest.fn().mockResolvedValue(1),
};

const mockAlerts = {
  fire: jest.fn().mockResolvedValue(undefined),
};

// dataSource.query is called for: checkAccountAge, checkDeviceFingerprint,
// getPriorScore, persistScore — we control them via ordered mockResolvedValueOnce
const mockDs = {
  query: jest.fn(),
};

// Helper: set up mockDs.query responses in order for a full assess() call.
// Order: checkAccountAge, checkDeviceFingerprint (optional), getPriorScore, persistScore
function setupDsQueries({
  accountAgeHours = 200,
  deviceSharedCount = 0,
  priorScore = 0,
  withDevice = true,
}: {
  accountAgeHours?: number;
  deviceSharedCount?: number;
  priorScore?: number;
  withDevice?: boolean;
} = {}) {
  mockDs.query
    .mockResolvedValueOnce([{ age_hours: accountAgeHours }])  // checkAccountAge
  if (withDevice) {
    mockDs.query
      .mockResolvedValueOnce([{ count: deviceSharedCount }]);  // checkDeviceFingerprint
  }
  mockDs.query
    .mockResolvedValueOnce([{ score: priorScore }])            // getPriorScore
    .mockResolvedValueOnce(undefined);                         // persistScore
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('RiskScoringService', () => {
  let svc: RiskScoringService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1); // default: low velocity

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskScoringService,
        { provide: getDataSourceToken(), useValue: mockDs },
        { provide: RedisService,         useValue: mockRedis },
        { provide: AlertsService,        useValue: mockAlerts },
      ],
    }).compile();

    svc = module.get<RiskScoringService>(RiskScoringService);
  });

  // ── scoreToAction thresholds ───────────────────────────────────────────────

  describe('assess() — action routing by score', () => {
    it('returns ALLOW when score is ≤ 30 (clean signals)', async () => {
      // incr = 1 (no velocity signals), account age > 24h, no device share, prior = 0
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 0, priorScore: 0 });

      const result = await svc.assess({
        userId: USER_ID, ipAddress: IP, deviceId: DEVICE, action: 'login',
      });

      expect(result.action).toBe(RiskAction.ALLOW);
      expect(result.score).toBeLessThanOrEqual(30);
    });

    it('returns STEP_UP_AUTH when score is 31–60', async () => {
      // new account (age < 24h) → weight 20; ip medium velocity → weight 15 = 35 → STEP_UP
      mockRedis.incr
        .mockResolvedValueOnce(30)  // ip velocity = 30 → medium (weight 15)
        .mockResolvedValueOnce(1)   // booking velocity = 1 → no signal
        .mockResolvedValueOnce(1);  // wallet velocity = 1 → no signal
      setupDsQueries({ accountAgeHours: 10, deviceSharedCount: 0, priorScore: 0 });

      const result = await svc.assess({
        userId: USER_ID, ipAddress: IP, deviceId: DEVICE, action: 'payment',
      });

      expect(result.action).toBe(RiskAction.STEP_UP_AUTH);
    });

    it('returns HOLD_FOR_REVIEW when score is 61–80', async () => {
      // booking high velocity (weight 30) + new account (weight 20) + ip medium (15) = 65
      mockRedis.incr
        .mockResolvedValueOnce(30)   // ip = 30 → medium (15)
        .mockResolvedValueOnce(15)   // booking = 15 → high (30)
        .mockResolvedValueOnce(1);   // wallet = 1 → no signal
      setupDsQueries({ accountAgeHours: 10, deviceSharedCount: 0, priorScore: 0 });

      const result = await svc.assess({
        userId: USER_ID, ipAddress: IP, deviceId: DEVICE, action: 'refund',
      });

      expect(result.action).toBe(RiskAction.HOLD_FOR_REVIEW);
    });

    it('returns BLOCK when score is > 80', async () => {
      // device shared ≥ 3 (weight 50) + wallet velocity (35) = 85
      mockRedis.incr
        .mockResolvedValueOnce(1)  // ip → null
        .mockResolvedValueOnce(1)  // booking → null
        .mockResolvedValueOnce(6); // wallet topup = 6 → high (35)
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 3, priorScore: 0 });

      const result = await svc.assess({
        userId: USER_ID, ipAddress: IP, deviceId: DEVICE, action: 'topup',
      });

      expect(result.action).toBe(RiskAction.BLOCK);
    });
  });

  // ── individual signal weights ─────────────────────────────────────────────

  describe('signal: IP velocity', () => {
    it('emits ip_high_velocity (weight 25) when count > 50', async () => {
      mockRedis.incr
        .mockResolvedValueOnce(51)  // ip > 50
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 0, priorScore: 0 });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });
      const sig = result.signals.find(s => s.name === 'ip_high_velocity');
      expect(sig).toBeDefined();
      expect(sig!.weight).toBe(25);
    });

    it('emits ip_medium_velocity (weight 15) when 20 < count ≤ 50', async () => {
      mockRedis.incr
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 0, priorScore: 0, withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });
      const sig = result.signals.find(s => s.name === 'ip_medium_velocity');
      expect(sig).toBeDefined();
      expect(sig!.weight).toBe(15);
    });

    it('emits no IP signal when count ≤ 20', async () => {
      mockRedis.incr.mockResolvedValue(5);
      setupDsQueries({ withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });
      expect(result.signals.find(s => s.name.startsWith('ip_'))).toBeUndefined();
    });
  });

  describe('signal: booking velocity', () => {
    it('emits booking_velocity_high (weight 30) when count > 10', async () => {
      mockRedis.incr
        .mockResolvedValueOnce(1)   // ip
        .mockResolvedValueOnce(11)  // booking > 10
        .mockResolvedValueOnce(1);  // wallet
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 0, withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'booking' });
      const sig = result.signals.find(s => s.name === 'booking_velocity_high');
      expect(sig!.weight).toBe(30);
    });

    it('emits booking_velocity_medium (weight 15) when 5 < count ≤ 10', async () => {
      mockRedis.incr
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(1);
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 0, withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'booking' });
      const sig = result.signals.find(s => s.name === 'booking_velocity_medium');
      expect(sig!.weight).toBe(15);
    });
  });

  describe('signal: wallet velocity', () => {
    it('emits wallet_topup_velocity (weight 35) when count > 5', async () => {
      mockRedis.incr
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(6); // wallet > 5
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 0, withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'topup' });
      const sig = result.signals.find(s => s.name === 'wallet_topup_velocity');
      expect(sig!.weight).toBe(35);
    });
  });

  describe('signal: account age', () => {
    it('emits new_account (weight 20) when account age < 24h', async () => {
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ accountAgeHours: 5, deviceSharedCount: 0, withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });
      const sig = result.signals.find(s => s.name === 'new_account');
      expect(sig).toBeDefined();
      expect(sig!.weight).toBe(20);
    });

    it('emits no age signal for accounts older than 24h', async () => {
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ accountAgeHours: 48, deviceSharedCount: 0, withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });
      expect(result.signals.find(s => s.name === 'new_account')).toBeUndefined();
    });
  });

  describe('signal: device fingerprint', () => {
    it('emits device_shared_multiple (weight 50) when ≥ 3 other accounts share device', async () => {
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 3, priorScore: 0 });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, deviceId: DEVICE, action: 'login' });
      const sig = result.signals.find(s => s.name === 'device_shared_multiple');
      expect(sig!.weight).toBe(50);
    });

    it('emits device_shared (weight 20) when 1–2 other accounts share device', async () => {
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 1, priorScore: 0 });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, deviceId: DEVICE, action: 'login' });
      const sig = result.signals.find(s => s.name === 'device_shared');
      expect(sig!.weight).toBe(20);
    });

    it('skips device check when deviceId is not provided', async () => {
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ accountAgeHours: 200, withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });
      expect(result.signals.find(s => s.name.startsWith('device_'))).toBeUndefined();
    });
  });

  // ── prior score decay ──────────────────────────────────────────────────────

  describe('prior score influence', () => {
    it('adds 30% of prior score to current score', async () => {
      // All fresh signals = 0 (low velocity, mature account, no device share)
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 0, priorScore: 50, withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });
      // prior = 50, contribution = floor(50 * 0.3) = 15
      expect(result.score).toBeGreaterThanOrEqual(15);
    });
  });

  // ── alerts ─────────────────────────────────────────────────────────────────

  describe('alerts on high score', () => {
    it('fires a critical alert when score ≥ 90', async () => {
      // wallet velocity high (35) + booking high (30) + new account (20) + ip high (25) = 110 → capped 100
      mockRedis.incr
        .mockResolvedValueOnce(51)  // ip high (25)
        .mockResolvedValueOnce(11)  // booking high (30)
        .mockResolvedValueOnce(6);  // wallet high (35)
      setupDsQueries({ accountAgeHours: 5, deviceSharedCount: 0, withDevice: false });

      await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'topup' });

      expect(mockAlerts.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'fraud_critical',
          severity: 'critical',
        }),
      );
    });

    it('does not fire alert when score < 90', async () => {
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ accountAgeHours: 200, deviceSharedCount: 0, withDevice: false });

      await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });
      expect(mockAlerts.fire).not.toHaveBeenCalled();
    });
  });

  // ── decayScores ────────────────────────────────────────────────────────────

  describe('decayScores()', () => {
    it('issues UPDATE query to decay old scores', async () => {
      mockDs.query.mockResolvedValueOnce(undefined);
      await svc.decayScores();
      expect(mockDs.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_risk_scores'),
      );
    });
  });

  // ── assessment shape ───────────────────────────────────────────────────────

  describe('assess() — result shape', () => {
    it('returns userId, score, action, signals, computedAt', async () => {
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ withDevice: false });

      const result = await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });

      expect(result.userId).toBe(USER_ID);
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.action).toBeDefined();
      expect(Array.isArray(result.signals)).toBe(true);
      expect(result.computedAt).toBeInstanceOf(Date);
    });

    it('persists the score to user_risk_scores', async () => {
      mockRedis.incr.mockResolvedValue(1);
      setupDsQueries({ withDevice: false });

      await svc.assess({ userId: USER_ID, ipAddress: IP, action: 'login' });

      const persistCall = mockDs.query.mock.calls.find(
        ([sql]: [string]) => sql.includes('INSERT INTO user_risk_scores'),
      );
      expect(persistCall).toBeDefined();
    });
  });
});
