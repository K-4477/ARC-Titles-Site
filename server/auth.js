// Admin login: one shared password, checked against a scrypt hash, and a signed session cookie.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { bad } from './errors.js';

const COOKIE = 'arc_admin';
const SESSION_HOURS = 12;

/** Produces the value for ADMIN_PASSWORD_HASH. Used by scripts/hash-password.mjs. */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function checkPassword(password) {
  const [kind, saltHex, hashHex] = String(process.env.ADMIN_PASSWORD_HASH || '').split(':');
  if (kind !== 'scrypt' || !saltHex || !hashHex) {
    bad("Admin login isn't set up yet (ADMIN_PASSWORD_HASH is missing).", 500);
  }
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Keyed on the password hash too, so changing the password logs every admin out.
function sign(value) {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32) bad("Admin login isn't set up yet (SESSION_SECRET is missing or too short).", 500);
  return createHmac('sha256', secret + (process.env.ADMIN_PASSWORD_HASH || '')).update(value).digest('base64url');
}

const cookieAttrs = 'Path=/api; HttpOnly; Secure; SameSite=Strict';

export function sessionCookie() {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600);
  return `${COOKIE}=${expires}.${sign(expires)}; ${cookieAttrs}; Max-Age=${SESSION_HOURS * 3600}`;
}

export const clearedCookie = () => `${COOKIE}=; ${cookieAttrs}; Max-Age=0`;

export function isAdmin(request) {
  const cookie = (request.headers.get('cookie') || '')
    .split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  const [expires, sig] = cookie.slice(COOKIE.length + 1).split('.');
  if (!expires || !sig || Number(expires) * 1000 < Date.now()) return false;
  let good;
  try { good = sign(expires); } catch { return false; }
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  return a.length === b.length && timingSafeEqual(a, b);
}
