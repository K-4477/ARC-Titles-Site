import { toApi } from './time.js';

// The backend is the Vercel Function in api/index.js.
const API = '/api';

// `npm run dev` shows sample data. `vercel dev` with VITE_LIVE=1 uses the real API; a production build always does.
export const USE_SAMPLE = import.meta.env.DEV && import.meta.env.VITE_LIVE !== '1';

async function getJson(url, opts) {
  let res;
  try { res = await fetch(url, opts); } catch { throw new Error("Couldn't reach the server. Check your connection."); }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The server sent an unexpected reply.'); }
  if (!data.success) throw new Error(data.error || 'Unknown error');
  return data;
}

/* ---- sample data for local development ---- */
const sample = {
  titles: [
    { id: '1', name: 'Guardian of Harmony', holder: 'Siu Mai', expires: null, is_permanent: '1' },
    { id: '2', name: 'Guardian of Fire', holder: null, is_permanent: '0' },
    { id: '3', name: 'Guardian of Water', holder: null, is_permanent: '0' },
    { id: '4', name: 'Guardian of Earth', holder: null, is_permanent: '0' },
    { id: '5', name: 'Guardian of Air', holder: null, is_permanent: '0' },
    { id: '6', name: 'Architect', holder: null, is_permanent: '0' },
    { id: '7', name: 'General', holder: null, is_permanent: '0' },
    { id: '8', name: 'Governor', holder: null, is_permanent: '0' },
    { id: '9', name: 'Prefect', holder: null, is_permanent: '0' }
  ],
  reservations: []
};

export async function fetchAll() {
  if (USE_SAMPLE) return { titles: sample.titles, reservations: [...sample.reservations] };
  const [t, r] = await Promise.all([
    getJson(`${API}?action=get_titles`),
    getJson(`${API}?action=get_reservations`)
  ]);
  return { titles: t.titles || [], reservations: r.reservations || [] };
}

/* ---- admin ----
 * Implemented in api/index.js. Admin actions need the session cookie set by admin_login;
 * the cookie is HttpOnly, so this code never sees it, the browser just sends it.
 */
const SAMPLE_ADMIN_PASSWORD = 'admin';
let nextSampleResId = 1;
let sampleAdmin = false;
const apiTime = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const sampleTitle = (id) => {
  const t = sample.titles.find((x) => String(x.id) === String(id));
  if (!t) throw new Error('Title not found.');
  return t;
};

function post(fields) {
  return getJson(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields)
  });
}

export async function fetchTitles() {
  if (USE_SAMPLE) return sample.titles.map((t) => ({ ...t }));
  return (await getJson(`${API}?action=get_titles`)).titles || [];
}

export async function adminSession() {
  if (USE_SAMPLE) return sampleAdmin;
  try { await getJson(`${API}?action=admin_session`); return true; } catch { return false; }
}

export async function adminLogin(password) {
  if (USE_SAMPLE) {
    if (password !== SAMPLE_ADMIN_PASSWORD) throw new Error('Wrong password.');
    sampleAdmin = true;
    return;
  }
  await post({ action: 'admin_login', password });
}

export async function adminLogout() {
  if (USE_SAMPLE) { sampleAdmin = false; return; }
  await post({ action: 'admin_logout' });
}

export async function adminAssign({ titleId, holder, hours }) {
  if (USE_SAMPLE) {
    const t = sampleTitle(titleId);
    t.holder = holder;
    t.expires = apiTime(new Date(Date.now() + hours * 3600000));
    t.held_since = apiTime(new Date());
    t.is_permanent = '0';
    return;
  }
  await post({ action: 'admin_assign', title_id: titleId, holder, duration: hours });
}

export async function adminRelease(titleId) {
  if (USE_SAMPLE) {
    const t = sampleTitle(titleId);
    t.holder = null; t.expires = null; t.held_since = null; t.is_permanent = '0';
    return;
  }
  await post({ action: 'admin_release', title_id: titleId });
}

export async function adminSetPermanent(titleId, permanent) {
  if (USE_SAMPLE) {
    const t = sampleTitle(titleId);
    if (permanent && !t.holder) throw new Error('Assign a holder first.');
    t.is_permanent = permanent ? '1' : '0';
    if (permanent) t.expires = null;
    return;
  }
  await post({ action: 'admin_set_permanent', title_id: titleId, is_permanent: permanent ? 1 : 0 });
}

export async function fetchAdminReservations() {
  if (USE_SAMPLE) return sample.reservations.map((r) => ({ ...r }));
  return (await getJson(`${API}?action=admin_get_reservations`)).reservations || [];
}

const sampleReservation = (id) => {
  const r = sample.reservations.find((x) => String(x.id) === String(id));
  if (!r) throw new Error('Request not found.');
  return r;
};

/** { id, titleId, titleName, start: Date, hours } */
export async function adminUpdateReservation({ id, titleId, titleName, start, hours }) {
  if (USE_SAMPLE) {
    const r = sampleReservation(id);
    r.title_id = String(titleId);
    r.title_name = titleName;
    r.start_time = apiTime(start);
    r.end_time = apiTime(new Date(start.getTime() + hours * 3600000));
    return;
  }
  await post({ action: 'admin_update_reservation', id, title_id: titleId, start_time: toApi(start), duration: hours });
}

export async function adminCancelReservation(id) {
  if (USE_SAMPLE) {
    sample.reservations.splice(sample.reservations.indexOf(sampleReservation(id)), 1);
    return;
  }
  await post({ action: 'admin_cancel_reservation', id });
}

/** req: { username, titleId, titleName, start: Date, end: Date, hours, coordinates, notes } */
export async function submitRequest(req) {
  if (USE_SAMPLE) {
    sample.reservations.push({
      id: String(nextSampleResId++), title_id: String(req.titleId),
      title_name: req.titleName, username: req.username,
      start_time: toApi(req.start), end_time: toApi(req.end),
      coordinates: req.coordinates, notes: req.notes
    });
    return;
  }
  await post({
    action: 'submit_request',
    username: req.username,
    title_id: req.titleId,
    start_time: toApi(req.start),
    duration: req.hours,
    coordinates: req.coordinates,
    notes: req.notes
  });
}
