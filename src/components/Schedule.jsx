import { useState } from 'react';
import { metaFor } from '../lib/titles.js';
import { hm, dayKey, dayLabel, tzName } from '../lib/time.js';

const DAYS_SHOWN = 7;

export default function Schedule({ upcoming: all, tz, error, loaded }) {
  const [filter, setFilter] = useState('');
  const now = new Date();
  // Today plus the next 6 days, counted in the viewer's timezone.
  const cutoff = dayKey(new Date(now.getTime() + DAYS_SHOWN * 86400000), tz);
  const upcoming = all.filter((r) => dayKey(r.start, tz) < cutoff);
  const names = [...new Set(upcoming.map((r) => r.title_name))];
  const active = names.includes(filter) ? filter : '';
  const shown = upcoming.filter((r) => !active || r.title_name === active);

  const groups = {};
  shown.forEach((r) => (groups[dayKey(r.start, tz)] ||= []).push(r));
  const today = dayKey(now, tz);

  return (
    <section id="schedule">
      <div className="sec-head">
        <h2>Requested titles</h2>
        <span>Next {DAYS_SHOWN} days · times shown in {tzName(tz)}</span>
      </div>

      {names.length > 1 && (
        <div className="chips">
          {['', ...names].map((n) => (
            <button key={n || 'all'} type="button" className={`chip${n === active ? ' on' : ''}`} onClick={() => setFilter(n)}>
              {n || 'All titles'}
            </button>
          ))}
        </div>
      )}

      {error && <div className="empty">Couldn't load the schedule: {error}</div>}
      {!error && !loaded && <div className="empty">Loading schedule…</div>}
      {!error && loaded && shown.length === 0 && (
        <div className="empty">No requests in the next {DAYS_SHOWN} days. Be the first to book a slot.</div>
      )}

      {Object.keys(groups).sort().map((key) => (
        <div className="day" key={key}>
          <h3>{key === today && 'Today · '}{dayLabel(groups[key][0].start, tz)}</h3>
          {groups[key].map((r, i) => {
            const coords = r.coordinates && r.coordinates !== 'null' ? r.coordinates : '';
            return (
              <div className="res" key={`${r.title_name}-${r.start_time}-${i}`} style={{ '--c': `var(--${metaFor(r.title_name).color})` }}>
                <div className="res-time">
                  {hm(r.start, tz)} – {hm(r.end, tz)}
                  <small>{hm(r.start, 'UTC')} – {hm(r.end, 'UTC')} UTC</small>
                </div>
                <div className="res-main">
                  <b>{r.title_name}</b> · {r.username}
                  {r.start <= now && <span className="live">ACTIVE</span>}
                  {(coords || r.notes) && (
                    <div className="res-meta">
                      {coords && `Coords ${coords}`}{coords && r.notes && ' · '}{r.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
