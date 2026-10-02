// CoachEasier Performance — fixture-aware bidirectional scheduling (SC9.6).
//
// THE DEFECT THIS CORRECTS
// MATCH_WEEK_RULES reasons only from the UPCOMING fixture. In rugby a training
// day exists relative to BOTH the last match and the next one. With a Saturday
// fixture and a weekly cycle, Monday is MD-5 looking forward — which the engine
// calls the week's hardest development day — and MD+2 looking back, when
// lower-body output has not recovered. The engine could therefore place its
// heaviest session in the worst available window and nothing detected it.
//
// WHY THERE IS NO PERFORMANCE FIXTURE STORE
// Core already owns fixtures: they live on the club record and are sanitised by
// api/publish.js `sanitiseFixtureRecord`. A second calendar would immediately
// disagree with the first. This module is a READ-ONLY ADAPTER: it takes Core's
// already-sanitised records and narrows them to the handful of fields
// scheduling needs. It persists nothing and it never writes.
//
// WHAT THIS MODULE IS NOT
// It is not a medical or recovery-status system. It does not decide whether an
// athlete has recovered, and it must never say so. It answers a programming
// question — "is this a sensible day for this kind of session?" — and returns a
// constraint the generator and the coach can reason over and disagree with.
//
// PROVISIONAL
// The day-by-day windows below are a deterministic PROGRAMMING RULE informed by
// the post-match recovery literature. They are not proven optimal practice, and
// no periodisation model is established as superior to another. Every
// assessment carries `provisional: true` and must surface as such.
//
// Pure module: no DOM, no fetch, no storage, no clock. Dates are passed in.

import { PREPARATION_BLOCK_TYPES } from '../types/programme.js';

export const FIXTURE_CONTEXT_VERSION = '2026.08-sc96-beta.1';

/** Statuses that describe a fixture which will actually be played. */
export const PLAYABLE_FIXTURE_STATUSES = new Set(['scheduled', 'completed']);
/** Core's other statuses. A cancelled or postponed match is not a match. */
export const NON_PLAYABLE_FIXTURE_STATUSES = new Set(['cancelled', 'postponed']);

/**
 * World Rugby recommends at least FOUR CLEAR DAYS between matches. A gap at or
 * below this is treated as congestion: the development window disappears and
 * the week's purpose becomes getting to the next fixture in one piece.
 *
 * Source: World Rugby player-welfare guidance on recommended rest between
 * matches. Applied here as a scheduling rule, not a medical threshold.
 */
export const RECOMMENDED_CLEAR_DAYS_BETWEEN_FIXTURES = 4;

/**
 * Days after a match during which the named demands are not preferred.
 *
 * Grounded in the post-match time course: neuromuscular function and muscle
 * damage markers persist at least three days; lower-body output returned to
 * pre-match levels only after ~60 hours; change-of-direction performance
 * remained impaired at 96 hours. The mapping of those findings onto whole days
 * is OURS and is provisional.
 *
 * Demand tags are Core's existing MATCH_WEEK_RULES vocabulary, deliberately —
 * one vocabulary, not two.
 */
export const POST_MATCH_WINDOWS = [
  { day: 1, avoid: ['heavy_lower', 'heavy_upper', 'power', 'high_speed_running', 'conditioning_high', 'high_volume_accessory'],
    code: 'post_match_day_1' },
  { day: 2, avoid: ['heavy_lower', 'high_speed_running', 'conditioning_high'],
    code: 'post_match_day_2' },
  { day: 3, avoid: ['high_speed_running'],
    code: 'post_match_day_3' },
];
/** Beyond this many days after a match, no post-match constraint applies. */
export const POST_MATCH_WINDOW_DAYS = 3;

/** Assessment statuses. Programming language — never clinical. */
export const SCHEDULE_STATUS = {
  OK: 'ok',
  CAUTION: 'caution',
  CONFLICT: 'conflict',
  UNKNOWN: 'unknown',        // no fixture information — honestly not "fine"
};

