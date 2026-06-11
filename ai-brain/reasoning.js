/**
 * AI Brain — Parallel Reasoning Orchestrator
 *
 * Runs Coach, Squad, and Club reasoners in parallel over one immutable
 * ContextBundle, then calls the Synthesis stage to produce a ReasoningBundle.
 *
 * Guarantees:
 *  - All three reasoners receive the SAME bundle reference (immutable by contract).
 *  - Reasoners never communicate with one another.
 *  - A failed reasoner contributes a safe empty result — it never throws.
 *  - The returned ReasoningBundle always has the correct shape.
 *
 * M9: Each reasoner also receives an Observations array derived from the Memory
 * layer (M7/M8). Observation fetch failures are silently swallowed — observations
 * are enrichments, never blockers. When observations is [], reasoner behaviour
 * is identical to M4 (backward-compatible by design).
 */

import { reason as coachReason } from './reasoners/coach-reasoner.js'
import { reason as squadReason } from './reasoners/squad-reasoner.js'
import { reason as clubReason  } from './reasoners/club-reasoner.js'
import { synthesise             } from './synthesis.js'

// ── Safe reasoner wrapper ─────────────────────────────────────────────────────

function safeReason(name, reasonFn, bundle, observations) {
  try {
    const result = reasonFn(bundle, observations)
    return Promise.resolve({
      reasoner:        result?.reasoner        ?? name,
      recommendations: result?.recommendations ?? [],
      insights:        result?.insights        ?? [],
      warnings:        result?.warnings        ?? [],
      evidence:        result?.evidence        ?? [],
      durationMs:      result?.durationMs      ?? 0,
    })
  } catch (err) {
    return Promise.resolve({
      reasoner:        name,
      recommendations: [],
      insights:        [],
      warnings:        [{ message: `${name} reasoner failed: ${err.message}`, severity: 'high' }],
      evidence:        [],
      durationMs:      0,
    })
  }
}

// ── Observation fetch (M9) ────────────────────────────────────────────────────

async function fetchObservations(bundle) {
  try {
    const { observe, observeAll } = await import('./observation/observation-engine.js')
    const coachId = bundle?.platform?.coachId ?? null
    const clubId  = bundle?.platform?.clubId  ?? null

    const parts = []
    if (coachId) parts.push(...observe(coachId))
    if (clubId)  parts.push(...observe(clubId))

    // Include all player/team observations that exist in memory
    parts.push(...observeAll().filter(
      o => o.entity?.type === 'PLAYER' || o.entity?.type === 'TEAM'
    ))

    // Deduplicate by observation id
    const seen = new Set()
    const deduped = []
    for (const o of parts) {
      if (!seen.has(o.id)) { seen.add(o.id); deduped.push(o) }
    }
    return deduped
  } catch {
    return []   // observations must never block reasoning
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all three reasoners in parallel and synthesise their outputs.
 * M9: also fetches Memory observations and passes them to each reasoner.
 *
 * @param {ContextBundle} bundle - assembled by context-assembly, read-only
 * @returns {Promise<ReasoningBundle>}
 */
export async function reason(bundle) {
  const t0 = Date.now()

  // M9: Fetch observation facts from the Memory layer before parallel reasoning.
  // Non-blocking: if observations are unavailable the result is [].
  const observations = await fetchObservations(bundle)

  const [coachResult, squadResult, clubResult] = await Promise.all([
    safeReason('coach', coachReason, bundle, observations),
    safeReason('squad', squadReason, bundle, observations),
    safeReason('club',  clubReason,  bundle, observations),
  ])

  const rb = synthesise([coachResult, squadResult, clubResult])

  return {
    ...rb,
    trace: {
      ...rb.trace,
      totalDurationMs: Date.now() - t0,
    },
  }
}
