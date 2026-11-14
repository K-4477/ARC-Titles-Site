// The whole backend: one Vercel Function at /api, dispatching on `action`.
//   GET  /api?action=<name>
//   POST /api  with a JSON body { action: <name>, ...fields }
// Every reply is JSON: { success: true, ... } or { success: false, error }.
// All times in and out are UTC. Inputs use "YYYY-MM-DDTHH:MM:SS" (no zone), outputs are ISO strings.
import { db, overLimit, recordHit } from '../server/db.js';
import { checkPassword, clearedCookie, isAdmin, sessionCookie } from '../server/auth.js';
import { UserError, bad } from '../server/errors.js';
import { announceNew, cancelBooking, dbError, syncCancelled, syncEdited, updateBooking } from '../server/bookings.js';
import { MAX_DAYS_AHEAD, MAX_HOURS } from '../src/lib/titles.js';

const RETENTION_DAYS = 90;        // finished requests older than this are deleted
const SUBMITS_PER_HOUR = 10;      // per IP
const LOGIN_FAILS_ALLOWED = 8;    // per IP, per 15 minutes
const LOGIN_WINDOW_SEC = 15 * 60;

/* ---------- helpers ---------- */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });

const iso = (v) => (v ? new Date(v).toISOString() : null);

// Vercel sets x-forwarded-for itself, so clients can't spoof it.
const clientIp = (req) =>
  (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';

function text(value, max, field) {
  const s = String(value ?? '').trim();
  if (s.length > max) bad(`${field} is too long (max ${max} characters).`);
  return s;
}

function intId(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) bad(`Invalid ${field}.`);
  return n;
}

function utcTime(value) {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) bad('Invalid start time.');
  const d = new Date(`${s}Z`);
  if (Number.isNaN(d.getTime())) bad('Invalid start time.');
  return d;
}

function hoursBetween(value, min, max) {
  const n = Number(value);
  if (!(Number.isFinite(n) && n >= min && n <= max)) bad(`Duration must be between ${min} and ${max} hours.`);
  return n;
}

function requireAdmin(request) {
  if (!isAdmin(request)) bad('Please log in again.', 401);
}

/**
 * Titles with their current holder worked out:
 * a permanent holder, else an admin assignment that hasn't expired, else whoever's request is running now.
 */
async function loadTitles() {
  const rows = await db()`
    SELECT t.id, t.name, t.holder, t.held_since, t.expires, t.is_permanent,
           r.username AS r_user, r.start_time AS r_start, r.end_time AS r_end
    FROM titles t
    LEFT JOIN LATERAL (
      SELECT username, start_time, end_time FROM reservations
      WHERE title_id = t.id AND start_time <= now() AND end_time > now()
      ORDER BY start_time LIMIT 1
    ) r ON true
    ORDER BY t.id`;
  const now = Date.now();
  return rows.map((t) => {
    const permanent = Boolean(t.is_permanent && t.holder);
    const out = { id: t.id, name: t.name, holder: null, held_since: null, expires: null, is_permanent: permanent ? 1 : 0 };
    const manual = t.holder && (permanent || !t.expires || new Date(t.expires).getTime() > now);
    if (manual) {
      Object.assign(out, { holder: t.holder, held_since: iso(t.held_since), expires: permanent ? null : iso(t.expires) });
    } else if (t.r_user) {
      Object.assign(out, { holder: t.r_user, held_since: iso(t.r_start), expires: iso(t.r_end) });
    }
    return out;
  });
}

const reservationOut = (r, admin) => ({
  ...(admin ? { id: r.id, title_id: r.title_id } : {}),
  title_name: r.title_name,
  username: r.username,
  start_time: iso(r.start_time),
  end_time: iso(r.end_time),
  coordinates: r.coordinates,
  notes: r.notes
});

/* ---------- public actions ---------- */

async function get_titles() {
  return { titles: await loadTitles() };
}

async function get_reservations() {
  const rows = await db()`
    SELECT t.name AS title_name, r.username, r.start_time, r.end_time, r.coordinates, r.notes
    FROM reservations r JOIN titles t ON t.id = r.title_id
    WHERE r.end_time > now()
    ORDER BY r.start_time`;
  return { reservations: rows.map((r) => reservationOut(r, false)), count: rows.length };
}

async function submit_request(body, request) {
  const username = text(body.username, 40, 'Name');
  if (!username) bad('Enter your in-game name.');
  const titleId = intId(body.title_id, 'title');
  const start = utcTime(body.start_time);
  if (start.getUTCMinutes() % 15 || start.getUTCSeconds()) bad('Start times must be on a 15-minute mark.');
  const hours = Number(body.duration);
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURS) bad(`Duration must be 1 to ${MAX_HOURS} hours.`);
  if (start.getTime() < Date.now() - 60_000) bad('That time has already passed.');
  if (start.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) bad(`You can book up to ${MAX_DAYS_AHEAD} days ahead.`);
  const coordinates = text(body.coordinates, 9, 'Coordinates');
  if (coordinates && !/^\d{1,4}:\d{1,4}$/.test(coordinates)) bad('Coordinates should look like 512:340.');
  const notes = text(body.notes, 500, 'Notes');

  const sql = db();
  const [title] = await sql`SELECT id, name, holder, is_permanent FROM titles WHERE id = ${titleId}`;
  if (!title) bad('That title does not exist.');
  if (title.is_permanent && title.holder) bad('That title is held permanently and cannot be requested.');

  if (await overLimit(`submit:${clientIp(request)}`, SUBMITS_PER_HOUR, 3600)) {
    bad('Too many requests from your connection. Try again in an hour.', 429);
  }

  const end = new Date(start.getTime() + hours * 3_600_000);
  let row;
  try {
    [row] = await sql`
      INSERT INTO reservations (title_id, username, start_time, end_time, coordinates, notes)
      VALUES (${titleId}, ${username}, ${start.toISOString()}, ${end.toISOString()}, ${coordinates}, ${notes})
      RETURNING *`;
  } catch (e) {
    dbError(e);
  }

  // Housekeeping instead of a cron job: keeps storage flat. Failure here shouldn't fail the request.
  // The Discord post and reminder never throw either.
  await Promise.allSettled([
    announceNew({ ...row, title_name: title.name }),
    sql`DELETE FROM reservations WHERE end_time < now() - make_interval(days => ${RETENTION_DAYS})`,
    sql`DELETE FROM rate_limits WHERE at < now() - interval '1 day'`
  ]);
  return {};
}

