import { useEffect, useMemo, useRef, useState } from 'react';

const norm = (s) => s.toLowerCase().replace(/−/g, '-').replace(/_/g, ' ');

// "+1", "utc+1", "gmt -5:30" -> "+1" / "-5:30". Anything else -> null.
function parseOffset(q) {
  const m = norm(q).replace(/\s+/g, '').match(/^(?:utc|gmt)?([+-]\d{1,2}(?::\d{2})?)$/);
  return m ? m[1] : null;
}

function matches(zone, q) {
  const wanted = parseOffset(q);
  if (wanted) {
    // Exact offset, so "+1" doesn't also list +10, +11 and +1:30.
    const o = norm(zone.offset).replace('utc', '');
    return o === wanted || (wanted.endsWith(':00') && o === wanted.slice(0, -3));
  }
  const hay = norm(`${zone.label} ${zone.value}`);
  return norm(q).split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

export default function TimezonePicker({ zones, value, onChange }) {
  const current = zones.find((z) => z.value === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const results = useMemo(
    () => (query.trim() ? zones.filter((z) => matches(z, query)) : zones),
    [zones, query]
  );

  // Keep the highlighted row in view and reset it when the results change.
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function show() {
    setOpen(true);
    // Start on the current zone when nothing has been typed yet.
    const i = zones.findIndex((z) => z.value === value);
    setActive(Math.max(i, 0));
  }

  function choose(zone) {
    if (zone) onChange(zone.value);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) return show();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open) { e.preventDefault(); choose(results[active]); }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div className="tzcombo">
      <input
        type="text"
        role="combobox"
        aria-label="Your timezone"
        aria-expanded={open}
        aria-controls="tz-list"
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search city or UTC offset"
        value={open ? query : current?.label || ''}
        onFocus={(e) => { show(); e.target.select(); }}
        onBlur={() => { setOpen(false); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id="tz-list" ref={listRef} role="listbox">
          {results.length === 0 && <li className="none">No matching timezone</li>}
          {results.map((z, i) => (
            <li
              key={z.value}
              role="option"
              aria-selected={z.value === value}
              className={`${i === active ? 'active' : ''}${z.value === value ? ' sel' : ''}`}
              // mousedown (not click) so the input's blur doesn't close the list first
              onMouseDown={(e) => { e.preventDefault(); choose(z); }}
              onMouseEnter={() => setActive(i)}
            >
              {z.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
