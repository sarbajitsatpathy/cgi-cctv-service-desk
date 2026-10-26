// Customer pages: dashboard, new request form, ticket detail.

import { REQUEST_TYPES, SLOTS } from '../db.js';
import { Field, Flash, Layout, PageHeading, StatusBadge, fmtDate, fmtTimestamp, slotLabel, slotWindow } from '../ui.jsx';

function TicketCard({ ticket }) {
  const visitDate = ticket.status === 'new' && !ticket.scheduled_date ? ticket.preferred_date : ticket.scheduled_date;
  return (
    <article
      class="card ticket-card"
      data-ticket
      data-id={ticket.id}
      data-no={ticket.ticket_no}
      data-status={ticket.status}
      data-updated={ticket.updated_at}
      data-tech={ticket.technician_name ?? ''}
    >
      <div class="ticket-card-head">
        <div>
          <p class="ticket-no">{ticket.ticket_no}</p>
          <p class="muted small">
            {REQUEST_TYPES[ticket.type]?.label ?? ticket.type} · raised {fmtTimestamp(ticket.created_at)}
          </p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      <div class="ticket-card-body">
        <div>
          <span class="k">Visit</span>
          <span class="v">
            {fmtDate(visitDate)} · {slotLabel(ticket.scheduled_slot || ticket.time_slot)}
          </span>
        </div>
        <div>
          <span class="k">Technician</span>
          <span class="v">{ticket.technician_name ?? 'Being assigned'}</span>
        </div>
        <div>
          <span class="k">Area</span>
          <span class="v">{ticket.area}</span>
        </div>
      </div>
      <div class="ticket-card-foot">
        <a class="btn btn-outline btn-sm" href={`/ticket/${ticket.id}`}>
          View ticket
        </a>
        <span class="muted small">Updated {fmtTimestamp(ticket.updated_at)}</span>
      </div>
    </article>
  );
}

export function Dashboard({ user, profile, tickets, createdNo }) {
  return (
    <Layout title="My requests" user={user} active="dashboard">
      <PageHeading
        title="My requests"
        subtitle={`Every complaint and installation request for ${profile?.name || user.email || 'your account'}.`}
        action={
          <a class="btn btn-primary" href="/new">
            New request
          </a>
        }
      />

      <Flash kind="success">
        {createdNo ? `Ticket ${createdNo} was created and we are booking a technician for it.` : ''}
      </Flash>

      <div class="toolbar">
        <button class="btn btn-outline btn-sm" type="button" data-enable-notifications>
          🔔 Enable browser notifications
        </button>
        <span class="muted small" data-notifications-state>
          Get told in your browser when a ticket status changes.
        </span>
      </div>

      {tickets.length ? (
        <div class="ticket-list" data-ticket-list>
          {tickets.map((ticket) => (
            <TicketCard ticket={ticket} />
          ))}
        </div>
      ) : (
        <div class="card empty-state">
          <h3>No requests yet</h3>
          <p class="muted">
            Raise your first CCTV complaint or installation request — it takes about two minutes.
          </p>
          <a class="btn btn-primary" href="/new">
            Raise a request
          </a>
        </div>
      )}
    </Layout>
  );
}

