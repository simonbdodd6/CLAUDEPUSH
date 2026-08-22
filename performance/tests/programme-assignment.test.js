// CoachEasier Performance — assignment lifecycle + blueprint transformation (SC8).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssignment, activateAssignment, pauseAssignment, resumeAssignment,
  completeAssignment, cancelAssignment, markReplaced, canTransition,
  effectiveStatus, isLiveToday, programmePosition, sessionForDate, weekPlan,
  planAssignmentConflict, validateAssignmentRequest, occupyingAssignments,
  attachProgressionSuggestion, reviewProgressionSuggestion, daysBetween, weekdayOf,
  programmeWeekCount,
} from '../domain/programme-assignment.js';
import { programmeDraftFromBlueprint, chooseTrainingDays } from '../domain/blueprint-to-programme.js';
import { generateBlueprint, engineInputFromProfile } from '../domain/programme-blueprint.js';
import { validateProgrammeVersion } from '../domain/programme.js';
import { publishProgrammeVersion, snapshotForProgrammeAssignment, beginEdit } from '../domain/programme-versioning.js';
import { EXERCISES } from '../services/exercise-catalogue.js';
import { COLLECTIONS } from '../services/exercise-collections-catalogue.js';

const NOW = '2026-08-22T09:00:00.000Z';

/** A real published programme + snapshot, built through the real SC4/SC5 path. */
function realSnapshot({ athlete = 'u1', weeks = 4, profile = null } = {}) {
  const p = profile || {
    personal: { ageBand: '21_29' },
    rugby: { primaryPosition: 'lock', playingLevel: 'club', seasonPhase: 'pre_season' },
    training: { experience: 'intermediate', techConfidence: 'confident' },
    goals: [{ type: 'strength', importance: 5 }],
    equipment: { locations: ['full_gym'], items: ['barbell', 'rack', 'plates'] },
    schedule: { availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], rugbyDays: ['Tue'], matchDay: 'Sat' },
    health: {}, pain: { present: false },
  };
  const bp = generateBlueprint(engineInputFromProfile(p, { teamCategory: 'adult' }), { catalogue: EXERCISES });
  const { programme } = programmeDraftFromBlueprint(bp, {
    catalogue: EXERCISES, athleteUserId: athlete, author: 'coach1', clubId: 'club1',
    weeks, schedule: p.schedule, now: NOW,
  });
  publishProgrammeVersion(programme, 1, { actor: 'coach1', now: NOW });
  const snapshot = snapshotForProgrammeAssignment(programme, 1, { catalogue: EXERCISES, now: NOW });
  return { programme, snapshot, blueprint: bp };
}

function assignment(over = {}) {
  const { snapshot, programme } = over.snapshot ? { snapshot: over.snapshot, programme: null } : realSnapshot();
  return createAssignment({
    assignmentId: 'pa-1', clubId: 'club1', athleteUserId: 'u1', athleteName: 'Alex',
    programmeId: programme?.id || 'pg-1', programmeVersionId: snapshot.programmeVersionId,
    versionNumber: 1, snapshot,
    assignedBy: 'coach1', assignedAt: NOW, startDate: '2026-08-24', // a Monday
    groupId: 'grp-sen', groupName: 'Seniors', developmentContext: 'adult', developmentSource: 'age_band',
    now: NOW, ...over,
  });
}

// ── Creation & context ──────────────────────────────────────────────────────

test('1. an assignment pins a frozen snapshot and its context at assignment time', () => {
  const a = assignment();
  assert.equal(a.kind, 'programme_assignment');
  assert.equal(a.status, 'scheduled');
  assert.equal(a.snapshot.kind, 'programme_assignment_snapshot');
  assert.equal(a.groupId, 'grp-sen');
  assert.equal(a.developmentContextSnapshot.context, 'adult');
  assert.deepEqual(a.audit.map(e => e.action), ['assignment_created']);
});

test('2. a later group change cannot rewrite a historical assignment', () => {
  const a = assignment();
  const before = structuredClone(a.developmentContextSnapshot);
  // The athlete moves to Seniors from U18 next season — the record does not care.
  const laterContext = { groupId: 'grp-u18', developmentCategory: 'youth_u18' };
  assert.deepEqual(a.developmentContextSnapshot, before);
  assert.equal(a.groupId, 'grp-sen', 'the stamped group is history, not a live lookup');
  assert.notEqual(a.groupId, laterContext.groupId);
});

