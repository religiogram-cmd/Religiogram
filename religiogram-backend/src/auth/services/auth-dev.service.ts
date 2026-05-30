/**
 * AuthDevService — dev-only fast login.
 *
 * This file is ONLY imported by AuthDevModule, which is only registered
 * when NODE_ENV !== 'production'. In a production build the entire module
 * tree that references this file is tree-shaken out, so devLogin() never
 * ships in the production binary.
 *
 * Defense-in-depth still applies inside the method, but the primary
 * security guarantee is that the code path doesn't exist in prod at all.
 */
import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { TokenService } from './token.service';
import type { AuthContext } from './auth.service';
import type { AuthResponse } from '../interfaces/auth-response.interface';

@Injectable()
export class AuthDevService {
  private readonly logger = new Logger(AuthDevService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  async devLogin(
    email: string,
    password: string,
    role: string,
    ctx: AuthContext,
  ): Promise<AuthResponse> {
    // Belt-and-suspenders guard — module should never be registered in prod.
    const env = (this.config.get<string>('app.env', 'development')).toLowerCase().trim();
    if (env !== 'development' && env !== 'test' && env !== 'dev') {
      throw new ForbiddenException('Not available outside development');
    }

    const DEV_PASSWORD = this.config.get<string>('auth.devLoginPassword', 'dev123');
    if (password !== DEV_PASSWORD) {
      throw new UnauthorizedException('Wrong dev password');
    }

    const validRoles = ['seeker', 'provider', 'admin'];
    const safeRole = validRoles.includes(role) ? role : 'seeker';

    let user = await this.usersService.findByEmail(email);
    let isNewUser = false;

    if (!user) {
      const { user: created, isNewUser: created_ } =
        await this.usersService.findOrCreateByGoogle(
          {
            googleId: `dev_${email}`,
            email,
            name: email.split('@')[0],
            avatarUrl: null,
          },
          { lastLoginIp: ctx.ip },
        );
      user = created;
      isNewUser = created_;
    }

    if (user.role !== safeRole) {
      await this.usersService.updateRole(user.id, safeRole as any);
      user.role = safeRole as any;
    }

    const tokens = await this.tokenService.issueTokenPair(user, ctx.deviceId);

    this.logger.warn(`[DEV LOGIN] ${email} as ${safeRole} from ${ctx.ip}`);

    return {
      user: {
        id: user.id,
        phone: user.phone ?? '',
        email: user.email ?? null,
        name: user.name ?? null,
        avatarUrl: user.avatarUrl ?? null,
        role: user.role,
        isVerified: user.isVerified ?? false,
      },
      tokens,
      isNewUser,
    };
  }
}
