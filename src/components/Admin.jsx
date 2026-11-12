import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import AdminCalendar from './AdminCalendar.jsx';
import { metaFor, sortTitles, isPermanent } from '../lib/titles.js';
import { fromApi, hm, shortDate, localZone, tzName } from '../lib/time.js';
import {
  USE_SAMPLE, fetchTitles, fetchAdminReservations, adminSession, adminLogin, adminLogout,
  adminAssign, adminRelease, adminSetPermanent
} from '../lib/api.js';

const TZ = localZone();

function Status({ title }) {
  const expires = fromApi(title.expires);
  const since = fromApi(title.held_since);
  if (!title.holder) return <span className="status"><span className="dot" /><span><b>Available</b></span></span>;
  if (isPermanent(title)) {
    return <span className="status"><span className="dot perm" /><span>Permanent · <b>{title.holder}</b></span></span>;
  }
  const expired = expires && expires < new Date();
  return (
    <span className="status">
      <span className="dot held" />
      <span>
        <b>{title.holder}</b>
        {since && <> · since {shortDate(since, TZ)} {hm(since, TZ)}</>}
        {expires && (
          <>
            <br />
            {expired ? 'Expired ' : 'Expires '}
            {shortDate(expires, TZ)} {hm(expires, TZ)} <i>({hm(expires, 'UTC')} UTC)</i>
          </>
        )}
      </span>
    </span>
  );
}

function AdminRow({ title, onAction }) {
  const meta = metaFor(title.name);
  const permanent = isPermanent(title);
  const [holder, setHolder] = useState('');
  const [hours, setHours] = useState('1');
  const [busy, setBusy] = useState(false);

  async function run(fn, okMessage) {
    setBusy(true);
    const ok = await onAction(fn, okMessage);
    setBusy(false);
    return ok;
  }

  async function assign(e) {
    e.preventDefault();
    const name = holder.trim();
    const h = Number(hours);
    if (!name) return onAction(null, null, 'Enter the player to assign.');
    if (!(h > 0 && h <= 24 * 30)) return onAction(null, null, 'Duration must be between 0 and 720 hours.');
    if (title.holder && !window.confirm(`${title.name} is held by ${title.holder}. Replace them with ${name}?`)) return;
    const ok = await run(() => adminAssign({ titleId: title.id, holder: name, hours: h }),
      `${title.name} assigned to ${name} for ${h} hour${h === 1 ? '' : 's'}.`);
    if (ok) setHolder('');
  }

  function release() {
    if (!window.confirm(`Release ${title.name} from ${title.holder}?`)) return;
    run(() => adminRelease(title.id), `${title.name} released.`);
  }

  function togglePermanent() {
    run(() => adminSetPermanent(title.id, !permanent),
      `${title.name} is now ${permanent ? 'not permanent' : 'permanent'}.`);
  }

  return (
    <article className="arow" style={{ '--c': `var(--${meta.color})` }}>
      <div className="arow-title">
        <div className="ico"><Icon name={meta.icon} /></div>
        <h3>{title.name}</h3>
      </div>
      <div className="arow-status"><Status title={title} /></div>
      <form className="arow-assign" onSubmit={assign}>
        <input aria-label={`Player for ${title.name}`} placeholder="Player name" maxLength={40}
          value={holder} onChange={(e) => setHolder(e.target.value)} />
        <input aria-label="Duration in hours" type="number" min="0.25" step="0.25" max="720"
          value={hours} onChange={(e) => setHours(e.target.value)} />
        <span className="unit">h</span>
        <button className="btn" type="submit" disabled={busy}>Assign</button>
      </form>
      <div className="arow-actions">
        <button className="btn" type="button" disabled={busy || !title.holder} onClick={release}>Release</button>
        <button className="btn" type="button" disabled={busy || !title.holder}
          title={title.holder ? '' : 'Assign a holder first'} onClick={togglePermanent}>
          {permanent ? 'Make temporary' : 'Make permanent'}
        </button>
      </div>
    </article>
  );
}

