import {
  COMPANION_ENTITY_TYPES,
  COMPANION_RELATIONSHIP_TYPES,
  DEFAULT_TWIN_OPTIONS,
  DESTINATION_ENTITY_TYPES,
  DESTINATION_RELATIONSHIP_TYPES,
  ENTITY_TYPE,
  MISSING_SIGNAL,
  RELATIONSHIP_TYPE,
  RISK_SEVERITY,
  RISK_SIGNAL,
  TIMELINE_EVENT_TYPE,
  TIMELINE_IMPORTANCE,
  TIMELINE_STATUS,
} from './constants.js';
import { configurationError, validationError } from './errors.js';

const EXACT_LOCATION_FIELDS = [
  'coordinates', 'coordinate', 'lat', 'lng', 'latitude', 'longitude',
  'exactLocation', 'liveLocation', 'travellerLocation', 'currentLocation', 'gps', 'geo',
];

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

// Defensive: the twin must never surface an exact-location field, even if a
// future upstream change tried to leak one through metadata.
function assertNoLocationDeep(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoLocationDeep);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (EXACT_LOCATION_FIELDS.includes(key)) {
        throw validationError(`Digital twin output must not include exact location field: ${key}`, { field: key });
      }
      assertNoLocationDeep(nested);
    }
  }
}

function assertCleanOutput(view) {
  assertNoLocationDeep(view);
  return view;
}

function countBy(list, field) {
  const counts = {};
  for (const item of list) {
    const key = item[field];
    counts[key] = (counts[key] ?? 0) + 1;
  }
  // Deterministic key order.
  return Object.fromEntries(Object.keys(counts).sort().map(key => [key, counts[key]]));
}

