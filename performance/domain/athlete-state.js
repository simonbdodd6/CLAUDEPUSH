// CoachEasier Performance — the athlete-state contract (SC9.31).
//
// WHAT THIS IS FOR
//
// Three consecutive builds ended at the same wall. SC9.28 found the engine
// cannot tell whether an athlete is in a concussion protocol, so neck work
// stays blocked. SC9.29 found it cannot see training the athlete does outside
// the club, so a youth week's real density is an undercount. SC9.30 found it
// cannot see session duration or intensity, so the one published progression
// metric is uncomputable. All three are the same missing input: ATHLETE STATE
// THE ENGINE IS ALLOWED TO READ.
//
// WHAT WAS ALREADY HERE
//
// Most of the contract, unconsumed. `CONTRAINDICATION_TAGS` declares eight
// tags and `validateExercise` enforces them. `coachRestrictions` already
// carries id, author, effectiveFrom, effectiveTo, reviewDate and an override
// trail. `restrictionStatus` already resolves a window. `partitionEligibility`
// already excludes an exercise whose contraindication tags match a supplied
// restriction tag.
//
// And none of it reached the engine. `engineInputFromProfile` read
// `coachRestrictions` only to test its LENGTH for a boolean, and the sole tag
// producer emitted `acute_pain_reported`, which no catalogue entry declares.
// The mechanism was inert in both directions.
//
// So this module does not invent a model. It resolves externally supplied
// state into the vocabulary the engine already speaks, and it refuses to let
// absence look like permission.
//
// WHAT THE ENGINE MAY AND MAY NOT DECIDE
//
// May: whether a supplied restriction excludes an exercise; whether a day is
// unavailable; what it does not know.
//
// May NOT: whether an athlete is injured, whether a restriction is justified,
// whether an athlete is cleared. Clearance is a decision by a qualified person
// in an upstream system. This module models its RESULT and never its reasoning.
//
// Pure: no DOM, no storage, no network, no clock of its own.

import { CONTRAINDICATION_TAGS } from '../types/exercise.js';
import { restrictionStatus } from './athlete-profile.js';

export const ATHLETE_STATE_VERSION = '2026.09-sc931-beta.1';

/**
 * Whether the athlete may train at all this week, and where that is narrowed.
 *
 * `constrained` is the honest middle: the athlete trains, but not on every day
 * they normally would. It is also what a contradictory state resolves to.
 */
export const AVAILABILITY_STATUS = ['available', 'constrained', 'unavailable'];

/**
 * What a restriction does to programming. Two of the three APPLY.
 *
 * `requires_review` applies deliberately: a restriction awaiting a decision is
 * not a restriction that has been lifted. Missing data is not clearance.
 */
export const RESTRICTION_STATE = ['active', 'requires_review', 'resolved'];

/** Which authority supplied it. Recorded, never ranked by this module. */
export const RESTRICTION_SOURCE = ['medical_staff', 'coach', 'athlete_report', 'external_system'];

/**
 * What the restriction covers. `tags` is what gates exercises; `scope` is what
 * a human reads. A scope the engine cannot express as tags is reported as
 * unmappable rather than quietly ignored.
 */
export const RESTRICTION_SCOPE = ['movement', 'region', 'contact', 'return_to_training', 'all_training'];

/**
 * What each restriction tag may do to exercise selection (SC9.32).
 *
 * SC9.31 built the pathway and found six of the eight declared tags mapped to
 * no exercise at all. This is the other half: for each tag, whether the engine
 * can safely act on it BY ITSELF.
 *
 * `direct_exclusion`  the tag names something the catalogue declares, and the
 *                     exercises it excludes are identified explicitly.
 * `review_only`       the tag is meaningful and too broad for the engine to
 *                     resolve. It is reported, never applied, and the coach is
 *                     told the engine did not resolve it.
 *
 * A tag classified `review_only` is deliberately kept OUT of the tags handed to
 * eligibility. A tag that reaches eligibility and matches nothing looks applied
 * and does nothing, which is the exact failure SC9.31 found and this map exists
 * to prevent.
 *
 * The reasoning, evidence and confidence for each entry is in
 * performance/docs/restriction-catalogue-mapping.md. This map is the machine
 * half of that document; neither should be changed without the other.
 */
