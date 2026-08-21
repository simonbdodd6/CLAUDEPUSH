// CoachEasier Performance — coaching rules tests (SC5).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARCHETYPE_PLANS, decideDose, decideFrequency, decideMatchWeekPlacement,
  decideSessionArchetypes, evaluatePatternCoverage, MATCH_WEEK_RULES, patternRequirements,
} from '../domain/coaching-rules.js';
import { adjustDemandsForAthlete, DEMAND_QUALITIES, getPositionDemands, POSITION_DEMANDS, topQualities } from '../domain/position-demands.js';
import { GOAL_QUALITY_MAP } from '../domain/position-demands.js';
import { MD_OFFSETS, outranks, PROVISIONAL, reason, RULE_PRECEDENCE, SESSION_ARCHETYPES } from '../types/coaching.js';
import { POSITION_DEMANDS_STATUS } from '../domain/position-demands.js';
import { COLLECTIONS } from '../services/exercise-collections-catalogue.js';
import { RUGBY_POSITION_IDS } from '../types/exercise.js';
import { PROGRAMME_GOALS } from '../types/programme.js';

// ── Precedence (Part 4) ─────────────────────────────────────────────────────

test('rule precedence is explicit, ordered and queryable', () => {
  assert.equal(RULE_PRECEDENCE[0], 'hard_safety_restrictions');
  assert.equal(RULE_PRECEDENCE[1], 'development_safeguards');
  assert.ok(outranks('hard_safety_restrictions', 'primary_goal'));
  assert.ok(outranks('development_safeguards', 'athlete_experience'));
  assert.ok(outranks('coach_restrictions', 'position_requirements'));
  assert.ok(!outranks('preferences', 'season_phase'));
});

// ── Frequency (Part 8) ──────────────────────────────────────────────────────

const DAYS = { 1: ['Mon'], 2: ['Mon', 'Thu'], 3: ['Mon', 'Wed', 'Fri'], 4: ['Mon', 'Tue', 'Thu', 'Fri'] };

test('frequency respects availability: 1–4 days', () => {
  for (const n of [1, 2, 3, 4]) {
    const r = decideFrequency({ availableDays: DAYS[n], phase: 'off_season', experience: 'advanced', context: 'adult' });
    assert.ok(r.frequency <= n, `never above availability (${n})`);
    assert.ok(r.frequency >= 1);
  }
  const four = decideFrequency({ availableDays: DAYS[4], phase: 'off_season', experience: 'advanced', context: 'adult' });
  assert.equal(four.frequency, 4, 'advanced adult off-season with 4 days gets 4');
});

test('zero availability blocks with a flag, never forces sessions', () => {
  const r = decideFrequency({ availableDays: [], phase: 'pre_season', experience: 'advanced', context: 'adult' });
  assert.equal(r.frequency, 0);
  assert.ok(r.flags.includes('insufficient_training_days'));
});

test('congested rugby week reduces S&C frequency with an explanation', () => {
  const r = decideFrequency({
    availableDays: DAYS[3], rugbyDays: [{ day: 'Tue' }, { day: 'Wed' }, { day: 'Thu' }], matchDay: 'Sat',
    phase: 'pre_season', experience: 'advanced', context: 'adult',
  });
  assert.equal(r.frequency, 1, '3 rugby + match leaves one S&C day');
  assert.ok(r.reasons.some((x) => x.code === 'freq_congestion'));
});

test('two matches in one week cap S&C at 1', () => {
  const r = decideFrequency({ availableDays: DAYS[3], matchDay: 'Sat', matchCount: 2, phase: 'in_season', experience: 'advanced', context: 'adult' });
  assert.equal(r.frequency, 1);
  assert.ok(r.reasons.some((x) => x.code === 'freq_two_matches'));
});

test('youth caps outrank experience; in-season tightens them', () => {
  const u16 = decideFrequency({ availableDays: DAYS[4], phase: 'off_season', experience: 'advanced', context: 'youth_u16' });
  assert.equal(u16.frequency, 3, 'U16 off-season cap');
  const u16in = decideFrequency({ availableDays: DAYS[4], phase: 'in_season', experience: 'advanced', context: 'youth_u16' });
  assert.equal(u16in.frequency, 2, 'U16 in-season cap');
  assert.ok(u16.reasons.some((x) => x.code === 'freq_youth_cap'));
});

test('no-match week keeps full availability usable', () => {
  const r = decideFrequency({ availableDays: DAYS[2], rugbyDays: [{ day: 'Tue' }], matchDay: null, phase: 'in_season', experience: 'intermediate', context: 'adult' });
  assert.equal(r.frequency, 2);
});

