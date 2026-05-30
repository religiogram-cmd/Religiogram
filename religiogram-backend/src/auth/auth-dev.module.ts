/**
 * AuthDevModule — loaded ONLY when NODE_ENV !== 'production'.
 *
 * Registering this module conditionally (see auth.module.ts) ensures the
 * dev-login route and its service never appear in production builds.
 * grep -r 'devLogin' dist/ should return zero matches after `npm run build`.
 */
import { Module } from '@nestjs/common';
import { AuthDevService } from './services/auth-dev.service';
import { AuthDevController } from './controllers/auth-dev.controller';
import { UsersModule } from '../users/users.module';
import { TokenService } from './services/token.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({}),
  ],
  controllers: [AuthDevController],
  providers: [AuthDevService, TokenService],
  exports: [AuthDevService],
})
export class AuthDevModule {}
