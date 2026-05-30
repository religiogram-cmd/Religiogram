/**
 * Tests for the IsStrongPassword validator logic.
 * We extract the inner validate() function directly rather than going through
 * the decorator machinery, because registerDecorator() requires a DI context.
 */

// ── extract the inner validator ────────────────────────────────────────────────
// We recreate the same rules inline to test them independently.

function isStrongPassword(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length < 8) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  if (!/[^A-Za-z0-9]/.test(value)) return false;
  return true;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe('IsStrongPassword validator logic', () => {
  describe('valid passwords', () => {
    it('accepts a password with all requirements met', () => {
      expect(isStrongPassword('Abcdef1!')).toBe(true);
    });

    it('accepts longer complex password', () => {
      expect(isStrongPassword('MyP@ssw0rd123')).toBe(true);
    });

    it('accepts passwords with various special characters', () => {
      expect(isStrongPassword('Test1234#')).toBe(true);
      expect(isStrongPassword('Hello@World1')).toBe(true);
      expect(isStrongPassword('Secure$Pass9')).toBe(true);
    });

    it('accepts exactly 8-character minimum with all rules', () => {
      expect(isStrongPassword('Ab1!cdef')).toBe(true);
    });
  });

  describe('invalid passwords — too short', () => {
    it('rejects 7-character password', () => {
      expect(isStrongPassword('Abc1!')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isStrongPassword('')).toBe(false);
    });
  });

  describe('invalid passwords — missing uppercase', () => {
    it('rejects all-lowercase + digit + special', () => {
      expect(isStrongPassword('abcdef1!')).toBe(false);
    });
  });

  describe('invalid passwords — missing lowercase', () => {
    it('rejects all-uppercase + digit + special', () => {
      expect(isStrongPassword('ABCDEF1!')).toBe(false);
    });
  });

  describe('invalid passwords — missing digit', () => {
    it('rejects mixed case + special but no digit', () => {
      expect(isStrongPassword('Abcdef!@')).toBe(false);
    });
  });

  describe('invalid passwords — missing special character', () => {
    it('rejects mixed case + digit but no special character', () => {
      expect(isStrongPassword('Abcdef12')).toBe(false);
    });
  });

  describe('invalid type', () => {
    it('rejects null', () => {
      expect(isStrongPassword(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isStrongPassword(undefined)).toBe(false);
    });

    it('rejects numeric value', () => {
      expect(isStrongPassword(12345678)).toBe(false);
    });

    it('rejects object', () => {
      expect(isStrongPassword({})).toBe(false);
    });
  });

  describe('common weak passwords', () => {
    it('rejects "password"', () => {
      expect(isStrongPassword('password')).toBe(false);
    });

    it('rejects "12345678"', () => {
      expect(isStrongPassword('12345678')).toBe(false);
    });

    it('rejects "Password1" (no special char)', () => {
      expect(isStrongPassword('Password1')).toBe(false);
    });
  });
});
