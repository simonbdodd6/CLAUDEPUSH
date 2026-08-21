// CoachEasier Performance — DEMO assignment fixture (SC7).
//
// A deterministic, clearly-isolated demo programme + session built through
// the REAL SC4 domain seam (builders → publish → session node), so the
// workout UI executes a genuine SC4-compatible snapshot rather than loose
// sample cards. Production assignment tooling replaces this fixture in a
// later milestone; nothing else may import it as a data source.
//
// Pure module: no DOM, no fetch, no clock (fixed dates), no randomness.

import {
  createBlock, createExercisePrescription, createPhase, createProgramme,
  createProgrammeVersion, createSession, createSetPrescription,
  createTrainingDay, createWeek,
} from '../domain/programme.js';
import { publishProgrammeVersion } from '../domain/programme-versioning.js';

export const DEMO_ASSIGNMENT_ID = 'demo-assignment-sc7';
const D = '2026-08-01T00:00:00.000Z';

/** Build (once per call) the demo programme with one published version. */
export function buildDemoProgramme() {
  const prog = createProgramme({
    slug: 'demo-preseason', title: 'Pre-Season Strength (Demo)',
    description: 'Deterministic SC7 demo fixture — replaced by real assignments later.',
    goal: 'preseason_prep', season: 'pre_season',
    ownerType: 'club', ownerClub: 'demo-club', author: 'demo-coach', now: D,
  });
  const v1 = createProgrammeVersion(prog, { versionNumber: 1, createdBy: 'demo-coach', now: D });
  const phase = createPhase(v1.id, { phaseType: 'pre_season', order: 1, objective: 'General prep', now: D });
  const week = createWeek(phase.id, { weekNumber: 3, objective: 'Main lifts, week 3', now: D });
  const day = createTrainingDay(week.id, { day: 'Mon', order: 1, now: D });
  const session = createSession(day.id, { title: 'Lower Body Strength — Week 3, Day 1', order: 1, purpose: 'strength', estimatedMinutes: 60, objective: 'Main lower-body strength work', now: D });

  const main = createBlock(session.id, { blockType: 'main_strength', order: 1, coachNotes: 'Leave a rep in reserve.', now: D });
  const squat = createExercisePrescription(main.id, { exerciseId: 'ex-back-squat', order: 1, coachingNotes: 'Pause the first rep of each set.', now: D });
  squat.sets.push(createSetPrescription(squat.id, { order: 1, fields: { sets: 3, reps: 5, load: 100, rpe: 7, restSec: 180 }, now: D }));
  const rdl = createExercisePrescription(main.id, { exerciseId: 'ex-barbell-rdl', order: 2, now: D });
  rdl.sets.push(createSetPrescription(rdl.id, { order: 1, fields: { sets: 3, reps: '6-8', load: 80, rpe: 7, restSec: 150 }, now: D }));

  const accessory = createBlock(session.id, { blockType: 'accessory', order: 2, now: D });
  const dbBench = createExercisePrescription(accessory.id, { exerciseId: 'ex-db-bench', order: 1, now: D });
  dbBench.sets.push(createSetPrescription(dbBench.id, { order: 1, fields: { sets: 3, reps: '8-12', load: 20, rest: undefined, restSec: 120 }, now: D }));

  const trunk = createBlock(session.id, { blockType: 'accessory', order: 3, optional: true, coachNotes: 'Optional trunk finisher.', now: D });
  const plank = createExercisePrescription(trunk.id, { exerciseId: 'ex-front-plank', order: 1, now: D });
  plank.sets.push(createSetPrescription(plank.id, { order: 1, fields: { sets: 3, holdSec: 40 }, now: D }));

  main.prescriptions.push(squat, rdl);
  accessory.prescriptions.push(dbBench);
  trunk.prescriptions.push(plank);
  session.blocks.push(main, accessory, trunk);
  day.sessions.push(session);
  week.days.push(day);
  phase.weeks.push(week);
  v1.phases.push(phase);
  prog.versions.push(v1);
  publishProgrammeVersion(prog, 1, { actor: 'demo-coach', now: D });
  return prog;
}

/** The demo session node + metadata the workout UI executes. */
export function getDemoAssignment() {
  const programme = buildDemoProgramme();
  const version = programme.versions[0];
  const session = version.phases[0].weeks[0].days[0].sessions[0];
  return {
    isDemo: true,
    assignmentId: DEMO_ASSIGNMENT_ID,
    programme,
    programmeVersionId: version.id,
    sessionNode: session,
    meta: {
      programmeVersionId: version.id,
      assignmentId: DEMO_ASSIGNMENT_ID,
      phase: 'pre_season',
      week: 3,
      matchContext: { md: 'MD-5', matchDay: 'Sat' },
    },
  };
}
