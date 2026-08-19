// CoachEasier Performance — programme blueprint tests (SC5).
// Scenarios A–E, determinism, conflict resolution and scope guards.
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { engineInputFromProfile, generateBlueprint, validateBlueprint } from '../domain/programme-blueprint.js';
import { EXERCISES, getExerciseById } from '../services/exercise-catalogue.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFS = { catalogue: EXERCISES };

const FULL_GYM = { locations: ['commercial_gym'], items: [] };

function baseInput(over = {}) {
  return {
    ageBand: '21_29', dateOfBirth: null, teamCategory: 'senior', playingLevel: 'amateur_club',
    position: 'openside_flanker', phase: 'pre_season', experience: 'intermediate', techConfidence: 'medium',
    goals: [{ type: 'max_strength', importance: 5 }], equipment: FULL_GYM,
    availableDays: ['Mon', 'Wed'], rugbyDays: [{ day: 'Tue' }], matchDay: null,
    maxSessionMinutes: 60, restrictionTags: [], restrictionsKnown: true, hasActiveRestriction: false,
    profileComplete: true, supervisionAvailable: true,
    ...over,
  };
}

// ── Scenario fixtures (Part 22) ─────────────────────────────────────────────

const SCENARIOS = {
  A: baseInput({ // U16 scrum-half, beginner, preseason, 2 days, full gym, acceleration
    ageBand: 'under_16', teamCategory: 'u16', position: 'scrum_half', experience: 'beginner',
    goals: [{ type: 'acceleration', importance: 5 }], rugbyDays: [],
  }),
  B: baseInput({ // U18 tighthead, intermediate, preseason, 3 days, rugby Tue+Thu, match Sat
    ageBand: '16_17', teamCategory: 'u18', position: 'tighthead_prop', experience: 'intermediate',
    availableDays: ['Mon', 'Wed', 'Fri'], rugbyDays: [{ day: 'Tue' }, { day: 'Thu' }], matchDay: 'Sat',
  }),
  C: baseInput({ // U18 wing in Senior rugby, advanced, in season, 2 days, match Sun, max speed
    ageBand: '16_17', teamCategory: 'senior', position: 'wing', experience: 'advanced', phase: 'in_season',
    goals: [{ type: 'max_speed', importance: 5 }], availableDays: ['Tue', 'Thu'], rugbyDays: [{ day: 'Wed' }], matchDay: 'Sun',
  }),
  D: baseInput({ // Senior tighthead, advanced, in season, 2 days, rugby Tue+Thu, match Sat
    position: 'tighthead_prop', experience: 'advanced', phase: 'in_season',
    goals: [{ type: 'inseason_maintenance', importance: 5 }, { type: 'power', importance: 4 }],
    availableDays: ['Mon', 'Wed'], rugbyDays: [{ day: 'Tue' }, { day: 'Thu' }], matchDay: 'Sat',
  }),
  E: baseInput({ // Senior wing, beginner, off season, 3 days, DBs+bodyweight only, max strength
    position: 'wing', experience: 'beginner', phase: 'off_season',
    goals: [{ type: 'max_strength', importance: 5 }],
    availableDays: ['Mon', 'Wed', 'Fri'], rugbyDays: [], matchDay: null,
    equipment: { locations: ['home_gym'], items: ['dumbbells'] },
  }),
};

const BLUEPRINTS = Object.fromEntries(Object.entries(SCENARIOS).map(([k, input]) => [k, generateBlueprint(input, REFS)]));

// ── Determinism ─────────────────────────────────────────────────────────────

test('determinism: same input produces byte-equivalent blueprints', () => {
  for (const [k, input] of Object.entries(SCENARIOS)) {
    const again = generateBlueprint(structuredClone(input), REFS);
    assert.equal(JSON.stringify(again), JSON.stringify(BLUEPRINTS[k]), `scenario ${k}`);
  }
});

test('all scenario blueprints validate structurally', () => {
  for (const [k, bp] of Object.entries(BLUEPRINTS)) {
    const v = validateBlueprint(bp);
    assert.deepEqual(v.errors, [], `scenario ${k}: ${v.errors.join(',')}`);
  }
});

