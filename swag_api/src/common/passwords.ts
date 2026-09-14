import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(nodeScrypt);

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
