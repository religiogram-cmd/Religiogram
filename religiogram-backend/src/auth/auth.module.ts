import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { OtpModule } from '../otp/otp.module';
import { RedisModule } from '../redis/redis.module';
import { EmailModule } from '../email/email.module';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { AuthEvent } from './entities/auth-event.entity';
import { AuthDevModule } from './auth-dev.module';

/**
 * v6 (recovery): auth.module.ts was truncated in the v3 zip. Reconstructed
 * from the canonical NestJS module shape implied by every other file in the
 * auth/ directory plus the audit's described auth contract.
 *
 * Important: AuthDevModule is only registered when NODE_ENV !== 'production'
 * (its own internal guard plus the e2e test in test/dev-login-prod.e2e-spec.ts).
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Per-call signing options are set inside TokenService; this is the
        // default verify-side config.
        secret: config.getOrThrow<string>('jwt.privateKey'),
   signOptions: { algorithm: 'HS256', expiresIn: '15m' },
      }),
    }),
    TypeOrmModule.forFeature([AuthEvent]),
    UsersModule,
    OtpModule,
    RedisModule,
    EmailModule,
    ...(process.env.NODE_ENV !== 'production' ? [AuthDevModule] : []),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
  ],
  exports: [AuthService, TokenService, JwtModule, PassportModule],
})
export class AuthModule {}
