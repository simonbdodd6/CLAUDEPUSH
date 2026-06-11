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
 */

import { reason as coachReason } from './reasoners/coach-reasoner.js'
import { reason as squadReason } from './reasoners/squad-reasoner.js'
import { reason as clubReason  } from './reasoners/club-reasoner.js'
import { synthesise             } from './synthesis.js'

// Safe wrapper: any synchronous throw inside a reasoner is caught and converted
// to a typed empty result so Synthesis can still run.
function safeReason(name, reasonFn, bundle) {
  try {
    const result = reasonFn(bundle)
    // Enforce shape — reasoner must return { reasoner, recommendations, ... }
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

/**
 * Run all three reasoners in parallel and synthesise their outputs.
 *
 * @param {ContextBundle} bundle - assembled by context-assembly, read-only
 * @returns {Promise<ReasoningBundle>}
 */
export async function reason(bundle) {
  const t0 = Date.now()

  const [coachResult, squadResult, clubResult] = await Promise.all([
    safeReason('coach', coachReason, bundle),
    safeReason('squad', squadReason, bundle),
    safeReason('club',  clubReason,  bundle),
  ])

  const rb = synthesise([coachResult, squadResult, clubResult])

  // Overwrite totalDurationMs with wall-clock time (parallel, not sum)
  return {
    ...rb,
    trace: {
      ...rb.trace,
      totalDurationMs: Date.now() - t0,
    },
  }
}