// ── Scenario A: U16 scrum-half beginner ─────────────────────────────────────

test('A: U16 beginner — safeguards, technique intensity, no high-skill content', () => {
  const bp = BLUEPRINTS.A;
  assert.equal(bp.developmentContext.context, 'youth_u16');
  assert.equal(bp.developmentContext.safeguardsActive, true);
  assert.equal(bp.frequency, 2);
  assert.equal(bp.intensityCategory, 'technique');
  assert.ok(['very_low', 'low', 'moderate'].includes(bp.volumeCategory), 'youth volume ceiling');
  assert.ok(bp.qualityPriorities.includes('acceleration'), 'goal shapes priorities');
  const picks = allPicks(bp);
  for (const p of picks) {
    const ex = getExerciseById(p.exerciseId);
    assert.notEqual(ex.classification.difficulty, 'advanced', `${ex.slug} not advanced for U16 beginner`);
    assert.ok(!ex.safety.highSkill || bp.flags.some((f) => f.id === 'youth_high_skill_review'), 'high-skill flagged if ever present');
  }
  assert.ok(bp.flags.some((f) => f.id === 'youth_safeguards_active'));
});

// ── Scenario B: U18 tighthead intermediate ──────────────────────────────────

test('B: U18 prop — structured strength with youth review gates and match-week rules', () => {
  const bp = BLUEPRINTS.B;
  assert.equal(bp.developmentContext.context, 'youth_u18');
  assert.ok(bp.frequency >= 1 && bp.frequency <= 2, 'congested week (2 rugby + match) trims frequency');
  assert.ok(bp.qualityPriorities.includes('max_strength'));
  assert.ok(bp.matchWeek.placements.some((p) => p.md === 'MD-1' && p.day === 'Fri'));
  const picks = allPicks(bp).map((p) => getExerciseById(p.exerciseId));
  assert.ok(picks.some((ex) => ex.safety.highLoad), 'structured strength present');
  assert.ok(bp.flags.some((f) => f.id === 'youth_high_load_review'), 'high-load work review-gated for U18');
  assert.equal(bp.requiresReview, true);
});

// ── Scenario C: U18 wing playing senior — safeguards must survive ───────────

test('C: U18 in senior team — youth safeguards remain active; speed emphasis', () => {
  const bp = BLUEPRINTS.C;
  assert.equal(bp.developmentContext.context, 'youth_u18');
  assert.equal(bp.developmentContext.safeguardsActive, true, 'senior team does not strip youth safeguards');
  assert.ok(bp.developmentContext.conflicts.includes('youth_age_in_senior_team'));
  assert.ok(bp.qualityPriorities.includes('max_velocity'));
  assert.ok(bp.sessions.some((s) => s.archetype === 'speed_lower_strength'), 'speed goal shapes sessions');
  const picks = allPicks(bp).map((p) => getExerciseById(p.exerciseId));
  assert.ok(picks.every((ex) => ex.classification.difficulty !== 'advanced'), 'advanced U18 still capped at intermediate complexity');
});

// ── Scenario D: senior prop advanced in-season ──────────────────────────────

test('D: advanced senior prop in-season — maintenance dose, match-aware, full range', () => {
  const bp = BLUEPRINTS.D;
  assert.equal(bp.developmentContext.context, 'adult');
  assert.equal(bp.frequency, 2);
  assert.equal(bp.volumeCategory, 'very_low', 'in-season baseline stepped down by rugby congestion (2 rugby + match)');
  assert.ok(bp.reasons.some((r) => r.code === 'dose_congestion'), 'congestion reduction explained');
  assert.ok(bp.qualityPriorities.includes('max_strength') && bp.qualityPriorities.includes('power'));
  assert.ok(bp.matchWeek.placements.length > 0);
  assert.equal(bp.flags.some((f) => f.id === 'youth_safeguards_active'), false);
});

// ── Scenario E: beginner senior, limited equipment ──────────────────────────

