// Travel App — presenters (M23.3).
//
// Turn raw platform records into CONSUMER-READY DTOs for the SwiftUI app:
// clean human titles, human dates/times, no raw platform ids, no backend
// terminology (no sourcePlatform / sourceEntityId / idempotencyKey / eventName /
// sequence / metadata blobs). Dates are formatted manually in UTC so output is
// deterministic and free of ICU/environment variance.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n) { return String(n).padStart(2, '0'); }

export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function humanDay(iso) {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function humanTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function truncate(text, max = 80) {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function humanize(name) {
  return String(name).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

// The precise published name (handles custom-typed events carrying metadata.eventName).
function eventName(event) {
  return event.metadata?.eventName ?? event.eventType;
}

const TITLES = {
  trip_created: 'Trip created',
  trip_updated: 'Trip updated',
  trip_cancelled: 'Trip cancelled',
  trip_completed: 'Trip completed',
  itinerary_created: 'Itinerary created',
  itinerary_updated: 'Itinerary updated',
  activity_added: 'Activity added',
  activity_removed: 'Activity removed',
  destination_added: 'Destination added',
  memory_created: 'Memory saved',
  photo_imported: 'Photo',
  journal_entry: 'Journal entry',
};

function kindFor(event) {
  const name = eventName(event);
  if (name.startsWith('trip_')) return 'trip';
  if (name.startsWith('itinerary_')) return 'itinerary';
  if (name.startsWith('activity')) return 'activity';
  if (name === 'photo_imported') return 'photo';
  if (name === 'journal_entry') return 'journal';
  if (name === 'memory_created') return 'memory';
  if (name === 'destination_added') return 'destination';
  return 'other';
}

function titleFor(event) {
  const name = eventName(event);
  const note = event.metadata?.note;
  if (name === 'journal_entry') return truncate(note) || 'Journal entry';
  if (name === 'photo_imported') return truncate(note) || 'Photo';
  return TITLES[name] ?? humanize(name);
}

// One consumer-ready timeline/capture entry — only app-facing fields.
function toEntry(event) {
  return {
    id: event.timelineEventId,
    kind: kindFor(event),
    title: titleFor(event),
    detail: truncate(event.metadata?.note ?? '', 240),
    time: humanTime(event.timestamp),
    timestamp: event.timestamp,
    photoRef: event.metadata?.photoRef ?? null,
  };
}

// Group events into consumer-ready days: newest day first; entries within a day
// in chronological order (the day's story).
export function presentTimeline(events) {
  const byDay = new Map();
  for (const event of events) {
    const key = dayKey(event.timestamp);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  }
  const days = [...byDay.entries()].map(([date, dayEvents]) => ({
    date,
    title: humanDay(dayEvents[0].timestamp),
    entries: dayEvents
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        || String(a.timelineEventId).localeCompare(String(b.timelineEventId)))
      .map(toEntry),
  }));
  days.sort((a, b) => b.date.localeCompare(a.date)); // newest day first
  return days;
}

export function presentCapture(event) {
  return { ...toEntry(event), day: event.metadata?.day ?? null };
}
