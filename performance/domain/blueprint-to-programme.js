// CoachEasier Performance — SC5 blueprint → SC4 programme draft (SC8).
//
// The controlled seam between the deterministic coaching engine and the
// authored programme structure a coach reviews, edits and publishes.
//
// WHAT THIS DOES NOT DO
// It does not decide anything. Every training decision — frequency, session
// archetypes, exercise selection, dose category, match-week placement — was
// already made by SC5 and arrives in the blueprint with reason codes. This
// module only expresses those decisions in SC4's node structure.
//
// WEEK-TO-WEEK PROGRESSION (SC9.1)
// A block used to be one week emitted N times. The dose table below still
// supplies the BASELINE dose, and the week wave then says how week N differs
// from week 1. The wave moves sets, reps, effort and work duration only; it is
// bounded by the athlete's training age and development context, and — like
// everything else here — it never touches load.
//
// It also never invents a load. A blueprint is structurally forbidden from
// carrying kilograms, and nothing here adds any: prescriptions are expressed
// as sets, reps and EFFORT (RPE), which is what an athlete can execute on day
// one without a tested 1RM. SC6 resolves real loads later, from real evidence.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

import {
  createProgramme, createProgrammeVersion, createPhase, createWeek,
  createTrainingDay, createSession, createBlock, createExercisePrescription,
  createSetPrescription,
} from './programme.js';
import { SET_FIELDS, PREPARATION_BLOCK_TYPES } from '../types/programme.js';
import { VOLUME_CATEGORIES, INTENSITY_CATEGORIES } from '../types/coaching.js';
import {
  getWeekProgression, applyWeekProgression, weekObjective, progressionMethodFor,
} from './week-progression.js';

const FIELD_MAP = Object.fromEntries(SET_FIELDS.map((f) => [f.id, f.maps]));

/**
 * PROVISIONAL dose table (SC8). Categorical only — the same categories SC5
 * emits — turned into executable structure. Reviewed by a coach before any
 * athlete sees it, and marked provisional everywhere it surfaces.
 *
 * Sets come from the VOLUME category; reps and effort from INTENSITY.
 */
/**
 * Resolve a dose category against a table that does not define every category
 * the vocabulary declares.
 *
 * Both tables below were written with holes: SETS_BY_VOLUME has no `very_low`
 * and BLOCK_DOSE has no `low` intensity, while VOLUME_CATEGORIES and
 * INTENSITY_CATEGORIES declare both. A plain `?? moderate` fallback then
 * PROMOTED the missing category — a `very_low` athlete was given the moderate
 * set count, more work than a `low` athlete, and a `low`-intensity athlete was
 * dosed at moderate effort. That inverts the declared ordering and contradicts
 * this engine's rule that a cap may only ever LOWER a category.
 *
 * So a missing category resolves DOWN the declared order to the nearest entry
 * the table does define, and only searches upward when nothing lower exists.
 * No dose value is invented: the result is always a value already in the table,
 * and the resolution is monotonic — a lower category can never yield more work
 * than a higher one.
 */
function resolveCategory(table, order, category) {
  const i = order.indexOf(category);
  if (i === -1) return table[order[0]] ?? Object.values(table)[0];
  for (let k = i; k >= 0; k--) if (table[order[k]] !== undefined) return table[order[k]];
  for (let k = i + 1; k < order.length; k++) if (table[order[k]] !== undefined) return table[order[k]];
  return Object.values(table)[0];
}

const SETS_BY_VOLUME = { low: 2, moderate: 3, high: 4 };

