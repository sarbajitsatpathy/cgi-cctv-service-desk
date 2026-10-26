import { Hono } from 'hono';
import { isSameOriginRequest } from '@freebuff/auth';
import { createDefaultClient } from './db.js';

import {
  REQUEST_TYPES,
  SLOTS,
  STATUSES,
  STATUS_IDS,
  STATUS_LABELS,
  addAdmin,
  addEvent,
  countAdmins,
  createTechnician,
  createTicket,
  deleteTechnician,
  ensureProfile,
  ensureSchema,
  getAdminRole,
  getSetting,
  getTechnician,
  getTicket,
  listAdmins,
  listEvents,
  listAllTickets,
  listTicketsForOwner,
  now,
  removeAdmin,
  setSetting,
  statusCounts,
  updateTechnician,
  updateTicket,
  listTechnicians,
} from './db.js';
import { autoSchedule } from './schedule.js';
import { Dashboard, NewRequestPage, TicketPage } from './pages/customer.jsx';
import { Landing, MessagePage, NotFoundPage, SignInPage } from './pages/public.jsx';
import {
  AdminJoinPage,
  AdminOverview,
  AdminRequests,
  AdminSetupPage,
  AdminTeam,
  AdminTechnicians,
} from './pages/admin.jsx';

const INVITE_KEY = 'admin_invite';

