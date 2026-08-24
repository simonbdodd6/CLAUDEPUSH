// CoachEasier Performance — minors gate on the restriction signal (interim).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  restrictionSignalAllowed, gateRestrictionSignal, authoringProfileFrom,
  YOUTH_AGE_BANDS, ADULT_AGE_BANDS, YOUTH_DEVELOPMENT_CATEGORIES,
  GATED_RESTRICTION_FIELDS,
} from '../domain/authoring-profile.js';
import { createEmptyProfile } from '../domain/athlete-profile.js';

const projection = (ageBand, restricted = true) => ({
  kind: 'authoring_profile', schemaVersion: 1, sport: 'rugby_union',
  personal: { ageBand },
  rugby: { primaryPosition: 'lock', playingLevel: 'club', seasonPhase: 'pre_season', matchDay: 'Sat' },
  training: { experience: 'beginner', techConfidence: 'developing' },
  equipment: { locations: ['full_gym'], items: [] },
  schedule: { availableDays: ['Mon'], rugbyDays: [], matchDay: 'Sat', maxSessionMinutes: null },
  goals: [{ type: 'strength', importance: 4 }],
  restrictions: { restrictionsKnown: true, trainingRestricted: restricted,
                  hasMovementRestrictions: restricted, coachRestrictionCount: 2 },
  profileComplete: true, status: 'active', updatedAt: '2026-08-24T09:00:00.000Z',
});

// ── The rule ────────────────────────────────────────────────────────────────

test('1. U16 and U18 athletes never carry the signal', () => {
  for (const band of YOUTH_AGE_BANDS) {
    assert.equal(restrictionSignalAllowed({ ageBand: band, developmentCategory: 'adult' }), false, band);
    const r = gateRestrictionSignal(projection(band), { developmentCategory: 'adult' }).restrictions;
    for (const f of GATED_RESTRICTION_FIELDS) assert.equal(r[f], false, `${band}: ${f} must be withheld`);
  }
});

test('2. an adult athlete is unaffected — the signal still travels', () => {
  for (const band of ADULT_AGE_BANDS) {
    assert.equal(restrictionSignalAllowed({ ageBand: band, developmentCategory: 'unknown' }), true, band);
    const r = gateRestrictionSignal(projection(band), { developmentCategory: 'unknown' }).restrictions;
    assert.equal(r.trainingRestricted, true, `${band} keeps the signal`);
    assert.equal(r.hasMovementRestrictions, true, `${band} keeps the movement signal`);
    assert.equal(r.restrictionsKnown, true, `${band} keeps restriction awareness`);
  }
});

test('3. a youth SQUAD classification withholds it even for an adult band', () => {
  for (const cat of YOUTH_DEVELOPMENT_CATEGORIES) {
    assert.equal(restrictionSignalAllowed({ ageBand: '21_29', developmentCategory: cat }), false, cat);
  }
  // Adult / mixed / unknown squads do not themselves withhold it.
  for (const cat of ['adult', 'mixed_open', 'unknown', null]) {
    assert.equal(restrictionSignalAllowed({ ageBand: '21_29', developmentCategory: cat }), true, String(cat));
  }
});

test('4. FAIL CLOSED — an unresolvable age band withholds it', () => {
  for (const band of [null, undefined, '', 'unknown', 'nonsense', 42, {}]) {
    assert.equal(restrictionSignalAllowed({ ageBand: band, developmentCategory: 'adult' }), false, String(band));
  }
  assert.equal(restrictionSignalAllowed({}), false, 'nothing resolved at all');
  assert.equal(restrictionSignalAllowed(), false);
  const r = gateRestrictionSignal(projection(null), {}).restrictions;
  for (const f of GATED_RESTRICTION_FIELDS) assert.equal(r[f], false, f);
});

test('5. group NAMES are never consulted — only the stored classification', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../domain/authoring-profile.js', import.meta.url), 'utf8');
  const code = src.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  for (const nameish of ["'U18'", "'U16'", 'groupName', '.name']) {
    assert.ok(!code.includes(nameish), `the gate must not consult ${nameish}`);
  }
  // A squad literally named "U18" but classified adult is treated as adult.
  assert.equal(restrictionSignalAllowed({ ageBand: '21_29', developmentCategory: 'adult' }), true);
});

// ── Shape safety ────────────────────────────────────────────────────────────

test('6. gating changes ONLY trainingRestricted — every other field is identical', () => {
  const before = projection('under_16');
  const after = gateRestrictionSignal(before, { developmentCategory: 'youth_u16' });
  for (const f of GATED_RESTRICTION_FIELDS) assert.equal(after.restrictions[f], false, f);
  // Same keys, same values everywhere else.
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  for (const k of Object.keys(before)) {
    if (k === 'restrictions') continue;
    assert.deepEqual(after[k], before[k], `${k} must be untouched`);
  }
  // coachRestrictionCount is the COACH's own data and must survive untouched.
  assert.equal(after.restrictions.coachRestrictionCount, before.restrictions.coachRestrictionCount,
    'a coach\'s own recorded restrictions are not the athlete\'s disclosure');
});

test('7. the KEY is preserved, not deleted — shape never varies by athlete', () => {
  const after = gateRestrictionSignal(projection('under_16'), { developmentCategory: 'youth_u16' });
  for (const f of GATED_RESTRICTION_FIELDS) {
    assert.ok(f in after.restrictions, `${f}: a missing key would itself signal a minor`);
    assert.equal(after.restrictions[f], false, f);
  }
});

