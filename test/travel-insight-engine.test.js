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
import {
  INSIGHT_SEVERITY,
  INSIGHT_SEVERITY_RANK,
  INSIGHT_TYPE,
  createTravelInsightEngine,
} from '../lib/travel-insight-engine/index.js';

const BANNED = ['lat', 'lng', 'latitude', 'longitude', 'coordinates', 'liveLocation', 'gps', 'geo'];
function scanLoc(v) {
  if (Array.isArray(v)) return v.some(scanLoc);
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => BANNED.includes(k) || scanLoc(x));
  return false;
}

// Build M15 context engine + a traveller with optional rich data.
async function buildContextEngine({ rich = false } = {}) {
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
    // Timeline: 4 events, 'activity' dominant (3/4).
    await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: TIMELINE_EVENT_TYPE.TRIP_CREATED, sourcePlatform: SOURCE_PLATFORM.TRIP, sourceEntityId: 'trip_1', timestamp: '2026-07-01T00:00:00.000Z' });
    for (const n of [1, 2, 3]) {
      await travelTimelinePlatform.appendEvent({ travellerIdentityId: id, tripId: 'trip_1', eventType: 'activity', sourcePlatform: SOURCE_PLATFORM.ACTIVITY, sourceEntityId: `a${n}`, timestamp: `2026-07-0${n + 1}T00:00:00.000Z` });
    }
    // Graph: 3 visited destinations, accommodation, a companion.
    for (const d of ['canggu', 'ubud', 'seminyak']) {
      await travelRelationshipGraph.createRelationship({ from: t, to: { type: G.DESTINATION, id: d }, relationshipType: R.VISITED });
    }
    await travelRelationshipGraph.createRelationship({ from: t, to: { type: G.ACCOMMODATION, id: 'acc_1' }, relationshipType: R.BOOKED });
    await travelRelationshipGraph.createRelationship({ from: t, to: { type: G.TRAVELLER, id: 'idn_friend' }, relationshipType: R.TRAVELLED_WITH });
    // Memory: 2 high-confidence positives (one conflicts with avoided pref).
    await travelMemoryPlatform.recordExplicitMemory({ travellerIdentityId: id, key: 'cuisine', value: 'spicy', polarity: MEMORY_POLARITY.POSITIVE });
    await travelMemoryPlatform.recordExplicitMemory({ travellerIdentityId: id, key: 'activity', value: 'surfing', polarity: MEMORY_POLARITY.POSITIVE });
    // Preferences: avoids surfing -> conflicts with positive memory.
    await travellerPreferencesPlatform.createPreferences({ travellerIdentityId: id, budgetLevel: 'mid_range', avoidedActivities: ['surfing'] }, actor);
    // Discovery: opted in and looking.
    await companionDiscoveryPlatform.createProfile({ travellerIdentityId: id, approximateArea: 'Canggu', statuses: [DISCOVERY_STATUS.LOOKING_FOR_SURFING], optedIn: true });
  }

  const ctx = createTravelIntelligenceContext({
    travellerIdentityPlatform, travelTimelinePlatform, travelRelationshipGraph,
    travelMemoryPlatform, travellerPreferencesPlatform, companionDiscoveryPlatform,
  });
  return { id, ctx, identityPlatform, identityOnly: travellerIdentityPlatform };
}

test('generates insights from a full (rich) context', async () => {
  const { id, ctx } = await buildContextEngine({ rich: true });
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const insights = await engine.generateTravellerInsights(id);
  const types = new Set(insights.map(i => i.insightType));

  assert.ok(types.has(INSIGHT_TYPE.DESTINATION_PATTERN));
  assert.ok(types.has(INSIGHT_TYPE.MEMORY_PATTERN));
  assert.ok(types.has(INSIGHT_TYPE.PREFERENCE_PATTERN));
  assert.ok(types.has(INSIGHT_TYPE.COMPANION_OPPORTUNITY));
  assert.ok(types.has(INSIGHT_TYPE.TIMELINE_PATTERN));
  for (const i of insights) {
    assert.ok(i.insightId.startsWith('insight_'));
    assert.equal(i.travellerIdentityId, id);
    assert.ok(typeof i.confidence === 'number' && i.confidence >= 0 && i.confidence <= 1);
    assert.equal(i.status, 'active');
  }
});

test('partial context yields only gap/quality insights (no invented patterns)', async () => {
  const { id, identityOnly } = await buildContextEngine();
  const ctx = createTravelIntelligenceContext({ travellerIdentityPlatform: identityOnly });
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const insights = await engine.generateTravellerInsights(id);
  const types = new Set(insights.map(i => i.insightType));

  assert.ok(types.has(INSIGHT_TYPE.CONTEXT_QUALITY)); // low coverage
  for (const patternType of [INSIGHT_TYPE.DESTINATION_PATTERN, INSIGHT_TYPE.MEMORY_PATTERN, INSIGHT_TYPE.PREFERENCE_PATTERN, INSIGHT_TYPE.TIMELINE_PATTERN, INSIGHT_TYPE.RELATIONSHIP_PATTERN]) {
    assert.ok(!types.has(patternType), `must not invent ${patternType}`);
  }
});