// `distanceM` mirrors the `holdSec` shape deliberately: a carry and a hold are
// both continuous doses rather than counted ones, and reusing the reviewed
// shape avoids inventing a second set of numbers. The values sit inside the
// conventional 20-40 m range for a loaded carry and are multiples of the 10 m
// unit `applyWeekProgression` scales distance by. PROVISIONAL, like the rest
// of this table.
const BLOCK_DOSE = {
  power:         { technique: { reps: 3, rpe: 6, holdSec: 20, distanceM: 20 }, moderate: { reps: 3, rpe: 7, holdSec: 20, distanceM: 20 }, high: { reps: 3, rpe: 8, holdSec: 20, distanceM: 20 } },
  main_strength: { technique: { reps: 5, rpe: 6, holdSec: 30, distanceM: 30 }, moderate: { reps: 5, rpe: 7, holdSec: 30, distanceM: 30 }, high: { reps: 5, rpe: 8, holdSec: 30, distanceM: 30 } },
  accessory:     { technique: { reps: 10, rpe: 6, holdSec: 20, distanceM: 20 }, moderate: { reps: 10, rpe: 7, holdSec: 30, distanceM: 30 }, high: { reps: 8, rpe: 8, holdSec: 40, distanceM: 40 } },
  conditioning:  { technique: { durationSec: 30, rpe: 6 }, moderate: { durationSec: 40, rpe: 7 }, high: { durationSec: 45, rpe: 8 } },
};

const REST_BY_BLOCK = { power: 180, main_strength: 180, accessory: 90, conditioning: 60 };

// GATE 2 — youth_accumulated_volume. The NSCA's youth position stand places
// resistance training for children and adolescents at 6-15 repetitions. The
// engine already honoured the frequency and per-exercise set guidance, but its
// strength dose of 5 reps sat below that band, so 34% of youth prescriptions
// fell outside it. This raises the FLOOR for youth strength work only:
// plyometric and power work is a different modality that the 6-15 guidance
// does not govern, and three crisp jumps must stay three.
// See performance/docs/gate-2-professional-decisions.md, Q6.
const YOUTH_CONTEXTS = new Set(['youth_u16', 'youth_u18']);
const YOUTH_STRENGTH_MIN_REPS = 6;

// GATE 2 — volume_substituting_for_effort. When the athlete's effort ceiling
// blocks the wave's intensity step, the wave adds repetitions instead. Left
// unbounded that carried a main-strength lift from 5 reps to 9 over a six-week
// block — out of the range heavy strength work occupies and into hypertrophy
// territory, while the block still called itself strength.
//
// Meta-regression evidence is that strength gains are similar across a wide
// range of proximity to failure, and that volume shows more pronounced
// diminishing returns for strength than for hypertrophy. So continuing to buy
// volume once effort is capped is poor value for a strength intent. The bound
// applies to main_strength only: accessory work drifting toward higher reps is
// a legitimate accessory outcome, not a failure of intent.
// See performance/docs/gate-2-professional-decisions.md, Q5.
const MAIN_STRENGTH_MAX_REPS = 8;

/** Blocks that are preparation, not prescribed work: no effort targets. */
const PREP_BLOCKS = new Set(PREPARATION_BLOCK_TYPES);

/**
 * SC5 plans in coaching language; SC4 stores a fixed block vocabulary. The one
 * genuine mismatch is `trunk`, which SC4 has never had — it is expressed as
 * accessory work, which is what it is structurally. Mapping it HERE (rather
 * than loosening SC4's enum) keeps the stored vocabulary closed.
 */
const BLOCK_TYPE_MAP = { trunk: 'accessory' };
const mapBlockType = (t) => BLOCK_TYPE_MAP[t] || t;

/**
 * Build the set fields for one exercise, keeping only fields the exercise
 * actually declares support for (SC4 validates this, and an exercise that
 * cannot take reps must never be given reps).
 */
