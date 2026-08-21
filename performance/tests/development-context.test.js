// CoachEasier Performance — development context tests (SC5).
// Run: node --test performance/tests/*.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { isYouthContext, resolveDevelopmentContext } from '../domain/development-context.js';
import { DEVELOPMENT_CONTEXTS } from '../types/coaching.js';

test('age band resolves context directly: U16, U18, adult', () => {
  assert.equal(resolveDevelopmentContext({ ageBand: 'under_16' }).context, 'youth_u16');
  assert.equal(resolveDevelopmentContext({ ageBand: '16_17' }).context, 'youth_u18');
  for (const band of ['18_20', '21_29', '30_34', '35_plus']) {
    assert.equal(resolveDevelopmentContext({ ageBand: band }).context, 'adult', band);
  }
});

test('U18 athlete in a senior team keeps youth safeguards (age outranks team)', () => {
  const r = resolveDevelopmentContext({ ageBand: '16_17', teamCategory: 'senior' });
  assert.equal(r.context, 'youth_u18');
  assert.equal(r.safeguardsActive, true);
  assert.ok(r.conflicts.includes('youth_age_in_senior_team'));
  assert.ok(r.flags.includes('development_context_conflict'));
  assert.ok(r.reasons.some((x) => x.code === 'ctx_conflict_youth_in_senior'));
});

test('adult registered with a youth team is classified from age, not team name', () => {
  const r = resolveDevelopmentContext({ ageBand: '21_29', teamCategory: 'u18' });
  assert.equal(r.context, 'adult');
  assert.equal(r.safeguardsActive, false);
  assert.ok(r.conflicts.includes('adult_in_youth_team'));
});

test('missing age falls back to structured team category with a review flag', () => {
  const r = resolveDevelopmentContext({ ageBand: null, teamCategory: 'u16' });
  assert.equal(r.context, 'youth_u16');
  assert.equal(r.source, 'team_category');
  assert.ok(r.flags.includes('missing_development_context'));
});

test('unknown age + senior team is NEVER silently adult', () => {
  const r = resolveDevelopmentContext({ ageBand: null, teamCategory: 'senior' });
  assert.equal(r.context, 'unknown');
  assert.equal(r.safeguardsActive, true, 'conservative safeguards stay on');
  assert.ok(r.flags.includes('missing_development_context'));
});

test('nothing known → unknown context, safeguards on, review requested', () => {
  const r = resolveDevelopmentContext({});
  assert.equal(r.context, 'unknown');
  assert.equal(r.youth, true);
  assert.ok(r.flags.includes('missing_development_context'));
});

test('"unknown" age-band answer is treated as unanswered, not as a band', () => {
  const r = resolveDevelopmentContext({ ageBand: 'unknown', teamCategory: 'u18' });
  assert.equal(r.context, 'youth_u18');
  assert.equal(r.source, 'team_category');
});

test('date of birth backfills a missing band deterministically', () => {
  const now = new Date('2026-08-04T00:00:00Z');
  const r = resolveDevelopmentContext({ dateOfBirth: '2012-01-15', now });
  assert.equal(r.context, 'youth_u16');
  assert.equal(r.source, 'age_band');
});

test('determinism: identical inputs produce byte-equal results', () => {
  const input = { ageBand: '16_17', teamCategory: 'senior' };
  assert.equal(JSON.stringify(resolveDevelopmentContext(input)), JSON.stringify(resolveDevelopmentContext(input)));
});

test('context registry is extensible and unknown maps to youth-safe', () => {
  assert.ok(DEVELOPMENT_CONTEXTS.some((c) => c.id === 'unknown' && c.youth === true));
  assert.equal(isYouthContext('unknown'), true);
  assert.equal(isYouthContext('adult'), false);
});
