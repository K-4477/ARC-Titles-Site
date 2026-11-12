import { useMemo, useState } from 'react';
import { metaFor, sortTitles } from '../lib/titles.js';
import { dayKey, dayLabel, hm, shortDate, zonedToDate, TIME_SLOTS } from '../lib/time.js';
import { adminUpdateReservation, adminCancelReservation } from '../lib/api.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

/** 5 or 6 weeks of { key: 'YYYY-MM-DD', day, inMonth } starting on a Monday. Pure calendar maths, no zones. */
function monthGrid(y, m) {
  const offset = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const cells = [];
  for (let i = -offset; cells.length < 42; i++) {
    const d = new Date(Date.UTC(y, m, 1 + i));
    cells.push({ key: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m });
  }
  return cells[35].inMonth ? cells : cells.slice(0, 35);
}

function EditForm({ res, titles, reservations, tz, onSave, onClose }) {
  const [titleId, setTitleId] = useState(() => String(res.title_id ?? titles.find((t) => t.name === res.title_name)?.id ?? ''));
  const [date, setDate] = useState(() => dayKey(res.start, tz));
  const [time, setTime] = useState(() => hm(res.start, tz));
  const [hours, setHours] = useState(() => String((res.end - res.start) / 3600000));
  const [busy, setBusy] = useState(false);

  const title = titles.find((t) => String(t.id) === titleId);
  // Existing requests may not sit on a 15-minute mark, so make sure the current value is selectable.
  const slots = TIME_SLOTS.includes(time) ? TIME_SLOTS : [...TIME_SLOTS, time].sort();
  const h = Number(hours);
  const valid = title && date && time && h > 0;
  const start = valid ? zonedToDate(date, time, tz) : null;
  const end = valid ? new Date(start.getTime() + h * 3600000) : null;
  const clash = valid
    ? reservations.find((o) => o.id !== res.id && o.title_name === title.name && o.start < end && o.end > start)
    : null;

  async function save(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const ok = await onSave({ id: res.id, titleId: title.id, titleName: title.name, start, hours: h },
      `${res.username}'s request updated.`);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <form className="edit-res" onSubmit={save}>
      <div>
        <label htmlFor={`et-${res.id}`}>Title</label>
        <select id={`et-${res.id}`} value={titleId} onChange={(e) => setTitleId(e.target.value)}>
          {sortTitles(titles).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`ed-${res.id}`}>Date</label>
        <input id={`ed-${res.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`etm-${res.id}`}>Start time</label>
        <select id={`etm-${res.id}`} value={time} onChange={(e) => setTime(e.target.value)}>
          {slots.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`eh-${res.id}`}>Hours</label>
        <input id={`eh-${res.id}`} type="number" min="0.25" step="0.25" max="48" value={hours}
          onChange={(e) => setHours(e.target.value)} />
      </div>
      <div className={`full convert${clash ? ' warn' : ''}`}>
        {!valid && 'Fill in every field.'}
        {valid && clash && <>Overlaps {clash.username}'s request ({hm(clash.start, tz)} – {hm(clash.end, tz)}). Admins can still save it.</>}
        {valid && !clash && <>New slot: <b>{shortDate(start, tz)}, {hm(start, tz)} – {hm(end, tz)}</b> your time = <b>{hm(start, 'UTC')} – {hm(end, 'UTC')} UTC</b></>}
      </div>
      <div className="full edit-actions">
        <button className="btn primary" type="submit" disabled={!valid || busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button className="btn" type="button" onClick={onClose} disabled={busy}>Discard</button>
      </div>
    </form>
  );
}

function ResRow({ res, tz, titles, reservations, editing, onEdit, onAction }) {
  const meta = metaFor(res.title_name);
  const canAct = res.id != null && res.id !== '';
  const past = res.end < new Date();

  async function cancel() {
    if (!window.confirm(`Cancel ${res.username}'s request for ${res.title_name} (${shortDate(res.start, tz)} ${hm(res.start, tz)})?`)) return;
    await onAction(() => adminCancelReservation(res.id), `${res.username}'s request was cancelled.`);
  }

  return (
    <div className="res" style={{ '--c': `var(--${meta.color})` }}>
      <div className="res-time">
        {hm(res.start, tz)} – {hm(res.end, tz)}
        <small>{hm(res.start, 'UTC')} – {hm(res.end, 'UTC')} UTC</small>
      </div>
      <div className="res-main">
        <div><b>{res.title_name}</b> · {res.username}{past && <span className="past">Finished</span>}</div>
        <div className="res-meta">
          {res.coordinates && <>Coordinates {res.coordinates}</>}
          {res.coordinates && res.notes && ' · '}
          {res.notes}
        </div>
        {editing ? (
          <EditForm res={res} titles={titles} reservations={reservations} tz={tz}
            onSave={(fields, msg) => onAction(() => adminUpdateReservation(fields), msg)}
            onClose={() => onEdit(null)} />
        ) : (
          <div className="res-actions">
            <button className="btn" type="button" disabled={!canAct} onClick={() => onEdit(res.id)}>Edit</button>
            <button className="btn danger" type="button" disabled={!canAct} onClick={cancel}>Cancel request</button>
            {!canAct && <span className="hint">The server didn't send an id for this request, so it can't be changed.</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminCalendar({ reservations, titles, tz, onAction }) {
  const todayKey = dayKey(new Date(), tz);
  const [month, setMonth] = useState(() => ({ y: Number(todayKey.slice(0, 4)), m: Number(todayKey.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(todayKey);
  const [editingId, setEditingId] = useState(null);

  const byDay = useMemo(() => {
    const map = {};
    [...reservations].sort((a, b) => a.start - b.start).forEach((r) => {
      (map[dayKey(r.start, tz)] ||= []).push(r);
    });
    return map;
  }, [reservations, tz]);

  const cells = useMemo(() => monthGrid(month.y, month.m), [month]);
  const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(month.y, month.m, 1)));
  const shiftMonth = (n) => setMonth(({ y, m }) => {
    const d = new Date(Date.UTC(y, m + n, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  const dayList = byDay[selected] || [];

  function pick(key) {
    setSelected(key);
    setEditingId(null);
    if (key.slice(0, 7) !== `${month.y}-${String(month.m + 1).padStart(2, '0')}`) {
      setMonth({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 });
    }
  }

  return (
    <section>
      <div className="sec-head">
        <h2>Calendar</h2>
        <span>{reservations.length} request{reservations.length === 1 ? '' : 's'} in total</span>
      </div>

      <div className="panel cal">
        <div className="cal-nav">
          <button className="btn" type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
          <h3>{monthLabel}</h3>
          <button className="btn" type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
          <button className="btn" type="button" onClick={() => pick(todayKey)}>Today</button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((c) => {
            const list = byDay[c.key] || [];
            return (
              <button key={c.key} type="button"
                className={`cal-day${c.inMonth ? '' : ' out'}${c.key === todayKey ? ' today' : ''}${c.key === selected ? ' sel' : ''}`}
                onClick={() => pick(c.key)}
                aria-label={`${c.key}, ${list.length} request${list.length === 1 ? '' : 's'}`}>
                <span className="cal-num">{c.day}</span>
                {list.slice(0, MAX_CHIPS).map((r) => (
                  <span key={r.id ?? `${r.title_name}${r.start_time}`} className="cal-chip"
                    style={{ '--c': `var(--${metaFor(r.title_name).color})` }}>
                    {hm(r.start, tz)} {r.title_name.replace('Guardian of ', '')}
                  </span>
                ))}
                {list.length > MAX_CHIPS && <span className="cal-more">+{list.length - MAX_CHIPS} more</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="day" style={{ marginTop: 22 }}>
        <h3>{dayLabel(zonedToDate(selected, '12:00', tz), tz)}</h3>
        {dayList.length === 0 && <div className="empty">No requests on this day.</div>}
        {dayList.map((r) => (
          <ResRow key={r.id ?? `${r.title_name}${r.start_time}`} res={r} tz={tz} titles={titles}
            reservations={reservations} editing={r.id != null && editingId === r.id}
            onEdit={setEditingId} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}