const text = (body, type = 'text/plain; charset=utf-8', status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store' } });

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

function sameOrigin(c) {
  return isSameOriginRequest(c.req.raw, c.env.APP_ORIGIN);
}

function rejectSameOrigin(c) {
  return text('Cross-origin request rejected', 'text/plain; charset=utf-8', 403);
}

function parseAreas(value) {
  return [...new Set(String(value || '').split(',').map((s) => s.trim()).filter(Boolean))];
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function inviteCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const icsDate = (iso) => iso.replaceAll('-', '');

function icsText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function buildApp(auth, env) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    await ensureSchema(env);
    c.set('db', c.get('db') || createDefaultClient(env));
    const db = c.get('db');

    const user = await auth.getUser(c.req.raw);
    c.set('user', user);
    if (user) {
      const profile = await ensureProfile(user, env);
      c.set('profile', profile);
      c.set('role', await getAdminRole(user.sub, env));
    }

    const path = new URL(c.req.raw.url).pathname;
    const isAuthRoute = path.startsWith('/auth/');
    const isSetup = path === '/admin/setup' || path === '/admin/join';

    if (path.startsWith('/admin') && !isSetup && !isAuthRoute) {
      const adminCount = await countAdmins(env);
      if (!user) return c.redirect(`/signin?next=${encodeURIComponent(path)}`, 303);
      if (adminCount === 0) return c.redirect('/admin/setup', 303);
      if (!c.get('role')) {
        return c.html(
          <MessagePage
            user={user}
            title="Admin access required"
            message="Your account is not on the admin team. Ask an administrator for the invite link."
            actionHref="/"
            actionLabel="Back to home"
          />,
          403,
        );
      }
    }

    await next();

    const contentType = c.res.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      c.res.headers.set('Cache-Control', 'private, no-store');
      c.res.headers.set('X-Content-Type-Options', 'nosniff');
    }
  });

  app.get('/', (c) => c.html(<Landing user={c.get('user')} />));

  app.get('/signin', (c) => {
    const user = c.get('user');
    if (user && !c.req.query('next')) return c.redirect('/dashboard', 303);
    const error =
      c.req.query('error') === 'denied'
        ? 'Sign in was cancelled. Try again when you are ready.'
        : '';
    return c.html(
      <SignInPage
        user={user}
        returnTo={safeReturnTo(c.req.query('next'))}
        error={error}
      />,
    );
  });

  app.get('/dashboard', async (c) => {
    const user = c.get('user');
    if (!user) return c.redirect(`/signin?next=${encodeURIComponent('/dashboard')}`, 303);
    const tickets = await listTicketsForOwner(user.sub);
    return c.html(
      <Dashboard user={user} profile={c.get('profile')} tickets={tickets} createdNo={c.req.query('created')} />,
    );
  });

  app.get('/new', (c) => {
    const user = c.get('user');
    if (!user) return c.redirect(`/signin?next=${encodeURIComponent('/new')}`, 303);
    return c.html(<NewRequestPage user={user} values={{}} errors={{}} />);
  });

  app.post('/requests', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    const user = c.get('user');
    if (!user) return c.redirect(`/signin?next=${encodeURIComponent('/new')}`, 303);

    const body = await c.req.parseBody();
    const values = {
      type: String(body.type ?? ''),
      contact_name: String(body.contact_name ?? '').trim(),
      contact_phone: String(body.contact_phone ?? '').trim(),
      address_line: String(body.address_line ?? '').trim(),
      area: String(body.area ?? '').trim(),
      product: String(body.product ?? '').trim(),
      model: String(body.model ?? '').trim(),
      quantity: String(body.quantity ?? '1').trim(),
      requirements: String(body.requirements ?? '').trim(),
      preferred_date: String(body.preferred_date ?? ''),
      time_slot: String(body.time_slot ?? ''),
    };

    const errors = {};
    if (!(values.type in REQUEST_TYPES)) errors.type = 'Choose a request type.';
    if (!values.contact_name) errors.contact_name = 'Tell us who to ask for on site.';
    if (!values.contact_phone) errors.contact_phone = 'A phone number is required so the technician can call you.';
    if (!values.address_line) errors.address_line = 'Enter the street address of the job.';
    if (!values.area) errors.area = 'Enter the area or city so we can match a technician.';
    if (!values.product) errors.product = 'Tell us which camera or equipment is involved.';
    if (!values.requirements) errors.requirements = 'Describe what you need done.';
    if (!values.time_slot || !(values.time_slot in SLOTS)) errors.time_slot = 'Pick a time window.';
    if (!isValidDate(values.preferred_date)) {
      errors.preferred_date = 'Pick a valid preferred date.';
    } else {
      const chosen = Date.parse(`${values.preferred_date}T00:00:00Z`);
      const min = Date.now() - 24 * 60 * 60 * 1000;
      const max = Date.now() + 400 * 24 * 60 * 60 * 1000;
      if (chosen < min) errors.preferred_date = 'The preferred date cannot be in the past.';
      if (chosen > max) errors.preferred_date = 'Pick a date within the next year.';
    }
    const quantity = Number.parseInt(values.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      errors.quantity = 'Quantity must be between 1 and 100.';
    }

    if (Object.keys(errors).length) {
      return c.html(<NewRequestPage user={user} values={values} errors={errors} />, 400);
    }

    const ticket = await createTicket({ ...values, quantity, owner_sub: user.sub }, env);
    await autoSchedule(ticket);
    const fresh = await getTicket(ticket.id, env);
    return c.redirect(`/ticket/${fresh.id}?created=1`, 303);
  });

  async function loadTicketForUser(c, api = false) {
    const user = c.get('user');
    const notFound = api
      ? json({ error: 'Not found' }, 404)
      : c.html(<NotFoundPage user={user} />, 404);
    if (!user) {
      const error = api
        ? json({ error: 'Sign in required' }, 401)
        : c.redirect(`/signin?next=${encodeURIComponent(new URL(c.req.raw.url).pathname)}`, 303);
      return { user: null, error };
    }
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return { user, error: notFound };
    const ticket = await getTicket(id, env);
    if (!ticket) return { user, error: notFound };
    const isAdmin = Boolean(c.get('role'));
    if (ticket.owner_sub !== user.sub && !isAdmin) {
      return {
        user,
        error: api
          ? json({ error: 'Forbidden' }, 403)
          : c.html(
              <MessagePage
                user={user}
                title="Not your ticket"
                message="That ticket belongs to another customer. Sign in with the account that raised it."
                actionHref="/dashboard"
                actionLabel="My requests"
              />,
              403,
            ),
      };
    }
    return { user, ticket, isAdmin };
  }

  app.get('/ticket/:id', async (c) => {
    const { user, error, ticket, isAdmin } = await loadTicketForUser(c);
    if (error) return error;
    const events = await listEvents(ticket.id, env);
    const flash = c.req.query('created')
      ? ticket.status === 'scheduled'
        ? 'Ticket ' + ticket.ticket_no + ' was created and ' + ticket.technician_name + ' is booked for ' + ticket.scheduled_date + ' (' + (SLOTS[ticket.scheduled_slot]?.label ?? '') + ').'
        : 'Ticket ' + ticket.ticket_no + ' was created. We are matching an available technician in ' + ticket.area + ' for ' + ticket.preferred_date + '.'
      : '';
    return c.html(
      <TicketPage
        user={user}
        isAdmin={isAdmin}
        ticket={ticket}
        events={events}
        flash={flash}
        canEdit={isAdmin}
      />,
    );
  });

  app.get('/api/me', (c) => {
    const user = c.get('user');
    if (!user) return json({ error: 'Sign in required' }, 401);
    const profile = c.get('profile');
    return json({ user, role: c.get('role') ?? null, name: profile?.name ?? null });
  });

  app.get('/api/my/tickets', async (c) => {
    const user = c.get('user');
    if (!user) return json({ error: 'Sign in required' }, 401);
    const tickets = await listTicketsForOwner(user.sub);
    return json(
      tickets.map((t) => ({
        id: t.id,
        ticket_no: t.ticket_no,
        status: t.status,
        updated_at: t.updated_at,
        scheduled_date: t.scheduled_date,
        scheduled_slot: t.scheduled_slot,
        technician_name: t.technician_name ?? null,
      })),
    );
  });

  app.get('/api/tickets/:id', async (c) => {
    const { error, ticket } = await loadTicketForUser(c, true);
    if (error) return error;
    return json({
      ...ticket,
      type_label: REQUEST_TYPES[ticket.type]?.label ?? ticket.type,
      slot_label: SLOTS[ticket.scheduled_slot ?? ticket.time_slot]?.label ?? '',
      slot_window: SLOTS[ticket.scheduled_slot ?? ticket.time_slot]?.window ?? '',
      origin: c.env.APP_ORIGIN,
    });
  });

  app.get('/api/tickets/:id/calendar.ics', async (c) => {
    const { error, ticket } = await loadTicketForUser(c, true);
    if (error) return error;
    const date = ticket.scheduled_date ?? ticket.preferred_date;
    const slot = ticket.scheduled_slot ?? ticket.time_slot;
    const times = SLOTS[slot] ?? SLOTS.morning;
    const stamp = now().replace(/[-:]/g, '').replace(/\.\\d{3}/, '');
    const summary = 'CGI CCTV visit - ' + ticket.ticket_no;
    const desc = STATUS_LABELS[ticket.status] + ' - technician: ' + (ticket.technician_name ?? 'to be assigned') + ' - ' + ticket.product;
    const location = ticket.address_line + ', ' + ticket.area;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CGI CCTV//Service Desk//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + ticket.ticket_no + '@cgicctv.example',
      'DTSTAMP:' + stamp,
      'DTSTART:' + icsDate(date) + 'T' + times.start,
      'DTEND:' + icsDate(date) + 'T' + times.end,
      'SUMMARY:' + icsText(summary) + ',',
      'DESCRIPTION:' + icsText(desc),
      'LOCATION:' + icsText(location),
      'BEGIN:VALARM',
      'TRIGGER:-PT60M',
      'ACTION:DISPLAY',
      'DESCRIPTION:CGI CCTV visit in 1 hour',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    return text(lines.join('\r\n'), 'text/calendar; charset=utf-8');
  });

  app.get('/admin/setup', async (c) => {
    const user = c.get('user');
    if (!user) return c.redirect(`/signin?next=${encodeURIComponent('/admin/setup')}`, 303);
    if (c.get('role')) return c.redirect('/admin', 303);
    if ((await countAdmins(env)) > 0) {
      return c.html(
        <MessagePage
          user={user}
          title="Admin team already exists"
          message="Ask an administrator for the invite link to join the dashboard."
          actionHref="/"
          actionLabel="Back to home"
        />,
        403,
      );
    }
    return c.html(<AdminSetupPage user={user} error={c.req.query('error')} />);
  });

  app.post('/admin/setup', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    const user = c.get('user');
    if (!user) return c.redirect('/signin?next=%2Fadmin%2Fsetup', 303);
    if (await getAdminRole(user.sub, env)) return c.redirect('/admin', 303);
    if ((await countAdmins(env)) > 0) return c.redirect('/admin', 303);
    await addAdmin(user.sub, 'owner', env);
    return c.redirect('/admin', 303);
  });

  app.get('/admin', async (c) => {
    const counts = await statusCounts(env);
    const tickets = await listAllTickets('', env);
    const technicians = await listTechnicians(env);
    const today = new Date().toISOString().slice(0, 10);
    const areas = new Set();
    for (const tech of technicians) {
      for (const area of JSON.parse(tech.service_areas)) areas.add(area);
    }
    const todayCount = tickets.filter((t) => t.scheduled_date === today && t.status !== 'cancelled').length;
    return c.html(
      <AdminOverview
        user={c.get('user')}
        counts={counts}
        tickets={tickets}
        techCount={technicians.filter((t) => t.active).length}
        areaCount={areas.size}
        todayCount={todayCount}
      />,
    );
  });

  app.get('/admin/requests', async (c) => {
    const status = c.req.query('status') ?? '';
    const tickets = await listAllTickets(status, env);
    const technicians = await listTechnicians(env);
    const counts = await statusCounts(env);
    return c.html(
      <AdminRequests
        user={c.get('user')}
        tickets={tickets}
        status={status}
        counts={counts}
        technicians={technicians}
        saved={c.req.query('saved') ? 'Job updated.' : ''}
        error={c.req.query('error') ? decodeURIComponent(c.req.query('error')) : ''}
      />,
    );
  });

  app.post('/admin/requests/:id', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    const back = (message) =>
      c.redirect(`/admin/requests?status=${encodeURIComponent(c.req.query('status') ?? '')}&error=${encodeURIComponent(message)}`, 303);

    const id = Number(c.req.param('id'));
    const ticket = Number.isInteger(id) ? await getTicket(id, env) : null;
    if (!ticket) return back('That request no longer exists.');

    const body = await c.req.parseBody();
    const status = String(body.status ?? '');
    const techRaw = String(body.technician_id ?? '');
    const scheduledDate = String(body.scheduled_date ?? '');
    const scheduledSlot = String(body.scheduled_slot ?? '');
    const notes = String(body.admin_notes ?? '').slice(0, 500);

    if (!STATUS_IDS.includes(status)) return back('Unknown status.');
    if (!(scheduledSlot in SLOTS)) return back('Pick a valid time window.');
    if (scheduledDate && !isValidDate(scheduledDate)) return back('Pick a valid visit date.');

    let technicianId = null;
    if (techRaw) {
      const technician = await getTechnician(Number(techRaw), env);
      if (!technician) return back('That technician no longer exists.');
      technicianId = technician.id;
    }

    const needsVisit = status === 'scheduled' || status === 'in_progress';
    if (needsVisit && !technicianId) return back('Choose a technician before scheduling this job.');
    if (needsVisit && !scheduledDate) return back('Choose a visit date before scheduling this job.');

    const effectiveTech = status === 'new' ? null : technicianId;
    const changes = [];
    if (status !== ticket.status) changes.push('Status ' + STATUS_LABELS[ticket.status] + ' => ' + STATUS_LABELS[status]);
    if (effectiveTech !== (ticket.technician_id ?? null)) {
      const tech = effectiveTech ? await getTechnician(effectiveTech, env) : null;
      changes.push('Technician => ' + (tech?.name ?? 'unassigned'));
    }
    if ((scheduledDate || null) !== (ticket.scheduled_date || null)) changes.push('Visit date => ' + (scheduledDate ?? 'cleared'));

    const nextStatus = status;
    await updateTicket(ticket.id, {
      status: nextStatus,
      technician_id: effectiveTech,
      scheduled_date: status === 'new' ? null : scheduledDate || null,
      scheduled_slot: status === 'new' ? null : scheduledSlot,
      admin_notes: notes,
    }, env);
    if (changes.length) {
      await addEvent(ticket.id, nextStatus, changes.join(' => '), env);
    }

    return c.redirect(
      '/admin/requests?status=' + encodeURIComponent(c.req.query('status') ?? '') + '&saved=1',
      303,
    );
  });

  app.get('/admin/technicians', async (c) => {
    const technicians = await listTechnicians(env);
    return c.html(
      <AdminTechnicians
        user={c.get('user')}
        technicians={technicians}
        errors={c.req.query('error') ? { name: decodeURIComponent(c.req.query('error')) } : {}}
        saved={c.req.query('saved') ? 'Technician list updated.' : ''}
      />,
    );
  });

  app.post('/admin/technicians', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    const body = await c.req.parseBody();
    const name = String(body.name ?? '').trim();
    const areas = parseAreas(body.service_areas);
    const capacity = Number.parseInt(String(body.daily_capacity ?? ''), 10);
    const fail = (message) => c.redirect(`/admin/technicians?error=${encodeURIComponent(message)}`, 303);

    if (!name) return fail('Technician name is required.');
    if (!areas.length) return fail('Add at least one service area.');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
      return fail('Daily capacity must be between 1 and 20 jobs.');
    }

    await createTechnician(
      {
        name,
        phone: String(body.phone ?? '').trim(),
        email: String(body.email ?? '').trim(),
        service_areas: areas,
        daily_capacity: capacity,
      },
      env,
    );
    return c.redirect('/admin/technicians?saved=1', 303);
  });

  app.post('/admin/technicians/:id', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    const id = Number(c.req.param('id'));
    const technician = Number.isInteger(id) ? await getTechnician(id, env) : null;
    if (!technician) return c.redirect('/admin/technicians?error=Technician not found', 303);

    const body = await c.req.parseBody();
    const name = String(body.name ?? '').trim();
    const areas = parseAreas(body.service_areas);
    const capacity = Number.parseInt(String(body.daily_capacity ?? ''), 10);
    const fail = (message) => c.redirect(`/admin/technicians?error=${encodeURIComponent(message)}`, 303);

    if (!name) return fail('Technician name is required.');
    if (!areas.length) return fail('Add at least one service area.');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
      return fail('Daily capacity must be between 1 and 20 jobs.');
    }

    await updateTechnician(technician.id, {
      name,
      phone: String(body.phone ?? '').trim(),
      email: String(body.email ?? '').trim(),
      service_areas: areas,
      daily_capacity: capacity,
      active: body.active === '1',
    }, env);
    return c.redirect('/admin/technicians?saved=1', 303);
  });

  app.post('/admin/technicians/:id/delete', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    const id = Number(c.req.param('id'));
    if (Number.isInteger(id)) {
      const technician = await getTechnician(id, env);
      if (technician) {
        await updateTicketClearTech(id, env);
        await deleteTechnician(id, env);
      }
    }
    return c.redirect('/admin/technicians?saved=1', 303);
  });

  app.get('/admin/admins', async (c) => {
    const admins = await listAdmins(env);
    let code = await getSetting(INVITE_KEY, env);
    if (!code) {
      code = inviteCode();
      await setSetting(INVITE_KEY, code, env);
    }
    return c.html(
      <AdminTeam
        user={c.get('user')}
        admins={admins}
        inviteCode={code}
        appOrigin={c.env.APP_ORIGIN}
        isOwner={c.get('role') === 'owner'}
        saved={c.req.query('saved') ? 'Admin team updated.' : ''}
        error={c.req.query('error') ? decodeURIComponent(c.req.query('error')) : ''}
      />,
    );
  });

  app.post('/admin/admins/regenerate', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    if (c.get('role') !== 'owner') {
      return c.redirect('/admin/admins?error=Only the owner can regenerate the invite link', 303);
    }
    await setSetting(INVITE_KEY, inviteCode(), env);
    return c.redirect('/admin/admins?saved=1', 303);
  });

  app.post('/admin/admins/:sub/remove', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    const sub = c.req.param('sub');
    const role = await getAdminRole(sub, env);
    if (!role) return c.redirect('/admin/admins', 303);
    if (sub === c.get('user').sub) {
      return c.redirect('/admin/admins?error=You cannot remove yourself', 303);
    }
    if (role === 'owner') {
      return c.redirect('/admin/admins?error=The owner account cannot be removed', 303);
    }
    await removeAdmin(sub, env);
    return c.redirect('/admin/admins?saved=1', 303);
  });

  app.get('/admin/join', async (c) => {
    const user = c.get('user');
    if (!user) return c.redirect(`/signin?next=${encodeURIComponent(c.req.raw.url)}`, 303);
    const code = String(c.req.query('code') ?? '');
    const stored = await getSetting(INVITE_KEY, env);
    const valid = stored && code && stored === code ? code : null;
    const already = Boolean(c.get('role'));
    if (already) return c.redirect('/admin', 303);
    return c.html(
      <AdminJoinPage
        user={user}
        inviteOk={valid}
        error={!valid ? 'That invite link is no longer valid.' : ''}
      />,
      valid ? 200 : 403,
    );
  });

  app.post('/admin/join', async (c) => {
    if (!sameOrigin(c)) return rejectSameOrigin(c);
    const user = c.get('user');
    if (!user) return c.redirect('/signin?next=%2Fadmin', 303);
    const body = await c.req.parseBody();
    const code = String(body.code ?? '');
    const stored = await getSetting(INVITE_KEY, env);
    if (!stored || code !== stored) {
      return c.redirect('/admin/join?error=invalid', 403);
    }
    if (!(await getAdminRole(user.sub, env))) await addAdmin(user.sub, 'admin', env);
    return c.redirect('/admin', 303);
  });

  app.notFound(async (c) => {
    const path = new URL(c.req.raw.url).pathname;
    if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    if (!path.startsWith('/auth/')) {
      const asset = c.env.ASSETS && typeof c.env.ASSETS.fetch === 'function'
        ? await c.env.ASSETS.fetch(c.req.raw)
        : await serveStaticFallback(c.req.raw, c.env);
      if (asset.status !== 404) return asset;
    }
    return c.html(<NotFoundPage user={c.get('user')} />, 404);
  });

  return app;
}