test('every frequency decision explains itself', () => {
  const r = decideFrequency({ availableDays: DAYS[2], phase: 'in_season', experience: 'beginner', context: 'adult' });
  assert.ok(r.reasons.length >= 1);
  assert.ok(r.reasons.every((x) => x.code && typeof x.text === 'string'));
});

// ── Dose categories ─────────────────────────────────────────────────────────

test('phases set the dose baseline; categories only, never numbers', () => {
  const off = decideDose({ phase: 'off_season', experience: 'advanced', context: 'adult' });
  assert.equal(off.volume, 'high');
  const taper = decideDose({ phase: 'taper', experience: 'advanced', context: 'adult' });
  assert.equal(taper.volume, 'very_low');
  for (const d of [off, taper]) {
    assert.equal(typeof d.volume, 'string');
    assert.equal(typeof d.intensity, 'string');
  }
});

test('U16 volume/intensity are capped; new athletes train at technique intensity', () => {
  const d = decideDose({ phase: 'off_season', experience: 'advanced', context: 'youth_u16' });
  assert.equal(d.volume, 'moderate', 'youth volume ceiling');
  assert.ok(['technique', 'low', 'moderate'].includes(d.intensity));
  const newbie = decideDose({ phase: 'pre_season', experience: 'new', context: 'adult' });
  assert.equal(newbie.intensity, 'technique');
});

test('U18 high intensity raises a youth_high_load_review flag', () => {
  const d = decideDose({ phase: 'peak', experience: 'advanced', context: 'youth_u18' });
  if (d.intensity === 'high') assert.ok(d.flags.includes('youth_high_load_review'));
});

test('return to general training is conservative and review-flagged', () => {
  const d = decideDose({ phase: 'return_to_general_training', experience: 'advanced', context: 'adult' });
  assert.equal(d.volume, 'low');
  assert.equal(d.intensity, 'low');
  assert.ok(d.flags.includes('return_to_general_training_review'));
});

// ── Match week (Part 9) ─────────────────────────────────────────────────────

test('MD-5 through MD+1 all resolve rules; heavy lower is protected near the match', () => {
  for (const md of MD_OFFSETS) assert.ok(MATCH_WEEK_RULES[md], md);
  assert.ok(MATCH_WEEK_RULES['MD-1'].avoid.includes('heavy_lower'));
  assert.ok(MATCH_WEEK_RULES['MD-1'].avoid.includes('high_speed_running'));
  assert.ok(MATCH_WEEK_RULES['MD-2'].avoid.includes('heavy_lower'));
  assert.ok(MATCH_WEEK_RULES['MD-3'].prefer.includes('heavy_lower'), 'last heavy lower day');
  assert.ok(MATCH_WEEK_RULES['MD+1'].prefer.includes('mobility'));
  assert.ok(MATCH_WEEK_RULES['MD'].prefer.includes('primer'));
});

test('placement maps a Saturday match onto the week deterministically', () => {
  const r = decideMatchWeekPlacement({ matchDay: 'Sat' });
  const byDay = Object.fromEntries(r.placements.map((p) => [p.day, p.md]));
  assert.equal(byDay.Sat, 'MD');
  assert.equal(byDay.Fri, 'MD-1');
  assert.equal(byDay.Thu, 'MD-2');
  assert.equal(byDay.Mon, 'MD-5');
  assert.equal(byDay.Sun, 'MD+1');
  assert.ok(r.placements.every((p) => p.reason.text.length > 0));
});

test('no match → no placement constraints', () => {
  assert.deepEqual(decideMatchWeekPlacement({ matchDay: null }).placements, []);
});

// ── Archetypes (Part 10) ────────────────────────────────────────────────────

test('archetype count always equals frequency and ids are registered', () => {
  const known = new Set(SESSION_ARCHETYPES.map((a) => a.id));
  for (let f = 1; f <= 4; f++) {
    for (const goal of [null, 'max_speed', 'conditioning', 'max_strength']) {
      const r = decideSessionArchetypes({ frequency: f, phase: 'pre_season', goal, context: 'adult' });
      assert.equal(r.archetypes.length, f);
      assert.ok(r.archetypes.every((a) => known.has(a)));
    }
  }
});

test('goal changes the archetype mix; U16 swaps complex power sessions out', () => {
  const speed = decideSessionArchetypes({ frequency: 2, phase: 'pre_season', goal: 'max_speed', context: 'adult' });
  assert.ok(speed.archetypes.includes('speed_lower_strength'));
  const adult3 = decideSessionArchetypes({ frequency: 3, phase: 'pre_season', goal: 'max_strength', context: 'adult' });
  assert.ok(adult3.archetypes.includes('power_strength'));
  const u16 = decideSessionArchetypes({ frequency: 3, phase: 'pre_season', goal: 'max_strength', context: 'youth_u16' });
  assert.ok(!u16.archetypes.includes('power_strength'), 'U16 gets technique-first structure');
});