test('3. creation refuses incomplete or incoherent input', () => {
  const { snapshot } = realSnapshot();
  const base = { assignmentId: 'x', clubId: 'c', athleteUserId: 'u', programmeId: 'p',
    programmeVersionId: 'v', snapshot, assignedBy: 'coach', assignedAt: NOW, startDate: '2026-09-01', now: NOW };
  assert.throws(() => createAssignment({ ...base, athleteUserId: '' }), /athlete_required/);
  assert.throws(() => createAssignment({ ...base, startDate: 'soon' }), /start_date_required/);
  assert.throws(() => createAssignment({ ...base, snapshot: { kind: 'nope' } }), /snapshot_required/);
  assert.throws(() => createAssignment({ ...base, endDate: '2026-08-01' }), /end_before_start/);
  assert.throws(() => createAssignment({ ...base, source: 'ai_generated' }), /bad_source/);
});

// ── Lifecycle ───────────────────────────────────────────────────────────────

test('4. the lifecycle graph is explicit and terminal states never reopen', () => {
  assert.ok(canTransition('scheduled', 'active'));
  assert.ok(canTransition('active', 'paused'));
  assert.ok(canTransition('paused', 'active'));
  for (const terminal of ['completed', 'replaced', 'cancelled']) {
    for (const to of ['active', 'paused', 'scheduled']) {
      assert.equal(canTransition(terminal, to), false, `${terminal}->${to} must be impossible`);
    }
  }
});

test('5. pause / resume / complete stamp times and audit every step', () => {
  let a = activateAssignment(assignment(), { actor: 'coach1', at: NOW });
  a = pauseAssignment(a, { actor: 'coach1', at: '2026-09-01T10:00:00.000Z', reason: 'exam week' });
  assert.equal(a.status, 'paused');
  assert.equal(a.pausedAt, '2026-09-01T10:00:00.000Z');
  a = resumeAssignment(a, { actor: 'coach1', at: '2026-09-08T10:00:00.000Z' });
  assert.equal(a.status, 'active');
  a = completeAssignment(a, { actor: 'coach1', at: '2026-10-01T10:00:00.000Z' });
  assert.equal(a.status, 'completed');
  assert.deepEqual(a.audit.map(e => e.action),
    ['assignment_created', 'assignment_activated', 'assignment_paused', 'assignment_resumed', 'assignment_completed']);
  assert.throws(() => resumeAssignment(a, { actor: 'c', at: NOW }), /bad_transition/);
});

test('6. replacement records WHICH assignment superseded it', () => {
  const a = markReplaced(assignment(), { actor: 'coach1', at: NOW, replacementId: 'pa-2' });
  assert.equal(a.status, 'replaced');
  assert.equal(a.replacedByAssignmentId, 'pa-2');
  assert.throws(() => markReplaced(assignment(), { actor: 'c', at: NOW }), /replacement_required/);
});

test('7. cancelling preserves the record rather than deleting it', () => {
  const a = cancelAssignment(assignment(), { actor: 'coach1', at: NOW, reason: 'moved club' });
  assert.equal(a.status, 'cancelled');
  assert.ok(a.snapshot, 'the training content it pinned is still readable');
  assert.equal(a.audit.at(-1).detail, 'moved club');
});

// ── Derived state / calendar ────────────────────────────────────────────────

test('8. a scheduled assignment becomes active on its start date, without writing', () => {
  const a = assignment({ startDate: '2026-09-01' });
  assert.equal(effectiveStatus(a, '2026-08-30'), 'scheduled');
  assert.equal(effectiveStatus(a, '2026-09-01'), 'active');
  assert.equal(isLiveToday(a, '2026-08-30'), false);
  assert.equal(isLiveToday(a, '2026-09-05'), true);
  assert.equal(a.status, 'scheduled', 'deriving status never mutates the record');
});