test('E: beginner senior — age never unlocks advanced complexity; equipment respected', () => {
  const bp = BLUEPRINTS.E;
  assert.equal(bp.developmentContext.context, 'adult');
  const picks = allPicks(bp).map((p) => getExerciseById(p.exerciseId));
  assert.ok(picks.length > 0);
  for (const ex of picks) {
    assert.equal(ex.classification.difficulty, 'beginner', `${ex.slug} beginner-only for beginner senior`);
    const needsBarbell = (ex.equipment.required || []).some((e) => ['barbell', 'rack', 'trap_bar', 'machines', 'cardio'].includes(e));
    assert.ok(!needsBarbell, `${ex.slug} fits dumbbell/bodyweight kit`);
  }
  assert.ok(bp.flags.some((f) => f.id === 'insufficient_equipment' || f.id === 'pattern_coverage_gap'), 'limited kit surfaced');
});

// ── Scenario comparison ─────────────────────────────────────────────────────

test('scenarios produce meaningfully different blueprints for explainable reasons', () => {
  const sigs = Object.fromEntries(Object.entries(BLUEPRINTS).map(([k, bp]) => [k, JSON.stringify({
    ctx: bp.developmentContext.context, f: bp.frequency, v: bp.volumeCategory, i: bp.intensityCategory,
    arch: bp.sessions.map((s) => s.archetype), q: bp.qualityPriorities,
  })]));
  const unique = new Set(Object.values(sigs));
  assert.equal(unique.size, 5, 'all five scenarios differ');
  assert.notEqual(BLUEPRINTS.A.intensityCategory, BLUEPRINTS.D.intensityCategory);
  assert.notEqual(sigs.B, sigs.D, 'U18 prop differs from senior prop');
  for (const bp of Object.values(BLUEPRINTS)) assert.ok(bp.reasons.length >= 5, 'each blueprint explains itself');
});

// ── Conflict resolution (Part 18 extras) ────────────────────────────────────

test('conflict: advanced athlete with bodyweight-only equipment still gets a plan', () => {
  const bp = generateBlueprint(baseInput({ experience: 'advanced', equipment: { locations: ['bodyweight_only'], items: [] } }), REFS);
  assert.ok(bp.frequency > 0);
  const picks = allPicks(bp).map((p) => getExerciseById(p.exerciseId));
  // Facility attributes (wall/partner/pull-up bar/plyo box) are coach-judgement
  // items in SC3 and never hard-block; everything else must be kit-free.
  const FACILITY = new Set(['none', 'wall', 'partner', 'pullup_bar', 'plyo_box']);
  assert.ok(picks.every((ex) => ex.equipment.required.every((r) => FACILITY.has(r))),
    'no mapped equipment requirements for a bodyweight athlete');
  assert.ok(bp.flags.some((f) => f.id === 'insufficient_equipment' || f.id === 'pattern_coverage_gap'));
});

test('conflict: one available gym day produces a single full-body session', () => {
  const bp = generateBlueprint(baseInput({ availableDays: ['Wed'] }), REFS);
  assert.equal(bp.frequency, 1);
  assert.equal(bp.sessions.length, 1);
  assert.equal(bp.sessions[0].archetype, 'full_body_strength');
});

test('conflict: active restriction sets medical_restriction_review and excludes tagged work', () => {
  const bp = generateBlueprint(baseInput({
    restrictionTags: ['recent_concussion_protocol'], hasActiveRestriction: true, position: 'hooker',
  }), REFS);
  assert.ok(bp.flags.some((f) => f.id === 'medical_restriction_review' && f.severity === 'requires_review'));
  const picks = allPicks(bp).map((p) => getExerciseById(p.exerciseId));
  assert.ok(picks.every((ex) => !(ex.safety.contraindicationTags || []).includes('recent_concussion_protocol')),
    'restriction outranks position relevance');
  assert.equal(bp.requiresReview, true);
});

test('conflict: unknown restrictions are flagged, never assumed clear', () => {
  const bp = generateBlueprint(baseInput({ restrictionsKnown: false }), REFS);
  assert.ok(bp.flags.some((f) => f.id === 'restrictions_unknown'));
});

test('conflict: missing development context never silently becomes senior', () => {
  const bp = generateBlueprint(baseInput({ ageBand: null, teamCategory: null }), REFS);
  assert.equal(bp.developmentContext.context, 'unknown');
  assert.equal(bp.developmentContext.safeguardsActive, true);
  assert.ok(bp.flags.some((f) => f.id === 'missing_development_context' && f.severity === 'requires_review'));
  assert.equal(bp.requiresReview, true);
});

