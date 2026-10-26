# CGI CCTV Service Desk

A full-stack customer service and installation website for a CCTV company.

## What it does

- Customers create an account and submit either a CCTV complaint or a new installation request.
- After entering their address, product details, preferred date, and service requirements, the system creates a ticket and automatically schedules an available technician.
- Customers can view the ticket number and service status, see the scheduled visit date/time/technician, receive browser notifications, add the appointment to their phone calendar, save the service ticket as an image, and sign in later to track all previous requests.
- A separate secure admin dashboard lets the company add technicians, set service areas and daily capacity, view all customer requests, and update each job from new to scheduled, in progress, completed, or cancelled.

## Tech stack

- **Runtime:** Node.js with ESM
- **Framework:** Hono (lightweight web framework)
- **Database:** `@libsql/client` with SQLite — defaults to in-memory on Render, or file-based / Turso for persistence
- **Auth:** Sign in with Freebuff (Google, GitHub, Apple)

## Project structure

```
render-entry.js       # Node HTTP server entry point for Render
public/              # Static files: index.html, styles.css, app.js, favicon.svg, sw.js
src/
  app.jsx            # Original Hono app with JSX (kept for reference; current deploy uses render-entry.js)
  db.js              # Database helpers
  schedule.js        # Automated technician scheduling
  ui.jsx            # UI components
  pages/            # Page components (customer, admin, public)
```

## Running locally

```bash
npm install
PORT=3000 node render-entry.js
```

Then open http://localhost:3000

The app serves these routes:

| Route | Description |
|---|---|
| `/` | Landing page |
| `/signin` | Sign in page (redirects to Freebuff) |
| `/dashboard` | Customer dashboard (requires sign-in) |
| `/new` | New service request form (requires sign-in) |
| `/ticket/:id` | Ticket detail page (requires sign-in) |
| `/admin/setup` | Admin first-run setup (requires sign-in) |
| `/admin` | Admin overview (requires admin role) |
| `/admin/requests` | All customer requests (requires admin role) |
| `/admin/technicians` | Manage technicians (requires admin role) |
| `/admin/admins` | Manage admin team (requires owner role) |
| `/admin/join` | Join admin team with invite code (requires sign-in) |
| `/api/me` | Current user info (JSON API) |
| `/api/my/tickets` | User's tickets (JSON API) |
| `/api/tickets/:id` | Ticket detail (JSON API) |
| `/api/tickets/:id/calendar.ics` | iCalendar export for the appointment |

Static files in `public/` are served automatically (CSS, JS, favicon, etc.).

## Deploying on Render

### 1. Push to GitHub

The repo is already at `https://github.com/sarbajitsatpathy/cgi-cctv-service-desk`. Make sure the latest code is pushed:

```bash
git push origin main
```

### 2. Create a Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**
2. Connect the GitHub repo `sarbajitsatpathy/cgi-cctv-service-desk`
3. Configure:
   - **Name:** `cgi-cctv-service-desk` (or your choice)
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node render-entry.js`
   - **Plan:** Free
4. Click **Create Web Service**

### 3. Environment Variables

In the Render dashboard, go to **Environment** and add:

| Variable | Description |
|---|---|
| `APP_ORIGIN` | Your Render app URL, e.g. `https://cgi-cctv-service-desk.onrender.com` |
| `FREEBUFF_CLIENT_ID` | From your Freebuff auth setup |
| `FREEBUFF_ISSUER` | From your Freebuff auth setup |

Optional:

| Variable | Description |
|---|---|
| `TURSO_DATABASE_URL` | Set to a file URL like `file:/app/data.db` or a Turso cloud URL for persistent data. Without this, the app uses in-memory SQLite which resets on every restart. |
| `TURSO_AUTH_TOKEN` | Auth token if using Turso cloud |

### 4. First deploy

Render will build and start the app. The first deploy may take a couple minutes. Once live, open the URL shown in the Render dashboard.

## Database persistence on Render

By default the app uses **in-memory SQLite** (`file::memory:`). This is fine for testing but data is lost when the server restarts (which Render free tier does regularly).

For persistence, set `TURSO_DATABASE_URL=file:/app/data.db` in Render's environment variables. Render's free tier has a writable filesystem, so file-based SQLite will persist across restarts. Note: if Render recycles the instance or you change the build, the file may be lost — for production use consider Turso (cloud SQLite) or Render's built-in PostgreSQL.

## Freebuff auth setup

To enable sign-in:

1. Install the Freebuff CLI: `npm install -g @freebuff/auth` (or use `npx`)
2. Register your project:
   ```
   npx @freebuff/auth register \
     --project cgi-cctv-service-desk \
     --name "CGI CCTV Service Desk" \
     --environment production \
     --redirect-uri https://your-render-url.onrender.com/auth/freebuff/callback
   ```
3. Copy the returned `clientId` and `issuer` into Render's environment variables.
4. Set `APP_ORIGIN` to your Render URL.

For local development, register a development client with `http://localhost:3000/auth/freebuff/callback` as the redirect URI.

## License

Private — all rights reserved.