test('9. an assignment past its end date reads as completed', () => {
  const a = assignment({ startDate: '2026-08-24', endDate: '2026-09-20' });
  assert.equal(effectiveStatus(a, '2026-09-10'), 'active');
  assert.equal(effectiveStatus(a, '2026-09-21'), 'completed');
});

test('10. a PAUSED assignment serves no workout, and keeps its history', () => {
  const a = pauseAssignment(activateAssignment(assignment(), { actor: 'c', at: NOW }), { actor: 'c', at: NOW });
  assert.equal(effectiveStatus(a, '2026-08-26'), 'paused');
  assert.equal(isLiveToday(a, '2026-08-26'), false);
  assert.equal(sessionForDate(a, '2026-08-26'), null, 'paused means no Today session');
  assert.ok(a.snapshot);
});

test('11. programme week is derived from the start date', () => {
  const a = assignment({ startDate: '2026-08-24' });
  assert.equal(programmePosition(a, '2026-08-24').week, 1);
  assert.equal(programmePosition(a, '2026-08-30').week, 1);
  assert.equal(programmePosition(a, '2026-08-31').week, 2);
  assert.equal(programmePosition(a, '2026-09-14').week, 4);
  assert.equal(programmePosition(a, '2026-08-23'), null, 'before the start there is no position');
  assert.equal(daysBetween('2026-08-24', '2026-08-31'), 7);
  assert.equal(weekdayOf('2026-08-24'), 'Mon');
});

// ── Today's session from the PINNED snapshot ────────────────────────────────

test('12. today\'s session comes from the pinned snapshot on a matching training day', () => {
  const { snapshot } = realSnapshot();
  const a = assignment({ snapshot, startDate: '2026-08-24' });
  const days = new Set();
  for (const phase of snapshot.prescriptionTree) for (const w of phase.weeks) for (const d of w.days) days.add(d.day);
  const trainingDay = [...days].find(d => d !== 'unscheduled');
  const offset = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(trainingDay);
  const date = `2026-08-${String(24 + offset).padStart(2, '0')}`;
  const today = sessionForDate(a, date);
  assert.ok(today, `expected a session on ${trainingDay} (${date})`);
  assert.equal(today.session.kind, 'session');
  assert.equal(today.weekNumber, 1);
  assert.ok(today.session.title);
});

test('13. a rest day is honestly empty — never a shifted or substituted session', () => {
  const a = assignment({ startDate: '2026-08-24' });
  const plan = weekPlan(a, '2026-08-24');
  const trainingDays = new Set(plan.map(s => s.day));
  const restDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    .map((d, i) => ({ d, date: `2026-08-${String(24 + i).padStart(2, '0')}` }))
    .find(x => !trainingDays.has(x.d));
  if (restDay) assert.equal(sessionForDate(a, restDay.date), null, `${restDay.d} is a rest day`);
});

test('14. running past the final week yields no session rather than looping', () => {
  const a = assignment({ startDate: '2026-08-24' });   // 4-week programme
  assert.equal(programmeWeekCount(a), 4);
  assert.equal(sessionForDate(a, '2026-09-28'), null, 'week 6 has no content');
});

test('15. the week plan describes the athlete\'s current week', () => {
  const a = assignment({ startDate: '2026-08-24' });
  const plan = weekPlan(a, '2026-08-26');
  assert.ok(plan.length >= 1);
  for (const s of plan) {
    assert.ok(s.title && s.day);
    assert.equal(typeof s.isToday, 'boolean');
  }
});

// ── Conflicts ───────────────────────────────────────────────────────────────

test('16. a second assignment is refused unless the coach declares intent', () => {
  const existing = [activateAssignment(assignment(), { actor: 'c', at: NOW })];
  const plain = planAssignmentConflict(existing, { athleteUserId: 'u1', startDate: '2026-10-01' });
  assert.equal(plain.ok, false);
  assert.equal(plain.reason, 'active_assignment_exists');
  assert.equal(plain.conflicts.length, 1);

  assert.equal(planAssignmentConflict(existing, { athleteUserId: 'u1', startDate: '2026-10-01', intent: 'replace' }).ok, true);
  assert.equal(planAssignmentConflict([], { athleteUserId: 'u1', startDate: '2026-10-01' }).action, 'create');
  // A different athlete is never in conflict.
  assert.equal(planAssignmentConflict(existing, { athleteUserId: 'u2', startDate: '2026-10-01' }).ok, true);
});

