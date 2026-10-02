// The SC9.36 §15 athlete, and the digest of what the engine prescribes for him.
//
// IDENTICAL copies of this file live in BOTH repositories' test suites, and
// both suites assert the SAME digest. Core may reshape a programme for its own
// draft UI, but it may not change a single prescription — so if these two
// digests ever diverge, Core's vendored copy of the engine has drifted from the
// canonical one and the equivalence this integration rests on is gone.
//
// A real athlete, not a convenient one: a first-year U18 front-row forward with
// roughly a year of lifting, two gym days against two rugby days and a Saturday
// match. He is the case that makes the youth rules do something.
import { createHash } from 'node:crypto';

export const U18_FRONT_ROW = {
  personal: { ageBand: '16_17', dateOfBirth: null },
  rugby: { primaryPosition: 'hooker', playingLevel: 'school', seasonPhase: 'pre_season', matchDay: 'Sat' },
  // "Approximately 12 months lifting" sits exactly on the beginner/intermediate
  // line. Taken as `beginner` — the conservative reading for a minor, and the
  // same classification the SC9.26 pilot used for this athlete.
  training: { experience: 'beginner', techConfidence: 'medium', preferredSessionMinutes: 60 },
  equipment: { locations: ['commercial_gym'], items: ['barbell', 'dumbbells', 'rack', 'bench'] },
  schedule: { availableDays: ['Mon', 'Wed'], rugbyDays: ['Tue', 'Thu'], matchDay: 'Sat', maxSessionMinutes: 60 },
  goals: [{ type: 'max_strength', importance: 4 }, { type: 'preseason_prep', importance: 3 }],
  pain: { present: false },
  health: {},
  status: 'active',
};

export const SCENARIO = {
  teamCategory: 'youth_u18', athleteName: 'U18 Front Row', athleteUserId: 'u-u18',
  author: 'u-coach', weeks: 4, now: '2026-09-01T00:00:00.000Z',
};

/**
 * Exactly what a coach and a player receive: the prescription, and nothing
 * internal. Ids and timestamps are excluded on purpose — they encode the
 * programme slug and the clock, neither of which is a coaching decision.
 */
export function prescriptionProjection(result) {
  return (result.programme.versions[0].phases[0].weeks || []).map((w) => ({
    week: w.weekNumber,
    volume: w.plannedVolume, intensity: w.plannedIntensity, role: w.weekRole ?? null,
    days: (w.days || []).map((d) => ({
      day: d.day, priority: d.priority, rugbyRelation: d.rugbyRelation, optional: d.optional,
      sessions: (d.sessions || []).map((s) => ({
        title: s.title, purpose: s.purpose, estimatedMinutes: s.estimatedMinutes,
        blocks: (s.blocks || []).map((b) => ({
          order: b.order, blockType: b.blockType, optional: b.optional,
          prescriptions: (b.prescriptions || []).map((p) => ({
            order: p.order, exerciseId: p.exerciseId, substitutionPolicy: p.substitutionPolicy,
            sets: (p.sets || []).map((st) => ({ order: st.order, ...st.fields })),
            progression: p.progression ?? null,
          })),
        })),
      })),
    })),
  }));
}

export const digest = (result) =>
  createHash('sha256').update(JSON.stringify(prescriptionProjection(result))).digest('hex');

/** Every exercise the programme actually prescribes. */
export const exercisesIn = (result) => [...new Set(
  prescriptionProjection(result).flatMap((w) => w.days).flatMap((d) => d.sessions)
    .flatMap((s) => s.blocks).flatMap((b) => b.prescriptions).map((p) => p.exerciseId))].sort();

/** Every repetition count the programme prescribes. */
export const repsIn = (result) => [...new Set(
  prescriptionProjection(result).flatMap((w) => w.days).flatMap((d) => d.sessions)
    .flatMap((s) => s.blocks).flatMap((b) => b.prescriptions).flatMap((p) => p.sets)
    .map((st) => st.reps).filter((r) => Number.isInteger(r)))].sort((a, b) => a - b);