function fieldsFor(exercise, blockType, dose) {
  const supported = new Set(exercise?.prescription || []);
  const allow = (id, value) => (value !== undefined && supported.has(FIELD_MAP[id]) ? { [id]: value } : {});

  if (PREP_BLOCKS.has(blockType)) {
    // Preparation work is time- or rep-based and deliberately un-graded.
    return { ...allow('reps', 8), ...allow('durationSec', 30), ...allow('holdSec', 20) };
  }
  const table = BLOCK_DOSE[blockType] || BLOCK_DOSE.accessory;
  const blockDose = resolveCategory(table, INTENSITY_CATEGORIES, dose.intensity);

  // Reps for power work are a QUALITY dose belonging to the EXERCISE, not to
  // the block it happens to sit in. `repsAreQualityDose` already holds these
  // reps constant through progression, on the stated grounds that adding
  // repetitions turns a power exposure into conditioning — but the INITIAL
  // dose was taken from the block, so a med-ball rotational throw filling a
  // trunk slot was prescribed ten of them while the progression engine
  // carefully refused to make it eleven. The two halves now agree.
  const powerDose = BLOCK_DOSE.power[dose.intensity] || BLOCK_DOSE.power.moderate;
  const d = repsAreQualityDose(exercise) ? { ...blockDose, reps: powerDose.reps } : blockDose;

  // An exercise lists its prescription types in PREFERENCE order, and the first
  // one is how the movement is actually performed. A side plank declares
  // ["hold", ...] because it is an isometric; a farmer carry declares
  // ["distance", ...] because it is walked, not counted. Prescribing either in
  // repetitions is technically valid — both also declare sets_reps — and
  // semantically wrong: "3 x 12 side plank" and "3 x 10 farmer carry" are not
  // instructions a coach can give.
  //
  // Dispatching on the declared primary type generalises what SC9.9 did for
  // holds alone. Teaching the engine a new continuous dose is now one entry in
  // PRIMARY_DOSE_FIELD plus a value in BLOCK_DOSE, not another branch here.
  const primaryField = PRIMARY_DOSE_FIELD[(exercise?.prescription || [])[0]];
  if (primaryField && d[primaryField] !== undefined) {
    return {
      ...allow(primaryField, d[primaryField]),
      ...allow('rpe', d.rpe),
      ...allow('restSec', REST_BY_BLOCK[blockType] ?? 90),
    };
  }
  return {
    ...allow('reps', d.reps),
    ...allow('durationSec', d.durationSec),
    ...allow('rpe', d.rpe),
    ...allow('restSec', REST_BY_BLOCK[blockType] ?? 90),
  };
}

/**
 * Continuous prescription types, mapped to the set field that carries them.
 * An exercise whose FIRST declared type appears here is dosed that way rather
 * than in repetitions. `sets_reps` is deliberately absent — it is the default
 * the generic branch already applies.
 *
 * `rounds` (sled relays, shuttle work) is also absent: those are conditioning
 * exercises the engine does not currently prescribe, and giving them a dose
 * here would invent conditioning programming rather than correct a dose.
 */
const PRIMARY_DOSE_FIELD = {
  hold: 'holdSec',
  distance: 'distanceM',
  duration: 'durationSec',
};

/**
 * Power and plyometric work, from the catalogue's OWN classification — no
 * second taxonomy. Reps here are a QUALITY dose: three crisp jumps is the
 * prescription, and adding repetitions turns a power exposure into
 * conditioning. Identified by category and by primary quality, because the
 * catalogue expresses it both ways (a countermovement jump is `plyometric`,
 * a trap-bar jump is `power`, and both carry `primaryQuality: 'power'`).
 */
const POWER_CATEGORIES = new Set(['power', 'plyometric']);
const POWER_QUALITIES = new Set(['power', 'rfd']);
function repsAreQualityDose(exercise) {
  const c = exercise?.classification;
  return POWER_CATEGORIES.has(c?.category) || POWER_QUALITIES.has(c?.primaryQuality);
}

const SESSION_PURPOSE_BY_ARCHETYPE = {
  full_body_strength: 'strength',
  lower_strength: 'strength',
  upper_strength: 'strength',
  power_speed: 'power',
  conditioning: 'conditioning',
  technique: 'technique',
};

/** Weekday order used to place sessions on the athlete's available days. */
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Choose training days: the athlete's own available days, minus rugby days
 * and match day, spread across the week. If they have not told us their
 * availability we do NOT guess a schedule — the days come back 'unscheduled'
 * and the coach places them, which is honest rather than convenient.
 */
export function chooseTrainingDays(blueprint, { availableDays = [], rugbyDays = [], matchDay = null } = {}) {
  const frequency = blueprint.frequency || 0;
  if (frequency === 0) return [];
  const busy = new Set([...(rugbyDays || []), ...(matchDay ? [matchDay] : [])]);
  const free = DAY_ORDER.filter((d) => (availableDays || []).includes(d) && !busy.has(d));
  if (free.length < frequency) return Array(frequency).fill('unscheduled');
  // Spread evenly rather than clumping onto consecutive days.
  const step = free.length / frequency;
  const chosen = [];
  for (let i = 0; i < frequency; i++) chosen.push(free[Math.floor(i * step)]);
  return chosen;
}