async function admin_login(body, request) {
  const key = `login:${clientIp(request)}`;
  if (await overLimit(key, LOGIN_FAILS_ALLOWED, LOGIN_WINDOW_SEC, false)) {
    bad('Too many failed logins. Wait 15 minutes and try again.', 429);
  }
  if (!checkPassword(body.password ?? '')) {
    await recordHit(key);
    bad('Wrong password.', 401);
  }
  return json({ success: true }, 200, { 'Set-Cookie': sessionCookie() });
}

async function admin_logout() {
  return json({ success: true }, 200, { 'Set-Cookie': clearedCookie() });
}

/* ---------- admin actions (session required) ---------- */

async function admin_session() {
  return {};
}

async function admin_get_reservations() {
  const rows = await db()`
    SELECT r.id, r.title_id, t.name AS title_name, r.username, r.start_time, r.end_time, r.coordinates, r.notes
    FROM reservations r JOIN titles t ON t.id = r.title_id
    ORDER BY r.start_time`;
  return { reservations: rows.map((r) => reservationOut(r, true)) };
}

async function admin_assign(body) {
  const titleId = intId(body.title_id, 'title');
  const holder = text(body.holder, 40, 'Player name');
  if (!holder) bad('Enter the player to assign.');
  const seconds = Math.round(hoursBetween(body.duration, 0.25, 720) * 3600);
  const rows = await db()`
    UPDATE titles
    SET holder = ${holder}, held_since = now(), expires = now() + make_interval(secs => ${seconds}), is_permanent = false
    WHERE id = ${titleId} RETURNING id`;
  if (!rows.length) bad('That title does not exist.');
  return {};
}

async function admin_release(body) {
  const sql = db();
  const titleId = intId(body.title_id, 'title');
  // Clear any admin hold, and end a request that is running right now.
  await sql.transaction([
    sql`UPDATE titles SET holder = NULL, held_since = NULL, expires = NULL, is_permanent = false WHERE id = ${titleId}`,
    sql`UPDATE reservations SET end_time = now()
        WHERE title_id = ${titleId} AND start_time < now() AND end_time > now()`
  ]);
  return {};
}

async function admin_set_permanent(body) {
  const sql = db();
  const titleId = intId(body.title_id, 'title');
  const permanent = [true, 1, '1', 'true'].includes(body.is_permanent);
  if (permanent) {
    const title = (await loadTitles()).find((t) => t.id === titleId);
    if (!title) bad('That title does not exist.');
    if (!title.holder) bad('Assign a holder first.');
    await sql`
      UPDATE titles
      SET holder = ${title.holder}, held_since = COALESCE(${title.held_since}::timestamptz, now()),
          expires = NULL, is_permanent = true
      WHERE id = ${titleId}`;
  } else {
    // The holder stays, with no end time, until an admin releases or reassigns the title.
    await sql`UPDATE titles SET is_permanent = false WHERE id = ${titleId}`;
  }
  return {};
}

async function admin_update_reservation(body) {
  const id = intId(body.id, 'request');
  const titleId = intId(body.title_id, 'title');
  const start = utcTime(body.start_time);
  const end = new Date(start.getTime() + hoursBetween(body.duration, 0.25, 48) * 3_600_000);
  await syncEdited(await updateBooking(id, titleId, start, end), 'an admin (website)');
  return {};
}

async function admin_cancel_reservation(body) {
  const id = intId(body.id, 'request');
  await syncCancelled(await cancelBooking(id), 'An admin (website)');
  return {};
}

/* ---------- routing ---------- */

const ACTIONS = {
  GET: {
    public: { get_titles, get_reservations },
    admin: { admin_session, admin_get_reservations }
  },
  POST: {
    public: { submit_request, admin_login, admin_logout },
    admin: { admin_assign, admin_release, admin_set_permanent, admin_update_reservation, admin_cancel_reservation }
  }
};

async function dispatch(method, action, body, request) {
  const set = ACTIONS[method];
  if (Object.hasOwn(set.public, action)) return set.public[action](body, request);
  if (Object.hasOwn(set.admin, action)) {
    requireAdmin(request);
    return set.admin[action](body, request);
  }
  bad('Unknown action.', 404);
}

async function run(fn) {
  try {
    const result = await fn();
    return result instanceof Response ? result : json({ success: true, ...result });
  } catch (e) {
    if (e instanceof UserError) return json({ success: false, error: e.message }, e.status);
    console.error(e);
    return json({ success: false, error: 'Something went wrong on the server. Try again.' }, 500);
  }
}

export function GET(request) {
  return run(() => dispatch('GET', new URL(request.url).searchParams.get('action'), {}, request));
}

export function POST(request) {
  return run(async () => {
    // Requiring JSON means other sites can't post to this from a plain HTML form.
    if (!(request.headers.get('content-type') || '').includes('application/json')) bad('Expected a JSON body.', 415);
    let body;
    try { body = await request.json(); } catch { bad('Invalid JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Invalid JSON.');
    return dispatch('POST', body.action, body, request);
  });
}
