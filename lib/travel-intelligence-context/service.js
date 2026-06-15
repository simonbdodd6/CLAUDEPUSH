import { assertNoExactLocation, stableHash } from '../platform-kernel/index.js';
import {
  ACCOMMODATION_ENTITY_TYPE,
  CONTEXT_SCHEMA_VERSION,
  CONTEXT_VERSION_PREFIX,
  COVERAGE_LEVEL,
  DEFAULT_CONTEXT_OPTIONS,
  ENTITY_TYPE,
  EVIDENCE_SOURCE,
  ITINERARY_SOURCE_PLATFORM,
  MISSING_INFORMATION,
  RELATIONSHIP_TYPE,
  RISK_SEVERITY,
  RISK_SIGNAL,
  SPARSE_HISTORY_THRESHOLD,
  TIMELINE_IMPORTANCE,
} from './constants.js';
import { configurationError, validationError } from './errors.js';

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw validationError(`${field} is required`, { field });
  return value.trim();
}

// Backed by the platform kernel; preserves this module's exact error + message.
function assertNoLocationDeep(value) {
  return assertNoExactLocation(value, validationError, { label: 'Context output' });
}

function countBy(list, field) {
  const counts = {};
  for (const item of list) { const k = item[field]; counts[k] = (counts[k] ?? 0) + 1; }
  return Object.fromEntries(Object.keys(counts).sort().map(k => [k, counts[k]]));
}

function dedupEntities(list) {
  const map = new Map();
  for (const e of list) {
    const key = `${e.type}:${e.id}`;
    if (!map.has(key)) map.set(key, { type: e.type, id: e.id });
  }
  return [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || String(a.id).localeCompare(String(b.id)));
}

function maxIso(...values) {
  const present = values.filter(Boolean);
  if (!present.length) return null;
  return present.reduce((a, b) => (new Date(a) >= new Date(b) ? a : b));
}

function descByTimestamp(a, b) {
  return new Date(b.timestamp) - new Date(a.timestamp)
    || String(b.recordedAt ?? '').localeCompare(String(a.recordedAt ?? ''))
    || String(b.timelineEventId ?? '').localeCompare(String(a.timelineEventId ?? ''));
}

function coverageLevel(count) {
  if (!count) return COVERAGE_LEVEL.NONE;
  if (count < 3) return COVERAGE_LEVEL.SPARSE;
  if (count < 20) return COVERAGE_LEVEL.MODERATE;
  return COVERAGE_LEVEL.RICH;
}

function timelineEventRef(event) {
  return {
    timelineEventId: event.timelineEventId,
    eventType: event.eventType,
    sourcePlatform: event.sourcePlatform,
    sourceEntityId: event.sourceEntityId,
    tripId: event.tripId ?? null,
    timestamp: event.timestamp,
    importance: event.importance,
  };
}

