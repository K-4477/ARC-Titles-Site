// Timezone helpers built on Intl, no library needed.
const pad = (n) => String(n).padStart(2, '0');
const cache = {};

/** "00:00", "00:15" ... "23:45" */
export const TIME_SLOTS = Array.from({ length: 96 }, (_, i) =>
  `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

function parts(ts, tz) {
  const f =
    cache[tz] ||
    (cache[tz] = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
  const o = {};
  f.formatToParts(new Date(ts)).forEach((p) => (o[p.type] = p.value));
  return o;
}

function offsetMs(ts, tz) {
  const p = parts(ts, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
}

/** A wall-clock date ("2026-11-10") and time ("16:00") in a zone -> the real instant. */
export function zonedToDate(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - offsetMs(guess, tz);
  const again = offsetMs(ts, tz);
  if (guess - again !== ts) ts = guess - again;
  return new Date(ts);
}

export const hm = (d, tz) => { const p = parts(d.getTime(), tz); return `${p.hour}:${p.minute}`; };
export const dayKey = (d, tz) => { const p = parts(d.getTime(), tz); return `${p.year}-${p.month}-${p.day}`; };
export const dayLabel = (d, tz) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
export const shortDate = (d, tz) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d);

export function offsetLabel(tz) {
  const m = Math.round(offsetMs(Date.now(), tz) / 60000);
  const a = Math.abs(m);
  return 'UTC' + (m < 0 ? '−' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + pad(a % 60) : '');
}

export const tzName = (tz) => tz.replace(/_/g, ' ');

/** The API speaks UTC as "YYYY-MM-DD HH:MM:SS". */
export const fromApi = (s) => (s ? new Date(String(s).replace(' ', 'T').slice(0, 19) + 'Z') : null);
export const toApi = (d) => d.toISOString().slice(0, 16) + ':00';

const FALLBACK = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata',
  'Asia/Bangkok', 'Asia/Singapore', 'Asia/Manila', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];

export function localZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function listZones() {
  let zones;
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = FALLBACK; }
  zones = ['UTC', ...zones.filter((z) => z !== 'UTC')];
  const local = localZone();
  if (!zones.includes(local)) zones.splice(1, 0, local);
  const now = Date.now();
  return zones
    .map((z) => {
      let label = tzName(z);
      let offset = 'UTC';
      let mins = 0;
      try {
        mins = Math.round(offsetMs(now, z) / 60000);
        offset = offsetLabel(z);
        label += ` (${offset})`;
      } catch { /* unknown zone */ }
      return { value: z, label, offset, mins };
    })
    .sort((a, b) => a.mins - b.mins || a.label.localeCompare(b.label));
}

/** Default form values: the next full hour in the given zone. */
export function nextHour(tz) {
  const p = parts(Date.now() + 3600000, tz);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:00` };
}
