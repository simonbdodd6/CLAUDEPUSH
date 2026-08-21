// CoachEasier Performance — exercise eligibility & ranking tests (SC5).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { complexityCeiling, partitionEligibility, rankExercises, selectForSlot } from '../domain/exercise-selection.js';
import { EXERCISES, getExerciseBySlug } from '../services/exercise-catalogue.js';

const FULL_GYM = { locations: ['commercial_gym'], items: [] };
const adult = (over = {}) => ({ context: 'adult', experience: 'advanced', equipment: FULL_GYM, supervisionAvailable: true, ...over });

function excludedCodes(result, slug) {
  return result.excluded.filter((e) => e.exercise.slug === slug).map((e) => e.code);
}

// ── Complexity ceiling: dev context outranks experience ─────────────────────

test('complexity ceiling: youth caps outrank experience; seniors earn their ceiling', () => {
  assert.equal(complexityCeiling({ context: 'youth_u16', experience: 'advanced' }), 'intermediate', 'advanced U16 capped');
  assert.equal(complexityCeiling({ context: 'youth_u16', experience: 'beginner' }), 'beginner');
  assert.equal(complexityCeiling({ context: 'youth_u18', experience: 'advanced' }), 'intermediate');
  assert.equal(complexityCeiling({ context: 'adult', experience: 'beginner' }), 'beginner', 'beginner Senior stays beginner');
  assert.equal(complexityCeiling({ context: 'adult', experience: 'advanced' }), 'advanced');
  assert.equal(complexityCeiling({ context: 'unknown', experience: 'advanced' }), 'intermediate', 'unknown treated conservatively');
});

// ── Eligibility gates in precedence order ───────────────────────────────────

test('non-engine-eligible content is rejected first: draft, club, private, archived', () => {
  const r = partitionEligibility(EXERCISES, adult());
  for (const slug of ['sled-push-relay', 'club-prowler-gauntlet', 'coach-private-primer', 'yates-row']) {
    assert.deepEqual(excludedCodes(r, slug), ['excl_not_engine_eligible'], slug);
  }
  assert.ok(r.eligible.every((e) => e.tier === 'validated' && e.status === 'approved'));
});

test('active restriction tags exclude matching exercises (hard safety)', () => {
  const r = partitionEligibility(EXERCISES, adult({ restrictionTags: ['recent_concussion_protocol'] }));
  assert.ok(excludedCodes(r, 'partner-neck-iso').includes('excl_restriction'));
  assert.ok(excludedCodes(r, 'neck-iso-4way').includes('excl_restriction'));
  assert.ok(excludedCodes(r, 'contact-brace-iso').includes('excl_restriction'));
  assert.ok(!r.eligible.some((e) => e.slug === 'partner-neck-iso'));
});

test('restriction outranks position relevance and ranking (cannot be resurrected)', () => {
  const r = partitionEligibility(EXERCISES, adult({ restrictionTags: ['recent_concussion_protocol'] }));
  const ranked = rankExercises(r.eligible, { pattern: 'neck_flexion', position: 'hooker' });
  assert.ok(!ranked.some((x) => x.exercise.slug === 'partner-neck-iso'), 'excluded exercise never ranked');
});

test('youth suitability: needs_review/not_recommended content excluded for youth', () => {
  const r = partitionEligibility(EXERCISES, { context: 'youth_u16', experience: 'intermediate', equipment: FULL_GYM, supervisionAvailable: true });
  assert.ok(excludedCodes(r, 'neck-iso-4way').includes('excl_youth_suitability'), 'neck work needs_review for youth');
  assert.ok(excludedCodes(r, 'contact-brace-iso').includes('excl_youth_suitability'));
});

test('supervision: youth technique-gated lifts need supervision available', () => {
  const noSup = partitionEligibility(EXERCISES, { context: 'youth_u18', experience: 'advanced', equipment: FULL_GYM, supervisionAvailable: false });
  assert.ok(excludedCodes(noSup, 'back-squat').includes('excl_supervision'), 'supervised lift excluded without supervision');
  const withSup = partitionEligibility(EXERCISES, { context: 'youth_u18', experience: 'advanced', equipment: FULL_GYM, supervisionAvailable: true });
  assert.ok(withSup.eligible.some((e) => e.slug === 'back-squat'), 'available with supervision');
});

test('adult high-skill lifts require advanced experience or supervision', () => {
  const beginnerNoSup = partitionEligibility(EXERCISES, adult({ experience: 'beginner', supervisionAvailable: false }));
  assert.ok(excludedCodes(beginnerNoSup, 'power-clean').some((c) => c === 'excl_supervision' || c === 'excl_difficulty'));
  const adv = partitionEligibility(EXERCISES, adult({ supervisionAvailable: false }));
  assert.ok(adv.eligible.some((e) => e.slug === 'power-clean'), 'advanced adult may access high-skill work');
});

