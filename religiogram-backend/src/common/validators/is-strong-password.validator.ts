import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * IsStrongPassword — server-side password complexity decorator.
 *
 * Rules enforced:
 *   - Minimum 8 characters
 *   - At least one uppercase letter (A–Z)
 *   - At least one lowercase letter (a–z)
 *   - At least one digit (0–9)
 *   - At least one special character from the set: !@#$%^&*()_+-=[]{}|;':",.<>?/`~\
 *
 * Why these rules?
 *   NIST SP 800-63B recommends checking against breach lists (HaveIBeenPwned) rather
 *   than mandating composition rules. However, until HIBP is integrated, explicit
 *   composition rules at least block the most trivially guessable passwords
 *   (e.g. "password", "12345678").
 *
 * Usage:
 *   @IsStrongPassword()
 *   password: string;
 */
export function IsStrongPassword(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isStrongPassword',
      target: (object as any).constructor,
      propertyName: propertyName as string,
      options: {
        message:
          'Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*…)',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments): boolean {
          if (typeof value !== 'string') return false;
          if (value.length < 8) return false;
          if (!/[A-Z]/.test(value)) return false;
          if (!/[a-z]/.test(value)) return false;
          if (!/[0-9]/.test(value)) return false;
          // Require at least one special character
          if (!/[^A-Za-z0-9]/.test(value)) return false;
          return true;
        },
      },
    });
  };
}