/** Keeps history readable after a technician is removed. */
async function updateTicketClearTech(technicianId, env) {
  const db = createDefaultClient(env);
  const affected = db
    .prepare('SELECT id FROM tickets WHERE technician_id = ?')
    .bind(technicianId)
    .all()
    .then((r) => r.results);
  for (const row of affected) {
    await db
      .prepare(
        `UPDATE tickets SET
           technician_id = NULL,
           status = CASE WHEN status IN ('scheduled','in_progress') THEN 'new' ELSE status END,
           scheduled_date = CASE WHEN status IN ('scheduled','in_progress') THEN NULL ELSE scheduled_date END,
           scheduled_slot = CASE WHEN status IN ('scheduled','in_progress') THEN NULL ELSE scheduled_slot END,
           updated_at = ?
         WHERE id = ?`
      )
      .bind(now(), row.id)
      .run();
    await addEvent(db, row.id, 'new', 'Technician removed — request returned to the queue', env);
  }
}

async function serveStaticFallback(rawRequest, env) {
  const url = new URL(rawRequest.url);
  const path = url.pathname;

  const publicDir = env?.PUBLIC_DIR ?? new URL('./public', import.meta.url).pathname;
  if (path === '/') {
    try {
      const fs = await import('node:fs');
      const indexPath = join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        return new Response(fs.readFileSync(indexPath), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    } catch {
      // fs not available (e.g. browser) — fall through to 404
    }
  }

  try {
    const decoded = decodeURIComponent(path);
    const filePath = join(publicDir, decoded);
    if (filePath.startsWith(publicDir)) {
      const fs = await import('node:fs');
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          const mime = await import('mime-types');
          const ct = mime.lookup(filePath) ?? 'application/octet-stream';
          return new Response(fs.readFileSync(filePath), { headers: { 'Content-Type': ct } });
        }
      }
    }
  } catch {
    // fs not available — fall through to 404
  }

  return new Response(null, { status: 404 });
}

function join(...parts) {
  const out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    out += '/' + parts[i].replace(/^\/+/, '');
  }
  return out;
}

function safeReturnTo(val) {
  if (!val) return '/';
  try {
    const decoded = decodeURIComponent(val);
    const parsed = new URL(decoded, 'http://localhost');
    if (parsed.pathname.startsWith('/') && !parsed.pathname.includes('..')) return parsed.pathname;
  } catch {
    // ignore
  }
  return '/';
}
