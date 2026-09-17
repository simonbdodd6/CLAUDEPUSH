// CoachEasier Performance — the Core-facing engine contract.
//
// The one module CoachEasier Core should import. Everything under
// `performance/domain/` is internal: ~300 exports across 30 modules, in an
// order that matters and with plumbing that fails quietly when assembled
// wrongly.
//
// WHY THIS EXISTS
//
// Not for the sake of having a layer. Seventeen files in this repository
// currently assemble the generation chain by hand, and twelve separately
// assemble the eligibility context an explanation needs. That context —
// resolve the development context, partition eligibility against it, derive
// the complexity ceiling, build the slot defaults — is ten lines of non-obvious
// plumbing, and getting it wrong does not throw. It silently degrades the
// explanation, which is how a trace in an earlier build drifted from the
// programme it claimed to describe.
//
// So this module composes the existing functions in the existing order and
// returns the objects they already return. It adds no behaviour, renames
// nothing, and computes nothing itself — generation through it is byte-identical
// to generation without it.
//
// WHAT CORE PROVIDES / WHAT CORE NEVER NEEDS TO KNOW
//
// Core provides an SC2 athlete profile, the exercise catalogue, and the
// authoring facts it already owns (who is authoring, for whom, how many weeks,
// the athlete's schedule, the clock). Core never needs to know about
// `partitionEligibility`, `ARCHETYPE_PLANS`, `complexityCeiling`,
// `resolveDevelopmentContext`, the blueprint↔programme join key, or the
// evidence vocabulary. Those stay internal, and `generateProgramme` returns the
// assembled context so the later stages can consume it without Core handling it.
//
// Pure: no DOM, no storage, no network, no clock of its own.

import { engineInputFromProfile, generateBlueprint } from './domain/programme-blueprint.js';
import { engineInputFromAuthoringProfile } from './domain/authoring-profile.js';
import { releaseDecision, RELEASE_POLICY_VERSION } from './domain/release-policy.js';
import { playerProgramme, PLAYER_PROGRAMME_VERSION, PLAYER_FIELDS } from './domain/player-programme.js';
import { resolveAthleteState, availableDaysAfterState } from './domain/athlete-state.js';
import { programmeDraftFromBlueprint } from './domain/blueprint-to-programme.js';
import { resolveDevelopmentContext } from './domain/development-context.js';
import { partitionEligibility, complexityCeiling } from './domain/exercise-selection.js';
import { ARCHETYPE_PLANS } from './domain/coaching-rules.js';
import { critiqueProgramme, critiqueSummary } from './domain/programme-critique.js';
import { doseForProgramme } from './domain/training-dose.js';
import { attributeBlock, loadObservations } from './domain/load-attribution.js';
import { traceProgramme, renderProgrammeTrace } from './domain/decision-trace.js';
import { buildReviewPackage, renderReviewPackage } from './domain/review-package.js';
import { buildPractitionerReview, renderPractitionerReview } from './domain/practitioner-review.js';

// Bumped at SC9.36, when Core began generating through this contract. The
// string identifies the CONTRACT, so it moves when the contract's observable
// behaviour does — not when a date changes. Since sc923 it has gained the
// `athleteState` parameter and its `athlete_unavailable` refusal (SC9.31), the
// authoring-projection input path below (SC9.36), the release decision
// re-exported at the foot of this file (SC9.34), and — through the modules it
// composes — the youth strength-frequency floor (SC9.29) and the
// contraindication mappings that make a supplied restriction actually exclude
// an exercise (SC9.32). A programme generated under sc923 and one generated
// now are not interchangeable, so they must not report the same version.
export const ENGINE_CONTRACT_VERSION = '2026.09-sc936-beta.1';

/** The weeks of a generated programme, wherever a caller hands one in. */
const weeksOf = (programme, { versionIndex = 0, phaseIndex = 0 } = {}) =>
  programme?.versions?.[versionIndex]?.phases?.[phaseIndex]?.weeks || [];