const DAY_MS = 86400000;
const isObj = (v) => !!v && typeof v === 'object';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an ISO date to a UTC timestamp. Null for anything else. */
export function parseISODate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(t) ? t : null;
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from, to) {
  const a = parseISODate(from), b = parseISODate(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / DAY_MS);
}

// ── Adapter over Core's fixture records ─────────────────────────────────────

/**
 * Narrow Core's sanitised fixtures to what scheduling needs.
 *
 * `groupId` scopes to one squad: a U18 athlete must not be scheduled around
 * Seniors fixtures. Core's compatibility rule is that a fixture with no
 * groupId belongs to the club's INITIAL group, so the caller passes
 * `initialGroupId` rather than this module guessing.
 *
 * Cancelled and postponed fixtures are dropped: they are not matches, and
 * scheduling around them would invent constraints from something that will not
 * happen. A postponed fixture that is later rescheduled reappears with its new
 * date, which is Core's job, not ours.
 */
export function normalizeFixtures(raw, { groupId = null, initialGroupId = null } = {}) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const fx of raw) {
    if (!isObj(fx)) continue;
    const date = typeof fx.date === 'string' && ISO_DATE.test(fx.date) ? fx.date : null;
    if (!date) continue;                                  // undated: unusable
    const status = String(fx.status || 'scheduled').toLowerCase();
    if (!PLAYABLE_FIXTURE_STATUSES.has(status)) continue;  // cancelled/postponed
    const fixtureGroup = String(fx.groupId || '').trim() || initialGroupId || '';
    if (groupId && fixtureGroup && fixtureGroup !== groupId) continue;
    out.push({
      fixtureId: String(fx.id || ''),
      date,
      status,
      groupId: fixtureGroup || null,
      opposition: String(fx.opposition || ''),
      competition: String(fx.competition || ''),
      homeAway: String(fx.homeAway || '') || null,
      kickOff: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(fx.time || '')) ? String(fx.time) : null,
    });
  }
  // Deterministic order: by date, then by id so equal dates never shuffle.
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.fixtureId.localeCompare(b.fixtureId));
}

// ── The bidirectional window ────────────────────────────────────────────────

/** `MD`, `MD-3`, `MD+2` — derived from real dates, never assumed. */
function relativeLabel(offset) {
  if (offset === 0) return 'MD';
  return offset < 0 ? `MD${offset}` : `MD+${offset}`;
}

/**
 * Where a training date sits between the fixtures either side of it.
 *
 * A fixture ON the date is reported as `sameDay` and as both neighbours' zero
 * point. Where several fixtures share a date, the FIRST in deterministic order
 * is the reference and the rest are reported in `alsoOnDate` — never silently
 * discarded, which is the brief's "no silent fixture selection" rule.
 */
export function fixtureWindowFor(date, fixtures = []) {
  const at = parseISODate(date);
  const empty = {
    date, known: false, sameDay: null, alsoOnDate: [],
    previous: null, next: null,
    daysSincePrevious: null, daysUntilNext: null,
    relativePrevious: null, relativeNext: null,
  };
  if (at === null) return empty;
  const list = Array.isArray(fixtures) ? fixtures : [];
  if (!list.length) return { ...empty, known: false };

  const onDate = list.filter((f) => f.date === date);
  const before = list.filter((f) => f.date < date);
  const after = list.filter((f) => f.date > date);
  const previous = before.length ? before[before.length - 1] : null;
  const next = after.length ? after[0] : null;

  return {
    date,
    known: true,
    sameDay: onDate[0] || null,
    alsoOnDate: onDate.slice(1),
    previous,
    next,
    daysSincePrevious: previous ? daysBetween(previous.date, date) : null,
    daysUntilNext: next ? daysBetween(date, next.date) : null,
    relativePrevious: previous ? relativeLabel(daysBetween(previous.date, date)) : null,
    relativeNext: next ? relativeLabel(-daysBetween(date, next.date)) : null,
  };
}

