// Changes to requests that both the website (api/index.js) and the Discord bot (api/discord.js) make,
// plus keeping the Discord post and the reminder in step with them.
import { db } from './db.js';
import { bad } from './errors.js';
import { bookingMessage, cancelledMessage, discordEnabled, editMessage, postMessage } from './discord.js';
import { scheduleReminder } from './reminders.js';

// Turns database rule violations into messages people can act on.
export function dbError(e) {
  if (e?.code === '23P01') bad('That slot overlaps another request for this title. Pick another time.');
  if (e?.code === '23503') bad('That title does not exist.');
  throw e;
}

/** One request with its title name, or undefined. */
export async function loadBooking(id) {
  const [row] = await db()`
    SELECT r.*, t.name AS title_name
    FROM reservations r JOIN titles t ON t.id = r.title_id
    WHERE r.id = ${id}`;
  return row;
}

/** Moves a request to a new title/time. Returns { before, after }. */
export async function updateBooking(id, titleId, start, end) {
  const before = await loadBooking(id);
  if (!before) bad('That request no longer exists.');
  try {
    // A new start time needs a new reminder, so clear the "reminded" mark when it changes.
    await db()`
      UPDATE reservations
      SET title_id = ${titleId}, start_time = ${start.toISOString()}, end_time = ${end.toISOString()},
          reminded_at = CASE WHEN start_time = ${start.toISOString()}::timestamptz THEN reminded_at END
      WHERE id = ${id}`;
  } catch (e) {
    dbError(e);
  }
  const after = await loadBooking(id);
  if (!after) bad('That request no longer exists.');
  return { before, after };
}

/** Deletes a request and returns what it was (with title name). */
export async function cancelBooking(id) {
  const [row] = await db()`
    WITH d AS (DELETE FROM reservations WHERE id = ${id} RETURNING *)
    SELECT d.*, t.name AS title_name FROM d JOIN titles t ON t.id = d.title_id`;
  if (!row) bad('That request no longer exists.');
  return row;
}

/* ---------- Discord + reminder sync. These never throw: a Discord outage must not break bookings. ---------- */

async function quietly(label, fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`[${label}]`, e);
  }
}

export async function announceNew(booking) {
  await Promise.all([
    quietly('discord post', async () => {
      if (!discordEnabled()) return;
      const messageId = await postMessage(bookingMessage(booking));
      await db()`UPDATE reservations SET discord_message_id = ${messageId} WHERE id = ${booking.id}`;
    }),
    quietly('schedule reminder', () => scheduleReminder(booking.id, booking.start_time))
  ]);
}

/** After an edit: refresh the Discord post (unless the caller already did) and re-queue the reminder if the start moved. */
export async function syncEdited({ before, after }, editedBy, { skipPost = false } = {}) {
  const moved = new Date(before.start_time).getTime() !== new Date(after.start_time).getTime();
  await Promise.all([
    quietly('discord edit', async () => {
      if (skipPost || !discordEnabled() || !after.discord_message_id) return;
      await editMessage(after.discord_message_id, bookingMessage(after, editedBy));
    }),
    quietly('reschedule reminder', async () => {
      if (moved) await scheduleReminder(after.id, after.start_time);
    })
  ]);
}

export async function syncCancelled(row, cancelledBy) {
  await quietly('discord cancel', async () => {
    if (!discordEnabled() || !row.discord_message_id) return;
    await editMessage(row.discord_message_id, cancelledMessage(row, cancelledBy));
  });
}