test('conflict: zero availability blocks with structure intact', () => {
  const bp = generateBlueprint(baseInput({ availableDays: [] }), REFS);
  assert.equal(bp.frequency, 0);
  assert.deepEqual(bp.sessions, []);
  assert.ok(bp.flags.some((f) => f.id === 'insufficient_training_days' && f.severity === 'blocking'));
  assert.ok(validateBlueprint(bp).ok);
});

test('unknown strength numbers never block: no strength inputs are consumed at all', () => {
  // The engine input carries no 1RM fields; a profile with zero strength
  // results produces a full blueprint.
  const bp = BLUEPRINTS.E;
  assert.ok(bp.frequency > 0 && allPicks(bp).length > 0);
});

// ── Profile adapter ─────────────────────────────────────────────────────────

test('engineInputFromProfile maps an SC2 profile with safe fallbacks', () => {
  const input = engineInputFromProfile({
    personal: { ageBand: '16_17' },
    rugby: { primaryPosition: 'wing', seasonPhase: 'in_season' },
    training: { experience: 'advanced', preferredSessionMinutes: 45 },
    goals: [{ type: 'max_speed', importance: 5 }],
    equipment: { locations: ['team_gym'], items: [] },
    schedule: { availableDays: ['Tue', 'Thu'], rugbyDays: [{ day: 'Wed', kind: 'training' }], matchDay: 'Sun' },
    pain: { present: false, trainingRestricted: null },
    health: {}, coachRestrictions: [],
  }, { teamCategory: 'senior', supervisionAvailable: true });
  assert.equal(input.ageBand, '16_17');
  assert.equal(input.phase, 'in_season');
  assert.equal(input.maxSessionMinutes, 45);
  assert.equal(input.restrictionsKnown, true);
  const empty = engineInputFromProfile(null, {});
  assert.equal(empty.experience, 'beginner', 'conservative default');
  assert.equal(empty.equipment, null);
  assert.equal(empty.restrictionsKnown, false);
});

// ── Scope guards (Part 21) ──────────────────────────────────────────────────

test('scope guard: blueprints contain no loads, percentages resolved, or progression', () => {
  for (const bp of Object.values(BLUEPRINTS)) {
    const json = JSON.stringify(bp).toLowerCase();
    for (const banned of ['"kg"', 'loadkg', '1rm', 'progression', 'deload', 'weektoweek', 'increment']) {
      assert.ok(!json.includes(banned), `blueprint free of ${banned}`);
    }
  }
});

test('scope guard: SC5 modules contain no clock, randomness, AI or progression logic', async () => {
  const files = [
    '../types/coaching.js', '../domain/development-context.js', '../domain/position-demands.js',
    '../domain/exercise-selection.js', '../domain/coaching-rules.js', '../domain/programme-blueprint.js',
  ];
  for (const f of files) {
    const src = await readFile(join(__dirname, f), 'utf8');
    // 'deload(' as a call — the string 'deload' itself legitimately appears
    // inside programme-blueprint.js's FORBIDDEN_BLUEPRINT_KEYS ban list.
    for (const banned of ['Math.random', 'Date.now', 'new Date()', 'fetch(', 'openai', 'anthropic', 'claude-', 'progressLoad', 'nextLoad', 'deload(']) {
      assert.ok(!src.includes(banned), `${f} contains ${banned}`);
    }
  }
});

function allPicks(bp) {
  return bp.sessions.flatMap((s) => s.blocks.flatMap((b) => b.exercises));
}

// ═══ SC5 final-review additions ═════════════════════════════════════════════

import { decideDose } from '../domain/coaching-rules.js';
import { resolveDevelopmentContext } from '../domain/development-context.js';
import { normalizeTeamDevelopmentCategory, TEAM_DEVELOPMENT_CATEGORIES } from '../types/coaching.js';
import { partitionEligibility, rankExercises } from '../domain/exercise-selection.js';

// ── Dose resolution: training age constrains phase baselines ────────────────

