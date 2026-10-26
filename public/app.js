// CGI CCTV Service Desk — browser behaviour.
// - browser notifications when a ticket status changes
// - live polling of the signed-in customer's tickets
// - save a ticket as a PNG image (share sheet on phones, download elsewhere)
// - copy invite links, confirm destructive forms, small form niceties

const STATUS_LABELS = {
  new: 'New',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS = {
  new: { fg: '#1d4ed8', bg: '#e6edff' },
  scheduled: { fg: '#a35a06', bg: '#fdf0dc' },
  in_progress: { fg: '#5b3fc4', bg: '#e8e3ff' },
  completed: { fg: '#14804a', bg: '#e5f6ec' },
  cancelled: { fg: '#b42318', bg: '#fdeceb' },
};

/* --- toast --------------------------------------------------------------- */

function ensureStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

function toast(title, message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' is-error' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  const body = document.createElement('span');
  body.textContent = message;
  el.append(strong, body);
  ensureStack().appendChild(el);
  setTimeout(() => el.remove(), 6500);
}

/* --- notifications + polling --------------------------------------------- */

const poller = { timer: null, baseline: null, dead: false, reloading: false };

async function fetchMyTickets() {
  const res = await fetch('/api/my/tickets', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    poller.dead = true;
    stopPolling();
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

function describe(ticket) {
  const parts = [`Status: ${STATUS_LABELS[ticket.status] ?? ticket.status}`];
  if (ticket.scheduled_date) {
    const slot = ticket.scheduled_slot === 'afternoon' ? 'afternoon' : 'morning';
    parts.push(`Visit ${ticket.scheduled_date} (${slot})`);
  }
  if (ticket.technician_name) parts.push(`Technician ${ticket.technician_name}`);
  return parts.join(' · ');
}

async function showNotification(title, options) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return true;
    }
  } catch {
    /* fall through to the constructor below */
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    /* constructor notifications are blocked on some phones; the toast still shows */
    return false;
  }
}

function notifyUpdate(ticket) {
  const body = describe(ticket);
  showNotification(`CGI CCTV · ${ticket.ticket_no}`, {
    body,
    tag: `ticket-${ticket.id}`,
    icon: '/favicon.svg',
    data: { url: `/ticket/${ticket.id}` },
  });
  toast(ticket.ticket_no, body);
  refreshCard(ticket);

  // The open ticket page shows dates and history, so reload it once to pick up
  // the full change rather than leaving a stale visit card next to a new badge.
  if (document.querySelector(`[data-ticket-live][data-id="${ticket.id}"]`) && !poller.reloading) {
    poller.reloading = true;
    setTimeout(() => location.reload(), 1600);
  }
}

function refreshCard(ticket) {
  document.querySelectorAll(`[data-ticket][data-id="${ticket.id}"]`).forEach((card) => {
    card.dataset.status = ticket.status;
    card.dataset.updated = ticket.updated_at;
    const badge = card.querySelector('.badge');
    if (badge) {
      badge.className = `badge badge-${ticket.status}`;
      const label = badge.childNodes[badge.childNodes.length - 1];
      if (label) label.textContent = STATUS_LABELS[ticket.status] ?? ticket.status;
    }
    const updated = card.querySelector('.ticket-card-foot .muted');
    if (updated) updated.textContent = 'Updated just now';
  });
  document.querySelectorAll('[data-ticket-live]').forEach((el) => {
    if (el.dataset.id === String(ticket.id)) {
      el.dataset.status = ticket.status;
      el.dataset.updated = ticket.updated_at;
      const badge = document.querySelector('.ticket-hero .badge');
      if (badge) {
        badge.className = `badge badge-${ticket.status}`;
        const label = badge.childNodes[badge.childNodes.length - 1];
        if (label) label.textContent = STATUS_LABELS[ticket.status] ?? ticket.status;
      }
    }
  });
}

async function pollOnce() {
  if (poller.dead || poller.reloading) return;
  const tickets = await fetchMyTickets();
  if (!tickets) return;
  const seen = new Map(tickets.map((t) => [t.id, t]));
  if (poller.baseline) {
    for (const ticket of tickets) {
      const before = poller.baseline.get(ticket.id);
      if (before && before.updated_at !== ticket.updated_at) notifyUpdate(ticket);
      else if (before && before.status !== ticket.status) notifyUpdate(ticket);
    }
  }
  poller.baseline = seen;
}

