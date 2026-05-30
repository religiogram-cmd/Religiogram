import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * EncryptionService — centralised AES-256-GCM encrypt/decrypt.
 *
 * Ciphertext format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *   iv      = 12 random bytes (96-bit, GCM recommended)
 *   authTag = 16 bytes (128-bit, max strength)
 *
 * Key format: env var holding >= 64 hex chars (= 32 bytes for AES-256).
 * Fail-fast: missing/short keys throw at module init.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly keyCache = new Map<string, Buffer>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.getKey('BIRTH_PROFILE_ENCRYPTION_KEY');
    this.getKey('PAYOUT_ENCRYPTION_KEY');
    this.logger.log('EncryptionService: all encryption keys validated');
  }

  encrypt(plaintext: string, keyEnvVar: string): string {
    const key = this.getKey(keyEnvVar);
    const iv  = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('hex'), tag.toString('hex'), ct.toString('hex')].join(':');
  }

  decrypt(ciphertext: string, keyEnvVar: string): string {
    const key = this.getKey(keyEnvVar);
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('EncryptionService: invalid ciphertext format (expected iv:authTag:ct)');
    }
    const [ivHex, tagHex, ctHex] = parts;
    const iv  = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ct  = Buffer.from(ctHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('EncryptionService: decryption failed — data may be tampered');
    }
  }

  private getKey(envVar: string): Buffer {
    const cached = this.keyCache.get(envVar);
    if (cached) return cached;
    const hex = this.config.get<string>(envVar);
    if (!hex || hex.length < 64) {
      throw new Error(
        `EncryptionService: ${envVar} must be >= 64 hex chars. ` +
        `Got ${hex?.length ?? 0}. Generate: openssl rand -hex 32`,
      );
    }
    const key = Buffer.from(hex.slice(0, 64), 'hex');
    this.keyCache.set(envVar, key);
    return key;
  }
}
