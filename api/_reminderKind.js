// WHAT AN AVAILABILITY REMINDER IS ABOUT — match, training, or the whole week.
//
// Settings offers two independent preferences, Match reminders and Training
// reminders. They used to be decided by the session id alone: only the legacy
// generic `game` card counted as a match, so a reminder for a real fixture
// (its own id) was governed by Training reminders, while the weekly round-up —
// tagged `game` although it covers the whole week — was governed by Match
// reminders. An id is not a type: `game` is also what a request falls back to
// when it names nothing, and a fixture id is whatever its record carries.
//
// The kind is therefore read from the CLUB'S OWN RECORDS: an id that is one of
// the club's fixtures is a match; an id whose root is one of its training
// slots (by the slot's own id or its legacy session name, dated or not) is
// training. Several named occurrences of one kind take that kind; a mix, or
// nothing named, is the whole week. Only an id the records cannot place falls
// back to the sender's declared kind — the generic `game` card, which by
// definition has no record — and otherwise to the whole week.
//
// A whole-week reminder concerns both kinds, so it is withheld only from
// someone who has turned BOTH off (see notificationAllowed).

import { loadClubStructure, activeGroups, INITIAL_GROUP_ID } from './_structureStore.js';

export const REMINDER_KINDS = Object.freeze(['match', 'training', 'week']);
const DATED_RE = /-(\d{8})$/;

const kindOf = value => (REMINDER_KINDS.includes(String(value || '')) ? String(value) : '');

/**
 * Pure. `fixtureIds` and `slots` are the club's records; `sessionIds` are the
 * occurrences the reminder names; `declaredKind` is what the sender says it is
 * about, used only for ids the records cannot place.
 */
export function classifyReminderKind({ sessionIds = [], declaredKind = '', fixtureIds = [], slots = [] } = {}) {
  const fixtures = new Set((fixtureIds || []).map(String));
  const slotRoots = new Set();
  for (const slot of slots || []) {
    if (slot?.id) slotRoots.add(String(slot.id));
    if (slot?.sessionId) slotRoots.add(String(slot.sessionId));
  }
  const declared = kindOf(declaredKind);
  const named = [...new Set((Array.isArray(sessionIds) ? sessionIds : [sessionIds])
    .map(id => String(id || '').trim()).filter(Boolean))];
  if (!named.length) return declared || 'week';

  const kinds = new Set();
  for (const id of named) {
    if (fixtures.has(id)) { kinds.add('match'); continue; }
    if (slotRoots.has(id.replace(DATED_RE, ''))) { kinds.add('training'); continue; }
    kinds.add(declared || 'week');
  }
  return kinds.size === 1 ? [...kinds][0] : 'week';
}

/** The kind of an availability reminder for one club, read from its records. */
export async function availabilityReminderKind(teamId, { sessionIds = [], declaredKind = '' } = {}) {
  const named = (Array.isArray(sessionIds) ? sessionIds : [sessionIds]).filter(Boolean);
  if (!named.length) return kindOf(declaredKind) || 'week';
  try {
    const { readClubFixtures, readTrainingSchedule } = await import('./publish.js');
    const { fixtures } = await readClubFixtures(teamId);
    const structure = await loadClubStructure(teamId);
    const groupIds = [...new Set([INITIAL_GROUP_ID, ...activeGroups(structure).map(g => g.id)])];
    const slots = [];
    for (const groupId of groupIds) {
      const { record } = await readTrainingSchedule(teamId, groupId);
      if (Array.isArray(record?.slots)) slots.push(...record.slots);
    }
    return classifyReminderKind({ sessionIds: named, declaredKind, fixtureIds: fixtures.map(fx => fx.id), slots });
  } catch {
    // Records unreadable: never fail the send over a preference. The whole
    // week is still withheld from anyone who turned both kinds off.
    return kindOf(declaredKind) || 'week';
  }
}
