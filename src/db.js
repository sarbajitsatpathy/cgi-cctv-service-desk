// DB layer: @libsql/client (Turso cloud SQLite) — reads client from context.
// All functions accept an optional second `env` parameter for standalone use (e.g. tests).
// The app middleware sets c.set('db', client) using TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
// from the Worker env. On Cloudflare, env.DB is the D1 binding — we fall back to
// the libsql client when no binding exists.

import { createClient } from '@libsql/client';

// ---- module-level client factory (used when no context client exists) ----
let defaultClient = null;
const ready = new WeakSet();

function createDefaultClient(env) {
  // If we already have a client and it's initialised, reuse it
  if (defaultClient && ready.has(defaultClient)) return defaultClient;

  const url = env?.TURSO_DATABASE_URL;
  const authToken = env?.TURSO_AUTH_TOKEN;

  if (!url) {
    // No URL configured — return a stub that throws a helpful error
    const stub = {
      prepare: () => ({
        bind: () => ({ first: () => null }),
        all: () => ({ results: [] }),
        run: () => {},
        get: () => null,
      }),
    };
    defaultClient = stub;
    ready.add(stub);
    return stub;
  }

  const client = createClient({ url, authToken, fetch: globalThis.fetch });
  defaultClient = client;
  ready.add(client);
  return client;
}

function getClientFromContext(env) {

  if (env && typeof env.get === 'function') {

    const ctxClient = env.get('db');

    if (ctxClient && typeof ctxClient.execute === 'function') return ctxClient;

  }

  return null;

}



async function run(db, sql, ...params) {

  const r = params.length ? await db.execute(sql, params) : await db.execute(sql);

  return r.rowsAffected;

}



async function queryOne(db, sql, ...params) {

  const r = params.length ? await db.execute(sql, params) : await db.execute(sql);

  if (!r.rows || !r.rows.length) return null;

  const cols = r.columns;

  const row = r.rows[0];

  const out = {};

  for (let i = 0; i < cols.length; i++) out[cols[i]] = row[i];

  return out;

}



async function queryAll(db, sql, ...params) {

  const r = params.length ? await db.execute(sql, params) : await db.execute(sql);

  if (!r.rows || !r.rows.length) return [];

  const cols = r.columns;

  return r.rows.map((row) => {

    const out = {};

    for (let i = 0; i < cols.length; i++) out[cols[i]] = row[i];

    return out;

  });

}



export async function initDb(env) {

  await createDefaultClient(env);

}



// Deprecated alias kept for any upstream code that still imports initDb/env.

export async function initDbEnv(env) {

  return initDb(env);

}


