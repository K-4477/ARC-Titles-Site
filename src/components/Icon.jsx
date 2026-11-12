const PATHS = {
  harmony: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  water: <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" />,
  earth: <path d="M3 19l6-10 4 6 2-3 6 7z" />,
  air: <path d="M3 9h10a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6" />,
  fire: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />,
  governor: <path d="M4 20h16M5 10h14M12 4l8 6H4zM7 10v10M12 10v10M17 10v10" />,
  architect: <path d="M4 20h16L4 4zM8 16h4v-4" />,
  prefect: <path d="M12 7v13M12 7a3 3 0 0 0-3-2H4v13h5a3 3 0 0 1 3 2 3 3 0 0 1 3-2h5V5h-5a3 3 0 0 0-3 2z" />,
  general: <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />
};

export default function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name] || PATHS.harmony}
    </svg>
  );
}