export const RESTRICTION_TAG_ACTION = {
  // Names a specific exposure the catalogue itself declares: work that loads
  // the cervical spine or applies partner force to the head and neck.
  recent_concussion_protocol: 'direct_exclusion',
  unresolved_neck_issue: 'direct_exclusion',
  // Names a MUSCLE, which the catalogue declares per exercise.
  unresolved_hamstring_issue: 'direct_exclusion',
  unresolved_shoulder_issue: 'direct_exclusion',
  // Names a JOINT, which the catalogue declares nothing about — and common
  // presentations disagree about whether loaded flexion or impact is the
  // restricted element. The engine cannot resolve it from the tag.
  unresolved_knee_issue: 'review_only',
  unresolved_back_issue: 'review_only',
  // The engine authors no load, so there is no load here to restrict.
  load_restriction_in_place: 'review_only',
  // Pain names no structure, no severity and no cause.
  acute_pain_reported: 'review_only',
};

/** True when the engine may act on this tag by itself. */
export const tagActsOnSelection = (tag) => RESTRICTION_TAG_ACTION[tag] === 'direct_exclusion';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const dayList = (x) => (Array.isArray(x) ? x.filter((d) => typeof d === 'string') : []);

/**
 * Resolve externally supplied athlete state for one generation.
 *
 * @param {object|null} state    the contract above, or null when Core has none
 * @param {{now?: string|Date}} ctx
 * @returns {{
 *   supplied: boolean, asOf: string|null, ageDays: number|null,
 *   availability: {status:string, unavailableDays:string[], declared:string|null},
 *   restrictionTags: string[],
 *   applied: Array<object>, notApplied: Array<object>, unmappable: Array<object>,
 *   externalLoad: object, flags: string[], statements: Array<object>,
 * }}
 */
