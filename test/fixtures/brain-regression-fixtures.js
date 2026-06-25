/**
 * Canonical Brain regression fixtures (TEST INFRASTRUCTURE ONLY).
 *
 * The single source of truth for the deterministic read-only-provider scenarios used by the dry-run
 * and matrix harness tests (M178–M180). Each builder returns FRESH objects every call (no shared
 * mutable references between calls) while producing deterministic, byte-identical data — so a test
 * may mutate one fixture without affecting another.
 *
 * Providers only: these supply { squadLoader, decisionPlanSource }. The coach-intelligence engines
 * stay injected by the test via options.pipelineServices, so this module imports nothing.
 *
 * Scenarios (matching those proven in M179):
 *   - createFullSquadScenario()      24 players, every jersey covered → Starting XV of 15
 *   - createInjuryThinnedScenario()  both Fullbacks removed (22 players) → jersey 15 vacant, 14 starters
 *   - createInvalidProviderScenario() squadLoader is {} → fails the M164 contract
 */

const corePlayer = (userId, position) => ({ id: `profile_${userId}`, userId, displayName: userId, position })
const memory = (id, type) => ({ id, coachId: 'coach-demo', clubId: 'boitsfort-rfc', type, statement: `insight ${id}`, source: 'manual', confidence: 0.8, weight: 0.7, tags: [], ontologyLinks: [], evidenceRefs: [], createdAt: `2026-06-0${id.slice(1)}T00:00:00.000Z` })

/** 24 fresh players: 15 starters covering every jersey (Lock x2) + 9 depth. */
function fullPlayers() {
  return [
    corePlayer('u_lh', 'Loosehead Prop'), corePlayer('u_hk', 'Hooker'), corePlayer('u_th', 'Tighthead Prop'), corePlayer('u_lk1', 'Lock'), corePlayer('u_lk2', 'Lock'),
    corePlayer('u_bs', 'Blindside Flanker'), corePlayer('u_os', 'Openside Flanker'), corePlayer('u_n8', 'Number 8'), corePlayer('u_sh', 'Scrum-half'), corePlayer('u_fh', 'Fly-half'),
    corePlayer('u_lw', 'Left Wing'), corePlayer('u_ic', 'Inside Centre'), corePlayer('u_oc', 'Outside Centre'), corePlayer('u_rw', 'Right Wing'), corePlayer('u_fb', 'Fullback'),
    corePlayer('d_lh', 'Loosehead Prop'), corePlayer('d_hk', 'Hooker'), corePlayer('d_th', 'Tighthead Prop'), corePlayer('d_lk', 'Lock'), corePlayer('d_n8', 'Number 8'),
    corePlayer('d_sh', 'Scrum-half'), corePlayer('d_fh', 'Fly-half'), corePlayer('d_fb', 'Fullback'), corePlayer('d_lw', 'Left Wing'),
  ]
}

/** Injury-thinned: both Fullbacks removed → jersey 15 cannot be filled. */
function thinnedPlayers() {
  return fullPlayers().filter((p) => p.position !== 'Fullback')
}

function freshMemories() {
  return [memory('m1', 'selection-preference'), memory('m2', 'selection-preference'), memory('m3', 'selection-preference'), memory('m4', 'tactical-preference')]
}

const availabilityFor = (players) => Object.fromEntries(players.map((p) => [p.userId, { response: 'available' }]))

function squadLoaderFor(players) {
  return {
    getActivePlayers: () => players,
    getAvailabilityResponses: () => availabilityFor(players),
    getCoachMemories: () => freshMemories(),
    getPlayerTags: () => ({}),
  }
}

function decisionSource() {
  return {
    getFixtureContext: () => ({
      fixture: { fixtureId: 'fix_1', opponent: 'Leinster', competition: 'AIL', venue: 'Home', date: '2026-07-05' },
      match: { category: 'selection-preference', confidence: 0.7, matchedSignals: ['form'] },
    }),
    getCoachIdentity: () => ({ coachId: 'coach-demo', clubId: 'boitsfort-rfc', tags: [] }),
  }
}

/** Full squad → complete Starting XV of 15. */
export function createFullSquadScenario() {
  return {
    id: 'full-squad',
    squadLoader: squadLoaderFor(fullPlayers()),
    decisionPlanSource: decisionSource(),
    expected: { startingCount: 15, hasSquad: true },
  }
}

/** Injury-thinned squad → Fullback jersey vacant, 14 starters. */
export function createInjuryThinnedScenario() {
  return {
    id: 'injury-thinned',
    squadLoader: squadLoaderFor(thinnedPlayers()),
    decisionPlanSource: decisionSource(),
    expected: { startingCount: 14 },
  }
}

/** Invalid provider → squadLoader {} fails the M164 squad-loader contract. */
export function createInvalidProviderScenario() {
  return {
    id: 'invalid-provider',
    squadLoader: {},
    decisionPlanSource: decisionSource(),
  }
}
