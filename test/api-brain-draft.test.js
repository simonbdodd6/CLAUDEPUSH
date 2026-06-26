/**
 * api/brain-draft — Phase 0 integration test (stubbed infrastructure, no Redis).
 *
 * Proves the read-only Brain draft endpoint: deterministic XV from live-shaped Core data, no writes /
 * mutations, neutral DNA, and the feature-flag gates. Uses the canonical 24-player fixture re-shaped as
 * Core player_profiles; the data loaders + pipeline are injected so nothing touches Redis.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildBrainDraft, buildBrainProviders } from '../api/_brainProviders.js';
import { brainGloballyEnabled, teamFlagEnabled, brainEnabledForTeam } from '../api/_brainFlags.js';
import brainDraftHandler from '../api/brain-draft.js';
import { runBrainDryRun } from '../packages/brain-decision-planner/index.js';
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline } from '../packages/coach-intelligence/index.js';
import { createFullSquadScenario } from './fixtures/brain-regression-fixtures.js';

const ENGINES = { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline };
const TEAM = 'boitsfort-rfc';
const COACH = 'coach-demo';

// canonical 24 players, re-shaped as Core player_profiles + active team_members + availability
const corePlayers = createFullSquadScenario().squadLoader.getActivePlayers();
const PROFILES = corePlayers.map((p) => ({ id: p.id, userId: p.userId, displayName: p.displayName, position: p.position, teamId: TEAM }));
const MEMBERS = corePlayers.map((p) => ({ teamId: TEAM, userId: p.userId, status: 'active' }));
const AVAILABILITY = Object.fromEntries(corePlayers.map((p) => [p.userId, { response: 'available', userId: p.userId, respondedAt: '2026-06-25T00:00:00.000Z' }]));
const FIXTURES = [{ id: 'fix_1', opponent: 'Leinster', date: '2026-07-05', competition: 'AIL', venue: 'Home' }];

// stub deps — loaders return the source objects DIRECTLY (so any mutation would be caught), real pipeline
const stubDeps = (over = {}) => ({
  loadPlayerProfiles: async () => PROFILES,
  loadTeamMembers: async () => MEMBERS,
  loadAvailability: async () => AVAILABILITY,
  loadFixtures: async () => FIXTURES,
  runBrainDryRun,
  engines: ENGINES,
  ...over,
});

const ids = { coachId: COACH, teamId: TEAM, sessionId: 'game' };

// ── draft (flag-on path) ──────────────────────────────────────────────────────────────

test('produces a deterministic complete draft XV from Core-shaped data', () => {
  // (async via .then to keep node:test happy with a sync-style assertion block)
  return buildBrainDraft(ids, stubDeps()).then((body) => {
    assert.equal(body.draft, true);
    assert.equal(body.squad.startingXV.length, 15);
    assert.equal(body.squad.startingXV.filter((s) => s.status === 'filled').length, 15);
    assert.equal(body.verification.startingCount, 15);
    assert.ok(body.explanation && body.explanation.starters.length === 15);
    // M207 — readiness observer attached (everyone available, complete squad ⇒ READY)
    assert.equal(body.readiness.status, 'READY');
    assert.deepEqual(body.readiness.codes, []);
    assert.equal(body.readiness.metrics.squadComplete, true);
    assert.deepEqual(body.meta, { readOnly: true, preview: true, dnaApplied: false, intent: 'selection-preference', playerCount: 24, fixtureId: 'fix_1' });
  });
});

test('deterministic — repeated calls are byte-identical', async () => {
  const a = await buildBrainDraft(ids, stubDeps());
  const b = await buildBrainDraft(ids, stubDeps());
  assert.deepEqual(a, b);
});

test('read-only — never mutates the Core source data', async () => {
  const snapshot = JSON.stringify({ PROFILES, MEMBERS, AVAILABILITY, FIXTURES });
  await buildBrainDraft(ids, stubDeps());
  assert.equal(JSON.stringify({ PROFILES, MEMBERS, AVAILABILITY, FIXTURES }), snapshot);
});

test('providers are neutral-DNA in Phase 0 (no memories / tags)', async () => {
  const { squadLoader } = await buildBrainProviders(ids, stubDeps());
  assert.deepEqual(squadLoader.getCoachMemories(), []);
  assert.deepEqual(squadLoader.getPlayerTags(), {});
  assert.equal(squadLoader.getActivePlayers().length, 24);
});

test('no fixtures → 200-shaped body with reason, no squad', async () => {
  const body = await buildBrainDraft(ids, stubDeps({ loadFixtures: async () => [] }));
  assert.equal(body.squad, null);
  assert.equal(body.reason, 'no-fixture');
  assert.equal(body.meta.fixtureId, null);
  assert.equal(body.readiness.status, 'NO_SELECTION');   // M207 — readiness present even with no squad
});

test('tenant isolation — only the coach\'s team players are used', async () => {
  const otherTeam = MEMBERS.map((m) => ({ ...m, teamId: 'other-club' }));
  const { playerCount } = await buildBrainProviders(ids, stubDeps({ loadTeamMembers: async () => otherTeam }));
  assert.equal(playerCount, 0);   // no active members for boitsfort-rfc ⇒ no players
});

// ── feature flags ──────────────────────────────────────────────────────────────────────

test('brainGloballyEnabled reads BRAIN_ENABLED', () => {
  assert.equal(brainGloballyEnabled({ BRAIN_ENABLED: 'true' }), true);
  assert.equal(brainGloballyEnabled({ BRAIN_ENABLED: 'false' }), false);
  assert.equal(brainGloballyEnabled({}), false);   // unset ⇒ off (production default)
});

test('teamFlagEnabled requires the per-team flag', async () => {
  assert.equal(await teamFlagEnabled(TEAM, async () => ({ enabled: true })), true);
  assert.equal(await teamFlagEnabled(TEAM, async () => null), false);
  assert.equal(await teamFlagEnabled(TEAM, async () => ({ enabled: false })), false);
  assert.equal(await teamFlagEnabled('', async () => ({ enabled: true })), false);
});

test('brainEnabledForTeam requires BOTH global and per-team flags', async () => {
  assert.equal(await brainEnabledForTeam(TEAM, { env: { BRAIN_ENABLED: 'true' }, getFlag: async () => ({ enabled: true }) }), true);
  assert.equal(await brainEnabledForTeam(TEAM, { env: {}, getFlag: async () => ({ enabled: true }) }), false);          // global off
  assert.equal(await brainEnabledForTeam(TEAM, { env: { BRAIN_ENABLED: 'true' }, getFlag: async () => null }), false); // team off
});

// ── endpoint: flag off ⇒ unavailable (no auth / no Redis reached) ───────────────────────

function fakeRes() {
  return { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
}

test('handler returns 404 when BRAIN_ENABLED is off (production unchanged, no auth needed)', async () => {
  const prev = process.env.BRAIN_ENABLED;
  delete process.env.BRAIN_ENABLED;
  try {
    const res = fakeRes();
    await brainDraftHandler({ method: 'GET', query: {}, headers: {} }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  } finally {
    if (prev === undefined) delete process.env.BRAIN_ENABLED; else process.env.BRAIN_ENABLED = prev;
  }
});

test('handler rejects non-GET methods', async () => {
  const res = fakeRes();
  await brainDraftHandler({ method: 'POST', query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

// ── exports ──────────────────────────────────────────────────────────────────────────

test('exports exist', () => {
  assert.equal(typeof buildBrainDraft, 'function');
  assert.equal(typeof brainDraftHandler, 'function');
});
