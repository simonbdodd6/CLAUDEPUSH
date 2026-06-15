// Travel App — presenters (M23.3 · premium experience layer M24.0).
//
// Turn raw platform records into CONSUMER-READY DTOs for the SwiftUI app:
// clean human titles, human dates/times, no raw platform ids, no backend
// terminology (no sourcePlatform / sourceEntityId / idempotencyKey / eventName /
// sequence / metadata blobs). Dates are formatted manually in UTC so output is
// deterministic and free of ICU/environment variance.
//
// M24.0 — Product Experience. The timeline is no longer a log; it is a STORY.
// Each day is a premium memory card (trip-relative label, an emotional one-line
// story, a gentle summary) and each entry is a premium card (accent token, part
// of day, a warm subtitle). All of it is deterministic and additive — the app
// renders premium content with zero client-side logic, and no backend term ever
// leaks. This is product presentation, NOT platform logic (zero duplication).

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

// A warm, human part-of-day from the UTC hour — emotional texture for a card.
export function partOfDay(iso) {
  const h = new Date(iso).getUTCHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
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

// Semantic accent tokens (the app maps these to colours/symbols — no hex here).
const ACCENTS = {
  trip: 'sky',
  itinerary: 'slate',
  activity: 'forest',
  photo: 'sunset',
  journal: 'dusk',
  memory: 'ocean',
  destination: 'sand',
  other: 'slate',
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

// A warm secondary line for the card: the time of day, plus a gentle framing for
// the most personal kinds (a photo is a memory; a journal entry is a reflection).
function subtitleFor(kind, iso) {
  const when = partOfDay(iso);
  if (kind === 'photo') return `${when} · Photo memory`;
  if (kind === 'journal') return `${when} · Reflection`;
  if (kind === 'memory') return `${when} · Saved memory`;
  return when;
}

// One consumer-ready, premium timeline/capture entry — only app-facing fields.
function toEntry(event) {
  const kind = kindFor(event);
  return {
    id: event.timelineEventId,
    kind,
    accent: ACCENTS[kind] ?? ACCENTS.other,
    title: titleFor(event),
    subtitle: subtitleFor(kind, event.timestamp),
    detail: truncate(event.metadata?.note ?? '', 240),
    partOfDay: partOfDay(event.timestamp),
    time: humanTime(event.timestamp),
    timestamp: event.timestamp,
    photoRef: event.metadata?.photoRef ?? null,
  };
}

// Trip-relative day number ("Day 3"), deterministic from the trip start date.
// null when there is no trip context or the moment predates the trip.
function dayNumberFor(dateKey, tripStartDate) {
  if (!tripStartDate) return null;
  const startKey = /^\d{4}-\d{2}-\d{2}/.test(tripStartDate) ? tripStartDate.slice(0, 10) : dayKey(tripStartDate);
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const day = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(day)) return null;
  const n = Math.round((day - start) / 86_400_000) + 1;
  return n >= 1 ? n : null;
}

// A gentle, emotional one-line story for a day — the headline of the memory card.
function storyFor({ dayNumber, destination, count, photoCount }) {
  const place = destination ? ` in ${destination}` : '';
  if (dayNumber === 1) return destination ? `Arrival in ${destination}` : 'The journey begins';
  if (dayNumber) return `Day ${dayNumber}${place}`;
  if (destination) return `A day${place}`;
  if (photoCount > 0 && photoCount === count) return count > 1 ? `${count} photo memories` : 'A photo memory';
  return count > 1 ? `${count} moments to remember` : 'A moment to remember';
}

// A quiet summary line: "3 moments · 1 photo".
function summaryFor(count, photoCount) {
  const moments = `${count} ${count === 1 ? 'moment' : 'moments'}`;
  if (photoCount <= 0) return moments;
  return `${moments} · ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`;
}

// Group events into consumer-ready PREMIUM days: newest day first; entries within
// a day in chronological order (the day's story). `context` (optional) carries the
// trip so days can be framed relative to the journey ("Day 3 in Bali").
export function presentTimeline(events, context = {}) {
  const { tripStartDate = null, destination = null } = context;
  const byDay = new Map();
  for (const event of events) {
    const key = dayKey(event.timestamp);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  }
  const days = [...byDay.entries()].map(([date, dayEvents]) => {
    const entries = dayEvents
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        || String(a.timelineEventId).localeCompare(String(b.timelineEventId)))
      .map(toEntry);
    const photoCount = entries.filter(e => e.kind === 'photo').length;
    const dayNumber = dayNumberFor(date, tripStartDate);
    return {
      date,
      title: humanDay(dayEvents[0].timestamp),
      label: dayNumber ? `Day ${dayNumber}` : null,
      story: storyFor({ dayNumber, destination, count: entries.length, photoCount }),
      summary: summaryFor(entries.length, photoCount),
      entries,
    };
  });
  days.sort((a, b) => b.date.localeCompare(a.date)); // newest day first
  return days;
}

export function presentCapture(event) {
  return { ...toEntry(event), day: event.metadata?.day ?? null };
}

// Flat list of premium entries (single source of truth for cards used by the
// feed/stats layer). `order` 'desc' (newest first, default) or 'asc'.
export function presentEntries(events, order = 'desc') {
  const entries = events.map(toEntry).sort((a, b) =>
    new Date(a.timestamp) - new Date(b.timestamp)
    || String(a.id).localeCompare(String(b.id)));
  if (order === 'desc') entries.reverse();
  return entries;
}
