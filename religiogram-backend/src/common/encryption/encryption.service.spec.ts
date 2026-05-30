import { Test } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let svc: EncryptionService;
  const KEY64 = 'a'.repeat(64); // 64 hex chars = 32 bytes
  const KEY_ENV = 'BIRTH_PROFILE_ENCRYPTION_KEY';

  beforeAll(async () => {
    process.env[KEY_ENV] = KEY64;
    process.env['PAYOUT_ENCRYPTION_KEY'] = KEY64;

    const mod = await Test.createTestingModule({
      providers: [EncryptionService],
    }).compile();

    svc = mod.get(EncryptionService);
    await svc.onModuleInit();
  });

  it('round-trips plaintext through encrypt → decrypt', () => {
    const plain = 'Rajesh Kumar';
    const cipher = svc.encrypt(plain, KEY_ENV);
    expect(cipher).not.toBe(plain);
    expect(svc.decrypt(cipher, KEY_ENV)).toBe(plain);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plain = 'Mumbai';
    const c1 = svc.encrypt(plain, KEY_ENV);
    const c2 = svc.encrypt(plain, KEY_ENV);
    expect(c1).not.toBe(c2); // different IV each time
    expect(svc.decrypt(c1, KEY_ENV)).toBe(plain);
    expect(svc.decrypt(c2, KEY_ENV)).toBe(plain);
  });

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const cipher = svc.encrypt('sensitive data', KEY_ENV);
    const [iv, tag, data] = cipher.split(':');
    const tampered = `${iv}:${tag}:${data.slice(0, -2)}ff`; // flip last byte
    expect(() => svc.decrypt(tampered, KEY_ENV)).toThrow();
  });

  it('throws on missing key env var', () => {
    expect(() => svc.encrypt('x', 'NONEXISTENT_KEY_ENV')).toThrow();
  });

  it('onModuleInit throws if key is < 64 hex chars', async () => {
    const badEnv = 'TEST_SHORT_KEY';
    process.env[badEnv] = 'short';
    const mod = await Test.createTestingModule({
      providers: [EncryptionService],
    }).compile();
    const badSvc = mod.get(EncryptionService);
    // Manually trigger with short key to verify validation
    process.env[KEY_ENV] = 'x'.repeat(10);
    await expect(badSvc.onModuleInit()).rejects.toThrow();
    process.env[KEY_ENV] = KEY64; // restore
  });
});
