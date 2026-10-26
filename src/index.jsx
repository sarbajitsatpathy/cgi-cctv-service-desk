// Worker entry: one auth instance per isolate, wrapping the whole app so
// /auth/freebuff/* is served and sessions stay fresh.

import { createFreebuffAuth } from '@freebuff/auth';

import { buildApp } from './app.jsx';

// ---- module-level state (initialized on first request) ----
let initialized = false;

export default {
  async fetch(request, env) {
    // Initialize libsql client from env vars on first request (cold start)
    if (!initialized) {
      // Create libsql client from TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
      // These env vars are set by the Render dashboard when you attach a Turso DB
      const url = env.TURSO_DATABASE_URL;
      const authToken = env.TURSO_AUTH_TOKEN;

      if (!url || !authToken) {
        console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables');
      }
      initialized = true;
    }

    const auth = createFreebuffAuth({
      clientId: env.FREEBUFF_CLIENT_ID,
      issuer: env.FREEBUFF_ISSUER,
      baseUrl: env.APP_ORIGIN,
      allowInsecureLocalhost: env.APP_ORIGIN.startsWith('http://localhost') || env.APP_ORIGIN.startsWith('http://127.0.0.1'),
    });

    const app = buildApp(auth, env);
    return app.fetch(request, env);
  },
};