function startPolling() {
  if (poller.timer || poller.dead) return;
  pollOnce();
  poller.timer = setInterval(pollOnce, 20000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !poller.dead) pollOnce();
  });
}

function stopPolling() {
  if (poller.timer) clearInterval(poller.timer);
  poller.timer = null;
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    toast('Not supported', 'This browser does not support notifications.', true);
    return;
  }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission === 'granted') {
    toast('Notifications on', 'You will be told when a ticket status changes.');
    startPolling();
    pollOnce();
  } else if (permission === 'denied') {
    toast('Blocked', 'Notifications are blocked for this site in your browser settings.', true);
  }
  document.querySelectorAll('[data-notify-panel]').forEach((el) => (el.hidden = true));
}

/* --- save the ticket as an image ----------------------------------------- */

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = attempt;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderTicketCanvas(ticket) {
  const W = 1080;
  const H = 1560;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const font = (weight, size) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;

  // background
  ctx.fillStyle = '#0a1430';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.2, 0, 60, W * 0.2, 0, 900);
  glow.addColorStop(0, 'rgba(64, 96, 180, 0.55)');
  glow.addColorStop(1, 'rgba(10, 20, 48, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 700);

  // brand
  ctx.fillStyle = '#f0b429';
  roundRect(ctx, 64, 70, 96, 96, 24);
  ctx.fill();
  ctx.strokeStyle = '#0a1430';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(84, 112);
  ctx.lineTo(112, 96);
  ctx.lineTo(140, 112);
  ctx.lineTo(112, 128);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(96, 126);
  ctx.lineTo(96, 142);
  ctx.quadraticCurveTo(96, 152, 112, 152);
  ctx.quadraticCurveTo(128, 152, 128, 142);
  ctx.lineTo(128, 126);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(800, 46);
  ctx.fillText('CGI CCTV', 190, 118);
  ctx.fillStyle = '#f0b429';
  ctx.font = font(700, 22);
  ctx.fillText('S E R V I C E   T I C K E T', 192, 150);

  // card
  const cardX = 56;
  const cardY = 236;
  const cardW = W - cardX * 2;
  const cardH = H - cardY - 190;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.fill();

  const innerX = cardX + 64;
  const innerW = cardW - 128;
  let y = cardY + 96;

  ctx.fillStyle = '#5d6679';
  ctx.font = font(700, 24);
  ctx.fillText('TICKET NUMBER', innerX, y);
  y += 64;
  ctx.fillStyle = '#12224a';
  ctx.font = font(800, 62);
  ctx.fillText(ticket.ticket_no, innerX, y);

  // status pill
  const statusKey = STATUS_LABELS[ticket.status] ? ticket.status : 'new';
  const colors = STATUS_COLORS[statusKey];
  const statusText = STATUS_LABELS[statusKey] ?? 'New';
  ctx.font = font(800, 26);
  const pillW = ctx.measureText(statusText).width + 64;
  ctx.fillStyle = colors.bg;
  roundRect(ctx, cardX + cardW - 64 - pillW, cardY + 130, pillW, 56, 28);
  ctx.fill();
  ctx.fillStyle = colors.fg;
  ctx.fillText(statusText, cardX + cardW - 64 - pillW + 32, cardY + 168);

  y += 56;
  ctx.strokeStyle = '#e4e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(innerX, y);
  ctx.lineTo(innerX + innerW, y);
  ctx.stroke();
  y += 66;

  const slotLabel = ticket.slot_label || (ticket.scheduled_slot === 'afternoon' ? 'Afternoon' : 'Morning');
  const slotWindow = ticket.slot_window || (ticket.scheduled_slot === 'afternoon' ? '13:00 – 17:00' : '08:00 – 12:00');
  const visitDate = ticket.scheduled_date || ticket.preferred_date;

  const rows = [
    ['Request type', ticket.type_label || ticket.type],
    ['Visit date', `${visitDate} · ${slotLabel}`],
    ['Time window', slotWindow],
    ['Technician', ticket.technician_name || 'Being assigned'],
    ['Technician phone', ticket.technician_phone || '—'],
    ['Address', `${ticket.address_line}, ${ticket.area}`],
    ['Equipment', `${ticket.product || '—'}${ticket.model ? ` · ${ticket.model}` : ''}${Number(ticket.quantity) > 1 ? ` · ×${ticket.quantity}` : ''}`],
    ['Contact', `${ticket.contact_name} · ${ticket.contact_phone}`],
    ['Raised', ticket.created_at ? ticket.created_at.slice(0, 16).replace('T', ' ') : '—'],
  ];

  const labelW = 260;
  for (const [label, value] of rows) {
    ctx.fillStyle = '#5d6679';
    ctx.font = font(600, 27);
    ctx.fillText(label, innerX, y);
    ctx.fillStyle = '#101828';
    ctx.font = font(700, 30);
    const lines = wrapLines(ctx, String(value), innerW - labelW, 2);
    lines.forEach((line, index) => ctx.fillText(line, innerX + labelW, y + index * 36));
    y += Math.max(62, 30 + lines.length * 36);
  }

  y += 8;
  ctx.fillStyle = '#5d6679';
  ctx.font = font(700, 24);
  ctx.fillText('REQUIREMENTS', innerX, y);
  y += 40;
  ctx.fillStyle = '#101828';
  ctx.font = font(500, 27);
  for (const line of wrapLines(ctx, ticket.requirements, innerW, 4)) {
    ctx.fillText(line, innerX, y);
    y += 38;
  }

  // footer
  const footY = H - 96;
  ctx.fillStyle = '#f0b429';
  ctx.fillRect(64, footY - 54, 14, 44);
  ctx.fillStyle = '#c6cee4';
  ctx.font = font(600, 26);
  ctx.fillText('Track this ticket any time at', 96, footY - 36);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 32);
  ctx.fillText(`${ticket.origin ?? ''}/dashboard`, 96, footY + 4);

  return canvas;
}

