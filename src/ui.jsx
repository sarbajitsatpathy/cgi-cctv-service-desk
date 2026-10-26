// Shared layout, navigation and UI pieces.

import { SLOTS, STATUS_LABELS, STATUSES } from './db.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-28" -> "Tue, 28 Oct 2026" (parsed as a plain calendar date). */
export function fmtDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-26T08:30:00.000Z" -> "26 Oct 2026, 08:30" (browser time zone). */
export function fmtTimestamp(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm}`;
}

export function slotWindow(slot) {
  return SLOTS[slot]?.window ?? '—';
}

export function slotLabel(slot) {
  return SLOTS[slot]?.label ?? '—';
}

export function statusMeta(status) {
  return STATUSES.find((s) => s.id === status) ?? STATUSES[0];
}

export function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <span class={`badge badge-${status}`}>
      <span class="badge-dot" />
      {meta.label}
    </span>
  );
}

export function Logo() {
  return (
    <span class="brand">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
          <path d="M7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11" />
          <path d="M21 9v5" />
        </svg>
      </span>
      <span class="brand-text">
        <strong>CGI CCTV</strong>
        <small>Service Desk</small>
      </span>
    </span>
  );
}

function Nav({ user, isAdmin, active }) {
  const item = (href, label, key) => (
    <a href={href} class={active === key ? 'nav-link active' : 'nav-link'}>
      {label}
    </a>
  );
  return (
    <nav class="nav">
      {item('/', 'Home', 'home')}
      {user ? item('/dashboard', 'My requests', 'dashboard') : null}
      {user ? item('/new', 'New request', 'new') : null}
      {isAdmin ? item('/admin', 'Admin', 'admin') : null}
      {user ? (
        <span class="nav-user">
          <span class="nav-name" title={user.email ?? ''}>
            {user.name || user.email || 'Signed in'}
          </span>
          <form method="post" action="/auth/freebuff/signout" class="inline-form">
            <button type="submit" class="btn btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        </span>
      ) : (
        <a class="btn btn-primary btn-sm" href="/signin">
          Sign in
        </a>
      )}
    </nav>
  );
}

export function Layout({ title, user, isAdmin, active, children, scripts = [] }) {
  const fullTitle = title ? `${title} · CGI CCTV Service Desk` : 'CGI CCTV Service Desk · Complaints and installations';
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        <meta name="description" content="CGI CCTV customer service: report a CCTV complaint or request a new installation, get an auto-scheduled technician and track the job to completion." />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/styles.css" />
        <script type="module" src="/app.js" defer></script>
        {scripts.map((src) => (
          <script type="module" src={src} defer></script>
        ))}
      </head>
      <body>
        <header class="site-header">
          <div class="container header-inner">
            <a href="/" class="brand-link">
              <Logo />
            </a>
            <Nav user={user} isAdmin={isAdmin} active={active} />
          </div>
        </header>
        <main class="container main">{children}</main>
        <footer class="site-footer">
          <div class="container footer-grid">
            <div>
              <Logo />
              <p class="muted">
                CCTV complaints, new installations and maintenance — booked online and tracked from
                request to completion.
              </p>
            </div>
            <div>
              <h4>Contact</h4>
              <ul class="plain-list">
                <li>Phone: +1 (555) 018-4477</li>
                <li>Email: support@cgicctv.example</li>
                <li>123 Surveillance Road, Suite 4, Metro City</li>
                <li>Mon–Sat, 08:00–18:00</li>
              </ul>
            </div>
            <div>
              <h4>Quick links</h4>
              <ul class="plain-list">
                <li>
                  <a href="/new">Raise a complaint or installation request</a>
                </li>
                <li>
                  <a href="/dashboard">Track an existing request</a>
                </li>
                <li>
                  <a href="/admin">Company admin dashboard</a>
                </li>
              </ul>
            </div>
          </div>
          <div class="container footer-base muted">
            © {new Date().getFullYear()} CGI CCTV. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}

export function PageHeading({ title, subtitle, action }) {
  return (
    <div class="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p class="lede">{subtitle}</p> : null}
      </div>
      {action ? <div class="page-heading-action">{action}</div> : null}
    </div>
  );
}

export function Field({ label, name, error, hint, children }) {
  return (
    <div class={error ? 'field field-error' : 'field'}>
      <label for={name}>{label}</label>
      {children}
      {error ? <p class="field-hint error">{error}</p> : null}
      {!error && hint ? <p class="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Flash({ kind, children }) {
  if (!children) return null;
  return <div class={`flash flash-${kind ?? 'info'}`}>{children}</div>;
}
