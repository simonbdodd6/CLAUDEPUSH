// CoachEasier Performance — profile persistence seam tests (SC2).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialProfileState,
  normalizeProfile,
  normalizeProfileState,
  PROFILE_MIGRATIONS,
  PROFILE_STATE_VERSION,
  serializeProfileState,
} from '../services/athlete-profile-store.js';
import { createEmptyProfile } from '../domain/athlete-profile.js';
import { PROFILE_VERSION } from '../types/athlete-profile.js';

test('initial state: versioned, profile absent, onboarding at welcome', () => {
  const s = createInitialProfileState();
  assert.equal(s.stateVersion, PROFILE_STATE_VERSION);
  assert.equal(s.profile, null);
  assert.equal(s.onboarding.step, 'welcome');
  assert.deepEqual(s.wellnessLog, []);
});

test('round-trip: a saved state survives normalise unchanged in the fields that matter', () => {
  const s = createInitialProfileState();
  s.profile = createEmptyProfile({ userId: 'u1', now: '2026-08-01' });
  s.profile.rugby.primaryPosition = 'hooker';
  s.onboarding.step = 'training';
  s.onboarding.startedAt = '2026-08-01T10:00:00';
  const restored = normalizeProfileState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.profile.rugby.primaryPosition, 'hooker');
  assert.equal(restored.onboarding.step, 'training', 'resume lands on the saved step');
  assert.equal(restored.onboarding.startedAt, '2026-08-01T10:00:00');
});

test('malformed stored data fails safe to a fresh state', () => {
  for (const bad of [null, undefined, 'garbage', 42, [], { random: true }, { stateVersion: 'one' }]) {
    const s = normalizeProfileState(bad);
    assert.equal(s.stateVersion, PROFILE_STATE_VERSION, `fails safe for ${JSON.stringify(bad)}`);
    assert.equal(s.profile, null);
    assert.equal(s.onboarding.step, 'welcome');
  }
});

test('future-versioned state is refused, not guessed at', () => {
  const s = normalizeProfileState({ stateVersion: PROFILE_STATE_VERSION + 1, profile: { version: 99 } });
  assert.equal(s.profile, null);
  assert.equal(s.stateVersion, PROFILE_STATE_VERSION);
});

test('outdated state without a migration path fails safe', () => {
  const s = normalizeProfileState({ stateVersion: 0, profile: {} });
  assert.equal(s.profile, null, 'version 0 has no registered migration');
});

test('migration seam: a registered migration upgrades old state', () => {
  PROFILE_MIGRATIONS[0] = (old) => ({
    ...createInitialProfileState(),
    stateVersion: 1,
    onboarding: { step: 'rugby', startedAt: old.begunAt || null, completedAt: null, skippedSteps: [] },
  });
  try {
    const s = normalizeProfileState({ stateVersion: 0, begunAt: '2026-07-01' });
    assert.equal(s.stateVersion, PROFILE_STATE_VERSION);
    assert.equal(s.onboarding.step, 'rugby');
    assert.equal(s.onboarding.startedAt, '2026-07-01');
  } finally {
    delete PROFILE_MIGRATIONS[0];
  }
});

test('invalid onboarding step and skipped list are repaired', () => {
  const s = normalizeProfileState({
    stateVersion: 1,
    onboarding: { step: 'teleport', skippedSteps: ['strength', 'teleport', 42] },
  });
  assert.equal(s.onboarding.step, 'welcome');
  assert.deepEqual(s.onboarding.skippedSteps, ['strength']);
});

test('normalizeProfile drops unknown keys and fills missing sections', () => {
  const p = normalizeProfile({
    version: PROFILE_VERSION,
    rugby: { primaryPosition: 'lock', hacked: 'yes' },
    injected: { evil: true },
  });
  assert.equal(p.rugby.primaryPosition, 'lock');
  assert.ok(!('hacked' in p.rugby), 'unknown nested keys dropped');
  assert.ok(!('injected' in p), 'unknown top-level keys dropped');
  assert.ok(p.schedule && Array.isArray(p.schedule.availableDays), 'missing sections restored');
  assert.equal(p.pain.present, null);
});

test('normalizeProfile refuses non-objects and future versions', () => {
  assert.equal(normalizeProfile('x'), null);
  assert.equal(normalizeProfile([1]), null);
  assert.equal(normalizeProfile({ version: PROFILE_VERSION + 1 }), null);
  assert.equal(normalizeProfile({}), null, 'missing version treated as foreign');
});

test('wellness log survives normalisation, drops junk entries and stays capped', () => {
  const entries = Array.from({ length: 40 }, (_, i) => ({ date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`, scores: {} }));
  const s = normalizeProfileState({ stateVersion: 1, wellnessLog: [...entries, null, 'junk', 7] });
  assert.equal(s.wellnessLog.length, 30, 'capped at WELLNESS_LOG_MAX');
  assert.ok(s.wellnessLog.every((e) => e && typeof e === 'object'));
});

test('serializeProfileState returns plain JSON-safe data', () => {
  const s = createInitialProfileState();
  s.profile = createEmptyProfile({ userId: 'u1' });
  const out = serializeProfileState(s);
  assert.equal(typeof out, 'object');
  assert.equal(JSON.parse(JSON.stringify(out)).profile.userRef, 'u1');
});