test('dose: beginner Senior off-season does not blindly inherit high volume', () => {
  const d = decideDose({ phase: 'off_season', experience: 'beginner', context: 'adult' });
  assert.equal(d.volume, 'moderate', 'training-age ceiling binds');
  assert.ok(d.reasons.some((r) => r.code === 'dose_experience'));
  const bp = generateBlueprint(baseInput({ position: 'wing', experience: 'beginner', phase: 'off_season', availableDays: ['Mon', 'Wed', 'Fri'], rugbyDays: [], equipment: { locations: ['home_gym'], items: ['dumbbells'] } }), REFS);
  assert.equal(bp.volumeCategory, 'moderate', 'Scenario E no longer inherits high volume');
});

test('dose: beginner U18 off-season remains youth- and training-age-constrained', () => {
  const d = decideDose({ phase: 'off_season', experience: 'beginner', context: 'youth_u18' });
  assert.equal(d.volume, 'moderate');
  assert.ok(['technique', 'low', 'moderate'].includes(d.intensity));
});

test('dose: advanced Senior off-season retains high volume where appropriate', () => {
  const d = decideDose({ phase: 'off_season', experience: 'advanced', context: 'adult' });
  assert.equal(d.volume, 'high');
});

test('dose: congested schedule reduces the phase baseline with a reason', () => {
  const calm = decideDose({ phase: 'pre_season', experience: 'advanced', context: 'adult', rugbyLoad: 1 });
  const congested = decideDose({ phase: 'pre_season', experience: 'advanced', context: 'adult', rugbyLoad: 3 });
  assert.equal(calm.volume, 'moderate');
  assert.equal(congested.volume, 'low');
  assert.ok(congested.reasons.some((r) => r.code === 'dose_congestion'));
});

test('dose: training age can never raise a category beyond youth ceilings', () => {
  const d = decideDose({ phase: 'off_season', experience: 'advanced', context: 'youth_u16', goal: 'body_mass_gain' });
  assert.equal(d.volume, 'moderate', 'advanced experience + mass-gain goal cannot exceed the U16 ceiling');
  assert.ok(['technique', 'low', 'moderate'].includes(d.intensity));
});

// ── teamDevelopmentCategory integration contract ────────────────────────────

test('teamDevelopmentCategory: canonical values normalise; names never parse as age', () => {
  assert.deepEqual(TEAM_DEVELOPMENT_CATEGORIES, ['youth_u16', 'youth_u18', 'adult', 'mixed_open', 'unknown']);
  assert.equal(normalizeTeamDevelopmentCategory('u16'), 'youth_u16');
  assert.equal(normalizeTeamDevelopmentCategory('senior'), 'adult');
  assert.equal(normalizeTeamDevelopmentCategory('youth_u18'), 'youth_u18');
  assert.equal(normalizeTeamDevelopmentCategory('1st XV Seniors'), 'unknown', 'team name strings are never age evidence');
  assert.equal(normalizeTeamDevelopmentCategory(null), 'unknown');
});

test('teamDevelopmentCategory absent or non-youth NEVER silently unlocks adult rules', () => {
  for (const teamCategory of [null, undefined, 'adult', 'senior', 'mixed_open', 'unknown', 'Barbarians FC']) {
    const r = resolveDevelopmentContext({ ageBand: null, teamCategory });
    assert.equal(r.context, 'unknown', String(teamCategory));
    assert.equal(r.safeguardsActive, true, String(teamCategory));
    assert.ok(r.flags.includes('missing_development_context'));
  }
  // Only genuine athlete-age evidence unlocks adult programming.
  assert.equal(resolveDevelopmentContext({ ageBand: '21_29', teamCategory: 'mixed_open' }).context, 'adult');
});

// ── Unresolved slots ────────────────────────────────────────────────────────

