/**
 * AI Brain — Context Assembly Layer (M3)
 *
 * Assembles a single, strongly-typed ContextBundle before any reasoning occurs.
 * Each data source runs through an isolated provider that fails gracefully —
 * a provider error contributes its fallback value, not a rejection.
 *
 * Rules:
 *  - No reasoning may occur here (classification, scoring, recommendation logic).
 *  - Each provider is independent; failures are isolated.
 *  - The bundle is assembled via Promise.allSettled — all providers run in parallel.
 *  - Core code never imports this file directly; it is only called by the Brain.
 */

import * as kgProvider  from './providers/knowledge-graph-provider.js'
import * as memProvider from './providers/memory-engine-provider.js'
import * as tlProvider  from './providers/timeline-provider.js'
import * as leProvider  from './providers/learning-provider.js'
import * as ciProvider  from './providers/club-intelligence-provider.js'

// Ordered list — index matches Promise.allSettled result positions.
const PROVIDERS = [kgProvider, memProvider, tlProvider, leProvider, ciProvider]

/**
 * Assemble a ContextBundle from all registered providers.
 *
 * @param {object} trigger  - raw request context (platform data, IDs, etc.)
 * @returns {Promise<ContextBundle>}
 */
export async function assembleContext(trigger = {}) {
  trigger = trigger ?? {}
  const t0 = Date.now()

  const settled = await Promise.allSettled([
    kgProvider.fetch(),
    memProvider.fetch(),
    tlProvider.fetch({ limit: 20 }),
    leProvider.fetch(),
    ciProvider.fetch(),
  ])

  // For each settled result: fulfilled → use value, rejected → use provider fallback
  const [kg, mem, tl, le, ci] = settled.map(
    (r, i) => (r.status === 'fulfilled' ? r.value : PROVIDERS[i].fallback)
  )

  return {
    // ── Platform context (passed in from the request trigger) ─────────────────
    platform: {
      fixture:        trigger.fixture        ?? null,
      digitalTwin:    trigger.digitalTwin    ?? null,
      attendanceData: trigger.attendanceData ?? null,
      seasonData:     trigger.seasonData     ?? null,
      clubScoreData:  trigger.clubScoreData  ?? null,
      weatherData:    trigger.weatherData    ?? null,
      fixtureList:    trigger.fixtureList    ?? null,
      resultHistory:  trigger.resultHistory  ?? null,
    },

    // ── Declarative knowledge (knowledge graph statistics) ────────────────────
    declarativeKnowledge: {
      stats:     kg.stats     ?? kgProvider.fallback.stats,
      available: kg.available ?? false,
    },

    // ── Episodic memory (player and team entities) ────────────────────────────
    episodicMemory: {
      players:     mem.players     ?? [],
      teams:       mem.teams       ?? [],
      playerCount: mem.playerCount ?? 0,
      teamCount:   mem.teamCount   ?? 0,
      available:   mem.available   ?? false,
    },

    // ── Working memory (recent intelligence timeline events) ──────────────────
    workingMemory: {
      recentEvents: tl.recentEvents ?? [],
      total:        tl.total        ?? 0,
      stats:        tl.stats        ?? {},
      available:    tl.available    ?? false,
    },

    // ── Procedural learning (CIS, calibration, accuracy) ─────────────────────
    proceduralLearning: {
      cis:         le.cis         ?? null,
      calibration: le.calibration ?? null,
      accuracy:    le.accuracy    ?? null,
      available:   le.available   ?? false,
    },

    // ── Club intelligence (health profile, insights) ──────────────────────────
    clubIntelligence: {
      health:    ci.health    ?? null,
      insights:  ci.insights  ?? [],
      available: ci.available ?? false,
    },

    // ── Assembly metadata ─────────────────────────────────────────────────────
    assembledAt:        new Date().toISOString(),
    assemblyDurationMs: Date.now() - t0,
    providers: {
      knowledgeGraph:   kg.available  ?? false,
      memoryEngine:     mem.available ?? false,
      timeline:         tl.available  ?? false,
      learningEngine:   le.available  ?? false,
      clubIntelligence: ci.available  ?? false,
    },
  }
}
