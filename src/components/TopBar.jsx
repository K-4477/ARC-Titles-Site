import { useEffect, useState } from 'react';
import { hm } from '../lib/time.js';

export default function TopBar({ tz }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bar">
      <div className="wrap">
        <div className="brand">Temple · Server 1061</div>
        <div className="clock">
          Server <b>{hm(now, 'UTC')} UTC</b>
          {tz !== 'UTC' && <> · You <b>{hm(now, tz)}</b></>}
        </div>
        <nav>
          <a href="#titles">Titles</a>
          <a href="#request">Request</a>
          <a href="#schedule">Schedule</a>
          <a className="admin-link" href="#/admin">Admin</a>
        </nav>
      </div>
    </div>
  );
}
