import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConsultationBillingService } from './consultation-billing.service';
import { SessionBillingTick, TickStatus } from './entities/session-billing-tick.entity';
import { WalletService } from '../wallet/wallet.service';
import { RedisService } from '../redis/redis.service';

// ── helpers ──────────────────────────────────────────────────────────────────

const SESSION  = 'sess-abc-123';
const USER_ID  = 'user-1';
const PROV_ID  = 'prov-1';
const BOOKING  = 'book-1';
const RATE     = 5000; // ₹50/min in paise

function makeRedisState(overrides: Partial<Record<string, string>> = {}) {
  return {
    userId:           USER_ID,
    providerId:       PROV_ID,
    bookingId:        BOOKING,
    pricePerMinPaise: String(RATE),
    startedAt:        new Date(Date.now() - 90_000).toISOString(), // 90 s ago
    totalSeconds:     '0',
    lastTickAt:       '',
    ...overrides,
  };
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockHashMap: Record<string, Record<string, string>> = {};

const mockRedisClient = {
  hset:    jest.fn().mockResolvedValue(1),
  hget:    jest.fn().mockResolvedValue(null),
  hgetall: jest.fn().mockImplementation((key: string) => Promise.resolve(mockHashMap[key] ?? null)),
  hincrby: jest.fn().mockResolvedValue(1),
  scan:    jest.fn().mockResolvedValue(['0', []]),
  options: { keyPrefix: '' },
};

const mockRedis = {
  getClient:     jest.fn().mockReturnValue(mockRedisClient),
  expire:        jest.fn().mockResolvedValue(1),
  del:           jest.fn().mockResolvedValue(1),
  exists:        jest.fn().mockResolvedValue(true),
  setIfNotExists:jest.fn().mockResolvedValue(true),
  scan:          jest.fn().mockResolvedValue(['0', []]),
};

const mockTick = { id: 'tick-1', sessionId: SESSION, tickMinute: 1, status: TickStatus.PENDING };

const mockTicksRepo = {
  find:     jest.fn().mockResolvedValue([]),
  findOne:  jest.fn().mockResolvedValue(null),
  create:   jest.fn().mockReturnValue(mockTick),
  save:     jest.fn().mockResolvedValue(mockTick),
  update:   jest.fn().mockResolvedValue({ affected: 1 }),
};

const mockWallet = {
  debit: jest.fn().mockResolvedValue({ success: true, insufficientFunds: false, newBalance: 50000 }),
};

const mockEvents = {
  emit: jest.fn(),
};

// ── test suite ────────────────────────────────────────────────────────────────

describe('ConsultationBillingService', () => {
  let svc: ConsultationBillingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(mockHashMap).forEach(k => delete mockHashMap[k]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationBillingService,
        { provide: getRepositoryToken(SessionBillingTick), useValue: mockTicksRepo },
        { provide: WalletService,  useValue: mockWallet },
        { provide: EventEmitter2,  useValue: mockEvents },
        { provide: RedisService,   useValue: mockRedis },
      ],
    }).compile();

    svc = module.get<ConsultationBillingService>(ConsultationBillingService);
  });

  // ── startBilling ────────────────────────────────────────────────────────────

  describe('startBilling()', () => {
    it('writes billing state to Redis and starts an interval', async () => {
      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        `session:billing:${SESSION}`,
        expect.objectContaining({ userId: USER_ID, pricePerMinPaise: String(RATE) }),
      );
      expect(mockRedis.expire).toHaveBeenCalled();
      expect(svc.isActiveLocally(SESSION)).toBe(true);
    });

    it('is idempotent — second call is a no-op', async () => {
      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);
      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);

      // hset should have been called only once (first call)
      expect(mockRedisClient.hset).toHaveBeenCalledTimes(1);
    });
  });

  // ── stopBilling ─────────────────────────────────────────────────────────────

  describe('stopBilling()', () => {
    it('returns zero totals when no Redis state exists', async () => {
      mockRedisClient.hgetall.mockResolvedValueOnce(null);
      const result = await svc.stopBilling(SESSION);
      expect(result).toEqual({ totalMinutes: 0, totalCharged: 0 });
    });

    it('clears the interval and deletes the Redis key', async () => {
      // seed active session
      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);
      mockRedisClient.hgetall.mockResolvedValueOnce(makeRedisState());
      mockRedisClient.hget.mockResolvedValueOnce('2'); // 2 minutes billed

      await svc.stopBilling(SESSION);

      expect(svc.isActiveLocally(SESSION)).toBe(false);
      expect(mockRedis.del).toHaveBeenCalledWith(`session:billing:${SESSION}`);
    });

    it('charges a partial minute if >30s since last tick', async () => {
      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);
      // lastTickAt is null → anchors to startedAt (90 s ago) → partialSecs > 30 → doDebit
      mockRedisClient.hgetall.mockResolvedValue(makeRedisState({ lastTickAt: '' }));
      mockRedisClient.hget.mockResolvedValueOnce('1');

      await svc.stopBilling(SESSION);

      expect(mockWallet.debit).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ amount: RATE }),
      );
    });
  });

  // ── doDebit (via tick) ──────────────────────────────────────────────────────

  describe('tick / doDebit()', () => {
    it('debits wallet and marks tick DEBITED on success', async () => {
      mockRedisClient.hgetall.mockResolvedValue(makeRedisState());
      mockRedisClient.hincrby.mockResolvedValue(1);

      // Call private tick via stopBilling forced-debit path
      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);
      mockRedisClient.hgetall.mockResolvedValue(makeRedisState({ lastTickAt: '' }));
      mockRedisClient.hget.mockResolvedValueOnce('1');
      await svc.stopBilling(SESSION);

      expect(mockTicksRepo.update).toHaveBeenCalledWith(
        mockTick.id,
        expect.objectContaining({ status: TickStatus.DEBITED }),
      );
    });

    it('emits billing.insufficient and clears timer on insufficient funds', async () => {
      mockWallet.debit.mockResolvedValueOnce({
        success: false,
        insufficientFunds: true,
        newBalance: 0,
      });

      mockRedisClient.hgetall.mockResolvedValue(makeRedisState({ lastTickAt: '' }));
      mockRedisClient.hincrby.mockResolvedValue(1);

      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);
      mockRedisClient.hgetall.mockResolvedValue(makeRedisState({ lastTickAt: '' }));
      mockRedisClient.hget.mockResolvedValueOnce('0');
      await svc.stopBilling(SESSION);

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'billing.insufficient',
        expect.objectContaining({ sessionId: SESSION, userId: USER_ID }),
      );
    });

    it('emits billing.low_balance when balance < 2× rate after debit', async () => {
      mockWallet.debit.mockResolvedValueOnce({
        success: true,
        insufficientFunds: false,
        newBalance: RATE - 1, // less than 2× rate
      });

      mockRedisClient.hgetall.mockResolvedValue(makeRedisState({ lastTickAt: '' }));
      mockRedisClient.hincrby.mockResolvedValue(1);

      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);
      mockRedisClient.hgetall.mockResolvedValue(makeRedisState({ lastTickAt: '' }));
      mockRedisClient.hget.mockResolvedValueOnce('1');
      await svc.stopBilling(SESSION);

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'billing.low_balance',
        expect.objectContaining({ sessionId: SESSION, minutesRemaining: 0 }),
      );
    });

    it('suppresses a duplicate tick that is already DEBITED', async () => {
      const debitedTick = { ...mockTick, status: TickStatus.DEBITED };
      mockTicksRepo.save.mockRejectedValueOnce(new Error('duplicate key'));
      mockTicksRepo.findOne.mockResolvedValueOnce(debitedTick);

      mockRedisClient.hgetall.mockResolvedValue(makeRedisState({ lastTickAt: '' }));
      mockRedisClient.hincrby.mockResolvedValue(1);

      await svc.startBilling(SESSION, USER_ID, PROV_ID, BOOKING, RATE);
      mockRedisClient.hgetall.mockResolvedValue(makeRedisState({ lastTickAt: '' }));
      mockRedisClient.hget.mockResolvedValueOnce('1');
      await svc.stopBilling(SESSION);

      // Should not debit wallet when the tick was already debited
      expect(mockWallet.debit).not.toHaveBeenCalled();
    });
  });

  // ── resumeSession ───────────────────────────────────────────────────────────

  describe('resumeSession()', () => {
    it('returns true and restarts interval when Redis state exists', async () => {
      mockRedis.exists.mockResolvedValueOnce(true);
      const resumed = await svc.resumeSession(SESSION);
      expect(resumed).toBe(true);
      expect(svc.isActiveLocally(SESSION)).toBe(true);
    });

    it('returns false when no Redis state', async () => {
      mockRedis.exists.mockResolvedValueOnce(false);
      const resumed = await svc.resumeSession('nonexistent');
      expect(resumed).toBe(false);
    });
  });

  // ── isActiveGlobally ────────────────────────────────────────────────────────

  describe('isActiveGlobally()', () => {
    it('delegates to Redis exists check', async () => {
      mockRedis.exists.mockResolvedValueOnce(true);
      const active = await svc.isActiveGlobally(SESSION);
      expect(active).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith(`session:billing:${SESSION}`);
    });
  });
});
