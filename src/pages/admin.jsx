// Admin dashboard pages.

import { REQUEST_TYPES, SLOTS, STATUSES } from '../db.js';
import { Field, Flash, Layout, PageHeading, StatusBadge, fmtDate, fmtTimestamp, slotLabel } from '../ui.jsx';

function AdminNav({ active }) {
  const tabs = [
    ['/admin', 'Overview', 'overview'],
    ['/admin/requests', 'Requests', 'requests'],
    ['/admin/technicians', 'Technicians', 'technicians'],
    ['/admin/admins', 'Admin team', 'admins'],
  ];
  return (
    <nav class="tabs">
      {tabs.map(([href, label, key]) => (
        <a href={href} class={active === key ? 'tab active' : 'tab'}>
          {label}
        </a>
      ))}
    </nav>
  );
}

function AdminShell({ active, title, subtitle, action, user, children }) {
  return (
    <Layout title={`Admin · ${title}`} user={user} active="admin">
      <PageHeading title={title} subtitle={subtitle} action={action} />
      <AdminNav active={active} />
      {children}
    </Layout>
  );
}

export function AdminSetupPage({ user, error }) {
  return (
    <Layout title="Create the first admin account" user={user} active="admin">
      <div class="narrow">
        <PageHeading
          title="Create the first admin account"
          subtitle="This company dashboard has no administrators yet. The first account to sign up becomes the owner and can then add technicians and invite the rest of the team."
        />
        <Flash kind="error">{error}</Flash>
        <div class="card panel">
          <p class="muted">
            Signed in as <strong>{user.name || user.email || 'your account'}</strong>.
          </p>
          <form method="post" action="/admin/setup">
            <button type="submit" class="btn btn-primary btn-lg btn-block">
              Create the first admin account
            </button>
          </form>
          <p class="muted small">You can add or remove other administrators afterwards from the Admin team page.</p>
        </div>
      </div>
    </Layout>
  );
}

