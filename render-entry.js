// Render entry: Node HTTP server for the CGI CCTV service desk.
// Uses @libsql/client with a local file-based SQLite database.
// Sqlite works on Render's free tier (writable filesystem).

import { createClient } from '@libsql/client';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3000', 10);
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || `file:${join(__dirname, 'data.db')}`;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;

// Create libsql client
const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

// Import the built app
const { buildApp } = await import('./dist/worker.js');

// Build app env
const appEnv = {
  get: (key) => (key === 'db' ? db : undefined),
  TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN,
};

const app = buildApp(() => ({ clientId: '', issuer: '', baseUrl: '' }), appEnv);

// Create HTTP server
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const headers = new Headers(req.headers);

  const request = new Request(url, {
    method: req.method,
    headers,
    body: 'content-type' in req.headers && req.headers['content-type']?.startsWith('application/json')
      ? await new Response(req).arrayBuffer()
      : undefined,
  });

  try {
    const response = await app.fetch(request, appEnv);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const body = await response.text();
    res.end(body);
  } catch (err) {
    console.error('Unhandled error:', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`CGI CCTV Service Desk running on port ${PORT}`);
  console.log(`Database: ${TURSO_DATABASE_URL}`);
});
