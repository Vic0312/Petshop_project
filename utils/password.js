import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ensure } from './errors.js';

const derive = promisify(scrypt);
export function passwordText(value, label = 'Senha', min = 8) {
  ensure(typeof value === 'string' && value.length >= min && value.length <= 128 && value.trim().length > 0, `${label} deve ter entre ${min} e 128 caracteres.`);
  return value;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !stored?.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const actual = await derive(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