test('8. an athlete who never set the flag is unchanged either way', () => {
  const adult = gateRestrictionSignal(projection('21_29', false), { developmentCategory: 'adult' });
  const minor = gateRestrictionSignal(projection('under_16', false), { developmentCategory: 'youth_u16' });
  assert.equal(adult.restrictions.trainingRestricted, false);
  assert.equal(minor.restrictions.trainingRestricted, false);
});

test('9. gating a null/absent projection does not throw', () => {
  assert.equal(gateRestrictionSignal(null, {}), null);
  assert.equal(gateRestrictionSignal(undefined, {}), undefined);
});

// ── End to end from a real SC2 profile ──────────────────────────────────────

test('10. a real U18 profile carrying pain produces a withheld projection', () => {
  const p = createEmptyProfile({ now: '2026-08-01T00:00:00.000Z' });
  p.personal.dateOfBirth = '2009-03-04';            // 16-17 at test date
  p.rugby.primaryPosition = 'hooker';
  p.training.experience = 'beginner';
  p.pain = { present: true, area: 'left knee', severity: 'moderate', note: 'sore', trainingRestricted: true };
  const ap = authoringProfileFrom(p, { now: new Date('2026-08-24') });
  assert.equal(ap.personal.ageBand, '16_17');
  assert.equal(ap.restrictions.trainingRestricted, true, 'the athlete\'s own projection still records it');
  const gated = gateRestrictionSignal(ap, { developmentCategory: 'youth_u18' });
  for (const f of GATED_RESTRICTION_FIELDS) assert.equal(gated.restrictions[f], false, `${f} withheld`);
  // And none of the pain detail was ever in the projection to begin with.
  const json = JSON.stringify(gated);
  for (const secret of ['left knee', 'sore', 'moderate', '2009-03-04']) {
    assert.ok(!json.includes(secret));
  }
});

// ── The gated set, and what stays outside it ────────────────────────────────

test('11. all three pain/health-derived fields are gated together', () => {
  assert.deepEqual([...GATED_RESTRICTION_FIELDS].sort(),
    ['hasMovementRestrictions', 'restrictionsKnown', 'trainingRestricted']);
  assert.ok(!GATED_RESTRICTION_FIELDS.includes('coachRestrictionCount'),
    'a coach\'s own recorded restrictions are their data, not the athlete\'s disclosure');
});

test('12. hasMovementRestrictions is withheld for minors and kept for adults', () => {
  const p = createEmptyProfile({ now: '2026-08-01T00:00:00.000Z' });
  p.rugby.primaryPosition = 'prop'; p.training.experience = 'beginner';
  p.health.movementsToAvoid = ['deep_knee_flexion'];
  p.health.physioInstructions = 'no deep squats';
  p.pain = { present: false, trainingRestricted: false };

  p.personal.ageBand = '16_17';
  const minor = gateRestrictionSignal(authoringProfileFrom(p, { now: new Date('2026-08-24') }),
    { developmentCategory: 'youth_u18' });
  assert.equal(minor.restrictions.hasMovementRestrictions, false, 'withheld for a U18 athlete');

  p.personal.ageBand = '21_29';
  const adult = gateRestrictionSignal(authoringProfileFrom(p, { now: new Date('2026-08-24') }),
    { developmentCategory: 'adult' });
  assert.equal(adult.restrictions.hasMovementRestrictions, true, 'unchanged for an adult');

  // Neither ever carried the underlying health detail.
  for (const out of [minor, adult]) {
    const json = JSON.stringify(out);
    assert.ok(!json.includes('deep_knee_flexion'));
    assert.ok(!json.includes('no deep squats'));
  }
});

test('13. restrictionsKnown withheld leaves SC5 conservative, not falsely reassured', async () => {
  const { engineInputFromAuthoringProfile } = await import('../domain/authoring-profile.js');
  const { generateBlueprint } = await import('../domain/programme-blueprint.js');
  const { EXERCISES } = await import('../services/exercise-catalogue.js');
  const p = createEmptyProfile({ now: '2026-08-01T00:00:00.000Z' });
  p.personal.ageBand = '16_17';
  p.rugby.primaryPosition = 'prop'; p.rugby.seasonPhase = 'pre_season';
  p.training.experience = 'beginner';
  p.equipment.locations = ['full_gym'];
  p.schedule.availableDays = ['Mon', 'Wed', 'Fri'];
  p.goals = [{ type: 'strength', importance: 4 }];
  p.pain = { present: false, trainingRestricted: false };   // athlete DID answer
  const gated = gateRestrictionSignal(authoringProfileFrom(p, { now: new Date('2026-08-24') }),
    { developmentCategory: 'youth_u18' });
  const input = engineInputFromAuthoringProfile(gated, { teamCategory: 'youth_u18' });
  assert.equal(input.restrictionsKnown, false);
  const bp = generateBlueprint(input, { catalogue: EXERCISES });
  const flags = bp.flags.map(f => f.id);
  assert.ok(flags.includes('restrictions_unknown'),
    'the coach is told to confirm rather than being told there is nothing to know');
  // A warning, not a publication blocker — the coach can still author.
  const sev = bp.flags.find(f => f.id === 'restrictions_unknown').severity;
  assert.equal(sev, 'warning');
  assert.ok(bp.frequency > 0, 'generation still works for the athlete');
});
