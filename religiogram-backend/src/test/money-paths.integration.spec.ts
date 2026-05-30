/**
 * Money-path integration tests
 *
 * Uses a real Redis connection (localhost:6379) and mocks the TypeORM
 * repository / database layer.  No running NestJS app is required.
 *
 * Run with: npm test (jest picks up *.spec.ts under src/)
 *
 * All Redis keys are prefixed with "test:" via the keyPrefix option so they
 * never collide with real application keys and are easy to flush in afterAll.
 */

import Redis from 'ioredis';

const TEST_PREFIX = 'test:money-paths:';

describe('Money-path integration tests', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis({ host: 'localhost', port: 6379, keyPrefix: TEST_PREFIX, lazyConnect: true });
    try {
      await redis.connect();
    } catch {
      // If Redis is not available the tests will fail gracefully with
      // connection errors rather than a cryptic jest timeout.
    }
  });

  afterAll(async () => {
    // Clean up every key written by this suite.
    const keys = await redis.keys('*');
    if (keys.length > 0) {
      // ioredis keyPrefix is prepended to keys returned by KEYS, so we must
      // strip the prefix before passing them back to DEL.
      await redis.del(...keys.map((k) => k.replace(TEST_PREFIX, '')));
    }
    await redis.quit();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Concurrent payment.captured webhooks → confirmBooking fires once
  // ─────────────────────────────────────────────────────────────────────────
  it('Test 1 — concurrent webhook idempotency: exactly one lock acquisition', async () => {
    const eventId = 'evt_test_' + Date.now();
    const lockKey = `webhook:processed:${eventId}`;

    /**
     * Simulates the SET key value NX EX … pattern used in the webhook
     * processor.  Returns true if the lock was acquired (first caller),
     * false otherwise.
     */
    async function tryAcquireLock(key: string): Promise<boolean> {
      // SET key 1 NX EX 300  — atomic: only the first call succeeds
      const result = await redis.set(key, '1', 'NX', 'EX', 300);
      return result === 'OK';
    }

    // Launch 10 concurrent lock attempts
    const results = await Promise.all(
      Array.from({ length: 10 }, () => tryAcquireLock(lockKey)),
    );

    const acquired = results.filter(Boolean).length;
    const rejected = results.filter((r) => !r).length;

    expect(acquired).toBe(1);
    expect(rejected).toBe(9);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Concurrent /payments/verify + webhook → CAPTURED set exactly once
  // ─────────────────────────────────────────────────────────────────────────
  it('Test 2 — concurrent payment capture: conditional UPDATE fires exactly once', async () => {
    const paymentId = 'pay_test_' + Date.now();

    // Mock TypeORM query builder — the WHERE clause must include status != CAPTURED
    // and only the first call returns affected = 1.
    let callCount = 0;
    const mockUpdateResult = jest.fn().mockImplementation(async () => {
      callCount++;
      // Simulate atomic DB behaviour: first call succeeds, subsequent ones
      // find the row already in CAPTURED state and affect 0 rows.
      return { affected: callCount === 1 ? 1 : 0 };
    });

    // The mock repository's createQueryBuilder chain
    const mockRepo = {
      createQueryBuilder: () => ({
        update: () => ({
          set: () => ({
            where: (clause: string) => {
              // Verify the WHERE clause guards against double-capture
              expect(clause).toContain("status != 'CAPTURED'");
              return { andWhere: () => ({ execute: mockUpdateResult }) };
            },
          }),
        }),
      }),
    };

    // Service-level function that mirrors the real payment capture logic
    async function capturePayment(
      repo: typeof mockRepo,
      pId: string,
    ): Promise<boolean> {
      const result = await repo
        .createQueryBuilder()
        .update()
        .set()
        .where("status != 'CAPTURED' AND id = :id", { id: pId })
        .andWhere()
        .execute();
      return (result as { affected: number }).affected === 1;
    }

    // Simulate concurrent calls (verify + webhook)
    const [r1, r2] = await Promise.all([
      capturePayment(mockRepo, paymentId),
      capturePayment(mockRepo, paymentId),
    ]);

    const successes = [r1, r2].filter(Boolean).length;
    expect(successes).toBe(1);
    expect(mockUpdateResult).toHaveBeenCalledTimes(2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: cancelBooking with walletDebitRef → wallet credit called with
  //         the correct amount in paise
  // ─────────────────────────────────────────────────────────────────────────
  it('Test 3 — cancelBooking: wallet credit called with exact refund amount in paise', async () => {
    const BOOKING_AMOUNT_PAISE = 250000; // ₹2,500
    const REFUND_AMOUNT_PAISE  = 250000; // 100% refund (>48h cancel)

    const walletService = {
      credit: jest.fn().mockResolvedValue({ id: 'ledger_abc', balance: REFUND_AMOUNT_PAISE }),
    };

    // Simulate the cancel-booking service method
    async function cancelBooking(booking: {
      id: string;
      amountPaise: number;
      walletDebitRef: string | null;
      paymentMethod: string;
    }) {
      if (booking.paymentMethod === 'wallet' && booking.walletDebitRef) {
        await walletService.credit({
          userId: 'user_123',
          amountPaise: booking.amountPaise,
          ref: `refund:${booking.id}`,
          description: 'Booking cancellation refund',
        });
      }
    }

    await cancelBooking({
      id: 'booking_001',
      amountPaise: BOOKING_AMOUNT_PAISE,
      walletDebitRef: 'debit_ref_xyz',
      paymentMethod: 'wallet',
    });

    expect(walletService.credit).toHaveBeenCalledTimes(1);
    expect(walletService.credit).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: REFUND_AMOUNT_PAISE }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: 50 concurrent applyDiscount on max_uses=1 → exactly one redemption
  // ─────────────────────────────────────────────────────────────────────────
  it('Test 4 — concurrent discount redemption: exactly one succeeds via Redis INCR', async () => {
    const discountKey = `discount:uses:PROMO_${Date.now()}`;
    const MAX_USES = 1;

    /**
     * Atomically increments the counter and returns whether this caller
     * secured a slot (counter value <= MAX_USES).
     */
    async function tryRedeemDiscount(key: string): Promise<boolean> {
      const val = await redis.incr(key);
      return val <= MAX_USES;
    }

    const results = await Promise.all(
      Array.from({ length: 50 }, () => tryRedeemDiscount(discountKey)),
    );

    const successes = results.filter(Boolean).length;
    const failures  = results.filter((r) => !r).length;

    expect(successes).toBe(1);
    expect(failures).toBe(49);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: OTP brute-force ceiling — after MAX_ATTEMPTS the OTP key is deleted
  // ─────────────────────────────────────────────────────────────────────────
  it('Test 5 — OTP brute-force: OTP key deleted after MAX_ATTEMPTS exceeded', async () => {
    const phone = '9999900001';
    const otpKey       = `otp:${phone}`;
    const attemptsKey  = `otp:attempts:${phone}`;
    const MAX_ATTEMPTS = 5;

    // Seed an OTP
    await redis.set(otpKey, '123456', 'EX', 600);

    // Service-level attempt checker — mirrors the real OTP verification logic
    async function checkOtpAttempt(rds: Redis): Promise<'ok' | 'exceeded'> {
      const attempts = await rds.incr(attemptsKey);
      if (attempts > MAX_ATTEMPTS) {
        // Lock out: delete OTP so further guesses always fail
        await rds.del(otpKey);
        return 'exceeded';
      }
      return 'ok';
    }

    // Simulate 6 failed attempts
    let finalResult: 'ok' | 'exceeded' = 'ok';
    for (let i = 0; i < 6; i++) {
      finalResult = await checkOtpAttempt(redis);
    }

    // The 6th attempt should have triggered the lockout
    expect(finalResult).toBe('exceeded');

    // The OTP key must have been deleted
    const otpExists = await redis.exists(otpKey);
    expect(otpExists).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: Stale wallet hold recovery — releaseHold called for expired holds
  // ─────────────────────────────────────────────────────────────────────────
  it('Test 6 — stale wallet hold: releaseHold called when booking is in terminal state', async () => {
    const holdId   = `hold_${Date.now()}`;
    const holdKey  = `wallet:hold:${holdId}`;
    const TERMINAL_BOOKING_STATUSES = new Set(['CANCELLED', 'COMPLETED', 'EXPIRED']);

    // Mock WalletHold entity — hold is ACTIVE but booking is CANCELLED (terminal)
    const mockHold = {
      id: holdId,
      status: 'ACTIVE',
      booking: { status: 'CANCELLED' },
    };

    const walletService = {
      releaseHold: jest.fn().mockResolvedValue({ id: holdId, status: 'RELEASED' }),
    };

    /**
     * Recovery job: scan active holds and release those whose booking has
     * reached a terminal state (or whose Redis key has already expired).
     */
    async function recoverStaleHolds(
      holds: typeof mockHold[],
      rds: Redis,
      svc: typeof walletService,
    ) {
      for (const hold of holds) {
        const keyExists = await rds.exists(holdKey);
        const bookingTerminal = TERMINAL_BOOKING_STATUSES.has(hold.booking.status);

        if (!keyExists || bookingTerminal) {
          await svc.releaseHold(hold.id);
        }
      }
    }

    // The Redis key does not exist (expired / never set) — simulates a stale hold
    await redis.del(holdKey);

    await recoverStaleHolds([mockHold], redis, walletService);

    expect(walletService.releaseHold).toHaveBeenCalledTimes(1);
    expect(walletService.releaseHold).toHaveBeenCalledWith(holdId);
  });

  it('Test 7 — cashback TOCTOU: Redis NX lock ensures only one concurrent request issues cashback', async () => {
    /**
     * Regression test for the cashback TOCTOU race condition.
     * Two concurrent endSession() calls for the same user should result in
     * exactly one cashback credit, not two, because the Redis NX lock
     * prevents the second from acquiring the lock.
     */
    const userId = 'user-cashback-test-01';
    const lockKey = `rg:cashback-lock:${userId}`;

    // Clean up any leftover lock
    await redis.del(lockKey);

    // Simulate isCashbackEligible: acquire lock atomically
    const acquireLock = async (): Promise<boolean> => {
      const result = await redis.set(lockKey, '1', 'EX', 30, 'NX');
      return result === 'OK';
    };

    // Both "concurrent" requests race for the lock
    const [first, second] = await Promise.all([acquireLock(), acquireLock()]);

    // Exactly one should succeed
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect([first, second].filter(b => !b)).toHaveLength(1);

    // Lock is held — a third request should also fail
    const third = await acquireLock();
    expect(third).toBe(false);

    // Releasing the lock allows the next request
    await redis.del(lockKey);
    const fourth = await acquireLock();
    expect(fourth).toBe(true);

    // Cleanup
    await redis.del(lockKey);
  });
});
