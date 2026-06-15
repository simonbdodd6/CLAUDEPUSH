/**
 * @brain/versioning — Version contracts (M31.0)
 *
 * The served-version registry for every existing AI capability. Values are copied
 * from the live `*_VERSION` constants (M17–M28) so they reproduce today's emitted
 * output versions exactly. A parity test asserts this against the engines.
 * Dormant in M31.0 — nothing negotiates against it yet.
 *
 * @typedef {import('@brain/contracts').VersionContract} VersionContract
 */

/** @type {VersionContract[]} */
export const VERSION_CONTRACTS = Object.freeze([
  { capability: 'integration',                    outputVersion: '1.0', supports: ['1.0'] }, // INTEGRATION_VERSION
  { capability: 'coach.weeklyBrief',              outputVersion: '2.0', supports: ['2.0'] }, // BRIEF_VERSION
  { capability: 'coach.matchReadiness',           outputVersion: '2.0', supports: ['2.0'] }, // MR_VERSION
  { capability: 'coach.selectionAssistant',       outputVersion: '1.0', supports: ['1.0'] }, // SA_VERSION
  { capability: 'coach.playerCard',               outputVersion: '1.0', supports: ['1.0'] },
  { capability: 'coach.clubSnapshot',             outputVersion: '1.0', supports: ['1.0'] },
  { capability: 'coach.learning',                 outputVersion: '1.0', supports: ['1.0'] }, // LEARNING_VERSION
  { capability: 'coach.coachDna',                 outputVersion: '1.0', supports: ['1.0'] }, // DNA_VERSION
  { capability: 'coach.opponentIntelligence',     outputVersion: '1.0', supports: ['1.0'] }, // PROFILE_VERSION
  { capability: 'coach.trainingDesigner',         outputVersion: '1.0', supports: ['1.0'] }, // DESIGNER_VERSION
  { capability: 'coach.matchStrategy',            outputVersion: '1.0', supports: ['1.0'] }, // STRATEGY_VERSION
  { capability: 'coach.liveMatch',                outputVersion: '1.0', supports: ['1.0'] }, // LIVE_VERSION
  { capability: 'coach.seasonIntelligence',       outputVersion: '1.0', supports: ['1.0'] }, // SEASON_VERSION
  { capability: 'coach.executiveRecommendations', outputVersion: '1.0', supports: ['1.0'] }, // M38: recommendation-engine
  { capability: 'coach.memoryIntelligence',       outputVersion: '1.0', supports: ['1.0'] }, // M39: knowledge-graph
])

export const VERSION_CONTRACT_BY_CAPABILITY = Object.freeze(
  Object.fromEntries(VERSION_CONTRACTS.map(v => [v.capability, v])),
)