// ── Congestion ──────────────────────────────────────────────────────────────

/**
 * Fixture pairs separated by fewer clear days than the recommendation.
 *
 * "Clear days" are the days BETWEEN the fixtures: Saturday to the following
 * Thursday is five days apart and four clear days, which meets the guidance.
 */
export function detectCongestion(fixtures = [], { recommendedClearDays = RECOMMENDED_CLEAR_DAYS_BETWEEN_FIXTURES } = {}) {
  const list = Array.isArray(fixtures) ? fixtures : [];
  const out = [];
  for (let i = 1; i < list.length; i++) {
    const gap = daysBetween(list[i - 1].date, list[i].date);
    if (gap === null) continue;
    const clearDays = Math.max(0, gap - 1);
    if (clearDays < recommendedClearDays) {
      out.push({
        code: 'fixture_congestion',
        from: list[i - 1], to: list[i],
        gapDays: gap, clearDays,
        recommendedClearDays,
        sameDay: gap === 0,
      });
    }
  }
  return out;
}

/** True when the date falls between two fixtures separated by a short turnaround. */
export function inCongestedPeriod(date, fixtures = [], opts = {}) {
  return detectCongestion(fixtures, opts).some((c) => date >= c.from.date && date <= c.to.date);
}

// ── Assessing one training day ──────────────────────────────────────────────

/**
 * Constraints looking FORWARD to the next fixture.
 *
 * Deliberately mirrors Core's existing MATCH_WEEK_RULES so the two directions
 * speak one vocabulary. Callers that already hold MATCH_WEEK_RULES may pass it
 * in; the defaults here cover the same ground for standalone use.
 */
export const PRE_MATCH_WINDOWS = [
  { day: 0, avoid: ['heavy_lower', 'heavy_upper', 'power', 'high_speed_running', 'conditioning_high', 'high_volume_accessory'], code: 'match_day' },
  { day: 1, avoid: ['heavy_lower', 'heavy_upper', 'high_speed_running', 'conditioning_high', 'high_volume_accessory'], code: 'pre_match_day_1' },
  { day: 2, avoid: ['heavy_lower', 'conditioning_high', 'high_volume_accessory'], code: 'pre_match_day_2' },
  { day: 3, avoid: ['conditioning_high'], code: 'pre_match_day_3' },
];

const windowFor = (windows, days) => windows.find((w) => w.day === days) || null;

/**
 * Assess a training date for a session with the given demand tags.
 *
 * The whole point of SC9.6: constraints from BOTH directions are collected and
 * INTERSECTED. A day is suitable for a demand only if looking forward permits
 * it AND looking back permits it.
 *
 * @param {object} opts
 * @param {string} opts.date            ISO training date
 * @param {Array}  opts.fixtures        normalised fixtures
 * @param {string[]} opts.demands       demand tags this session carries
 * @param {string} [opts.context]       development context, for youth caution
 * @returns {{status, reasons, recommendations, window, congested, provisional}}
 */
