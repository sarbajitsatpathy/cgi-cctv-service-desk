# CGI CCTV Service Desk

Customer-facing CCTV complaint and installation request website with technician scheduling and an admin dashboard.

## Deployment

This app is set up for [Render](https://render.com) deployment.

### Prerequisites

1. Create a [Render account](https://dashboard.render.com/signup)
2. Connect your Git repository (GitHub/Bitbucket/GitLab) to Render
3. Create a new **Web Service** in the Render dashboard

### Render Web Service settings

- **Name:** `cgi-cctv-service-desk` (or your choice)
- **Environment:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `node render-entry.js`
- **Plan:** Free (or Starter)

The `.render.yaml` file in this repository provides a Blueprint you can also use to create the service automatically.

### Database

The app uses file-based SQLite via `@libsql/client`. Render's free tier provides a writable filesystem, so `data.db` is created automatically in the app directory on first run. No external database setup is needed.

> **Note:** On Render's free tier, the filesystem is ephemeral — the database resets when the service restarts. For persistent data, use Render's PostgreSQL offering or a cloud SQLite service like Turso. To switch to Turso, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` environment variables in the Render dashboard.

### Environment Variables

Set these in the Render dashboard (Environment Variables section):

| Variable | Value | Description |
|----------|-------|-------------|
| `FREEBUFF_CLIENT_ID` | (from Freebuff) | Auth client ID |
| `FREEBUFF_ISSUER` | (from Freebuff) | Auth issuer URL |
| `APP_ORIGIN` | `https://your-app.onrender.com` | App origin URL |
| `TURSO_DATABASE_URL` | (optional) | Turso DB URL if using Turso |
| `TURSO_AUTH_TOKEN` | (optional) | Turso auth token if using Turso |

For local auth testing, register a development client:
```
npx @freebuff/auth register --project cgi-cctv-service-desk --name "CGI CCTV Service Desk" --environment development --redirect-uri http://localhost:3000/auth/freebuff/callback
```

### Local Development

```bash
npm install
npm run build
npm run start:render   # Runs the app locally on port 3000
```

### Routes

- `/` — Public homepage
- `/book` — Submit a complaint or installation request
- `/track` — Track a ticket by number
- `/admin` — Admin dashboard (requires sign-in with admin role)
- `/api/tickets` — Ticket CRUD API
- `/auth/freebuff/*` — Sign in with Freebuff

## Tech Stack

- [Hono](https://hono.dev) — web framework
- [React](https://react.dev) (via hono/jsx) — UI rendering
- [@libsql/client](https://github.com/tursodatabase/libsql-client-ts) — SQLite driver
- [@freebuff/auth](https://freebuff.com) — authentication
- esbuild — bundler