export function NewRequestPage({ user, values = {}, errors = {}, error }) {
  const v = (key, fallback = '') => values[key] ?? fallback;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Layout title="New request" user={user} active="new">
      <div class="narrow">
        <PageHeading
          title="New service request"
          subtitle="Tell us where, what and when. We match an available technician in your area as soon as you submit."
        />

        <Flash kind="error">{error}</Flash>

        <form method="post" action="/requests" class="card form" data-request-form novalidate>
          <fieldset>
            <legend>Request type</legend>
            <div class="radio-row">
              {Object.values(REQUEST_TYPES).map((type) => (
                <label class={v('type', 'complaint') === type.id ? 'radio-card selected' : 'radio-card'}>
                  <input type="radio" name="type" value={type.id} checked={v('type', 'complaint') === type.id} />
                  <strong>{type.label}</strong>
                  <span class="muted small">{type.blurb}</span>
                </label>
              ))}
            </div>
            {errors.type ? <p class="field-hint error">{errors.type}</p> : null}
          </fieldset>

          <fieldset>
            <legend>Contact details</legend>
            <div class="grid two">
              <Field label="Your name" name="contact_name" error={errors.contact_name}>
                <input
                  type="text"
                  name="contact_name"
                  value={v('contact_name')}
                  required
                  autocomplete="name"
                  placeholder="Jane Doe"
                />
              </Field>
              <Field label="Phone number" name="contact_phone" error={errors.contact_phone}>
                <input
                  type="tel"
                  name="contact_phone"
                  value={v('contact_phone')}
                  required
                  autocomplete="tel"
                  placeholder="+1 555 018 4477"
                />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Address</legend>
            <Field label="Street address" name="address_line" error={errors.address_line}>
              <input
                type="text"
                name="address_line"
                value={v('address_line')}
                required
                autocomplete="street-address"
                placeholder="14 Harbor Lane, Building B"
              />
            </Field>
            <Field
              label="Area / City"
              name="area"
              error={errors.area}
              hint="We match technicians by their service area — enter the district or city."
            >
              <input
                type="text"
                name="area"
                value={v('area')}
                required
                placeholder="Riverside"
              />
            </Field>
          </fieldset>

          <fieldset>
            <legend>Product details</legend>
            <div class="grid two">
              <Field label="Camera / equipment" name="product" error={errors.product}>
                <input type="text" name="product" value={v('product')} required placeholder="Dome camera set" />
              </Field>
              <Field label="Model or serial (optional)" name="model" error={errors.model}>
                <input type="text" name="model" value={v('model')} placeholder="Hikvision DS-2CD2143" />
              </Field>
            </div>
            <Field label="Quantity" name="quantity" error={errors.quantity}>
              <input type="number" name="quantity" min="1" max="100" value={v('quantity', '1')} required />
            </Field>
          </fieldset>

          <fieldset>
            <legend>Service requirements</legend>
            <Field
              label="What do you need?"
              name="requirements"
              error={errors.requirements}
              hint="Describe the fault, the rooms or perimeter to cover, cabling, recording requirements…"
            >
              <textarea name="requirements" rows="5" required placeholder="Two cameras show no picture after the storm…">
                {v('requirements')}
              </textarea>
            </Field>
            <div class="grid two">
              <Field label="Preferred date" name="preferred_date" error={errors.preferred_date}>
                <input type="date" name="preferred_date" value={v('preferred_date')} min={today} required />
              </Field>
              <Field label="Preferred time" name="time_slot" error={errors.time_slot}>
                <select name="time_slot" value={v('time_slot', 'morning')}>
                  {Object.values(SLOTS).map((slot) => (
                    <option value={slot.id}>
                      {slot.label} ({slot.window})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>

          <p class="muted small">
            Submitting creates a ticket number immediately. If a technician in your area is free on your
            preferred date, the visit is booked straight away.
          </p>
          <button type="submit" class="btn btn-primary btn-lg btn-block">
            Submit request
          </button>
        </form>
      </div>
    </Layout>
  );
}

export function TicketPage({ user, isAdmin, ticket, events, flash, canEdit }) {
  const scheduled = Boolean(ticket.scheduled_date);
  const type = REQUEST_TYPES[ticket.type];
  const visitDate = scheduled ? ticket.scheduled_date : ticket.preferred_date;
  const visitSlot = scheduled ? ticket.scheduled_slot || ticket.time_slot : ticket.time_slot;

  return (
    <Layout title={`Ticket ${ticket.ticket_no}`} user={user} active="dashboard">
      <div class="ticket-hero card">
        <div>
          <p class="eyebrow">{type?.label ?? ticket.type}</p>
          <h1 class="ticket-no-lg">{ticket.ticket_no}</h1>
          <p class="muted">
            Raised {fmtTimestamp(ticket.created_at)} · {ticket.contact_name}
          </p>
        </div>
        <div class="ticket-hero-right">
          <StatusBadge status={ticket.status} />
          <p class="muted small" data-ticket-live data-id={ticket.id} data-status={ticket.status} data-updated={ticket.updated_at} data-no={ticket.ticket_no} data-tech={ticket.technician_name ?? ''}>
            {ticket.status === 'new' ? 'Waiting for technician assignment' : statusSentence(ticket)}
          </p>
        </div>
      </div>

      <Flash kind="success">{flash}</Flash>

      <div class="grid two">
        <section class="card">
          <h2>Service visit</h2>
          {scheduled ? (
            <dl class="detail-list">
              <div>
                <dt>Date</dt>
                <dd>{fmtDate(ticket.scheduled_date)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>
                  {slotLabel(visitSlot)} · {slotWindow(visitSlot)}
                </dd>
              </div>
              <div>
                <dt>Technician</dt>
                <dd>
                  {ticket.technician_name}
                  {ticket.technician_phone ? <span class="muted"> · {ticket.technician_phone}</span> : null}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>
                  {ticket.address_line}
                  <br />
                  {ticket.area}
                </dd>
              </div>
            </dl>
          ) : (
            <div class="waiting">
              <p>
                <strong>No technician booked yet.</strong> Your requested date is {fmtDate(visitDate)} (
                {slotLabel(visitSlot)}). We are matching an available technician in {ticket.area} and will
                notify you as soon as one is assigned.
              </p>
            </div>
          )}

          <div class="action-row">
            <a class="btn btn-outline btn-sm" href={`/api/tickets/${ticket.id}/calendar.ics`} download>
              📅 Add to calendar
            </a>
            <button class="btn btn-outline btn-sm" type="button" data-save-image={ticket.id}>
              🖼 Save ticket image
            </button>
            <button class="btn btn-outline btn-sm" type="button" data-enable-notifications>
              🔔 Notifications
            </button>
          </div>
        </section>

        <section class="card">
          <h2>Request details</h2>
          <dl class="detail-list">
            <div>
              <dt>Type</dt>
              <dd>{type?.label ?? ticket.type}</dd>
            </div>
            <div>
              <dt>Equipment</dt>
              <dd>
                {ticket.product || '—'}
                {ticket.model ? ` · ${ticket.model}` : ''}
                {ticket.quantity > 1 ? ` · ×${ticket.quantity}` : ''}
              </dd>
            </div>
            <div>
              <dt>Preferred visit</dt>
              <dd>
                {fmtDate(ticket.preferred_date)} · {slotLabel(ticket.time_slot)}
              </dd>
            </div>
            <div>
              <dt>Requirements</dt>
              <dd class="prewrap">{ticket.requirements}</dd>
            </div>
            {ticket.admin_notes ? (
              <div>
                <dt>Note from the team</dt>
                <dd class="prewrap">{ticket.admin_notes}</dd>
              </div>
            ) : null}
          </dl>
          <div class="action-row">
            <a class="btn btn-ghost btn-sm" href="/dashboard">
              ← All my requests
            </a>
            {canEdit ? (
              <a class="btn btn-ghost btn-sm" href={`/admin/requests?status=${ticket.status}`}>
                Manage in admin →
              </a>
            ) : null}
          </div>
        </section>
      </div>

      <section class="card">
        <h2>Status history</h2>
        <ol class="timeline">
          {events.map((event) => (
            <li class={`timeline-item is-${event.event}`}>
              <span class="timeline-dot" />
              <div>
                <strong>{STATUS_LABEL(event.event)}</strong>
                <span class="muted small"> · {fmtTimestamp(event.created_at)}</span>
                {event.note ? <p class="muted small">{event.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div class="card notify-panel" data-notify-panel hidden>
        <div>
          <strong>Get updates in your browser</strong>
          <p class="muted small">We will notify you when this ticket's status changes — even on another page of this site.</p>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-enable-notifications>
          Enable notifications
        </button>
      </div>
    </Layout>
  );
}

function STATUS_LABEL(event) {
  const known = {
    new: 'Request received',
    scheduled: 'Scheduled',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return known[event] ?? event.replace(/_/g, ' ');
}

function statusSentence(ticket) {
  const date = fmtDate(ticket.scheduled_date);
  const slot = slotLabel(ticket.scheduled_slot || ticket.time_slot);
  switch (ticket.status) {
    case 'scheduled':
      return `Technician ${ticket.technician_name} visits on ${date} (${slot}).`;
    case 'in_progress':
      return `Technician ${ticket.technician_name} is on site — work in progress.`;
    case 'completed':
      return `Completed on ${date} by ${ticket.technician_name}.`;
    case 'cancelled':
      return 'This request was cancelled.';
    default:
      return 'Waiting to be scheduled.';
  }
}
