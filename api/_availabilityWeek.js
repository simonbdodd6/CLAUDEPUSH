// THE AVAILABILITY WEEK, ON THE SERVER (Build 105).
//
// A scheduled reminder has no browser to tell it which occurrences a week
// holds, so the server has to know. This is the SAME rule the client's
// availabilityEventsForWeek applies (index.html) — Monday-start weeks, dated
// training occurrences `<slotId>-<YYYYMMDD>`, a fixture under its own id, and
// the generic `game` card only for a group that enters no fixtures at all —
// and test/scheduled-reminder-scope.test.js holds the two to each other over a
// spread of weeks, days and sources, so they cannot drift apart unnoticed.
//
// Pure: no storage, no clock of its own beyond todayIso(now). Dates are
// date-only and handled in UTC, exactly as the client handles them, so no
// timezone can move an occurrence into another week.

const DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Today as YYYY-MM-DD — the UTC date, as the client's availToday() reads it. */
export function todayIso(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Monday-start week containing `iso`, as YYYY-MM-DD. */
export function weekStartOf(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** The date a recurring slot falls on within a week, or '' if it has no occurrence there. */
export function slotDateInWeek(slot, weekStartIso) {
  if (!slot || slot.active === false) return '';
  const index = DAY_INDEX[slot.day];
  if (index === undefined) return '';
  const date = addDays(weekStartIso, index);
  if (slot.effectiveFrom && date < slot.effectiveFrom) return '';
  if (slot.effectiveTo && date > slot.effectiveTo) return '';
  return date;
}

/** Stable id for one occurrence of a recurring training slot. */
export function trainingOccurrenceId(slot, date) {
  return String(slot.id) + '-' + String(date).replace(/-/g, '');
}

/**
 * The availability occurrences of ONE week for ONE group.
 * `fixtures` and `slots` must already be that group's own.
 */
export function occurrencesForWeek(weekStartIso, { fixtures = [], slots = [], currentWeekStart = '' } = {}) {
  const weekEnd = addDays(weekStartIso, 6);
  const occurrences = [];
  for (const slot of (slots || [])) {
    const date = slotDateInWeek(slot, weekStartIso);
    if (!date) continue;
    occurrences.push({ id: trainingOccurrenceId(slot, date), type: 'training', legacy: false, date });
  }
  const inWeek = (fixtures || []).filter(fx => {
    const d = String(fx?.date || '').slice(0, 10);
    return d && d >= weekStartIso && d <= weekEnd && fx.status !== 'cancelled';
  });
  for (const fx of inWeek) {
    occurrences.push({ id: String(fx.id), type: 'match', legacy: false, date: String(fx.date).slice(0, 10) });
  }
  // The generic weekly match card exists only for a group with NO fixture
  // records at all, and only in the current week.
  if (weekStartIso === currentWeekStart && !inWeek.length && !(fixtures || []).length) {
    occurrences.push({ id: 'game', type: 'match', legacy: true, date: '' });
  }
  return occurrences.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}