test('empty context (all platforms, no data) yields gaps + placeholders only', async () => {
  const { id, ctx } = await buildContextEngine(); // not rich -> empty
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const insights = await engine.generateTravellerInsights(id);
  const types = new Set(insights.map(i => i.insightType));

  assert.ok(types.has(INSIGHT_TYPE.SAFETY_GAP)); // emergency contact placeholder
  assert.ok(types.has(INSIGHT_TYPE.PLANNING_GAP)); // no accommodation / itinerary
  assert.ok(types.has(INSIGHT_TYPE.MISSING_INFORMATION)); // passport / preferences
  assert.ok(!types.has(INSIGHT_TYPE.DESTINATION_PATTERN));
  assert.ok(!types.has(INSIGHT_TYPE.MEMORY_PATTERN));
});

test('output is deterministic and ids/sourceContextVersion stable', async () => {
  const { id, ctx } = await buildContextEngine({ rich: true });
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const a = await engine.generateTravellerInsights(id);
  const b = await engine.generateTravellerInsights(id);
  assert.deepEqual(a, b);
  // sourceContextVersion identical across insights from the same context.
  const versions = new Set(a.map(i => i.sourceContextVersion));
  assert.equal(versions.size, 1);
});

test('every insight is traceable to evidence and context version', async () => {
  const { id, ctx } = await buildContextEngine({ rich: true });
  const context = await ctx.buildContextSnapshot(id);
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const insights = engine.generateInsightsFromContext(context);

  for (const i of insights) {
    assert.equal(i.sourceContextVersion, context.contextVersion);
    assert.equal(i.createdFrom.contextVersion, context.contextVersion);
    for (const ref of i.evidenceRefs) assert.ok(typeof ref.source === 'string');
  }
});

test('output never contains exact-location fields', async () => {
  const { id, ctx } = await buildContextEngine({ rich: true });
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const insights = await engine.generateTravellerInsights(id);
  assert.equal(scanLoc(insights), false);
});

test('ranks by severity then confidence; filters by type/severity/confidence', async () => {
  const { id, ctx } = await buildContextEngine({ rich: true });
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const insights = await engine.generateTravellerInsights(id);

  const ranked = engine.rankInsights(insights);
  for (let n = 1; n < ranked.length; n += 1) {
    const prev = INSIGHT_SEVERITY_RANK[ranked[n - 1].severity];
    const cur = INSIGHT_SEVERITY_RANK[ranked[n].severity];
    assert.ok(prev > cur || (prev === cur && ranked[n - 1].confidence >= ranked[n].confidence));
  }

  const onlyPatterns = engine.filterInsights(insights, { insightType: INSIGHT_TYPE.DESTINATION_PATTERN });
  assert.ok(onlyPatterns.every(i => i.insightType === INSIGHT_TYPE.DESTINATION_PATTERN));

  const highish = engine.filterInsights(insights, { minSeverity: INSIGHT_SEVERITY.MEDIUM });
  assert.ok(highish.every(i => INSIGHT_SEVERITY_RANK[i.severity] >= INSIGHT_SEVERITY_RANK[INSIGHT_SEVERITY.MEDIUM]));

  const confident = engine.filterInsights(insights, { minConfidence: 0.7 });
  assert.ok(confident.every(i => i.confidence >= 0.7));
});

test('explains an insight deterministically by object or id', async () => {
  const { id, ctx } = await buildContextEngine({ rich: true });
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const insights = await engine.generateTravellerInsights(id);

  const byObject = engine.explainInsight(insights[0]);
  assert.equal(byObject.insightId, insights[0].insightId);
  assert.match(byObject.reasoning, new RegExp(insights[0].insightType));

  const byId = engine.explainInsight(insights[0].insightId, { insights });
  assert.deepEqual(byId, byObject);

  assert.throws(() => engine.explainInsight('insight_missing', { insights }), err => err.code === 'INSIGHT_NOT_FOUND');
});

test('validates construction and context input', async () => {
  assert.throws(() => createTravelInsightEngine({}), err => err.code === 'CONFIGURATION_ERROR');
  const { ctx } = await buildContextEngine();
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  assert.throws(() => engine.generateInsightsFromContext(null), err => err.code === 'VALIDATION_FAILED');
  assert.throws(() => engine.generateInsightsFromContext({ traveller: {} }), err => err.code === 'VALIDATION_FAILED');
});

test('conflicting preference/memory signal produces a preference_pattern insight', async () => {
  const { id, ctx } = await buildContextEngine({ rich: true });
  const engine = createTravelInsightEngine({ travelIntelligenceContext: ctx });
  const insights = await engine.generateTravellerInsights(id);
  const conflict = insights.find(i => i.insightType === INSIGHT_TYPE.PREFERENCE_PATTERN);
  assert.ok(conflict);
  assert.match(conflict.summary, /surfing/);
  assert.ok(conflict.evidenceRefs.some(e => e.source === 'memory'));
  assert.ok(conflict.evidenceRefs.some(e => e.source === 'preference'));
});
