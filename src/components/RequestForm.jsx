import { useEffect, useMemo, useRef, useState } from 'react';
import { metaFor, sortTitles, isPermanent, MAX_HOURS } from '../lib/titles.js';
import { zonedToDate, hm, shortDate, dayKey, nextHour, tzName, TIME_SLOTS } from '../lib/time.js';
import { storage } from '../lib/storage.js';

const HOURS = Array.from({ length: MAX_HOURS }, (_, i) => i + 1);

export default function RequestForm({ titles, upcoming, tz, titleId, onTitleChange, onSubmit }) {
  const [username, setUsername] = useState(() => storage.get('arc_name') || '');
  const [{ date, time }, setWhen] = useState(() => nextHour(tz));
  const [hours, setHours] = useState(1);
  const [coordX, setCoordX] = useState('');
  const [coordY, setCoordY] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);

  // Clicking "Request this title" on a card moves focus here.
  useEffect(() => {
    if (titleId && !username) nameRef.current?.focus({ preventScroll: true });
  }, [titleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestable = useMemo(() => sortTitles(titles).filter((t) => !isPermanent(t)), [titles]);
  const title = titles.find((t) => String(t.id) === titleId);

  const slot = useMemo(() => {
    if (!date || !time) return null;
    const start = zonedToDate(date, time, tz);
    return { start, end: new Date(start.getTime() + hours * 3600000) };
  }, [date, time, tz, hours]);

  const clash = slot && title
    ? upcoming.find((r) => r.title_name === title.name && r.start < slot.end && r.end > slot.start)
    : null;
  const inPast = slot && slot.start < new Date();

  let convert;
  if (!slot) convert = <>Pick a date and time to see it converted to server time (UTC).</>;
  else if (inPast) convert = <>That time has already passed. Pick a later slot.</>;
  else if (clash) convert = <>That overlaps {clash.username}'s request ({hm(clash.start, tz)} – {hm(clash.end, tz)}). Pick another time.</>;
  else convert = (
    <>
      Your slot: <b>{shortDate(slot.start, tz)}, {hm(slot.start, tz)} – {hm(slot.end, tz)}</b> your time
      {' = '}
      <b>{shortDate(slot.start, 'UTC')}, {hm(slot.start, 'UTC')} – {hm(slot.end, 'UTC')} UTC</b>
    </>
  );

  async function handleSubmit(e) {
    e.preventDefault();
    const name = username.trim();
    const x = coordX.trim();
    const y = coordY.trim();
    const fail = (msg) => onSubmit(null, msg);

    if (!name) return fail('Enter your in-game name.');
    if (!title) return fail('Choose a title.');
    if (!slot) return fail('Choose a date and start time.');
    if (inPast) return fail('That time has already passed.');
    if (clash) return fail('That slot overlaps another request for this title.');
    if ((x || y) && !(/^\d{1,4}$/.test(x) && /^\d{1,4}$/.test(y))) {
      return fail('Coordinates should be two numbers, or leave both blank.');
    }

    storage.set('arc_name', name);
    setBusy(true);
    const ok = await onSubmit({
      username: name, titleId, titleName: title.name,
      start: slot.start, end: slot.end, hours,
      coordinates: x ? `${x}:${y}` : '', notes: notes.trim()
    });
    setBusy(false);
    if (ok) { setNotes(''); setCoordX(''); setCoordY(''); }
  }

  return (
    <section id="request">
      <div className="sec-head">
        <h2>Request a title</h2>
        <span>Up to {MAX_HOURS} hours per request</span>
      </div>
      <form className="panel" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div>
            <label htmlFor="username">In-game name</label>
            <input id="username" ref={nameRef} value={username} onChange={(e) => setUsername(e.target.value)}
              maxLength={40} autoComplete="nickname" placeholder="Your governor name" />
          </div>
          <div>
            <label htmlFor="titleSelect">Title</label>
            <select id="titleSelect" value={titleId} onChange={(e) => onTitleChange(e.target.value)}>
              <option value="">Select a title</option>
              {requestable.map((t) => {
                const buff = metaFor(t.name).buff;
                return <option key={t.id} value={t.id}>{t.name}{buff && ` — ${buff.replace('\n', ' · ')}`}</option>;
              })}
            </select>
            <div className="selbuff">{title ? metaFor(title.name).buff : ''}</div>
          </div>
          <div>
            <label htmlFor="date">Date</label>
            <input type="date" id="date" value={date} min={dayKey(new Date(), tz)}
              onChange={(e) => setWhen({ date: e.target.value, time })} />
          </div>
          <div>
            <label htmlFor="time">Start time <i>({tzName(tz)})</i></label>
            <select id="time" value={time}
              onChange={(e) => setWhen({ date, time: e.target.value })}>
              {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className={`full convert${slot && (inPast || clash) ? ' warn' : ''}`}>{convert}</div>
          <div>
            <span className="lbl">Duration</span>
            <div className="seg">
              {HOURS.map((h) => (
                <label key={h}>
                  <input type="radio" name="duration" checked={hours === h} onChange={() => setHours(h)} />
                  <span>{h} hour{h > 1 ? 's' : ''}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="coordX">Map coordinates <i>(optional)</i></label>
            <div className="row">
              <input id="coordX" inputMode="numeric" placeholder="X" aria-label="X coordinate"
                value={coordX} onChange={(e) => setCoordX(e.target.value)} />
              <span>:</span>
              <input id="coordY" inputMode="numeric" placeholder="Y" aria-label="Y coordinate"
                value={coordY} onChange={(e) => setCoordY(e.target.value)} />
            </div>
            <div className="hint">Helps the Guardians find your city quickly.</div>
          </div>
          <div className="full">
            <label htmlFor="notes">Notes for the Guardians <i>(optional)</i></label>
            <textarea id="notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything they should know, e.g. what you're using the buff for" />
          </div>
          <div className="full form-foot">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Submit request'}
            </button>
            <span className="hint" style={{ margin: 0 }}>Requests are stored in UTC. The conversion is done for you.</span>
          </div>
        </div>
      </form>
    </section>
  );
}