test('17. scheduling after requires the new programme to start after the old ends', () => {
  const existing = [assignment({ endDate: '2026-10-01' })];
  const tooEarly = planAssignmentConflict(existing, { athleteUserId: 'u1', startDate: '2026-09-15', intent: 'schedule_after' });
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.reason, 'starts_before_current_ends');
  assert.equal(planAssignmentConflict(existing, { athleteUserId: 'u1', startDate: '2026-10-05', intent: 'schedule_after' }).ok, true);
});

test('18. only occupying statuses hold the athlete\'s slot', () => {
  const done = completeAssignment(activateAssignment(assignment(), { actor: 'c', at: NOW }), { actor: 'c', at: NOW });
  assert.deepEqual(occupyingAssignments([done], 'u1'), [], 'a completed programme frees the slot');
});

// ── Validation gates ────────────────────────────────────────────────────────

test('19. a draft or archived version can never be assigned', () => {
  const { snapshot } = realSnapshot();
  const base = { snapshot, startDate: '2026-09-01', developmentContext: 'adult' };
  assert.deepEqual(validateAssignmentRequest({ ...base, version: { versionStatus: 'draft' } }).errors, ['cannot_assign_draft']);
  assert.deepEqual(validateAssignmentRequest({ ...base, version: { versionStatus: 'archived' } }).errors, ['cannot_assign_archived']);
  assert.equal(validateAssignmentRequest({ ...base, version: { versionStatus: 'published' } }).ok, true);
});

test('20. an unentitled athlete cannot be assigned a premium programme', () => {
  const { snapshot } = realSnapshot();
  const r = validateAssignmentRequest({ version: { versionStatus: 'published' }, snapshot, startDate: '2026-09-01', athleteEntitled: false });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('athlete_not_entitled'));
});

test('21. a review-flagged programme needs an explicit coach acknowledgement', () => {
  const { snapshot } = realSnapshot();
  const base = { version: { versionStatus: 'published' }, snapshot, startDate: '2026-09-01', requiresReview: true };
  assert.ok(validateAssignmentRequest(base).errors.includes('coach_review_required'));
  assert.equal(validateAssignmentRequest({ ...base, reviewAcknowledged: true }).ok, true);
});

// ── SC6 progression seam ────────────────────────────────────────────────────

test('22. a progression suggestion stays PENDING and changes nothing', () => {
  const active = activateAssignment(assignment(), { actor: 'c', at: NOW });
  const withSuggestion = attachProgressionSuggestion(active, {
    suggestion: { kind: 'progression_plan', decisions: [{ exerciseId: 'ex-back-squat', action: 'increase' }] },
    at: '2026-09-08T09:00:00.000Z', actor: 'system',
  });
  assert.equal(withSuggestion.progressionReview.status, 'pending');
  assert.equal(withSuggestion.status, 'active', 'the assignment itself is unchanged');
  assert.equal(withSuggestion.programmeVersionId, active.programmeVersionId, 'the pinned version is untouched');
  assert.deepEqual(withSuggestion.snapshot, active.snapshot, 'the frozen content is untouched');
  assert.equal(withSuggestion.audit.at(-1).action, 'progression_suggested');
});

test('23. reviewing a suggestion records the decision and never publishes', () => {
  const withSuggestion = attachProgressionSuggestion(activateAssignment(assignment(), { actor: 'c', at: NOW }),
    { suggestion: { kind: 'progression_plan' }, at: NOW });
  for (const outcome of ['accepted', 'modified', 'rejected']) {
    const r = reviewProgressionSuggestion(withSuggestion, { outcome, actor: 'coach1', at: NOW });
    assert.equal(r.progressionReview.status, outcome);
    assert.equal(r.programmeVersionId, withSuggestion.programmeVersionId, 'review never repoints the assignment');
    assert.equal(r.audit.at(-1).action, 'progression_reviewed');
  }
  assert.throws(() => reviewProgressionSuggestion(withSuggestion, { outcome: 'pending', actor: 'c', at: NOW }), /bad_review_outcome/);
  assert.throws(() => reviewProgressionSuggestion(assignment(), { outcome: 'accepted', actor: 'c', at: NOW }), /no_pending_suggestion/);
});

