// Travel App — thin API (M23.0 Phase 3).
//
// The composition root + route handlers. It wires the FROZEN platform modules
// together through their public APIs/ports and the durable persistence adapters,
// and exposes one handler per route. Handlers are plain async functions (fully
// testable without binding a port); server.js is a thin HTTP host over them.
//
// No platform module is modified and no business logic is duplicated — every
// handler delegates to a platform service.

import { FileTripRepository, FileEventRepository, FileTimelineRepository } from './persistence/durable-repositories.js';
import { createSessionManager } from './session.js';
import { createAppleAuth } from './auth.js';

import { createIdentityPlatform } from '../../lib/identity-platform/index.js';
import { IdentityPlatformSourceAdapter, createTravellerIdentityPlatform } from '../../lib/traveller-identity-platform/index.js';
import { createTravelTimelinePlatform } from '../../lib/travel-timeline-platform/index.js';
import { createTravelRelationshipGraph } from '../../lib/travel-relationship-graph/index.js';
import { createEventPlatform } from '../../lib/event-platform/index.js';
import { createTripPlatform } from '../../lib/trip-platform/index.js';
import { createItineraryPlatform } from '../../lib/itinerary-platform/index.js';
import { createTravelMemoryPlatform } from '../../lib/travel-memory-platform/index.js';
import { createTravellerPreferencesPlatform } from '../../lib/traveller-preferences-platform/index.js';
import { createCompanionDiscoveryPlatform } from '../../lib/companion-discovery-platform/index.js';
import { createTravelIntelligenceContext } from '../../lib/travel-intelligence-context/index.js';
import { createTravelInsightEngine } from '../../lib/travel-insight-engine/index.js';
import { createTravelActionCandidateEngine } from '../../lib/travel-action-candidate-engine/index.js';
import { createApprovalPlatform } from '../../lib/approval-platform/index.js';
import { createTravelIntelligenceOrchestrator } from '../../lib/travel-intelligence-orchestrator/index.js';

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function repo(store, Make) {
  return store ? new Make(store) : undefined; // undefined => platform uses its InMemory default
}

