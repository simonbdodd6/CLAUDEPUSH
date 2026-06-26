// api/_brainProviders.js — READ-ONLY adapters from live Coach's Eye Core into the dormant Brain's
// M164/M167 providers, plus the draft orchestration. This is the ONLY Core-coupled Brain code.
//
// It performs NO writes, NO mutations, and NO recommendations of its own — it pre-fetches Core data
// (async), exposes it through the proven synchronous provider contracts, and runs the EXISTING Brain
// pipeline (runBrainDryRun, M178 → M170/M172/M184). Phase 0: neutral DNA (no coach memories / tags).
//
// All data loaders + the pipeline are injected via `deps` so this is fully testable with stubbed
// infrastructure (no Redis). Core never depends on this module; this module depends on Core (read-only)
// and on the Brain packages.
import { loadPlayerProfiles, loadTeamMembers } from './_identityStore.js';
import { loadAvailability } from './_availabilityStore.js';
import { kvGet } from './_kv.js';
import { key } from './_keys.js';
import { runBrainDryRun } from '../packages/brain-decision-planner/index.js';
import { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline, assessMatchReadiness } from '../packages/coach-intelligence/index.js';

const DEFAULT_INTENT = Object.freeze({ category: 'selection-preference', confidence: 0.7, matchedSignals: [] });

const DEFAULT_DEPS = Object.freeze({
  loadPlayerProfiles,
  loadTeamMembers,
  loadAvailability,
  loadFixtures: () => kvGet(key('fixtures')),
  runBrainDryRun,
  engines: { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline },
});

/** Active players for a team: profiles in the team whose member record is active. */
function activePlayers(profiles, members, teamId) {
  const active = new Set((Array.isArray(members) ? members : [])
    .filter((m) => m && m.teamId === teamId && m.status === 'active')
    .map((m) => m.userId));
  return (Array.isArray(profiles) ? profiles : [])
    .filter((p) => p && p.teamId === teamId && active.has(p.userId))
    .map((p) => ({ id: p.id, userId: p.userId, displayName: p.displayName, position: p.position }));
}

/** Re-key the availability object by userId and reduce to { response } (read-only). */
function availabilityByUserId(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (!v || typeof v !== 'object') continue;
    out[v.userId || k] = { response: v.response };
  }
  return out;
}

/** v1 "next fixture": earliest by (date, id) — deterministic, no clock. Override later (plan §16). */
function pickNextFixture(fixtures) {
  const list = (Array.isArray(fixtures) ? fixtures : []).filter((f) => f && f.id);
  if (!list.length) return null;
  const f = list.slice().sort((a, b) => {
    const da = String(a.date || ''); const db = String(b.date || '');
    if (da !== db) return da < db ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : 1;
  })[0];
  return { fixtureId: f.id, opponent: f.opponent || '', competition: f.competition || '', venue: f.venue || '', date: f.date || '' };
}

/** Build the synchronous M164/M167 providers over pre-fetched (read-only) Core data. */
export async function buildBrainProviders({ coachId, teamId, sessionId = 'game' }, deps = DEFAULT_DEPS) {
  const [profiles, members, rawAvailability, fixtures] = await Promise.all([
    deps.loadPlayerProfiles(),
    deps.loadTeamMembers(),
    deps.loadAvailability(sessionId),
    deps.loadFixtures(),
  ]);

  const players = activePlayers(profiles, members, teamId);
  const availability = availabilityByUserId(rawAvailability);
  const fixture = pickNextFixture(fixtures);

  const squadLoader = {
    getActivePlayers: () => players,
    getAvailabilityResponses: () => availability,
    getCoachMemories: () => [],      // Phase 0: no Core memory store ⇒ neutral DNA
    getPlayerTags: () => ({}),        // Phase 0: no Core tag store ⇒ neutral DNA
  };
  const decisionPlanSource = {
    getFixtureContext: () => ({ fixture, match: DEFAULT_INTENT }),
    getCoachIdentity: () => ({ coachId, clubId: teamId, tags: [] }),
  };
  return { squadLoader, decisionPlanSource, fixture, playerCount: players.length };
}

/** Compose the read-only draft response body (the JSON the endpoint returns). */
export async function buildBrainDraft({ coachId, teamId, sessionId = 'game' }, deps = DEFAULT_DEPS) {
  const providers = await buildBrainProviders({ coachId, teamId, sessionId }, deps);
  const meta = {
    readOnly: true,
    preview: true,
    dnaApplied: false,
    intent: DEFAULT_INTENT.category,
    playerCount: providers.playerCount,
    fixtureId: providers.fixture ? providers.fixture.fixtureId : null,
  };
  // the same availability the providers read — passed to the read-only readiness observer (M206)
  const availability = providers.squadLoader.getAvailabilityResponses();

  if (!providers.fixture) {
    const readiness = assessMatchReadiness({ squad: null, availability });
    return { draft: true, squad: null, explanation: null, verification: null, readiness, reason: 'no-fixture', meta };
  }
  const result = deps.runBrainDryRun(
    { squadLoader: providers.squadLoader, decisionPlanSource: providers.decisionPlanSource },
    { pipelineServices: deps.engines },
  );
  // M206 — observes the already-built squad; selects/recommends nothing
  const readiness = assessMatchReadiness({ squad: result.capstone.squad, explanation: result.explanation, availability });
  return { draft: true, squad: result.capstone.squad, explanation: result.explanation, verification: result.verification, readiness, meta };
}