/**
 * FAIL, DO NOT DEGRADE.
 *
 * Every measuring function below used to accept anything at all and answer
 * from whatever it found. `analyseProgramme({})` returned a dose of zero sets
 * and zero reps; `explainProgramme({})` returned a trace of a programme that
 * did not exist; `validateProgramme({})` returned a critique with a status.
 * None of them threw, so a caller who passed the wrong object — a version
 * where a programme belongs, a draft that never generated — got a confident,
 * plausible, empty answer instead of an error.
 *
 * That is the worst failure mode a measurement contract can have: silence is
 * indistinguishable from a real reading of zero. Core is about to call these
 * across a network of its own objects, so they now say what they were given
 * and what they needed.
 */
function requireWeeks(programme, { operation, versionIndex = 0, phaseIndex = 0 }) {
  const weeks = weeksOf(programme, { versionIndex, phaseIndex });
  if (!weeks.length) {
    throw new Error(`${operation}_requires_generated_programme: no weeks at `
      + `version ${versionIndex}, phase ${phaseIndex}`);
  }
  return weeks;
}

/**
 * Generate a programme for one athlete.
 *
 * Everything Core must supply is a parameter here; everything internal is
 * assembled inside. The returned `context` is opaque to Core — pass it back to
 * `explainProgramme` rather than reading it.
 *
 * `athleteState` is optional and describes what an authorised upstream system
 * knows about this athlete right now: availability, restrictions and training
 * outside this programme. Omitting it is supported and changes nothing — but it
 * is recorded as `supplied: false`, never as clearance. See
 * performance/docs/athlete-state.md.
 *
 * @returns {{programme, version, provenance, blueprint, context}}
 *   `programme`, `version` and `provenance` are exactly what
 *   `programmeDraftFromBlueprint` returns today.
 */
