import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './google.strategy';
import type { Profile } from 'passport-google-oauth20';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStrategy(): GoogleStrategy {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        'google.clientId':     'fake-client-id',
        'google.clientSecret': 'fake-client-secret',
        'google.callbackUrl':  'http://localhost:3000/auth/google/callback',
      };
      return map[key];
    }),
  } as unknown as ConfigService;
  return new GoogleStrategy(config);
}

function fakeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id:          'google-uid-1',
    displayName: 'Test User',
    emails:      [{ value: 'test@example.com', verified: true }],
    photos:      [{ value: 'https://lh3.googleusercontent.com/photo.jpg' }],
    provider:    'google',
    _raw:        '',
    _json:       {} as any,
    ...overrides,
  } as Profile;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;

  beforeEach(() => {
    strategy = makeStrategy();
  });

  describe('validate()', () => {
    it('calls done(null, normalised GoogleProfile) on success', () => {
      const done = jest.fn();
      strategy.validate('access_token', 'refresh_token', fakeProfile(), done);
      expect(done).toHaveBeenCalledWith(null, {
        googleId:  'google-uid-1',
        email:     'test@example.com',
        name:      'Test User',
        avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
      });
    });

    it('normalises googleId from profile.id', () => {
      const done = jest.fn();
      strategy.validate('a', 'r', fakeProfile({ id: 'gid-xyz' }), done);
      const [, profile] = done.mock.calls[0];
      expect(profile.googleId).toBe('gid-xyz');
    });

    it('sets name to null when displayName is absent', () => {
      const done = jest.fn();
      const profile = fakeProfile({ displayName: undefined });
      strategy.validate('a', 'r', profile, done);
      const [, norm] = done.mock.calls[0];
      expect(norm.name).toBeNull();
    });

    it('sets avatarUrl to null when photos array is empty', () => {
      const done = jest.fn();
      const profile = fakeProfile({ photos: [] });
      strategy.validate('a', 'r', profile, done);
      const [, norm] = done.mock.calls[0];
      expect(norm.avatarUrl).toBeNull();
    });

    it('sets avatarUrl to null when photos is absent', () => {
      const done = jest.fn();
      const profile = fakeProfile({ photos: undefined } as any);
      strategy.validate('a', 'r', profile, done);
      const [, norm] = done.mock.calls[0];
      expect(norm.avatarUrl).toBeNull();
    });

    it('calls done(Error, false) when email is missing', () => {
      const done = jest.fn();
      const profile = fakeProfile({ emails: [] });
      strategy.validate('a', 'r', profile, done);
      expect(done).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('calls done(Error, false) when emails array is absent', () => {
      const done = jest.fn();
      const profile = fakeProfile({ emails: undefined } as any);
      strategy.validate('a', 'r', profile, done);
      expect(done).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('error message mentions "no email" when email is absent', () => {
      const done = jest.fn();
      strategy.validate('a', 'r', fakeProfile({ emails: [] }), done);
      const [err] = done.mock.calls[0];
      expect(err.message).toContain('no email');
    });
  });
});
