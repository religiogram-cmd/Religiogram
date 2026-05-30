import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service';

/**
 * Memory Pressure Monitor.
 *
 * Samples Node.js heap usage every 30 seconds. When usage exceeds
 * WARNING_PCT (80%) or CRITICAL_PCT (90%) it:
 *   - Logs a structured warning
 *   - Fires an alert via AlertsService (Slack / PagerDuty in prod)
 *
 * Why this matters:
 *   Node.js V8 GC becomes increasingly expensive as heap approaches its
 *   limit. At ~85% usage you will start seeing GC pauses of 50-200ms per
 *   request. At ~95% the process OOM-kills. Getting an alert at 80% gives
 *   you time to scale horizontally before the pod dies.
 *
 * Registered as a global provider in AppModule so it starts automatically.
 */
@Injectable()
export class MemoryMonitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemoryMonitor.name);
  private timer?: ReturnType<typeof setInterval>;

  private static readonly INTERVAL_MS   = 30_000;
  private static readonly WARNING_PCT   = 80;
  private static readonly CRITICAL_PCT  = 90;
  private static readonly HEAP_LIMIT_MB =
    parseInt(process.env.NODE_HEAP_LIMIT_MB ?? '512', 10);

  constructor(private readonly alerts: AlertsService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.sample(), MemoryMonitor.INTERVAL_MS);
    // Don't hold the event loop open for this timer alone
    (this.timer as unknown as { unref?(): void }).unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private sample(): void {
    const mem    = process.memoryUsage();
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
    const rss    = Math.round(mem.rss      / 1024 / 1024);
    const pct    = Math.round((heapMb / MemoryMonitor.HEAP_LIMIT_MB) * 100);

    // Structured log every sample for dashboards
    this.logger.log(
      JSON.stringify({
        type: 'memory_sample',
        heapUsedMb: heapMb,
        heapLimitMb: MemoryMonitor.HEAP_LIMIT_MB,
        rssMb: rss,
        heapPct: pct,
      }),
    );

    if (pct >= MemoryMonitor.CRITICAL_PCT) {
      this.logger.error(
        `CRITICAL heap pressure: ${heapMb}MB / ${MemoryMonitor.HEAP_LIMIT_MB}MB (${pct}%)`,
      );
      void this.alerts.fire({
        channel: 'memory_pressure',
        severity: 'critical',
        message: `Heap at ${pct}% -- OOM imminent on pid ${process.pid}`,
        context: { heapMb, rss, pct },
      });
    } else if (pct >= MemoryMonitor.WARNING_PCT) {
      this.logger.warn(
        `Heap pressure: ${heapMb}MB / ${MemoryMonitor.HEAP_LIMIT_MB}MB (${pct}%)`,
      );
      void this.alerts.fire({
        channel: 'memory_pressure',
        severity: 'warn',
        message: `Heap at ${pct}% on pid ${process.pid}`,
        context: { heapMb, rss, pct },
      });
    }
  }
}