async function saveTicketImage(ticketId, button) {
  const original = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Preparing image…';
  }
  try {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (res.status === 401) {
      window.location.href = `/signin?next=${encodeURIComponent(`/ticket/${ticketId}`)}`;
      return;
    }
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    const ticket = await res.json();
    const canvas = renderTicketCanvas(ticket);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not render the image');

    const file = new File([blob], `${ticket.ticket_no}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `CGI CCTV ticket ${ticket.ticket_no}` });
        toast('Ticket saved', 'Share sheet opened — choose your gallery or photos app to keep it.');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // user closed the sheet
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${ticket.ticket_no}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Ticket saved', `${ticket.ticket_no}.png downloaded to your device.`);
  } catch (err) {
    toast('Could not save image', String(err && err.message ? err.message : err), true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

/* --- small helpers -------------------------------------------------------- */

async function copyFromElement(button) {
  const block = document.querySelector('[data-copy-source]');
  if (!block) return;
  const value = block.textContent.trim();
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  block.classList.add('copied');
  button.textContent = 'Copied ✓';
  setTimeout(() => {
    block.classList.remove('copied');
    button.textContent = 'Copy link';
  }, 2000);
}

function setupForms() {
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    });
  });

  document.querySelectorAll('.radio-card input[type="radio"]').forEach((input) => {
    input.addEventListener('change', () => {
      document.querySelectorAll('.radio-card').forEach((card) => card.classList.remove('selected'));
      const card = input.closest('.radio-card');
      if (card) card.classList.add('selected');
    });
  });

  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.min || input.min < local) input.min = local;
  });
}

/* --- wiring --------------------------------------------------------------- */

document.addEventListener('click', (event) => {
  const notify = event.target.closest('[data-enable-notifications]');
  if (notify) {
    event.preventDefault();
    enableNotifications();
    return;
  }
  const image = event.target.closest('[data-save-image]');
  if (image) {
    event.preventDefault();
    saveTicketImage(image.dataset.saveImage, image);
    return;
  }
  const copy = event.target.closest('[data-copy]');
  if (copy) {
    event.preventDefault();
    copyFromElement(copy);
  }
});

setupForms();

// A service worker lets phone browsers display notifications (the Notification
// constructor is unavailable on Android Chrome).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Only signed-in pages with ticket UI need the update poller; public pages must
// not fire an unauthorized /api request on every visit.
if (document.querySelector('[data-ticket], [data-enable-notifications]')) startPolling();
