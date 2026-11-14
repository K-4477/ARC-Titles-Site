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

## Discord bot (optional)

Each new request is posted to a channel with **Edit** and **Cancel** buttons that only members with the Guardians role can use. 5 minutes before a request starts, the bot pings the Guardians role. Edits and cancellations made on the website's admin page update the Discord post too.

1. **Database.** If your tables were created before the bot existed, run `db/schema.sql` again in the Neon SQL Editor (it only adds two columns). Do this **before** deploying.
2. **Create the bot.** At https://discord.com/developers/applications click **New Application**, name it "Spirit Portal" and set its icon. Copy the **Public Key** from General Information. Under **Bot**, click **Reset Token** and copy the token.
3. **Invite it.** Under **OAuth2 → URL Generator**, tick the `bot` scope, then the **View Channels**, **Send Messages** and **Embed Links** permissions. Open the generated link and add the bot to your server. Make sure it can post in the bookings channel.
4. **IDs.** In Discord, turn on **User Settings → Advanced → Developer Mode**. Right-click the bookings channel → **Copy Channel ID**. In **Server Settings → Roles**, right-click Guardians → **Copy Role ID**.
5. **Reminders.** In the Vercel project, add **Upstash QStash** from the Marketplace and connect it. That sets the `QSTASH_*` variables.
6. **Variables.** Add `DISCORD_BOT_TOKEN` (Secret), `DISCORD_PUBLIC_KEY`, `DISCORD_CHANNEL_ID` and `DISCORD_GUARDIAN_ROLE_ID`, then redeploy.
7. **Buttons.** Back in the Developer Portal, under General Information, set **Interactions Endpoint URL** to `https://<your-site>/api/discord` and save. Discord checks the URL straight away, so do this after the deploy.

Times in the bot's Edit form are UTC (game time). The posts themselves show each reader's local time.

## How it works

| What | Where |
| --- | --- |
| API (all actions) | `api/index.js` |
| Login, session cookie, password hash | `server/auth.js` |
| Database client, rate limits | `server/db.js` |
| Discord posts, buttons, reminders | `server/discord.js`, `server/bookings.js`, `server/reminders.js`, `api/discord.js`, `api/remind.js` |
| Tables | `db/schema.sql` |
| Buff text, colours, max hours, booking window | `src/lib/titles.js` |
| Front-end API calls and sample data | `src/lib/api.js` |
| Request form / title cards / schedule | `src/components/` |
| Admin panel and calendar | `src/components/Admin.jsx`, `AdminCalendar.jsx` |
| Colours and layout | `src/styles.css` |

Rules the server enforces: 1 to 2 hour requests, 15-minute start times, up to 30 days ahead, no overlapping requests for a title (a database constraint), 10 submissions per hour per IP, and 8 failed admin logins per 15 minutes per IP. Finished requests older than 90 days are deleted automatically.