export function generateProgramme({
  profile, catalogue = [], teamCategory = null,
  supervisionAvailable = false, matchCount = undefined, athleteState = null,
  athleteName = '', athleteUserId = null, author, clubId = null,
  weeks = 4, title = null, schedule = undefined, now = null, slug = null,
}) {
  if (!profile) throw new Error('profile_required');
  // A string or an array reaches `engineInputFromProfile` happily and yields an
  // input of nulls, which surfaces three layers later as
  // `blueprint_has_no_sessions` — true, but not the truth the caller needs.
  if (typeof profile !== 'object' || Array.isArray(profile)) throw new Error('profile_must_be_an_object');
  if (!author) throw new Error('author_required');

  // SC9.31 — externally supplied athlete state, resolved once, before anything
  // is decided. Absent state resolves to an explicit `supplied: false` record
  // rather than to nothing, so no stage downstream can read silence as
  // clearance. Invalid state throws by name; it is never partially honoured.
  const state = resolveAthleteState(athleteState, { now });

  // An athlete their own record says may not train does not get a programme.
  // Generating one and flagging it would leave a document that looks like a
  // prescription, and SC9.26 settled that this contract fails rather than
  // degrades.
  if (state.availability.status === 'unavailable') {
    throw new Error('athlete_unavailable: athlete state declares this athlete unavailable for training');
  }

  // WHICH PROFILE SHAPE IS THIS?
  //
  // Core does not author from a full SC2 profile and must not: that profile
  // carries wellness history, pain detail and health information which never
  // travels to a coach's device. The athlete's device publishes the small SC8
  // AUTHORING PROJECTION instead, and that projection reduces its restriction
  // evidence to explicit flags under `restrictions`.
  //
  // `engineInputFromProfile` cannot read those flags. It looks for `pain` and
  // `coachRestrictions`, and a projection has neither — so mapping a
  // projection with it yields `restrictionTags: []`, `hasActiveRestriction:
  // false` and `restrictionsKnown: false` for an athlete whose projection says
  // in as many words that they are restricted. That is silence read as
  // clearance, which is the one thing this engine may never do.
  //
  // So the projection is routed to its own reader, which restores the signals
  // from the flags. Both readers return the same normalised input; nothing
  // downstream knows which shape arrived.
  const base = profile.kind === 'authoring_profile'
    ? engineInputFromAuthoringProfile(profile, { teamCategory, supervisionAvailable, matchCount })
    : engineInputFromProfile(profile, { teamCategory, supervisionAvailable, matchCount });
  const input = {
    ...base,
    // Days the athlete's state withholds are removed before any decision reads
    // them, so frequency, day choice and fixture assessment all see one truth.
    availableDays: availableDaysAfterState(base.availableDays, state),
    // Restriction tags from the profile and from supplied state, merged into
    // the single vocabulary `partitionEligibility` already consumes. Nothing
    // new interprets them; this is the pathway that was missing, not a new rule.
    restrictionTags: [...new Set([...(base.restrictionTags || []), ...state.restrictionTags])].sort(),
    // Supplied state IS restriction information. Saying otherwise would keep
    // raising `restrictions_unknown` at an athlete whose record Core just sent.
    restrictionsKnown: base.restrictionsKnown || state.supplied,
    hasActiveRestriction: base.hasActiveRestriction || state.applied.length > 0 || state.unmappable.length > 0,
  };
  const blueprint = generateBlueprint(input, { catalogue, athleteState: state });
  const draft = programmeDraftFromBlueprint(blueprint, {
    catalogue, athleteName, athleteUserId, author, clubId, weeks, title,
    // The profile's own schedule unless the caller overrides it, matching how
    // every existing call site drives this.
    schedule: schedule === undefined ? (profile.schedule || {}) : schedule,
    now, slug,
  });

  // The eligibility context an explanation needs. Assembled once, here, so no
  // consumer has to know it exists — and so the trace and the generation agree
  // by construction rather than by a caller reproducing this correctly.
  const dev = resolveDevelopmentContext({
    ageBand: input.ageBand, dateOfBirth: input.dateOfBirth, teamCategory: input.teamCategory,
  });
  const eligibility = partitionEligibility(catalogue, {
    context: dev.context, experience: input.experience, equipment: input.equipment,
    // `input` already carries the merged restriction tags, so the explanation
    // partitions against exactly what generation partitioned against.
    supervisionAvailable: input.supervisionAvailable, restrictionTags: input.restrictionTags,
  });

  return {
    programme: draft.programme,
    version: draft.version,
    provenance: draft.provenance,
    blueprint,
    context: {
      contractVersion: ENGINE_CONTRACT_VERSION,
      developmentContext: dev.context,
      experience: input.experience,
      athleteState: state,
      analysis: {
        eligible: eligibility.eligible,
        excluded: eligibility.excluded,
        catalogue,
        plans: ARCHETYPE_PLANS,
        equipment: input.equipment,
        slotDefaults: {
          goals: (input.goals || []).map((g) => g.type || g),
          position: input.position,
          phase: input.phase,
          level: complexityCeiling({ context: dev.context, experience: input.experience }),
        },
      },
    },
  };
}

/**
 * Review a generated programme against the engine's own rules.
 *
 * This is the SC9.7 critique, unchanged: advisory, provisional, and explicit
 * that several of its rules are opinion rather than evidence.
 */
export function validateProgramme({ version, programme, catalogue = [], context = null, schedule = null }) {
  const v = version || programme?.versions?.[0];
  if (!v?.phases?.[0]?.weeks?.length) {
    throw new Error('validateProgramme_requires_generated_programme: pass `version` or `programme`');
  }
  return critiqueProgramme({
    version: v, catalogue, schedule,
    athlete: { context: context?.developmentContext ?? null, experience: context?.experience ?? null },
  });
}

/** Coach-facing lines from a critique, worst first. Core's existing helper. */
export { critiqueSummary };

/**
 * Measure the training load a programme prescribes, and attribute its changes.
 *
 * Dimensions stay separate — repetitions, seconds and metres are not
 * interchangeable and no composite score is produced.
 */
export function analyseProgramme({ programme, catalogue = [], versionIndex = 0, phaseIndex = 0 }) {
  const weeks = requireWeeks(programme, { operation: 'analyseProgramme', versionIndex, phaseIndex });
  const dose = doseForProgramme(weeks, { catalogue });
  const attribution = attributeBlock(dose);
  return { dose, attribution, observations: loadObservations(dose, attribution) };
}

