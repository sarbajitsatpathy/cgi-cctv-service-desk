import { createClient } from '@libsql/client';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { lookup } from 'mime-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT, 10) || 3000;
const BASE_URL = process.env.APP_ORIGIN || 'http://localhost:' + PORT;
const CLIENT_ID = process.env.FREEBUFF_CLIENT_ID || '';
const ISSUER = process.env.FREEBUFF_ISSUER || '';
const DB_URL = process.env.TURSO_DATABASE_URL || 'file::memory:';
const DB_AUTH = process.env.TURSO_AUTH_TOKEN || undefined;
const publicDir = join(__dirname, 'public');

console.log('Starting server on port ' + PORT);
console.log('DB: ' + DB_URL);

const db = createClient({ url: DB_URL, authToken: DB_AUTH });

async function ensureSchema() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_no TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        owner_sub TEXT NOT NULL,
        contact_name TEXT DEFAULT '',
        contact_phone TEXT DEFAULT '',
        address_line TEXT DEFAULT '',
        area TEXT DEFAULT '',
        product TEXT DEFAULT '',
        model TEXT DEFAULT '',
        quantity INTEGER DEFAULT 1,
        requirements TEXT DEFAULT '',
        preferred_date TEXT DEFAULT '',
        time_slot TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        technician_id INTEGER,
        scheduled_date TEXT,
        scheduled_slot TEXT,
        admin_notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS technicians (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        service_areas TEXT NOT NULL DEFAULT '[]',
        daily_capacity INTEGER DEFAULT 5,
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_by TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS admins (
        sub TEXT PRIMARY KEY,
        role TEXT NOT NULL DEFAULT 'admin',
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  } catch (err) {
    console.error('Schema error:', err ? err.message : err);
  }
}

function serveStaticFile(urlPath) {
  if (urlPath === '/') {
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      const body = readFileSync(indexPath);
      return { status: 200, body, headers: { 'Content-Type': 'text/html; charset=utf-8' } };
    }
  }
  const decoded = decodeURIComponent(urlPath);
  const filePath = join(publicDir, decoded);
  if (filePath.startsWith(publicDir) && existsSync(filePath) && statSync(filePath).isFile()) {
    const ct = lookup(filePath) || 'application/octet-stream';
    const body = readFileSync(filePath);
    return { status: 200, body, headers: { 'Content-Type': ct } };
  }
  return { status: 404 };
}

async function getUser(req) {
  if (!CLIENT_ID || !ISSUER) return undefined;
  try {
    const { createFreebuffAuth } = await import('@freebuff/auth');
    const auth = createFreebuffAuth({
      clientId: CLIENT_ID,
      issuer: ISSUER,
      baseUrl: BASE_URL,
      allowInsecureLocalhost: BASE_URL.startsWith('http://localhost') || BASE_URL.startsWith('http://127.0.0.1')
    });
    return auth.getUser(req);
  } catch (err) {
    console.error('Auth error:', err ? err.message : err);
    return undefined;
  }
}

function landingHTML(year) {
  const signinLink = CLIENT_ID ? '<a href="/signin" class="btn btn-ghost">Sign in</a>' : '';
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>CGI CCTV Service Desk</title>\n  <link rel="stylesheet" href="/styles.css">\n  <link rel="icon" href="/favicon.svg" type="image/svg+xml">\n</head>\n<body>\n  <div class="landing">\n    <header>\n      <div class="logo">\n        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">\n          <circle cx="20" cy="20" r="19" fill="#1a1a2e"/>\n          <circle cx="20" cy="20" r="14" fill="none" stroke="#00d4aa" stroke-width="2"/>\n          <circle cx="20" cy="20" r="6" fill="#00d4aa"/>\n          <circle cx="28" cy="13" r="2" fill="#00d4aa"/>\n        </svg>\n        <div>\n          <h1>CGI CCTV Service Desk</h1>\n          <p class="tagline">Faster, Simpler, Safer</p>\n        </div>\n      </div>\n      <div class="auth">\n        ' + signinLink + '\n      </div>\n    </header>\n    <main>\n      <section class="hero">\n        <h2>Professional CCTV Installation &amp; Service</h2>\n        <p>One platform for complaints, installations, and technician dispatching.</p>\n        <div class="cta-group">\n          <a href="/new" class="btn btn-primary">New Request</a>\n          <a href="/dashboard" class="btn btn-secondary">My Requests</a>\n        </div>\n      </section>\n      <section class="features">\n        <div class="feature">\n          <h3>Request Service</h3>\n          <p>File a CCTV complaint or book a new installation in minutes.</p>\n        </div>\n        <div class="feature">\n          <h3>Track Your Ticket</h3>\n          <p>See status, scheduled date, time, and assigned technician.</p>\n        </div>\n        <div class="feature">\n          <h3>Admin Dashboard</h3>\n          <p>Manage technicians, service areas, and job statuses securely.</p>\n        </div>\n      </section>\n    </main>\n    <footer>\n      <p>&copy; ' + year + ' CGI CCTV Service Desk. All rights reserved.</p>\n    </footer>\n  </div>\n  <script src="/app.js" defer></script>\n</body>\n</html>';
}