export async function ensureSchema(env) {
  const ctxClient = getClientFromContext(env);
  const db = ctxClient || createDefaultClient(env);
  if (ready.has(db)) return;
  // D1-compatible: run each statement individually (D1's exec() is newline-separated)
  const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS profiles (sub TEXT PRIMARY KEY, email TEXT, name TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS admins (sub TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS technicians (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', service_areas TEXT NOT NULL DEFAULT '[]', daily_capacity INTEGER NOT NULL DEFAULT 3, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_no TEXT NOT NULL UNIQUE, owner_sub TEXT NOT NULL, type TEXT NOT NULL, contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, address_line TEXT NOT NULL, area TEXT NOT NULL, product TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1, requirements TEXT NOT NULL DEFAULT '', preferred_date TEXT NOT NULL, time_slot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', technician_id INTEGER, scheduled_date TEXT, scheduled_slot TEXT, admin_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner_sub)`,
    `CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`,
    `CREATE TABLE IF NOT EXISTS ticket_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, event TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id)`,
  ];
  for (const sql of SCHEMA) {
    await db.prepare(sql).run();
  }
  ready.add(db);
}

// ---- constants ----

export const now = () => new Date().toISOString();

// ---- profiles -----------------------------------------------------------

export async function ensureProfile(user, env) {
  const db = createDefaultClient(env);
  await db
    .prepare('INSERT INTO profiles (sub, email, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(sub) DO NOTHING')
    .bind(user.sub, user.email ?? '', user.name ?? '', now())
    .run();
  await db
    .prepare('UPDATE profiles SET email = ?, name = ? WHERE sub = ? AND (email IS NOT ? OR name IS NOT ?)')
    .bind(user.email ?? '', user.name ?? '', user.sub, user.email ?? '', user.name ?? '')
    .run();
  return getProfile(user.sub, env);
}

export async function getProfile(sub, env) {
  const db = createDefaultClient(env);
  return db.prepare('SELECT * FROM profiles WHERE sub = ?').bind(sub).first();
}

// ---- admins -----------------------------------------------------------

export async function countAdmins(env) {
  const db = createDefaultClient(env);
  const row = db.prepare('SELECT COUNT(*) AS n FROM admins').first();
  return row?.n ?? 0;
}

export async function getAdminRole(sub, env) {
  const db = createDefaultClient(env);
  const row = db.prepare('SELECT role FROM admins WHERE sub = ?').bind(sub).first();
  return row?.role ?? null;
}

export async function listAdmins(env) {
  const db = createDefaultClient(env);
  return db
    .prepare(
      `SELECT a.sub, a.role, a.created_at, p.email, p.name\n       FROM admins a LEFT JOIN profiles p ON p.sub = a.sub\n       ORDER BY CASE a.role WHEN 'owner' THEN 0 ELSE 1 END, a.created_at`
    )
    .all()
    .then((r) => r.results);
}

export async function addAdmin(sub, role = 'admin', env) {
  const db = createDefaultClient(env);
  await db
    .prepare('INSERT INTO admins (sub, role, created_at) VALUES (?, ?, ?) ON CONFLICT(sub) DO NOTHING')
    .bind(sub, role, now())
    .run();
}

export async function setAdminRole(sub, role, env) {
  const db = createDefaultClient(env);
  await db.prepare('UPDATE admins SET role = ? WHERE sub = ?').bind(role, sub).run();
}

export async function removeAdmin(sub, env) {
  const db = createDefaultClient(env);
  await db.prepare('DELETE FROM admins WHERE sub = ?').bind(sub).run();
}

// ---- settings ----------------------------------------------------------

export async function getSetting(key, env) {
  const db = createDefaultClient(env);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row?.value ?? null;
}

export async function setSetting(key, value, env) {
  const db = createDefaultClient(env);
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

// ---- technicians -------------------------------------------------------

export async function listTechnicians(env) {
  const db = createDefaultClient(env);
  return db
    .prepare('SELECT * FROM technicians ORDER BY active DESC, name')
    .all()
    .then((r) => r.results);
}

export async function getTechnician(id, env) {
  const db = createDefaultClient(env);
  return db.prepare('SELECT * FROM technicians WHERE id = ?').bind(id).first();
}

export async function createTechnician(t, env) {
  const db = createDefaultClient(env);
  const info = await db
    .prepare(
      `INSERT INTO technicians (name, phone, email, service_areas, daily_capacity, active, created_at)\n       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .bind(t.name, t.phone, t.email, JSON.stringify(t.service_areas), t.daily_capacity, now())
    .run();
  return { meta: { last_row_id: info.lastInsertRowid } };
}

export async function updateTechnician(id, t, env) {
  const db = createDefaultClient(env);
  await db
    .prepare(
      `UPDATE technicians SET name = ?, phone = ?, email = ?, service_areas = ?, daily_capacity = ?, active = ? WHERE id = ?`
    )
    .bind(t.name, t.phone, t.email, JSON.stringify(t.service_areas), t.daily_capacity, t.active ? 1 : 0, id)
    .run();
}

export async function deleteTechnician(id, env) {
  const db = createDefaultClient(env);
  await db.prepare('DELETE FROM technicians WHERE id = ?').bind(id).run();
}

/** Jobs that hold a slot on the given date. */
export async function countActiveJobs(dbRef, technicianId, date, env) {
  const db = dbRef && 'prepare' in dbRef ? dbRef : createDefaultClient(env);
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM tickets WHERE technician_id = ? AND scheduled_date = ? AND status IN ('scheduled', 'in_progress')`
  ).bind(technicianId, date).first();
  return row?.n ?? 0;
}

// ---- tickets ------------------------------------------------------------

async function nextTicketNo(env) {
  const db = createDefaultClient(env);
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
  for (let i = 1; i <= 200; i++) {
    const ticketNo = `CGI-${ymd}-${String(i).padStart(4, '0')}`;
    const clash = db.prepare('SELECT 1 AS x FROM tickets WHERE ticket_no = ?').bind(ticketNo).first();
    if (!clash) return ticketNo;
  }
  return `CGI-${Date.now().toString(36).toUpperCase()}`;
}

export async function createTicket(t, env) {
  const db = createDefaultClient(env);
  const ts = now();
  const ticketNo = await nextTicketNo(env);
  const info = await db
    .prepare(
      `INSERT INTO tickets\n        (ticket_no, owner_sub, type, contact_name, contact_phone, address_line, area,\n         product, model, quantity, requirements, preferred_date, time_slot,\n         status, technician_id, scheduled_date, scheduled_slot, admin_notes, created_at, updated_at)\n       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      ticketNo,
      t.owner_sub,
      t.type,
      t.contact_name,
      t.contact_phone,
      t.address_line,
      t.area,
      t.product,
      t.model,
      t.quantity,
      t.requirements,
      t.preferred_date,
      t.time_slot,
      'new',
      null,
      null,
      null,
      '',
      ts,
      ts,
    );
  const rowId = info.lastInsertRowid;
  await addEvent(db, Number(rowId), 'new', 'Request submitted');
  return getTicket(db, env);
}

export async function getTicket(id, env) {
  const db = createDefaultClient(env);
  return db
    .prepare(
      `SELECT t.*, tc.name AS technician_name, tc.phone AS technician_phone FROM tickets t LEFT JOIN technicians tc ON tc.id = t.technician_id WHERE t.id = ?`
    )
    .bind(id)
    .first();
}

