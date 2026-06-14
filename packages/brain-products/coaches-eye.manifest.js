/**
 * @brain/products — coaches-eye ProductManifest (M31.0)
 *
 * Declarative manifest for Coach's Eye Intelligence. Every value is copied from
 * the live engine constants (M17 tier matrix, M18–M28 flags/tiers/versions) so
 * it reproduces today's gating EXACTLY. A parity test asserts this against the
 * real engines. Dormant in M31.0 — nothing consumes it yet.
 *
 * Tier non-linearities preserved from M17:
 *   - Club has no weeklyBrief / playerCard (org-focused).
 *   - Coach DNA starts at professional (not performance).
 *   - The `free` tier includes NO capabilities → Coach's Eye Core works with AI
 *     completely disabled.
 *
 * @typedef {import('@brain/contracts').ProductManifest} ProductManifest
 */

import { TIER, CAPABILITY, FLAG } from '../brain-contracts/index.js'

const T = TIER

/** @type {ProductManifest} */
export const COACHES_EYE_MANIFEST = Object.freeze({
  productId: 'coaches-eye',
  tiers: [T.FREE, T.STARTER, T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE],
  globalKillFlag: FLAG.ENABLED,

  capabilities: [
    { key: CAPABILITY.DASHBOARD,             tiers: [T.STARTER, T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },
    { key: CAPABILITY.WEEKLY_BRIEF,          tiers: [T.STARTER, T.PERFORMANCE, T.PROFESSIONAL, T.ENTERPRISE] },          // NOT club
    { key: CAPABILITY.MATCH_READINESS,       tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },
    { key: CAPABILITY.PLAYER_CARD,           tiers: [T.PERFORMANCE, T.PROFESSIONAL, T.ENTERPRISE] },                     // NOT club
    { key: CAPABILITY.CLUB_SNAPSHOT,         tiers: [T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },
    { key: CAPABILITY.SELECTION_ASSISTANT,   tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },             // bundled at matchReadiness tier
    { key: CAPABILITY.COACH_DNA,             tiers: [T.PROFESSIONAL, T.CLUB, T.ENTERPRISE] },                            // DNA_TIERS (not performance)
    { key: CAPABILITY.OPPONENT_INTELLIGENCE, tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },
    { key: CAPABILITY.TRAINING_DESIGNER,     tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },
    { key: CAPABILITY.MATCH_STRATEGY,        tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },
    { key: CAPABILITY.LIVE_MATCH,            tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },
    { key: CAPABILITY.SEASON_INTELLIGENCE,   tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },
    { key: CAPABILITY.LEARNING,              tiers: [T.STARTER, T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE] },  // infra, not a sold product
  ],

  namespaces: ['coach-profiles', 'coach-dna', 'opponents', 'live-matches', 'observations', 'memory', 'approvals'],

  shares: [],   // nothing shared cross-product by default

  flags: [
    { key: FLAG.ENABLED,               defaultOn: true, killSwitch: true },
    { key: FLAG.LEARNING,              defaultOn: true },
    { key: FLAG.COACH_PROFILE,         defaultOn: true },
    { key: FLAG.PERSONALISATION,       defaultOn: true },
    { key: FLAG.MATCH_READINESS,       defaultOn: true },
    { key: FLAG.SELECTION_ASSISTANT,   defaultOn: true },
    { key: FLAG.COACH_DNA,             defaultOn: true },
    { key: FLAG.OPPONENT_INTELLIGENCE, defaultOn: true },
    { key: FLAG.TRAINING_DESIGNER,     defaultOn: true },
    { key: FLAG.MATCH_STRATEGY,        defaultOn: true },
    { key: FLAG.LIVE_MATCH,            defaultOn: true },
    { key: FLAG.SEASON_INTELLIGENCE,   defaultOn: true },
  ],

  approvals: [
    { action: 'coach.message.send', risk: 'medium' },
    { action: 'opponent.share',     risk: 'high' },
  ],

  plugins: [
    { slot: CAPABILITY.WEEKLY_BRIEF,          engine: 'weekly-brief',        version: '2.0', tiers: [T.STARTER, T.PERFORMANCE, T.PROFESSIONAL, T.ENTERPRISE],   flag: FLAG.ENABLED },
    { slot: CAPABILITY.MATCH_READINESS,       engine: 'match-readiness',     version: '2.0', tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE],      flag: FLAG.MATCH_READINESS },
    { slot: CAPABILITY.SELECTION_ASSISTANT,   engine: 'selection-assistant', version: '1.0', tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE],      flag: FLAG.SELECTION_ASSISTANT },
    { slot: CAPABILITY.COACH_DNA,             engine: 'coach-dna',           version: '1.0', tiers: [T.PROFESSIONAL, T.CLUB, T.ENTERPRISE],                      flag: FLAG.COACH_DNA },
    { slot: CAPABILITY.OPPONENT_INTELLIGENCE, engine: 'opponent',            version: '1.0', tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE],      flag: FLAG.OPPONENT_INTELLIGENCE },
    { slot: CAPABILITY.TRAINING_DESIGNER,     engine: 'training-designer',   version: '1.0', tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE],      flag: FLAG.TRAINING_DESIGNER },
    { slot: CAPABILITY.MATCH_STRATEGY,        engine: 'match-strategy',      version: '1.0', tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE],      flag: FLAG.MATCH_STRATEGY },
    { slot: CAPABILITY.LIVE_MATCH,            engine: 'live-match',          version: '1.0', tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE],      flag: FLAG.LIVE_MATCH },
    { slot: CAPABILITY.SEASON_INTELLIGENCE,   engine: 'season',              version: '1.0', tiers: [T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE],      flag: FLAG.SEASON_INTELLIGENCE },
    { slot: CAPABILITY.LEARNING,              engine: 'learning',            version: '1.0', tiers: [T.STARTER, T.PERFORMANCE, T.CLUB, T.PROFESSIONAL, T.ENTERPRISE], flag: FLAG.LEARNING },
  ],

  // Output-version contracts (see @brain/versioning for the served-version registry).
  versions: [
    { capability: 'integration',                     outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.WEEKLY_BRIEF,           outputVersion: '2.0', supports: ['2.0'] },
    { capability: CAPABILITY.MATCH_READINESS,        outputVersion: '2.0', supports: ['2.0'] },
    { capability: CAPABILITY.SELECTION_ASSISTANT,    outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.PLAYER_CARD,            outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.CLUB_SNAPSHOT,          outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.LEARNING,               outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.COACH_DNA,              outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.OPPONENT_INTELLIGENCE,  outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.TRAINING_DESIGNER,      outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.MATCH_STRATEGY,         outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.LIVE_MATCH,             outputVersion: '1.0', supports: ['1.0'] },
    { capability: CAPABILITY.SEASON_INTELLIGENCE,    outputVersion: '1.0', supports: ['1.0'] },
  ],
})