export function resolveAthleteState(state = null, { now = null } = {}) {
  const at = now ? new Date(now) : null;
  const flags = [];
  const statements = [];
  const say = (code, text) => statements.push({ code, text });

  // ── Absent state. Generate, but never call it clearance. ────────────────
  if (state === null || state === undefined) {
    // Deliberately NO flag. A flag that fires on every programme ever generated
    // carries no information, and every existing caller supplies no state. The
    // record below is the explicit artefact instead: `supplied: false` plus a
    // statement, carried on the blueprint, inspectable, and impossible to read
    // as clearance.
    say('athlete_state_absent',
      'No athlete state was supplied. Nothing here asserts that this athlete is available, '
      + 'unrestricted or cleared — only that the engine was told nothing.');
    return {
      supplied: false, asOf: null, ageDays: null,
      availability: { status: 'unknown', unavailableDays: [], declared: null },
      restrictionTags: [], applied: [], notApplied: [], unmappable: [],
      externalLoad: emptyExternalLoad(), flags, statements,
      version: ATHLETE_STATE_VERSION,
    };
  }
  if (!isObj(state)) throw new Error('athlete_state_must_be_an_object');

  // ── Age of the state. Measured, never thresholded. ──────────────────────
  // How old is too old is a coaching and clinical judgement, and inventing a
  // number here would be the mistake Gate 2 Q4 spent a build rejecting.
  const asOf = typeof state.asOf === 'string' ? state.asOf : null;
  let ageDays = null;
  if (asOf && at) {
    const t = new Date(asOf).getTime();
    if (Number.isNaN(t)) throw new Error(`athlete_state_bad_asOf: ${state.asOf}`);
    ageDays = Math.floor((at.getTime() - t) / 86400000);
    say('athlete_state_age', `Athlete state was captured ${ageDays} day${ageDays === 1 ? '' : 's'} `
      + 'before this programme was generated. No staleness threshold is applied.');
  } else if (!asOf) {
    flags.push('athlete_state_undated');
    say('athlete_state_undated',
      'Athlete state carries no capture date, so its age cannot be established.');
  }

  // ── Availability ────────────────────────────────────────────────────────
  const av = isObj(state.availability) ? state.availability : null;
  const declared = av && typeof av.status === 'string' ? av.status : null;
  if (declared !== null && !AVAILABILITY_STATUS.includes(declared)) {
    throw new Error(`athlete_state_bad_availability: ${declared}`);
  }
  const unavailableDays = dayList(av?.unavailableDays);
  let status = declared ?? 'unknown';
  if (declared === null) {
    flags.push('athlete_availability_unknown');
    say('athlete_availability_unknown',
      'Availability was not declared. The engine has used the athlete\'s ordinary schedule and '
      + 'is not asserting that they are available.');
  }
  // Contradiction: declared available, days withheld. The restrictive reading
  // wins, and the disagreement is reported rather than resolved silently.
  if (declared === 'available' && unavailableDays.length) {
    status = 'constrained';
    flags.push('athlete_state_contradictory');
    say('athlete_state_contradiction',
      `Athlete state declares "available" while withholding ${unavailableDays.join(', ')}. `
      + 'The narrower reading has been applied.');
  }
  if (status === 'unavailable') {
    say('athlete_unavailable', 'Athlete state declares this athlete unavailable for training.');
  }

  // ── Restrictions ────────────────────────────────────────────────────────
  const list = Array.isArray(state.restrictions) ? state.restrictions : [];
  if (!Array.isArray(state.restrictions) && state.restrictions !== undefined) {
    throw new Error('athlete_state_restrictions_must_be_an_array');
  }
  const applied = [], notApplied = [], unmappable = [];
  const tagSet = new Set();

  for (const [i, r] of list.entries()) {
    if (!isObj(r)) throw new Error(`athlete_state_bad_restriction: index ${i}`);
    const restrictionState = r.status ?? 'active';
    if (!RESTRICTION_STATE.includes(restrictionState)) {
      throw new Error(`athlete_state_bad_restriction_status: ${r.status}`);
    }
    if (r.source !== undefined && !RESTRICTION_SOURCE.includes(r.source)) {
      throw new Error(`athlete_state_bad_restriction_source: ${r.source}`);
    }
    if (r.scope !== undefined && !RESTRICTION_SCOPE.includes(r.scope)) {
      throw new Error(`athlete_state_bad_restriction_scope: ${r.scope}`);
    }
    const tags = Array.isArray(r.tags) ? r.tags : [];
    // A tag outside the declared vocabulary cannot gate anything, and pretending
    // otherwise would be worse than refusing.
    for (const t of tags) {
      if (!CONTRAINDICATION_TAGS.includes(t)) {
        throw new Error(`athlete_state_unknown_restriction_tag: ${t}`);
      }
    }

    const record = {
      id: r.id ?? `restriction-${i + 1}`,
      tags: [...tags].sort(),
      scope: r.scope ?? null,
      status: restrictionState,
      source: r.source ?? null,
      effectiveFrom: r.effectiveFrom ?? null,
      effectiveTo: r.effectiveTo ?? null,
      reviewDate: r.reviewDate ?? null,
      note: typeof r.note === 'string' ? r.note : null,
    };

    if (restrictionState === 'resolved') {
      notApplied.push({ ...record, reason: 'resolved_upstream' });
      say('restriction_resolved',
        `Restriction ${record.id} is recorded as resolved upstream and was not applied.`);
      continue;
    }

    // The window, resolved by the model that already exists for coach
    // restrictions rather than a second copy of the same arithmetic.
    const window = at ? restrictionStatus(
      { effectiveFrom: record.effectiveFrom, effectiveTo: record.effectiveTo }, at,
    ) : 'active';

    if (window === 'scheduled') {
      notApplied.push({ ...record, reason: 'not_yet_effective' });
      say('restriction_scheduled',
        `Restriction ${record.id} takes effect on ${record.effectiveFrom} and was not applied.`);
      continue;
    }

    // EXPIRED BUT STILL ACTIVE. The engine does not lift a restriction on its
    // own — an upstream record that has run past its own window is a record
    // nobody has revisited, not a clearance. It is applied and escalated.
    if (window === 'expired') {
      flags.push('athlete_state_stale_restriction');
      say('restriction_expired_still_applied',
        `Restriction ${record.id} passed its effective window on ${record.effectiveTo} and is still `
        + 'recorded as in force. It has been applied and needs review — the engine does not lift a '
        + 'restriction that nobody has revisited.');
    }
    if (restrictionState === 'requires_review') {
      flags.push('athlete_restriction_review');
      say('restriction_requires_review',
        `Restriction ${record.id} is awaiting review and has been applied meanwhile.`);
    }
    if (record.reviewDate && at && new Date(record.reviewDate).getTime() <= at.getTime()) {
      flags.push('athlete_restriction_review');
      say('restriction_review_due',
        `Restriction ${record.id} was due for review on ${record.reviewDate}.`);
    }

    // A restriction with no tags cannot reach exercise eligibility. Reported,
    // never dropped: a coach has to apply it by hand.
    if (!record.tags.length) {
      unmappable.push({ ...record, reason: 'no_contraindication_tags' });
      flags.push('athlete_restriction_not_mappable');
      say('restriction_not_mappable',
        `Restriction ${record.id}${record.scope ? ` (${record.scope.replace(/_/g, ' ')})` : ''} carries no `
        + 'contraindication tag, so the engine cannot apply it to exercise selection. It stands and a '
        + 'coach must apply it.');
      continue;
    }

    // SC9.32. A tag the engine cannot act on by itself must not reach
    // eligibility, where it would match nothing and look applied.
    const acting = record.tags.filter(tagActsOnSelection);
    const reviewOnly = record.tags.filter((t) => !tagActsOnSelection(t));
    if (reviewOnly.length) {
      flags.push('athlete_restriction_not_mappable');
      say('restriction_review_only',
        `Restriction ${record.id} carries ${reviewOnly.map((t) => t.replace(/_/g, ' ')).join(', ')}, `
        + 'which the engine cannot apply to exercise selection on its own — it does not identify which '
        + 'exercises are affected. The restriction stands and a coach must apply it.');
    }
    if (!acting.length) {
      unmappable.push({ ...record, reason: 'review_only_tags', reviewOnlyTags: reviewOnly });
      continue;
    }

    applied.push({ ...record, appliedTags: acting, reviewOnlyTags: reviewOnly });
    for (const t of acting) tagSet.add(t);
  }

  // ── External load. Recorded, and its gaps recorded with it. ─────────────
  const externalLoad = resolveExternalLoad(state.externalLoad, say, flags);

  return {
    supplied: true, asOf, ageDays,
    availability: { status, unavailableDays: [...unavailableDays].sort(), declared },
    restrictionTags: [...tagSet].sort(),
    applied, notApplied, unmappable,
    externalLoad, flags: [...new Set(flags)].sort(), statements,
    version: ATHLETE_STATE_VERSION,
  };
}

