import { sign, verify } from 'jsonwebtoken';
import { hashSync, compareSync } from 'bcrypt';

export class EncryptionService {
  private static getAuthSecret(): string {
    const secret = process.env.AUTH_SECRET?.trim();
    const normalized = secret?.toLowerCase().replace(/[^a-z0-9]/g, '');
    const placeholderSecrets = new Set([
      'yourspecialstring111',
      'changeme',
      'yoursecrethere',
      'secret',
      'developmentsecret',
      'cionlynotforproduction',
    ]);

    if (
      !secret ||
      secret.length < 32 ||
      /^(.)\\1{31,}$/.test(secret) ||
      placeholderSecrets.has(normalized || '')
    ) {
      throw new Error(
        'AUTH_SECRET must be a unique value of at least 32 characters. Replace any example or default secret before starting the backend.',
      );
    }

    return secret;
  }

  static validateAuthSecret(): void {
    this.getAuthSecret();
  }

  static hashPassword(password: string) {
    return hashSync(password, 10);
  }

  static comparePassword(password: string, hash: string) {
    return compareSync(password, hash);
  }

  static signJWT(value: object) {
    return sign(value, this.getAuthSecret());
  }

  static verifyJWT(token: string) {
    return verify(token, this.getAuthSecret());
  }
}
