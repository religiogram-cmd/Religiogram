import { Controller, Get, Header, ForbiddenException, Req } from '@nestjs/common';
import * as net from 'net';
import type { Request } from 'express';
import { MetricsService } from './metrics.service';
import { Public } from '../auth/decorators/public.decorator';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@Controller({ path: 'metrics', version: '1' })
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  @ApiExcludeEndpoint()
  async getMetrics(@Req() req: Request): Promise<string> {
    const allowedIp = this.config.get<string>('metrics.allowedIp', '127.0.0.1');
    if (allowedIp !== '*') {
      const clientIp: string = (req.ip ?? (req.socket?.remoteAddress ?? ''));
      // Normalise IPv6-mapped IPv4 (e.g. ::ffff:127.0.0.1 → 127.0.0.1)
      const normalise = (ip: string) => ip.replace(/^::ffff:/, '');
      const clientNorm = normalise(clientIp ?? '');
      const allowedNorm = normalise(allowedIp);
      if (clientNorm !== allowedNorm) {
        throw new ForbiddenException('Access denied');
      }
    }
    return this.metrics.getMetrics();
  }
}