function signinHTML() {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Sign in — CGI CCTV Service Desk</title>\n  <link rel="stylesheet" href="/styles.css">\n  <link rel="icon" href="/favicon.svg" type="image/svg+xml">\n</head>\n<body>\n  <div class="auth-page">\n    <div class="auth-card">\n      <div class="auth-header">\n        <div class="logo">\n          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">\n            <circle cx="20" cy="20" r="19" fill="#1a1a2e"/>\n            <circle cx="20" cy="20" r="14" fill="none" stroke="#00d4aa" stroke-width="2"/>\n            <circle cx="20" cy="20" r="6" fill="#00d4aa"/>\n            <circle cx="28" cy="13" r="2" fill="#00d4aa"/>\n          </svg>\n        </div>\n        <h1>Sign in</h1>\n        <p>Sign in with your Freebuff account to continue.</p>\n      </div>\n      <div class="auth-body">\n        <a href="/auth/freebuff/signin" class="btn btn-primary btn-full">Sign in with Freebuff</a>\n        <p class="auth-note">Freebuff supports Google, GitHub, and Apple sign-in.</p>\n      </div>\n    </div>\n  </div>\n  <script src="/app.js" defer></script>\n</body>\n</html>';
}

function notFoundHTML() {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Page not found — CGI CCTV Service Desk</title>\n  <link rel="stylesheet" href="/styles.css">\n  <link rel="icon" href="/favicon.svg" type="image/svg+xml">\n</head>\n<body>\n  <div class="auth-page">\n    <div class="auth-card">\n      <div class="auth-header">\n        <div class="logo">\n          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">\n            <circle cx="20" cy="20" r="19" fill="#1a1a2e"/>\n            <circle cx="20" cy="20" r="14" fill="none" stroke="#00d4aa" stroke-width="2"/>\n            <circle cx="20" cy="20" r="6" fill="#00d4aa"/>\n            <circle cx="28" cy="13" r="2" fill="#00d4aa"/>\n          </svg>\n        </div>\n        <h1>Page not found</h1>\n        <p>Sorry, we couldn\'t find the page you were looking for.</p>\n      </div>\n      <div class="auth-body">\n        <a href="/" class="btn btn-primary">Back to home</a>\n      </div>\n    </div>\n  </div>\n  <script src="/app.js" defer></script>\n</body>\n</html>';
}

const dashboardHTML = '<h1>Dashboard</h1><p>Sign in with Freebuff to use the full app.</p>';
const newRequestHTML = '<h1>New Request</h1><p>Sign in with Freebuff to use the full app.</p>';
const adminSetupHTML = '<h1>Admin Setup</h1><p>Configure the admin team here.</p>';
const adminJoinHTML = '<h1>Admin Join</h1><p>Enter the invite code to join the admin team.</p>';

