import { Test, TestingModule } from '@nestjs/testing';
import { FraudService } from './fraud.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FraudSignal, FraudSignalType } from './entities/fraud-signal.entity';
import { RedisService } from '../redis/redis.service';

const USER_ID = 'user-001';
const IP      = '10.0.0.1';
const PROV_ID = 'prov-001';

const makeRedis = (counts: Map<string, number> = new Map()) => ({
  incr: jest.fn().mockImplementation(async (key: string) => {
    const v = (counts.get(key) ?? 0) + 1;
    counts.set(key, v);
    return v;
  }),
  expire: jest.fn().mockResolvedValue(1),
  get:    jest.fn().mockResolvedValue(null),
  set:    jest.fn().mockResolvedValue('OK'),
});

const makeSignalRepo = () => ({
  save:   jest.fn().mockImplementation(async (d: any) => d),
  create: jest.fn().mockImplementation((d: any) => d),
  findOne: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  update: jest.fn(),
});

async function buildService(redis: any, repo: any): Promise<FraudService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      FraudService,
      { provide: RedisService,                      useValue: redis },
      { provide: getRepositoryToken(FraudSignal),   useValue: repo },
    ],
  }).compile();
  return module.get<FraudService>(FraudService);
}

describe('FraudService', () => {
  let service: FraudService;
  let redis:   ReturnType<typeof makeRedis>;
  let repo:    ReturnType<typeof makeSignalRepo>;

  beforeEach(async () => {
    redis   = makeRedis();
    repo    = makeSignalRepo();
    service = await buildService(redis, repo);
  });

  // ── checkWalletVelocity ───────────────────────────────────────────────────

  describe('checkWalletVelocity', () => {
    it('returns blocked=false for first request', async () => {
      const result = await service.checkWalletVelocity(USER_ID, IP);
      expect(result.blocked).toBe(false);
      expect(result.riskScore).toBe(10);
    });

    it('sets Redis TTL only on first increment', async () => {
      await service.checkWalletVelocity(USER_ID, IP);
      expect(redis.expire).toHaveBeenCalledTimes(1);
      // Second call: incr returns 2 → expire not called again (mock returns 2 next time)
      await service.checkWalletVelocity(USER_ID, IP);
      expect(redis.expire).toHaveBeenCalledTimes(1);
    });

    it('blocks and saves signal when velocity exceeds threshold', async () => {
      // Simulate 6 calls (threshold=5)
      for (let i = 0; i < 6; i++) {
        await service.checkWalletVelocity(USER_ID, IP);
      }
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:     USER_ID,
          signalType: FraudSignalType.WALLET_VELOCITY,
          riskScore:  90,
          isResolved: false,
        }),
      );
      // Last result is blocked
      const last = await service.checkWalletVelocity(USER_ID, IP);
      expect(last.blocked).toBe(true);
      expect(last.riskScore).toBe(90);
    });

    it('risk score scales linearly below threshold', async () => {
      // Simulate 3 calls
      let result: any;
      for (let i = 0; i < 3; i++) {
        result = await service.checkWalletVelocity(USER_ID, IP);
      }
      expect(result.riskScore).toBe(30);
      expect(result.blocked).toBe(false);
    });
  });

  // ── checkReviewManipulation ───────────────────────────────────────────────

  describe('checkReviewManipulation', () => {
    it('returns suppressed=false on first review', async () => {
      const result = await service.checkReviewManipulation(USER_ID, PROV_ID, IP);
      expect(result.suppressed).toBe(false);
    });

    it('suppresses and saves signal at threshold', async () => {
      for (let i = 0; i < 3; i++) {
        await service.checkReviewManipulation(USER_ID, PROV_ID, IP);
      }
      const last = await service.checkReviewManipulation(USER_ID, PROV_ID, IP);
      expect(last.suppressed).toBe(true);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          signalType: FraudSignalType.REVIEW_MANIPULATION,
          riskScore:  75,
        }),
      );
    });

    it('uses per-IP-provider key for isolation', async () => {
      await service.checkReviewManipulation(USER_ID, PROV_ID, IP);
      const keyUsed: string = redis.incr.mock.calls[0][0];
      expect(keyUsed).toContain(IP);
      expect(keyUsed).toContain(PROV_ID);
    });
  });
});
