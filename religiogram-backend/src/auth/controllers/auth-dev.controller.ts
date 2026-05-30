/**
 * AuthDevController — registers POST /auth/dev-login ONLY in dev/test.
 *
 * This controller is part of AuthDevModule which is conditionally imported.
 * When NODE_ENV=production, AuthDevModule is never registered, so this
 * route never appears in the Express router — not even as a 404.
 */
import {
  Body, Controller, HttpCode, HttpStatus, Ip, Post, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthDevService } from '../services/auth-dev.service';
import { DevLoginDto } from '../dto/dev-login.dto';
import { Public } from '../decorators/public.decorator';

@Controller({ path: 'auth', version: '1' })
export class AuthDevController {
  constructor(private readonly authDev: AuthDevService) {}

  /**
   * POST /auth/dev-login
   * Fast token issuance for local dev and automated tests.
   * Never registered in production.
   */
  @Post('dev-login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async devLogin(
    @Body() dto: DevLoginDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authDev.devLogin(dto.email, dto.password, dto.role ?? 'seeker', {
      ip,
      userAgent: req.headers['user-agent'] ?? '',
    });
  }
}
