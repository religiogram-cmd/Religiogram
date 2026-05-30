import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

// ── helpers ───────────────────────────────────────────────────────────────────

const success = () => Promise.resolve('ok');
const failure = () => Promise.reject(new Error('external error'));

function advanceTime(ms: number) {
  jest.advanceTimersByTime(ms);
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('CircuitBreakerService', () => {
  let svc: CircuitBreakerService;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CircuitBreakerService],
    }).compile();

    svc = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── CLOSED state ───────────────────────────────────────────────────────────

  describe('CLOSED state', () => {
    it('passes calls through and returns result', async () => {
      const cb = svc.for('test-svc', { failureThreshold: 3, successThreshold: 1, resetMs: 1000 });
      const result = await cb.execute(success);
      expect(result).toBe('ok');
    });

    it('stays CLOSED after failures below threshold', async () => {
      const cb = svc.for('test-closed', { failureThreshold: 3, successThreshold: 1, resetMs: 1000 });
      // 2 failures — threshold is 3
      await expect(cb.execute(failure)).rejects.toThrow('external error');
      await expect(cb.execute(failure)).rejects.toThrow('external error');
      // Still CLOSED — should still attempt the call
      await expect(cb.execute(success)).resolves.toBe('ok');
    });
  });

  // ── OPEN state ────────────────────────────────────────────────────────────

  describe('OPEN state', () => {
    it('opens after failureThreshold consecutive failures', async () => {
      const cb = svc.for('test-open', { failureThreshold: 3, successThreshold: 1, resetMs: 5000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(failure)).rejects.toThrow();
      }

      // Now OPEN — should fail-fast without calling fn
      const spy = jest.fn().mockResolvedValue('should-not-run');
      await expect(cb.execute(spy)).rejects.toThrow(ServiceUnavailableException);
      expect(spy).not.toHaveBeenCalled();
    });

    it('reports OPEN in status()', async () => {
      const cb = svc.for('razorpay', { failureThreshold: 2, successThreshold: 1, resetMs: 5000 });
      await expect(cb.execute(failure)).rejects.toThrow();
      await expect(cb.execute(failure)).rejects.toThrow();
      expect(svc.status()['razorpay']).toBe('OPEN');
    });
  });

  // ── HALF_OPEN state ───────────────────────────────────────────────────────

  describe('HALF_OPEN → CLOSED', () => {
    it('transitions to HALF_OPEN after resetMs and closes on success', async () => {
      const RESET_MS = 10_000;
      const cb = svc.for('test-halfopen', {
        failureThreshold: 2,
        successThreshold: 2,
        resetMs: RESET_MS,
      });

      // Trip the breaker
      await expect(cb.execute(failure)).rejects.toThrow();
      await expect(cb.execute(failure)).rejects.toThrow();
      expect(cb.currentState).toBe('OPEN');

      // Advance past resetMs
      advanceTime(RESET_MS + 1);

      // First probe: should be allowed (HALF_OPEN)
      await expect(cb.execute(success)).resolves.toBe('ok'); // successCount = 1

      // successThreshold = 2, so still HALF_OPEN after 1 success
      expect(cb.currentState).toBe('HALF_OPEN');

      // Second probe success → CLOSED
      await expect(cb.execute(success)).resolves.toBe('ok');
      expect(cb.currentState).toBe('CLOSED');
    });

    it('returns to OPEN when probe in HALF_OPEN fails', async () => {
      const RESET_MS = 5_000;
      const cb = svc.for('test-reopen', {
        failureThreshold: 2,
        successThreshold: 1,
        resetMs: RESET_MS,
      });

      await expect(cb.execute(failure)).rejects.toThrow();
      await expect(cb.execute(failure)).rejects.toThrow();

      advanceTime(RESET_MS + 1);

      // Probe fails → back to OPEN
      await expect(cb.execute(failure)).rejects.toThrow('external error');
      expect(cb.currentState).toBe('OPEN');
    });
  });

  // ── Timeout ───────────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('rejects and counts as failure when call exceeds timeoutMs', async () => {
      jest.useRealTimers(); // Need real timers for this test

      const cb = svc.for('test-timeout', {
        failureThreshold: 1,
        successThreshold: 1,
        resetMs: 60_000,
        timeoutMs: 50, // 50ms timeout
      });

      const slowFn = () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 5000));

      await expect(cb.execute(slowFn)).rejects.toThrow(/timed out/);
      expect(cb.currentState).toBe('OPEN');
    }, 10_000);
  });

  // ── Named presets ─────────────────────────────────────────────────────────

  describe('named presets', () => {
    it('creates breaker for fcm with correct preset thresholds', async () => {
      const cb = svc.for('fcm');
      expect(cb).toBeDefined();
      expect(cb.name).toBe('fcm');
      // Trip with 5 failures (fcm preset: failureThreshold=5)
      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(failure)).rejects.toThrow();
      }
      expect(cb.currentState).toBe('OPEN');
    });

    it('creates breaker for razorpay with threshold 3', async () => {
      const cb = svc.for('razorpay');
      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(failure)).rejects.toThrow();
      }
      expect(cb.currentState).toBe('OPEN');
    });

    it('returns same instance for the same name (singleton per name)', () => {
      const a = svc.for('sms');
      const b = svc.for('sms');
      expect(a).toBe(b);
    });
  });

  // ── status() ──────────────────────────────────────────────────────────────

  describe('status()', () => {
    it('returns empty object when no breakers have been created', () => {
      // Fresh service instance
      const freshSvc = new CircuitBreakerService();
      expect(freshSvc.status()).toEqual({});
    });

    it('reports all created breakers', async () => {
      svc.for('alpha', { failureThreshold: 5, successThreshold: 1, resetMs: 1000 });
      svc.for('beta',  { failureThreshold: 5, successThreshold: 1, resetMs: 1000 });

      const status = svc.status();
      expect(status['alpha']).toBe('CLOSED');
      expect(status['beta']).toBe('CLOSED');
    });
  });

  // ── Failure counter reset on success ──────────────────────────────────────

  describe('failure counter', () => {
    it('resets failure count after a successful call', async () => {
      const cb = svc.for('test-reset', { failureThreshold: 3, successThreshold: 1, resetMs: 1000 });

      // 2 failures then a success
      await expect(cb.execute(failure)).rejects.toThrow();
      await expect(cb.execute(failure)).rejects.toThrow();
      await expect(cb.execute(success)).resolves.toBe('ok'); // resets counter

      // 2 more failures — should not open yet (counter reset)
      await expect(cb.execute(failure)).rejects.toThrow();
      await expect(cb.execute(failure)).rejects.toThrow();
      expect(cb.currentState).toBe('CLOSED');

      // 3rd failure triggers OPEN
      await expect(cb.execute(failure)).rejects.toThrow();
      expect(cb.currentState).toBe('OPEN');
    });
  });
});
