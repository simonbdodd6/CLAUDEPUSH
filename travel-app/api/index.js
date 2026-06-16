// Travel App — thin API (M23.0 Phase 3).
//
// The composition root + route handlers. It wires the FROZEN platform modules
// together through their public APIs/ports and the durable persistence adapters,
// and exposes one handler per route. Handlers are plain async functions (fully
// testable without binding a port); server.js is a thin HTTP host over them.
//
// No platform module is modified and no business logic is duplicated — every
// handler delegates to a platform service.

import {
  FileTripRepository,
  FileEventRepository,
  FileTimelineRepository,
  FileIdentityRepository,
  FileItineraryRepository,
  FileTravelMemoryRepository,
  FileRelationshipRepository,
  FileApprovalRepository,
} from './persistence/durable-repositories.js';
import { createSessionManager } from './session.js';
import { createAppleAuth } from './auth.js';
import { presentTimeline, presentCapture } from './presenters.js';
import { buildFeed, buildStats } from './feed.js';
import { buildIntelligence } from './intelligence.js';
import { buildRelationships, normalizeCompanions } from './relationships.js';
import { buildMemories } from './memories.js';
import { buildLifeStory } from './life-story.js';
import { buildTravelDna } from './travel-dna.js';
import { buildPredictions } from './predictions.js';
import { buildJourney, normalizeMove } from './journey.js';
import { buildJourneyReplay } from './journey-replay.js';
import { buildGlobe } from './globe.js';
import { buildWorld } from './world.js';
import { buildAchievements } from './achievements.js';
import { buildLifetimeTimeline } from './lifetime-timeline.js';
import { buildTravelWrapped } from './travel-wrapped.js';
import { buildOnThisDay } from './on-this-day.js';

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
  const config = options.config ?? null;
  const appleConfigured = typeof options.appleVerifier === 'function';

  // --- platform composition (frozen modules via public APIs/ports) ---
  const timeline = createTravelTimelinePlatform({ repository: repo(store, FileTimelineRepository) });
  const graph = createTravelRelationshipGraph({ repository: repo(store, FileRelationshipRepository) });
  const events = createEventPlatform({ repository: repo(store, FileEventRepository) });
  const identity = createIdentityPlatform({ repository: repo(store, FileIdentityRepository) });
  // traveller-identity is a pure port (no repository) — it projects over the now-durable identity source.
  const travellerIdentity = createTravellerIdentityPlatform({
    identitySource: new IdentityPlatformSourceAdapter({ identityPlatform: identity }),
  });
  const trips = createTripPlatform({
    repository: repo(store, FileTripRepository),
    travellerIdentityPlatform: travellerIdentity,
    timelinePublisher: timeline,
    relationshipPublisher: graph,
  });
  const itineraries = createItineraryPlatform({
    repository: repo(store, FileItineraryRepository),
    timelinePublisher: timeline,
    relationshipPublisher: graph,
  });
  const memory = createTravelMemoryPlatform({
    repository: repo(store, FileTravelMemoryRepository),
    timelinePublisher: timeline,
    relationshipPublisher: graph,
  });
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
  const approval = createApprovalPlatform({ repository: repo(store, FileApprovalRepository) });
  const orchestrator = createTravelIntelligenceOrchestrator({
    travelActionCandidateEngine: actionCandidates,
    approvalPlatform: approval,
  });
  const sessions = createSessionManager({ store, ttlMs: config?.session?.ttlMs });
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
  // device; only a reference id is recorded — never exact location). Requires a
  // note or a photoRef; returns a consumer-ready capture DTO.
  async function capture(token, body = {}) {
    const id = travellerFor(token);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const photoRef = body.photoRef ?? null;
    if (!note && !photoRef) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'A note or a photo is required to capture a moment');
    }
    const trip = await getCurrentTrip(id);
    const timestamp = body.timestamp ?? todayIso();
    const captureId = body.captureId ?? `capture_${timestamp}_${Math.abs(hash(note + (photoRef ?? '')))}`;
    const eventType = photoRef ? 'photo_imported' : 'journal_entry';
    const companions = normalizeCompanions(body.with ?? body.companions);
    const place = typeof body.place === 'string' && body.place.trim() ? body.place.trim() : null;
    const move = normalizeMove(body.move);
    const event = await timeline.appendEvent({
      travellerIdentityId: id,
      tripId: trip?.tripId ?? null,
      eventType,
      sourcePlatform: 'travel-app',
      sourceEntityId: captureId,
      timestamp,
      metadata: { eventName: eventType, note, photoRef, day: body.day ?? null, companions, place, move },
      idempotencyKey: `travel-app:${eventType}:${captureId}`,
    });
    return { capture: presentCapture(event) };
  }

  // Consumer-ready timeline: days newest-first, clean human entries, no raw
  // platform ids or backend terminology.
  async function getTimeline(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const trip = await getCurrentTrip(id);
    return { days: presentTimeline(events, { tripStartDate: trip?.startDate ?? null, destination: trip?.destination ?? null }) };
  }

  // Premium feed the traveller sees on open: hero memory, featured photos,
  // journey highlights, today's story, and travel statistics — display-ready.
  async function getFeed(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const trip = await getCurrentTrip(id);
    return buildFeed(events, trip);
  }

  // Beautiful travel statistics (streaks, countries, places, dives, flights,
  // memory categories) for the stats screen.
  async function getStats(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const trip = await getCurrentTrip(id);
    return { stats: buildStats(events, trip) };
  }

  // Deterministic Travel Intelligence — Spotify-Wrapped-style observations from
  // the traveller's own data (their memories + trips). Not AI; pure + honest.
  async function getIntelligence(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildIntelligence(events, ownedTrips);
  }

  // Memory Engine — beautiful stories assembled deterministically from memories:
  // recap, superlative story cards, journey chapters, themed collections, reels.
  async function getMemories(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildMemories(events, ownedTrips);
  }

  // Journey Visualisation Engine — an ordered, replayable route (stops +
  // transport segments) the UI can animate, from deterministic evidence.
  async function getJourney(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildJourney(events, ownedTrips);
  }

  // Interactive Journey Replay — replay-ready metadata (timeline, timing, paths,
  // controls) layered deterministically over the journey route.
  async function getJourneyReplay(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildJourneyReplay(events, ownedTrips);
  }

  // 3D Globe Journey Engine — the deterministic data layer (markers, great-
  // circle arcs, camera moves, replay frames, filters) for a future globe.
  async function getGlobe(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildGlobe(events, ownedTrips);
  }

  // Lifetime World Engine — the deterministic data layer for every place the
  // traveller has ever visited (countries, eras, connections, heat, stats).
  async function getWorld(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildWorld(events, ownedTrips);
  }

  // On This Day — everything that happened on the same calendar day across
  // previous years. Reference date is explicit (defaults to today) → deterministic.
  async function getOnThisDay(token, { date } = {}) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildOnThisDay(events, ownedTrips, date ?? todayIso());
  }

  // Travel Wrapped — a Spotify-Wrapped-style deck composed from the existing
  // engines (no new intelligence). Presentation-only.
  async function getTravelWrapped(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildTravelWrapped(events, ownedTrips);
  }

  // Lifetime Travel Timeline — the traveller's whole travel life as one
  // chronological story of typed moments, grouped into years/months/eras.
  async function getLifetimeTimeline(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildLifetimeTimeline(events, ownedTrips);
  }

  // Travel Achievement Engine — achievements earned purely from stored evidence
  // (never manually awarded): tiered series, milestones, seasonal/yearly badges.
  async function getAchievements(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildAchievements(events, ownedTrips);
  }

  // Predictive Travel Companion — gently anticipates what the traveller will
  // likely enjoy next, from deterministic evidence only.
  async function getPredictions(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildPredictions(events, ownedTrips);
  }

  // Personal Travel DNA — long-term characteristics of who the traveller is,
  // learned deterministically from evidence across every journey.
  async function getTravelDna(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildTravelDna(events, ownedTrips);
  }

  // Life Story Engine — the traveller's whole history curated into meaningful
  // life stories ("The Bali Chapter", "Travelling With Manon"). Deterministic.
  async function getLifeStory(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildLifeStory(events, ownedTrips);
  }

  // Deterministic shared-journey intelligence — the people you travel with.
  async function getRelationships(token) {
    const id = travellerFor(token);
    const events = await timeline.listByTraveller(id, { order: 'asc', limit: 1000 });
    const ownedTrips = await trips.listTripsForIdentity(id, actorFor(id));
    return buildRelationships(events, ownedTrips);
  }

  // Generate deterministic trip-readiness candidates and route the high-impact
  // (approval-required) ones into the approval queue.
  async function getTripReadiness(token) {
    const id = travellerFor(token);
    const { candidates, approvalRequests } = await orchestrator.generateAndRoute(id);
    return { candidates, approvalRequests };
  }

  // Liveness + readiness probe (unauthenticated). Proves the API is up, the
  // config is loaded, the durable store is read/writable, and reports whether a
  // real Apple verifier is wired. Never exposes secrets.
  async function getHealth() {
    const checks = {};
    checks.api = { ok: true };
    checks.config = config
      ? { ok: true, env: config.env }
      : { ok: false, detail: 'no config loaded (using ad-hoc options)' };

    // Store probe: round-trip a tiny record through the durable layer.
    if (!store) {
      checks.store = { ok: true, driver: 'memory', detail: 'in-memory (non-durable)' };
    } else {
      try {
        const probe = await store.read('_health');
        await store.write('_health', [{ pingAt: todayIso() }]);
        checks.store = { ok: true, driver: config?.store?.driver ?? 'file', priorWrites: probe.length };
      } catch (error) {
        checks.store = { ok: false, detail: error.message };
      }
    }

    const appleMode = config?.apple?.mode ?? (appleConfigured ? 'custom' : 'disabled');
    checks.apple = { ok: appleMode !== 'disabled' && (appleConfigured || appleMode === 'jwks'), mode: appleMode, configured: appleConfigured };

    // The store is the only HARD readiness dependency; config/apple gaps degrade
    // but do not take the service down (a probe must still answer).
    const hardOk = checks.api.ok && checks.store.ok;
    const fullyReady = hardOk && checks.config.ok && checks.apple.ok;
    const status = !hardOk ? 'error' : (fullyReady ? 'ok' : 'degraded');
    return { status, env: config?.env ?? 'unknown', time: todayIso(), checks };
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
    getHealth,
    signIn,
    getToday,
    getTrip,
    putTrip,
    getItinerary,
    putItinerary,
    capture,
    getTimeline,
    getFeed,
    getStats,
    getIntelligence,
    getRelationships,
    getMemories,
    getLifeStory,
    getTravelDna,
    getPredictions,
    getJourney,
    getJourneyReplay,
    getGlobe,
    getWorld,
    getAchievements,
    getLifetimeTimeline,
    getTravelWrapped,
    getOnThisDay,
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