function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminLogin(password);
      onDone();
    } catch (err) {
      setError(err.message || 'Could not log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel login" onSubmit={submit}>
      <h2>Admin login</h2>
      <label htmlFor="adminpw">Password</label>
      <input id="adminpw" type="password" autoComplete="current-password" autoFocus
        value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <div className="convert warn" style={{ marginTop: 12 }}>{error}</div>}
      {USE_SAMPLE && <div className="hint">Sample mode: the password is <b>admin</b>.</div>}
      <button className="btn primary" type="submit" disabled={busy || !password} style={{ marginTop: 16 }}>
        {busy ? 'Checking…' : 'Log in'}
      </button>
    </form>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(null); // null = checking
  const [titles, setTitles] = useState([]);
  const [error, setError] = useState('');
  const [reservations, setReservations] = useState([]);
  const [resError, setResError] = useState('');
  const [tab, setTab] = useState('titles');
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  // Titles and reservations load separately so one failing doesn't hide the other.
  const load = useCallback(async () => {
    const [t, r] = await Promise.allSettled([fetchTitles(), fetchAdminReservations()]);
    if (t.status === 'fulfilled') { setTitles(t.value); setError(''); }
    else setError(t.reason?.message || 'Could not load titles.');
    if (r.status === 'fulfilled') {
      setReservations(r.value.map((x) => ({ ...x, start: fromApi(x.start_time), end: fromApi(x.end_time) }))
        .filter((x) => x.start && x.end));
      setResError('');
    } else setResError(r.reason?.message || 'Could not load requests.');
  }, []);

  useEffect(() => { adminSession().then(setAuthed); }, []);
  useEffect(() => { if (authed) load(); }, [authed, load]);

  // Rows call this with an async action, or (null, null, message) for a validation error.
  async function onAction(fn, okMessage, validationError) {
    if (!fn) { toast(validationError, 'error'); return false; }
    try {
      await fn();
      toast(okMessage);
      await load();
      return true;
    } catch (e) {
      // A dropped session shows up as a failed action, so re-check it.
      toast(e.message || 'That did not work.', 'error');
      if (!(await adminSession())) setAuthed(false);
      return false;
    }
  }

  async function logout() {
    try { await adminLogout(); } catch { /* the session is gone either way once we leave */ }
    setAuthed(false);
    setTitles([]);
    setReservations([]);
  }

  return (
    <>
      <div className="bar">
        <div className="wrap">
          <div className="brand">Temple · Admin</div>
          <nav>
            <a href="#titles">Back to site</a>
            {authed && <a href="#/admin" onClick={(e) => { e.preventDefault(); logout(); }}>Log out</a>}
          </nav>
        </div>
      </div>

      <main className="wrap">
        {USE_SAMPLE && (
          <div className="preview">Sample mode: changes only affect made-up data in this browser tab and are lost on reload.</div>
        )}

        {authed === null && <div className="empty" style={{ marginTop: 34 }}>Checking session…</div>}

        {authed === false && <Login onDone={() => setAuthed(true)} />}

        {authed && (
          <div className="chips tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'titles'}
              className={`chip${tab === 'titles' ? ' on' : ''}`} onClick={() => setTab('titles')}>Titles</button>
            <button type="button" role="tab" aria-selected={tab === 'calendar'}
              className={`chip${tab === 'calendar' ? ' on' : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
          </div>
        )}

        {authed && tab === 'calendar' && (
          resError
            ? <div className="empty">Couldn't load requests: {resError}</div>
            : <AdminCalendar reservations={reservations} titles={titles} tz={TZ} onAction={onAction} />
        )}

        {authed && tab === 'titles' && (
          <section>
            <div className="sec-head">
              <h2>Manage titles</h2>
              <span>Times shown in {tzName(TZ)}, with UTC alongside expiry</span>
            </div>
            {error && <div className="empty">Couldn't load titles: {error}</div>}
            {!error && titles.length === 0 && <div className="empty">Loading titles…</div>}
            <div className="alist">
              {sortTitles(titles).map((t) => <AdminRow key={t.id} title={t} onAction={onAction} />)}
            </div>
          </section>
        )}
      </main>

      <div id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.type === 'error' ? ' error' : ''}`}>{t.message}</div>
        ))}
      </div>
    </>
  );
}
