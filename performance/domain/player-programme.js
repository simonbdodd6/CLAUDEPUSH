// CoachEasier Performance — the player-safe projection (SC9.34).
//
// WHITELIST, NOT FILTER
//
// Every field a player sees is named here. Nothing is copied wholesale and
// nothing is stripped afterwards, because a filter fails open: the day someone
// adds a field to the blueprint, a filter ships it and a whitelist does not.
//
// SC9.33 measured what is at stake. A deliberately sensitive restriction note —
// "grade 2 biceps femoris, MRI 3 Sep, physio-led" — appears in `blueprint` and
// in `context`, and in neither `programme` nor the assignment snapshot. This
// layer sits between the two and is built so that clinical free text, exercise
// ranking scores, tie-breaks, contraindication tags, review flags, provenance
// and every engine identifier are absent by construction rather than by
// vigilance.
//
// WHAT A PLAYER NEEDS
//
// What do I do today, in what order, how much of it, how hard, and how long do
// I rest. Plus enough plain English to know why next week is different. That is
// the whole list.
//
// Pure: no DOM, no storage, no clock.

import { releaseDecision } from './release-policy.js';

export const PLAYER_PROGRAMME_VERSION = '2026.09-sc934-beta.1';

/** Block ids the player never sees as a heading — they are structure, not content. */
const BLOCK_LABEL = {
  warmup: 'Warm-up',
  activation: 'Activation',
  power: 'Power',
  main_strength: 'Main strength',
  accessory: 'Strength & support',
  trunk: 'Trunk',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
  cooldown: 'Cool-down',
};

/** Week roles in words a sixteen-year-old reads without a glossary. */
const WEEK_LABEL = {
  introduce: 'Learn the movements',
  build: 'Build',
  peak: 'Push',
  deload: 'Easier week',
};
const WEEK_NOTE = {
  introduce: 'Start here. Get the technique right before anything gets heavier.',
  build: 'Same movements, a little more effort than last week.',
  peak: 'The hardest week of the block.',
  deload: 'Deliberately lighter so you recover and come back stronger.',
};

const DAY_NAME = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

/** Rest, in the words a player uses, from the seconds the engine prescribed. */
function restText(sec) {
  if (!Number.isFinite(sec)) return null;
  if (sec >= 60) {
    const m = sec / 60;
    return `${Number.isInteger(m) ? m : m.toFixed(1)} min`;
  }
  return `${sec} sec`;
}

/**
 * How much of this exercise to do, as one readable string.
 * Only dimensions the engine actually prescribed appear.
 */
function doseText(sets, f) {
  if (Number.isFinite(f.distanceM)) return `${sets} × ${f.distanceM} m`;
  if (Number.isFinite(f.holdSec)) return `${sets} × ${f.holdSec} sec hold`;
  if (Number.isFinite(f.durationSec)) return `${sets} × ${f.durationSec} sec`;
  if (Number.isFinite(f.reps)) return `${sets} × ${f.reps}`;
  return `${sets} sets`;
}

/**
 * Build the player's view of a generated programme.
 *
 * @param {object} input
 * @param {object} input.programme   from `generateProgramme`
 * @param {object} input.blueprint   from `generateProgramme` — read for release
 *                                   state and week shape ONLY; nothing from it
 *                                   is copied into the output
 * @param {Array}  input.catalogue   to resolve names and coaching cues
 * @param {object} [input.athlete]   { name, club, team } — presentation only
 * @returns {object} a plain object containing only player-safe fields
 */
