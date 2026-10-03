import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { BadRequestException } from '@nestjs/common';

const scrypt = promisify(nodeScrypt);

// This is the registration policy. All password entry points use this helper
// so reset and change-password validation cannot diverge from registration.
export const PASSWORD_REQUIREMENTS_MESSAGE =
  'Password must be 8 to 64 characters and include an uppercase letter and number';

export function assertPasswordRequirements(password: string): void {
  if (password.length < 8 || password.length > 64 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new BadRequestException(PASSWORD_REQUIREMENTS_MESSAGE);
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${digest.toString('hex')}`;
}

export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const [scheme, salt, encodedDigest, ...extra] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !encodedDigest || extra.length) return password === stored;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(encodedDigest, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
