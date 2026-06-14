import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityPlatform } from '../lib/identity-platform/index.js';
import { IdentityPlatformSourceAdapter, createTravellerIdentityPlatform } from '../lib/traveller-identity-platform/index.js';
import { SOURCE_PLATFORM, TIMELINE_EVENT_TYPE, createTravelTimelinePlatform } from '../lib/travel-timeline-platform/index.js';
import { ENTITY_TYPE as G, RELATIONSHIP_TYPE as R, createTravelRelationshipGraph } from '../lib/travel-relationship-graph/index.js';
import { MEMORY_POLARITY, createTravelMemoryPlatform } from '../lib/travel-memory-platform/index.js';
import { createTravellerPreferencesPlatform } from '../lib/traveller-preferences-platform/index.js';
import { DISCOVERY_STATUS, createCompanionDiscoveryPlatform } from '../lib/companion-discovery-platform/index.js';
import { createTravelIntelligenceContext } from '../lib/travel-intelligence-context/index.js';
import { createTravelInsightEngine } from '../lib/travel-insight-engine/index.js';
import {
  CANDIDATE_PRIORITY,
  CANDIDATE_PRIORITY_RANK,
  CANDIDATE_TYPE,
  createTravelActionCandidateEngine,
} from '../lib/travel-action-candidate-engine/index.js';

const BANNED = ['lat', 'lng', 'latitude', 'longitude', 'coordinates', 'liveLocation', 'gps', 'geo'];
function scanLoc(v) {
  if (Array.isArray(v)) return v.some(scanLoc);
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => BANNED.includes(k) || scanLoc(x));
  return false;
}

async function buildInsightEngine({ rich = false } = {}) {
  const identityPlatform = createIdentityPlatform();
  const travellerIdentityPlatform = createTravellerIdentityPlatform({ identitySource: new IdentityPlatformSourceAdapter({ identityPlatform }) });
  const travelTimelinePlatform = createTravelTimelinePlatform();
  const travelRelationshipGraph = createTravelRelationshipGraph();
  const travelMemoryPlatform = createTravelMemoryPlatform();
  const travellerPreferencesPlatform = createTravellerPreferencesPlatform();
  const companionDiscoveryPlatform = createCompanionDiscoveryPlatform();

  const identity = await identityPlatform.createIdentity({ type: 'PERSON', roles: ['TRAVELLER'], publicProfile: { displayName: 'Mei', country: 'JP' } });
  const id = identity.id;
  const actor = { id, type: 'TRAVELLER' };

  if (rich) {
    const t = { type: G.TRAVELLER, id };
    await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: TIMELINE_EVENT_TYPE.TRIP_CREATED, sourcePlatform: SOURCE_PLATFORM.TRIP, sourceEntityId: 'trip_1', timestamp: '2026-07-01T00:00:00.000Z' });
    for (const n of [1, 2, 3]) await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: 'activity', sourcePlatform: SOURCE_PLATFORM.ACTIVITY, sourceEntityId: `a${n}`, timestamp: `2026-07-0${n + 1}T00:00:00.000Z` });
    for (const d of ['canggu', 'ubud', 'seminyak']) await travelRelationshipGraph.createRelationship({ from: t, to: { type: G.DESTINATION, id: d }, relationshipType: R.VISITED });
    await travelRelationshipGraph.createRelationship({ from: t, to: { type: G.ACCOMMODATION, id: 'acc_1' }, relationshipType: R.BOOKED });
    await travelRelationshipGraph.createRelationship({ from: t, to: { type: G.TRAVELLER, id: 'idn_friend' }, relationshipType: R.TRAVELLED_WITH });
    await travelMemoryPlatform.recordExplicitMemory({ travellerIdentityId: id, key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });
    await travelMemoryPlatform.recordExplicitMemory({ travellerIdentityId: id, key: 'activity', value: 'surfing', polarity: MEMORY_POLARITY.POSITIVE });
    await travellerPreferencesPlatform.createPreferences({ travellerIdentityId: id, budgetLevel: 'mid_range', avoidedActivities: ['surfing'] }, actor);
    await companionDiscoveryPlatform.createProfile({ travellerIdentityId: id, approximateArea: 'Canggu', statuses: [DISCOVERY_STATUS.LOOKING_FOR_SURFING], optedIn: true });
  }

  const allPorts = { travellerIdentityPlatform, travelTimelinePlatform, travelRelationshipGraph, travelMemoryPlatform, travellerPreferencesPlatform, companionDiscoveryPlatform };
  const ctx = createTravelIntelligenceContext(allPorts);
  const insightEngine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  return { id, insightEngine };
}