export function assessTrainingDay({ date, fixtures = [], demands = [], context = 'unknown' } = {}) {
  const fxWindow = fixtureWindowFor(date, fixtures);
  const reasons = [];
  const recommendations = [];
  const blocked = new Set();

  if (!fxWindow.known) {
    // No fixture information is NOT the same as no constraints. Saying "ok"
    // here would present an absence of data as a positive clearance.
    return {
      status: SCHEDULE_STATUS.UNKNOWN,
      reasons: [{ code: 'no_fixture_data', detail: 'no fixture calendar is available for this squad' }],
      recommendations: [{ code: 'coach_review_scheduling', detail: 'scheduling relative to matches cannot be checked' }],
      window: fxWindow, congested: false, provisional: true, engineVersion: FIXTURE_CONTEXT_VERSION,
    };
  }

  const wanted = new Set(Array.isArray(demands) ? demands : []);

  // Looking BACK.
  if (fxWindow.daysSincePrevious !== null && fxWindow.daysSincePrevious <= POST_MATCH_WINDOW_DAYS) {
    const w = windowFor(POST_MATCH_WINDOWS, fxWindow.daysSincePrevious);
    if (w) {
      const hit = w.avoid.filter((d) => wanted.has(d));
      if (hit.length) {
        hit.forEach((d) => blocked.add(d));
        reasons.push({
          code: w.code, direction: 'previous', demands: hit,
          daysSince: fxWindow.daysSincePrevious, relative: fxWindow.relativePrevious,
          detail: `${fxWindow.relativePrevious} — ${hit.join(', ')} not preferred this soon after a match`,
        });
      }
    }
  }

  // A match ON this date outranks everything else.
  if (fxWindow.sameDay) {
    const hit = PRE_MATCH_WINDOWS[0].avoid.filter((d) => wanted.has(d));
    hit.forEach((d) => blocked.add(d));
    reasons.push({
      code: 'match_day', direction: 'same_day', demands: hit,
      detail: 'a fixture is played on this date',
    });
    if (fxWindow.alsoOnDate.length) {
      reasons.push({
        code: 'multiple_fixtures_same_day', direction: 'same_day',
        count: fxWindow.alsoOnDate.length + 1,
        detail: `${fxWindow.alsoOnDate.length + 1} fixtures are scheduled on this date`,
      });
    }
  }

  // Looking FORWARD.
  if (fxWindow.daysUntilNext !== null) {
    const w = windowFor(PRE_MATCH_WINDOWS, fxWindow.daysUntilNext);
    if (w && fxWindow.daysUntilNext > 0) {
      const hit = w.avoid.filter((d) => wanted.has(d));
      if (hit.length) {
        hit.forEach((d) => blocked.add(d));
        reasons.push({
          code: w.code, direction: 'next', demands: hit,
          daysUntil: fxWindow.daysUntilNext, relative: fxWindow.relativeNext,
          detail: `${fxWindow.relativeNext} — ${hit.join(', ')} not preferred this close to a match`,
        });
      }
    }
  }

  const congested = inCongestedPeriod(date, fixtures);
  if (congested) {
    reasons.push({
      code: 'fixture_congestion', direction: 'both',
      detail: `fewer than ${RECOMMENDED_CLEAR_DAYS_BETWEEN_FIXTURES} clear days separate the surrounding fixtures`,
    });
    recommendations.push({
      code: 'reduce_development_load',
      detail: 'the usual development window is unavailable in a congested period',
    });
  }

  // Youth squads inherit the same rules; the caution is surfaced, not stricter
  // numbers invented here — ceilings belong to SC9.1.
  if (blocked.size && (context === 'youth_u16' || context === 'youth_u18')) {
    recommendations.push({
      code: 'youth_scheduling_caution',
      detail: 'age-grade squad — confirm the placement of this session with the coach',
    });
  }

  if (blocked.size) {
    recommendations.push({
      code: 'move_or_reduce_session',
      demands: [...blocked],
      detail: 'place this work on a day further from either fixture, or reduce its demand',
    });
  }

  const status = blocked.size ? SCHEDULE_STATUS.CONFLICT
    : congested ? SCHEDULE_STATUS.CAUTION
    : SCHEDULE_STATUS.OK;

  return {
    status, reasons, recommendations, window: fxWindow, congested,
    blockedDemands: [...blocked].sort(),
    provisional: true,
    engineVersion: FIXTURE_CONTEXT_VERSION,
  };
}

// ── Reading a session's demands ─────────────────────────────────────────────

/** Block types that carry no meaningful systemic demand. */
const PREP_BLOCKS = new Set(PREPARATION_BLOCK_TYPES);

/**
 * Derive a session's demand tags from what it actually prescribes.
 *
 * Uses the block vocabulary the programme already stores, so a session's demand
 * profile is read from the programme rather than declared separately and
 * allowed to drift from it.
 */