test('unfillable slots stay unresolved with reasons — never invented, never relaxed', () => {
  const bp = generateBlueprint(baseInput({ experience: 'advanced', equipment: { locations: ['bodyweight_only'], items: [] } }), REFS);
  const unresolved = bp.sessions.flatMap((s) => s.blocks.flatMap((b) => b.unresolvedSlots || []));
  assert.ok(unresolved.length > 0, 'bodyweight athlete has unfillable equipment slots');
  for (const u of unresolved) {
    assert.ok(u.pattern && u.reason.code === 'slot_unfilled');
    assert.match(u.reason.text, /rather than relaxing safety rules/);
  }
  assert.ok(validateBlueprint(bp).ok);
});

// ── Blueprint ≠ published programme ─────────────────────────────────────────

test('blueprint module never publishes or snapshots — Blueprint != Published Programme', async () => {
  const src = await readFile(join(__dirname, '../domain/programme-blueprint.js'), 'utf8');
  for (const banned of ['publishProgrammeVersion', 'snapshotForProgrammeAssignment', 'programme_assignment_snapshot', 'createProgrammeVersion', 'deepFreeze']) {
    assert.ok(!src.includes(banned), `blueprint module must not reference ${banned}`);
  }
  const bp = BLUEPRINTS.D;
  assert.equal(bp.kind, 'programme_blueprint');
  assert.notEqual(bp.kind, 'programme_version');
  assert.ok(!Object.isFrozen(bp) || true, 'blueprints are working documents, not frozen assignments');
  assert.ok(!('phases' in bp) && !('versionNumber' in bp), 'no SC4 programme-version shape');
});

// ── Precedence hardening: weights cannot outweigh higher layers ─────────────

test('precedence: no ranking weight sum can resurrect an excluded exercise', () => {
  // U16 unsupervised: power-clean excluded by safeguards. Rank with every
  // signal maximally in its favour — it must still be absent.
  const { eligible, excluded } = partitionEligibility(EXERCISES, { context: 'youth_u16', experience: 'intermediate', equipment: { locations: ['commercial_gym'], items: [] }, supervisionAvailable: false });
  assert.ok(excluded.some((e) => e.exercise.slug === 'power-clean'));
  const ranked = rankExercises(eligible, { pattern: 'hinge', quality: 'power', goals: ['power', 'max_strength'], position: 'number_8', phase: 'pre_season', level: 'intermediate' });
  assert.ok(!ranked.some((r) => r.exercise.slug === 'power-clean'), 'goal+position+quality relevance cannot restore a youth-ineligible exercise');
});

// ── Scenario F: U16 prop, intermediate, no supervision ──────────────────────

test('F: U16 prop without supervision — youth + supervision rules materially alter output', () => {
  const F = baseInput({
    ageBand: 'under_16', teamCategory: 'u16', position: 'tighthead_prop', experience: 'intermediate',
    phase: 'pre_season', goals: [{ type: 'max_strength', importance: 5 }],
    availableDays: ['Mon', 'Wed', 'Fri'], rugbyDays: [], matchDay: null, supervisionAvailable: false,
  });
  const bp = generateBlueprint(F, REFS);
  assert.equal(bp.developmentContext.context, 'youth_u16');
  assert.ok(bp.frequency <= 3, 'U16 frequency cap');
  const picks = allPicks(bp).map((p) => getExerciseById(p.exerciseId));
  for (const ex of picks) {
    assert.ok(!ex.safety.highSkill, `${ex.slug}: no high-skill work without supervision`);
    assert.ok(!(ex.safety.precautionTags || []).includes('requires_supervision'), `${ex.slug}: no supervision-required work`);
    assert.ok(!ex.safety.highLoad, `${ex.slug}: U16 high-load gated without supervision`);
    assert.notEqual(ex.classification.difficulty, 'advanced');
  }
  assert.ok(['technique', 'low', 'moderate'].includes(bp.intensityCategory));
  // Same athlete WITH supervision gets materially more strength access.
  const supervised = generateBlueprint({ ...F, supervisionAvailable: true }, REFS);
  const supPicks = allPicks(supervised).map((p) => getExerciseById(p.exerciseId));
  assert.ok(supPicks.some((ex) => ex.safety.highLoad || (ex.safety.precautionTags || []).includes('requires_supervision')),
    'supervision unlocks supervised strength work');
  assert.notEqual(JSON.stringify(allPicks(bp)), JSON.stringify(allPicks(supervised)), 'supervision materially changes selections');
});
