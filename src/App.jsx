import { useCallback, useEffect, useMemo, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import TitleGrid from './components/TitleGrid.jsx';
import RequestForm from './components/RequestForm.jsx';
import Schedule from './components/Schedule.jsx';
import TimezonePicker from './components/TimezonePicker.jsx';
import { fetchAll, submitRequest, USE_SAMPLE } from './lib/api.js';
import { fromApi, hm, listZones, localZone } from './lib/time.js';
import { storage } from './lib/storage.js';

const REFRESH_MS = 60000;
const ZONES = listZones();

export default function App() {
  const [tz, setTz] = useState(() => {
    const saved = storage.get('arc_tz');
    return ZONES.some((z) => z.value === saved) ? saved : localZone();
  });
  const [titles, setTitles] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [titleId, setTitleId] = useState('');
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchAll();
      setTitles(data.titles);
      setReservations(data.reservations);
      setError('');
    } catch (e) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Reservations that haven't finished yet, with real Date objects, soonest first.
  const upcoming = useMemo(() => {
    const now = new Date();
    return reservations
      .map((r) => ({ ...r, start: fromApi(r.start_time), end: fromApi(r.end_time) }))
      .filter((r) => r.start && r.end && r.end > now)
      .sort((a, b) => a.start - b.start);
  }, [reservations]);

  function changeTz(value) {
    setTz(value);
    storage.set('arc_tz', value);
  }

  function pickTitle(id) {
    setTitleId(id);
    document.getElementById('request')?.scrollIntoView();
  }

  // Called by the form: (request) to send, or (null, message) for a validation error.
  async function handleSubmit(request, validationError) {
    if (!request) { toast(validationError, 'error'); return false; }
    try {
      await submitRequest(request);
      toast(USE_SAMPLE
        ? 'Sample mode: added to the sample schedule, nothing was sent.'
        : `Request sent for ${hm(request.start, 'UTC')} UTC. The Guardians will assign it at your slot.`);
      await load();
      document.getElementById('schedule')?.scrollIntoView();
      return true;
    } catch (e) {
      toast(e.message || 'Could not send the request.', 'error');
      return false;
    }
  }

  return (
    <>
      <TopBar tz={tz} />

      <header className="hero">
        <div className="wrap">
          <div className="eyebrow">Avatar: Realms Collide</div>
          <h1>Temple Title Requests</h1>
          <p>Book a title for the buff you need. Pick a slot, tell the Guardians where you are, and they'll assign it when your time comes.</p>
          <div className="tzpick">
            <span>Show times in</span>
            <TimezonePicker zones={ZONES} value={tz} onChange={changeTz} />
          </div>
          {USE_SAMPLE && (
            <div className="preview">Sample mode: showing made-up data and not sending requests. See the README to connect to the live server.</div>
          )}
        </div>
      </header>

      <main className="wrap">
        <TitleGrid titles={titles} upcoming={upcoming} tz={tz} error={error} onPick={pickTitle} />
        <RequestForm titles={titles} upcoming={upcoming} tz={tz}
          titleId={titleId} onTitleChange={setTitleId} onSubmit={handleSubmit} />
        <Schedule upcoming={upcoming} tz={tz} error={error} loaded={loaded} />
      </main>

      <footer>
        <div className="wrap">Questions? Reach the Guardian of Harmony in game. Fan-made tool for Server 1061, not affiliated with the game's publisher.</div>
      </footer>

      <div id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.type === 'error' ? ' error' : ''}`}>{t.message}</div>
        ))}
      </div>
    </>
  );
}
