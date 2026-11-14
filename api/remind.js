// POST /api/remind — called by Upstash QStash when a reminder is due. Only QStash can call it (signed).
// Body: { id, start }. Posts the "starts in 5 minutes" ping unless the request was cancelled or moved.
import { db } from '../server/db.js';
import { loadBooking } from '../server/bookings.js';
import { discordEnabled, postMessage, reminderMessage } from '../server/discord.js';
import { needsAnotherHop, scheduleReminder, verifyQStash } from '../server/reminders.js';

const reply = (status, text) => new Response(text, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const raw = await request.text();
  try {
    await verifyQStash(request, raw);
  } catch {
    return reply(401, 'Bad signature');
  }

  let id, start;
  try {
    ({ id, start } = JSON.parse(raw));
  } catch {
    return reply(400, 'Bad body');
  }

  const booking = await loadBooking(Number(id));
  // Cancelled, or edited to another time (that edit queued its own reminder): nothing to do.
  if (!booking) return reply(200, 'Cancelled');
  if (new Date(booking.start_time).getTime() !== new Date(start).getTime()) return reply(200, 'Moved');

  // Booked more than a week ahead: this was a hop. Queue the next one.
  if (needsAnotherHop(booking.start_time)) {
    await scheduleReminder(booking.id, booking.start_time);
    return reply(200, 'Rescheduled');
  }
  if (!discordEnabled()) return reply(200, 'Discord not set up');

  // Claim the reminder so a retried or duplicate delivery can't ping twice.
  const claimed = await db()`
    UPDATE reservations SET reminded_at = now()
    WHERE id = ${booking.id} AND reminded_at IS NULL AND start_time = ${booking.start_time}
    RETURNING id`;
  if (!claimed.length) return reply(200, 'Already sent');

  try {
    await postMessage(reminderMessage(booking));
  } catch (e) {
    console.error('[reminder]', e);
    // Release the claim and let QStash retry.
    await db()`UPDATE reservations SET reminded_at = NULL WHERE id = ${booking.id}`;
    return reply(502, 'Discord failed');
  }
  return reply(200, 'Sent');
}
