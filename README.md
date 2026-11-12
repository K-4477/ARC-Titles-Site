# ARC Title Requests

React + Vite front end for the Server 1050 title request site.

## Run it

```bash
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). It starts in **sample mode** with made-up data, so you can't break anything.

To develop against the real server, copy `.env.example` to `.env.local` and set `VITE_LIVE=1`, then restart `npm run dev`. Requests you submit are then real.

## Deploy

```bash
npm run build
```

Upload everything inside `dist/` to the folder on the server that holds `api.php` (back up the existing `index` file first).

## Where things are

| What | File |
| --- | --- |
| Buff text, colours, max hours | `src/lib/titles.js` |
| Colours and layout | `src/styles.css` |
| Request form | `src/components/RequestForm.jsx` |
| Title cards | `src/components/TitleGrid.jsx` |
| Schedule | `src/components/Schedule.jsx` |
| API calls and sample data | `src/lib/api.js` |