function sendJSON(res, obj, status) {
  const body = JSON.stringify(obj);
  res.writeHead(status || 200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHTML(res, html, status) {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(html),
  };
  res.writeHead(status || 200, headers);
  res.end(html);
}

function sendRedirect(res, location, status) {
  res.writeHead(status || 303, { Location: location });
  res.end();
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? new URLSearchParams(body) : new URLSearchParams());
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    await ensureSchema();

    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const path = url.pathname;
    const user = await getUser(req);

    if (path === '/' || path === '/index.html') {
      return sendHTML(res, landingHTML(new Date().getFullYear()));
    }

    if (path === '/signin') {
      if (user && !url.searchParams.has('next')) return sendRedirect(res, '/dashboard');
      const error = url.searchParams.get('error') === 'denied' ? 'Sign in was cancelled. Try again.' : '';
      return sendHTML(res, signinHTML());
    }

    if (path === '/dashboard') {
      if (!user) return sendRedirect(res, '/signin?next=' + encodeURIComponent('/dashboard'));
      return sendHTML(res, dashboardHTML);
    }

    if (path === '/new') {
      if (!user) return sendRedirect(res, '/signin?next=' + encodeURIComponent('/new'));
      return sendHTML(res, newRequestHTML);
    }

    if (path === '/requests' && req.method === 'POST') {
      if (!user) return sendRedirect(res, '/signin?next=' + encodeURIComponent('/new'));
      return sendHTML(res, newRequestHTML);
    }

    if (path.startsWith('/ticket/')) {
      if (!user) return sendRedirect(res, '/signin?next=' + encodeURIComponent(path));
      const id = path.slice('/ticket/'.length);
      return sendHTML(res, '<h1>Ticket ' + id + '</h1><p>Sign in with Freebuff to use the full app.</p>');
    }

    if (path === '/api/me') {
      if (!user) return sendJSON(res, { error: 'Sign in required' }, 401);
      return sendJSON(res, { user, role: null, name: null });
    }

    if (path === '/api/my/tickets') {
      if (!user) return sendJSON(res, { error: 'Sign in required' }, 401);
      return sendJSON(res, []);
    }

    if (path.startsWith('/api/tickets/')) {
      if (!user) return sendJSON(res, { error: 'Sign in required' }, 401);
      const rest = path.slice('/api/tickets/'.length);
      if (rest.endsWith('/calendar.ics')) {
        const id = rest.slice(0, -'/calendar.ics'.length);
        return sendJSON(res, { error: 'Not found' }, 404);
      }
      return sendJSON(res, { error: 'Not found' }, 404);
    }

    if (path === '/admin/setup') {
      if (!user) return sendRedirect(res, '/signin?next=' + encodeURIComponent('/admin/setup'));
      return sendHTML(res, adminSetupHTML);
    }

    if (path === '/admin') {
      if (!user) return sendRedirect(res, '/signin?next=' + encodeURIComponent('/admin'));
      return sendRedirect(res, '/admin/setup');
    }

    if (path === '/admin/requests' || path === '/admin/technicians' || path === '/admin/admins') {
      if (!user) return sendRedirect(res, '/signin?next=' + encodeURIComponent(path));
      return sendRedirect(res, '/admin/setup');
    }

    if (path === '/admin/join') {
      if (!user) return sendRedirect(res, '/signin?next=' + encodeURIComponent(path));
      return sendHTML(res, adminJoinHTML);
    }

    if (path.startsWith('/auth/')) {
      return sendHTML(res, '<h1>Auth</h1><p>Redirecting to Freebuff...</p>');
    }

    if (path.startsWith('/api/')) {
      return sendJSON(res, { error: 'Not found' }, 404);
    }

    if (!path.startsWith('/auth/')) {
      const asset = serveStaticFile(path);
      if (asset.status === 200) {
        res.writeHead(200, asset.headers);
        res.end(asset.body);
        return;
      }
    }

    sendHTML(res, notFoundHTML(), 404);
  } catch (err) {
    console.error('Unhandled error:', err ? (err.stack || err.message || err) : err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('CGI CCTV Service Desk running on port ' + PORT);
  console.log('Database: ' + DB_URL);
  console.log('Auth: ' + (CLIENT_ID ? 'Freebuff (production)' : 'no Freebuff client ID (stub mode)'));
  console.log('Base URL: ' + BASE_URL);
});
