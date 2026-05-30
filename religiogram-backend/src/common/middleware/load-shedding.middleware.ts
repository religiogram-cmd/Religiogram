import { Injectable, NestMiddleware, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as os from 'os';

/**
 * LoadSheddingMiddleware — §83 Reliability spec
 *
 * Reads system CPU utilisation every 10 seconds and sheds load
 * progressively:
 *
 *   ≥ 80%: analytics + search requests rejected with 503
 *   ≥ 90%: notification delivery deferred; non-critical 503
 *   ≥ 95%: only wallet, booking, payment, auth pass
 *
 * Protected paths always pass regardless of CPU.
 */

const PROTECTED = [
  '/v1/auth',
  '/v1/wallet',
  '/v1/bookings',
  '/v1/payments',
  '/health',
  '/metrics',
];

const NON_CRITICAL_80 = ['/v1/analytics', '/v1/search'];
const NON_CRITICAL_90 = ['/v1/notifications', '/v1/social', '/v1/places'];

@Injectable()
export class LoadSheddingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoadSheddingMiddleware.name);
  private cpuUsage = 0;
  private lastSample = 0;
  private prevCpuInfo: os.CpuInfo[] | null = null;

  use(req: Request, res: Response, next: NextFunction): void {
    this.refreshCpu();

    const path = req.path;

    // Always pass protected paths
    if (PROTECTED.some(p => path.startsWith(p))) return next();

    if (this.cpuUsage >= 95) {
      // Only critical paths pass — everything else shed
      throw new ServiceUnavailableException('Server under extreme load; please retry');
    }

    if (this.cpuUsage >= 90) {
      if (NON_CRITICAL_90.some(p => path.startsWith(p))) {
        res.setHeader('Retry-After', '30');
        throw new ServiceUnavailableException('Service temporarily unavailable due to high load');
      }
    }

    if (this.cpuUsage >= 80) {
      if (NON_CRITICAL_80.some(p => path.startsWith(p))) {
        res.setHeader('Retry-After', '15');
        throw new ServiceUnavailableException('Non-critical endpoint unavailable under load');
      }
    }

    next();
  }

  private refreshCpu(): void {
    const now = Date.now();
    if (now - this.lastSample < 10_000) return; // sample every 10s
    this.lastSample = now;

    const cpus = os.cpus();
    if (!this.prevCpuInfo) {
      this.prevCpuInfo = cpus;
      return;
    }

    let totalDiff = 0;
    let idleDiff  = 0;

    for (let i = 0; i < cpus.length; i++) {
      const prev = this.prevCpuInfo[i].times as Record<string, number>;
      const curr = cpus[i].times as Record<string, number>;
      const total = Object.values(curr).reduce((a, b) => a + b, 0)
                  - Object.values(prev).reduce((a, b) => a + b, 0);
      const idle  = curr.idle - prev.idle;
      totalDiff += total;
      idleDiff  += idle;
    }

    this.prevCpuInfo = cpus;
    this.cpuUsage = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;

    if (this.cpuUsage >= 80) {
      this.logger.warn(`CPU utilisation: ${this.cpuUsage}% — load shedding active`);
    }
  }
}