export function demandsForSession(session, { heavyEffortRpe = 8, highVolumeSets = 12 } = {}) {
  const demands = new Set();
  let workingSets = 0;
  for (const block of session?.blocks || []) {
    const type = block.blockType;
    if (PREP_BLOCKS.has(type)) continue;
    for (const p of block.prescriptions || []) {
      const sets = (p.sets || []).length;
      const f = p.sets?.[0]?.fields || {};
      const heavy = (Number.isFinite(f.rpe) && f.rpe >= heavyEffortRpe)
        || (Number.isFinite(f.rir) && f.rir <= 1);
      workingSets += sets;
      if (type === 'main_strength') {
        demands.add(heavy ? 'heavy_lower' : 'strength');
        // Region is not pinned on the block, so the heavy tag is applied to the
        // session as a whole. Over-flagging is the safe direction here.
        if (heavy) demands.add('heavy_upper');
      }
      if (type === 'power') demands.add('power');
      if (type === 'conditioning') {
        demands.add(Number.isFinite(f.durationSec) && f.durationSec >= 300 ? 'conditioning_high' : 'conditioning_low');
      }
      if (type === 'accessory' && sets >= 3) demands.add('accessory');
    }
  }
  if (workingSets >= highVolumeSets) demands.add('high_volume_accessory');
  return [...demands].sort();
}

// ── Assessing a whole assignment ────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The calendar date of a programme day, from the assignment's start date. */
export function dateForProgrammeDay({ startDate, weekNumber, dayName }) {
  const start = parseISODate(startDate);
  if (start === null || !Number.isInteger(weekNumber) || weekNumber < 1) return null;
  const dayIndex = DAY_NAMES.indexOf(dayName);
  if (dayIndex < 0) return null;
  // Week 1 begins on startDate; find that weekday within the programme week.
  const startDow = new Date(start).getUTCDay();
  const offsetInWeek = (dayIndex - startDow + 7) % 7;
  const t = start + ((weekNumber - 1) * 7 + offsetInWeek) * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Assess every session of an assignment against the fixture calendar.
 *
 * Reports only. Nothing is moved, nothing is removed: an automatic change to a
 * published programme is exactly what SC9.3 forbids, and a silently relocated
 * session is worse than a flagged one.
 */
export function assessAssignmentSchedule({ assignment, fixtures = [], context = null } = {}) {
  const tree = assignment?.snapshot?.prescriptionTree;
  const startDate = assignment?.startDate;
  const devContext = context || assignment?.developmentContextSnapshot?.context || 'unknown';
  const sessions = [];
  if (!Array.isArray(tree) || !startDate) {
    return {
      startDate: startDate || null, sessions: [], congestion: [],
      counts: { ok: 0, caution: 0, conflict: 0, unknown: 0 },
      fixtureDataAvailable: Array.isArray(fixtures) && fixtures.length > 0,
      provisional: true, engineVersion: FIXTURE_CONTEXT_VERSION,
    };
  }

  for (const phase of tree) {
    for (const week of phase.weeks || []) {
      for (const day of week.days || []) {
        for (const session of day.sessions || []) {
          const date = dateForProgrammeDay({ startDate, weekNumber: week.weekNumber, dayName: day.day });
          if (!date) continue;
          const demands = demandsForSession(session);
          const assessment = assessTrainingDay({ date, fixtures, demands, context: devContext });
          sessions.push({
            date, weekNumber: week.weekNumber, day: day.day,
            sessionId: session.id, title: session.title,
            demands, ...assessment,
          });
        }
      }
    }
  }

  const counts = sessions.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; },
    { ok: 0, caution: 0, conflict: 0, unknown: 0 });

  return {
    startDate,
    sessions,
    congestion: detectCongestion(fixtures),
    counts,
    fixtureDataAvailable: Array.isArray(fixtures) && fixtures.length > 0,
    provisional: true,
    engineVersion: FIXTURE_CONTEXT_VERSION,
  };
}