test('generates action candidates from insights, each citing its source', async () => {
  const { id, insightEngine } = await buildInsightEngine({ rich: true });
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const candidates = await engine.generateTravellerActionCandidates(id);
  const types = new Set(candidates.map(c => c.candidateType));

  assert.ok(candidates.length > 0);
  assert.ok(types.has(CANDIDATE_TYPE.REVIEW_DESTINATION_PATTERN));
  assert.ok(types.has(CANDIDATE_TYPE.REVIEW_MEMORY_PATTERN));
  assert.ok(types.has(CANDIDATE_TYPE.REVIEW_PREFERENCE_PATTERN));
  assert.ok(types.has(CANDIDATE_TYPE.REVIEW_COMPANION_OPPORTUNITY));
  for (const c of candidates) {
    assert.ok(c.actionCandidateId.startsWith('action_'));
    assert.equal(c.travellerIdentityId, id);
    assert.ok(c.sourceInsightIds.length >= 1);
    assert.equal(c.status, 'proposed'); // never executed/approved
    assert.ok(typeof c.approvalRequired === 'boolean');
    assert.ok(c.cooldownKey.startsWith('cooldown:'));
    assert.ok(c.dedupeKey.startsWith('dedupe:'));
  }
});

test('empty/sparse context proposes gap actions with approval flags, no invented actions', async () => {
  const { id, insightEngine } = await buildInsightEngine(); // no data
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const candidates = await engine.generateTravellerActionCandidates(id);
  const byType = new Map(candidates.map(c => [c.candidateType, c]));

  assert.ok(byType.has(CANDIDATE_TYPE.REVIEW_SAFETY_GAP));
  assert.ok(byType.has(CANDIDATE_TYPE.ADD_ACCOMMODATION));
  assert.ok(byType.has(CANDIDATE_TYPE.CREATE_ITINERARY));
  // High-impact types require approval.
  assert.equal(byType.get(CANDIDATE_TYPE.REVIEW_SAFETY_GAP).approvalRequired, true);
  assert.equal(byType.get(CANDIDATE_TYPE.ADD_ACCOMMODATION).approvalRequired, true);
  assert.equal(byType.get(CANDIDATE_TYPE.CREATE_ITINERARY).approvalRequired, true);
  // No pattern-review actions invented when there are no patterns.
  assert.ok(!byType.has(CANDIDATE_TYPE.REVIEW_DESTINATION_PATTERN));
  assert.ok(!byType.has(CANDIDATE_TYPE.REVIEW_MEMORY_PATTERN));
});

test('empty insight list yields no candidates', async () => {
  const { insightEngine } = await buildInsightEngine();
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  assert.deepEqual(engine.generateCandidatesFromInsights([]), []);
});

test('deterministic output with stable candidate ids', async () => {
  const { id, insightEngine } = await buildInsightEngine({ rich: true });
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const a = await engine.generateTravellerActionCandidates(id);
  const b = await engine.generateTravellerActionCandidates(id);
  assert.deepEqual(a, b);
});

test('evidence + context traceability', async () => {
  const { id, insightEngine } = await buildInsightEngine({ rich: true });
  const insights = await insightEngine.generateTravellerInsights(id);
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const candidates = engine.generateCandidatesFromInsights(insights);
  const insightIds = new Set(insights.map(i => i.insightId));
  for (const c of candidates) {
    assert.ok(c.sourceInsightIds.every(sid => insightIds.has(sid)));
    assert.equal(c.sourceContextVersion, insights[0].sourceContextVersion);
  }
});

test('severity maps to priority; safety is elevated', async () => {
  const { id, insightEngine } = await buildInsightEngine(); // emergency safety_gap (medium) present
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const candidates = await engine.generateTravellerActionCandidates(id);
  const safety = candidates.find(c => c.candidateType === CANDIDATE_TYPE.REVIEW_SAFETY_GAP);
  // medium-severity safety insight is elevated to high priority.
  assert.equal(safety.priority, CANDIDATE_PRIORITY.HIGH);
});

