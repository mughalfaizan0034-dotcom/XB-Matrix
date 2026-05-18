import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;
const SALT_LEN = 16;
const SCHEME = 'scrypt';
const VERSION = '1';

/**
 * Hash a password using Node's built-in scrypt. Storage format:
 *   scrypt$1$<salt-hex>$<key-hex>
 *
 * Versioned so the scheme can evolve (argon2id, bcrypt) without
 * breaking existing hashes — verifyPassword dispatches on the prefix.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('password must be at least 12 characters');
  }
  const salt = randomBytes(SALT_LEN);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LEN);
  return `${SCHEME}$${VERSION}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const [scheme, version, saltHex, keyHex] = parts;
  if (scheme !== SCHEME || version !== VERSION) return false;
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length === 0) return false;

  const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
