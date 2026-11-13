import { neon } from '@neondatabase/serverless';
import { bad } from './errors.js';

let client;

/** Tagged-template SQL client. The Neon integration on Vercel sets DATABASE_URL. */
export function db() {
  if (!client) {
    // DATABASE_URL normally; the others cover the names the Neon integration creates with a prefix.
    const url = process.env.DATABASE_URL || process.env.DATABASE_POSTGRES_URL || process.env.POSTGRES_URL;
    if (!url) bad('The database is not connected (DATABASE_URL is missing).', 500);
    client = neon(url);
  }
  return client;
}

/**
 * Returns true when `key` already has `max` hits in the last `windowSec` seconds.
 * Otherwise records this hit (unless record is false) and returns false.
 */
export async function overLimit(key, max, windowSec, record = true) {
  const sql = db();
  const [{ n }] = await sql`
    SELECT count(*)::int AS n FROM rate_limits
    WHERE key = ${key} AND at > now() - make_interval(secs => ${windowSec})`;
  if (n >= max) return true;
  if (record) await sql`INSERT INTO rate_limits (key) VALUES (${key})`;
  return false;
}

export async function recordHit(key) {
  await db()`INSERT INTO rate_limits (key) VALUES (${key})`;
}
