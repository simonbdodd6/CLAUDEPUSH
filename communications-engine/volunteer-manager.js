// Volunteer communication builder — requests, thank-yous, coordination.

import { COMMUNICATION_TYPES } from './content-generator.js';
import { selectAudience, AUDIENCE_TYPES } from './audience-selector.js';

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

export function buildVolunteerRequest(event, rolesNeeded, options = {}) {
  const {
    clubName       = 'Your Club',
    organiserName  = 'The Committee',
    deadline       = 'Friday',
  } = options;

  const rolesList = Array.isArray(rolesNeeded)
    ? rolesNeeded.map(r => `• ${r.role ?? r}${r.count ? ` (${r.count} needed)` : ''}${r.description ? ` — ${r.description}` : ''}`).join('\n')
    : `• ${rolesNeeded}`;

  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })
    : event.date ?? 'TBC';

  return {
    type: COMMUNICATION_TYPES.VOLUNTEER_REQUEST,
    audienceType: AUDIENCE_TYPES.VOLUNTEERS,
    template: COMMUNICATION_TYPES.VOLUNTEER_REQUEST,
    vars: {
      club_name:     clubName,
      organiser_name: organiserName,
      event_name:    event.name,
      event_date:    eventDate,
      roles_list:    rolesList,
      deadline,
    },
    metadata: { eventId: event.id, eventName: event.name, rolesCount: Array.isArray(rolesNeeded) ? rolesNeeded.length : 1 },
  };
}

export function buildVolunteerThankYou(volunteer, event, options = {}) {
  const {
    clubName      = 'Your Club',
    organiserName = 'The Committee',
    customMessage = null,
  } = options;

  const name = volunteer.name ?? volunteer.firstName ?? 'Volunteer';

  return {
    type: COMMUNICATION_TYPES.VOLUNTEER_THANKYOU,
    audienceType: AUDIENCE_TYPES.VOLUNTEERS,
    template: COMMUNICATION_TYPES.VOLUNTEER_THANKYOU,
    vars: {
      club_name:      clubName,
      organiser_name: organiserName,
      first_name:     name.split(' ')[0],
      event_name:     event.name ?? event,
      thank_you_text: customMessage ?? `Your help at ${event.name ?? event} made a real difference. ${clubName} wouldn\'t be the same without volunteers like you.`,
    },
    metadata: { volunteerId: volunteer.id, eventName: event.name ?? event },
  };
}

// Select volunteers based on skills or past involvement.
export async function selectVolunteers(criteria = {}) {
  const { skills, minEvents = 0, limit } = criteria;

  const audience = await selectAudience(AUDIENCE_TYPES.VOLUNTEERS, { limit }, 'manager');

  // If skill filtering is requested and data available
  if (skills && skills.length > 0) {
    const d = await di();
    if (d) {
      const res = await d.query({ source: 'volunteers', role: 'manager' });
      const skilled = (res.data ?? []).filter(v =>
        (v.skills ?? []).some(s => skills.includes(s))
      );
      if (skilled.length > 0) {
        return { ...audience, recipients: skilled.map(v => ({ ...v, preferredChannel: v.email ? 'email' : 'in-app' })) };
      }
    }
  }

  return audience;
}

// Get volunteer stats for a report.
export async function getVolunteerStats() {
  const d = await di();
  if (!d) return { total: 0, isMock: true };

  const res = await d.query({ source: 'volunteers', role: 'manager' });
  const vols = res.data ?? [];

  const roles = {};
  vols.forEach(v => {
    const role = v.role ?? 'General';
    roles[role] = (roles[role] ?? 0) + 1;
  });

  return {
    total:   vols.length,
    byRole:  roles,
    isMock:  res.isMock,
  };
}

// Build a bulk volunteer request for multiple events at once.
export function buildBulkVolunteerRequests(events, rolesPerEvent, options = {}) {
  return events.map((event, i) => buildVolunteerRequest(event, rolesPerEvent[i] ?? rolesPerEvent, options));
}