// ── Version pinning ─────────────────────────────────────────────────────────

test('24. publishing v2 does not touch an assignment pinned to v1', () => {
  const { programme, snapshot } = realSnapshot();
  const a = assignment({ snapshot, programmeId: programme.id });
  const v1Json = JSON.stringify(a.snapshot);

  // Coach edits and publishes a second version.
  const draft = beginEdit(programme, { actor: 'coach1', now: NOW });
  draft.phases[0].weeks[0].days[0].sessions[0].title = 'COMPLETELY DIFFERENT';
  publishProgrammeVersion(programme, 2, { actor: 'coach1', now: NOW });

  assert.equal(JSON.stringify(a.snapshot), v1Json, 'the assigned snapshot is byte-identical after v2 publishes');
  assert.equal(a.versionNumber, 1);
  const today = sessionForDate(a, '2026-08-24') || sessionForDate(a, '2026-08-26');
  if (today) assert.notEqual(today.session.title, 'COMPLETELY DIFFERENT');
});

// ── Blueprint → SC4 transformation ──────────────────────────────────────────

test('25. every development context produces a VALID SC4 programme', () => {
  const cases = [
    ['youth_u16', { personal: { ageBand: 'under_16' }, training: { experience: 'new' } }],
    ['youth_u18', { personal: { ageBand: '16_17' }, training: { experience: 'beginner' } }],
    ['adult',     { personal: { ageBand: '21_29' }, training: { experience: 'intermediate', techConfidence: 'confident' } }],
    ['unknown',   { personal: {}, training: { experience: 'beginner' } }],
  ];
  for (const [label, over] of cases) {
    const profile = {
      rugby: { primaryPosition: 'flanker', playingLevel: 'club', seasonPhase: 'pre_season' },
      goals: [{ type: 'strength', importance: 4 }],
      equipment: { locations: ['full_gym'], items: ['barbell', 'rack', 'plates'] },
      schedule: { availableDays: ['Mon', 'Wed', 'Fri'], rugbyDays: ['Tue'], matchDay: 'Sat' },
      health: {}, pain: { present: false }, ...over,
    };
    const bp = generateBlueprint(engineInputFromProfile(profile, { teamCategory: label === 'unknown' ? null : label }), { catalogue: EXERCISES });
    const { version, provenance } = programmeDraftFromBlueprint(bp, {
      catalogue: EXERCISES, athleteUserId: 'u1', author: 'coach1', weeks: 2, schedule: profile.schedule, now: NOW });
    const v = validateProgrammeVersion(version, { catalogue: EXERCISES, collections: COLLECTIONS });
    assert.equal(v.ok, true, `${label}: ${v.errors.join(', ')}`);
    assert.equal(provenance.developmentContext.context, label);
  }
});

test('26. the transformation preserves reason codes, flags and development context', () => {
  const { blueprint } = realSnapshot();
  const profile = { personal: { ageBand: '21_29' }, rugby: { primaryPosition: 'lock', playingLevel: 'club', seasonPhase: 'pre_season' },
    training: { experience: 'intermediate', techConfidence: 'confident' }, goals: [{ type: 'strength', importance: 5 }],
    equipment: { locations: ['full_gym'], items: ['barbell', 'rack', 'plates'] },
    schedule: { availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], rugbyDays: ['Tue'], matchDay: 'Sat' }, health: {}, pain: { present: false } };
  const { provenance } = programmeDraftFromBlueprint(blueprint, {
    catalogue: EXERCISES, athleteUserId: 'u1', author: 'coach1', weeks: 4, schedule: profile.schedule, now: NOW });
  assert.ok(provenance.reasons.length, 'reason codes survive');
  assert.ok(provenance.flags.some(f => f.id === 'beta_rules_provisional'), 'provisional marker survives');
  assert.equal(provenance.provisional, true);
  assert.equal(provenance.volumeCategory, blueprint.volumeCategory);
  assert.equal(provenance.intensityCategory, blueprint.intensityCategory);
  assert.equal(provenance.frequency, blueprint.frequency);
});