/**
 * Turn one SC5 blueprint into an SC4 programme with a DRAFT version.
 *
 * @param {object} blueprint            SC5 output (validated by caller)
 * @param {object} opts
 * @param {Array}  opts.catalogue       SC3 exercises (for prescription types)
 * @param {number} opts.weeks           how many weeks to lay out (default 4)
 * @returns {{programme, version, provenance}}
 */
export function programmeDraftFromBlueprint(blueprint, {
  catalogue = [], athleteName = '', athleteUserId = null, author, clubId = null,
  weeks = 4, title = null, schedule = {}, now = null, slug = null,
} = {}) {
  if (!blueprint || blueprint.kind !== 'programme_blueprint') throw new Error('not_a_blueprint');
  if (!author) throw new Error('author_required');
  if (blueprint.frequency === 0) throw new Error('blueprint_has_no_sessions');

  const byId = new Map(catalogue.map((e) => [e.id, e]));
  const dose = { volume: blueprint.volumeCategory, intensity: blueprint.intensityCategory };
  const setCount = resolveCategory(SETS_BY_VOLUME, VOLUME_CATEGORIES, dose.volume);
  // Resolve the phase ONCE. It reaches both the phase node and the progression
  // wave, and resolving it twice is how one of them silently disagreed.
  const requestedPhase = blueprint.input?.phase || 'in_season';
  const resolvedPhase = resolvePhase(requestedPhase);
  const phaseType = resolvedPhase.phase;
  const goal = blueprint.input?.goals?.[0] || 'general_athleticism';

  const programme = createProgramme({
    slug: slug || `athlete-${String(athleteUserId || 'unknown')}-${phaseType}`,
    title: title || `${athleteName || 'Athlete'} — ${labelPhase(phaseType)} S&C`,
    description: `Generated from the deterministic coaching engine (${blueprint.engineVersion}) and reviewed by a coach before publication.`,
    goal, season: seasonFor(phaseType),
    ownerType: 'athlete', ownerClub: clubId, ownerCoach: author,
    author, now,
  });
  const version = createProgrammeVersion(programme, { versionNumber: 1, createdBy: author, now });
  programme.versions = [version];

  const phase = createPhase(version.id, {
    phaseType, order: 1, name: labelPhase(phaseType),
    objective: `${dose.volume} volume · ${dose.intensity} intensity`, now,
  });
  version.phases = [phase];

  const days = chooseTrainingDays(blueprint, schedule);
  const matchDay = schedule.matchDay || blueprint.input?.matchDay || null;
  const placementByDay = matchWeekPlacements(blueprint, days, matchDay);

  const athlete = {
    experience: blueprint.input?.experience,
    context: blueprint.input?.context,
  };

  phase.weeks = [];
  for (let w = 1; w <= weeks; w++) {
    // One progression decision per week, shared by every prescription in it,
    // so the whole week moves as a unit rather than drifting exercise by
    // exercise.
    const progression = getWeekProgression({
      phase: phaseType, weekIndex: w, totalWeeks: weeks, athlete,
    });
    const week = createWeek(phase.id, {
      weekNumber: w, objective: weekObjective(progression, weeks), now,
    });
    week.weekRole = progression.weekRole;
    week.progressionReasons = progression.reasons;
    week.provisional = true;
    // `createWeek` leaves these for "a future engine" — this is that engine.
    week.plannedVolume = progression.weekRole === 'deload' ? 'reduced' : dose.volume;
    week.plannedIntensity = progression.weekRole === 'deload' ? 'reduced' : dose.intensity;
    week.days = blueprint.sessions.map((bpSession, i) => {
      const dayName = days[i] || 'unscheduled';
      const day = createTrainingDay(week.id, {
        day: dayName, order: i + 1,
        priority: 'primary',
        rugbyRelation: placementByDay[dayName] || 'none',
        optional: false, now,
      });
      const session = createSession(day.id, {
        title: sessionTitle(bpSession, i),
        order: 1,
        purpose: SESSION_PURPOSE_BY_ARCHETYPE[bpSession.archetype] || 'mixed',
        estimatedMinutes: estimateMinutes(bpSession, setCount),
        objective: `${bpSession.archetype.replace(/_/g, ' ')} — ${dose.intensity} intensity`,
        coachNotes: '', now,
      });
      session.blocks = (bpSession.blocks || []).map((bpBlock, bi) => {
        const blockType = mapBlockType(bpBlock.blockType);
        const block = createBlock(session.id, {
          blockType, order: bi + 1,
          optional: false,
          coachNotes: bpBlock.unresolvedSlots?.length
            ? `${bpBlock.unresolvedSlots.length} slot(s) could not be filled from the eligible library — coach to complete.`
            : '',
          collectionRefs: bpBlock.collectionRef ? [{ collectionId: bpBlock.collectionRef, version: null }] : [],
          now,
        });
        block.prescriptions = (bpBlock.exercises || []).map((pick, pi) => {
          const ex = byId.get(pick.exerciseId);
          if (!ex) throw new Error(`unknown_exercise:${pick.exerciseId}`);
          const p = createExercisePrescription(block.id, {
            exerciseId: ex.id, exerciseVersion: ex.version, order: pi + 1,
            coachingNotes: '', substitutionPolicy: 'structural_allowed',
            collectionOrigin: bpBlock.collectionRef ? { collectionId: bpBlock.collectionRef, version: null } : null,
            now,
          });
          let base = fieldsFor(ex, blockType, dose);
          const baseSets = PREP_BLOCKS.has(blockType) ? 1 : setCount;

          // Gate 2 Q6: youth strength work starts inside the NSCA band.
          if (YOUTH_CONTEXTS.has(athlete.context)
            && ex.classification?.category === 'strength'
            && Number.isFinite(base.reps) && base.reps < YOUTH_STRENGTH_MIN_REPS) {
            base = { ...base, reps: YOUTH_STRENGTH_MIN_REPS };
          }

          // Preparation blocks do not progress: a warm-up is the same warm-up
          // in week 4 as in week 1, and waving it would be noise, not training.
          let fields = base;
          let sets = baseSets;
          if (PREP_BLOCKS.has(blockType)) {
            p.progression = { progressed: false, changed: [], method: null };
          } else {
            const applied = applyWeekProgression(base, progression, {
              setCount: baseSets,
              method: progressionMethodFor(ex, base),
              repsAreQuality: repsAreQualityDose(ex),
            });
            fields = applied.fields;
            sets = applied.setCount;
            // Gate 2 Q5: the rep fallback may not carry a main-strength lift
            // out of the strength range. Quality-dosed work is untouched — its
            // reps are already held constant.
            if (blockType === 'main_strength' && !repsAreQualityDose(ex)
              && Number.isFinite(fields.reps) && fields.reps > MAIN_STRENGTH_MAX_REPS) {
              fields = { ...fields, reps: MAIN_STRENGTH_MAX_REPS };
            }
            // The wave's own account of what it did to THIS prescription, kept
            // so the review screen can report it rather than re-deriving it.
            // `at_minimum_dose` in particular is a domain judgement — the UI
            // must never infer it from two weeks happening to look alike.
            p.progression = {
              progressed: true, changed: applied.changed, method: applied.method,
            };
          }

          p.sets = Array.from({ length: sets }, (_, si) =>
            createSetPrescription(p.id, { order: si + 1, fields, now }));
          return p;
        });
        return block;
      }).filter((b) => b.prescriptions.length || (b.collectionRefs || []).length);
      day.sessions = [session];
      return day;
    });
    phase.weeks.push(week);
  }

  // Provenance travels WITH the draft so the review screen can explain itself
  // and the published version records why it looks the way it does.
  const provenance = {
    kind: 'blueprint_provenance',
    engineVersion: blueprint.engineVersion,
    provisional: true,
    generatedAt: now,
    developmentContext: structuredClone(blueprint.developmentContext),
    frequency: blueprint.frequency,
    volumeCategory: blueprint.volumeCategory,
    intensityCategory: blueprint.intensityCategory,
    qualityPriorities: [...(blueprint.qualityPriorities || [])],
    // Never silent: if the requested phase was not the one programmed, the
    // provenance says so and the critique surfaces it.
    phase: { requested: resolvedPhase.requested, programmed: resolvedPhase.phase, mapped: resolvedPhase.mapped,
             reason: resolvedPhase.reason },
    patternCoverage: structuredClone(blueprint.patternCoverage || {}),
    matchWeek: structuredClone(blueprint.matchWeek || {}),
    reasons: structuredClone(blueprint.reasons || []),
    flags: structuredClone(blueprint.flags || []),
    requiresReview: !!blueprint.requiresReview,
    unresolvedSlots: (blueprint.sessions || []).flatMap((s, i) =>
      (s.blocks || []).flatMap((b) => (b.unresolvedSlots || []).map((u) => ({ session: i + 1, blockType: b.blockType, ...u })))),
    daysChosen: days,
    weeks,
  };
  version.provenance = provenance;

  return { programme, version, provenance };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sessionTitle(bpSession, i) {
  const a = String(bpSession.archetype || 'session').replace(/_/g, ' ');
  return `${a.charAt(0).toUpperCase()}${a.slice(1)}`.slice(0, 60) || `Session ${i + 1}`;
}

function estimateMinutes(bpSession, setCount) {
  const working = (bpSession.blocks || []).reduce((n, b) =>
    n + (PREP_BLOCKS.has(mapBlockType(b.blockType)) ? (b.exercises || []).length * 2 : (b.exercises || []).length * setCount * 3), 0);
  return Math.max(20, Math.min(90, Math.round(working / 5) * 5));
}

const SC4_PHASE_TYPES = ['off_season', 'pre_season', 'in_season', 'peak', 'taper', 'return_to_general_training'];

/** SC5 and SC4 share the phase vocabulary; anything unknown fails safe. */
/**
 * Resolve a requested phase onto the programme vocabulary, EXPLICITLY.
 *
 * The athlete profile and the programme engine define different phase sets. The
 * only value in one and not the other is `post_season`, and it used to be
 * silently rewritten to `in_season` — the opposite of what it means. An athlete
 * declaring they are between seasons was programmed as though they were mid
 * competition, and nothing said so.
 *
 * `post_season` now resolves to `return_to_general_training`, which already
 * exists, already carries the `reintroduce` wave, and means what post-season
 * means: rebuild general capacity, effort creeping, volume flat.
 *
 * Anything else unrecognised still falls back — a programme must be
 * generatable — but the fallback is REPORTED rather than silent, so nobody
 * finds out by reading the output.
 */
export const PHASE_CONTRACT_MAP = { post_season: 'return_to_general_training' };

export function resolvePhase(requested) {
  const asked = String(requested || '');
  if (SC4_PHASE_TYPES.includes(asked)) return { phase: asked, requested: asked, mapped: false, reason: null };
  const contracted = PHASE_CONTRACT_MAP[asked];
  if (contracted) {
    return {
      phase: contracted, requested: asked, mapped: true,
      reason: { code: 'phase_contract_mapped', detail: `${asked} is programmed as ${contracted}` },
    };
  }
  return {
    phase: 'in_season', requested: asked, mapped: true,
    reason: { code: 'phase_unsupported', detail: `${asked} is not a supported phase — programmed as in_season` },
  };
}

function seasonFor(phase) {
  return ['off_season', 'pre_season', 'in_season', 'post_season'].includes(phase) ? phase : 'year_round';
}

function labelPhase(phase) {
  return String(phase || 'in season').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Map SC5's match-week placements onto the chosen days so the SC4 tree keeps
 * the match relationship (MD-3, MD-1, MD+1 …) rather than losing it.
 */
function matchWeekPlacements(blueprint, days, matchDay) {
  const out = {};
  if (!matchDay) return out;
  const mdIndex = DAY_ORDER.indexOf(matchDay);
  if (mdIndex === -1) return out;
  for (const day of days) {
    const i = DAY_ORDER.indexOf(day);
    if (i === -1) continue;
    // SC4's relations are descriptive and deliberately coarse. Days with no
    // named relationship stay 'none' rather than being given an invented one.
    const delta = i - mdIndex;
    if (delta === 0) out[day] = 'match_day';
    else if (delta === -1) out[day] = 'day_before_match';
    else if (delta === 1) out[day] = 'day_after_match';
  }
  return out;
}