/**
 * Explain a programme: why each exercise was selected, what was ruled out, and
 * which questions the engine does not answer.
 *
 * Pass the `context` from `generateProgramme`. Without it the explanation is
 * still produced but says so — it cannot speak to ties or diagnose an unfilled
 * slot, and reports that rather than implying there was nothing to say.
 */
export function explainProgramme({
  programme, blueprint, catalogue = [], context = null, critique = null,
}) {
  requireWeeks(programme, { operation: 'explainProgramme' });
  // The blueprint is what a trace explains AGAINST. Without it every selection
  // reason, tie and unfilled slot is missing, and the trace says nothing while
  // looking complete.
  if (!blueprint?.sessions) throw new Error('explainProgramme_requires_blueprint');
  const analysis = context?.analysis ?? null;
  const trace = traceProgramme(programme, blueprint, { catalogue, analysis });
  const reviewPackage = buildReviewPackage({ programme, blueprint, catalogue, critique, analysis, trace });
  return { trace, reviewPackage };
}

/**
 * The professional questions a programme raises, organised for a practitioner.
 *
 * The engine answers none of them itself. Each entry carries the programmes
 * affected and what was measured in each, plus the decision recorded against
 * that question — a practitioner's, quoted from the decision record — or empty
 * fields where none was recorded.
 *
 * INPUT SHAPE, EXACTLY:
 *
 *   [{ programmeId: string, reviewPackage: <from explainProgramme> }]
 *
 * `programmeId` is required because a review package carries no id of its own.
 * `reviewPackage` must be the object `explainProgramme` returned; anything else
 * is refused by name rather than summarised as zero questions.
 *
 * There is no `profile` field. An athlete profile is an input to
 * `generateProgramme`, not to this: the review package already carries the
 * athlete summary, resolved — including the development context an SC2 profile
 * does not hold. Passing one is refused rather than ignored.
 *
 * @param {Array<{programmeId:string, reviewPackage:object}>} reviewed
 */
export function outstandingQuestions(reviewed = []) {
  if (!Array.isArray(reviewed)) throw new Error('outstandingQuestions_requires_entry_array');
  return buildPractitionerReview(reviewed.map((entry) => {
    const { programmeId, reviewPackage, ...rest } = entry ?? {};
    const unexpected = Object.keys(rest);
    if (unexpected.length) {
      throw new Error(`outstandingQuestions_unexpected_field: ${unexpected.join(', ')} `
        + `(entry ${programmeId ?? 'without a programmeId'})`);
    }
    return { programmeId, package: reviewPackage };
  }));
}

/** Human-readable renderings. Presentation only; each restates its input. */
export { renderProgrammeTrace, renderReviewPackage, renderPractitionerReview };

/**
 * Whether a generated programme may go straight to the player, and what the
 * coach should be told alongside it (SC9.34).
 *
 * Re-exported here because it is a decision Core must consume and Core may not
 * import `domain/`. `releasable` and `requiresCoachReview` are deliberately
 * separate answers: review signals travel WITH a released programme, never in
 * front of it, because every hard safety condition was applied during
 * generation and a programme that exists has already passed all of them.
 *
 * Pass the `blueprint` from `generateProgramme`.
 */
export { releaseDecision, RELEASE_POLICY_VERSION };

/**
 * The player-safe view of a generated programme (SC9.34).
 *
 * Re-exported here because SC9.37 gives a player their own programme, and the
 * host rendering it may not import `domain/`. It is a WHITELIST, not a filter:
 * every field a player may see is named in `PLAYER_FIELDS`, so a field added to
 * the blueprint tomorrow cannot reach a player by default. Clinical free text,
 * ranking scores, contraindication tags, review flags, provenance and every
 * engine identifier are absent by construction.
 *
 * Refuses a programme the release policy holds, rather than showing a player
 * something that was not cleared to reach them.
 *
 * Pass `programme` and `blueprint` from `generateProgramme`. Never pass
 * `context` — this layer does not take it, and it is not the host's to hold.
 */
export { playerProgramme, PLAYER_PROGRAMME_VERSION, PLAYER_FIELDS };