test('every archetype has a block plan and referenced collections exist', () => {
  const colIds = new Set(COLLECTIONS.map((c) => c.id));
  for (const a of SESSION_ARCHETYPES) {
    const plan = ARCHETYPE_PLANS[a.id];
    assert.ok(Array.isArray(plan) && plan.length > 0, a.id);
    for (const block of plan) {
      if (block.collection) assert.ok(colIds.has(block.collection), `${a.id} → ${block.collection}`);
    }
  }
});

// ── Patterns (Part 11) ──────────────────────────────────────────────────────

test('weekly pattern requirements scale with frequency; goals add patterns', () => {
  const two = patternRequirements({ frequency: 2, goals: [], context: 'adult' });
  assert.ok(two.required.includes('squat') && two.required.includes('hinge'));
  const three = patternRequirements({ frequency: 3, goals: [], context: 'adult' });
  assert.ok(three.required.length > two.required.length);
  const speed = patternRequirements({ frequency: 2, goals: ['max_speed'], context: 'adult' });
  assert.ok(speed.required.includes('acceleration'));
});

test('neck/contact recommendation: forwards only, youth requires supervision', () => {
  const adultProp = patternRequirements({ frequency: 3, position: 'tighthead_prop', context: 'adult' });
  assert.ok(adultProp.recommended.includes('neck_flexion'));
  const youthNoSup = patternRequirements({ frequency: 3, position: 'tighthead_prop', context: 'youth_u16', supervisionAvailable: false });
  assert.ok(!youthNoSup.recommended.includes('neck_flexion'));
  const wing = patternRequirements({ frequency: 3, position: 'wing', context: 'adult' });
  assert.ok(!wing.recommended.includes('neck_flexion'));
});

test('coverage is evaluated across the week, not per session', () => {
  const req = patternRequirements({ frequency: 2, goals: [], context: 'adult' });
  const coverage = evaluatePatternCoverage(req, []);
  assert.deepEqual(coverage.covered, []);
  assert.ok(coverage.missing.length === req.required.length);
});

// ── Position demands (Part 5) ───────────────────────────────────────────────

test('every rugby position resolves a full, valid demand profile', () => {
  for (const pos of RUGBY_POSITION_IDS) {
    const d = getPositionDemands(pos);
    for (const q of DEMAND_QUALITIES) {
      assert.ok(Number.isInteger(d[q]) && d[q] >= 0 && d[q] <= 5, `${pos}.${q}`);
    }
  }
  assert.equal(POSITION_DEMANDS_STATUS, PROVISIONAL, 'weights are marked provisional');
});

test('positions differ meaningfully: props vs wings', () => {
  const prop = POSITION_DEMANDS.tighthead_prop;
  const wing = POSITION_DEMANDS.wing;
  assert.ok(prop.max_strength > wing.max_strength);
  assert.ok(wing.max_velocity > prop.max_velocity);
  assert.ok(prop.neck_capacity > wing.neck_capacity);
});

test('position is a prior, not a verdict: goals override stereotypes', () => {
  const prop = getPositionDemands('tighthead_prop');
  const { demands, boosted } = adjustDemandsForAthlete(prop, [{ type: 'acceleration', importance: 5 }]);
  assert.ok(boosted.includes('acceleration'));
  assert.ok(demands.acceleration >= 4, 'prop with acceleration goal gets real acceleration emphasis');
  assert.ok(topQualities(demands, 6).includes('acceleration'));

  const wing = getPositionDemands('wing');
  const strong = adjustDemandsForAthlete(wing, [{ type: 'max_strength', importance: 5 }]);
  assert.ok(strong.demands.max_strength >= 4, 'wing with strength goal gets strength emphasis');
  assert.ok(topQualities(strong.demands, 6).includes('max_strength'));
});

test('every supported goal maps to valid demand qualities', () => {
  for (const goal of PROGRAMME_GOALS) {
    assert.ok(goal in GOAL_QUALITY_MAP, goal);
    for (const q of GOAL_QUALITY_MAP[goal]) assert.ok(DEMAND_QUALITIES.includes(q), `${goal} → ${q}`);
  }
});

// ── Reason machinery ────────────────────────────────────────────────────────

test('reason() is deterministic and rejects unknown codes', () => {
  const a = reason('freq_available_days', { frequency: 2, available: 2 });
  const b = reason('freq_available_days', { frequency: 2, available: 2 });
  assert.deepEqual(a, b);
  assert.match(a.text, /2 sessions selected because the athlete has 2 available gym days/);
  assert.throws(() => reason('made_up_code', {}), /unknown_reason_code/);
});