export function AdminOverview({ user, counts, tickets, techCount, areaCount, todayCount }) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return (
    <AdminShell
      active="overview"
      title="Dashboard"
      subtitle="Everything the service desk is handling right now."
      user={user}
      action={
        <a class="btn btn-outline" href="/admin/requests">
          All requests
        </a>
      }
    >
      <div class="stat-grid">
        <div class="card stat">
          <span class="stat-value">{total}</span>
          <span class="stat-label">Total requests</span>
        </div>
        {STATUSES.map((status) => (
          <div class="card stat">
            <span class={`stat-value status-${status.id}`}>{counts[status.id]}</span>
            <span class="stat-label">{status.label}</span>
          </div>
        ))}
        <div class="card stat">
          <span class="stat-value">{techCount}</span>
          <span class="stat-label">Technicians ({areaCount} areas)</span>
        </div>
        <div class="card stat">
          <span class="stat-value">{todayCount}</span>
          <span class="stat-label">Jobs booked today</span>
        </div>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>Latest requests</h2>
          <a class="btn btn-ghost btn-sm" href="/admin/requests">
            View all →
          </a>
        </div>
        {tickets.length ? (
          <div class="job-list">
            {tickets.slice(0, 8).map((ticket) => (
              <div class="job-row">
                <div class="job-main">
                  <a class="ticket-no" href={`/ticket/${ticket.id}`}>
                    {ticket.ticket_no}
                  </a>
                  <p class="muted small">
                    {REQUEST_TYPES[ticket.type]?.label} · {ticket.contact_name} · {ticket.area} · raised{' '}
                    {fmtTimestamp(ticket.created_at)}
                  </p>
                </div>
                <div class="job-meta">
                  <StatusBadge status={ticket.status} />
                  <span class="muted small">
                    {ticket.scheduled_date
                      ? `${fmtDate(ticket.scheduled_date)} · ${slotLabel(ticket.scheduled_slot)} · ${ticket.technician_name ?? 'Unassigned'}`
                      : `Requested ${fmtDate(ticket.preferred_date)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p class="muted">No requests yet.</p>
        )}
      </section>
    </AdminShell>
  );
}

export function AdminRequests({ user, tickets, status, counts, technicians, saved, error }) {
  const filters = [['', 'All'], ...STATUSES.map((s) => [s.id, `${s.label} (${counts?.[s.id] ?? 0})`])];
  return (
    <AdminShell
      active="requests"
      title="Customer requests"
      subtitle="Update a job from new to scheduled, in progress, completed or cancelled."
      user={user}
    >
      <Flash kind="success">{saved}</Flash>
      <Flash kind="error">{error}</Flash>

      <nav class="tabs tabs-wrap">
        {filters.map(([id, label]) => (
          <a href={id ? `/admin/requests?status=${id}` : '/admin/requests'} class={status === id || (!status && !id) ? 'tab active' : 'tab'}>
            {label}
          </a>
        ))}
      </nav>

      {tickets.length ? (
        <div class="job-list admin-jobs">
          {tickets.map((ticket) => (
            <form method="post" action={`/admin/requests/${ticket.id}`} class="card job-form" data-job-form>
              <div class="job-form-head">
                <div>
                  <a class="ticket-no" href={`/ticket/${ticket.id}`}>
                    {ticket.ticket_no}
                  </a>
                  <p class="muted small">
                    {REQUEST_TYPES[ticket.type]?.label} · {ticket.contact_name} · {ticket.contact_phone}
                  </p>
                  <p class="muted small">
                    {ticket.address_line}, {ticket.area} · raised {fmtTimestamp(ticket.created_at)}
                  </p>
                </div>
                <StatusBadge status={ticket.status} />
              </div>

              <div class="job-form-body">
                <div class="field">
                  <label for={`status-${ticket.id}`}>Status</label>
                  <select name="status" id={`status-${ticket.id}`}>
                    {STATUSES.map((s) => (
                      <option value={s.id} selected={s.id === ticket.status}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="field">
                  <label for={`tech-${ticket.id}`}>Technician</label>
                  <select name="technician_id" id={`tech-${ticket.id}`}>
                    <option value="">— Unassigned —</option>
                    {technicians.map((tech) => (
                      <option value={tech.id} selected={tech.id === ticket.technician_id}>
                        {tech.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="field">
                  <label for={`date-${ticket.id}`}>Visit date</label>
                  <input
                    type="date"
                    name="scheduled_date"
                    id={`date-${ticket.id}`}
                    value={ticket.scheduled_date ?? ticket.preferred_date}
                  />
                </div>
                <div class="field">
                  <label for={`slot-${ticket.id}`}>Time</label>
                  <select name="scheduled_slot" id={`slot-${ticket.id}`}>
                    {Object.values(SLOTS).map((slot) => (
                      <option value={slot.id} selected={slot.id === (ticket.scheduled_slot ?? ticket.time_slot)}>
                        {slot.label} ({slot.window})
                      </option>
                    ))}
                  </select>
                </div>
                <div class="field field-wide">
                  <label for={`notes-${ticket.id}`}>Internal note shown to the customer</label>
                  <input
                    type="text"
                    name="admin_notes"
                    id={`notes-${ticket.id}`}
                    value={ticket.admin_notes ?? ''}
                    placeholder="e.g. Customer asked for a call 30 minutes before arrival"
                  />
                </div>
              </div>

              <div class="job-form-foot">
                <span class="muted small">
                  Preferred: {fmtDate(ticket.preferred_date)} · {slotLabel(ticket.time_slot)}
                  {ticket.technician_name ? ` · currently ${ticket.technician_name}` : ' · no technician yet'}
                </span>
                <button type="submit" class="btn btn-primary btn-sm">
                  Save job
                </button>
              </div>
            </form>
          ))}
        </div>
      ) : (
        <div class="card empty-state">
          <h3>Nothing here</h3>
          <p class="muted">No requests match this filter.</p>
        </div>
      )}
    </AdminShell>
  );
}

export function AdminTechnicians({ user, technicians, errors, saved }) {
  return (
    <AdminShell
      active="technicians"
      title="Technicians"
      subtitle="Service areas and daily capacity decide who gets auto-scheduled."
      user={user}
    >
      <Flash kind="success">{saved}</Flash>

      <div class="grid two">
        <section class="card">
          <h2>Add a technician</h2>
          <form method="post" action="/admin/technicians" class="form">
            <Field label="Full name" name="name" error={errors.name}>
              <input type="text" name="name" required placeholder="Marcus Webb" />
            </Field>
            <div class="grid two">
              <Field label="Phone" name="phone" error={errors.phone}>
                <input type="tel" name="phone" placeholder="+1 555 010 2233" />
              </Field>
              <Field label="Email (optional)" name="email" error={errors.email}>
                <input type="email" name="email" placeholder="marcus@cgicctv.example" />
              </Field>
            </div>
            <Field
              label="Service areas"
              name="service_areas"
              error={errors.service_areas}
              hint="Comma separated districts or cities the technician covers."
            >
              <input type="text" name="service_areas" required placeholder="Riverside, Old Town, Harbor District" />
            </Field>
            <Field
              label="Daily capacity (jobs per day)"
              name="daily_capacity"
              error={errors.daily_capacity}
              hint="Once a day is full, requests are offered to someone else."
            >
              <input type="number" name="daily_capacity" min="1" max="20" value="3" required />
            </Field>
            <button type="submit" class="btn btn-primary btn-block">
              Add technician
            </button>
          </form>
        </section>

        <section class="card">
          <h2>Team ({technicians.length})</h2>
          {technicians.length ? (
            <div class="tech-list">
              {technicians.map((tech) => (
                <details class="tech-card" open>
                  <summary>
                    <span>
                      <strong>{tech.name}</strong>
                      <span class="muted small"> · {JSON.parse(tech.service_areas).join(', ') || 'no areas'}</span>
                    </span>
                    <span class={tech.active ? 'chip chip-on' : 'chip'}>{tech.active ? 'Active' : 'Paused'}</span>
                  </summary>
                  <form method="post" action={`/admin/technicians/${tech.id}`} class="form">
                    <div class="grid two">
                      <Field label="Name" name="name">
                        <input type="text" name="name" value={tech.name} required />
                      </Field>
                      <Field label="Phone" name="phone">
                        <input type="tel" name="phone" value={tech.phone} />
                      </Field>
                    </div>
                    <div class="grid two">
                      <Field label="Email" name="email">
                        <input type="email" name="email" value={tech.email} />
                      </Field>
                      <Field label="Daily capacity" name="daily_capacity">
                        <input type="number" name="daily_capacity" min="1" max="20" value={tech.daily_capacity} required />
                      </Field>
                    </div>
                    <Field label="Service areas" name="service_areas" hint="Comma separated.">
                      <input type="text" name="service_areas" value={JSON.parse(tech.service_areas).join(', ')} required />
                    </Field>
                    <label class="check">
                      <input type="checkbox" name="active" value="1" checked={Boolean(tech.active)} />
                      Available for automatic scheduling
                    </label>
                    <div class="action-row">
                      <button type="submit" class="btn btn-primary btn-sm">
                        Save
                      </button>
                    </div>
                  </form>
                  <form
                    method="post"
                    action={`/admin/technicians/${tech.id}/delete`}
                    class="form danger-zone"
                    data-confirm="Remove this technician? Existing jobs keep their history."
                  >
                    <button type="submit" class="btn btn-danger btn-sm">
                      Remove technician
                    </button>
                  </form>
                </details>
              ))}
            </div>
          ) : (
            <div class="empty-state">
              <h3>No technicians yet</h3>
              <p class="muted">Requests can only be auto-scheduled once a technician covers the customer's area.</p>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

export function AdminTeam({ user, admins, inviteCode, appOrigin, saved, error, isOwner }) {
  const inviteUrl = `${appOrigin}/admin/join?code=${inviteCode}`;
  return (
    <AdminShell
      active="admins"
      title="Admin team"
      subtitle="Administrators manage technicians, service areas, capacity and job statuses."
      user={user}
    >
      <Flash kind="success">{saved}</Flash>
      <Flash kind="error">{error}</Flash>

      <div class="grid two">
        <section class="card">
          <h2>Administrators</h2>
          <div class="job-list">
            {admins.map((admin) => (
              <div class="job-row">
                <div class="job-main">
                  <strong>{admin.name || 'Unnamed account'}</strong>
                  <p class="muted small">{admin.email || 'No email on the account'}</p>
                </div>
                <div class="job-meta">
                  <span class={admin.role === 'owner' ? 'chip chip-on' : 'chip'}>{admin.role}</span>
                  {admin.sub !== user.sub ? (
                    <form
                      method="post"
                      action={`/admin/admins/${admin.sub}/remove`}
                      class="inline-form"
                      data-confirm="Remove this administrator?"
                    >
                      <button type="submit" class="btn btn-ghost btn-sm">
                        Remove
                      </button>
                    </form>
                  ) : (
                    <span class="muted small">you</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p class="muted small">
            Administrators are added through the invite link below — never by typing someone else's email.
          </p>
        </section>

        <section class="card">
          <h2>Invite link</h2>
          <p class="muted">
            Anyone who opens this link <strong>while signed in</strong> joins the admin team. Share it only
            with your staff, and regenerate it if it leaks.
          </p>
          <p class="code-block" data-copy-source>{inviteUrl}</p>
          <div class="action-row">
            <button class="btn btn-outline btn-sm" type="button" data-copy>
              Copy link
            </button>
            <form method="post" action="/admin/admins/regenerate" class="inline-form" data-confirm="Regenerate the invite link? The old link stops working.">
              <button type="submit" class="btn btn-danger btn-sm">
                Regenerate link
              </button>
            </form>
          </div>
          {!isOwner ? <p class="muted small">Only the owner account can regenerate the invite link.</p> : null}
        </section>
      </div>
    </AdminShell>
  );
}

export function AdminJoinPage({ user, inviteOk, error }) {
  return (
    <Layout title="Join the admin team" user={user} active="admin">
      <div class="narrow">
        <PageHeading
          title="Join the admin team"
          subtitle={
            inviteOk
              ? 'This invite link is valid. Confirm to add your account to the CGI CCTV admin dashboard.'
              : 'That invite link is not valid or has been regenerated.'
          }
        />
        <Flash kind="error">{error}</Flash>
        <div class="card panel">
          {inviteOk ? (
            <form method="post" action="/admin/join">
              <input type="hidden" name="code" value={inviteOk} />
              <button type="submit" class="btn btn-primary btn-lg btn-block">
                Join as an administrator
              </button>
            </form>
          ) : (
            <a class="btn btn-outline btn-block" href="/admin">
              Back to dashboard
            </a>
          )}
        </div>
      </div>
    </Layout>
  );
}