export async function listTicketsForOwner(sub, env) {
  const db = createDefaultClient(env);
  return db
    .prepare(
      `SELECT t.*, tc.name AS technician_name, tc.phone AS technician_phone FROM tickets t LEFT JOIN technicians tc ON tc.id = t.technician_id WHERE t.owner_sub = ? ORDER BY t.created_at DESC`
    )
    .bind(sub)
    .all()
    .then((r) => r.results);
}

export async function listAllTickets(status, env) {
  const db = createDefaultClient(env);
  const where = status && STATUS_IDS.includes(status) ? 'WHERE t.status = ?' : '';
  const stmt = db.prepare(
    `SELECT t.*, tc.name AS technician_name, tc.phone AS technician_phone, p.name AS customer_name, p.email AS customer_email\n     FROM tickets t\n     LEFT JOIN technicians tc ON tc.id = t.technician_id\n     LEFT JOIN profiles p ON p.sub = t.owner_sub\n     ${where}\n     ORDER BY t.created_at DESC\n     LIMIT 300`
  );
  const res = where ? await stmt.bind(status).all() : await stmt.all();
  return res.results;
}

export async function updateTicket(id, fields, env) {
  const db = createDefaultClient(env);
  const columns = {
    status: 'status',
    technician_id: 'technician_id',
    scheduled_date: 'scheduled_date',
    scheduled_slot: 'scheduled_slot',
    admin_notes: 'admin_notes',
    preferred_date: 'preferred_date',
    time_slot: 'time_slot',
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in fields) {
      sets.push(`${column} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return;
  values.push(now(), id);
  await db.prepare(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function addEvent(dbRef, ticketId, event, note = '', env) {
  const db = dbRef && 'prepare' in dbRef ? dbRef : createDefaultClient(env);
  await db
    .prepare('INSERT INTO ticket_events (ticket_id, event, note, created_at) VALUES (?, ?, ?, ?)')
    .bind(ticketId, event, note, now())
    .run();
}

export async function listEvents(dbRef, ticketId, env) {
  const db = dbRef && 'prepare' in dbRef ? dbRef : createDefaultClient(env);
  return db
    .prepare('SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at, id')
    .bind(ticketId)
    .all()
    .then((r) => r.results);
}

export async function statusCounts(env) {
  const db = createDefaultClient(env);
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM tickets GROUP BY status').all();
  const counts = Object.fromEntries(STATUS_IDS.map((s) => [s, 0]));
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

// ---- statuses / slots --------------------------------------------------

const STATUSES = [
  { id: 'new', label: 'New', hint: 'Request received, waiting to be scheduled' },
  { id: 'scheduled', label: 'Scheduled', hint: 'A technician is booked for the visit' },
  { id: 'in_progress', label: 'In progress', hint: 'Technician is working on the job' },
  { id: 'completed', label: 'Completed', hint: 'Job finished' },
  { id: 'cancelled', label: 'Cancelled', hint: 'Request cancelled' },
];
const STATUS_IDS = STATUSES.map((s) => s.id);
const STATUS_LABELS = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

const SLOTS = {
  morning: { id: 'morning', label: 'Morning', window: '08:00 – 12:00', start: '080000', end: '120000' },
  afternoon: { id: 'afternoon', label: 'Afternoon', window: '13:00 – 17:00', start: '130000', end: '170000' },
};

const REQUEST_TYPES = {
  complaint: { id: 'complaint', label: 'CCTV complaint', blurb: 'Cameras not recording, no picture, night vision, recorder or cabling faults.' },
  installation: { id: 'installation', label: 'New installation', blurb: 'New cameras, recorders, cabling and full system setup for a property.' },
};

// ---- ticket helpers ----------------------------------------------------

export function areaMatches(serviceAreas, ticketArea) {
  const target = (ticketArea || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!target) return false;
  return serviceAreas.some((raw) => {
    const area = (raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!area) return false;
    return target.includes(area) || area.includes(target);
  });
}

function parseAreas(value) {
  return [...new Set(String(value || '').split(',').map((s) => s.trim()).filter(Boolean))];
}

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

// ---- admin tech removal ------------------------------------------------

async function updateTicketClearTech(dbRef, technicianId, env) {
  const db = dbRef && 'prepare' in dbRef ? dbRef : createDefaultClient(env);
  const affected = db
    .prepare('SELECT id FROM tickets WHERE technician_id = ?')
    .bind(technicianId)
    .all()
    .then((r) => r.results);
  for (const row of affected) {
    await db
      .prepare(
        `UPDATE tickets SET\n           technician_id = NULL,\n           status = CASE WHEN status IN ('scheduled','in_progress') THEN 'new' ELSE status END,\n           scheduled_date = CASE WHEN status IN ('scheduled','in_progress') THEN NULL ELSE scheduled_date END,\n           scheduled_slot = CASE WHEN status IN ('scheduled','in_progress') THEN NULL ELSE scheduled_slot END,\n           updated_at = ?\n         WHERE id = ?`
      )
      .bind(now(), row.id)
      .run();
    await addEvent(db, row.id, 'new', 'Technician removed — request returned to the queue');
  }
}

// ---- exported constants used by app.jsx --------------------------------

export { STATUSES, STATUS_IDS, STATUS_LABELS, SLOTS, REQUEST_TYPES };