// 5-minute reminders, delivered later by Upstash QStash to /api/remind.
// Env (set by the Upstash QStash integration): QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY,
// and sometimes QSTASH_URL. SITE_URL is optional; otherwise the Vercel production domain is used.
import { Client, Receiver } from '@upstash/qstash';

/**
 * Reads a QStash variable whatever prefix the Vercel integration gave it
 * (QSTASH_TOKEN, STORAGE_QSTASH_TOKEN, UPSTASH_QSTASH_TOKEN, ...). The exact name wins.
 */
function qstashEnv(name) {
  if (process.env[name]) return process.env[name];
  const key = Object.keys(process.env).find((k) => k.endsWith(`_${name}`) && process.env[k]);
  return key ? process.env[key] : undefined;
}

const LEAD_MS = 5 * 60_000;
// QStash's free plan delays messages by at most 7 days, so longer waits are done in hops.
const MAX_HOP_MS = 6 * 86_400_000;

export function siteOrigin() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return '';
}

const remindUrl = () => `${siteOrigin()}/api/remind`;
export const remindersEnabled = () => Boolean(qstashEnv('QSTASH_TOKEN') && siteOrigin());

/**
 * Queues a reminder for a request starting at `start`. The delivery carries the start time,
 * so if the request is edited later, the old reminder sees a mismatch and does nothing.
 */
export async function scheduleReminder(id, start) {
  if (!remindersEnabled()) return;
  const startMs = new Date(start).getTime();
  const now = Date.now();
  if (startMs <= now) return;
  const due = Math.min(startMs - LEAD_MS, now + MAX_HOP_MS);
  const client = new Client({ token: qstashEnv('QSTASH_TOKEN'), baseUrl: qstashEnv('QSTASH_URL') });
  await client.publishJSON({
    url: remindUrl(),
    body: { id, start: new Date(start).toISOString() },
    ...(due > now + 1000 ? { notBefore: Math.floor(due / 1000) } : {}),
    retries: 3
  });
}

/** True when it's still too early to post, i.e. this delivery was a hop and needs re-queuing. */
export const needsAnotherHop = (start) => new Date(start).getTime() - LEAD_MS - Date.now() > 60_000;

/** Throws unless the request really came from QStash and was meant for /api/remind. */
export async function verifyQStash(request, rawBody) {
  const receiver = new Receiver({
    currentSigningKey: qstashEnv('QSTASH_CURRENT_SIGNING_KEY'),
    nextSigningKey: qstashEnv('QSTASH_NEXT_SIGNING_KEY'),
    devMode: false
  });
  await receiver.verify({
    signature: request.headers.get('upstash-signature') || '',
    body: rawBody,
    url: remindUrl(),
    upstashRegion: request.headers.get('upstash-region') || undefined
  });
}