export function createTravelApi(options = {}) {
  const store = options.store ?? null;

  // --- platform composition (frozen modules via public APIs/ports) ---
  const timeline = createTravelTimelinePlatform({ repository: repo(store, FileTimelineRepository) });
  const graph = createTravelRelationshipGraph();           // durable graph repo: follow-up
  const events = createEventPlatform({ repository: repo(store, FileEventRepository) });
  const identity = createIdentityPlatform();               // durable identity repo: follow-up
  const travellerIdentity = createTravellerIdentityPlatform({
    identitySource: new IdentityPlatformSourceAdapter({ identityPlatform: identity }),
  });
  const trips = createTripPlatform({
    repository: repo(store, FileTripRepository),
    travellerIdentityPlatform: travellerIdentity,
    timelinePublisher: timeline,
    relationshipPublisher: graph,
  });
  const itineraries = createItineraryPlatform({ timelinePublisher: timeline, relationshipPublisher: graph });
  const memory = createTravelMemoryPlatform({ timelinePublisher: timeline, relationshipPublisher: graph });
  const preferences = createTravellerPreferencesPlatform();
  const discovery = createCompanionDiscoveryPlatform();
  const context = createTravelIntelligenceContext({
    travellerIdentityPlatform: travellerIdentity,
    travelTimelinePlatform: timeline,
    travelRelationshipGraph: graph,
    travelMemoryPlatform: memory,
    travellerPreferencesPlatform: preferences,
    companionDiscoveryPlatform: discovery,
  });
  const insight = createTravelInsightEngine({ travelIntelligenceContext: context });
  const actionCandidates = createTravelActionCandidateEngine({ travelInsightEngine: insight });
  const approval = createApprovalPlatform();
  const orchestrator = createTravelIntelligenceOrchestrator({
    travelActionCandidateEngine: actionCandidates,
    approvalPlatform: approval,
  });
  const sessions = createSessionManager({ store });
  const auth = createAppleAuth({
    identityPlatform: identity,
    travellerIdentityPlatform: travellerIdentity,
    sessionManager: sessions,
    store,
    appleVerifier: options.appleVerifier,
  });

  function travellerFor(token) {
    try {
      return sessions.requireTraveller(token);
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
    }
  }
  const actorFor = id => ({ id, type: 'TRAVELLER' });
  const todayIso = () => new Date().toISOString();

  // -------------------------------------------------------------------------
  // Handlers (one per route)
  // -------------------------------------------------------------------------

  async function signIn({ identityToken, displayName } = {}) {
    return auth.signInWithApple(identityToken, { displayName });
  }

  async function getCurrentTrip(travellerId) {
    const owned = await trips.listTripsForIdentity(travellerId, actorFor(travellerId));
    return owned[0] ?? null; // most-recent (listByOwner sorts desc by updatedAt)
  }

  async function getToday(token) {
    const id = travellerFor(token);
    const traveller = await travellerIdentity.getTravellerView(id);
    const trip = await getCurrentTrip(id);
    const recent = await timeline.listByTraveller(id, { order: 'desc', limit: 5 });
    return { traveller, currentTrip: trip, recentTimeline: recent };
  }

  async function getTrip(token) {
    const id = travellerFor(token);
    return { trip: await getCurrentTrip(id) };
  }

  // Upsert the single active trip (create on first call, patch thereafter).
  async function putTrip(token, body = {}) {
    const id = travellerFor(token);
    const existing = await getCurrentTrip(id);
    if (existing) {
      const updated = await trips.updateTrip(existing.tripId, body, actorFor(id));
      return { trip: updated };
    }
    const trip = await trips.createTrip({ ...body, ownerIdentityId: id }, actorFor(id));
    return { trip };
  }

  async function getCurrentItinerary(travellerId, tripId) {
    if (tripId) {
      const forTrip = await itineraries.listItinerariesForTrip(tripId);
      if (forTrip.length) return forTrip[0];
    }
    const owned = await itineraries.listItinerariesForOwner(travellerId);
    return owned[0] ?? null;
  }

  async function getItinerary(token) {
    const id = travellerFor(token);
    const trip = await getCurrentTrip(id);
    return { itinerary: await getCurrentItinerary(id, trip?.tripId) };
  }

  // Ensure an itinerary exists for the current trip; optionally add a block.
  async function putItinerary(token, body = {}) {
    const id = travellerFor(token);
    const trip = await getCurrentTrip(id);
    let itinerary = await getCurrentItinerary(id, trip?.tripId);
    if (!itinerary) {
      itinerary = await itineraries.createBlankItinerary({
        tripId: trip?.tripId ?? null,
        ownerIdentityId: id,
        startDate: body.startDate ?? trip?.startDate,
        days: body.days ?? 1,
        title: body.title ?? (trip ? `Itinerary for ${trip.destination}` : 'Itinerary'),
      });
    }
    if (body.block && Number.isInteger(body.day) && body.section) {
      await itineraries.addBlock({ itineraryId: itinerary.itineraryId, day: body.day, section: body.section, block: body.block });
      itinerary = await itineraries.getItinerary(itinerary.itineraryId);
    }
    return { itinerary };
  }

  // Capture a journal entry and/or a photo reference (photo binary stays on the
  // device; only a reference id is recorded — never exact location).
  async function capture(token, body = {}) {
    const id = travellerFor(token);
    const trip = await getCurrentTrip(id);
    const captureId = body.captureId ?? `capture_${todayIso()}_${Math.abs(hash(body.note ?? '') )}`;
    const eventType = body.photoRef ? 'photo_imported' : 'journal_entry';
    const event = await timeline.appendEvent({
      travellerIdentityId: id,
      tripId: trip?.tripId ?? null,
      eventType,
      sourcePlatform: 'travel-app',
      sourceEntityId: captureId,
      timestamp: body.timestamp ?? todayIso(),
      metadata: { note: body.note ?? '', photoRef: body.photoRef ?? null, day: body.day ?? null },
      idempotencyKey: `travel-app:${eventType}:${captureId}`,
    });
    return { capture: { id: captureId, eventType, timelineEventId: event.timelineEventId } };
  }

  async function getTimeline(token) {
    const id = travellerFor(token);
    return { days: await timeline.groupByDay({ travellerIdentityId: id }) };
  }

  // Generate deterministic trip-readiness candidates and route the high-impact
  // (approval-required) ones into the approval queue.
  async function getTripReadiness(token) {
    const id = travellerFor(token);
    const { candidates, approvalRequests } = await orchestrator.generateAndRoute(id);
    return { candidates, approvalRequests };
  }

  async function getApprovals(token) {
    travellerFor(token);
    return { pending: await approval.queryPending() };
  }

  async function resolveApproval(token, requestId, body = {}) {
    const id = travellerFor(token);
    if (!requestId) throw new ApiError(400, 'VALIDATION_FAILED', 'requestId is required');
    const decision = body.decision === 'reject' ? 'reject' : 'approve';
    try {
      const result = decision === 'approve'
        ? await approval.approve(requestId, actorFor(id), { reason: body.reason })
        : await approval.reject(requestId, actorFor(id), { reason: body.reason });
      return { request: result };
    } catch (error) {
      if (error.code === 'REQUEST_NOT_FOUND') throw new ApiError(404, error.code, error.message);
      throw error;
    }
  }

  return {
    // expose underlying platforms for tests/introspection (read-only use)
    _platforms: { trips, itineraries, memory, timeline, graph, events, approval, identity },
    signIn,
    getToday,
    getTrip,
    putTrip,
    getItinerary,
    putItinerary,
    capture,
    getTimeline,
    getTripReadiness,
    getApprovals,
    resolveApproval,
  };
}

// tiny deterministic string hash for default capture ids
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) { h = (h * 31 + str.charCodeAt(i)) | 0; }
  return h;
}
