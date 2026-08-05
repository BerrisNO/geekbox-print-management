import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { TokenVault } from './ports.js';

/**
 * AES-256-GCM token vault (ADR-010, NFR-SE-02). Layout: iv(12) ‖ tag(16) ‖ ciphertext.
 * Key is a 32-byte buffer from TOKEN_ENCRYPTION_KEY (never persisted).
 */
export class AesGcmTokenVault implements TokenVault {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('Token encryption key must be 32 bytes');
  }

  encrypt(plain: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]);
  }

  decrypt(buf: Buffer): string {
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}
