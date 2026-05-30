import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * Circuit Breaker — prevents cascade failures from external services.
 *
 * Pattern:
 *   CLOSED  → requests pass through; failure counter increments on error
 *   OPEN    → requests fail immediately (no network call); after resetMs the
 *             breaker moves to HALF_OPEN
 *   HALF_OPEN → one probe request allowed; if it succeeds → CLOSED;
 *               if it fails → OPEN again
 *
 * Why this matters at scale:
 *   If FCM is down and we make 50 k/s notification calls, each waiting
 *   the full HTTP timeout (e.g. 5 s), we'll exhaust the event loop and
 *   connection pool within seconds. A circuit breaker fails-fast after
 *   `failureThreshold` consecutive errors, keeping the app healthy while
 *   the external service recovers.
 *
 * Usage:
 *   private readonly cb = this.circuitBreaker.for('fcm');
 *
 *   await this.cb.execute(() => admin.messaging().send(msg));
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitOptions {
  failureThreshold: number;  // consecutive failures before opening
  successThreshold: number;  // consecutive successes in HALF_OPEN to close
  resetMs: number;           // time in OPEN state before probing
  timeoutMs?: number;        // optional per-call timeout
}

const DEFAULTS: CircuitOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  resetMs: 30_000,
  timeoutMs: 10_000,
};

class Circuit {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private openedAt = 0;
  private readonly logger: Logger;

  constructor(
    public readonly name: string,
    private readonly opts: CircuitOptions,
  ) {
    this.logger = new Logger(`CircuitBreaker[${name}]`);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.opts.resetMs) {
        this.state = 'HALF_OPEN';
        this.logger.log('→ HALF_OPEN (probing)');
      } else {
        throw new ServiceUnavailableException(
          `Circuit "${this.name}" is OPEN — service temporarily unavailable`,
        );
      }
    }

    try {
      const result = this.opts.timeoutMs
        ? await Promise.race([fn(), this.timeout(this.opts.timeoutMs)])
        : await fn();

      this.onSuccess();
      return result as T;
    } catch (err) {
      this.onFailure(err as Error);
      throw err;
    }
  }

  get currentState(): CircuitState {
    return this.state;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.opts.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
        this.logger.log('→ CLOSED (recovered)');
      }
    }
  }

  private onFailure(err: Error): void {
    this.successCount = 0;
    this.failureCount++;
    this.logger.warn(
      `Failure ${this.failureCount}/${this.opts.failureThreshold}: ${err.message}`,
    );
    if (
      this.state === 'HALF_OPEN' ||
      this.failureCount >= this.opts.failureThreshold
    ) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      this.failureCount = 0;
      this.logger.error(
        `→ OPEN (will probe in ${this.opts.resetMs / 1000}s)`,
      );
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      const tid = setTimeout(() => reject(new Error(`Circuit "${this.name}" call timed out after ${ms}ms`)), ms);
      // unref so the timer does not prevent process exit during clean shutdown
      if (typeof tid === 'object' && 'unref' in tid) (tid as NodeJS.Timeout).unref();
    });
  }
}

/**
 * Registry of named circuit breakers.
 * Inject this service wherever you call an external API.
 *
 * Breakers are created on first use with sensible defaults;
 * pass custom options to override per-service thresholds.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly breakers = new Map<string, Circuit>();
  private readonly logger = new Logger(CircuitBreakerService.name);

  /**
   * Get or create a circuit breaker by name.
   * Pre-configured names: 'fcm', 'razorpay', 'sms', 'google-places'
   */
  for(name: string, opts: Partial<CircuitOptions> = {}): Circuit {
    if (!this.breakers.has(name)) {
      const merged: CircuitOptions = { ...DEFAULTS, ...this.presets(name), ...opts };
      this.breakers.set(name, new Circuit(name, merged));
      this.logger.log(`Registered circuit: ${name}`);
    }
    return this.breakers.get(name)!;
  }

  /** Current state of all breakers — useful for health endpoint. */
  status(): Record<string, CircuitState> {
    const out: Record<string, CircuitState> = {};
    this.breakers.forEach((c, name) => (out[name] = c.currentState));
    return out;
  }

  private presets(name: string): Partial<CircuitOptions> {
    const map: Record<string, Partial<CircuitOptions>> = {
      // FCM has generous uptime but flaky under spike push load
      fcm:            { failureThreshold: 5, resetMs: 30_000, timeoutMs: 8_000 },
      // Razorpay SLA: 99.99% — trip quickly, recover quickly
      razorpay:       { failureThreshold: 3, resetMs: 20_000, timeoutMs: 10_000 },
      // SMS — tolerate more failures (retry via fallback provider)
      sms:            { failureThreshold: 8, resetMs: 60_000, timeoutMs: 5_000 },
      // Google Places — non-critical; tolerate more, wait longer
      'google-places':{ failureThreshold: 10, resetMs: 120_000, timeoutMs: 3_000 },
    };
    return map[name] ?? {};
  }
}