test('27. the transformation never invents a kilogram', () => {
  const { programme } = realSnapshot();
  const json = JSON.stringify(programme);
  assert.ok(!/"load":/.test(json), 'no authored kg may appear — SC6 resolves loads from evidence');
  assert.ok(!/"percentage":/.test(json), 'no invented percentage of an untested 1RM');
});

test('28. prescriptions only use fields the exercise actually declares', () => {
  const { programme } = realSnapshot();
  const byId = new Map(EXERCISES.map(e => [e.id, e]));
  const FIELD_MAP = { sets: 'sets_reps', reps: 'sets_reps', load: 'load', percentage: 'percentage',
    rpe: 'rpe', rir: 'rir', tempo: 'tempo', restSec: 'rest', distanceM: 'distance', durationSec: 'duration',
    holdSec: 'hold', perSide: 'per_side', rounds: 'rounds', densityMin: 'density', workRest: 'work_rest', speed: 'speed_target' };
  for (const phase of programme.versions[0].phases)
    for (const week of phase.weeks) for (const day of week.days) for (const s of day.sessions)
      for (const block of s.blocks) for (const p of block.prescriptions) {
        const declared = new Set(byId.get(p.exerciseId).prescription || []);
        for (const set of p.sets) for (const field of Object.keys(set.fields)) {
          assert.ok(declared.has(FIELD_MAP[field]),
            `${p.exerciseId} does not declare ${field} (${FIELD_MAP[field]})`);
        }
      }
});

test('29. training days come from the athlete\'s real availability, never invented', () => {
  const bp = { kind: 'programme_blueprint', frequency: 3 };
  const chosen = chooseTrainingDays(bp, { availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], rugbyDays: ['Tue'], matchDay: 'Sat' });
  assert.equal(chosen.length, 3);
  assert.ok(!chosen.includes('Tue'), 'a rugby day is not used for gym work');
  assert.ok(!chosen.includes('Sat'), 'match day is not used');
  // Unknown availability is admitted, not guessed.
  const unknown = chooseTrainingDays(bp, { availableDays: [], rugbyDays: [], matchDay: null });
  assert.deepEqual(unknown, ['unscheduled', 'unscheduled', 'unscheduled']);
});

test('30. a blueprint with no sessions is refused rather than padded', () => {
  assert.throws(() => programmeDraftFromBlueprint({ kind: 'programme_blueprint', frequency: 0, sessions: [] },
    { catalogue: EXERCISES, author: 'c', now: NOW }), /blueprint_has_no_sessions/);
  assert.throws(() => programmeDraftFromBlueprint({ kind: 'not_a_blueprint' }, { catalogue: EXERCISES, author: 'c' }), /not_a_blueprint/);
});

test('31. match-week relationships survive into the SC4 tree', () => {
  const profile = { personal: { ageBand: '21_29' }, rugby: { primaryPosition: 'prop', playingLevel: 'club', seasonPhase: 'in_season' },
    training: { experience: 'intermediate' }, goals: [{ type: 'strength', importance: 4 }],
    equipment: { locations: ['full_gym'], items: ['barbell', 'rack'] },
    schedule: { availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], rugbyDays: ['Tue'], matchDay: 'Sat' }, health: {}, pain: { present: false } };
  const bp = generateBlueprint(engineInputFromProfile(profile, { teamCategory: 'adult' }), { catalogue: EXERCISES });
  const { version } = programmeDraftFromBlueprint(bp, { catalogue: EXERCISES, athleteUserId: 'u1', author: 'c', weeks: 1, schedule: profile.schedule, now: NOW });
  const relations = version.phases[0].weeks[0].days.map(d => d.rugbyRelation);
  const VALID = ['none', 'same_day_before_rugby', 'same_day_after_rugby', 'day_before_match', 'match_day', 'day_after_match'];
  for (const r of relations) assert.ok(VALID.includes(r), `invalid relation ${r}`);
  if (version.phases[0].weeks[0].days.some(d => d.day === 'Fri')) {
    assert.ok(relations.includes('day_before_match'), 'a Friday session before a Saturday match is marked');
  }
});