test('difficulty ceiling: beginner Senior never receives advanced exercises', () => {
  const r = partitionEligibility(EXERCISES, adult({ experience: 'beginner' }));
  assert.ok(r.eligible.every((e) => e.classification.difficulty === 'beginner'), 'beginner ceiling enforced');
  assert.ok(excludedCodes(r, 'nordic-curl').includes('excl_difficulty'));
});

test('equipment: bodyweight-only athletes lose barbell work with reasons', () => {
  const r = partitionEligibility(EXERCISES, adult({ equipment: { locations: ['bodyweight_only'], items: [] } }));
  assert.ok(excludedCodes(r, 'back-squat').includes('excl_equipment'));
  assert.ok(r.eligible.some((e) => e.slug === 'push-up'));
  assert.ok(r.eligible.some((e) => e.slug === 'bw-squat'));
});

test('unknown equipment falls back to conservative bodyweight assumptions', () => {
  const r = partitionEligibility(EXERCISES, adult({ equipment: null }));
  assert.ok(!r.eligible.some((e) => e.slug === 'back-squat'), 'no barbell assumed');
  assert.ok(r.eligible.some((e) => e.slug === 'bw-squat'));
  assert.ok(excludedCodes(r, 'nordic-curl').includes('excl_equipment'), 'partner drills excluded in solo conservative mode');
});

test('every exclusion carries a deterministic reason with text', () => {
  const r = partitionEligibility(EXERCISES, { context: 'youth_u16', experience: 'beginner', equipment: null, supervisionAvailable: false });
  for (const e of r.excluded) {
    assert.ok(e.code.startsWith('excl_'), e.exercise.slug);
    assert.ok(e.reason.text.length > 10, e.exercise.slug + ' has readable text');
  }
});

// ── Ranking ─────────────────────────────────────────────────────────────────

test('ranking is deterministic and returns reasons', () => {
  const { eligible } = partitionEligibility(EXERCISES, adult());
  const a = rankExercises(eligible, { pattern: 'hinge', goals: ['max_strength'], position: 'tighthead_prop', phase: 'pre_season', level: 'advanced' });
  const b = rankExercises(eligible, { pattern: 'hinge', goals: ['max_strength'], position: 'tighthead_prop', phase: 'pre_season', level: 'advanced' });
  assert.equal(JSON.stringify(a.map((x) => [x.exercise.id, x.score])), JSON.stringify(b.map((x) => [x.exercise.id, x.score])));
  assert.ok(a[0].reasons.length >= 2, 'top pick explains itself');
  assert.ok(a[0].reasons.every((x) => x.code && x.text));
});

test('pattern slots only rank exercises that satisfy the pattern', () => {
  const { eligible } = partitionEligibility(EXERCISES, adult());
  const ranked = rankExercises(eligible, { pattern: 'squat' });
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((x) => x.exercise.classification.pattern === 'squat' || (x.exercise.classification.secondaryPatterns || []).includes('squat')));
});

test('hinge slot for a strength-goal prop resolves a core barbell hinge with full reasons', () => {
  const { eligible } = partitionEligibility(EXERCISES, adult({ experience: 'intermediate' }));
  const ranked = rankExercises(eligible, { pattern: 'hinge', goals: ['max_strength'], position: 'tighthead_prop', phase: 'pre_season', level: 'intermediate' });
  // barbell-rdl, hip-thrust and trap-bar-deadlift tie on merit; the slug
  // tie-break makes the order deterministic with barbell-rdl first.
  assert.equal(ranked[0].exercise.slug, 'barbell-rdl');
  assert.deepEqual(ranked.slice(0, 3).map((x) => x.exercise.slug).sort(), ['barbell-rdl', 'hip-thrust', 'trap-bar-deadlift']);
  assert.ok(ranked[0].reasons.some((r) => r.code === 'rank_pattern'));
  assert.ok(ranked[0].reasons.some((r) => r.code === 'rank_goal'));
  assert.ok(ranked[0].reasons.some((r) => r.code === 'rank_position'));
});

test('unfillable slot result is null, never an invented exercise', () => {
  const { eligible } = partitionEligibility(EXERCISES, adult({ equipment: { locations: ['bodyweight_only'], items: [] } }));
  const pick = selectForSlot(eligible, { pattern: 'carry' }); // all carries need dumbbells
  assert.equal(pick, null);
});
