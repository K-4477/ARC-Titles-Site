import { toApi } from './time.js';

const API = 'api.php';

// `npm run dev` shows sample data unless VITE_LIVE=1 (see vite.config.js). A production build always uses the real API.
export const USE_SAMPLE = import.meta.env.DEV && import.meta.env.VITE_LIVE !== '1';

async function getJson(url, opts) {
  const res = await fetch(url, opts);
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
 * Contract the PHP side needs to implement. Every admin_* action must check a server-side
 * session (set by admin_login) and answer {success:false,error} without one.
 *   GET  api.php?action=admin_session                      -> {success:true} when logged in
 *   POST action=admin_login,  password                     -> {success}; starts the session
 *   POST action=admin_logout                               -> {success}
 *   POST action=admin_assign, title_id, holder, duration   -> hours from now (may be fractional); server computes expiry
 *   POST action=admin_release, title_id                    -> clears holder, expiry and permanent flag
 *   POST action=admin_set_permanent, title_id, is_permanent (0|1)
 *   GET  api.php?action=admin_get_reservations             -> {success, reservations:[{id,title_id,title_name,username,start_time,end_time,coordinates,notes}]}
 *                                                            ALL reservations including past ones, each with a unique id
 *   POST action=admin_update_reservation, id, title_id, start_time (UTC, YYYY-MM-DDTHH:MM:00), duration (hours)
 *   POST action=admin_cancel_reservation, id               -> deletes (or marks cancelled) the reservation
 * get_titles is reused to list titles.
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

async function adminPost(fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  return getJson(API, { method: 'POST', body: fd });
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
  await adminPost({ action: 'admin_login', password });
}

export async function adminLogout() {
  if (USE_SAMPLE) { sampleAdmin = false; return; }
  await adminPost({ action: 'admin_logout' });
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
  await adminPost({ action: 'admin_assign', title_id: titleId, holder, duration: hours });
}

export async function adminRelease(titleId) {
  if (USE_SAMPLE) {
    const t = sampleTitle(titleId);
    t.holder = null; t.expires = null; t.held_since = null; t.is_permanent = '0';
    return;
  }
  await adminPost({ action: 'admin_release', title_id: titleId });
}

export async function adminSetPermanent(titleId, permanent) {
  if (USE_SAMPLE) {
    const t = sampleTitle(titleId);
    if (permanent && !t.holder) throw new Error('Assign a holder first.');
    t.is_permanent = permanent ? '1' : '0';
    if (permanent) t.expires = null;
    return;
  }
  await adminPost({ action: 'admin_set_permanent', title_id: titleId, is_permanent: permanent ? 1 : 0 });
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
  await adminPost({ action: 'admin_update_reservation', id, title_id: titleId, start_time: toApi(start), duration: hours });
}

export async function adminCancelReservation(id) {
  if (USE_SAMPLE) {
    sample.reservations.splice(sample.reservations.indexOf(sampleReservation(id)), 1);
    return;
  }
  await adminPost({ action: 'admin_cancel_reservation', id });
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
  const fd = new FormData();
  fd.append('action', 'submit_request');
  fd.append('username', req.username);
  fd.append('title_id', req.titleId);
  fd.append('start_time', toApi(req.start));
  fd.append('duration', req.hours);
  fd.append('coordinates', req.coordinates);
  fd.append('notes', req.notes);
  await getJson(API, { method: 'POST', body: fd });
}
