/**
 * AI Brain — Synthesis Stage
 *
 * Receives ReasoningResult objects from all three reasoners and produces
 * a single, de-duplicated, ranked ReasoningBundle. No reasoning occurs here:
 * synthesis only merges, deduplicates, and sorts.
 *
 * Deduplication key: category + normalised title prefix (numbers collapsed).
 * Conflict resolution: higher-confidence recommendation wins; evidence is merged.
 * Ranking: by internal _score (priority weight + confidence * 0.3), descending.
 */

// ── Dedup key ─────────────────────────────────────────────────────────────────

function dedupKey(rec) {
  const normalised = (rec.title ?? '').toLowerCase().replace(/\d+/g, 'N').slice(0, 50)
  return `${rec.category ?? ''}|${normalised}`
}

// ── Merge two recommendations that resolve to the same dedup key ─────────────

function mergeRecs(a, b) {
  const [winner, loser] = a.confidence >= b.confidence ? [a, b] : [b, a]
  const mergedEvidence   = [...(winner.evidence ?? []), ...(loser.evidence ?? [])]
  const loserExplain     = loser.explainability ?? ''
  const winnerExplain    = winner.explainability ?? ''
  const mergedExplain    = loserExplain && loserExplain !== winnerExplain
    ? `${winnerExplain} / ${loserExplain}`
    : winnerExplain
  return {
    ...winner,
    confidence:     winner.confidence,
    evidence:       mergedEvidence,
    explainability: mergedExplain,
    _score:         winner._score ?? 0,
  }
}

// ── Synthesise ────────────────────────────────────────────────────────────────

/**
 * Merge ReasoningResult[] into a single ReasoningBundle.
 *
 * @param {object[]} results - array of ReasoningResult from each reasoner
 * @returns {ReasoningBundle}
 */
export function synthesise(results) {
  const t0 = Date.now()

  const allRecs     = results.flatMap(r => r.recommendations ?? [])
  const allInsights = results.flatMap(r => r.insights ?? [])
  const allWarnings = results.flatMap(r => r.warnings  ?? [])
  const allEvidence = results.flatMap((r) =>
    (r.evidence ?? []).map(ev => ({ ...ev, reasoner: r.reasoner ?? 'unknown' }))
  )

  // ── Deduplicate and merge ─────────────────────────────────────────────────
  const byKey = new Map()
  for (const rec of allRecs) {
    const k = dedupKey(rec)
    byKey.set(k, byKey.has(k) ? mergeRecs(byKey.get(k), rec) : rec)
  }

  const merged = Array.from(byKey.values())
    .sort((a, b) => (b._score ?? 0) - (a._score ?? 0))

  // Strip internal _score from final output
  const recommendations = merged.map(({ _score, ...r }) => r)

  // ── Merge insights: group by key, keep highest confidence ────────────────
  const insightMap = new Map()
  for (const ins of allInsights) {
    const existing = insightMap.get(ins.key)
    if (!existing || ins.confidence > existing.confidence) {
      insightMap.set(ins.key, { ...ins })
    }
  }
  const insights = Array.from(insightMap.values())

  // ── Merge warnings: deduplicate by message ────────────────────────────────
  const warnSeen = new Set()
  const warnings = allWarnings.filter(w => {
    if (warnSeen.has(w.message)) return false
    warnSeen.add(w.message)
    return true
  })

  const synthesisDurationMs = Date.now() - t0

  return {
    recommendations,
    insights,
    warnings,
    evidence:   allEvidence,
    trace: {
      reasoners:           results.map(r => r.reasoner ?? 'unknown'),
      reasonerDurations:   Object.fromEntries(results.map(r => [r.reasoner ?? 'unknown', r.durationMs ?? 0])),
      synthesisDurationMs,
      totalDurationMs:     results.reduce((s, r) => s + (r.durationMs ?? 0), 0) + synthesisDurationMs,
      recommendationCount: { preMerge: allRecs.length, postMerge: recommendations.length },
    },
  }
}