function emptyExternalLoad() {
  return {
    supplied: false,
    rugbySessions: null, matches: null, otherGymSessions: null,
    durationsKnown: false, intensityKnown: false,
    knownDimensions: [], unknownDimensions: ['duration', 'intensity'],
  };
}

/**
 * External training the engine does not generate.
 *
 * COUNTS ONLY. SC9.30 established that the one published progression metric
 * (ACSM's 2.5-5%) is of volume load — sets x reps x weight — which this engine
 * cannot compute, and the field quantifies load as frequency x duration x sRPE.
 * Counting sessions is not a load model and this module says so rather than
 * implying one.
 */
function resolveExternalLoad(raw, say, flags) {
  if (!isObj(raw)) return emptyExternalLoad();
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null);
  const out = {
    supplied: true,
    rugbySessions: num(raw.rugbySessions),
    matches: num(raw.matches),
    otherGymSessions: num(raw.otherGymSessions),
    durationsKnown: raw.durationsKnown === true,
    intensityKnown: raw.intensityKnown === true,
    knownDimensions: ['session_counts'],
    unknownDimensions: [],
  };
  if (!out.durationsKnown) out.unknownDimensions.push('duration');
  if (!out.intensityKnown) out.unknownDimensions.push('intensity');
  if (out.durationsKnown) out.knownDimensions.push('duration');
  if (out.intensityKnown) out.knownDimensions.push('intensity');

  const counted = [out.rugbySessions, out.matches, out.otherGymSessions]
    .filter((n) => n !== null).reduce((a, b) => a + b, 0);
  if (out.otherGymSessions) {
    flags.push('external_training_reported');
    say('external_training_reported',
      `${out.otherGymSessions} gym session(s) outside this programme were reported. The engine has `
      + 'not reduced the programme for them; total load is a coaching judgement.');
  }
  say('external_load_known_dimensions',
    `External training is known by session count only (${counted} session(s) reported). `
    + `${out.unknownDimensions.length ? `Not known: ${out.unknownDimensions.join(', ')}. ` : ''}`
    + 'Session counts are not a training-load model.');
  return out;
}

/**
 * The days an athlete may actually train, after their state is applied.
 * Order is preserved from the profile so day choice stays deterministic.
 */
export function availableDaysAfterState(availableDays = [], resolved) {
  if (!resolved?.supplied) return [...(availableDays || [])];
  const blocked = new Set(resolved.availability.unavailableDays);
  return (availableDays || []).filter((d) => !blocked.has(d));
}
