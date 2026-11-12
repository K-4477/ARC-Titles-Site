import Icon from './Icon.jsx';
import { metaFor, sortTitles, isPermanent } from '../lib/titles.js';
import { fromApi, hm, shortDate } from '../lib/time.js';

function TitleCard({ title, next, tz, onPick }) {
  const meta = metaFor(title.name);
  const permanent = isPermanent(title);
  const expires = fromApi(title.expires);

  let status;
  if (permanent) {
    status = <><span className="dot perm" /><span>Permanent · <b>{title.holder}</b></span></>;
  } else if (title.holder) {
    status = <><span className="dot held" /><span>Held by <b>{title.holder}</b>{expires && ` until ${hm(expires, tz)}`}</span></>;
  } else {
    status = <><span className="dot" /><span><b>Available now</b></span></>;
  }

  return (
    <article className={`card${title.name === 'Guardian of Harmony' ? ' featured' : ''}`} style={{ '--c': `var(--${meta.color})` }}>
      <div className="card-top">
        <div className="ico"><Icon name={meta.icon} /></div>
        <h3>{title.name}</h3>
      </div>
      <div className="buff">{meta.buff}</div>
      <div className="status">{status}</div>
      {next && (
        <div className="next">Next: {next.username} · {shortDate(next.start, tz)} {hm(next.start, tz)}</div>
      )}
      {!permanent && (
        <button className="btn" type="button" onClick={() => onPick(String(title.id))}>
          Request this title
        </button>
      )}
    </article>
  );
}

export default function TitleGrid({ titles, upcoming, tz, error, onPick }) {
  const now = new Date();
  const free = titles.filter((t) => !t.holder).length;

  return (
    <section id="titles">
      <div className="sec-head">
        <h2>Titles &amp; buffs</h2>
        <span>{titles.length > 0 && `${free} available right now`}</span>
      </div>
      <div className="grid">
        {error && titles.length === 0 && <div className="empty">Couldn't load titles: {error}</div>}
        {!error && titles.length === 0 && <div className="empty">Loading titles…</div>}
        {sortTitles(titles).map((t) => (
          <TitleCard
            key={t.id}
            title={t}
            tz={tz}
            onPick={onPick}
            next={upcoming.find((r) => r.title_name === t.name && r.start > now)}
          />
        ))}
      </div>
    </section>
  );
}
