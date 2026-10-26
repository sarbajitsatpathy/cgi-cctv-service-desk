// Public pages: landing, sign-in and errors.

import { REQUEST_TYPES } from '../db.js';
import { Flash, Layout, PageHeading, StatusBadge } from '../ui.jsx';

export function Landing({ user }) {
  return (
    <Layout title="CCTV complaints and installations" user={user} active="home">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">CGI CCTV · Customer service and installation</p>
          <h1>
            Report a CCTV fault or book a new installation — a technician is
            <span class="accent"> scheduled automatically</span>.
          </h1>
          <p class="lede">
            Create an account, enter your address, product details and preferred date. We match an
            available technician in your area, and you follow every step from one ticket number.
          </p>
          <div class="hero-actions">
            {user ? (
              <a class="btn btn-primary btn-lg" href="/new">
                Raise a request
              </a>
            ) : (
              <a class="btn btn-primary btn-lg" href="/signin">
                Sign in to raise a request
              </a>
            )}
            <a class="btn btn-outline btn-lg" href={user ? '/dashboard' : '/signin'}>
              Track a request
            </a>
          </div>
          <ul class="hero-points">
            <li>Ticket number issued instantly</li>
            <li>Automatic technician assignment by area and capacity</li>
            <li>Browser notifications, calendar download and a ticket image</li>
          </ul>
        </div>
        <div class="hero-panel" aria-hidden="true">
          <div class="mock-ticket">
            <div class="mock-ticket-top">
              <span>Service ticket</span>
              <StatusBadge status="scheduled" />
            </div>
            <p class="mock-number">CGI-20261026-0001</p>
            <dl class="mock-rows">
              <div>
                <dt>Type</dt>
                <dd>CCTV complaint</dd>
              </div>
              <div>
                <dt>Visit</dt>
                <dd>Tue, 27 Oct 2026 · Morning</dd>
              </div>
              <div>
                <dt>Technician</dt>
                <dd>Assigned from your area</dd>
              </div>
            </dl>
            <div class="mock-steps">
              <span class="on">New</span>
              <span class="on">Scheduled</span>
              <span>In progress</span>
              <span>Completed</span>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">What you can request</h2>
        <div class="card-grid two">
          {Object.values(REQUEST_TYPES).map((type) => (
            <article class="card service-card">
              <span class="chip">{type.id === 'complaint' ? 'Repair' : 'New system'}</span>
              <h3>{type.label}</h3>
              <p class="muted">{type.blurb}</p>
              <ul class="ticks">
                <li>Address, product details and preferred date in one form</li>
                <li>Automatic technician matching in your service area</li>
                <li>Live status until the job is completed</li>
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">How it works</h2>
        <ol class="steps">
          <li>
            <strong>1. Create your account</strong>
            <span>Sign in once — your requests are waiting for you every time you come back.</span>
          </li>
          <li>
            <strong>2. Submit the request</strong>
            <span>Enter the address, product details, preferred date and what you need done.</span>
          </li>
          <li>
            <strong>3. Technician scheduled</strong>
            <span>The system picks an available technician in your area within their daily capacity.</span>
          </li>
          <li>
            <strong>4. Job completed</strong>
            <span>Follow new → scheduled → in progress → completed, with notifications at each step.</span>
          </li>
        </ol>
      </section>

      <section class="section cta-band">
        <div>
          <h2>Ready to get someone on site?</h2>
          <p class="muted">
            Book a visit in under two minutes. Already have a ticket? Sign in to see its live status.
          </p>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="/new">
            New request
          </a>
          <a class="btn btn-outline btn-lg" href="/admin">
            Staff dashboard
          </a>
        </div>
      </section>
    </Layout>
  );
}

export function SignInPage({ user, returnTo, error }) {
  const target = `/auth/freebuff/signin?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <Layout title="Sign in" user={user} active="signin">
      <div class="narrow">
        <PageHeading
          title={user ? 'You are signed in' : 'Sign in to CGI CCTV'}
          subtitle={
            user
              ? 'Your account is connected. Open your dashboard to see every request you have raised.'
              : 'Use your Freebuff account to create your CGI CCTV account and keep every ticket in one place.'
          }
        />
        <Flash kind="error">{error}</Flash>
        <div class="card panel">
          {user ? (
            <>
              <p class="muted">
                Signed in as <strong>{user.name || user.email || 'your account'}</strong>
              </p>
              <div class="hero-actions">
                <a class="btn btn-primary" href="/dashboard">
                  Go to my requests
                </a>
                <a class="btn btn-outline" href="/new">
                  Raise a new request
                </a>
              </div>
            </>
          ) : (
            <>
              <ul class="ticks">
                <li>Submit CCTV complaints and installation requests</li>
                <li>See your ticket number, visit date, time and technician</li>
                <li>Get browser notifications when the status changes</li>
                <li>Every past request stays in your account</li>
              </ul>
              <a class="btn btn-primary btn-lg btn-block" href={target}>
                Sign in with Freebuff
              </a>
              <p class="muted small">
                No passwords to manage — your Freebuff account (Google, GitHub or Apple) signs you in.
              </p>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

export function NotFoundPage({ user }) {
  return (
    <Layout title="Page not found" user={user}>
      <div class="narrow center">
        <PageHeading title="Page not found" subtitle="That page does not exist on the CGI CCTV service desk." />
        <a class="btn btn-primary" href="/">
          Back to home
        </a>
      </div>
    </Layout>
  );
}

export function MessagePage({ user, title, message, actionHref, actionLabel, kind = 'error' }) {
  return (
    <Layout title={title} user={user}>
      <div class="narrow center">
        <PageHeading title={title} subtitle={message} />
        <a class="btn btn-primary" href={actionHref}>
          {actionLabel}
        </a>
      </div>
    </Layout>
  );
}
