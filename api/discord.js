// POST /api/discord — Discord's "Interactions Endpoint URL". Handles the Edit / Cancel buttons on booking posts.
// Only members with the Guardians role can use them. Every request is checked against Discord's signature.
// Times typed into the Edit form are UTC (game time).
import { db } from '../server/db.js';
import { UserError, bad } from '../server/errors.js';
import { cancelBooking, loadBooking, syncCancelled, syncEdited, updateBooking } from '../server/bookings.js';
import { bookingMessage, esc, guardianRole, verifyDiscord } from '../server/discord.js';
import { MAX_DAYS_AHEAD, MAX_HOURS } from '../src/lib/titles.js';

// Discord interaction and response types.
const PING = 1, COMPONENT = 3, MODAL_SUBMIT = 5;
const PONG = 1, REPLY = 4, UPDATE = 7, MODAL = 9;
const EPHEMERAL = 64; // only the clicker sees the reply

const respond = (data) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const privately = (content, components = []) =>
  respond({ type: REPLY, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });
const replaceWith = (content) =>
  respond({ type: UPDATE, data: { content, components: [], allowed_mentions: { parse: [] } } });

const pad = (n) => String(n).padStart(2, '0');
const unix = (d) => Math.floor(new Date(d).getTime() / 1000);
const displayName = (i) => i.member?.nick || i.member?.user?.global_name || i.member?.user?.username || 'a Guardian';

function isGuardian(i) {
  const role = guardianRole();
  return Boolean(role && i.guild_id && i.member?.roles?.includes(role));
}

/** Collects { custom_id: value } from a submitted form, however Discord nests the fields. */
function formValues(components, out = {}) {
  for (const c of components || []) {
    if (c.custom_id) out[c.custom_id] = c.values ? c.values[0] : c.value;
    if (c.component) formValues([c.component], out);
    if (c.components) formValues(c.components, out);
  }
  return out;
}

async function editForm(booking) {
  const titles = await db()`SELECT id, name, holder, is_permanent FROM titles ORDER BY id`;
  const start = new Date(booking.start_time);
  const hours = Math.round((new Date(booking.end_time) - start) / 3_600_000);
  return respond({
    type: MODAL,
    data: {
      custom_id: `save:${booking.id}`,
      title: 'Edit title request',
      components: [
        {
          type: 18, label: 'Title',
          component: {
            type: 3, custom_id: 'title',
            options: titles
              .filter((t) => !(t.is_permanent && t.holder))
              .map((t) => ({ label: t.name, value: String(t.id), default: t.id === booking.title_id }))
          }
        },
        {
          type: 18, label: 'Date (UTC)', description: 'Game time, as YYYY-MM-DD',
          component: {
            type: 4, custom_id: 'date', style: 1, min_length: 10, max_length: 10, required: true,
            value: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`
          }
        },
        {
          type: 18, label: 'Start time (UTC)', description: '24-hour HH:MM, on a 15-minute mark (:00, :15, :30, :45)',
          component: {
            type: 4, custom_id: 'time', style: 1, min_length: 4, max_length: 5, required: true,
            value: `${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}`
          }
        },
        {
          type: 18, label: 'Length',
          component: {
            type: 3, custom_id: 'hours',
            options: Array.from({ length: MAX_HOURS }, (_, k) => ({
              label: `${k + 1} hour${k ? 's' : ''}`, value: String(k + 1), default: k + 1 === hours
            }))
          }
        }
      ]
    }
  });
}

/** Same rules as the booking form on the website. */
async function saveEdit(i, id) {
  const before = await loadBooking(id);
  if (!before) bad('That request was already cancelled.');
  const v = formValues(i.data.components);

  const titleId = Number(v.title);
  const [title] = await db()`SELECT id, holder, is_permanent FROM titles WHERE id = ${Number.isInteger(titleId) ? titleId : 0}`;
  if (!title) bad('Pick a title.');
  if (title.is_permanent && title.holder) bad('That title is held permanently and cannot be requested.');

  const date = String(v.date || '').trim();
  const time = String(v.time || '').trim().replace(/^(\d):/, '0$1:');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad('Date should look like 2026-11-14.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) bad('Start time should look like 18:30 (24-hour, UTC).');
  const start = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) bad('That date does not exist.');
  if (start.getUTCMinutes() % 15) bad('Start times must be on a 15-minute mark (:00, :15, :30, :45).');

  const hours = Number(v.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURS) bad(`Length must be 1 to ${MAX_HOURS} hours.`);

  const moved = start.getTime() !== new Date(before.start_time).getTime();
  if (moved && start.getTime() < Date.now() - 60_000) bad('That time has already passed.');
  if (start.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) bad(`Requests can be up to ${MAX_DAYS_AHEAD} days ahead.`);

  const end = new Date(start.getTime() + hours * 3_600_000);
  const change = await updateBooking(id, title.id, start, end);
  const editedBy = displayName(i);
  // This form was opened from the post itself, so the reply below updates the post; only the reminder needs syncing.
  await syncEdited(change, editedBy, { skipPost: true });
  return respond({ type: UPDATE, data: bookingMessage(change.after, editedBy) });
}

async function handle(i) {
  if (i.type === PING) return respond({ type: PONG });
  if (i.type !== COMPONENT && i.type !== MODAL_SUBMIT) return privately('Unsupported action.');
  if (!isGuardian(i)) return privately('Only Guardians can edit or cancel title requests.');

  const [kind, rawId] = String(i.data?.custom_id || '').split(':');
  const id = Number(rawId);

  if (i.type === MODAL_SUBMIT && kind === 'save') return saveEdit(i, id);

  if (kind === 'keep') return replaceWith('Kept. Nothing was changed.');

  if (kind === 'edit' || kind === 'cancel') {
    const booking = await loadBooking(id);
    if (!booking) return privately('That request was already cancelled.');
    if (kind === 'edit') return editForm(booking);
    return privately(
      `Cancel **${esc(booking.title_name)}** for **${esc(booking.username)}**, starting <t:${unix(booking.start_time)}:F>?`,
      [{
        type: 1,
        components: [
          { type: 2, style: 4, label: 'Yes, cancel it', custom_id: `cancelok:${id}` },
          { type: 2, style: 2, label: 'Keep it', custom_id: 'keep' }
        ]
      }]
    );
  }

  if (kind === 'cancelok') {
    const row = await cancelBooking(id);
    await syncCancelled(row, `<@${i.member.user.id}>`);
    return replaceWith(`Cancelled **${esc(row.title_name)}** for **${esc(row.username)}**.`);
  }

  return privately('Unknown button.');
}

export async function POST(request) {
  const raw = await request.text();
  if (!verifyDiscord(request, raw)) return new Response('Bad signature', { status: 401 });
  let interaction;
  try {
    interaction = JSON.parse(raw);
  } catch {
    return new Response('Bad body', { status: 400 });
  }
  try {
    return await handle(interaction);
  } catch (e) {
    if (e instanceof UserError) return privately(`⚠️ ${e.message}`);
    console.error('[discord interaction]', e);
    return privately('⚠️ Something went wrong. Try again, or use the admin page on the website.');
  }
}