export function playerProgramme({ programme, blueprint, catalogue = [], athlete = {} }) {
  if (!programme?.versions?.[0]?.phases?.[0]?.weeks?.length) {
    throw new Error('playerProgramme_requires_generated_programme');
  }
  if (!blueprint?.flags) throw new Error('playerProgramme_requires_blueprint');

  const release = releaseDecision(blueprint);
  if (!release.releasable) {
    throw new Error(`playerProgramme_not_releasable: ${release.blockedBy.map((f) => f.id).join(', ')}`);
  }

  const byId = new Map(catalogue.map((e) => [e.id, e]));
  const weeks = programme.versions[0].phases[0].weeks;

  const out = {
    version: PLAYER_PROGRAMME_VERSION,
    // ── Identity. Presentation only; supplied by the caller, never inferred.
    club: athlete.club ?? null,
    team: athlete.team ?? null,
    playerName: athlete.name ?? null,
    title: athlete.title ?? 'Strength & Conditioning Programme',
    // ── Shape of the block.
    weeks: weeks.length,
    sessionsPerWeek: new Set(weeks[0].days.map((d) => d.day)).size,
    trainingDays: [...new Set(weeks.flatMap((w) => w.days.map((d) => DAY_NAME[d.day] || d.day)))],
    // ── The programme itself.
    schedule: weeks.map((w) => ({
      week: w.weekNumber,
      focus: WEEK_LABEL[w.weekRole] || 'Train',
      note: WEEK_NOTE[w.weekRole] || null,
      days: w.days.map((d) => ({
        day: DAY_NAME[d.day] || d.day,
        sessions: d.sessions.map((s) => ({
          // The engine's session title is already plain English ("Full body
          // strength"); the archetype id behind it is not carried. The
          // engine's `objective` restates the title plus the dose category —
          // redundant to a coach and meaningless to a player, so it is dropped
          // rather than reworded.
          title: s.title,
          minutes: s.estimatedMinutes ?? null,
          blocks: mergeAdjacent(s.blocks
            .map((b) => ({
              label: BLOCK_LABEL[b.blockType] || 'Training',
              warmUpCollection: (b.prescriptions || []).length === 0
                && (b.collectionRefs || []).length > 0,
              exercises: (b.prescriptions || []).map((p) => {
                const ex = byId.get(p.exerciseId);
                const f = p.sets[0]?.fields || {};
                return {
                  // NAME ONLY. No id, no slug, no score, no classification.
                  name: ex?.name ?? 'Exercise',
                  dose: doseText(p.sets.length, f),
                  // RPE only where the engine actually prescribed one.
                  effort: Number.isFinite(f.rpe) ? `RPE ${f.rpe}` : null,
                  rest: restText(f.restSec),
                  // One coaching cue, the athlete-facing kind the catalogue
                  // already writes. Never the safety review text.
                  cue: ex?.coaching?.cues?.[0] ?? ex?.cues?.[0] ?? null,
                };
              }),
            }))
            // A block with nothing in it is structure, not content.
            .filter((b) => b.exercises.length > 0 || b.warmUpCollection)),
        })),
      })),
    })),
    // ── Plain-English guidance, derived from what the engine did.
    howEffortWorks: weeks.some((w) => w.days.some((d) => d.sessions.some((s) =>
      s.blocks.some((b) => (b.prescriptions || []).some((p) => Number.isFinite(p.sets[0]?.fields?.rpe))))))
      ? 'RPE is how hard a set should feel out of 10. RPE 7 means you could have done about '
        + 'three more good reps. Stop a set if your technique changes.'
      : null,
    howProgressionWorks: describeProgression(weeks),
  };
  return out;
}

/**
 * Two blocks with the same heading, back to back, is an engine detail leaking as
 * layout: `trunk` is stored as `accessory`, so a session can carry two blocks
 * called the same thing. A player reads one heading and one list.
 */
function mergeAdjacent(blocks) {
  const out = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && prev.label === b.label && !prev.warmUpCollection && !b.warmUpCollection) {
      prev.exercises = [...prev.exercises, ...b.exercises];
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

/** The block's shape in one sentence, read from the week roles the engine set. */
function describeProgression(weeks) {
  const roles = weeks.map((w) => w.weekRole);
  const deloads = roles.map((r, i) => (r === 'deload' ? i + 1 : null)).filter(Boolean);
  const parts = ['Each week builds on the last — the movements stay the same so you can '
    + 'see yourself improve on them.'];
  if (deloads.length) {
    parts.push(deloads.length === 1
      ? `Week ${deloads[0]} is deliberately easier. That is planned recovery, not a step back.`
      : `Weeks ${deloads.join(' and ')} are deliberately easier. That is planned recovery, not a step back.`);
  }
  return parts.join(' ');
}

/**
 * Every field name this projection may ever emit, for tests and for review.
 * If a field is not on this list it cannot reach a player.
 */
export const PLAYER_FIELDS = [
  'version', 'club', 'team', 'playerName', 'title', 'weeks', 'sessionsPerWeek',
  'trainingDays', 'schedule', 'week', 'focus', 'note', 'days', 'day', 'sessions',
  'title', 'minutes', 'blocks', 'label', 'warmUpCollection', 'exercises',
  'name', 'dose', 'effort', 'rest', 'cue', 'howEffortWorks', 'howProgressionWorks',
];