export function createTravelIntelligenceContext(options = {}) {
  const identity = options.travellerIdentityPlatform;
  if (!identity || typeof identity.assertActiveTraveller !== 'function' || typeof identity.getTravellerView !== 'function') {
    throw configurationError('createTravelIntelligenceContext requires a travellerIdentityPlatform with assertActiveTraveller() and getTravellerView()');
  }
  const digitalTwin = options.travellerDigitalTwinPlatform ?? null;
  const timelinePlatform = options.travelTimelinePlatform ?? null;
  const relationshipGraph = options.travelRelationshipGraph ?? null;
  const memoryPlatform = options.travelMemoryPlatform ?? null;
  const preferencesPlatform = options.travellerPreferencesPlatform ?? null;
  const discoveryPlatform = options.companionDiscoveryPlatform ?? null;

  function resolveOptions(input = {}) {
    return { ...DEFAULT_CONTEXT_OPTIONS, ...input };
  }

  function systemActor(input = {}) {
    return input.actor ?? { id: 'travel-intelligence-context', type: 'SYSTEM' };
  }

  async function resolveValidatedTraveller(travellerIdentityId) {
    const id = assertNonEmptyString(travellerIdentityId, 'travellerIdentityId');
    await identity.assertActiveTraveller(id);
    return identity.getTravellerView(id);
  }

  // ---- section builders (operate on a resolved traveller) ----

  async function tripSection(traveller, opts) {
    const evidence = [];
    const missing = [];
    if (!timelinePlatform) {
      missing.push(MISSING_INFORMATION.TIMELINE_UNAVAILABLE);
      evidence.push({ source: EVIDENCE_SOURCE.TIMELINE, kind: 'timeline_events', available: false });
      return { currentTripContext: null, travelHistory: emptyHistory(), timelineHighlights: [], timelinePatterns: {}, events: [], evidence, missing, lastUpdated: null };
    }

    const events = await timelinePlatform.listByTraveller(traveller.travellerId, { limit: opts.timelineLimit, order: 'asc' });
    evidence.push({ source: EVIDENCE_SOURCE.TIMELINE, kind: 'timeline_events', available: true, count: events.length });
    if (events.length === 0) missing.push(MISSING_INFORMATION.NO_TIMELINE_EVENTS);

    // Per-trip rollup.
    const tripMap = new Map();
    for (const e of events) {
      if (!e.tripId) continue;
      const entry = tripMap.get(e.tripId) ?? { tripId: e.tripId, eventCount: 0, firstEventAt: e.timestamp, lastEventAt: e.timestamp };
      entry.eventCount += 1;
      entry.firstEventAt = maxIso(entry.firstEventAt, e.timestamp) === entry.firstEventAt && new Date(e.timestamp) < new Date(entry.firstEventAt) ? e.timestamp : (new Date(e.timestamp) < new Date(entry.firstEventAt) ? e.timestamp : entry.firstEventAt);
      entry.lastEventAt = maxIso(entry.lastEventAt, e.timestamp);
      tripMap.set(e.tripId, entry);
    }
    const trips = [...tripMap.values()].sort((a, b) => a.tripId.localeCompare(b.tripId));
    if (trips.length === 0) missing.push(MISSING_INFORMATION.NO_TRIPS);

    // Current trip = the one with the most recent activity (tie → tripId asc).
    let current = null;
    for (const t of trips) {
      if (!current || new Date(t.lastEventAt) > new Date(current.lastEventAt)
        || (t.lastEventAt === current.lastEventAt && t.tripId < current.tripId)) current = t;
    }
    const currentTripContext = current ? {
      trip: { type: ENTITY_TYPE.TRIP, id: current.tripId },
      eventCount: current.eventCount,
      firstEventAt: current.firstEventAt,
      lastEventAt: current.lastEventAt,
      highlights: events
        .filter(e => e.tripId === current.tripId && [TIMELINE_IMPORTANCE.HIGH, TIMELINE_IMPORTANCE.CRITICAL].includes(e.importance))
        .sort(descByTimestamp).slice(0, opts.highlightLimit).map(timelineEventRef),
    } : null;

    const travelHistory = {
      totalTrips: trips.length,
      totalEvents: events.length,
      firstEventAt: events.length ? events[0].timestamp : null,
      lastEventAt: events.length ? events[events.length - 1].timestamp : null,
      trips: trips.map(t => ({ trip: { type: ENTITY_TYPE.TRIP, id: t.tripId }, eventCount: t.eventCount, lastEventAt: t.lastEventAt })),
    };

    const timelineHighlights = events
      .filter(e => [TIMELINE_IMPORTANCE.HIGH, TIMELINE_IMPORTANCE.CRITICAL].includes(e.importance))
      .sort(descByTimestamp).slice(0, opts.highlightLimit).map(timelineEventRef);

    const timelinePatterns = {
      eventTypeDistribution: countBy(events, 'eventType'),
      importanceDistribution: countBy(events, 'importance'),
      sourcePlatformDistribution: countBy(events, 'sourcePlatform'),
    };

    return {
      currentTripContext,
      travelHistory,
      timelineHighlights,
      timelinePatterns,
      events,
      evidence,
      missing,
      lastUpdated: travelHistory.lastEventAt,
    };
  }

  function emptyHistory() {
    return { totalTrips: 0, totalEvents: 0, firstEventAt: null, lastEventAt: null, trips: [] };
  }

  async function relationshipSection(traveller, opts) {
    const evidence = [];
    const missing = [];
    if (!relationshipGraph) {
      missing.push(MISSING_INFORMATION.RELATIONSHIP_UNAVAILABLE);
      evidence.push({ source: EVIDENCE_SOURCE.RELATIONSHIP, kind: 'relationships', available: false });
      return {
        travelRelationships: { totalRelationships: 0, byType: {}, neighbourCount: 0, importantEntities: [] },
        companionsConnected: [], visitedDestinations: [], plannedDestinations: [], accommodationRefs: [],
        evidence, missing, lastUpdated: null,
      };
    }

    const rootEntity = { type: ENTITY_TYPE.TRAVELLER, id: traveller.travellerId };
    const rootKey = `${ENTITY_TYPE.TRAVELLER}:${traveller.travellerId}`;
    const graph = await relationshipGraph.queryEntityGraph(rootEntity, { depth: opts.graphDepth, direction: 'both' });
    const relationships = graph.relationships ?? [];
    const nodes = graph.nodes ?? [];
    evidence.push({ source: EVIDENCE_SOURCE.RELATIONSHIP, kind: 'relationships', available: true, count: relationships.length });
    if (relationships.length === 0) missing.push(MISSING_INFORMATION.NO_RELATIONSHIPS);

    const degree = new Map();
    for (const edge of relationships) {
      degree.set(edge.fromKey, (degree.get(edge.fromKey) ?? 0) + 1);
      degree.set(edge.toKey, (degree.get(edge.toKey) ?? 0) + 1);
    }
    const entityByKey = new Map();
    for (const node of nodes) entityByKey.set(`${node.entity.type}:${node.entity.id}`, node.entity);

    const typed = relationships
      .filter(edge => edge.fromKey === rootKey || edge.toKey === rootKey)
      .map(edge => ({
        entity: edge.fromKey === rootKey ? { type: edge.toType, id: edge.toId } : { type: edge.fromType, id: edge.fromId },
        relationshipType: edge.relationshipType,
      }));

    const companionsConnected = dedupEntities(typed
      .filter(t => [RELATIONSHIP_TYPE.TRAVELLED_WITH, RELATIONSHIP_TYPE.CONNECTED_TO].includes(t.relationshipType)
        || [ENTITY_TYPE.COMPANION, ENTITY_TYPE.TRAVELLER].includes(t.entity.type))
      .map(t => t.entity));
    const visitedDestinations = dedupEntities(typed.filter(t => t.relationshipType === RELATIONSHIP_TYPE.VISITED).map(t => t.entity));
    const plannedDestinations = dedupEntities(typed.filter(t => t.relationshipType === RELATIONSHIP_TYPE.PLANNED).map(t => t.entity));
    const accommodationRefs = dedupEntities(typed.filter(t => t.entity.type === ACCOMMODATION_ENTITY_TYPE).map(t => t.entity));

    const importantEntities = [...entityByKey.entries()]
      .filter(([key]) => key !== rootKey)
      .map(([key, entity]) => ({ entity: { type: entity.type, id: entity.id }, connectionCount: degree.get(key) ?? 0 }))
      .sort((a, b) => b.connectionCount - a.connectionCount
        || a.entity.type.localeCompare(b.entity.type) || String(a.entity.id).localeCompare(String(b.entity.id)))
      .slice(0, opts.highlightLimit);

    const latestCreatedAt = relationships.length
      ? relationships.map(e => e.createdAt).reduce((a, b) => (new Date(a) >= new Date(b) ? a : b)) : null;

    return {
      travelRelationships: {
        totalRelationships: relationships.length,
        byType: countBy(relationships, 'relationshipType'),
        neighbourCount: dedupEntities(typed.map(t => t.entity)).length,
        importantEntities,
      },
      companionsConnected,
      visitedDestinations,
      plannedDestinations,
      accommodationRefs,
      evidence,
      missing,
      lastUpdated: latestCreatedAt,
    };
  }

  async function memoryAndPreferenceSection(traveller, opts, viewOptions) {
    const evidence = [];
    const missing = [];
    let travelMemory = [];
    let memoryLastUpdated = null;

    if (!memoryPlatform) {
      missing.push(MISSING_INFORMATION.MEMORY_UNAVAILABLE);
      evidence.push({ source: EVIDENCE_SOURCE.MEMORY, kind: 'memories', available: false });
    } else {
      const memories = await memoryPlatform.listMemoriesForTraveller(traveller.travellerId, {});
      evidence.push({ source: EVIDENCE_SOURCE.MEMORY, kind: 'memories', available: true, count: memories.length });
      if (memories.length === 0) missing.push(MISSING_INFORMATION.NO_MEMORIES);
      travelMemory = [...memories]
        .sort((a, b) => String(a.key).localeCompare(String(b.key)) || String(a.value).localeCompare(String(b.value)))
        .slice(0, opts.memoryLimit)
        .map(m => ({
          memoryId: m.memoryId, key: m.key, value: m.value, polarity: m.polarity,
          origin: m.origin, confidence: m.confidence, decayScore: m.decayScore, locked: m.locked,
        }));
      memoryLastUpdated = memories.length
        ? memories.map(m => m.lastConfirmed ?? m.updatedAt).filter(Boolean).reduce((a, b) => (maxIso(a, b)), null) : null;
    }

    let travelPreferences = null;
    let preferencesLastUpdated = null;
    if (!preferencesPlatform) {
      missing.push(MISSING_INFORMATION.PREFERENCES_UNAVAILABLE);
      evidence.push({ source: EVIDENCE_SOURCE.PREFERENCE, kind: 'preferences', available: false });
    } else {
      let prefs = null;
      try {
        prefs = await preferencesPlatform.getPreferencesForTraveller(traveller.travellerId, systemActor(viewOptions));
      } catch (error) {
        prefs = null; // not found / inaccessible → treated as absent
      }
      if (!prefs) {
        missing.push(MISSING_INFORMATION.NO_PREFERENCES);
        evidence.push({ source: EVIDENCE_SOURCE.PREFERENCE, kind: 'preferences', available: false });
      } else {
        evidence.push({ source: EVIDENCE_SOURCE.PREFERENCE, kind: 'preferences', available: true, count: 1 });
        travelPreferences = projectPreferences(prefs);
        preferencesLastUpdated = prefs.updatedAt ?? null;
      }
    }

    return {
      travelMemory, travelPreferences, evidence, missing,
      lastUpdated: maxIso(memoryLastUpdated, preferencesLastUpdated),
      hasMemories: travelMemory.length > 0,
      hasPreferences: travelPreferences != null,
    };
  }

  function projectPreferences(prefs) {
    return {
      preferencesId: prefs.preferencesId,
      budgetLevel: prefs.budgetLevel,
      travelStyles: prefs.travelStyles ?? [],
      accommodationStyles: prefs.accommodationStyles ?? [],
      preferredActivityCategories: prefs.preferredActivityCategories ?? [],
      fitnessLevel: prefs.fitnessLevel,
      riskTolerance: prefs.riskTolerance,
      crowdTolerance: prefs.crowdTolerance,
      climatePreferences: prefs.climatePreferences ?? [],
      preferredTravelPace: prefs.preferredTravelPace,
      transportPreferences: prefs.transportPreferences ?? [],
      languages: prefs.languages ?? [],
      favouriteDestinations: prefs.favouriteDestinations ?? [],
      avoidedDestinations: prefs.avoidedDestinations ?? [],
      favouriteActivities: prefs.favouriteActivities ?? [],
      avoidedActivities: prefs.avoidedActivities ?? [],
      hasAccessibilityNeeds: Boolean((prefs.accessibilityRequirements?.requirements ?? []).length),
      hasDietaryNeeds: Boolean((prefs.foodPreferences?.dietaryNeeds ?? []).length),
    };
  }

  async function discoverySection(traveller) {
    const evidence = [];
    const missing = [];
    if (!discoveryPlatform) {
      missing.push(MISSING_INFORMATION.DISCOVERY_UNAVAILABLE);
      evidence.push({ source: EVIDENCE_SOURCE.DISCOVERY, kind: 'discovery_profile', available: false });
      return { discovery: null, evidence, missing, lastUpdated: null };
    }
    const profile = await discoveryPlatform.getProfileByTraveller(traveller.travellerId);
    if (!profile) {
      missing.push(MISSING_INFORMATION.NO_DISCOVERY_PROFILE);
      evidence.push({ source: EVIDENCE_SOURCE.DISCOVERY, kind: 'discovery_profile', available: false });
      return { discovery: null, evidence, missing, lastUpdated: null };
    }
    evidence.push({ source: EVIDENCE_SOURCE.DISCOVERY, kind: 'discovery_profile', available: true, count: 1 });
    return {
      discovery: {
        optedIn: profile.optedIn === true,
        visibility: profile.visibility,
        approximateArea: profile.approximateArea ?? null, // broad area only, never exact
        destinationId: profile.destinationId ?? null,
        statuses: [...(profile.statuses ?? [])].sort(),
      },
      evidence,
      missing,
      lastUpdated: profile.updatedAt ?? null,
    };
  }

  async function digitalTwinSummary(traveller, viewOptions) {
    if (!digitalTwin || typeof digitalTwin.getTravellerTwin !== 'function') {
      return { summary: null, evidence: [{ source: EVIDENCE_SOURCE.DIGITAL_TWIN, kind: 'digital_twin', available: false }], available: false };
    }
    const twin = await digitalTwin.getTravellerTwin(traveller.travellerId, { ...viewOptions, allowPartial: true });
    return {
      summary: { timelineSummary: twin.timelineSummary, relationshipSummary: twin.relationshipSummary },
      evidence: [{ source: EVIDENCE_SOURCE.DIGITAL_TWIN, kind: 'digital_twin', available: true }],
      available: true,
      lastUpdated: twin.lastUpdated ?? null,
    };
  }

  // ---- public services ----

  async function buildTravellerContext(travellerIdentityId) {
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    return {
      traveller,
      availableEvidence: [{ source: EVIDENCE_SOURCE.IDENTITY, kind: 'traveller', available: true }],
    };
  }

  async function buildTripContext(travellerIdentityId, viewOptions = {}) {
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    const opts = resolveOptions(viewOptions);
    const trip = await tripSection(traveller, opts);
    return {
      currentTripContext: trip.currentTripContext,
      travelHistory: trip.travelHistory,
      timelineHighlights: trip.timelineHighlights,
      travelPatterns: trip.timelinePatterns,
      availableEvidence: trip.evidence,
      missingInformation: [...trip.missing].sort(),
    };
  }

  async function buildRelationshipContext(travellerIdentityId, viewOptions = {}) {
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    const opts = resolveOptions(viewOptions);
    const rel = await relationshipSection(traveller, opts);
    return {
      travelRelationships: rel.travelRelationships,
      companions: rel.companionsConnected,
      visitedDestinations: rel.visitedDestinations,
      plannedDestinations: rel.plannedDestinations,
      availableEvidence: rel.evidence,
      missingInformation: [...rel.missing].sort(),
    };
  }

  async function buildMemoryContext(travellerIdentityId, viewOptions = {}) {
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    const opts = resolveOptions(viewOptions);
    const mem = await memoryAndPreferenceSection(traveller, opts, viewOptions);
    return {
      travelMemory: mem.travelMemory,
      travelPreferences: mem.travelPreferences,
      availableEvidence: mem.evidence,
      missingInformation: [...mem.missing].sort(),
    };
  }

  function computeRisk({ traveller, trip, rel, mem, timelineAvailable, relationshipAvailable }) {
    const signals = [];
    if (!traveller.verified) {
      signals.push({ code: RISK_SIGNAL.IDENTITY_UNVERIFIED, severity: RISK_SEVERITY.LOW, detail: 'Traveller identity is not verified', source: EVIDENCE_SOURCE.IDENTITY });
    }
    if (!mem.hasPreferences) {
      signals.push({ code: RISK_SIGNAL.MISSING_PREFERENCES, severity: RISK_SEVERITY.MEDIUM, detail: 'No traveller preferences on record', source: EVIDENCE_SOURCE.PREFERENCE });
    }
    if (timelineAvailable && trip.travelHistory.totalEvents < SPARSE_HISTORY_THRESHOLD) {
      signals.push({ code: RISK_SIGNAL.SPARSE_TRAVEL_HISTORY, severity: RISK_SEVERITY.LOW, detail: `Fewer than ${SPARSE_HISTORY_THRESHOLD} timeline events`, source: EVIDENCE_SOURCE.TIMELINE });
    }
    if (relationshipAvailable && rel.companionsConnected.length === 0) {
      signals.push({ code: RISK_SIGNAL.NO_TRAVEL_COMPANIONS, severity: RISK_SEVERITY.LOW, detail: 'No connected travel companions', source: EVIDENCE_SOURCE.RELATIONSHIP });
    }
    if (relationshipAvailable && rel.accommodationRefs.length === 0) {
      signals.push({ code: RISK_SIGNAL.NO_ACCOMMODATION, severity: RISK_SEVERITY.LOW, detail: 'No accommodation linked', source: EVIDENCE_SOURCE.RELATIONSHIP });
    }
    if (timelineAvailable && !trip.timelinePatterns.sourcePlatformDistribution?.[ITINERARY_SOURCE_PLATFORM]) {
      signals.push({ code: RISK_SIGNAL.NO_ITINERARY, severity: RISK_SEVERITY.LOW, detail: 'No itinerary activity on the timeline', source: EVIDENCE_SOURCE.TIMELINE });
    }
    return signals.sort((a, b) => a.code.localeCompare(b.code));
  }

  function computeMissing(sections) {
    const all = new Set();
    for (const list of sections) for (const code of list) all.add(code);
    // Placeholders the engine cannot verify from current ports — surfaced honestly.
    all.add(MISSING_INFORMATION.EMERGENCY_CONTACT_UNKNOWN);
    all.add(MISSING_INFORMATION.PASSPORT_INFORMATION_UNKNOWN);
    return [...all].sort();
  }

  function computeConfidence({ traveller, trip, rel, mem, discovery, timelineAvailable, relationshipAvailable }) {
    const present = [
      true, // identity always present
      timelineAvailable && trip.travelHistory.totalEvents > 0,
      relationshipAvailable && rel.travelRelationships.totalRelationships > 0,
      mem.hasMemories,
      mem.hasPreferences,
      discovery != null,
    ];
    const dataCompleteness = Math.round((present.filter(Boolean).length / present.length) * 100) / 100;
    const overall = dataCompleteness >= 0.66 ? 'high' : dataCompleteness >= 0.34 ? 'medium' : 'low';
    return {
      identityVerified: traveller.verified === true,
      hasTimeline: timelineAvailable && trip.travelHistory.totalEvents > 0,
      hasRelationships: relationshipAvailable && rel.travelRelationships.totalRelationships > 0,
      hasMemories: mem.hasMemories,
      hasPreferences: mem.hasPreferences,
      hasDiscoveryProfile: discovery != null,
      timelineCoverage: coverageLevel(trip.travelHistory.totalEvents),
      relationshipCoverage: coverageLevel(rel.travelRelationships.totalRelationships),
      memoryCoverage: coverageLevel(mem.travelMemory.length),
      dataCompleteness,
      overall,
    };
  }

  function sortEvidence(list) {
    return [...list].sort((a, b) => a.source.localeCompare(b.source) || String(a.kind).localeCompare(String(b.kind)));
  }

  async function buildEvidenceSummary(travellerIdentityId, viewOptions = {}) {
    const snapshot = await buildContextSnapshot(travellerIdentityId, viewOptions);
    return {
      availableEvidence: snapshot.availableEvidence,
      confidenceSignals: snapshot.confidenceSignals,
      generatedFrom: snapshot.generatedFrom,
    };
  }

  async function buildRiskSummary(travellerIdentityId, viewOptions = {}) {
    const snapshot = await buildContextSnapshot(travellerIdentityId, viewOptions);
    return { riskSignals: snapshot.riskSignals, missingInformation: snapshot.missingInformation };
  }

  /**
   * The full deterministic Travel Intelligence Context — composes every injected
   * platform into one read-only, reference-aware, evidence-tagged context.
   */
  async function buildContextSnapshot(travellerIdentityId, viewOptions = {}) {
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    const opts = resolveOptions(viewOptions);

    const trip = await tripSection(traveller, opts);
    const rel = await relationshipSection(traveller, opts);
    const mem = await memoryAndPreferenceSection(traveller, opts, viewOptions);
    const disc = await discoverySection(traveller);
    const twin = await digitalTwinSummary(traveller, viewOptions);

    const timelineAvailable = Boolean(timelinePlatform);
    const relationshipAvailable = Boolean(relationshipGraph);

    const generatedFrom = {
      identity: true,
      digitalTwin: twin.available,
      timeline: timelineAvailable,
      relationship: relationshipAvailable,
      memory: Boolean(memoryPlatform),
      preference: Boolean(preferencesPlatform),
      discovery: Boolean(discoveryPlatform),
    };

    const availableEvidence = sortEvidence([
      { source: EVIDENCE_SOURCE.IDENTITY, kind: 'traveller', available: true },
      ...trip.evidence, ...rel.evidence, ...mem.evidence, ...disc.evidence, ...twin.evidence,
    ]);

    const riskSignals = computeRisk({ traveller, trip, rel, mem, timelineAvailable, relationshipAvailable });
    const missingInformation = computeMissing([trip.missing, rel.missing, mem.missing, disc.missing]);
    const confidenceSignals = computeConfidence({ traveller, trip, rel, mem, discovery: disc.discovery, timelineAvailable, relationshipAvailable });

    const lastUpdated = maxIso(
      traveller.updatedAt, traveller.createdAt,
      trip.lastUpdated, rel.lastUpdated, mem.lastUpdated, disc.lastUpdated,
    );

    const travelPatterns = {
      ...trip.timelinePatterns,
      tripCount: trip.travelHistory.totalTrips,
      relationshipTypeDistribution: rel.travelRelationships.byType,
      visitedCount: rel.visitedDestinations.length,
      plannedCount: rel.plannedDestinations.length,
      companionCount: rel.companionsConnected.length,
      memoryCount: mem.travelMemory.length,
    };

    const context = {
      traveller,
      currentTripContext: trip.currentTripContext,
      travelHistory: trip.travelHistory,
      travelPreferences: mem.travelPreferences,
      travelMemory: mem.travelMemory,
      travelRelationships: rel.travelRelationships,
      timelineHighlights: trip.timelineHighlights,
      companions: { connected: rel.companionsConnected, discovery: disc.discovery },
      visitedDestinations: rel.visitedDestinations,
      plannedDestinations: rel.plannedDestinations,
      travelPatterns,
      riskSignals,
      missingInformation,
      availableEvidence,
      confidenceSignals,
      digitalTwinSummary: twin.summary,
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      generatedFrom,
      generatedAt: lastUpdated, // derived, never wall-clock
      lastUpdated,
    };

    // Deterministic content fingerprint — no wall-clock, stable for identical inputs.
    const signature = JSON.stringify({
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      travellerId: traveller.travellerId,
      generatedFrom,
      counts: {
        events: trip.travelHistory.totalEvents,
        relationships: rel.travelRelationships.totalRelationships,
        memories: mem.travelMemory.length,
        trips: trip.travelHistory.totalTrips,
        companions: rel.companionsConnected.length,
        preferences: mem.hasPreferences ? 1 : 0,
        discovery: disc.discovery ? 1 : 0,
      },
      lastUpdated,
    });
    context.contextVersion = `${CONTEXT_VERSION_PREFIX}:${stableHash(signature)}`;

    assertNoLocationDeep(context);
    return context;
  }

  return {
    createTravellerContext: buildContextSnapshot, // alias for clarity
    buildTravellerContext,
    buildTripContext,
    buildRelationshipContext,
    buildMemoryContext,
    buildEvidenceSummary,
    buildRiskSummary,
    buildContextSnapshot,
  };
}