test('dedupe collapses same type+discriminator and merges provenance', async () => {
  const { insightEngine } = await buildInsightEngine();
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  // Two distinct preference_pattern insights -> same dedupeKey (discriminator = insightType).
  const base = {
    travellerIdentityId: 'idn_x', insightType: 'preference_pattern', severity: 'medium', confidence: 0.6,
    title: 'P', summary: 'pattern', evidenceRefs: [{ source: 'memory', kind: 'memories' }],
    riskSignals: [], missingSignals: [], sourceContextVersion: 'ctxv1:abc',
  };
  const out = engine.generateCandidatesFromInsights([
    { ...base, insightId: 'insight_a', confidence: 0.6 },
    { ...base, insightId: 'insight_b', confidence: 0.8 },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sourceInsightIds, ['insight_a', 'insight_b']);
  assert.equal(out[0].confidence, 0.8); // merged to the higher
});

test('cooldownKey excludes context version (stable across refreshes)', async () => {
  const { insightEngine } = await buildInsightEngine();
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const make = (ctxVersion) => engine.generateCandidatesFromInsights([{
    insightId: 'insight_a', travellerIdentityId: 'idn_x', insightType: 'safety_gap', severity: 'medium', confidence: 0.5,
    title: 'S', summary: 's', evidenceRefs: [], riskSignals: [], missingSignals: ['emergency_contact_unknown_placeholder'],
    sourceContextVersion: ctxVersion,
  }])[0];
  const c1 = make('ctxv1:aaaa');
  const c2 = make('ctxv1:bbbb');
  assert.equal(c1.cooldownKey, c2.cooldownKey); // cooldown stable across context versions
  assert.notEqual(c1.actionCandidateId, c2.actionCandidateId); // id is context-scoped
});

test('ranks by priority then confidence, and filters', async () => {
  const { id, insightEngine } = await buildInsightEngine();
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const candidates = await engine.generateTravellerActionCandidates(id);

  const ranked = engine.rankCandidates(candidates);
  for (let n = 1; n < ranked.length; n += 1) {
    const prev = CANDIDATE_PRIORITY_RANK[ranked[n - 1].priority];
    const cur = CANDIDATE_PRIORITY_RANK[ranked[n].priority];
    assert.ok(prev > cur || (prev === cur && ranked[n - 1].confidence >= ranked[n].confidence));
  }
  const needApproval = engine.filterCandidates(candidates, { approvalRequired: true });
  assert.ok(needApproval.every(c => c.approvalRequired === true));
  const high = engine.filterCandidates(candidates, { minPriority: CANDIDATE_PRIORITY.HIGH });
  assert.ok(high.every(c => CANDIDATE_PRIORITY_RANK[c.priority] >= CANDIDATE_PRIORITY_RANK.high));
});

test('explains a candidate by object or id and never claims execution', async () => {
  const { id, insightEngine } = await buildInsightEngine({ rich: true });
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const candidates = await engine.generateTravellerActionCandidates(id);

  const byObj = engine.explainCandidate(candidates[0]);
  assert.equal(byObj.actionCandidateId, candidates[0].actionCandidateId);
  assert.match(byObj.reasoning, /never executes/);
  const byId = engine.explainCandidate(candidates[0].actionCandidateId, { candidates });
  assert.deepEqual(byId, byObj);
  assert.throws(() => engine.explainCandidate('action_missing', { candidates }), err => err.code === 'CANDIDATE_NOT_FOUND');
});

test('output never contains exact-location fields; validates construction/input', async () => {
  const { id, insightEngine } = await buildInsightEngine({ rich: true });
  const engine = createTravelActionCandidateEngine({ travelInsightEngine: insightEngine });
  const candidates = await engine.generateTravellerActionCandidates(id);
  assert.equal(scanLoc(candidates), false);

  assert.throws(() => createTravelActionCandidateEngine({}), err => err.code === 'CONFIGURATION_ERROR');
  assert.throws(() => engine.generateCandidatesFromInsights(null), err => err.code === 'VALIDATION_FAILED');
  assert.throws(() => engine.generateCandidatesFromInsights([{ insightId: 'x' }]), err => err.code === 'VALIDATION_FAILED');
});
