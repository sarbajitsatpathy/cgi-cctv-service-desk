// Automatic technician scheduling: match a request to an available technician
// by service area and remaining daily capacity, lightest load first.

import { addEvent, countActiveJobs, listTechnicians, updateTicket } from './db.js';

const norm = (value) => (value || '').toLowerCase().replace(/\s+/g, ' ').trim();

function areaMatches(serviceAreas, ticketArea) {
  const target = norm(ticketArea);
  if (!target) return false;
  return serviceAreas.some((raw) => {
    const area = norm(raw);
    if (!area) return false;
    return target.includes(area) || area.includes(target);
  });
}

function parseAreas(technician) {
  try {
    const parsed = JSON.parse(technician.service_areas);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Finds the best available technician for the ticket's preferred date and
 * books it. Returns the technician, or null when nobody covers the area or
 * everyone is at capacity (the ticket then stays "new" for the admin).
 */
export async function autoSchedule(db, ticket) {
  const technicians = (await listTechnicians(db)).filter((t) => t.active);
  const candidates = [];

  for (const technician of technicians) {
    if (!areaMatches(parseAreas(technician), ticket.area)) continue;
    const load = await countActiveJobs(db, technician.id, ticket.preferred_date);
    if (load >= technician.daily_capacity) continue;
    candidates.push({ technician, load });
  }

  if (!candidates.length) return null;

  candidates.sort(
    (a, b) => a.load - b.load || a.technician.daily_capacity - b.technician.daily_capacity || a.technician.id - b.technician.id,
  );
  const chosen = candidates[0].technician;

  await updateTicket(db, ticket.id, {
    status: 'scheduled',
    technician_id: chosen.id,
    scheduled_date: ticket.preferred_date,
    scheduled_slot: ticket.time_slot,
  });
  await addEvent(
    db,
    ticket.id,
    'scheduled',
    `Automatically scheduled with ${chosen.name} for the requested date`,
  );

  return chosen;
}