function dedupEntities(list) {
  const map = new Map();
  for (const entity of list) {
    const key = `${entity.type}:${entity.id}`;
    if (!map.has(key)) map.set(key, { type: entity.type, id: entity.id }); // references only
  }
  return [...map.values()].sort((a, b) =>
    a.type.localeCompare(b.type) || String(a.id).localeCompare(String(b.id)));
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

function emptyTimelineProjection() {
  return {
    available: false,
    summary: { totalEvents: 0, byType: {}, byImportance: {}, sourcePlatforms: [], firstEventAt: null, lastEventAt: null },
    recent: [],
    tripRefs: [],
    memories: [],
    recommendations: [],
    latestTimestamp: null,
    totalEvents: 0,
    hasCritical: false,
    hasRedacted: false,
  };
}

function emptyGraphProjection() {
  return {
    available: false,
    summary: { totalRelationships: 0, byType: {}, neighbourCount: 0, entityTypeCounts: {} },
    importantEntities: [],
    companions: [],
    destinations: [],
    memories: [],
    recommendations: [],
    tripRefs: [],
    latestCreatedAt: null,
    totalRelationships: 0,
  };
}

export function createTravellerDigitalTwinPlatform(options = {}) {
  const travellerIdentityPlatform = options.travellerIdentityPlatform;
  if (!travellerIdentityPlatform
    || typeof travellerIdentityPlatform.assertActiveTraveller !== 'function'
    || typeof travellerIdentityPlatform.getTravellerView !== 'function') {
    throw configurationError('createTravellerDigitalTwinPlatform requires a travellerIdentityPlatform with assertActiveTraveller() and getTravellerView()');
  }
  const travelTimelinePlatform = options.travelTimelinePlatform ?? null;
  if (travelTimelinePlatform && typeof travelTimelinePlatform.listByTraveller !== 'function') {
    throw configurationError('travelTimelinePlatform must expose listByTraveller()');
  }
  const travelRelationshipGraph = options.travelRelationshipGraph ?? null;
  if (travelRelationshipGraph && typeof travelRelationshipGraph.queryEntityGraph !== 'function') {
    throw configurationError('travelRelationshipGraph must expose queryEntityGraph()');
  }

  function resolveOptions(input = {}) {
    return { ...DEFAULT_TWIN_OPTIONS, ...input };
  }

  // assertActiveTraveller BEFORE building any view, then fetch the canonical view.
  async function resolveValidatedTraveller(travellerIdentityId) {
    const id = assertNonEmptyString(travellerIdentityId, 'travellerIdentityId');
    await travellerIdentityPlatform.assertActiveTraveller(id);
    return travellerIdentityPlatform.getTravellerView(id);
  }

  async function buildTimelineProjection(travellerIdentityId, opts) {
    const events = await travelTimelinePlatform.listByTraveller(travellerIdentityId, {
      limit: opts.timelineLimit,
      order: 'asc',
    });
    const totalEvents = events.length;
    const recent = [...events].sort(descByTimestamp).slice(0, opts.recentLimit);
    const tripRefs = dedupEntities(events.filter(e => e.tripId).map(e => ({ type: ENTITY_TYPE.TRIP, id: e.tripId })));
    const memories = dedupEntities(events
      .filter(e => e.eventType === TIMELINE_EVENT_TYPE.MEMORY_CREATED)
      .map(e => ({ type: ENTITY_TYPE.MEMORY, id: e.sourceEntityId })));
    const recommendations = dedupEntities(events
      .filter(e => e.eventType === TIMELINE_EVENT_TYPE.RECOMMENDATION_GENERATED)
      .map(e => ({ type: ENTITY_TYPE.RECOMMENDATION, id: e.sourceEntityId })));

    return {
      available: true,
      summary: {
        totalEvents,
        byType: countBy(events, 'eventType'),
        byImportance: countBy(events, 'importance'),
        sourcePlatforms: [...new Set(events.map(e => e.sourcePlatform))].sort(),
        firstEventAt: totalEvents ? events[0].timestamp : null, // listByTraveller is asc
        lastEventAt: totalEvents ? events[totalEvents - 1].timestamp : null,
      },
      recent,
      tripRefs,
      memories,
      recommendations,
      latestTimestamp: totalEvents ? events[totalEvents - 1].timestamp : null,
      totalEvents,
      hasCritical: events.some(e => e.importance === TIMELINE_IMPORTANCE.CRITICAL),
      hasRedacted: events.some(e => e.status === TIMELINE_STATUS.REDACTED),
    };
  }

  async function buildGraphProjection(travellerIdentityId, opts) {
    const rootEntity = { type: ENTITY_TYPE.TRAVELLER, id: travellerIdentityId };
    const rootKey = `${ENTITY_TYPE.TRAVELLER}:${travellerIdentityId}`;
    const graph = await travelRelationshipGraph.queryEntityGraph(rootEntity, {
      depth: opts.graphDepth,
      direction: 'both',
    });
    const relationships = graph.relationships ?? [];
    const nodes = graph.nodes ?? [];

    // Degree per node key across the induced subgraph.
    const degree = new Map();
    for (const edge of relationships) {
      degree.set(edge.fromKey, (degree.get(edge.fromKey) ?? 0) + 1);
      degree.set(edge.toKey, (degree.get(edge.toKey) ?? 0) + 1);
    }
    const entityByKey = new Map();
    for (const node of nodes) entityByKey.set(`${node.entity.type}:${node.entity.id}`, node.entity);

    // Direct neighbours of the traveller, classified by relationship/entity type.
    const typed = relationships
      .filter(edge => edge.fromKey === rootKey || edge.toKey === rootKey)
      .map(edge => ({
        entity: edge.fromKey === rootKey
          ? { type: edge.toType, id: edge.toId }
          : { type: edge.fromType, id: edge.fromId },
        relationshipType: edge.relationshipType,
      }));

    const neighbourEntities = dedupEntities(typed.map(t => t.entity));
    const companions = dedupEntities(typed
      .filter(t => COMPANION_RELATIONSHIP_TYPES.includes(t.relationshipType) || COMPANION_ENTITY_TYPES.includes(t.entity.type))
      .map(t => t.entity));
    const destinations = dedupEntities(typed
      .filter(t => DESTINATION_RELATIONSHIP_TYPES.includes(t.relationshipType) || DESTINATION_ENTITY_TYPES.includes(t.entity.type))
      .map(t => t.entity));
    const memories = dedupEntities(typed
      .filter(t => t.relationshipType === RELATIONSHIP_TYPE.REMEMBERED || t.entity.type === ENTITY_TYPE.MEMORY)
      .map(t => t.entity));
    const recommendations = dedupEntities(typed
      .filter(t => t.relationshipType === RELATIONSHIP_TYPE.GENERATED || t.entity.type === ENTITY_TYPE.RECOMMENDATION)
      .map(t => t.entity));
    const tripRefs = dedupEntities(typed
      .filter(t => t.entity.type === ENTITY_TYPE.TRIP)
      .map(t => t.entity));

    const importantEntities = [...entityByKey.entries()]
      .filter(([key]) => key !== rootKey)
      .map(([key, entity]) => ({ entity: { type: entity.type, id: entity.id }, connectionCount: degree.get(key) ?? 0 }))
      .sort((a, b) => b.connectionCount - a.connectionCount
        || a.entity.type.localeCompare(b.entity.type)
        || String(a.entity.id).localeCompare(String(b.entity.id)))
      .slice(0, opts.importantLimit);

    return {
      available: true,
      summary: {
        totalRelationships: relationships.length,
        byType: countBy(relationships, 'relationshipType'),
        neighbourCount: neighbourEntities.length,
        entityTypeCounts: countBy(neighbourEntities, 'type'),
      },
      importantEntities,
      companions,
      destinations,
      memories,
      recommendations,
      tripRefs,
      latestCreatedAt: relationships.length
        ? relationships.map(e => e.createdAt).reduce((a, b) => (new Date(a) >= new Date(b) ? a : b))
        : null,
      totalRelationships: relationships.length,
    };
  }

  function computeRiskSignals(traveller, timeline) {
    const signals = [];
    if (!traveller.verified) {
      signals.push({ code: RISK_SIGNAL.IDENTITY_UNVERIFIED, severity: RISK_SEVERITY.LOW, detail: 'Traveller identity is not verified' });
    }
    if (timeline.hasCritical) {
      signals.push({ code: RISK_SIGNAL.CRITICAL_TIMELINE_EVENT, severity: RISK_SEVERITY.HIGH, detail: 'Timeline contains one or more critical events' });
    }
    if (timeline.hasRedacted) {
      signals.push({ code: RISK_SIGNAL.REDACTED_TIMELINE_EVENTS, severity: RISK_SEVERITY.MEDIUM, detail: 'Timeline contains redacted events' });
    }
    return signals.sort((a, b) => a.code.localeCompare(b.code));
  }

  function computeMissingSignals({ traveller, hasTimeline, hasGraph, timeline, graph, tripRefs, companions, destinations, memories, recommendations }) {
    const missing = [];
    if (!hasTimeline) missing.push(MISSING_SIGNAL.TIMELINE_PLATFORM_UNAVAILABLE);
    if (!hasGraph) missing.push(MISSING_SIGNAL.RELATIONSHIP_GRAPH_UNAVAILABLE);
    if (hasTimeline && timeline.totalEvents === 0) missing.push(MISSING_SIGNAL.NO_TIMELINE_EVENTS);
    if (hasGraph && graph.totalRelationships === 0) missing.push(MISSING_SIGNAL.NO_RELATIONSHIPS);
    if (tripRefs.length === 0) missing.push(MISSING_SIGNAL.NO_TRIPS);
    if (companions.length === 0) missing.push(MISSING_SIGNAL.NO_COMPANIONS);
    if (destinations.length === 0) missing.push(MISSING_SIGNAL.NO_DESTINATIONS);
    if (memories.length === 0) missing.push(MISSING_SIGNAL.NO_MEMORIES);
    if (recommendations.length === 0) missing.push(MISSING_SIGNAL.NO_RECOMMENDATIONS);
    if (!traveller.displayName) missing.push(MISSING_SIGNAL.PROFILE_DISPLAY_NAME_MISSING);
    if (!traveller.country) missing.push(MISSING_SIGNAL.PROFILE_COUNTRY_MISSING);
    return missing.sort();
  }

  function lastUpdatedFrom(traveller, timeline, graph) {
    return maxIso(traveller.updatedAt, traveller.createdAt, timeline.latestTimestamp, graph.latestCreatedAt);
  }

  /**
   * The full Traveller Digital Twin — one deterministic, read-only view of a
   * traveller's travel world, composed from the injected platforms. Owns no
   * data; everything is derived from injected platform outputs as references.
   */
  async function getTravellerTwin(travellerIdentityId, viewOptions = {}) {
    const opts = resolveOptions(viewOptions);
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    const allowPartial = viewOptions.allowPartial === true;
    const hasTimeline = Boolean(travelTimelinePlatform);
    const hasGraph = Boolean(travelRelationshipGraph);
    if (!hasTimeline && !allowPartial) throw configurationError('getTravellerTwin requires travelTimelinePlatform (or pass options.allowPartial)');
    if (!hasGraph && !allowPartial) throw configurationError('getTravellerTwin requires travelRelationshipGraph (or pass options.allowPartial)');

    const timeline = hasTimeline ? await buildTimelineProjection(traveller.travellerId, opts) : emptyTimelineProjection();
    const graph = hasGraph ? await buildGraphProjection(traveller.travellerId, opts) : emptyGraphProjection();

    const activeTrips = dedupEntities([...graph.tripRefs, ...timeline.tripRefs]);
    const memories = dedupEntities([...graph.memories, ...timeline.memories]);
    const recommendations = dedupEntities([...graph.recommendations, ...timeline.recommendations]);
    const companions = graph.companions;
    const destinations = graph.destinations;

    const riskSignals = computeRiskSignals(traveller, timeline);
    const missingSignals = computeMissingSignals({
      traveller, hasTimeline, hasGraph, timeline, graph,
      tripRefs: activeTrips, companions, destinations, memories, recommendations,
    });

    return assertCleanOutput({
      traveller,
      timelineSummary: timeline.summary,
      relationshipSummary: graph.summary,
      activeTrips,
      recentTimelineEvents: timeline.recent,
      importantEntities: graph.importantEntities,
      companions,
      destinations,
      memories,
      recommendations,
      riskSignals,
      missingSignals,
      lastUpdated: lastUpdatedFrom(traveller, timeline, graph),
    });
  }

  async function getTravellerTimelineView(travellerIdentityId, viewOptions = {}) {
    const opts = resolveOptions(viewOptions);
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    if (!travelTimelinePlatform) throw configurationError('getTravellerTimelineView requires travelTimelinePlatform');

    const timeline = await buildTimelineProjection(traveller.travellerId, opts);
    const eventsByDay = await travelTimelinePlatform.groupByDay({ travellerIdentityId: traveller.travellerId });

    return assertCleanOutput({
      traveller,
      timelineSummary: timeline.summary,
      recentTimelineEvents: timeline.recent,
      eventsByDay,
      lastUpdated: lastUpdatedFrom(traveller, timeline, emptyGraphProjection()),
    });
  }

  async function getTravellerRelationshipView(travellerIdentityId, viewOptions = {}) {
    const opts = resolveOptions(viewOptions);
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    if (!travelRelationshipGraph) throw configurationError('getTravellerRelationshipView requires travelRelationshipGraph');

    const graph = await buildGraphProjection(traveller.travellerId, opts);

    return assertCleanOutput({
      traveller,
      relationshipSummary: graph.summary,
      importantEntities: graph.importantEntities,
      companions: graph.companions,
      destinations: graph.destinations,
      memories: graph.memories,
      recommendations: graph.recommendations,
      activeTrips: graph.tripRefs,
      lastUpdated: lastUpdatedFrom(traveller, emptyTimelineProjection(), graph),
    });
  }

  /**
   * A lighter combined context summary — counts, risk and missing signals — for
   * quick consumption. Degrades gracefully with options.allowPartial.
   */
  async function getTravellerContextSummary(travellerIdentityId, viewOptions = {}) {
    const opts = resolveOptions(viewOptions);
    const traveller = await resolveValidatedTraveller(travellerIdentityId);
    const allowPartial = viewOptions.allowPartial === true;
    const hasTimeline = Boolean(travelTimelinePlatform);
    const hasGraph = Boolean(travelRelationshipGraph);
    if (!hasTimeline && !allowPartial) throw configurationError('getTravellerContextSummary requires travelTimelinePlatform (or pass options.allowPartial)');
    if (!hasGraph && !allowPartial) throw configurationError('getTravellerContextSummary requires travelRelationshipGraph (or pass options.allowPartial)');

    const timeline = hasTimeline ? await buildTimelineProjection(traveller.travellerId, opts) : emptyTimelineProjection();
    const graph = hasGraph ? await buildGraphProjection(traveller.travellerId, opts) : emptyGraphProjection();

    const activeTrips = dedupEntities([...graph.tripRefs, ...timeline.tripRefs]);
    const memories = dedupEntities([...graph.memories, ...timeline.memories]);
    const recommendations = dedupEntities([...graph.recommendations, ...timeline.recommendations]);

    return assertCleanOutput({
      traveller: {
        travellerId: traveller.travellerId,
        displayName: traveller.displayName,
        verified: traveller.verified,
        status: traveller.status,
      },
      timelineSummary: timeline.summary,
      relationshipSummary: graph.summary,
      riskSignals: computeRiskSignals(traveller, timeline),
      missingSignals: computeMissingSignals({
        traveller, hasTimeline, hasGraph, timeline, graph,
        tripRefs: activeTrips, companions: graph.companions, destinations: graph.destinations, memories, recommendations,
      }),
      lastUpdated: lastUpdatedFrom(traveller, timeline, graph),
    });
  }

  return {
    getTravellerTwin,
    getTravellerTimelineView,
    getTravellerRelationshipView,
    getTravellerContextSummary,
  };
}
