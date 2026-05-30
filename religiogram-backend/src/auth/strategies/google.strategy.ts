import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import type { GoogleProfile } from '../../users/users.service';

/**
 * Google OAuth 2.0 / OIDC strategy.
 * - Redirects to Google consent screen on /auth/google
 * - Google redirects back to /auth/google/callback with a code
 * - Strategy exchanges code for profile + tokens
 * - validate() normalises the profile into GoogleProfile shape
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('google.clientId'),
      clientSecret: config.getOrThrow<string>('google.clientSecret'),
      callbackURL: config.getOrThrow<string>('google.callbackUrl'),
      scope: ['openid', 'email', 'profile'],
      passReqToCallback: false,
    });
  }

  /**
   * Called once Google responds with a valid profile.
   * The returned object is attached to req.user for the controller.
   */
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value ?? null;
    if (!email) {
      return done(new Error('Google account has no email'), false);
    }

    const normalized: GoogleProfile = {
      googleId: profile.id,
      email,
      name: profile.displayName ?? null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
    done(null, normalized);
  }
}
