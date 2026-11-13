# ARC Title Requests

Title booking site for Server 1061 of Avatar: Realms Collide. React + Vite front end, one Vercel Function for the API, Neon Postgres for data.

## Run it locally

```bash
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). It runs in **sample mode** with made-up data and sends nothing anywhere. The admin panel is at `/#/admin` and the sample password is `admin`.

To run against the real API and database, use the Vercel CLI instead: `npm i -g vercel`, `vercel link`, put `VITE_LIVE=1` in `.env.local`, then `vercel dev`. This uses the real database, so anything you submit is real.

## First-time setup (Vercel + Neon)

1. **Database.** In the Vercel project, open **Storage** (or **Integrations → Marketplace**), add **Neon**, and connect it to this project. That sets `DATABASE_URL`.
2. **Tables.** Open the Neon console → **SQL Editor**, paste the whole of `db/schema.sql`, and run it. It creates the tables and the nine titles (Guardian of Harmony held permanently by Siu Mai).
3. **Admin password.** Run `npm run hash-password` and choose a password. Add the two printed lines, `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`, under **Project → Settings → Environment Variables**.
4. **Deploy.** Push to `main`, or redeploy from the Vercel dashboard so the new variables are picked up.

To change the admin password later, run `npm run hash-password` again, replace both variables and redeploy. Everyone is logged out.

## How it works

| What | Where |
| --- | --- |
| API (all actions) | `api/index.js` |
| Login, session cookie, password hash | `server/auth.js` |
| Database client, rate limits | `server/db.js` |
| Tables | `db/schema.sql` |
| Buff text, colours, max hours, booking window | `src/lib/titles.js` |
| Front-end API calls and sample data | `src/lib/api.js` |
| Request form / title cards / schedule | `src/components/` |
| Admin panel and calendar | `src/components/Admin.jsx`, `AdminCalendar.jsx` |
| Colours and layout | `src/styles.css` |

Rules the server enforces: 1 to 2 hour requests, 15-minute start times, up to 30 days ahead, no overlapping requests for a title (a database constraint), 10 submissions per hour per IP, and 8 failed admin logins per 15 minutes per IP. Finished requests older than 90 days are deleted automatically.
