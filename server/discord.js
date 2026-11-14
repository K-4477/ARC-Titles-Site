// Discord bot: builds the posts, sends/edits them, and verifies that button clicks really come from Discord.
// Env: DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, DISCORD_PUBLIC_KEY, DISCORD_GUARDIAN_ROLE_ID.
// Everything here is optional: with the variables missing, the site works and simply posts nothing.
import { createPublicKey, verify } from 'node:crypto';

const API = 'https://discord.com/api/v10';

// Embed colours, matching the title colours on the site (src/styles.css).
const COLOURS = { gold: 0xd9b36c, water: 0x4fb0e0, earth: 0x86b86b, air: 0xecc866, fire: 0xe86a45, mind: 0xb497e0 };
const TITLE_COLOUR = {
  'Guardian of Harmony': 'gold', 'Guardian of Water': 'water', 'Guardian of Earth': 'earth',
  'Guardian of Air': 'air', 'Guardian of Fire': 'fire', Governor: 'water', Architect: 'earth',
  Prefect: 'mind', General: 'fire'
};
const GREY = 0x6b7280;

export const discordEnabled = () => Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID);
export const guardianRole = () => process.env.DISCORD_GUARDIAN_ROLE_ID || '';

/** Stops player-typed text from changing formatting (bold, links, spoilers...). Mentions are blocked separately. */
export const esc = (s) => String(s ?? '').replace(/([\\*_~`|>#\[\]()-])/g, '\\$1');

const unix = (d) => Math.floor(new Date(d).getTime() / 1000);
const colourFor = (title) => COLOURS[TITLE_COLOUR[title]] ?? COLOURS.gold;

function bookingFields(r) {
  const fields = [
    { name: 'Title holder', value: esc(r.username), inline: true },
    { name: 'Starts', value: `<t:${unix(r.start_time)}:F>`, inline: true },
    { name: 'Ends', value: `<t:${unix(r.end_time)}:F>`, inline: true }
  ];
  if (r.coordinates) fields.push({ name: 'Coordinates', value: esc(r.coordinates), inline: true });
  if (r.notes) fields.push({ name: 'Notes', value: esc(r.notes).slice(0, 1000) });
  return fields;
}

const buttons = (id) => [{
  type: 1,
  components: [
    { type: 2, style: 2, label: 'Edit', emoji: { name: '✏️' }, custom_id: `edit:${id}` },
    { type: 2, style: 4, label: 'Cancel', emoji: { name: '❌' }, custom_id: `cancel:${id}` }
  ]
}];

/** The "Temple Title Reserved" post. `editedBy` adds a note to the footer. */
export function bookingMessage(r, editedBy) {
  return {
    embeds: [{
      title: '🏛️ Temple Title Reserved',
      description: `**${esc(r.title_name)}** has been booked.`,
      color: colourFor(r.title_name),
      fields: bookingFields(r),
      footer: { text: editedBy ? `Spirit Portal · Edited by ${editedBy}` : 'Spirit Portal' }
    }],
    components: buttons(r.id),
    allowed_mentions: { parse: [] }
  };
}

/** What the post turns into once the request is cancelled: greyed out, no buttons. */
export function cancelledMessage(r, by) {
  return {
    embeds: [{
      title: '🚫 Temple Title Cancelled',
      description: `**${esc(r.title_name)}** for **${esc(r.username)}** was cancelled.`,
      color: GREY,
      fields: [
        { name: 'Was due to start', value: `<t:${unix(r.start_time)}:F>`, inline: true },
        { name: 'Cancelled by', value: by, inline: true }
      ],
      footer: { text: 'Spirit Portal' }
    }],
    components: [],
    allowed_mentions: { parse: [] }
  };
}

/** The 5-minute reminder. Pings the Guardians role and nothing else. */
export function reminderMessage(r) {
  const role = guardianRole();
  const fields = [{ name: 'Starts', value: `<t:${unix(r.start_time)}:t> (<t:${unix(r.start_time)}:R>)`, inline: true }];
  if (r.coordinates) fields.push({ name: 'Coordinates', value: esc(r.coordinates), inline: true });
  return {
    content: role ? `<@&${role}>` : '',
    embeds: [{
      title: '⏰ Title starts in 5 minutes',
      description: `**${esc(r.title_name)}** is almost ready for **${esc(r.username)}**.`,
      color: colourFor(r.title_name),
      fields,
      footer: { text: 'Spirit Portal reminder' }
    }],
    allowed_mentions: { parse: [], roles: role ? [role] : [] }
  };
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(2500) // button clicks must be answered within 3 seconds
  });
  if (!res.ok) throw new Error(`Discord ${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const channel = () => `/channels/${process.env.DISCORD_CHANNEL_ID}/messages`;

/** Posts a message to the bookings channel and returns its id. */
export async function postMessage(message) {
  return (await call('POST', channel(), message)).id;
}

export async function editMessage(messageId, message) {
  await call('PATCH', `${channel()}/${messageId}`, message);
}

/** True when the body really was signed by Discord (Ed25519 over timestamp + body). */
export function verifyDiscord(request, rawBody) {
  const sig = request.headers.get('x-signature-ed25519') || '';
  const ts = request.headers.get('x-signature-timestamp') || '';
  const pub = process.env.DISCORD_PUBLIC_KEY || '';
  if (!/^[0-9a-f]{128}$/i.test(sig) || !ts || !/^[0-9a-f]{64}$/i.test(pub)) return false;
  // Wrap the raw 32-byte key in the standard SPKI header so Node can load it.
  const key = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub, 'hex')]),
    format: 'der',
    type: 'spki'
  });
  return verify(null, Buffer.from(ts + rawBody), key, Buffer.from(sig, 'hex'));
}
